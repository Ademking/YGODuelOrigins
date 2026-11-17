// Small DOM toolkit shared by every screen: HTML building, the screen router, dialogs, and card images.
import { cardImagePasscode } from '../data/cardImages';
import { t } from '../i18n';
import { sfx } from '../ui/sfx';

export const esc = (value: unknown) => String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** One element from an HTML string. */
export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as T;
}

export const $ = <T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string) => root.querySelector<T>(selector)!;
export const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, Math.max(0, ms)));
export const reducedMotionPreferred = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer = () => window.matchMedia('(pointer: coarse)').matches;

// ---------------------------------------------------------------- router
/** A screen draws into `root` and may return a cleanup run when the player leaves it. */
export type Screen<T = never> = (root: HTMLElement, data: T) => (() => void) | void;
const SCREENS = {
  Title: () => import('./screens/title'),
  Setup: () => import('./screens/setup'),
  Watch: () => import('./screens/watch'),
  DeckEditor: () => import('./screens/deck'),
  Debug: () => import('./screens/debug'),
  Multiplayer: () => import('./screens/lobby'),
  Duel: () => import('./screens/duel'),
};
export type ScreenName = keyof typeof SCREENS;
let leave: (() => void) | void;
let navigation = 0;

/** Show another screen. Screens are separate chunks, so the title loads without the duel or the deck editor. */
export async function go(name: ScreenName, data?: unknown) {
  const id = ++navigation;
  const screen = (await SCREENS[name]()).default as Screen<unknown>;
  if (id !== navigation) return;
  try { leave?.(); } catch (error) { console.error(error); }
  leave = undefined;
  document.querySelectorAll('body > dialog, body > .overlay').forEach((node) => node.remove());
  const root = document.getElementById('app')!;
  root.replaceChildren();
  root.scrollTop = 0;
  leave = screen(root, data as never);
}

// every enabled button clicks
document.addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest?.('.mp-btn:not(:disabled), [data-click]')) sfx.click();
});
// a card image that fails to load leaves the card back showing
document.addEventListener('error', (event) => {
  const target = event.target as HTMLElement;
  if (target instanceof HTMLImageElement && target.parentElement?.classList.contains('card')) target.remove();
}, true);

// ---------------------------------------------------------------- dialogs
/** A modal sheet; resolves with the typed text (input), true (ok), false (cancel) or null (dismissed). */
export function modal(o: { title: string; text?: string; input?: string; ok: string; cancel?: string; danger?: boolean }): Promise<string | boolean | null> {
  return new Promise((resolve) => {
    const dialog = html<HTMLDialogElement>(`<dialog autofocus class="mp-modal"><form method="dialog" class="mp-sheet">
      <h2 class="!whitespace-normal">${esc(o.title)}</h2>
      ${o.text ? `<p>${esc(o.text)}</p>` : '<div class="h-4"></div>'}
      ${o.input !== undefined ? `<input class="mp-field mb-5" maxlength="40" value="${esc(o.input)}">` : ''}
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" value="cancel" class="mp-btn">${esc(o.cancel ?? t('Cancel'))}</button>
        <button class="mp-btn ${o.danger ? 'danger' : 'primary'}">${esc(o.ok)}</button>
      </div></form></dialog>`);
    const input = dialog.querySelector('input');
    let result: string | boolean | null = null;
    dialog.querySelector('form')!.onsubmit = (event) => {
      if (input) {
        const value = input.value.trim();
        if (!value) { event.preventDefault(); input.focus(); return; }
        result = value;
      } else result = true;
    };
    dialog.querySelector<HTMLButtonElement>('button[value=cancel]')!.onclick = () => { result = false; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    document.body.append(dialog);
    dialog.showModal();
    input?.select();
  });
}

/** Pick one entry from a list; resolves with its index, or null when dismissed. */
export function chooseFromList(title: string, options: readonly string[], selected: number): Promise<number | null> {
  return new Promise((resolve) => {
    const dialog = html<HTMLDialogElement>(`<dialog autofocus class="mp-modal"><div class="mp-sheet">
      <h2>${esc(title)}</h2>
      <div class="mp-scroll mt-4 flex max-h-[60svh] flex-col gap-1.5">${options.map((option, index) =>
        `<button data-i="${index}" class="mp-btn !justify-start text-left ${index === selected ? 'on' : ''}">${esc(option)}</button>`).join('')}</div>
      <div class="mt-4 flex justify-end"><button class="mp-btn" data-close>${esc(t('Close'))}</button></div>
    </div></dialog>`);
    let result: number | null = null;
    dialog.onclick = (event) => {
      const target = event.target as HTMLElement;
      const pick = target.closest<HTMLElement>('[data-i]');
      if (pick) { result = Number(pick.dataset.i); dialog.close(); } else if (target.closest('[data-close]') || target === dialog) dialog.close();
    };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    document.body.append(dialog);
    dialog.showModal();
    dialog.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'center' });
  });
}

