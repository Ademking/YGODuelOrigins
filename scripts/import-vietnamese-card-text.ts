// Vietnamese card names, text and card pictures: the community translations of Yu-Gi-Oh! Việt Nam (https://ygovietnam.com).
// Konami prints no Vietnamese cards. Writes assets/i18n/cards/vi.json in the same shape as scripts/import-card-text.ts
// ({ cards: { passcode: [name, text] } }) plus `images` ({ passcode: file }): the site's Vietnamese card picture
// (https://cdn.ygovietnam.com/storage/CardVietSub/<file>) for the passcode, tried as .jpg, then .webp, then .png.
// Effect-choice labels and engine prompts stay English, and so do the few cards the site lacks (Tokens and placeholders):
// they show their English name, text and picture.
//
// The site's card pages are addressed by English name (ygovietnam.com/card/<name>); the site uses today's names, so a
// card the game knows by an older name is looked up again by its current name on YGOProDeck. Four requests at a time with a pause
// between them, and a resumable cache, so the site is never hammered:
//   npm run import:card-text:vi   (Node needs NODE_USE_ENV_PROXY=1 behind a proxy)
// --report prints the cards with no Vietnamese text or picture.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { englishCards, supplement } from './card-text-supplement';

const SITE = 'https://ygovietnam.com/card/';
const CDN = 'https://cdn.ygovietnam.com/storage/CardVietSub/';
/** A Vietnamese picture smaller than this is the site's blank placeholder, not a card. */
const MIN_PICTURE_BYTES = 20_000;
const CONCURRENCY = 4;

const english = englishCards();
const wanted = [...english.keys()].filter((code) => /^\d+$/.test(code)).sort((a, b) => Number(a) - Number(b));

/** Page cache by English name: [vietnamese name, vietnamese text] or null when the site has no page or no Vietnamese text. */
interface Page { name: string; text: string; images: string[] }
const cachePath = resolve(tmpdir(), 'duel-origins-ygovietnam.json');
const cache: { pages: Record<string, Page | null>; pictures: Record<string, string | null>; renamed?: Record<string, true> } =
  existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : { pages: {}, pictures: {} };
cache.renamed ??= {};
const save = () => writeFileSync(cachePath, JSON.stringify(cache));

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (html: string) => html
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(\w+);/g, (all, name) => ENTITIES[name] ?? all)
  .replace(/\r\n?/g, '\n')
  .split('\n').map((line) => line.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
const sameName = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]/g, '') === b.toLowerCase().replace(/[^a-z0-9]/g, '');

async function get(url: string, method = 'GET'): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(30_000) });
      if (response.status >= 500 || response.status === 429) throw new Error(`HTTP ${response.status}`);
      return response;
    } catch (error) {
      if (attempt >= 4) throw error;
      await new Promise((done) => setTimeout(done, 5_000 * attempt));
    }
  }
}

/** passcode → today's English name (YGOProDeck), fetched once when an older name has no page on the site. */
let currentNames: Map<string, string> | undefined;
async function currentName(code: string): Promise<string | undefined> {
  if (!currentNames) {
    const response = await get('https://db.ygoprodeck.com/api/v7/cardinfo.php');
    const { data } = await response.json() as { data: { id: number; name: string; card_images?: { id: number }[] }[] };
    currentNames = new Map(data.flatMap((card) => [card.id, ...(card.card_images ?? []).map((image) => image.id)].map((id) => [String(id), card.name])));
  }
  return currentNames.get(code);
}

async function fetchPage(name: string): Promise<Page | null> {
  const response = await get(SITE + encodeURIComponent(name));
  if (response.status === 404) return null;
  const html = await response.text();
  const head = html.match(/<h1 class="h2" itemprop="title">([\s\S]*?)<\/h1>\s*<div class="h5"[^>]*>([\s\S]*?)<\/div>/);
  const text = html.match(/Hiệu ứng \(VN\):<\/h6>\s*<p[^>]*>([\s\S]*?)<\/p>/)?.[1];
  if (!head || !sameName(decode(head[1]), name)) return null;
  const images = [...new Set([...html.matchAll(/storage\/CardVietSub\/(\d+\.(?:jpg|webp|png))/g)].map((m) => m[1]))];
  return { name: decode(head[2]), text: text === undefined ? '' : decode(text), images };
}

/** The passcode's Vietnamese picture file on the CDN (jpg, else webp, else png), or null. */
async function findPicture(code: string, fromPage: string[]): Promise<string | null> {
  for (const file of [`${code}.jpg`, `${code}.webp`, `${code}.png`, ...fromPage]) {
    const response = await get(CDN + file, 'HEAD');
    if (response.ok && Number(response.headers.get('content-length') ?? MIN_PICTURE_BYTES) >= MIN_PICTURE_BYTES) return file;
  }
  return null;
}

if (!process.argv.includes('--report')) {
  let done = 0, next = 0;
  const worker = async () => {
    while (next < wanted.length) {
      const code = wanted[next++];
      const name = english.get(code)![0];
      if (!(name in cache.pages)) {
        cache.pages[name] = await fetchPage(name);
        await new Promise((wait) => setTimeout(wait, 300));
      }
      if (cache.pages[name] === null && !cache.renamed![name]) {
        const today = await currentName(code);
        if (today && today !== name) {
          cache.pages[name] = await fetchPage(today);
          await new Promise((wait) => setTimeout(wait, 300));
        }
        cache.renamed![name] = true;
      }
      if (!(code in cache.pictures)) cache.pictures[code] = await findPicture(code, cache.pages[name]?.images ?? []);
      if (++done % 100 === 0) { save(); console.log(`${done} of ${wanted.length}`); }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker)); // a few requests at a time, each followed by a pause
  save();
}

const cards: Record<string, [string, string]> = {};
const images: Record<string, string> = {};
const noPage: string[] = [], noText: string[] = [], noPicture: string[] = [];
for (const code of wanted) {
  const [name] = english.get(code)!;
  const page = cache.pages[name];
  if (page === undefined) continue; // not fetched yet
  if (!page) noPage.push(code);
  else if (!page.text) noText.push(code);
  if (page?.text) cards[code] = [page.name || name, page.text];
  if (cache.pictures[code]) images[code] = cache.pictures[code]!;
  else noPicture.push(code);
}
const list = (codes: string[]) => codes.map((code) => `  ${code}  ${english.get(code)![0]}`).join('\n');
console.log(`vi: ${Object.keys(cards).length} of ${wanted.length} cards and ${Object.keys(images).length} pictures from Yu-Gi-Oh! Việt Nam`);
if (process.argv.includes('--report')) {
  console.log(`\nNo page on the site (${noPage.length}):\n${list(noPage)}`);
  console.log(`\nPage without Vietnamese text (${noText.length}):\n${list(noText)}`);
  console.log(`\nNo Vietnamese picture (${noPicture.length}):\n${list(noPicture)}`);
}
const data: { cards: Record<string, [string, string]>; olderText?: Record<string, string>; images?: Record<string, string> } = { cards };
// a card printed under several passcodes takes its sibling's text, and the cards played by older text get our translation
// of it (scripts/card-text-supplement.json); the cards the site lacks stay in English
const missing = supplement('vi', data, english);
if (missing.length) console.log(`vi: in English (not on the site): ${missing.join(' ')}`);
data.images = images;
mkdirSync('assets/i18n/cards', { recursive: true });
writeFileSync('assets/i18n/cards/vi.json', JSON.stringify(data));
