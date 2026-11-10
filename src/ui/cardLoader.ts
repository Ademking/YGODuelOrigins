import Phaser from 'phaser';
import { cardImagePasscode } from '../data/cardImages';
import { BACK, CH, CW, cardKey } from './cardArt';

// Card faces are fetched only when a screen shows them. Newest requests go first (LIFO), so paging through the
// deck editor loads the page you are looking at before the ones you skipped past.
const BASE: string = import.meta.env.VITE_CARD_IMAGE_BASE ?? 'https://wsrv.nl/?url=images.ygoprodeck.com/images/cards/';
const PARALLEL = 6;
const inflight = new Map<string, Promise<void>>();
const waiting: (() => void)[] = [];
let running = 0;

function next() {
  while (running < PARALLEL && waiting.length) { running++; waiting.pop()!(); }
}

/** Load one card's art into the texture manager (resampled to CW×CH). Resolves even if the image fails. */
export function loadCard(textures: Phaser.Textures.TextureManager, id: string): Promise<void> {
  const key = cardKey(id);
  if (textures.exists(key)) return Promise.resolve();
  const pass = cardImagePasscode(id);
  if (!pass) return Promise.resolve();
  let p = inflight.get(key);
  if (!p) {
    p = new Promise<void>((resolve) => {
      waiting.push(() => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const done = () => { running--; inflight.delete(key); resolve(); next(); };
        img.onload = () => {
          if (!textures.exists(key)) {
            const canvas = document.createElement('canvas');
            canvas.width = CW;
            canvas.height = CH;
            const ctx = canvas.getContext('2d')!;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, CW, CH);
            textures.addCanvas(key, canvas);
          }
          done();
        };
        img.onerror = done;
        img.src = `${BASE}${pass}.jpg`;
      });
      next();
    });
    inflight.set(key, p);
  }
  return p;
}

/** Load several cards; `onProgress(done, total)` after each one. */
export async function loadCards(textures: Phaser.Textures.TextureManager, ids: Iterable<string>, onProgress?: (done: number, total: number) => void) {
  const unique = [...new Set(ids)];
  let n = 0;
  await Promise.all(unique.map((id) => loadCard(textures, id).then(() => onProgress?.(++n, unique.length))));
}

/** Show `id` on `img` now (card back while loading) and swap in the art once it arrives. */
export function setCardTexture(img: Phaser.GameObjects.Image, id: string) {
  const textures = img.scene.textures;
  img.setData('cardId', id);
  if (textures.exists(cardKey(id))) { img.setTexture(cardKey(id)); return img; }
  img.setTexture(BACK);
  void loadCard(textures, id).then(() => {
    if (img.active && img.getData('cardId') === id && textures.exists(cardKey(id))) img.setTexture(cardKey(id));
  });
  return img;
}
