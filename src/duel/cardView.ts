// One card on screen: a perspective-corrected mesh whose corners follow the board's slant on the field and stay flat
// in the hand. Tweens animate the plain transform (x, y, angle, scale, alpha, flip); sync() writes the corners.
import { PerspectiveMesh, type Texture } from 'pixi.js';
import type { Board, CardXf, Pt } from './geometry';

export class CardView implements CardXf {
  x = 0; y = 0; angle = 0; sx = 0.25; sy = 0.25; alpha = 1;
  /** 1 = face fully shown; 0 = edge-on (mid flip). */
  flip = 1;
  /** Pixels lifted off the board (flips and draws arc up). */
  lift = 0;
  z = 0;
  visible = true;
  field = true;
  /** Where layout last sent the card, so highlights line up even mid-tween. */
  to: CardXf | null = null;
  faceId: string | null = null;
  readonly mesh: PerspectiveMesh;
  private last = '';
  quad: Pt[] = [];

  constructor(readonly uid: number, texture: Texture, private board: Board) {
    this.mesh = new PerspectiveMesh({ texture, verticesX: 4, verticesY: 4 });
  }

  get scale() { return this.sy; }
  set scale(v: number) { this.sx = v; this.sy = v; }

  setTexture(texture: Texture) {
    if (this.mesh.texture !== texture) { this.mesh.texture = texture; this.last = ''; }
  }

  corners(pad = 0, field = this.field): Pt[] {
    const q = this.board.cardQuad({ x: this.x, y: this.y - this.lift, angle: this.angle, sx: this.sx, sy: this.sy }, pad, field && this.lift < 0.5);
    if (this.flip >= 0.999) return q;
    // squeeze the card towards its vertical centre line: TL/TR meet at the top edge's middle, BL/BR at the bottom's
    const f = Math.max(0.02, this.flip);
    const top = { x: (q[0].x + q[1].x) / 2, y: (q[0].y + q[1].y) / 2 }, bottom = { x: (q[2].x + q[3].x) / 2, y: (q[2].y + q[3].y) / 2 };
    const mid = [top, top, bottom, bottom];
    return q.map((p, i) => ({ x: mid[i].x + (p.x - mid[i].x) * f, y: mid[i].y + (p.y - mid[i].y) * f }));
  }

  sync() {
    this.mesh.visible = this.visible && this.alpha > 0.001;
    this.mesh.alpha = this.alpha;
    this.mesh.zIndex = this.z;
    if (!this.mesh.visible) return;
    const key = `${this.x.toFixed(2)},${this.y.toFixed(2)},${this.angle.toFixed(2)},${this.sx.toFixed(4)},${this.sy.toFixed(4)},${this.flip.toFixed(3)},${this.lift.toFixed(2)},${this.field}`;
    if (key === this.last) return;
    this.last = key;
    const q = this.corners();
    this.quad = q;
    // the mesh is laid out in texture pixels; its corners go straight to world positions
    this.mesh.setCorners(q[0].x, q[0].y, q[1].x, q[1].y, q[2].x, q[2].y, q[3].x, q[3].y);
  }

  destroy() { this.mesh.destroy(); }
}
