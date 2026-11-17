// "Anime" card style: the frameless artwork (ygoprodeck cards_cropped) inside a frame we draw ourselves, the way cards
// look on screen in the show: a big picture, then a coloured panel with level balls, the attribute and ATK / DEF boxes. One canvas
// painter serves the duel (Phaser textures) and the menus (cached image URLs).
import type { CardDef } from '../engine/types';
import { cardStat } from './cardStat';

const KEY = 'arcana-duel.card-style';
export const animeCards = () => { try { return localStorage.getItem(KEY) === 'anime'; } catch { return false; } };
export const setAnimeCards = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'anime' : 'official'); } catch { /* storage unavailable */ } };

export const CARD_BASE: string = import.meta.env?.VITE_CARD_IMAGE_BASE ?? 'https://wsrv.nl/?url=images.ygoprodeck.com/images/cards/';
// ponytail: derived from the card image base; a custom VITE_CARD_IMAGE_BASE must also serve /cards_cropped/.
export const CROPPED_BASE = CARD_BASE.replace('/cards/', '/cards_cropped/');

/** Frame colours (light, dark) by card type, as the show paints them. */
function frame(def: CardDef): [string, string] {
  if (def.kind === 'spell') return ['#3fb59a', '#1d7a66'];
  if (def.kind === 'trap') return ['#c8679f', '#8a2f63'];
  if (def.mtype === 'fusion') return ['#a77bc9', '#6d4192'];
  if (def.mtype === 'ritual') return ['#7ea4dc', '#3f66a8'];
  if (def.mtype === 'normal') return ['#e3cf86', '#bf9f4e'];
  return ['#dd9a5c', '#a8602c'];
}

const ATTR: Record<string, [string, string]> = {
  DARK: ['#7a4a9e', '闇'], LIGHT: ['#d9b23a', '光'], EARTH: ['#8b6a3e', '地'], WATER: ['#3c7fd0', '水'],
  FIRE: ['#d4472c', '炎'], WIND: ['#3f9f57', '風'], DIVINE: ['#c9a440', '神'],
};

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number, size: number, weight = '700') {
  let px = size;
  do ctx.font = `${weight} ${px}px Tektur, Cairo, Arial, sans-serif`; while (ctx.measureText(text).width > max && --px > 8);
}

/** A level ball: orange, lit from the top left. */
function ball(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffe2a0'); g.addColorStop(0.45, '#ff9a2a'); g.addColorStop(1, '#b4410c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#6b2a06'; ctx.lineWidth = 1.2; ctx.stroke();
}

/** A cream box with a dark rim, holding one number or word. */
function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string, size: number) {
  ctx.fillStyle = '#3a2a14';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 7); ctx.fill();
  ctx.fillStyle = '#f6efdc';
  ctx.beginPath(); ctx.roundRect(x + 3, y + 3, w - 6, h - 6, 5); ctx.fill();
  ctx.fillStyle = '#2a2016';
  fitText(ctx, text, w - 16, size, '800');
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
}

const GLYPH_FONT = (px: number) => `700 ${px}px "Noto Sans JP", "Yu Gothic", "MS Gothic", sans-serif`;

/** Spells and traps as the show draws them: the picture in a grey metal frame, then a mottled green (or magenta) band
 *  holding a pale box with an orange rim and the round 魔 (or 罠) badge. */
