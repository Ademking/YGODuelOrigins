import Phaser from 'phaser';
import { sfx } from './sfx';

// ---------------------------------------------------------------- sharp rendering
/** World size every scene is laid out in. */
export const W = 1280, H = 720;
/**
 * Internal render scale. The canvas is RES x the world size and each camera zooms by RES, so layout
 * code keeps using 1280x720 coordinates while vectors, text and cards are rasterized at screen
 * resolution. Cap mobile resolution to keep the canvas and text textures smaller.
 */
const touchDevice = window.matchMedia('(pointer: coarse)').matches;
export const RES = Phaser.Math.Clamp(
  Math.ceil(((window.screen?.width ?? W) * (window.devicePixelRatio || 1)) / W * 2) / 2,
  touchDevice ? 1 : 1.5,
  touchDevice ? 1 : 2,
);

/** One face everywhere (Michroma). The three names say which role a text plays: heading, body, numerals. */
export const FONT_H = 'Michroma, Arial, sans-serif';
export const FONT_B = FONT_H;
export const FONT_N = FONT_H;
/** Boot waits for these before the first text is rasterized. */
export const FONT_LOADS = ['16px Michroma'];

// Every text object is rasterized at RES so it stays crisp under the camera zoom.
type TextFactory = (this: unknown, x: number, y: number, s: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;
const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFactory };
const addText = factory.text;
factory.text = function (x, y, s, style) {
  const st = { resolution: RES, ...(style ?? {}) };
  return addText.call(this, x, y, s, st);
};

