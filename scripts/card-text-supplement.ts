// Fills the few cards no source translates, so every card shows in the interface language:
//   1. a card printed under several passcodes (Tokens, alternate artworks) takes the translation of a sibling with the
//      same English name and text;
//   2. anything still missing comes from scripts/card-text-supplement.json `cards` ({ lang: { passcode or card id: [name, text] } }),
//      our own translations, written in each source's established terms;
//   3. `olderText` ({ lang: { passcode: text } }): our translation of the older English text the game plays some cards by
//      (src/ocgcore/overrides.ts), shown instead of the current official text.
// The importers (import-card-text.ts, import-arabic-card-text.ts, import-vietnamese-card-text.ts) run this last. On its own: npm run card-text:supplement
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { CARDS } from '../src/ocgcore/catalog';
import { cardImagePasscode } from '../src/data/cardImages';

type Entry = [string, string];
const SUPPLEMENT = resolve('scripts/card-text-supplement.json');
const FILES = ['fr', 'de', 'it', 'pt', 'es', 'ar', 'vi'];

/** Every card the game can show, by the key src/i18n/cards.ts looks it up with, and its English [name, text]. */
export function englishCards(): Map<string, Entry> {
  const bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/duel.json.gz')).toString('utf8')) as { cards: { id: string; name: string; desc: string }[] };
  const english = new Map<string, Entry>();
  for (const card of bundle.cards) english.set(String(Number(card.id)), [card.name, card.desc ?? '']);
  for (const card of CARDS) {
    let code: string | null = null;
    try { code = cardImagePasscode(card.id); } catch { /* no artwork */ }
    english.set(code ?? card.id, [card.name, card.text]);
  }
  return english;
}

/** Complete one language file's cards in place; returns the keys still untranslated. */
export function supplement(file: string, data: { cards: Record<string, Entry>; olderText?: Record<string, string> }, english = englishCards()): string[] {
  const all = JSON.parse(readFileSync(SUPPLEMENT, 'utf8')) as { cards: Record<string, Record<string, Entry>>; olderText: Record<string, Record<string, string>> };
  const ours = all.cards[file] ?? {};
  const cards = data.cards;
  if (all.olderText[file]) data.olderText = all.olderText[file];
  for (const [code, entry] of Object.entries(ours)) if (!cards[code] && english.has(code)) cards[code] = entry;
  const byEnglish = new Map<string, Entry>();
  for (const [code, entry] of english) if (cards[code]) byEnglish.set(entry.join('\u0000'), cards[code]);
  const missing: string[] = [];
  for (const [code, entry] of english) {
    if (cards[code]) continue;
    const found = byEnglish.get(entry.join('\u0000'));
    if (found) cards[code] = found;
    else missing.push(code);
  }
  return missing;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const english = englishCards();
  for (const file of FILES) {
    const path = resolve('assets/i18n/cards', `${file}.json`);
    const data = JSON.parse(readFileSync(path, 'utf8'));
    const missing = supplement(file, data, english);
    data.cards = Object.fromEntries(Object.entries(data.cards).sort(([a], [b]) => Number(a) - Number(b) || a.localeCompare(b)));
    writeFileSync(path, JSON.stringify(data));
    console.log(`${file}: ${Object.keys(data.cards).length} cards${missing.length ? `, still missing ${missing.join(' ')}` : ', none missing'}`);
  }
}
