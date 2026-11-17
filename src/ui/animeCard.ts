// "Anime" card style: the frameless artwork (ygoprodeck cards_cropped) inside a frame we draw ourselves, the way cards
// look on screen in the show: the name on top, level stars, a big picture and ATK / DEF underneath. One canvas
// painter serves the duel (Phaser textures) and the menus (cached image URLs).
import type { CardDef } from '../engine/types';
import { t } from '../i18n';
import { cardName } from '../i18n/cards';
import { typeLine } from '../ocgcore/catalog';
import { cardStat } from './cardStat';

const KEY = 'arcana-duel.card-style';
export const animeCards = () => { try { return localStorage.getItem(KEY) === 'anime'; } catch { return false; } };
export const setAnimeCards = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'anime' : 'official'); } catch { /* storage unavailable */ } };

export const CARD_BASE: string = import.meta.env?.VITE_CARD_IMAGE_BASE ?? 'https://wsrv.nl/?url=images.ygoprodeck.com/images/cards/';
// ponytail: derived from the card image base; a custom VITE_CARD_IMAGE_BASE must also serve /cards_cropped/.
export const CROPPED_BASE = CARD_BASE.replace('/cards/', '/cards_cropped/');

/** Frame colours (top, bottom) by card type, after the real card frames. */
function frame(def: CardDef): [string, string] {
  if (def.kind === 'spell') return ['#2fb79c', '#0f5e52'];
  if (def.kind === 'trap') return ['#c2508f', '#62173f'];
  if (def.mtype === 'fusion') return ['#9a63c9', '#47236b'];
  if (def.mtype === 'ritual') return ['#5d8fdc', '#203f78'];
  if (def.mtype === 'normal') return ['#e0bf62', '#8a6a22'];
  return ['#e08a46', '#7c3b14'];
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight = '700') {
  let px = size;
  do ctx.font = `${weight} ${px}px Tektur, Cairo, Arial, sans-serif`; while (ctx.measureText(text).width > max && --px > 8);
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, d = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffb02e';
  ctx.fill();
  ctx.strokeStyle = '#7a2a00';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

/** Paint `def` as an anime-style card filling a w×h canvas (laid out for 300×438), with `art` as its picture. */
export function paintAnimeCard(ctx: CanvasRenderingContext2D, w: number, h: number, def: CardDef, art: CanvasImageSource & { width: number; height: number } | null) {
  ctx.save();
  ctx.scale(w / 300, h / 438);
  const [top, bottom] = frame(def);
  const body = ctx.createLinearGradient(0, 0, 300, 438);
  body.addColorStop(0, top);
  body.addColorStop(1, bottom);
  ctx.fillStyle = '#120d08';
  ctx.beginPath(); ctx.roundRect(0, 0, 300, 438, 14); ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.roundRect(4, 4, 292, 430, 11); ctx.fill();
  // a soft sheen across the frame
  const sheen = ctx.createLinearGradient(0, 0, 300, 0);
  sheen.addColorStop(0, '#ffffff00'); sheen.addColorStop(0.5, '#ffffff22'); sheen.addColorStop(1, '#ffffff00');
  ctx.fillStyle = sheen; ctx.fillRect(4, 4, 292, 430);

  // name plate
  ctx.fillStyle = '#0c0a14d9';
  ctx.beginPath(); ctx.roundRect(14, 14, 272, 38, 6); ctx.fill();
  ctx.fillStyle = '#fff6e0';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const name = cardName(def);
  fitText(ctx, name, 254, 20);
  ctx.fillText(name, 150, 34);

  // level stars, or the spell / trap kind
  if (def.kind === 'monster') {
    const n = Math.min(12, def.lv ?? 0), r = 9, gap = 21;
    for (let i = 0; i < n; i++) star(ctx, 274 - i * gap, 66, r);
  } else {
    ctx.fillStyle = '#fff6e0';
    fitText(ctx, typeLine(def), 260, 15);
    ctx.textAlign = 'right';
    ctx.fillText(typeLine(def), 284, 66);
  }

  // the picture: square, cover-cropped, in a thin gold rim
  const ax = 16, ay = 80, as = 268;
  ctx.fillStyle = '#0c0a14';
  ctx.fillRect(ax - 3, ay - 3, as + 6, as + 6);
  // an <img>'s width is its size on screen; the picture's own size is naturalWidth
  const aw = art instanceof HTMLImageElement ? art.naturalWidth : art?.width ?? 0;
  const ah = art instanceof HTMLImageElement ? art.naturalHeight : art?.height ?? 0;
  if (art && aw && ah) {
    const side = Math.min(aw, ah);
    ctx.drawImage(art, (aw - side) / 2, (ah - side) / 2, side, side, ax, ay, as, as);
  }
  ctx.strokeStyle = '#e9c66f';
  ctx.lineWidth = 2;
  ctx.strokeRect(ax - 1, ay - 1, as + 2, as + 2);

  // ATK / DEF bar, or the card kind for spells and traps
  ctx.fillStyle = '#0c0a14d9';
  ctx.beginPath(); ctx.roundRect(14, 360, 272, 62, 6); ctx.fill();
  ctx.textAlign = 'center';
  if (def.kind === 'monster') {
    ctx.fillStyle = '#d9cfb8';
    fitText(ctx, typeLine(def), 256, 13, '600');
    ctx.fillText(typeLine(def), 150, 376);
    ctx.fillStyle = '#fff6e0';
    const stats = `ATK/${cardStat(def.atk)}   DEF/${cardStat(def.def)}`;
    fitText(ctx, stats, 256, 22);
    ctx.fillText(stats, 150, 402);
  } else {
    ctx.fillStyle = '#fff6e0';
    const kind = t(def.kind === 'spell' ? 'Spell Card' : 'Trap Card');
    fitText(ctx, kind, 256, 26);
    ctx.fillText(kind, 150, 392);
  }
  ctx.restore();
}
