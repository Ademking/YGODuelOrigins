// Official card names and text in other languages, from the YGOProDeck API (Konami's printed translations).
// Writes assets/i18n/cards/<lang>.json as { passcode: [name, text] } for every card the game can put in a duel
// (the passcodes in assets/ocgcore/duel.json.gz). Run after changing the card catalog: npm run import:card-text
//
// Konami prints cards in French, German, Italian, Portuguese and Spanish (YGOProDeck has no Spanish yet); Russian, Arabic and Indonesian have no
// official card text, so those languages keep the English cards.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CARDS } from '../src/ocgcore/catalog';
import { cardImagePasscode } from '../src/data/cardImages';

// YGOProDeck serves these four (its API has no Spanish text yet)
const LANGUAGES = ['fr', 'de', 'it', 'pt'];
const out = resolve('assets/i18n/cards');
const bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/duel.json.gz')).toString('utf8')) as { cards: { id: string }[] };
// engine passcodes, plus the passcode each catalog card is shown under (sometimes an alternate artwork)
const wanted = new Set([...bundle.cards.map((card) => Number(card.id)), ...CARDS.flatMap((card) => {
  try { return [Number(cardImagePasscode(card.id))]; } catch { return []; }
})]);

interface ApiCard { id: number; name: string; desc: string; card_images?: { id: number }[] }

mkdirSync(out, { recursive: true });
for (const language of LANGUAGES) {
  const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?language=${language}`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`YGOProDeck ${language}: HTTP ${response.status}`);
  const { data } = await response.json() as { data: ApiCard[] };
  const texts: Record<string, [string, string]> = {};
  for (const card of data) {
    // alternate artworks share the card's text under their own passcodes
    for (const code of [card.id, ...(card.card_images ?? []).map((image) => image.id)]) {
      if (wanted.has(code) && card.name && card.desc) texts[code] = [card.name.trim(), card.desc.replace(/\r\n/g, '\n').trim()];
    }
  }
  const sorted = Object.fromEntries(Object.entries(texts).sort(([a], [b]) => Number(a) - Number(b)));
  writeFileSync(resolve(out, `${language}.json`), JSON.stringify(sorted));
  console.log(`${language}: ${Object.keys(sorted).length} of ${wanted.size} cards`);
  await new Promise((done) => setTimeout(done, 500)); // stay well under the API's rate limit
}
