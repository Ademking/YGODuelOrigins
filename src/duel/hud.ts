// The duel's HTML layer: Life Point plates, the card details panel, the menu button, and every prompt, menu and
// overlay. It sits over the Pixi canvas; only its panels take pointer input, so the board stays playable around them.
import { cardInfo, type PanelInfo } from '../app/cardInfo';
import { cardHtml, esc, html } from '../app/dom';
import { icon, type IconName } from '../app/icons';
import type { CardDef } from '../engine/types';
import type { Side } from '../engine/types';
import { t, num } from '../i18n';
import type { Insets } from './stage';

export interface PlateLook { name: string; avatar?: string; portrait?: string; ace?: string; fallback?: string; flag?: string; dorm?: { color: string; light: string }; record?: { wins: number; losses: number; draws: number }; clock?: boolean }

export class Plate {
  readonly el: HTMLElement;
  private lpEl: HTMLElement;
  private bar: HTMLElement;
  private ghost: HTMLElement;
  private clockEl: HTMLElement | null;
  private shown: number;
  private anim = 0;
  private bubbleTimer = 0;

  constructor(look: PlateLook, private start: number, private near: boolean) {
    this.shown = start;
    const picture = look.avatar ?? look.portrait ?? look.ace;
    const dorm = look.dorm;
    this.el = html(`<div class="duel-plate ${near ? 'near' : 'far'}" style="${dorm ? `--dorm:${dorm.color};--dorm-lit:${dorm.light}` : ''}" data-dorm="${dorm ? 1 : 0}">
      <div class="duel-plate-pic">${picture ? `<img src="${esc(picture)}" alt="" draggable="false" class="${look.ace ? 'ace' : look.portrait ? 'portrait' : ''}">` : `<span>${esc(look.fallback ?? look.name.slice(0, 1).toUpperCase())}</span>`}
        ${look.flag ? `<img class="flag" src="${esc(look.flag)}" alt="">` : ''}</div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2"><b class="min-w-0 flex-1 truncate">${esc(look.name)}</b>${look.clock ? '<span class="duel-clock" data-clock></span>' : ''}</div>
        <div class="flex items-end justify-between gap-2"><span class="duel-lp" data-lp>${num(start)}</span>${look.record ? `<span class="duel-record"><i class="w">▲${look.record.wins}</i><i class="l">▼${look.record.losses}</i><i class="d">=${look.record.draws}</i></span>` : ''}</div>
        <div class="duel-lpbar"><i data-ghost></i><i data-bar></i></div>
      </div>
      <div class="duel-bubble" hidden></div>
    </div>`);
    this.lpEl = this.el.querySelector('[data-lp]')!;
    this.bar = this.el.querySelector('[data-bar]')!;
    this.ghost = this.el.querySelector('[data-ghost]')!;
    this.clockEl = this.el.querySelector('[data-clock]');
    // a portrait that fails to load leaves the initial
    this.el.querySelector<HTMLImageElement>('.duel-plate-pic > img:not(.flag)')?.addEventListener('error', (event) => {
      (event.target as HTMLElement).replaceWith(html(`<span>${esc(look.fallback ?? look.name.slice(0, 1).toUpperCase())}</span>`));
    });
    this.draw(start);
  }

  private draw(lp: number) {
    const frac = Math.max(0, Math.min(1, lp / this.start));
    this.lpEl.textContent = num(Math.round(lp));
    this.lpEl.classList.toggle('low', frac <= 0.25);
    this.bar.style.width = `${frac * 100}%`;
    this.el.classList.toggle('low', frac <= 0.25);
  }

  active(on: boolean) { this.el.classList.toggle('on', on); }

  /** Count the Life Points to `lp` over `ms`, with a floating +/- and a flash. */
  setLP(lp: number, delta: number, ms: number) {
    const from = this.shown;
    this.shown = lp;
    cancelAnimationFrame(this.anim);
    const start = performance.now();
    // the damage trail lingers, then drains to the new value
    this.ghost.style.transition = 'none';
    this.ghost.style.width = `${Math.max(0, Math.min(1, from / this.start)) * 100}%`;
    requestAnimationFrame(() => { this.ghost.style.transition = ''; this.ghost.style.width = `${Math.max(0, Math.min(1, lp / this.start)) * 100}%`; });
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / Math.max(1, ms));
      this.draw(from + (lp - from) * (1 - (1 - k) ** 3));
      if (k < 1) this.anim = requestAnimationFrame(step);
    };
    this.anim = requestAnimationFrame(step);
    if (!delta) return;
    const float = html(`<span class="duel-delta ${delta < 0 ? 'hurt' : 'heal'}">${delta > 0 ? '+' : '−'}${num(Math.abs(delta))}</span>`);
    this.el.append(float);
    setTimeout(() => float.remove(), 1500);
    this.el.classList.remove('hit', 'healed');
    void this.el.offsetWidth;
    this.el.classList.add(delta < 0 ? 'hit' : 'healed');
  }

  /** Jump straight to a value (spectators catching up). */
  snap(lp: number) { this.shown = lp; this.draw(lp); this.ghost.style.width = this.bar.style.width; }

  clock(text: string, state: 'run' | 'idle' | 'low') {
    if (!this.clockEl) return;
    this.clockEl.textContent = text;
    this.clockEl.dataset.state = state;
  }

  emote(text: string) {
    const bubble = this.el.querySelector<HTMLElement>('.duel-bubble')!;
    bubble.textContent = text;
    bubble.hidden = false;
    bubble.classList.remove('show');
    void bubble.offsetWidth;
    bubble.classList.add('show');
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = window.setTimeout(() => { bubble.hidden = true; }, 2900);
  }
}

