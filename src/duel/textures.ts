// Textures for the Pixi duel: the few images the board needs up front, and card faces fetched on demand.
// Card faces are resampled once to CW x CH on a canvas (the anime style paints its frame there too), then kept for the
// session, so a card shown in the hand, on the field and in a prompt uploads to the GPU once.
import { Rectangle, Texture } from 'pixi.js';
import { cardImagePasscode } from '../data/cardImages';
import { BACK, CH, CW, cardKey } from '../ui/cardArt';
import { animeAssets, animeCards, CARD_BASE, CROPPED_BASE, cardBackUrl, paintAnimeCard } from '../ui/animeCard';
import { getCard } from '../ocgcore/catalog';
import { translatedPicture } from '../i18n/cards';

const cache = new Map<string, Texture>();

function imageOf(url: string, cors = true): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const timeout = setTimeout(() => { img.onload = img.onerror = null; resolve(null); }, 12000);
    img.onload = () => { clearTimeout(timeout); resolve(img); };
    img.onerror = () => { clearTimeout(timeout); resolve(null); };
    img.src = url;
  });
}

function canvasTexture(canvas: HTMLCanvasElement) {
  const texture = Texture.from(canvas);
  texture.source.scaleMode = 'linear';
  texture.source.autoGenerateMipmaps = true;
  return texture;
}

/** A picture resampled to the card size. */
function cardCanvas(paint: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  paint(ctx);
  return canvas;
}

export const tex = (key: string) => cache.get(key) ?? cache.get(BACK) ?? Texture.WHITE;
export const hasTex = (key: string) => cache.has(key);

const STATIC: [string, string][] = [
  ['zone_field', '/zone-icons/field.png'],
  ['zone_extra', '/zone-icons/extra.png'],
  ['equip_badge', '/zone-icons/equip.png'],
  ['coin_symbol', '/ui/coin-symbol.png'],
  ['dice_sheet', '/ui/dice.png'],
  ['exodia_victory', '/ui/exodia-victory.png'],
  ['god_slifer', '/gods/slifer.webp'],
  ['god_obelisk', '/gods/obelisk.webp'],
  ['god_ra', '/gods/ra.webp'],
];

/** The card back and board images. Resolves with false only when the card back itself is missing. */
export async function loadBoardTextures(onProgress?: (fraction: number) => void): Promise<boolean> {
  let done = 0;
  const total = STATIC.length + 1;
  const tick = () => onProgress?.(++done / total);
  const back = imageOf(cardBackUrl()).then((img) => {
    tick();
    if (!img) return false;
    cache.set(BACK, canvasTexture(cardCanvas((ctx) => ctx.drawImage(img, 0, 0, CW, CH))));
    return true;
  });
  await Promise.all(STATIC.map(async ([key, url]) => {
    if (cache.has(key)) { tick(); return; }
    const img = await imageOf(url);
    tick();
    if (img) {
      const texture = Texture.from(img);
      texture.source.scaleMode = 'linear';
      cache.set(key, texture);
    }
  }));
  const sheet = cache.get('dice_sheet');
  if (sheet) for (let value = 1; value <= 6; value++) {
    cache.set(`dice_${value}`, new Texture({ source: sheet.source, frame: new Rectangle(value <= 3 ? 140 : 210, ((value - 1) % 3) * 70, 70, 70) }));
  }
  return back;
}

// ---------------------------------------------------------------- card faces
const PARALLEL = 6;
const inflight = new Map<string, Promise<void>>();
const waiting: (() => void)[] = [];
let running = 0;
function next() { while (running < PARALLEL && waiting.length) { running++; waiting.pop()!(); } }

/** Fetch one card's face. Resolves even when the picture fails (the card back stays). */
export function loadCardFace(id: string): Promise<void> {
  const key = cardKey(id);
  if (cache.has(key)) return Promise.resolve();
  const pass = cardImagePasscode(id);
  if (!pass) return Promise.resolve();
  let pending = inflight.get(key);
  if (pending) return pending;
  pending = new Promise<void>((resolve) => {
    waiting.push(async () => {
      const anime = animeCards();
      const english = `${anime ? CROPPED_BASE : CARD_BASE}${pass}.jpg`;
      const translated = anime ? undefined : translatedPicture(pass);
      try {
        let img = await imageOf(translated ?? english);
        if (!img && translated) img = await imageOf(english);
        if (img && !cache.has(key)) {
          if (anime) await animeAssets();
          cache.set(key, canvasTexture(cardCanvas((ctx) => {
            if (anime) paintAnimeCard(ctx, CW, CH, getCard(id), img);
            else ctx.drawImage(img, 0, 0, CW, CH);
          })));
        }
      } catch (error) {
        console.warn('Could not prepare card artwork', id, error);
      } finally {
        running--;
        inflight.delete(key);
        resolve();
        listeners.forEach((listener) => listener(id));
        next();
      }
    });
    next();
  });
  inflight.set(key, pending);
  return pending;
}

const listeners = new Set<(id: string) => void>();
/** Hear when a card face finishes loading (to swap it in on sprites showing the back). */
export function onCardFace(listener: (id: string) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadCardFaces(ids: Iterable<string>) {
  return Promise.all([...new Set(ids)].map((id) => loadCardFace(id)));
}

/** The face texture if loaded (else the back, and the face is requested). */
export function faceTex(id: string): Texture {
  const key = cardKey(id);
  const hit = cache.get(key);
  if (hit) return hit;
  void loadCardFace(id);
  return tex(BACK);
}
export const backTex = () => tex(BACK);
export const faceReady = (id: string) => cache.has(cardKey(id));

// ---------------------------------------------------------------- remote pictures (holograms, field art)
const remote = new Map<string, Promise<Texture | null>>();
export function remoteTexture(key: string, url: string, prepare?: (img: HTMLImageElement) => HTMLCanvasElement): Promise<Texture | null> {
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);
  let pending = remote.get(key);
  if (!pending) {
    pending = imageOf(url).then((img) => {
      if (!img) return null;
      const texture = prepare ? canvasTexture(prepare(img)) : Texture.from(img);
      cache.set(key, texture);
      return texture;
    });
    remote.set(key, pending);
  }
  return pending;
}
