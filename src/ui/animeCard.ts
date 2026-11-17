// "Anime" card style: the frameless artwork (ygoprodeck cards_cropped) set into the anime card frames from the
// ygopro.org card maker (assets/cards/anime), with its level stars and attribute icons, and ATK / DEF in the Yu-Gi-Oh!
// Matrix font. One canvas painter serves the duel (Phaser textures) and the menus (cached image URLs).
import type { CardDef } from '../engine/types';
import { cardImagePasscode } from '../data/cardImages';
import { cardStat } from './cardStat';

const KEY = 'arcana-duel.card-style';
export const animeCards = () => { try { return localStorage.getItem(KEY) === 'anime'; } catch { return false; } };
export const setAnimeCards = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'anime' : 'official'); } catch { /* storage unavailable */ } };

export const CARD_BASE: string = import.meta.env?.VITE_CARD_IMAGE_BASE ?? 'https://wsrv.nl/?url=images.ygoprodeck.com/images/cards/';
// ponytail: derived from the card image base; a custom VITE_CARD_IMAGE_BASE must also serve /cards_cropped/.
export const CROPPED_BASE = CARD_BASE.replace('/cards/', '/cards_cropped/');

const FRAMES = ['Normal', 'Effect', 'Fusion', 'Ritual', 'Spell', 'Trap'] as const;
const ATTRIBUTES = ['Dark', 'Divine', 'Earth', 'Fire', 'Light', 'Water', 'Wind', 'Spell', 'Trap'] as const;
/** The Egyptian Gods use whole anime card pictures (assets/cards/anime/gods), not a drawn frame. */
const GODS = ['10000000', '10000010', '10000020'];
const STAT_FONT = '"YGO Matrix", "Palatino Linotype", serif';

const images = new Map<string, HTMLImageElement>();
let ready: Promise<void> | undefined;

/** Load the frames, icons and the stat font once; painting waits for this. */
export function animeAssets() {
  ready ??= (async () => {
    const image = (path: string, type = 'png') => new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => { images.set(path, img); resolve(); };
      img.onerror = () => resolve();
      img.src = `/cards/anime/${path}.${type}`;
    });
    const font = new FontFace('YGO Matrix', 'url(/fonts/matrix-book.ttf)');
    await Promise.all([
      ...FRAMES.map((name) => image(`frame/${name}`)),
      ...ATTRIBUTES.map((name) => image(`attribute/${name}`)),
      image('star'),
      ...GODS.map((code) => image(`gods/${code}`, 'webp')),
      // FontFaceSet.add is missing from this TypeScript lib
      font.load().then((face) => { (document.fonts as unknown as Set<FontFace>).add(face); }, () => undefined),
    ]);
  })();
  return ready;
}

function frameOf(def: CardDef): typeof FRAMES[number] {
  if (def.kind === 'spell') return 'Spell';
  if (def.kind === 'trap') return 'Trap';
  return def.mtype === 'fusion' ? 'Fusion' : def.mtype === 'ritual' ? 'Ritual' : def.mtype === 'normal' ? 'Normal' : 'Effect';
}

/** One stat, centred in its box, shrunk to fit. */
function stat(ctx: CanvasRenderingContext2D, text: string, x: number, width: number) {
  let px = 46;
  do ctx.font = `600 ${px}px ${STAT_FONT}`; while (ctx.measureText(text).width > width - 10 && --px > 12);
  ctx.fillText(text, x + width / 2, 559);
}

/**
 * Paint `def` as an anime card filling a w×h canvas. Positions are the card maker's, on its 421×614 card.
 * Call after animeAssets() has resolved; anything missing is simply left out.
 */
export function paintAnimeCard(ctx: CanvasRenderingContext2D, w: number, h: number, def: CardDef, art: CanvasImageSource & { width: number; height: number } | null) {
  ctx.save();
  ctx.scale(w / 421, h / 614);
  const god = images.get(`gods/${cardImagePasscode(def.id)}`);
  if (god) { ctx.drawImage(god, 0, 0, 421, 614); ctx.restore(); return; }
  // the picture sits under the frame's open window (12, 12, 397 × 437)
  // an <img>'s width is its size on screen; the picture's own size is naturalWidth
  const iw = art instanceof HTMLImageElement ? art.naturalWidth : art?.width ?? 0;
  const ih = art instanceof HTMLImageElement ? art.naturalHeight : art?.height ?? 0;
  if (art && iw && ih) {
    const aw = 397, ah = 437, scale = Math.max(aw / iw, ah / ih), sw = aw / scale, sh = ah / scale;
    ctx.drawImage(art, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 12, 12, aw, ah);
  }
  const frame = images.get(`frame/${frameOf(def)}`);
  if (frame) ctx.drawImage(frame, 0, 0, 421, 614);

  if (def.kind === 'monster') {
    // stars run right to left from just before the attribute
    const star = images.get('star'), level = Math.min(12, def.lv ?? 0);
    const size = 28, gap = level > 10 ? 1 : 2, right = 36 + 284;
    if (star) for (let i = 0; i < level; i++) ctx.drawImage(star, right - (i + 1) * size - i * gap, 483, size, size);
    const attribute = images.get(`attribute/${def.attr ? def.attr[0] + def.attr.slice(1).toLowerCase() : ''}`);
    if (attribute) ctx.drawImage(attribute, 344, 477, 40, 40);
    const value = (n?: number) => (def.variableStats ? '?' : cardStat(n));
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    stat(ctx, value(def.atk), 53, 124);
    stat(ctx, value(def.def), 244, 124);
  } else {
    const icon = images.get(`attribute/${def.kind === 'spell' ? 'Spell' : 'Trap'}`);
    if (icon) ctx.drawImage(icon, 190, 517, 40, 40);
  }
  ctx.restore();
}