export interface Option { label: string; run: () => void; icon?: IconName; danger?: boolean; primary?: boolean; card?: string | null; hover?: () => void; disabled?: boolean }

export const btnHtml = (label: string, o: { icon?: IconName; danger?: boolean; primary?: boolean; small?: boolean; card?: string | null; cls?: string } = {}) =>
  `<button type="button" class="mp-btn duel-btn ${o.primary ? 'primary' : ''} ${o.danger ? 'danger' : ''} ${o.small ? 'small' : ''} ${o.cls ?? ''}">${o.card !== undefined ? `<span class="duel-btn-card">${cardHtml(o.card, '', true)}</span>` : o.icon ? icon(o.icon, 'size-[1.1em]') : ''}<span class="duel-btn-label">${esc(label)}</span></button>`;

export function makeButton(label: string, run: () => void, o: Parameters<typeof btnHtml>[1] = {}) {
  const b = html<HTMLButtonElement>(btnHtml(label, o));
  b.onclick = (event) => { event.stopPropagation(); run(); };
  return b;
}

export class Hud {
  readonly el: HTMLElement;
  /** The area over the board, right of the sidebar or between the plates; dialogs centre in it. */
  readonly play: HTMLElement;
  readonly plates: Plate[] = [];
  readonly info: ReturnType<typeof cardInfo> | null;
  readonly menuButton: HTMLButtonElement;
  private sidebar: HTMLElement | null = null;
  private topBar: HTMLElement | null = null;
  private bottomBar: HTMLElement | null = null;
  dialog: HTMLElement | null = null;
  overlay: HTMLElement | null = null;
  popover: HTMLElement | null = null;
  strip: HTMLElement | null = null;
  private returnPill: HTMLElement | null = null;
  onInsetsChanged = () => {};

  constructor(host: HTMLElement, readonly portrait: boolean, me: Side, looks: [PlateLook, PlateLook], startingLP: number) {
    this.el = html('<div class="duel-hud"></div>');
    this.play = html('<div class="duel-play"></div>');
    this.menuButton = html<HTMLButtonElement>(`<button type="button" class="mp-icon duel-menu-btn" aria-label="${esc(t('Menu'))}">${icon('more', 'size-6')}</button>`);
    // looks[0] is the near player (`me`), looks[1] the far one
    const near = new Plate(looks[0], startingLP, true), far = new Plate(looks[1], startingLP, false);
    this.plates[me] = near;
    this.plates[me === 0 ? 1 : 0] = far;
    if (portrait) {
      this.info = null;
      this.topBar = html('<div class="duel-bar top"></div>');
      this.bottomBar = html('<div class="duel-bar bottom"></div>');
      this.topBar.append(this.menuButton, far.el);
      this.bottomBar.append(near.el);
      this.el.append(this.topBar, this.bottomBar, this.play);
    } else {
      this.info = cardInfo(t('Hover over a card to see its details.'), 'stack');
      this.sidebar = html('<aside class="duel-side"><div class="duel-side-info"></div><div class="duel-side-foot"></div></aside>');
      this.sidebar.querySelector('.duel-side-info')!.append(this.info.el);
      this.sidebar.prepend(far.el);
      this.sidebar.querySelector('.duel-side-foot')!.append(near.el, this.menuButton);
      this.el.append(this.sidebar, this.play);
    }
    host.append(this.el);
    const observer = new ResizeObserver(() => { this.layoutPlay(); this.onInsetsChanged(); });
    for (const bar of [this.sidebar, this.topBar, this.bottomBar]) if (bar) observer.observe(bar);
    this.dispose = () => observer.disconnect();
    this.layoutPlay();
  }
  dispose = () => {};

  insets(): Insets {
    if (this.portrait) return { left: 0, right: 0, top: this.topBar?.offsetHeight ?? 0, bottom: this.bottomBar?.offsetHeight ?? 0 };
    return { left: this.sidebar?.offsetWidth ?? 0, right: 0, top: 0, bottom: 0 };
  }

  private layoutPlay() {
    const inset = this.insets();
    Object.assign(this.play.style, { left: `${inset.left}px`, top: `${inset.top}px`, right: `${inset.right}px`, bottom: `${inset.bottom}px` });
  }

  showCard(def: CardDef | null, info: PanelInfo = {}) { this.info?.show(def, info); }

