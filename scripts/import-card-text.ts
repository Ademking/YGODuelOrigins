// Official card names and text in other languages: Konami's printed translations, never our own.
// Writes assets/i18n/cards/<lang>.json for every card the game can put in a duel (the passcodes in
// assets/ocgcore/duel.json.gz plus each catalog card's artwork passcode):
//   { cards: { passcode: [name, text] }, strings: { passcode: { index: label } }, system: { id: label } }
// `strings` are a card's effect-choice labels (OCGCore str1–str16) and `system` the engine's own prompts.
//
// Sources, in order of preference:
//   1. YGOProDeck (fr, de, it, pt): names and text as first printed, which suits the game's 2004 era.
//   2. mycard/ygopro-database (es, fr, de, it, pt): fills cards YGOProDeck lacks, all of Spanish (YGOProDeck has none),
//      and the effect-choice labels and engine prompts. Pinned to one commit so the output is reproducible.
// Konami prints no Russian, Arabic or Indonesian cards. Arabic uses community text (scripts/import-arabic-card-text.ts).
//
// Cards neither source has are filled from scripts/card-text-supplement.json (our own translations).
//
// Run after changing the card catalog: npm run import:card-text (Node needs NODE_USE_ENV_PROXY=1 behind a proxy).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CARDS } from '../src/ocgcore/catalog';
import { cardImagePasscode } from '../src/data/cardImages';
import { supplement } from './card-text-supplement';

const MYCARD_REPO = 'https://github.com/mycard/ygopro-database.git';
const MYCARD_REVISION = '83f27ca6e9b85cf026c77e9561589d89b6e9da85';
/** Output file → [YGOProDeck language or null, mycard locale folder]. Portuguese prints are the Brazilian TCG text. */
const LANGUAGES: Record<string, [string | null, string]> = {
  fr: ['fr', 'fr-FR'], de: ['de', 'de-DE'], it: ['it', 'it-IT'], pt: ['pt', 'pt-PT'], es: [null, 'es-ES'],
};

const out = resolve('assets/i18n/cards');
const bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/duel.json.gz')).toString('utf8')) as { cards: { id: string }[] };
const wanted = new Set([...bundle.cards.map((card) => Number(card.id)), ...CARDS.flatMap((card) => {
  try { return [Number(cardImagePasscode(card.id))]; } catch { return []; }
})]);

const { DatabaseSync } = await import('node:sqlite');
const workspace = mkdtempSync(resolve(tmpdir(), 'duel-origins-card-text-'));
const git = (...args: string[]) => execFileSync('git', ['-C', workspace, ...args], { stdio: 'pipe' });
git('init', '-q');
git('remote', 'add', 'origin', MYCARD_REPO);
git('fetch', '-q', '--depth=1', '--filter=blob:none', 'origin', MYCARD_REVISION);
git('checkout', '-q', 'FETCH_HEAD', '--', ...Object.values(LANGUAGES).map(([, folder]) => `locales/${folder}`));

interface ApiCard { id: number; name: string; desc: string; card_images?: { id: number }[] }
const clean = (text: string) => text.replace(/\r\n/g, '\n').trim();

try {
  mkdirSync(out, { recursive: true });
  for (const [file, [ygoprodeck, folder]] of Object.entries(LANGUAGES)) {
    const cards: Record<string, [string, string]> = {};
    const strings: Record<string, Record<number, string>> = {};
    // 1. YGOProDeck
    if (ygoprodeck) {
      const response = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?language=${ygoprodeck}`, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`YGOProDeck ${ygoprodeck}: HTTP ${response.status}`);
      for (const card of ((await response.json()) as { data: ApiCard[] }).data) {
        for (const code of [card.id, ...(card.card_images ?? []).map((image) => image.id)]) {
          if (wanted.has(code) && card.name && card.desc) cards[code] = [card.name.trim(), clean(card.desc)];
        }
      }
    }
    const fromYgoprodeck = Object.keys(cards).length;
    // 2. mycard: missing cards, and every card's effect-choice labels
    const db = new DatabaseSync(resolve(workspace, 'locales', folder, 'cards.cdb'), { readOnly: true });
    for (const row of db.prepare('SELECT * FROM texts').all() as Record<string, string | number | null>[]) {
      const code = Number(row.id);
      if (!wanted.has(code)) continue;
      if (!cards[code] && row.name && row.desc) cards[code] = [String(row.name).trim(), clean(String(row.desc))];
      for (let i = 1; i <= 16; i++) {
        const label = row[`str${i}`];
        if (typeof label === 'string' && label.trim()) (strings[code] ??= {})[i - 1] = label.trim();
      }
    }
    db.close();
    const system = Object.fromEntries([...readFileSync(resolve(workspace, 'locales', folder, 'strings.conf'), 'utf8')
      .matchAll(/^!system (\d+) (.+)$/gm)].map(([, id, label]) => [id, label.trim()]));
    const sorted = <T>(record: Record<string, T>) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => Number(a) - Number(b)));
    const data = { cards, strings: sorted(strings), system: sorted(system) };
    const missing = supplement(file, data); // cards no source has: our own translations (scripts/card-text-supplement.json)
    if (missing.length) console.warn(`${file}: untranslated ${missing.join(' ')}; add them to scripts/card-text-supplement.json`);
    writeFileSync(resolve(out, `${file}.json`), JSON.stringify({ ...data, cards: sorted(data.cards) }));
    console.log(`${file}: ${Object.keys(cards).length} of ${wanted.size} cards (${fromYgoprodeck} from YGOProDeck), ${Object.keys(strings).length} with effect labels, ${Object.keys(system).length} engine prompts`);
    await new Promise((done) => setTimeout(done, 500)); // stay well under YGOProDeck's rate limit
  }
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
