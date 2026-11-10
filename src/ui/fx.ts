import Phaser from 'phaser';

// Small one-shot effects shared by the duel: additive particle bursts, expanding rings and flashes.
// All of them clean up after themselves and do nothing under prefers-reduced-motion.
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const DOT = 'fx_dot';

function ensure(scene: Phaser.Scene) {
  if (scene.textures.exists(DOT)) return;
  const tex = scene.textures.createCanvas(DOT, 64, 64)!;
  const ctx = tex.getContext();
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 64, 64);
  tex.refresh();
}

export interface BurstOptions { n?: number; speed?: [number, number]; life?: number; size?: number; gravity?: number; angle?: [number, number]; depth?: number; spread?: number }

/** Particles thrown outwards from a point. `spread` scatters their start positions (e.g. across a card). */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, o: BurstOptions = {}) {
  if (reduced()) return;
  ensure(scene);
  const life = o.life ?? 520;
  const [v0, v1] = o.speed ?? [60, 190];
  const [a0, a1] = o.angle ?? [0, 360];
  const spread = o.spread ?? 0;
  const emitter = scene.add.particles(x, y, DOT, {
    x: { min: -spread, max: spread }, y: { min: -spread, max: spread },
    speed: { min: v0, max: v1 }, angle: { min: a0, max: a1 }, lifespan: { min: life * 0.55, max: life },
    scale: { start: o.size ?? 0.22, end: 0 }, alpha: { start: 1, end: 0 }, tint: color,
    gravityY: o.gravity ?? 0, blendMode: Phaser.BlendModes.ADD, emitting: false,
  }).setDepth(o.depth ?? 615);
  emitter.explode(o.n ?? 16);
  scene.time.delayedCall(life + 80, () => emitter.destroy());
}

/** Ring that grows and fades. `squash` < 1 lays it on the ground plane. */
export function ring(scene: Phaser.Scene, x: number, y: number, color: number, o: { from?: number; to?: number; ms?: number; squash?: number; width?: number; depth?: number } = {}) {
  if (reduced()) return;
  const from = o.from ?? 10, to = o.to ?? 70, squash = o.squash ?? 1;
  const g = scene.add.graphics({ x, y }).setDepth(o.depth ?? 611).setBlendMode(Phaser.BlendModes.ADD);
  const state = { t: 0 };
  scene.tweens.add({
    targets: state, t: 1, duration: o.ms ?? 420, ease: 'Cubic.out',
    onUpdate: () => {
      const r = Phaser.Math.Linear(from, to, state.t), a = 1 - state.t;
      g.clear().lineStyle((o.width ?? 3) * (1 - state.t * 0.6), color, a).strokeEllipse(0, 0, r * 2, r * 2 * squash)
        .lineStyle(8 * a, color, a * 0.18).strokeEllipse(0, 0, r * 2, r * 2 * squash);
    },
    onComplete: () => g.destroy(),
  });
}

/** Soft additive bloom that pops and fades. */
export function flash(scene: Phaser.Scene, x: number, y: number, color: number, radius = 90, ms = 320, depth = 610) {
  if (reduced()) return;
  ensure(scene);
  const img = scene.add.image(x, y, DOT).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(radius / 64).setAlpha(0.9);
  scene.tweens.add({ targets: img, alpha: 0, scale: radius / 20, duration: ms, ease: 'Cubic.out', onComplete: () => img.destroy() });
}

/** Slow motes drifting up through a rectangle (victory screen, menus). Returns the emitter; destroy it with its owner. */
export function motes(scene: Phaser.Scene, x: number, y: number, w: number, h: number, color: number, depth: number) {
  ensure(scene);
  return scene.add.particles(x, y, DOT, {
    x: { min: 0, max: w }, y: { min: 0, max: h }, speedY: { min: -34, max: -10 }, speedX: { min: -8, max: 8 },
    lifespan: { min: 2200, max: 4200 }, scale: { min: 0.05, max: 0.16 }, alpha: { start: 0.85, end: 0 }, tint: color,
    frequency: reduced() ? -1 : 70, blendMode: Phaser.BlendModes.ADD,
  }).setDepth(depth);
}
