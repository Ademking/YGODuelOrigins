// One-shot effects: additive particle bursts, rings, blooms, sparks and screen shake. Each cleans up after itself.
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Tweens } from './tween';
import { ease, lerp } from './tween';

let dot: Texture | null = null;
let streak: Texture | null = null;
/** A soft white radial blob, tinted per use. */
export function dotTexture() {
  if (dot) return dot;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  dot = Texture.from(canvas);
  return dot;
}
/** A thin horizontal light streak (sparks, speed lines). */
export function streakTexture() {
  if (streak) return streak;
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 128, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(64, 8, 64, 4, 0, 0, Math.PI * 2); ctx.fill();
  streak = Texture.from(canvas);
  return streak;
}

export interface BurstOptions { n?: number; speed?: [number, number]; life?: number; size?: number; gravity?: number; angle?: [number, number]; spread?: number; z?: number; streaks?: boolean }

export class Fx {
  constructor(private layer: Container, private tw: Tweens, private reduced: () => boolean) {}

  private add<T extends Container>(object: T, z: number) {
    object.zIndex = z;
    this.layer.addChild(object);
    return object;
  }

  /** Particles thrown outwards from a point. */
  burst(x: number, y: number, color: number, o: BurstOptions = {}) {
    if (this.reduced()) return;
    const life = o.life ?? 520, [v0, v1] = o.speed ?? [60, 190], [a0, a1] = o.angle ?? [0, 360], spread = o.spread ?? 0;
    const n = o.n ?? 16, size = o.size ?? 0.22, gravity = o.gravity ?? 0;
    const box = this.add(new Container(), o.z ?? 615);
    box.blendMode = 'add';
    const parts = Array.from({ length: n }, () => {
      const sprite = new Sprite(o.streaks ? streakTexture() : dotTexture());
      sprite.anchor.set(0.5);
      sprite.tint = color;
      const angle = ((a0 + Math.random() * (a1 - a0)) * Math.PI) / 180, speed = v0 + Math.random() * (v1 - v0);
      sprite.position.set(x + (Math.random() * 2 - 1) * spread, y + (Math.random() * 2 - 1) * spread);
      if (o.streaks) sprite.rotation = angle;
      box.addChild(sprite);
      return { sprite, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, x0: sprite.x, y0: sprite.y, life: life * (0.55 + Math.random() * 0.45) };
    });
    const state = { t: 0 };
    this.tw.add(state, { t: life }, {
      duration: life, ease: ease.linear,
      onUpdate: () => {
        for (const p of parts) {
          const t = Math.min(state.t, p.life) / 1000, k = Math.min(1, state.t / p.life);
          p.sprite.position.set(p.x0 + p.vx * t, p.y0 + p.vy * t + 0.5 * gravity * t * t);
          const s = size * (1 - k);
          p.sprite.scale.set(o.streaks ? s * 1.6 : s, s);
          p.sprite.alpha = 1 - k;
        }
      },
      onComplete: () => box.destroy({ children: true }),
    });
  }

  /** A ring that grows and fades. `squash` < 1 lays it on the ground. */
  ring(x: number, y: number, color: number, o: { from?: number; to?: number; ms?: number; squash?: number; width?: number; z?: number } = {}) {
    if (this.reduced()) return;
    const from = o.from ?? 10, to = o.to ?? 70, squash = o.squash ?? 1;
    const g = this.add(new Graphics(), o.z ?? 611);
    g.position.set(x, y);
    g.blendMode = 'add';
    const state = { t: 0 };
    this.tw.add(state, { t: 1 }, {
      duration: o.ms ?? 420, ease: ease.cubicOut,
      onUpdate: () => {
        const r = lerp(from, to, state.t), a = 1 - state.t;
        g.clear()
          .ellipse(0, 0, r, r * squash).stroke({ width: 10 * a, color, alpha: a * 0.2 })
          .ellipse(0, 0, r, r * squash).stroke({ width: (o.width ?? 3) * (1 - state.t * 0.6), color, alpha: a });
      },
      onComplete: () => g.destroy(),
    });
  }

  /** A soft additive bloom that pops and fades. */
  flash(x: number, y: number, color: number, radius = 90, ms = 320, z = 610) {
    if (this.reduced()) return;
    const sprite = this.add(new Sprite(dotTexture()), z);
    sprite.anchor.set(0.5);
    sprite.tint = color;
    sprite.blendMode = 'add';
    sprite.position.set(x, y);
    sprite.scale.set(radius / 64);
    sprite.alpha = 0.9;
    const target = { alpha: 0, s: radius / 20 };
    const state = { alpha: 0.9, s: radius / 64 };
    this.tw.add(state, target, {
      duration: ms, ease: ease.cubicOut,
      onUpdate: () => { sprite.alpha = state.alpha; sprite.scale.set(state.s); },
      onComplete: () => sprite.destroy(),
    });
  }

  /** Slow motes rising through a rectangle for `ms`. */
  motes(x: number, y: number, w: number, h: number, color: number, ms: number, z: number, rate = 70) {
    if (this.reduced()) return () => {};
    const stop = this.tw.every(rate, () => {
      const sprite = this.add(new Sprite(dotTexture()), z);
      sprite.anchor.set(0.5);
      sprite.tint = color;
      sprite.blendMode = 'add';
      const s = 0.05 + Math.random() * 0.12;
      sprite.scale.set(s);
      sprite.position.set(x + Math.random() * w, y + Math.random() * h);
      const life = 2200 + Math.random() * 2000;
      const p = { y: sprite.y, x: sprite.x, a: 0.85 };
      this.tw.add(p, { y: p.y - (10 + Math.random() * 24) * life / 1000, x: p.x + (Math.random() - 0.5) * 16, a: 0 }, {
        duration: life, ease: ease.linear,
        onUpdate: () => { sprite.position.set(p.x, p.y); sprite.alpha = p.a; },
        onComplete: () => sprite.destroy(),
      });
    });
    this.tw.later(ms, stop);
    return stop;
  }
}

/** Shake a container about its resting position. */
export function shake(tw: Tweens, target: Container, ms = 240, strength = 8) {
  const x0 = target.x, y0 = target.y;
  const state = { t: 0 };
  tw.kill(state);
  tw.add(state, { t: 1 }, {
    duration: ms, ease: ease.linear,
    onUpdate: () => {
      const k = (1 - state.t) * strength;
      target.position.set(x0 + (Math.random() * 2 - 1) * k, y0 + (Math.random() * 2 - 1) * k);
    },
    onComplete: () => target.position.set(x0, y0),
  });
}
