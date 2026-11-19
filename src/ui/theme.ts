import Phaser from 'phaser';
import { arenaFragment } from './arenaShader';
import { sfx } from './sfx';
import { isRTL, t } from '../i18n';

// ---------------------------------------------------------------- sharp rendering
/** World size every scene is laid out in. */
export const W = 1280, H = 720;
/** Phones and tablets. */
export const TOUCH = window.matchMedia('(pointer: coarse)').matches;
/** A phone or tablet with little memory or few cores: it gets a smaller canvas and a still background. */
export const LOW_END = TOUCH && (((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4 || (navigator.hardwareConcurrency || 8) <= 4);
/**
 * Canvas size: a square of the screen's short side in device pixels, capped. Phaser's EXPAND mode fits it in the
 * window and lengthens the long side, so the canvas has the screen's shape and about its pixel count, never more.
 * Cameras zoom from the world to the canvas (fitCamera), so layout code keeps using world coordinates.
 */
export const CANVAS_SIDE = Math.round(Phaser.Math.Clamp(
  Math.min(window.innerWidth, window.innerHeight) * Math.min(window.devicePixelRatio || 1, LOW_END ? 1.75 : 2.5),
  480, LOW_END ? 720 : TOUCH ? 1000 : 1200,
));
/**
 * Text is rasterized at RES x its world size so it stays crisp under the camera zoom (about canvas / world).
 * Phones stay lower to keep text textures small.
 */
export const RES = Phaser.Math.Clamp(Math.ceil((Math.max(CANVAS_SIDE / H, CANVAS_SIDE / 820)) * 2) / 2, 1, LOW_END ? 1 : TOUCH ? 1.5 : 2);

/**
 * One face everywhere (Tektur, as in the HTML screens). The three names say which role a text plays: heading, body, numerals.
 * Tektur has no Arabic letters, so Arabic falls through to Cairo, a modern Arabic face that suits it (both from Google
 * Fonts, index.html); Latin letters and digits in Arabic text stay in Tektur.
 */
export const FONT_H = 'Tektur, Cairo, Arial, sans-serif';
export const FONT_B = FONT_H;
export const FONT_N = FONT_H;

/**
 * Load the faces the current language draws with; Boot and the language picker wait for this before text is
 * rasterized. Cairo is fetched only for Arabic (Google serves it per script, so other languages download nothing).
 */
export function loadFonts(): Promise<unknown> {
  const loads = [document.fonts.load('16px Tektur')];
  if (isRTL()) loads.push(document.fonts.load('400 16px Cairo', 'عربي'), document.fonts.load('700 16px Cairo', 'عربي'));
  return Promise.all(loads).catch(() => undefined);
}

// Every text object is rasterized at RES so it stays crisp under the camera zoom.
type TextFactory = (this: unknown, x: number, y: number, s: string | string[], style?: Phaser.Types.GameObjects.Text.TextStyle) => Phaser.GameObjects.Text;
const factory = Phaser.GameObjects.GameObjectFactory.prototype as unknown as { text: TextFactory };
const addText = factory.text;
// Letter spacing draws text one character at a time, which breaks Arabic's joined letters: off for Arabic.
const setLetterSpacing = Phaser.GameObjects.Text.prototype.setLetterSpacing;
Phaser.GameObjects.Text.prototype.setLetterSpacing = function (this: Phaser.GameObjects.Text, spacing: number) {
  return setLetterSpacing.call(this, isRTL() ? 0 : spacing);
};
// Arabic reads right to left: each drawn line holding Arabic letters is wrapped in a right-to-left embedding (RLE … PDF),
// so a sentence's punctuation and any English words in it fall on the correct side. Lines without Arabic (stats, names
// in Latin letters) draw as they are. (Phaser's own rtl mode is not used: it right-aligns every line, centred ones too.)
// Arrows at a label's start or end stay outside the embedding, so they draw exactly where and as the label writes them
// (Arabic labels put them on the outer side: «السابق ›», «‹ التالي»).
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\ufb50-\ufdff\ufe70-\ufeff]/;
const ARROWS = /^([‹›\s]*)([\s\S]*?)([‹›\s]*)$/;
const rtlLine = (s: string) => {
  if (!ARABIC.test(s)) return s;
  const [, lead, body, trail] = ARROWS.exec(s)!;
  return `${lead}\u202b${body}\u202c${trail}`;
};
const updateText = Phaser.GameObjects.Text.prototype.updateText;
const rtlContexts = new WeakSet<CanvasRenderingContext2D>();
Phaser.GameObjects.Text.prototype.updateText = function (this: Phaser.GameObjects.Text & { rtlLines?: boolean }) {
  // wrapped left-aligned paragraphs (About, What's New, the card panel) sit against the right edge in Arabic
  const style = this.style as Phaser.GameObjects.TextStyle & { wordWrapWidth: number | null };
  if (isRTL() && style.wordWrapWidth && style.align === 'left' && this.originX === 0 && !style.fixedWidth) {
    style.fixedWidth = style.wordWrapWidth;
    style.align = 'right';
  }
  // Phaser pools text canvases, so a context can come back to a new Text already wrapped: wrap each context once
  if (isRTL() && !this.rtlLines && this.context && !rtlContexts.has(this.context)) {
    this.rtlLines = true;
    const ctx = this.context;
    rtlContexts.add(ctx);
    const fill = ctx.fillText.bind(ctx), stroke = ctx.strokeText.bind(ctx);
    // the page is dir="rtl" in Arabic and a resized canvas inherits it, which would reorder each line a second time:
    // lines start left to right, and the embedding alone turns the Arabic around
    ctx.fillText = (s, x, y, max) => { ctx.direction = 'ltr'; fill(rtlLine(s), x, y, max); };
    ctx.strokeText = (s, x, y, max) => { ctx.direction = 'ltr'; stroke(rtlLine(s), x, y, max); };
  }
  return updateText.call(this);
};
factory.text = function (x, y, s, style) {
  const st = { resolution: RES, ...(style ?? {}) };
  return addText.call(this, x, y, s, st);
};

/** The world rectangle a scene's camera keeps in view (the 1280x720 world unless the scene asks otherwise). */
export interface Frame { cx: number; cy: number; w: number; h: number }
const frames = new WeakMap<Phaser.Scene, () => Frame>();
const defaultFrame = (): Frame => ({ cx: W / 2, cy: H / 2, w: W, h: H });

/**
 * Call first in every scene: maps the RES x canvas back onto the world. By default the 1280x720 world is
 * fitted and centred; `frame` lets a scene fit and centre another region (portrait duels frame the board).
 */
export function fitCamera(scene: Phaser.Scene, frame: () => Frame = defaultFrame) {
  frames.set(scene, frame);
  const camera = scene.cameras.main;
  const resize = () => {
    const size = scene.scale.baseSize;
    const f = frame();
    camera.setSize(size.width, size.height).setZoom(Math.min(size.width / f.w, size.height / f.h)).centerOn(f.cx, f.cy);
  };
  resize();
  scene.scale.on('resize', resize);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.scale.off('resize', resize));
}