/** Call first in every scene: maps the RES x canvas back onto the 1280x720 world. */
export function fitCamera(scene: Phaser.Scene) {
  const camera = scene.cameras.main;
  const resize = () => {
    const size = scene.scale.baseSize;
    camera.setSize(size.width, size.height).setZoom(Math.min(size.width / W, size.height / H)).centerOn(W / 2, H / 2);
  };
  resize();
  scene.scale.on('resize', resize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', resize));
}

// ---------------------------------------------------------------- palette & type
// Shadow-realm indigo, aged brass, parchment text. Both players share the brass accent.
export const COL = {
  bg: 0x06050d,
  panel: 0x0e0c1b,
  panel2: 0x191630,
  line: 0x3a3456,
  glow: 0x7fdcea, // hover / focus accent
  violet: 0x9b7bff,
  gold: 0xd8b25e,
  goldLit: 0xf2d48c,
  goldDim: 0x7c6638,
  red: 0xe5536b,
  green: 0x5ee0a0,
  blue: 0x5aa8ff,
  text: '#f1ebdc',
  dim: '#9a93ae',
  goldTxt: '#f0d08a',
  glowTxt: '#a8e8f2',
};

export function txt(scene: Phaser.Scene, x: number, y: number, s: string, size = 16, color = COL.text, opts: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return scene.add.text(x, y, s, { fontFamily: FONT_B, fontSize: `${size}px`, color, ...opts });
}
export function htxt(scene: Phaser.Scene, x: number, y: number, s: string, size = 18, color = COL.goldTxt, opts: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return scene.add.text(x, y, s, { fontFamily: FONT_H, fontSize: `${size}px`, color, fontStyle: 'bold', ...opts });
}
/** Small uppercase label, used for section captions. */
export function caption(scene: Phaser.Scene, x: number, y: number, s: string, color = COL.dim, size = 11) {
  return scene.add.text(x, y, s.toUpperCase(), { fontFamily: FONT_H, fontSize: `${size}px`, color, fontStyle: 'bold' }).setLetterSpacing(2);
}

type Pt = { x: number; y: number };
/** Rectangle with its four corners cut off: the frame shape every panel, plate and button shares. */
export function chamfer(x: number, y: number, w: number, h: number, c: number): Pt[] {
  c = Math.max(0, Math.min(c, w / 2, h / 2));
  return [
    { x: x + c, y }, { x: x + w - c, y }, { x: x + w, y: y + c }, { x: x + w, y: y + h - c },
    { x: x + w - c, y: y + h }, { x: x + c, y: y + h }, { x, y: y + h - c }, { x, y: y + c },
  ];
}
/** Dark cut-corner panel with a hairline edge. Flat fills only. */
export function panel(scene: Phaser.Scene, x: number, y: number, w: number, h: number, alpha = 0.86, radius = 12) {
  const g = scene.add.graphics();
  const c = Math.min(radius, 10);
  g.fillStyle(0x000000, 0.38).fillPoints(chamfer(x + 1, y + 6, w, h, c), true);
  g.fillStyle(COL.panel, alpha).fillPoints(chamfer(x, y, w, h, c), true);
  g.lineStyle(1, COL.line, 1).strokePoints(chamfer(x + 0.5, y + 0.5, w - 1, h - 1, c), true);
  return g;
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(v: boolean): Button;
  setSelected(v: boolean): Button;
  setLabel(s: string): Button;
  enabled: boolean;
}

/**
 * Cut-corner button. `primary` is solid brass; `tab` turns solid brass while selected (phase track, filter tabs).
 */
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string, onClick: () => void,
  opts: { size?: number; danger?: boolean; primary?: boolean; tab?: boolean; wrap?: boolean } = {},
): Button {
  const c = scene.add.container(x, y) as Button;
  const g = scene.add.graphics();
  const t = scene.add.text(0, 0, label, {
    fontFamily: FONT_H, fontSize: `${opts.size ?? 15}px`, color: COL.text, fontStyle: 'bold', align: 'center',
    wordWrap: opts.wrap ? { width: w - 24, useAdvancedWrap: true } : undefined,
  }).setOrigin(0.5);
  c.add([g, t]);
  let hover = false, selected = false;
  c.enabled = true;
  const cut = Math.min(7, h / 3.2);
  const shape = (inset: number) => chamfer(-w / 2 + inset, -h / 2 + inset, w - inset * 2, h - inset * 2, Math.max(1, cut - inset * 0.6));
  const draw = () => {
    g.clear();
    const lit = hover && c.enabled;
    const a = c.enabled ? 1 : 0.4;
    const solid = opts.primary || (opts.tab && selected);
    if (solid) {
      g.fillStyle(lit ? COL.goldLit : COL.gold, a).fillPoints(shape(0), true);
      g.lineStyle(1, 0xfff1c9, 0.9 * a).strokePoints(shape(0.5), true);
    } else {
      const edge = opts.danger ? COL.red : selected || lit ? COL.gold : COL.line;
      g.fillStyle(selected ? 0x2b2540 : lit ? 0x242039 : 0x14121f, 0.96 * a).fillPoints(shape(0), true);
      if (lit) g.fillStyle(COL.gold, 0.07).fillPoints(shape(0), true);
      g.lineStyle(selected ? 1.5 : 1, edge, (opts.danger && !lit ? 0.7 : 1) * a).strokePoints(shape(0.5), true);
    }
    t.setColor(!c.enabled ? '#6a657c' : solid ? '#1d1505' : selected || lit ? COL.goldTxt : opts.danger ? '#ffb3c0' : COL.text);
  };
  const fitLabel = () => t.setScale(Math.min(1, Math.max(1, w - 16) / t.width, Math.max(1, h - 6) / t.height));
  const press = (scale: number) => { if (c.active) scene.tweens.add({ targets: c, scale, duration: 90, ease: 'Sine.out' }); };
  fitLabel();
  draw();
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerover', () => { hover = true; draw(); if (c.enabled) press(1.03); });
  c.on('pointerout', () => { hover = false; draw(); press(1); });
  c.on('pointerdown', () => { if (c.enabled) press(0.97); });
  c.on('pointerup', () => { if (c.enabled) { press(hover ? 1.03 : 1); sfx.click(); onClick(); } });
  c.setEnabled = (v) => { c.enabled = v; draw(); return c; };
  c.setSelected = (v) => { selected = v; draw(); return c; };
  c.setLabel = (s) => { t.setText(s); fitLabel(); return c; };
  return c;
}

