// Board geometry: a ground plane seen in true perspective. u = column in tile widths (0 = centre), w = depth in tile
// depths (0 = midline, + towards you). Everything is in world pixels; the stage fits the world to the screen.
import type { Side, Zone } from '../engine/types';
import { CH, CW } from '../ui/cardArt';

export const W = 1280, H = 720;
export const CY = 306; // screen y of the board centre (midline)
const D = 30; // camera distance in tile depths: mild perspective
const HZ = 3150; // CY minus the horizon's screen y
export const ZW = 75, ZH = 108; // card size at the midline
export const UNIT_X = 104; // tile width at the midline
export const UNIT_Y = HZ / D; // tile depth at the midline (105)
export const ROW_M = 1, ROW_S = 2, MAT_W = 2.5;
export const ZONE_HU = 0.47, ZONE_HW = 0.47;
export const EDGE_U = 3.42, EDGE_W = MAT_W + 0.2;
const SIDE_U = 2.9, SIDE_HU = 0.283, SIDE_HW = 0.385, SIDE_GAP = 0.06;
const CARD_FILL = 0.94;
export const FIELD_SCALE = ZW / CW;

export type Pt = { x: number; y: number };
export type Cell = { u: number; w: number; hu: number; hw: number; k: number };
export type Pos = { x: number; y: number; s: number; k: number; w: number };
/** A card's drawn transform: centre, angle in degrees, and scale relative to the CW x CH texture. */
export type CardXf = { x: number; y: number; angle: number; sx: number; sy: number };

export const depth = (w: number) => D / (D - w);

export class Board {
  /** Screen x of the board centre. */
  CX = 798;
  portrait = false;
  me: Side = 0;
  Y = { oppHand: 6, phase: CY, myHand: 658 };
  handScale = 0.46 * (200 / CW);
  oppHandScale = 0.28 * (200 / CW);
  handSpacing = 92;
  handRow = 600;

  /** `spare`: extra world height a tall phone has, which spreads the hands apart. */
  layout(portrait: boolean, spare = 0) {
    const k = 200 / CW;
    const e = Math.min(Math.max(spare, 0), 420);
    this.portrait = portrait;
    this.CX = portrait ? W / 2 : 798;
    this.Y.oppHand = portrait ? -16 - e * 0.25 : 6;
    this.Y.myHand = portrait ? 772 + e * 0.35 : 642;
    this.handScale = (portrait ? 0.84 + e / 1400 : 0.5) * k;
    this.oppHandScale = (portrait ? 0.3 : 0.28) * k;
    this.handSpacing = portrait ? 150 : 96;
    this.handRow = portrait ? 680 : 620;
  }

  /** The world rectangle the camera must keep in view. */
  frame() {
    if (!this.portrait) return { cx: this.CX + 4, cy: H / 2, w: 1000, h: H };
    const top = this.Y.oppHand - 60, bottom = this.Y.myHand + CH * this.handScale / 2 + 18;
    return { cx: W / 2, cy: (top + bottom) / 2, w: 800, h: bottom - top };
  }

  rowY = (w: number) => CY - HZ + HZ * depth(w);
  proj = (u: number, w: number): Pt => ({ x: this.CX + u * UNIT_X * depth(w), y: this.rowY(w) });
  rowOf = (y: number) => D - D / ((y - CY + HZ) / HZ);

  quad(u0: number, u1: number, v0: number, v1: number) {
    return [this.proj(u0, v0), this.proj(u1, v0), this.proj(u1, v1), this.proj(u0, v1)];
  }

  /** Where a zone's tile lies. The opponent's side is yours rotated 180 degrees. */
  cell(side: Side, zone: Zone, slot = 0): Cell {
    const m = side === this.me ? 1 : -1;
    const main = (u: number, w: number): Cell => ({ u: m * u, w: m * w, hu: 0.5, hw: 0.5, k: 1 });
    const sideSlot = (u: number, i: number): Cell => ({ u: m * u, w: m * (MAT_W - SIDE_HW - i * (2 * SIDE_HW + SIDE_GAP)), hu: SIDE_HU, hw: SIDE_HW, k: 1 });
    switch (zone) {
      case 'mzone': return main(slot - 2, ROW_M);
      case 'szone': return main(slot - 2, ROW_S);
      case 'deck': return sideSlot(SIDE_U, 0);
      case 'gy': return sideSlot(SIDE_U, 1);
      case 'banished': return sideSlot(SIDE_U, 2);
      case 'extra': return sideSlot(-SIDE_U, 0);
      case 'fzone': return sideSlot(-SIDE_U, 1);
      case 'hand': return { u: 0, w: 0, hu: 0, hw: 0, k: 1 };
    }
  }

