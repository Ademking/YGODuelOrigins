// A card breaking like glass: a jittered lattice over its art, each cell cut into two triangles. Every shard keeps its
// piece of the artwork and is thrown outwards, tumbling, falling and fading.
import { MeshSimple, type Texture } from 'pixi.js';
import type { Pt } from './geometry';

interface Shard { cx: number; cy: number; offsets: Pt[]; dx: number; dy: number; spin: number; delay: number; drop: number }

export class Shatter extends MeshSimple {
  private shards: Shard[];

  constructor(texture: Texture, corners: Pt[]) {
    const mix = (a: number, b: number, t: number) => a + (b - a) * t;
    const at = (u: number, v: number) => ({
      x: mix(mix(corners[0].x, corners[1].x, u), mix(corners[3].x, corners[2].x, u), v),
      y: mix(mix(corners[0].y, corners[1].y, u), mix(corners[3].y, corners[2].y, u), v),
    });
    const centre = at(0.5, 0.5);
    const cols = 3, rows = 5;
    const lattice = Array.from({ length: rows + 1 }, (_, j) => Array.from({ length: cols + 1 }, (_, i) => ({
      u: (i + (i > 0 && i < cols ? (Math.random() - 0.5) * 0.7 : 0)) / cols,
      v: (j + (j > 0 && j < rows ? (Math.random() - 0.5) * 0.7 : 0)) / rows,
    })));
    const shards: Shard[] = [];
    const uvs: number[] = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = lattice[j][i], b = lattice[j][i + 1], d = lattice[j + 1][i], e = lattice[j + 1][i + 1];
      for (const triangle of Math.random() < 0.5 ? [[a, b, e], [a, e, d]] : [[a, b, d], [b, e, d]]) {
        const points = triangle.map((p) => at(p.u, p.v));
        const cx = (points[0].x + points[1].x + points[2].x) / 3, cy = (points[0].y + points[1].y + points[2].y) / 3;
        const away = Math.atan2(cy - centre.y, cx - centre.x) + (Math.random() - 0.5) * 0.9;
        const reach = 22 + Math.random() * 78;
        shards.push({
          cx, cy, offsets: points.map((p) => ({ x: p.x - cx, y: p.y - cy })),
          dx: Math.cos(away) * reach, dy: Math.sin(away) * reach - 18, spin: (Math.random() - 0.5) * 5, delay: Math.random() * 0.14, drop: 50 + Math.random() * 60,
        });
        for (const p of triangle) uvs.push(p.u, p.v);
      }
    }
    const count = shards.length * 3;
    super({ texture, vertices: new Float32Array(count * 2), uvs: new Float32Array(uvs), indices: new Uint32Array(Array.from({ length: count }, (_, i) => i)) });
    this.shards = shards;
    this.place(0, 1);
  }

  /** Lay the shards out at time t (0 to 1). */
  place(t: number, opacity: number) {
    const vertices = this.vertices;
    let fade = 0;
    this.shards.forEach((shard, index) => {
      const k = Math.min(1, Math.max(0, (t - shard.delay) / (1 - shard.delay)));
      const out = 1 - (1 - k) ** 3;
      const x = shard.cx + shard.dx * out, y = shard.cy + shard.dy * out + shard.drop * k * k;
      const cos = Math.cos(shard.spin * k), sin = Math.sin(shard.spin * k), size = 1 - 0.35 * k;
      fade += k;
      shard.offsets.forEach((offset, corner) => {
        const i = (index * 3 + corner) * 2;
        vertices[i] = x + (offset.x * cos - offset.y * sin) * size;
        vertices[i + 1] = y + (offset.x * sin + offset.y * cos) * size;
      });
    });
    this.vertices = vertices;
    // shards fade together in the second half of the throw
    const k = fade / this.shards.length;
    this.alpha = opacity * (k < 0.45 ? 1 : Math.max(0, 1 - (k - 0.45) / 0.55));
  }
}
