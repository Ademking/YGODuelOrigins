// The Pixi application for a duel: a full-window canvas, and a world container fitted so a given world rectangle fills
// the part of the window the HTML HUD leaves free (right of the sidebar in landscape, between the plates on phones).
import { Application, Container, Text, type TextStyleOptions } from 'pixi.js';

export interface Frame { cx: number; cy: number; w: number; h: number }
export interface Insets { left: number; top: number; right: number; bottom: number }
export const FONT = 'Tektur, Cairo, Arial, sans-serif';

export class Stage {
  readonly app = new Application();
  /** Everything drawn in world coordinates. */
  readonly world = new Container({ sortableChildren: true });
  /** Shaken on big hits; holds the world. */
  readonly shaker = new Container();
  /** World units per CSS pixel and back. */
  scale = 1;
  private frameOf: () => Frame = () => ({ cx: 640, cy: 360, w: 1280, h: 720 });
  private insetsOf: () => Insets = () => ({ left: 0, top: 0, right: 0, bottom: 0 });
  private resizeListeners = new Set<() => void>();
  private observer?: ResizeObserver;

  async init(parent: HTMLElement) {
    const lowEnd = matchMedia('(pointer: coarse)').matches && ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
    await this.app.init({
      resizeTo: parent,
      antialias: !lowEnd,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2),
      preference: 'webgl',
      powerPreference: 'high-performance',
    });
    const canvas = this.app.canvas;
    canvas.style.touchAction = 'none';
    canvas.style.display = 'block';
    parent.append(canvas);
    this.app.stage.addChild(this.shaker);
    this.shaker.addChild(this.world);
    this.app.stage.eventMode = 'static';
    this.observer = new ResizeObserver(() => requestAnimationFrame(() => this.fit()));
    this.observer.observe(parent);
    this.fit();
  }

  setFrame(frame: () => Frame, insets: () => Insets) {
    this.frameOf = frame;
    this.insetsOf = insets;
    this.fit();
  }

  onResize(listener: () => void) {
    this.resizeListeners.add(listener);
    return () => this.resizeListeners.delete(listener);
  }

  get width() { return this.app.screen.width; }
  get height() { return this.app.screen.height; }

  fit() {
    if (!this.app.renderer) return;
    this.app.resize();
    const f = this.frameOf(), inset = this.insetsOf();
    const aw = Math.max(1, this.width - inset.left - inset.right), ah = Math.max(1, this.height - inset.top - inset.bottom);
    this.scale = Math.min(aw / f.w, ah / f.h);
    this.world.scale.set(this.scale);
    // the frame's centre sits at the centre of the free area
    this.world.position.set(inset.left + aw / 2 - f.cx * this.scale, inset.top + ah / 2 - f.cy * this.scale);
    for (const listener of this.resizeListeners) listener();
  }

  /** The whole window in world coordinates. */
  view() {
    const s = this.scale, x = this.world.x, y = this.world.y;
    const left = -x / s, top = -y / s, width = this.width / s, height = this.height / s;
    return { left, top, width, height, right: left + width, bottom: top + height, cx: left + width / 2, cy: top + height / 2 };
  }

  /** The free area (outside the HUD) in world coordinates. */
  playView() {
    const v = this.view(), inset = this.insetsOf(), s = this.scale;
    const left = v.left + inset.left / s, top = v.top + inset.top / s, right = v.right - inset.right / s, bottom = v.bottom - inset.bottom / s;
    return { left, top, right, bottom, width: right - left, height: bottom - top, cx: (left + right) / 2, cy: (top + bottom) / 2 };
  }

  toScreen(x: number, y: number) {
    const rect = this.app.canvas.getBoundingClientRect();
    return { x: rect.left + this.world.x + x * this.scale, y: rect.top + this.world.y + y * this.scale };
  }

  /** Text rasterised sharp for the current zoom. */
  text(text: string, style: TextStyleOptions, resolution = 1) {
    const object = new Text({ text, style: { fontFamily: FONT, ...style }, resolution: Math.min(4, Math.max(1, this.scale * (window.devicePixelRatio || 1) * resolution)) });
    return object;
  }

  destroy() {
    this.observer?.disconnect();
    this.resizeListeners.clear();
    this.app.destroy({ removeView: true }, { children: true, texture: false, textureSource: false });
  }
}