  private watchEl: HTMLElement | null = null;
  /** The number of spectators; hidden while nobody watches (a spectator always counts at least themself). */
  watchers(n: number, spectating: boolean) {
    const count = spectating ? Math.max(1, n) : n;
    if (!this.watchEl) {
      this.watchEl = html(`<div class="duel-watchers"></div>`);
      this.play.append(this.watchEl);
    }
    this.watchEl.hidden = count === 0;
    this.watchEl.title = t('{n} watching', { n: count });
    this.watchEl.setAttribute('aria-label', this.watchEl.title);
    this.watchEl.innerHTML = `${icon('eye', 'size-4')}<b>${num(count)}</b>`;
  }

  /** A layer in the play area; `modal` dims the board and takes every press. */
  private layer(kind: string, modal: boolean, dim = 0.4) {
    const layer = html(`<div class="duel-layer ${kind} ${modal ? 'modal' : ''}" style="--dim:${dim}"></div>`);
    this.play.append(layer);
    return layer;
  }

  /** Replace the open prompt. */
  openDialog(content: HTMLElement, o: { modal?: boolean; dim?: number; inspect?: boolean } = {}) {
    this.closeDialog();
    const layer = this.layer('dialog', o.modal ?? true, o.dim);
    layer.append(content);
    if (o.inspect) layer.append(makeButton(t('Inspect field'), () => this.minimize(true), { icon: 'eye', small: true, cls: 'duel-inspect' }));
    this.dialog = layer;
    return layer;
  }

  closeDialog() {
    this.returnPill?.remove();
    this.returnPill = null;
    this.dialog?.remove();
    this.dialog = null;
  }

  get minimized() { return !!this.returnPill; }

  /** Hide the prompt to look at the board, with a pill to bring it back. */
  minimize(on: boolean) {
    if (!this.dialog) return;
    if (on) {
      this.dialog.hidden = true;
      this.returnPill = makeButton(t('Return to prompt'), () => this.minimize(false), { primary: true, icon: 'back', cls: 'duel-return' });
      this.play.append(this.returnPill);
    } else {
      this.closePopover();
      this.returnPill?.remove();
      this.returnPill = null;
      this.dialog.hidden = false;
    }
  }

  /** A full overlay (menu, piles, log, end screen) over any prompt. */
  openOverlay(content: HTMLElement, dim = 0.6, closeOnBackdrop = true) {
    this.closeOverlay();
    const layer = this.layer('overlay', true, dim);
    layer.append(content);
    if (closeOnBackdrop) layer.addEventListener('pointerdown', (event) => { if (event.target === layer) this.closeOverlay(); });
    this.overlay = layer;
    return layer;
  }

  closeOverlay() { this.overlay?.remove(); this.overlay = null; }

  /** A strip along the top of the board (field targeting, zone choice): the board stays playable under it. */
  openStrip(content: HTMLElement) {
    this.closeStrip();
    const layer = this.layer('strip', false);
    layer.append(content);
    this.strip = layer;
    return layer;
  }
  closeStrip() { this.strip?.remove(); this.strip = null; }

  /** A small menu of actions beside a point on the screen (CSS px). */
  openPopover(items: Option[], at: { x: number; y: number; above: boolean }, onClose?: () => void) {
    this.closePopover();
    this.popoverClosed = onClose;
    const backdrop = html('<div class="duel-pop-back"></div>');
    const menu = html(`<div class="duel-pop" role="menu"></div>`);
    items.forEach((item, index) => {
      const b = makeButton(item.label, () => { item.run(); this.closePopover(); }, { icon: item.icon, danger: item.danger, primary: index === 0 && items.length > 1 && !item.danger && item.icon !== 'info' });
      b.setAttribute('role', 'menuitem');
      b.style.animationDelay = `${index * 28}ms`;
      menu.append(b);
    });
    // only a press that starts on the backdrop closes it: lifting the finger of the long press that opened it does not
    backdrop.addEventListener('pointerdown', (event) => { if (event.target !== backdrop) return; event.preventDefault(); this.closePopover(); });
    backdrop.append(menu);
    this.el.append(backdrop);
    const rect = menu.getBoundingClientRect();
    const x = Math.max(8, Math.min(innerWidth - rect.width - 8, at.x - rect.width / 2));
    const y = at.above ? at.y - rect.height - 10 : at.y + 10;
    menu.style.left = `${x}px`;
    menu.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, y))}px`;
    this.popover = backdrop;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }
  private popoverClosed?: () => void;
  closePopover() {
    this.popover?.remove();
    this.popover = null;
    const closed = this.popoverClosed;
    this.popoverClosed = undefined;
    closed?.();
  }

  /** Anything open that takes the board's presses? */
  get busy() { return !!(this.overlay || this.popover || (this.dialog && !this.dialog.hidden && this.dialog.classList.contains('modal'))); }

  destroy() { this.dispose(); this.el.remove(); }
}

/** A titled panel for prompts and menus. */
export function panel(title: string, body = '', cls = '') {
  return html(`<section class="duel-panel ${cls}" role="dialog" aria-label="${esc(title)}">
    ${title ? `<header class="duel-panel-head"><h2>${esc(title)}</h2></header>` : ''}
    ${body ? `<p class="duel-panel-body">${esc(body)}</p>` : ''}
  </section>`);
}