function paintSpellTrap(ctx: CanvasRenderingContext2D, def: CardDef, picture: (x: number, y: number, w: number, h: number) => void) {
  const spell = def.kind === 'spell';
  // grey metal frame
  const metal = ctx.createLinearGradient(0, 0, 300, 438);
  metal.addColorStop(0, '#9aa0a8'); metal.addColorStop(0.5, '#6d727a'); metal.addColorStop(1, '#8a9098');
  ctx.fillStyle = '#3a3d42';
  ctx.fillRect(0, 0, 300, 438);
  ctx.fillStyle = metal;
  ctx.fillRect(2, 2, 296, 434);
  // the picture, sunk into the frame
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(8, 8, 284, 312);
  picture(10, 10, 280, 308);
  // the coloured band, mottled with soft light patches (the same for every card of a kind)
  const [base, patch] = spell ? ['#3d9a52', '#6cc07a'] : ['#b04a8a', '#d683b8'];
  ctx.fillStyle = '#2a2c30';
  ctx.fillRect(8, 326, 284, 104);
  ctx.fillStyle = base;
  ctx.fillRect(10, 328, 280, 100);
  ctx.save();
  ctx.beginPath(); ctx.rect(10, 328, 280, 100); ctx.clip();
  let seed = spell ? 7 : 11;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 26; i++) {
    const x = 10 + rand() * 280, y = 328 + rand() * 100, r = 12 + rand() * 26;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `${patch}66`); g.addColorStop(1, `${patch}00`);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
  // pale box with an orange rim and square corners
  const bx = 22, by = 344, bw = 256, bh = 68;
  ctx.fillStyle = spell ? '#d4e6bc' : '#efd3e2';
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#b8642a';
  ctx.lineWidth = 3;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.fillStyle = '#8f4a1c';
  for (const [cx, cy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) ctx.fillRect(cx - 4, cy - 4, 8, 8);
  // the round badge
  const x = 150, y = by + bh / 2, r = 20;
  const g = ctx.createRadialGradient(x - 6, y - 6, 2, x, y, r);
  if (spell) { g.addColorStop(0, '#bfe6f5'); g.addColorStop(0.5, '#4a9cc6'); g.addColorStop(1, '#174c6e'); }
  else { g.addColorStop(0, '#f6c6e4'); g.addColorStop(0.5, '#c0479a'); g.addColorStop(1, '#5e1546'); }
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffffaa'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = GLYPH_FONT(22);
  ctx.fillText(spell ? '魔' : '罠', x, y + 1);
}

/** Paint `def` as an anime-style card filling a w×h canvas (laid out for 300×438), with `art` as its picture. */
export function paintAnimeCard(ctx: CanvasRenderingContext2D, w: number, h: number, def: CardDef, art: CanvasImageSource & { width: number; height: number } | null) {
  ctx.save();
  ctx.scale(w / 300, h / 438);
  // an <img>'s width is its size on screen; the picture's own size is naturalWidth
  const iw = art instanceof HTMLImageElement ? art.naturalWidth : art?.width ?? 0;
  const ih = art instanceof HTMLImageElement ? art.naturalHeight : art?.height ?? 0;
  const picture = (ax: number, ay: number, aw: number, ah: number) => {
    if (!art || !iw || !ih) return;
    const scale = Math.max(aw / iw, ah / ih), sw = aw / scale, sh = ah / scale;
    ctx.drawImage(art, (iw - sw) / 2, (ih - sh) / 2, sw, sh, ax, ay, aw, ah);
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (def.kind !== 'monster') paintSpellTrap(ctx, def, picture);
  else {
    const [light, dark] = frame(def);
    // the card: a dark outline round a coloured body, a little lighter at the top
    ctx.fillStyle = '#2b2119';
    ctx.beginPath(); ctx.roundRect(0, 0, 300, 438, 12); ctx.fill();
    const body = ctx.createLinearGradient(0, 0, 0, 438);
    body.addColorStop(0, light); body.addColorStop(1, dark);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.roundRect(4, 4, 292, 430, 9); ctx.fill();
    // the picture fills the top, in a thin dark rim
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(11, 11, 278, 296);
    picture(14, 14, 272, 290);
    // level balls centred, the attribute badge on the right
    const n = Math.min(12, def.lv ?? 0), r = n > 8 ? 8 : 10, gap = r * 2 + 4;
    for (let i = 0; i < n; i++) ball(ctx, 150 + (i - (n - 1) / 2) * gap, 330, r);
    const [colour, glyph] = ATTR[def.attr ?? ''] ?? ['#777', '?'];
    ctx.fillStyle = '#2b2119';
    ctx.beginPath(); ctx.arc(268, 330, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(268, 330, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = GLYPH_FONT(15);
    ctx.fillText(glyph, 268, 331);
    const stat = (n?: number) => (def.variableStats ? '?' : cardStat(n));
    box(ctx, 16, 354, 128, 66, stat(def.atk), 34);
    box(ctx, 156, 354, 128, 66, stat(def.def), 34);
  }
  ctx.restore();
}
