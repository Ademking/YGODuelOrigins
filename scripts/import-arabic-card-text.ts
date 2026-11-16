// Arabic card names and text: the community translations of Arab Duelists (https://arab-duelists.com), credited to
// their translators there. Konami prints no Arabic cards. Writes assets/i18n/cards/ar.json in the same shape as
// scripts/import-card-text.ts ({ cards: { passcode: [name, text] } }); effect-choice labels and engine prompts stay English.
//
// One request at a time with a pause between them, and a resumable cache, so the site is never hammered:
//   npm run import:card-text:ar   (Node needs NODE_USE_ENV_PROXY=1 behind a proxy)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { CARDS } from '../src/ocgcore/catalog';
import { cardImagePasscode } from '../src/data/cardImages';

const bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/duel.json.gz')).toString('utf8')) as { cards: { id: string }[] };
const wanted = [...new Set([...bundle.cards.map((card) => Number(card.id)), ...CARDS.flatMap((card) => {
  try { return [Number(cardImagePasscode(card.id))]; } catch { return []; }
})])].sort((a, b) => a - b);

/** passcode → [name, text], or null when the site has no page for it. */
const cachePath = resolve(tmpdir(), 'duel-origins-arab-duelists.json');
const cache: Record<string, [string, string] | null> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (html: string) => html
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (all, name) => ENTITIES[name] ?? all)
  .split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

async function fetchCard(code: number): Promise<[string, string] | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`https://arab-duelists.com/?p=card&id=${code}`, { signal: AbortSignal.timeout(30_000) });
      const html = await response.text();
      const name = html.match(/<h1 style="[^"]*primary-color[^"]*">([\s\S]*?)<\/h1>/)?.[1];
      const text = html.match(/الوصف \/ التأثير:<\/b>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1];
      if (!name || text === undefined) return null; // the site's 404 page
      return [decode(name), decode(text)];
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((done) => setTimeout(done, 5_000 * attempt));
    }
  }
}

let fetched = 0;
for (const code of wanted) {
  if (code in cache) continue;
  cache[code] = await fetchCard(code);
  if (++fetched % 50 === 0) {
    writeFileSync(cachePath, JSON.stringify(cache));
    console.log(`${Object.keys(cache).length} of ${wanted.length}`);
  }
  await new Promise((done) => setTimeout(done, 400));
}
writeFileSync(cachePath, JSON.stringify(cache));

const cards = Object.fromEntries(wanted.flatMap((code) => {
  const entry = cache[code];
  return entry && entry[0] && entry[1] ? [[String(code), entry]] : [];
}));
mkdirSync('assets/i18n/cards', { recursive: true });
writeFileSync('assets/i18n/cards/ar.json', JSON.stringify({ cards }));
console.log(`ar: ${Object.keys(cards).length} of ${wanted.length} cards from Arab Duelists`);
