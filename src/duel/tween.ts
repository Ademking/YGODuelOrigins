// A small tween engine driven by the Pixi ticker. Tweens animate numeric properties of any object; `wait` and the
// promise helpers run on the same clock, so the duel's pacing stays in step with what is drawn.
import type { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  sineIn: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  sineOut: (t: number) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  cubicIn: (t: number) => t * t * t,
  cubicOut: (t: number) => 1 - (1 - t) ** 3,
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  quartOut: (t: number) => 1 - (1 - t) ** 4,
  expoOut: (t: number) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  backOut: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  backIn: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  elasticOut: (t: number) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

export interface TweenOptions {
  duration?: number;
  delay?: number;
  ease?: Ease;
  yoyo?: boolean;
  /** Extra plays after the first (-1 = forever). */
  repeat?: number;
  /** With yoyo: time held at the far end before coming back. */
  hold?: number;
  onStart?: () => void;
  onUpdate?: (progress: number) => void;
  onYoyo?: () => void;
  onComplete?: () => void;
}

type Props = Record<string, number>;
interface Tween {
  target: object;
  to: Props;
  from: Props | null;
  o: TweenOptions;
  elapsed: number;
  started: boolean;
  dead: boolean;
  forward: boolean;
  plays: number;
}

export class Tweens {
  private list: Tween[] = [];
  private timers: { at: number; run: () => void; dead: boolean }[] = [];
  /** Milliseconds since the engine started, advanced by the ticker. */
  now = 0;
  private stopped = false;

  constructor(private ticker: Ticker) {
    ticker.add(this.update, this);
  }

  destroy() {
    this.stopped = true;
    this.ticker.remove(this.update, this);
    this.list = [];
    // anything still waiting resolves so no promise is left hanging
    const timers = this.timers;
    this.timers = [];
    for (const timer of timers) if (!timer.dead) timer.run();
  }

  private update(ticker: Ticker) {
    // a long frame (tab switch) is clamped so animations do not jump to their end
    const dt = Math.min(ticker.deltaMS, 100);
    this.now += dt;
    if (this.timers.length) {
      const due = this.timers.filter((timer) => !timer.dead && timer.at <= this.now);
      if (due.length) {
        this.timers = this.timers.filter((timer) => !timer.dead && timer.at > this.now);
        for (const timer of due) timer.run();
      }
    }
    if (!this.list.length) return;
    for (const tween of [...this.list]) this.step(tween, dt);
    this.list = this.list.filter((tween) => !tween.dead);
  }

  private step(tw: Tween, dt: number) {
    if (tw.dead) return;
    tw.elapsed += dt;
    const delay = tw.o.delay ?? 0;
    if (tw.elapsed < delay) return;
    const target = tw.target as Props;
    if (!tw.started) {
      tw.started = true;
      tw.from = {};
      for (const key of Object.keys(tw.to)) tw.from[key] = target[key];
      tw.o.onStart?.();
    }
    const duration = Math.max(1, tw.o.duration ?? 300);
    const local = tw.elapsed - delay;
    const p = Math.min(1, Math.max(0, local / duration));
    const e = (tw.o.ease ?? ease.cubicOut)(p);
    const k = tw.forward ? e : 1 - e;
    for (const key of Object.keys(tw.to)) target[key] = tw.from![key] + (tw.to[key] - tw.from![key]) * k;
    tw.o.onUpdate?.(k);
    if (p < 1) return;
    if (tw.o.yoyo && tw.forward) {
      tw.forward = false;
      tw.elapsed = delay - (tw.o.hold ?? 0);
      tw.o.onYoyo?.();
      return;
    }
    const repeat = tw.o.repeat ?? 0;
    if (repeat === -1 || tw.plays < repeat) {
      tw.plays++;
      tw.forward = true;
      tw.elapsed = delay;
      return;
    }
    tw.dead = true;
    tw.o.onComplete?.();
  }

  add(target: object, to: Props, o: TweenOptions = {}) {
    const tween: Tween = { target, to, from: null, o, elapsed: 0, started: false, dead: false, forward: true, plays: 0 };
    if (this.stopped) { Object.assign(target, to); o.onComplete?.(); return tween; }
    this.list.push(tween);
    if ((o.duration ?? 300) <= 0 && !o.delay) this.step(tween, 0);
    return tween;
  }

  /** Stop every tween of `target` where it is (onComplete does not run). */
  kill(target: object) {
    for (const tween of this.list) if (tween.target === target) tween.dead = true;
  }

  killAll(targets: object[]) { for (const target of targets) this.kill(target); }

  isTweening(target: object) { return this.list.some((tween) => tween.target === target && !tween.dead); }

  /** Tween and wait. A timer of the tween's own length also resolves it, so a killed tween never freezes the duel. */
  to(target: object, props: Props, o: TweenOptions = {}) {
    const length = (o.delay ?? 0) + (o.duration ?? 300) * (o.yoyo ? 2 : 1) * ((o.repeat ?? 0) + 1) + (o.hold ?? 0);
    return Promise.race([
      new Promise<void>((resolve) => this.add(target, props, { ...o, onComplete: () => { o.onComplete?.(); resolve(); } })),
      this.wait(length + 60),
    ]);
  }

  /** Run `fn` after `ms` of duel time. Returns a cancel function. */
  later(ms: number, fn: () => void) {
    const timer = { at: this.now + Math.max(0, ms), run: fn, dead: false };
    if (this.stopped) { fn(); return () => {}; }
    this.timers.push(timer);
    return () => { timer.dead = true; };
  }

  wait(ms: number) { return new Promise<void>((resolve) => { this.later(ms, resolve); }); }

  /** Repeat `fn` every `ms` until cancelled. */
  every(ms: number, fn: () => void) {
    let cancel = () => {};
    const loop = () => { fn(); cancel = this.later(ms, loop); };
    cancel = this.later(ms, loop);
    return () => cancel();
  }
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Shortest turn from angle a to angle b, in degrees. */
export const shortestTurn = (a: number, b: number) => {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
};