export const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((r) => scene.time.delayedCall(Math.max(0, ms), () => r()));

/** Shadow-realm arena: slow indigo smoke with drifting brass embers. Shared by every scene. */
export function sceneBackground(scene: Phaser.Scene, animated = true) {
  if (animated && scene.game.renderer.type === Phaser.WEBGL) {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? '0.0' : '1.0';
    const fragment = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform vec2 resolution;
      uniform vec2 viewport;
      uniform float time;
      varying vec2 fragCoord;

      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
        float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
        float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      float fbm2(vec2 p) {
        float value = 0.0;
        float amplitude = 0.5;
        for (int octave = 0; octave < 4; octave++) {
          value += amplitude * noise(p);
          p = p * 2.0 + vec2(17.1, 9.2);
          amplitude *= 0.5;
        }
        return value;
      }

      float hash21(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 uv = vec2(fragCoord.x, resolution.y - fragCoord.y) / resolution;
        vec2 px = uv * resolution;
        vec2 q = (uv - 0.5) * viewport / min(viewport.x, viewport.y);
        float t = time * ${motion};
        float swirl = 1.8;
        float rim = 0.8;
        float sparks = 0.6;
        vec2 so = vec2(fract(496.0 * 0.0137) * 60.0, fract(496.0 * 0.0291) * 40.0);
        vec3 deep = vec3(4.0, 3.0, 10.0) / 255.0;
        vec3 smoke = vec3(15.0, 14.0, 34.0) / 255.0;
        vec3 glow = vec3(50.0, 44.0, 138.0) / 255.0;
        vec3 spark = vec3(255.0, 200.0, 120.0) / 255.0;
        float hgt = 1.0 - uv.y;
        vec2 pb = q * 0.8 + so.yx + vec2(t * 0.01, t * 0.03);
        float fb = fbm2(pb + vec2(fbm2(pb * 1.3 + 2.0), fbm2(pb * 1.3 + 7.0)) * swirl * 0.7);
        float lowg = pow(1.0 - smoothstep(0.0, 1.05, hgt), 1.3) * 0.6;
        vec3 col = deep + glow * (lowg * 0.38 + smoothstep(0.3, 0.85, fb) * 0.32 * (0.4 + lowg));
        col += spark * pow(smoothstep(0.45, 0.85, fb), 3.0) * lowg * 0.3;
        vec2 p = q * 1.5 + so + vec2(0.0, t * 0.05);
        vec2 w = vec2(fbm2(p * 0.9 + vec2(t * 0.015, 0.0)), fbm2(p * 0.9 + vec2(4.7, 1.3) - vec2(0.0, t * 0.012)));
        float f = fbm2(p + w * swirl);
        float f2 = fbm2(p * 2.2 + w * swirl * 1.3 + vec2(3.1, t * 0.05));
        float dens = smoothstep(0.32, 0.62, f * 0.72 + f2 * 0.38);
        float edge = smoothstep(0.0, 0.45, dens) * (1.0 - smoothstep(0.45, 1.0, dens));
        col = mix(col, smoke * (0.45 + 0.5 * lowg), dens * 0.94);
        col += glow * edge * rim * (0.15 + 0.55 * lowg);
        vec2 rp = q * 2.4 + w * swirl * 1.1 + vec2(so.x, t * 0.07);
        float rn = fbm2(rp);
        float ridge = pow(1.0 - abs(rn * 2.0 - 1.0), 7.0);
        col += mix(glow, spark, 0.25) * ridge * rim * (0.25 + 0.6 * lowg) * (1.0 - dens * 0.6);
        for (int i = 0; i < 2; i++) {
          float fi = float(i);
          float cs = mix(34.0, 20.0, fi);
          vec2 g = q * cs + vec2(sin(q.y * 3.0 + t * 0.4 + fi) * 0.6, t * (0.7 + 0.5 * fi) + fi * 9.0) + so;
          vec2 id = floor(g);
          float h = hash21(id + vec2(fi * 4.3, 0.7));
          vec2 lv = fract(g) - vec2(0.3 + 0.4 * hash21(id + 2.9), 0.5);
          float sd = length(vec2(lv.x, max(lv.y, 0.0) * 0.5 + min(lv.y, 0.0)));
          float fl = 0.55 + 0.45 * sin(t * (2.0 + 2.0 * h) + h * 50.0);
          float spk = step(0.93, h) * (1.0 - smoothstep(0.0, 0.1, sd)) * fl * smoothstep(0.0, 0.2, hgt) * (1.0 - smoothstep(0.35, 0.95, hgt)) * mix(0.6, 1.0, fi);
          col += spark * spk * sparks * 1.2 + glow * step(0.93, h) * exp(-sd * 10.0) * fl * sparks * 0.12;
        }
        col *= 1.0 - 0.4 * smoothstep(0.6, 1.4, length(q * vec2(0.8, 1.0)));
        col += (fract(52.9829189 * fract(dot(px, vec2(0.06711056, 0.00583715)))) - 0.5) * 0.008;
        gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
      }
    `;
    // Render the soft smoke separately so it doesn't determine the board's render resolution.
    const key = `arena-background-${scene.sys.settings.key}`;
    const source = new Phaser.Display.BaseShader('duel-arena', fragment, undefined, {
      viewport: { type: '2f', value: { x: W, y: H } },
    });
    const shader = scene.add.shader(source, 0, 0, 320, 180).setDepth(-101).setRenderToTexture(key);
    const background = scene.add.image(W / 2, H / 2, key).setDepth(-100).setFlipY(true);
    const resize = () => {
      const width = scene.scale.baseSize.width / scene.cameras.main.zoom;
      const height = scene.scale.baseSize.height / scene.cameras.main.zoom;
      shader.setUniform('viewport.value', { x: width, y: height });
      background.setDisplaySize(width, height);
    };
    background.once('destroy', () => {
      if (shader.active) shader.destroy();
    });
    resize();
    scene.scale.on('resize', resize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', resize));
    return background;
  }
  if (!scene.textures.exists('duel-bg')) {
    const texture = scene.textures.createCanvas('duel-bg', W * RES, H * RES)!;
    const ctx = texture.getContext();
    ctx.scale(RES, RES);
    const base = ctx.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0, '#04030a');
    base.addColorStop(0.5, '#0c0b20');
    base.addColorStop(1, '#17143a');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.55, H * 0.48, 0, W * 0.55, H * 0.48, W * 0.5);
    glow.addColorStop(0, 'rgba(64, 56, 168, 0.2)');
    glow.addColorStop(1, 'rgba(2, 4, 10, 0.45)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    texture.refresh();
  }
  const background = scene.add.image(W / 2, H / 2, 'duel-bg').setDepth(-100);
  const resize = () => background.setDisplaySize(scene.scale.baseSize.width / scene.cameras.main.zoom, scene.scale.baseSize.height / scene.cameras.main.zoom);
  resize();
  scene.scale.on('resize', resize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', resize));
  return background;
}
export const duelBackground = sceneBackground;

/**
 * Vertical scroll bar for any scrolling area: shown only when the content is taller than the view.
 * The owner keeps the scroll value; `set` redraws it and dragging the thumb / clicking the track calls `onScroll`.
 * Values are in any unit (pixels, list rows) as long as value, total and view use the same one.
 */
export class ScrollBar extends Phaser.GameObjects.Container {
  private track: Phaser.GameObjects.Rectangle;
  private thumb: Phaser.GameObjects.Rectangle;
  private value = 0;
  private total = 0;
  private view = 0;
  private grab = 0;

  constructor(scene: Phaser.Scene, x: number, private top: number, private h: number, private onScroll: (v: number) => void) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.track = scene.add.rectangle(x, top, 8, h, 0x0a0916, 0.95).setOrigin(0.5, 0).setStrokeStyle(1, COL.line, 1).setInteractive({ useHandCursor: true });
    this.thumb = scene.add.rectangle(x, top, 6, 30, COL.goldDim, 1).setOrigin(0.5, 0).setInteractive({ draggable: true, useHandCursor: true });
    this.add([this.track, this.thumb]);
    this.thumb.on('pointerover', () => this.thumb.setFillStyle(COL.gold, 1));
    this.thumb.on('pointerout', () => this.thumb.setFillStyle(COL.goldDim, 1));
    this.thumb.on('dragstart', (p: Phaser.Input.Pointer) => { this.grab = p.worldY - this.thumb.y; });
    this.thumb.on('drag', (p: Phaser.Input.Pointer) => {
      const free = this.h - this.thumb.height;
      const frac = free > 0 ? Phaser.Math.Clamp((p.worldY - this.grab - this.top) / free, 0, 1) : 0;
      this.onScroll(frac * this.max);
    });
    // clicking the track pages towards the pointer
    this.track.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const dir = p.worldY < this.thumb.y ? -1 : p.worldY > this.thumb.y + this.thumb.height ? 1 : 0;
      if (dir) this.onScroll(Phaser.Math.Clamp(this.value + dir * this.view * 0.9, 0, this.max));
    });
    this.setVisible(false);
  }

  private get max() { return Math.max(0, this.total - this.view); }

  set(value: number, total: number, view: number) {
    this.value = value;
    this.total = total;
    this.view = view;
    const needed = total > view + 0.5;
    this.setVisible(needed);
    this.track.input!.enabled = this.thumb.input!.enabled = needed;
    if (!needed) return this;
    const th = Math.max(24, this.h * (view / total));
    this.thumb.setSize(6, th);
    this.thumb.input!.hitArea.setSize(6, th);
    this.thumb.y = this.top + (this.h - th) * (this.max ? value / this.max : 0);
    return this;
  }

  moveToX(x: number) { this.track.x = this.thumb.x = x; return this; }
  /** Move / resize the track (for areas whose top edge depends on content above them). */
  setTrack(top: number, h: number) {
    this.top = top;
    this.h = Math.max(10, h);
    this.track.y = top;
    this.track.setSize(8, this.h);
    this.track.input!.hitArea.setSize(8, this.h);
    return this.set(this.value, this.total, this.view);
  }
}

/** Mouse-wheel over a rectangle (scene-level, so it never blocks clicks on what is underneath). Removed with `owner`. */
export function onWheelIn(scene: Phaser.Scene, rect: { x: number; y: number; w: number; h: number }, fn: (dy: number) => void, owner?: Phaser.GameObjects.GameObject) {
  const handler = (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
    if (p.worldX >= rect.x && p.worldX <= rect.x + rect.w && p.worldY >= rect.y && p.worldY <= rect.y + rect.h) fn(dy);
  };
  scene.input.on('wheel', handler);
  const off = () => scene.input.off('wheel', handler);
  owner?.once('destroy', off);
  scene.events.once('shutdown', off);
  return off;
}

/**
 * In-game modal: a confirmation (resolves true / false) or, with `input`, a name field (resolves the trimmed text
 * or null). Used instead of window.prompt / window.confirm, which embedded browsers may not support.
 */
export function modal(scene: Phaser.Scene, o: { title: string; text?: string; input?: string; ok: string; cancel?: string; danger?: boolean }): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    const layer = scene.add.container(0, 0).setDepth(4000);
    layer.add(scene.add.rectangle(640, 360, 4000, 4000, 0x000000, 0.6).setInteractive());
    const h = (o.input !== undefined ? 64 : 0) + (o.text ? 60 : 0) + 130;
    const y0 = 360 - h / 2;
    layer.add(panel(scene, 420, y0, 440, h, 0.98, 10));
    layer.add(htxt(scene, 640, y0 + 30, o.title, 19).setOrigin(0.5));
    let y = y0 + 58;
    if (o.text) { layer.add(txt(scene, 640, y, o.text, 14, COL.dim, { align: 'center', wordWrap: { width: 380 } }).setOrigin(0.5, 0)); y += 60; }
    let field: HTMLInputElement | null = null;
    let dom: Phaser.GameObjects.DOMElement | null = null;
    if (o.input !== undefined) {
      dom = scene.add.dom(640, y + 20).createElement('input', 'width: 380px; box-sizing: border-box;', '');
      field = dom.node as HTMLInputElement;
      field.className = 'ad-input';
      field.maxLength = 28;
      field.value = o.input;
      y += 64;
    }
    const done = (v: string | boolean | null) => { dom?.destroy(); layer.destroy(); resolve(v); };
    const accept = () => {
      if (!field) return done(true);
      const v = field.value.trim();
      if (v) done(v); else field.focus();
    };
    const cancel = () => done(field ? null : false);
    layer.add(button(scene, 640 + (o.cancel === '' ? 0 : 100), y + 26, 170, 40, o.ok, accept, { primary: !o.danger, danger: o.danger, size: 15 }));
    if (o.cancel !== '') layer.add(button(scene, 540, y + 26, 170, 40, o.cancel ?? 'Cancel', cancel, { size: 15 }));
    if (field) {
      const f = field;
      f.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') accept(); if (e.key === 'Escape') cancel(); });
      setTimeout(() => { f.focus(); f.select(); }, 0);
    } else {
      const key = (e: KeyboardEvent) => { if (e.key === 'Enter') accept(); if (e.key === 'Escape') cancel(); };
      window.addEventListener('keydown', key);
      layer.once('destroy', () => window.removeEventListener('keydown', key));
    }
  });
}

/** A paged picker using the same panels and controls as the game's other dialogs. */
export function chooseFromList(scene: Phaser.Scene, title: string, options: readonly string[], selected: number, onChoose: (index: number) => void) {
  const layer = scene.add.container(0, 0).setDepth(4000);
  const close = () => layer.destroy();
  const backdrop = scene.add.rectangle(640, 360, 4000, 4000, 0x05060a, 0.75).setInteractive();
  backdrop.on('pointerup', close);
  layer.add(backdrop);
  layer.add(scene.add.zone(320, 130, 640, 460).setOrigin(0).setInteractive());
  layer.add(panel(scene, 320, 130, 640, 460, 0.98, 10));
  layer.add(htxt(scene, 640, 166, title, 22).setOrigin(0.5));
  const entries = scene.add.container(0, 0);
  layer.add(entries);
  const pageSize = 12;
  const lastPage = Math.max(0, Math.ceil(options.length / pageSize) - 1);
  let page = Math.max(0, Math.floor(selected / pageSize));
  const render = () => {
    entries.removeAll(true);
    options.slice(page * pageSize, (page + 1) * pageSize).forEach((label, i) => {
      const index = page * pageSize + i;
      entries.add(button(scene, 484 + (i % 2) * 312, 218 + Math.floor(i / 2) * 49, 290, 39, label, () => {
        close();
        onChoose(index);
      }, { size: 14 }).setSelected(index === selected));
    });
    if (lastPage) {
      entries.add(button(scene, 404, 552, 120, 34, '‹ Previous', () => { page--; render(); }, { size: 12 }).setEnabled(page > 0));
      entries.add(button(scene, 876, 552, 120, 34, 'Next ›', () => { page++; render(); }, { size: 12 }).setEnabled(page < lastPage));
    }
  };
  layer.add(button(scene, 640, 552, 160, 36, 'Close', close, { size: 14 }));
  scene.input.keyboard?.once('keydown-ESC', close);
  layer.once('destroy', () => scene.input.keyboard?.off('keydown-ESC', close));
  render();
}
