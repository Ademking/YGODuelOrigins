import { CARDS, copyLimit, getCard, isExtraDeckCard, NO_DUEL_DATA } from '../../ocgcore/catalog';
import { loadDecks, saveDecks, selectedDeck, setSelectedDeck, validateDeck } from '../../data/decks';
import type { DeckList } from '../../engine/duel';
import type { Attr, CardDef, Race } from '../../engine/types';
import { sfx } from '../../ui/sfx';
import { num, t } from '../../i18n';
import { cardName, matchesTranslated } from '../../i18n/cards';
import { $, cardHtml, chooseFromList, coarsePointer, esc, go, html, modal, shieldFromCanvas, type Screen } from '../dom';
import { parseDeck, shareLink, toYdk, toYdke } from '../../data/deckCodes';
import { cardInfo, showCardSheet } from '../cardInfo';
import { icon, type IconName } from '../icons';

const ATTRS: (Attr | 'Any')[] = ['Any', 'DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const RACES: (Race | 'Any')[] = ['Any', ...[...new Set(CARDS.filter((c) => c.race).map((c) => c.race!))].sort()];
const LEVELS = ['Any', '1-4', '5-6', '7+'];
const MTYPES = ['Any', 'Normal', 'Effect', 'Ritual', 'Fusion'];
const SORTS = ['Name', 'ATK', 'DEF', 'Level', 'Type'];
const KIND_ORDER = { monster: 0, spell: 1, trap: 2 };
/**
 * The banlist mark on a card's top-right corner, as on the cards: a red no-entry sign for Forbidden, a yellow 1 or 2
 * for Limited and Semi-Limited. Nothing for cards allowed at 3.
 */
function limitBadge(limit: number) {
  if (limit >= 3) return '';
  const label = t(limit === 0 ? 'Forbidden' : limit === 1 ? 'Limited' : 'Semi-Limited');
  const mark = limit === 0
    ? '<circle cx="12" cy="12" r="6.6" fill="none" stroke="#e8242f" stroke-width="2.6"/><path d="M7.4 7.4 16.6 16.6" stroke="#e8242f" stroke-width="2.6"/>'
    : `<text x="12" y="16.9" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14.5" font-weight="900" fill="#ffd42a">${limit}</text>`;
  return `<span class="pointer-events-none absolute -top-[3%] -right-[5%] z-10 w-[34%] min-w-3.5 max-w-8 drop-shadow-[0_1px_2px_#000c]" role="img" aria-label="${esc(label)}" title="${esc(label)}">`
    + `<svg viewBox="0 0 24 24" class="block w-full"><circle cx="12" cy="12" r="11" fill="#0b0b0f" stroke="#ffd42a" stroke-width="1.4"/>${mark}</svg></span>`;
}

const RATIO = 86 / 59; // card height / width
/** Columns and card width that fit `n` cards into a w x h box with the largest cards. */
function fit(n: number, w: number, h: number, gap: number) {
  let best = { cols: 1, cw: 0 };
  for (let cols = 1; cols <= Math.min(n, 20); cols++) {
    const rows = Math.ceil(n / cols);
    const cw = Math.min((w - (cols - 1) * gap) / cols, (h - (rows - 1) * gap) / rows / RATIO);
    if (cw > best.cw) best = { cols, cw };
  }
  return { cols: best.cols, cw: Math.floor(best.cw) };
}

const sorted = (ids: string[]) => [...ids].sort((a, b) => {
  const ca = getCard(a), cb = getCard(b);
  return KIND_ORDER[ca.kind] - KIND_ORDER[cb.kind] || (cb.lv ?? 0) - (ca.lv ?? 0) || ca.name.localeCompare(cb.name);
});

/** Paste a deck code, link or .ydk text, or pick a .ydk file. Resolves with the text and file name, or null. */
function askDeckText(): Promise<{ text: string; file?: string } | null> {
  return new Promise((resolve) => {
    const dialog = html<HTMLDialogElement>(`<dialog class="mp-modal"><form method="dialog" class="mp-sheet">
      <h2>${esc(t('Import deck'))}</h2>
      <p>${esc(t('Paste a deck code (ydke://), a share link or the text of a .ydk file, or choose a .ydk file.'))}</p>
      <textarea class="mp-field mb-4 !h-28 w-full resize-none !py-2 font-mono text-xs" spellcheck="false" autocomplete="off" aria-label="${esc(t('Import deck'))}"></textarea>
      <input type="file" accept=".ydk,text/plain" hidden>
      <div class="flex flex-wrap justify-end gap-2">
        <button type="button" class="mp-btn mr-auto max-sm:w-full" data-file>${icon('deck', 'size-4')}<span>${esc(t('Choose .ydk file'))}</span></button>
        <button type="button" value="cancel" class="mp-btn">${esc(t('Cancel'))}</button>
        <button class="mp-btn primary">${esc(t('Import'))}</button>
      </div></form></dialog>`);
    const area = dialog.querySelector('textarea')!, picker = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
    let result: { text: string; file?: string } | null = null;
    dialog.querySelector('form')!.onsubmit = (event) => {
      if (!area.value.trim()) { event.preventDefault(); area.focus(); return; }
      result = { text: area.value };
    };
    dialog.querySelector<HTMLButtonElement>('[data-file]')!.onclick = () => picker.click();
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      result = { text: (await file.text()).slice(0, 200_000), file: file.name.replace(/\.ydk$/i, '') };
      dialog.close();
    };
    dialog.querySelector<HTMLButtonElement>('button[value=cancel]')!.onclick = () => { result = null; dialog.close(); };
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    document.body.append(shieldFromCanvas(dialog));
    dialog.showModal();
    area.focus();
  });
}