/** An info sheet that closes on its button, Escape or a click outside. Returns the dialog so callers can add to it. */
export function sheet(title: string, body: string, width = 'w-[min(640px,calc(100vw-24px))]') {
  const dialog = html<HTMLDialogElement>(`<dialog autofocus class="mp-modal ${width}"><div class="mp-sheet">
    <div class="flex items-start gap-3"><h2 class="flex-1">${esc(title)}</h2>
    <button class="mp-icon !size-9 text-base focus-visible:outline-2" data-close aria-label="${esc(t('Close'))}"><svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="mt-4">${body}</div></div></dialog>`);
  dialog.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === dialog || target.closest('[data-close]')) dialog.close();
  });
  dialog.addEventListener('close', () => dialog.remove());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}

// ---------------------------------------------------------------- cards
const BASE: string = import.meta.env.VITE_CARD_IMAGE_BASE ?? 'https://wsrv.nl/?url=images.ygoprodeck.com/images/cards/';
// ponytail: the default image proxy resizes and re-encodes; a custom base is used as is.
const SIZED = BASE.includes('wsrv.nl') ? '&w=320&output=webp' : '';

/** URL of a card's artwork, or '' for cards without one (they show the card back). */
export function cardSrc(id: string) {
  const pass = cardImagePasscode(id);
  return pass ? `${BASE}${pass}.jpg${SIZED}` : '';
}

/** A card face (art over the card back, which shows while it loads or if it fails). */
export function cardHtml(id: string | null, className = '', eager = false) {
  const src = id ? cardSrc(id) : '';
  return `<div class="card ${className}">${src ? `<img src="${esc(src)}" alt="" draggable="false" decoding="async"${eager ? '' : ' loading="lazy"'}>` : ''}</div>`;
}

/** Warm the browser cache with these cards' art. */
export function prefetchCards(ids: Iterable<string>) {
  for (const id of new Set(ids)) {
    const src = cardSrc(id);
    if (src) { const image = new Image(); image.decoding = 'async'; image.src = src; }
  }
}

/** Header used by the menu screens: back button and title. */
export function header(title: string, back: () => void, extra = '') {
  const node = html(`<header class="sticky top-0 z-20 -mx-4 flex items-center gap-3 bg-void/90 px-4 pt-[calc(env(safe-area-inset-top)+12px)] pb-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-6 sm:backdrop-blur-none">
    <button class="mp-btn small sm:h-11 sm:px-4 sm:text-sm" data-back aria-label="${esc(t('Back'))}"><svg viewBox="0 0 24 24" class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg><span class="hidden sm:inline">${esc(t('Back'))}</span></button>
    <h1 class="min-w-0 flex-1 truncate font-display text-base text-brass-txt sm:text-2xl">${esc(title)}</h1>${extra}</header>`);
  node.querySelector<HTMLButtonElement>('[data-back]')!.onclick = back;
  return node;
}