  zonePos(side: Side, zone: Zone, slot = 0): Pos {
    if (zone === 'hand') return { x: this.CX, y: side === this.me ? this.Y.myHand : this.Y.oppHand, s: 1, k: 1, w: 0 };
    const c = this.cell(side, zone, slot);
    const s = depth(c.w);
    const tileH = this.rowY(c.w + c.hw) - this.rowY(c.w - c.hw);
    const fit = Math.min(1, (CARD_FILL * tileH) / (ZH * c.k * s));
    return { ...this.proj(c.u, c.w), s, k: c.k * fit, w: c.w };
  }

  /** Every zone on one side with its tile. */
  cells(side: Side): { zone: Zone; slot: number; cell: Cell }[] {
    const zones: [Zone, number][] = [['fzone', 0], ['gy', 0], ['banished', 0], ['extra', 0], ['deck', 0]];
    for (let i = 0; i < 5; i++) zones.push(['mzone', i], ['szone', i]);
    return zones.map(([zone, slot]) => ({ zone, slot, cell: this.cell(side, zone, slot) }));
  }

  zoneOutline(side: Side, zone: Zone, slot: number) {
    const cell = this.cell(side, zone, slot);
    const main = zone === 'mzone' || zone === 'szone';
    const hu = main ? ZONE_HU : cell.hu, hw = main ? ZONE_HW : cell.hw;
    return this.quad(cell.u - hu, cell.u + hu, cell.w - hw, cell.w + hw);
  }

  /** A rounded rectangle lying on the board (corner radius in tile widths). */
  roundQuad(u0: number, u1: number, v0: number, v1: number, radius: number) {
    const ru = radius, rv = radius * UNIT_X / UNIT_Y, top = Math.min(v0, v1), bottom = Math.max(v0, v1);
    const points: Pt[] = [];
    for (const [cu, cv, from] of [[u1 - ru, top + rv, -90], [u1 - ru, bottom - rv, 0], [u0 + ru, bottom - rv, 90], [u0 + ru, top + rv, 180]]) {
      for (let step = 0; step <= 4; step++) {
        const angle = ((from + step * 22.5) * Math.PI) / 180;
        points.push(this.proj(cu + Math.cos(angle) * ru, cv + Math.sin(angle) * rv));
      }
    }
    return points;
  }

  hitZone(x: number, y: number, side: Side, zone: Zone, slot = 0) {
    const c = this.cell(side, zone, slot);
    const w = this.rowOf(y), u = (x - this.CX) / (UNIT_X * depth(w));
    return Math.abs(u - c.u) < c.hu && Math.abs(w - c.w) < c.hw;
  }

  /**
   * Corners (TL, TR, BR, BL of the card art) of a card drawn with transform `t`. On the field the card's left and right
   * edges run along the ground's perspective lines while its top and bottom stay level, so it slants exactly like its
   * tile. Off the field (hand, dragging) and mid-rotation it stays flat.
   */
  cardQuad(t: CardXf, pad: number, onField: boolean, w0 = CW, h0 = CH): Pt[] {
    const w = w0 * Math.abs(t.sx) + pad, h = h0 * Math.abs(t.sy) + pad;
    const rad = (t.angle * Math.PI) / 180, cos = Math.cos(rad), sin = Math.sin(rad);
    const flip = t.sx < 0 ? -1 : 1;
    const offs = [[-w / 2 * flip, -h / 2], [w / 2 * flip, -h / 2], [w / 2 * flip, h / 2], [-w / 2 * flip, h / 2]].map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
    const flat = offs.map(([x, y]) => ({ x: t.x + x, y: t.y + y }));
    const quarter = Math.round(t.angle / 90);
    if (!onField || Math.abs(t.angle - quarter * 90) > 1 || t.sx < 0) return flat;
    const q = ((quarter % 4) + 4) % 4;
    const fw = q % 2 ? h : w, fh = q % 2 ? w : h;
    const yH = CY - HZ; // horizon: every board column line passes through (CX, yH)
    const s = (t.y - yH) / HZ, uc = (t.x - this.CX) / (UNIT_X * s), hu = fw / 2 / (UNIT_X * s);
    const lineX = (u: number, y: number) => this.CX + (u * UNIT_X * (y - yH)) / HZ;
    const yT = t.y - fh / 2, yB = t.y + fh / 2;
    const screen = [{ x: lineX(uc - hu, yT), y: yT }, { x: lineX(uc + hu, yT), y: yT }, { x: lineX(uc + hu, yB), y: yB }, { x: lineX(uc - hu, yB), y: yB }];
    return flat.map((_, i) => screen[(i + q) % 4]);
  }
}

/** Is (x, y) inside the polygon? */
export function inPoly(points: Pt[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const flatPts = (points: Pt[]) => points.flatMap((p) => [p.x, p.y]);