/** Copy text, or show it to copy by hand where the browser refuses. */
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { prompt(t('Copy this:'), text); return false; }
}

const deckEditor: Screen<{ createNew?: boolean; returnTo?: string; importCode?: string } | undefined> = (root, data = {}) => {
  const decks = loadDecks();
  let name = Object.keys(decks).includes(selectedDeck()) ? selectedDeck() : Object.keys(decks)[0];
  let deck: DeckList = structuredClone(decks[name]);
  let dirty = false;
  const returnTo = data.returnTo === 'Setup' ? 'Setup' : 'Title';
  const filter = { kind: 'all', mtype: 0, attr: 0, race: 0, level: 0, sort: 0, q: '' };
  let tab: 'deck' | 'pool' = data.createNew ? 'pool' : 'deck';

  const select = (label: string, values: readonly string[], key: 'mtype' | 'attr' | 'race' | 'level' | 'sort', show = (v: string) => t(v)) =>
    `<label class="relative min-w-0"><span class="sr-only">${esc(label)}</span>
      <select data-filter="${key}" class="h-9 w-full cursor-pointer appearance-none truncate rounded-lg border border-white/10 bg-field/80 pr-6 pl-2.5 text-xs text-ink outline-none focus:border-glow/70">
        ${values.map((value, index) => `<option value="${index}">${esc(index ? show(value) : `${label}: ${t('Any')}`)}</option>`).join('')}</select>
      <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-brass-txt">▾</span></label>`;

  const iconBtn = (act: string, name: IconName, label: string, extra = '') =>
    `<button class="mp-icon !size-10 ${extra}" data-act="${act}" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;
  root.className = 'app-bg fixed inset-0 overflow-hidden';
  root.innerHTML = `<div class="mx-auto flex h-full w-full max-w-[1800px] flex-col gap-2 px-2 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(env(safe-area-inset-bottom)+8px)] sm:gap-3 sm:px-4 sm:pt-4 sm:pb-4">
    <header class="flex items-center gap-1.5 sm:gap-2">
      <button class="mp-btn !h-10 !px-3 sm:!px-4" data-act="back" aria-label="${esc(t('Back'))}">${icon('arrowLeft', 'size-5')}<span class="max-sm:hidden">${esc(t('Back'))}</span></button>
      <div class="flex h-10 min-w-0 flex-1 items-center border border-white/10 bg-panel/90">
        <button class="grid h-full w-9 flex-none place-items-center text-dim hover:text-brass-lit" data-act="prev" aria-label="${esc(t('Previous'))}">${icon('prev', 'size-4')}</button>
        <button class="flex h-full min-w-0 flex-1 items-center justify-center gap-1.5 px-1 font-display text-sm text-brass-txt hover:bg-white/5 sm:text-base" data-act="pick"><span class="truncate" data-name></span>${icon('down', 'size-4 text-dim')}</button>
        <button class="grid h-full w-9 flex-none place-items-center text-dim hover:text-brass-lit" data-act="next" aria-label="${esc(t('Next'))}">${icon('next', 'size-4')}</button>
      </div>
      <div class="flex gap-1.5 max-sm:hidden">${iconBtn('new', 'plus', t('New'))}${iconBtn('import', 'import', t('Import deck'))}${iconBtn('export', 'share', t('Export deck'))}${iconBtn('rename', 'rename', t('Rename'))}${iconBtn('clear', 'clear', t('Clear'))}${iconBtn('delete', 'trash', t('Delete'), 'text-bad hover:!border-hot')}</div>
      <button class="mp-icon !size-10 sm:hidden" data-act="more" aria-label="${esc(t('Menu'))}">${icon('more')}</button>
      <button class="mp-btn primary !h-10 !px-3 sm:!px-4" data-act="save">${icon('save', 'size-4')}<span class="max-sm:hidden">${esc(t('Save'))}</span></button>
    </header>
    <p class="-my-0.5 truncate text-center text-xs" data-status role="status"></p>
    <div class="grid grid-cols-2 gap-1.5 lg:hidden" role="tablist">
      <button class="mp-btn small" role="tab" data-tab="deck"></button><button class="mp-btn small" role="tab" data-tab="pool">${icon('search', 'size-4')}${esc(t('Card List'))}</button>
    </div>
    <div class="grid min-h-0 flex-1 gap-2 sm:gap-3 lg:grid-cols-[230px_minmax(0,1.15fr)_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1.15fr)_minmax(0,1fr)]">
      <aside class="mp-panel overflow-hidden p-3 max-lg:hidden" data-info></aside>
      <section class="mp-panel" data-deck>
        <p class="flex-none border-b border-white/[.07] px-3 py-2 font-display text-[11px] tracking-wide text-brass-txt" data-stats></p>
        <div class="min-h-0 flex-1 p-2" data-main-box><div class="grid h-full content-center justify-center gap-1" data-main></div></div>
        <div class="flex-none border-t border-white/[.07] px-2 pt-1.5 pb-2" data-extra-box><p class="eyebrow mb-1">${esc(t('Fusion Deck'))} <span data-fcount></span></p>
          <div class="grid gap-1" data-extra></div></div>
      </section>
      <section class="mp-panel @container" data-pool>
        <div class="grid flex-none gap-1.5 border-b border-white/[.07] p-2">
          <label class="relative block"><span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-dim">${icon('search', 'size-4')}</span>
            <input class="mp-field !h-10 !pl-9" type="search" placeholder="${esc(t('Search name or text…'))}" aria-label="${esc(t('Search name or text…'))}" data-q></label>
          <div class="grid grid-cols-4 gap-1">${['all', 'monster', 'spell', 'trap'].map((kind) => `<button class="mp-btn small !h-8 !px-1" data-kind="${kind}">${esc(t(kind === 'all' ? 'All' : kind[0].toUpperCase() + kind.slice(1)))}</button>`).join('')}</div>
          <div class="grid grid-cols-3 gap-1 @lg:grid-cols-5">${select(t('Card'), MTYPES, 'mtype')}${select(t('Attr'), ATTRS, 'attr', (v) => v)}${select(t('Lv'), LEVELS, 'level')}${select(t('Type'), RACES, 'race')}${select(t('Sort'), SORTS, 'sort')}</div>
        </div>
        <div class="min-h-0 flex-1 touch-pan-y p-2" data-pool-box><div class="grid content-start justify-center gap-1.5" data-grid></div></div>
        <footer class="flex flex-none items-center gap-2 border-t border-white/[.07] px-2 py-1.5">
          <button class="mp-icon !size-9" data-page="-1" aria-label="${esc(t('Previous'))}">${icon('prev', 'size-4')}</button>
          <p class="min-w-0 flex-1 truncate text-center text-xs text-dim"><span data-total></span> <span class="text-faint" data-pages></span></p>
          <button class="mp-icon !size-9" data-page="1" aria-label="${esc(t('Next'))}">${icon('next', 'size-4')}</button>
        </footer>
      </section>
    </div></div>`;
  // listeners go on the screen's own element: #app is shared by every screen and outlives this one
  const screen = root.firstElementChild as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => $<T>(root, selector);
  const info = cardInfo(t('Hover over a card to see its details.'), 'stack');
  info.el.classList.add('h-full');
  q('[data-info]').append(info.el);
  const status = q('[data-status]');
  let flashTimer = 0;

  const count = (id: string) => [...deck.main, ...deck.extra].filter((x) => x === id).length;
  const refreshStatus = () => {
    const errors = validateDeck(deck);
    status.textContent = errors.length ? `⚠ ${errors[0]}${errors.length > 1 ? ` ${t('(+{n} more)', { n: errors.length - 1 })}` : ''}` : `✔ ${t('Deck is legal')}`;
    status.className = `-mt-1 truncate text-center text-xs ${errors.length ? 'text-[#ffb070]' : 'text-ok'}`;
    q('[data-name]').textContent = `${name}${dirty ? ' *' : ''}`;
  };
  const flash = (message: string, good = false) => {
    status.textContent = message;
    status.className = `-mt-1 truncate text-center text-xs ${good ? 'text-ok' : 'text-bad'}`;
    clearTimeout(flashTimer);
    flashTimer = window.setTimeout(refreshStatus, 1600);
  };
  const tile = (id: string, from: 'pool' | 'main' | 'extra') =>
    `<button class="group relative block w-full touch-manipulation text-left" data-id="${id}" data-from="${from}" draggable="true" title="${esc(cardName(getCard(id)))}">${cardHtml(id, 'transition duration-150 group-hover:-translate-y-0.5 group-hover:ring-1 group-hover:ring-brass/70')}${limitBadge(copyLimit(getCard(id)))}${from === 'pool' ? '<span data-badge class="absolute right-0.5 bottom-0.5 bg-void/90 px-1 py-px font-display text-[10px] font-bold"></span>' : ''}</button>`;

  const renderDeck = () => {
    const main = sorted(deck.main), extra = sorted(deck.extra);
    const kind = (k: string) => deck.main.filter((id) => getCard(id).kind === k).length;
    q('[data-stats]').textContent = t('MAIN {main}  ·  MONSTERS {monsters}  ·  SPELLS {spells}  ·  TRAPS {traps}', { main: main.length, monsters: kind('monster'), spells: kind('spell'), traps: kind('trap') });
    const box = q('[data-main-box]'), gap = 4;
    const { cols, cw } = fit(Math.max(main.length, 40), box.clientWidth - 16, box.clientHeight - 16, gap);
    const grid = q('[data-main]');
    grid.style.gridTemplateColumns = main.length ? `repeat(${cols}, ${cw}px)` : '';
    grid.innerHTML = main.map((id) => tile(id, 'main')).join('') || `<p class="py-10 text-center text-sm text-dim">${esc(t('Deck created. Add cards from the right.'))}</p>`;
    // the Fusion Deck: one row of up to 15, no larger than the main deck's cards
    const ew = Math.max(8, Math.min(cw, Math.floor((q('[data-extra-box]').clientWidth - 16 - 14 * gap) / 15)));
    const extraGrid = q('[data-extra]');
    extraGrid.style.gridTemplateColumns = `repeat(15, ${ew}px)`;
    extraGrid.style.minHeight = `${Math.round(ew * RATIO)}px`;
    extraGrid.innerHTML = extra.map((id) => tile(id, 'extra')).join('');
    q('[data-fcount]').textContent = `(${extra.length})`;
    q('[data-tab=deck]').innerHTML = `${icon('deck', 'size-4')}${esc(`${t('Deck')} (${main.length}${extra.length ? ` + ${extra.length}` : ''})`)}`;
    refreshStatus();
  };

  const poolCards = (): CardDef[] => {
    const level = LEVELS[filter.level];
    const list = CARDS.filter((c) => {
      if (NO_DUEL_DATA.has(c.id)) return false;
      if (filter.kind !== 'all' && c.kind !== filter.kind) return false;
      if (filter.mtype && (c.kind !== 'monster' || c.mtype !== MTYPES[filter.mtype].toLowerCase())) return false;
      if (filter.attr && c.attr !== ATTRS[filter.attr]) return false;
      if (filter.race && c.race !== RACES[filter.race]) return false;
      if (level !== 'Any') {
        if (c.kind !== 'monster') return false;
        if (level === '1-4' && c.lv! > 4) return false;
        if (level === '5-6' && (c.lv! < 5 || c.lv! > 6)) return false;
        if (level === '7+' && c.lv! < 7) return false;
      }
      // English or translated name/text both match, so players can search in either
      return !filter.q || c.name.toLowerCase().includes(filter.q) || c.text.toLowerCase().includes(filter.q) || matchesTranslated(c, filter.q);
    });
    const sort = SORTS[filter.sort];
    const key = (a: CardDef, b: CardDef) => sort === 'ATK' ? (b.atk ?? -1) - (a.atk ?? -1)
      : sort === 'DEF' ? (b.def ?? -1) - (a.def ?? -1)
        : sort === 'Level' ? (b.lv ?? 0) - (a.lv ?? 0)
          : sort === 'Type' ? KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.mtype ?? a.stype ?? '').localeCompare(b.mtype ?? b.stype ?? '') : 0;
    return list.sort((a, b) => key(a, b) || a.name.localeCompare(b.name));
  };
  let pool: CardDef[] = [], page = 0, perPage = 1;
  const badge = (button: HTMLElement) => {
    const id = button.dataset.id!, n = count(id), limit = copyLimit(getCard(id));
    const el = button.querySelector<HTMLElement>('[data-badge]');
    if (!el) return; // only Card List tiles carry a count
    // hidden while it would only say 0/3
    el.hidden = !n && limit >= 3;
    el.textContent = `${n}/${limit}`;
    el.style.color = n >= limit ? '#ff9a7a' : n ? '#f0d08a' : '#a39cb8';
  };
  const refreshBadges = () => q('[data-grid]').querySelectorAll<HTMLElement>('[data-id]').forEach(badge);
  /** One page of the list: as many cards as fit the panel, about 92px wide (78px on narrow panels). */
  const drawPage = () => {
    const box = q('[data-pool-box]'), grid = q('[data-grid]'), gap = 6;
    const w = box.clientWidth - 16, h = box.clientHeight - 16;
    if (w <= 0 || h <= 0) return; // hidden tab: drawn when it shows
    const cols = Math.max(3, Math.floor((w + gap) / ((w < 520 ? 78 : 92) + gap)));
    const wide = (w - (cols - 1) * gap) / cols;
    // round to the nearest row count, then shrink the cards a little so those rows fill the height exactly
    const rows = Math.max(1, Math.round((h + gap) / (wide * RATIO + gap)));
    const cw = Math.floor(Math.min(wide, (h - (rows - 1) * gap) / rows / RATIO));
    const first = page * perPage;
    perPage = cols * rows;
    const pages = Math.max(1, Math.ceil(pool.length / perPage));
    page = Math.min(Math.floor(first / perPage), pages - 1);
    grid.style.gridTemplateColumns = `repeat(${cols}, ${cw}px)`;
    grid.innerHTML = pool.length ? pool.slice(page * perPage, (page + 1) * perPage).map((card) => tile(card.id, 'pool')).join('')
      : `<p class="col-span-full py-10 text-center text-dim">${esc(t('No cards match.'))}</p>`;
    refreshBadges();
    q('[data-pages]').textContent = pages > 1 ? `· ${page + 1} / ${pages}` : '';
    q<HTMLButtonElement>('[data-page="-1"]').disabled = page === 0;
    q<HTMLButtonElement>('[data-page="1"]').disabled = page >= pages - 1;
  };
  const turn = (step: number) => {
    const next = Math.max(0, Math.min(page + step, Math.ceil(pool.length / perPage) - 1));
    if (next !== page) { page = next; drawPage(); }
  };
  const renderPool = () => {
    pool = poolCards();
    page = 0;
    q('[data-total]').textContent = pool.length === 1 ? t('1 card') : t('{n} cards', { n: num(pool.length) });
    root.querySelectorAll<HTMLElement>('[data-kind]').forEach((button) => button.classList.toggle('on', button.dataset.kind === filter.kind));
    drawPage();
  };
  root.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((button) => { button.onclick = () => turn(Number(button.dataset.page)); });
  // the wheel and a sideways swipe turn pages too
  const poolBox = q('[data-pool-box]');
  let wheelAt = 0;
  poolBox.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (Math.abs(event.deltaY) < 4 || performance.now() - wheelAt < 180) return;
    wheelAt = performance.now();
    turn(Math.sign(event.deltaY));
  }, { passive: false });
  let swipeX = 0, swiped = false;
  screen.addEventListener('pointerdown', (event) => { swipeX = event.clientX; swiped = false; }, true);
  poolBox.addEventListener('pointerup', (event) => {
    const dx = event.clientX - swipeX;
    if (event.pointerType !== 'mouse' && Math.abs(dx) > 50) { swiped = true; turn(dx < 0 ? 1 : -1); }
  });
  // cards and pages follow the panels' size
  // a resize can be delivered after the screen's elements left the page: nothing to lay out then
  const resized = new ResizeObserver(() => { if (screen.isConnected) { renderDeck(); drawPage(); } });
  resized.observe(q('[data-main-box]'));
  resized.observe(poolBox);

  const showTab = (next: 'deck' | 'pool') => {
    tab = next;
    q('[data-deck]').classList.toggle('max-lg:hidden', tab !== 'deck');
    q('[data-pool]').classList.toggle('max-lg:hidden', tab !== 'pool');
    root.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => { button.classList.toggle('on', button.dataset.tab === tab); button.setAttribute('aria-selected', String(button.dataset.tab === tab)); });
  };
  const touch = () => { dirty = true; renderDeck(); refreshBadges(); };
  const add = (id: string) => {
    const card = getCard(id);
    if (count(id) >= copyLimit(card)) { sfx.deny(); flash(t('{card}: limit {limit}', { card: cardName(card), limit: copyLimit(card) })); return; }
    const list = isExtraDeckCard(card) ? deck.extra : deck.main;
    if (list.length >= (isExtraDeckCard(card) ? 15 : 60)) { sfx.deny(); flash(isExtraDeckCard(card) ? t('Fusion Deck is full (15)') : t('Main Deck is full (60)')); return; }
    list.push(id);
    sfx.set();
    touch();
  };
  const remove = (id: string) => {
    const list = isExtraDeckCard(getCard(id)) ? deck.extra : deck.main;
    const index = list.lastIndexOf(id);
    if (index < 0) return;
    list.splice(index, 1);
    sfx.draw();
    touch();
  };

  // cards: hover shows details; click adds (pool) or removes (deck); right-click on the pool removes a copy
  // dragging selected text starts on a text node, which has no closest()
  const cardOf = (event: Event) => {
    const target = event.target as Node;
    return (target instanceof Element ? target : target.parentElement)?.closest<HTMLElement>('[data-id]') ?? null;
  };
  screen.addEventListener('pointerover', (event) => { const card = cardOf(event); if (card && event.pointerType === 'mouse') info.show(getCard(card.dataset.id!)); });
  // touch: a long press shows a card's details instead of adding or removing it
  let pressTimer = 0, pressed = false;
  screen.addEventListener('pointerdown', (event) => {
    const card = cardOf(event);
    pressed = false;
    clearTimeout(pressTimer);
    if (card && event.pointerType !== 'mouse') pressTimer = window.setTimeout(() => { pressed = true; showCardSheet(getCard(card.dataset.id!)); }, 450);
  });
  screen.addEventListener('pointerup', () => clearTimeout(pressTimer));
  screen.addEventListener('pointercancel', () => clearTimeout(pressTimer));
  screen.addEventListener('pointermove', (event) => { if (Math.abs(event.clientX - swipeX) > 12) clearTimeout(pressTimer); });
  screen.addEventListener('click', (event) => {
    const card = cardOf(event);
    if (!card || pressed || swiped) return;
    info.show(getCard(card.dataset.id!));
    if (card.dataset.from === 'pool') add(card.dataset.id!); else remove(card.dataset.id!);
  });
  screen.addEventListener('contextmenu', (event) => {
    const card = cardOf(event);
    if (!card) return;
    event.preventDefault();
    if (coarsePointer()) return; // a long press: handled on pointerdown
    if (card.dataset.from === 'pool' && !event.shiftKey) remove(card.dataset.id!); else add(card.dataset.id!);
  });
  // drag from the list onto the deck to add; from the deck onto the list to remove
  screen.addEventListener('dragstart', (event) => {
    const card = cardOf(event);
    if (!card || !event.dataTransfer) return;
    event.dataTransfer.setData('text/plain', `${card.dataset.from}:${card.dataset.id}`);
    event.dataTransfer.effectAllowed = 'move';
  });
  for (const [selector, accepts] of [['[data-deck]', 'pool'], ['[data-pool]', 'deck']] as const) {
    const zone = q(selector);
    zone.addEventListener('dragover', (event) => { event.preventDefault(); zone.classList.add('ring-2', 'ring-brass/60'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('ring-2', 'ring-brass/60'));
    zone.addEventListener('drop', (event) => {
      event.preventDefault();
      zone.classList.remove('ring-2', 'ring-brass/60');
      const [from, id] = (event.dataTransfer?.getData('text/plain') ?? '').split(':');
      if (!id) return;
      if (accepts === 'pool' && from === 'pool') add(id);
      if (accepts === 'deck' && from !== 'pool') remove(id);
    });
  }

  // filters
  const search = q<HTMLInputElement>('[data-q]');
  let searchTimer = 0;
  search.oninput = () => { clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { filter.q = search.value.trim().toLowerCase(); renderPool(); }, 120); };
  root.querySelectorAll<HTMLButtonElement>('[data-kind]').forEach((button) => { button.onclick = () => { filter.kind = button.dataset.kind!; renderPool(); }; });
  root.querySelectorAll<HTMLSelectElement>('[data-filter]').forEach((input) => {
    input.onchange = () => {
      filter[input.dataset.filter as 'attr'] = Number(input.value);
      input.classList.toggle('!border-brass', input.value !== '0' && input.dataset.filter !== 'sort');
      renderPool();
    };
  });
  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((button) => { button.onclick = () => showTab(button.dataset.tab as 'deck'); });

  // deck slots
  const confirmDiscard = async () => !dirty || (await modal({ title: t('Unsaved changes'), text: t('Discard your changes to "{name}"?', { name }), ok: t('Discard'), cancel: t('Keep editing'), danger: true })) === true;
  const load = (next: string) => { name = next; deck = structuredClone(decks[next]); dirty = false; setSelectedDeck(next); renderDeck(); refreshBadges(); };
  const askName = async (title: string, initial: string, allowCurrent = true): Promise<string | null> => {
    const typed = await modal({ title, input: initial, ok: t('OK') });
    if (typeof typed !== 'string') return null;
    if ((!allowCurrent || typed !== name) && decks[typed]) {
      const replace = await modal({ title: t('Name already used'), text: t('A deck called "{name}" exists. Replace it?', { name: typed }), ok: t('Replace'), danger: true });
      if (replace !== true) return null;
    }
    return typed;
  };
  const cycle = async (direction: number) => {
    if (!(await confirmDiscard())) return;
    const names = Object.keys(decks);
    load(names[(names.indexOf(name) + direction + names.length) % names.length]);
  };
  const newDeck = async () => {
    if (!(await confirmDiscard())) return;
    const typed = await askName(t('New deck'), t('New Deck'), false);
    if (!typed) return;
    decks[typed] = { main: [], extra: [] };
    saveDecks(decks);
    load(typed);
    showTab('pool');
    flash(t('Deck created. Add cards from the right.'), true);
  };
  /** Save an imported deck under a name the player picks, and open it. */
  const importDeck = async (text: string, fileName?: string) => {
    const imported = parseDeck(text);
    if (!imported || !imported.deck.main.length && !imported.deck.extra.length) { sfx.deny(); flash(t("That isn't a deck code or a .ydk file.")); return; }
    const typed = await askName(t('Import deck'), (imported.name ?? fileName ?? t('Imported Deck')).slice(0, 40), false);
    if (!typed) return;
    decks[typed] = imported.deck;
    saveDecks(decks);
    load(typed);
    showTab('deck');
    const n = imported.deck.main.length + imported.deck.extra.length;
    const missing = imported.missing.length;
    if (missing) await modal({ title: t('Imported {n} cards.', { n }), text: t('Cards not in this game were left out: {m}.', { m: missing }), ok: t('OK'), cancel: false });
    else flash(t('Imported {n} cards.', { n }), true);
  };
  const actions: Record<string, () => unknown> = {
    back: async () => { if (await confirmDiscard()) void go(returnTo); },
    prev: () => cycle(-1),
    next: () => cycle(1),
    pick: async () => {
      if (!(await confirmDiscard())) return;
      const names = Object.keys(decks);
      const index = await chooseFromList(t('Player deck'), names, names.indexOf(name));
      if (index !== null) load(names[index]);
    },
    new: newDeck,
    more: async () => {
      const keys = ['new', 'import', 'export', 'rename', 'clear', 'delete'];
      const index = await chooseFromList(t('Menu'), [t('New'), t('Import deck'), t('Export deck'), t('Rename'), t('Clear'), t('Delete')], -1);
      if (index !== null) void actions[keys[index]]();
    },
    rename: async () => {
      const typed = await askName(t('Rename deck'), name);
      if (!typed || typed === name) return;
      decks[typed] = decks[name];
      delete decks[name];
      name = typed;
      saveDecks(decks);
      setSelectedDeck(typed);
      refreshStatus();
    },
    import: async () => {
      if (!(await confirmDiscard())) return;
      const picked = await askDeckText();
      if (picked) await importDeck(picked.text, picked.file);
    },
    export: async () => {
      // the deck as it is on screen, unsaved changes included
      const index = await chooseFromList(t('Export deck'), [t('Copy deck code'), t('Copy share link'), t('Download .ydk file')], -1);
      if (index === 0) { if (await copyText(toYdke(deck))) flash(t('Deck code copied.'), true); }
      else if (index === 1) { if (await copyText(shareLink(deck))) flash(t('Share link copied.'), true); }
      else if (index === 2) {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([toYdk(deck, name)], { type: 'text/plain' }));
        link.download = `${name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'deck'}.ydk`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      }
    },
    clear: () => { deck = { main: [], extra: [] }; touch(); },
    delete: async () => {
      if (Object.keys(decks).length <= 1) { flash(t('You need at least one deck.')); return; }
      if ((await modal({ title: t('Delete deck'), text: t('Delete "{name}"? This cannot be undone.', { name }), ok: t('Delete'), danger: true })) !== true) return;
      delete decks[name];
      saveDecks(decks);
      load(Object.keys(decks)[0]);
    },
    save: () => {
      decks[name] = structuredClone(deck);
      saveDecks(decks);
      setSelectedDeck(name);
      dirty = false;
      const errors = validateDeck(deck);
      refreshStatus();
      flash(errors.length ? t('Saved — but the deck is not legal for duels yet.') : t('Deck saved.'), !errors.length);
    },
  };
  root.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((button) => { button.onclick = () => void actions[button.dataset.act!](); });
  // Ctrl+S saves
  const keys = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); actions.save(); } };
  window.addEventListener('keydown', keys);
  const unload = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
  window.addEventListener('beforeunload', unload);

  showTab(tab);
  renderDeck();
  renderPool();
  if (data.createNew) void newDeck();
  // a share link (#deck=…) opens here: offer to import it, and take it out of the address bar
  if (data.importCode) { history.replaceState(null, '', location.pathname + location.search); void importDeck(data.importCode); }
  return () => { resized.disconnect(); clearTimeout(flashTimer); window.removeEventListener('keydown', keys); window.removeEventListener('beforeunload', unload); };
};
export default deckEditor;