/** Is the screen held upright (taller than wide)? Scenes pick their portrait layout from this when they start. */
export function portraitScreen(scene: Phaser.Scene) {
  const { width, height } = scene.scale.baseSize;
  return height > width * 1.15;
}

/**
 * Portrait only: draw a dialog that is laid out around the world centre (640, 360) larger, as far as `width`
 * allows, and move it to the middle of the screen. Returns the scale used (1 when nothing changed).
 */
export function fitDialog(scene: Phaser.Scene, layer: Phaser.GameObjects.Container, width: number, maxScale = 1.45) {
  if (!portraitScreen(scene)) return 1;
  const view = viewOf(scene);
  const k = Math.max(1, Math.min(maxScale, (view.width - 24) / width));
  layer.setScale(k).setPosition(view.cx - 640 * k, view.cy - 360 * k);
  return k;
}

/** DOM elements do not follow containers: put one where (x, y) of a fitDialog layer appears, at its scale. */
export function placeDom(dom: Phaser.GameObjects.DOMElement, layer: Phaser.GameObjects.Container, x: number, y: number) {
  dom.setPosition(layer.x + x * layer.scaleX, layer.y + y * layer.scaleY).setScale(layer.scaleX);
}

/** The part of the world currently on screen, in world coordinates. */
export function viewOf(scene: Phaser.Scene) {
  const f = (frames.get(scene) ?? defaultFrame)();
  const zoom = scene.cameras.main.zoom;
  const width = scene.scale.baseSize.width / zoom, height = scene.scale.baseSize.height / zoom;
  return { cx: f.cx, cy: f.cy, width, height, left: f.cx - width / 2, top: f.cy - height / 2, right: f.cx + width / 2, bottom: f.cy + height / 2 };
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
  opts: { size?: number; danger?: boolean; primary?: boolean; tab?: boolean; wrap?: boolean; icon?: string; lead?: Phaser.GameObjects.Image } = {},
): Button {
  const c = scene.add.container(x, y) as Button;
  const g = scene.add.graphics();
  const t = scene.add.text(0, 0, label, {
    fontFamily: FONT_H, fontSize: `${opts.size ?? 15}px`, color: COL.text, fontStyle: 'bold', align: 'center',
    wordWrap: opts.wrap ? { width: w - 24, useAdvancedWrap: true } : undefined,
  }).setOrigin(0.5);
  c.add([g, t]);
  // before the label: an icon (`ticon_<name>`, BootScene), tinted like the label, or a picture such as a card
  const iconSize = Math.round(Math.min(h - 10, (opts.size ?? 15) + 3));
  const lead = opts.lead ?? (opts.icon && scene.textures.exists(`ticon_${opts.icon}`) ? scene.add.image(0, 0, `ticon_${opts.icon}`).setDisplaySize(iconSize, iconSize) : undefined);
  const tinted = !opts.lead;
  if (lead) c.add(lead);
  const GAP = 8;
  const place = () => {
    if (!lead) return;
    const full = lead.displayWidth + GAP + t.displayWidth;
    lead.setPosition(-full / 2 + lead.displayWidth / 2, 0);
    t.setX(-full / 2 + lead.displayWidth + GAP + t.displayWidth / 2);
  };
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
    } else if (opts.danger) {
      // a filled red button: "No", "Surrender"
      g.fillStyle(lit ? 0xa3122a : 0x86101f, a).fillPoints(shape(0), true);
      g.lineStyle(1, lit ? 0xff8a9a : 0xc23146, a).strokePoints(shape(0.5), true);
    } else {
      const edge = selected || lit ? COL.gold : COL.line;
      g.fillStyle(selected ? 0x2b2540 : lit ? 0x242039 : 0x14121f, 0.96 * a).fillPoints(shape(0), true);
      if (lit) g.fillStyle(COL.gold, 0.07).fillPoints(shape(0), true);
      g.lineStyle(selected ? 1.5 : 1, edge, (opts.danger && !lit ? 0.7 : 1) * a).strokePoints(shape(0.5), true);
    }
    const color = !c.enabled ? '#6a657c' : solid ? '#1d1505' : opts.danger ? '#ffffff' : selected || lit ? COL.goldTxt : COL.text;
    t.setColor(color);
    if (lead && tinted) lead.setTint(Phaser.Display.Color.HexStringToColor(color).color);
    if (lead && !tinted) lead.setAlpha(c.enabled ? 1 : 0.4);
  };
  const fitLabel = () => { t.setScale(Math.min(1, Math.max(1, w - 16 - (lead ? lead.displayWidth + GAP : 0)) / t.width, Math.max(1, h - 6) / t.height)); place(); };
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
  // low-end phones get the still background: the animated one redraws a full-screen shader 30 times a second
  if (animated && !LOW_END && scene.game.renderer.type === Phaser.WEBGL) {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? '0.0' : '1.0';
    const fragment = arenaFragment(motion);
    // Render the soft smoke separately so it doesn't determine the board's render resolution.
    const key = `arena-background-${scene.sys.settings.key}`;
    const source = new Phaser.Display.BaseShader('duel-arena', fragment, undefined, {
      viewport: { type: '2f', value: { x: W, y: H } },
    });
    const shader = scene.add.shader(source, 0, 0, 320, 180).setDepth(-101).setRenderToTexture(key);
    const background = scene.add.image(W / 2, H / 2, key).setDepth(-100).setFlipY(true);
    let lastFrame = -Infinity;
    const update = (time: number) => {
      const render = motion === '1.0' && time - lastFrame >= 1000 / 30 - 0.5;
      if (render) lastFrame = time;
      shader.setVisible(render);
    };
    scene.events.on('postupdate', update);
    const resize = () => {
      const { width, height, cx, cy } = viewOf(scene);
      shader.setUniform('viewport.value', { x: width, y: height });
      background.setPosition(cx, cy).setDisplaySize(width, height);
    };
    background.once('destroy', () => {
      scene.events.off('postupdate', update);
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
  const resize = () => {
    const { width, height, cx, cy } = viewOf(scene);
    background.setPosition(cx, cy).setDisplaySize(width, height);
  };
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
    fitDialog(scene, layer, 440);
    if (dom) placeDom(dom, layer, 640, dom.y);
    dom?.setDepth(4001);
    const done = (v: string | boolean | null) => { dom?.destroy(); layer.destroy(); resolve(v); };
    const accept = () => {
      if (!field) return done(true);
      const v = field.value.trim();
      if (v) done(v); else field.focus();
    };
    const cancel = () => done(field ? null : false);
    layer.add(button(scene, 640 + (o.cancel === '' ? 0 : 100), y + 26, 170, 40, o.ok, accept, { primary: !o.danger, danger: o.danger, size: 15 }));
    if (o.cancel !== '') layer.add(button(scene, 540, y + 26, 170, 40, o.cancel ?? t('Cancel'), cancel, { size: 15 }));
    if (field) {
      const f = field;
      f.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') accept(); if (e.key === 'Escape') cancel(); });
      // no auto-focus: on phones it would pop the keyboard over the prompt
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
  // portrait: a single column, drawn larger by fitDialog
  const tall = portraitScreen(scene);
  const px = tall ? 400 : 320, pw = tall ? 480 : 640, top = tall ? 40 : 130, ph = tall ? 640 : 460;
  layer.add(scene.add.zone(px, top, pw, ph).setOrigin(0).setInteractive());
  layer.add(panel(scene, px, top, pw, ph, 0.98, 10));
  layer.add(htxt(scene, 640, top + 36, title, 22).setOrigin(0.5));
  const entries = scene.add.container(0, 0);
  layer.add(entries);
  const pageSize = tall ? 10 : 12;
  const bottom = top + ph - 38;
  const lastPage = Math.max(0, Math.ceil(options.length / pageSize) - 1);
  let page = Math.max(0, Math.floor(selected / pageSize));
  const render = () => {
    entries.removeAll(true);
    options.slice(page * pageSize, (page + 1) * pageSize).forEach((label, i) => {
      const index = page * pageSize + i;
      const x = tall ? 640 : 484 + (i % 2) * 312, y = tall ? top + 92 + i * 49 : 218 + Math.floor(i / 2) * 49;
      entries.add(button(scene, x, y, tall ? 420 : 290, 39, label, () => {
        close();
        onChoose(index);
      }, { size: 14 }).setSelected(index === selected));
    });
    if (lastPage) {
      // Arabic reads right to left: Previous on the right, Next on the left
      const [prevX, nextX] = isRTL() ? [px + pw - 84, px + 84] : [px + 84, px + pw - 84];
      entries.add(button(scene, prevX, bottom, 120, 34, t('‹ Previous'), () => { page--; render(); }, { size: 12 }).setEnabled(page > 0));
      entries.add(button(scene, nextX, bottom, 120, 34, t('Next ›'), () => { page++; render(); }, { size: 12 }).setEnabled(page < lastPage));
    }
  };
  layer.add(button(scene, 640, bottom, tall ? 140 : 160, 36, t('Close'), close, { size: 14 }));
  fitDialog(scene, layer, pw);
  scene.input.keyboard?.once('keydown-ESC', close);
  layer.once('destroy', () => scene.input.keyboard?.off('keydown-ESC', close));
  render();
}
