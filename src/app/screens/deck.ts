import { CARDS, copyLimit, getCard, isExtraDeckCard } from '../../ocgcore/catalog';
import { loadDecks, saveDecks, selectedDeck, setSelectedDeck, validateDeck } from '../../data/decks';
import type { DeckList } from '../../engine/duel';
import type { Attr, CardDef, Race } from '../../engine/types';
import { sfx } from '../../ui/sfx';
import { num, t } from '../../i18n';
import { cardName, matchesTranslated } from '../../i18n/cards';
import { $, cardHtml, chooseFromList, coarsePointer, esc, go, html, modal, type Screen } from '../dom';
import { cardInfo } from '../cardInfo';

const ATTRS: (Attr | 'Any')[] = ['Any', 'DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND', 'DIVINE'];
const RACES: (Race | 'Any')[] = ['Any', ...[...new Set(CARDS.filter((c) => c.race).map((c) => c.race!))].sort()];
const LEVELS = ['Any', '1-4', '5-6', '7+'];
const MTYPES = ['Any', 'Normal', 'Effect', 'Ritual', 'Fusion'];
const SORTS = ['Name', 'ATK', 'DEF', 'Level', 'Type'];
const KIND_ORDER = { monster: 0, spell: 1, trap: 2 };
/** Pool cards drawn per batch; more are added as the list scrolls. */
const BATCH = 60;

const sorted = (ids: string[]) => [...ids].sort((a, b) => {
  const ca = getCard(a), cb = getCard(b);
  return KIND_ORDER[ca.kind] - KIND_ORDER[cb.kind] || (cb.lv ?? 0) - (ca.lv ?? 0) || ca.name.localeCompare(cb.name);
});

const deckEditor: Screen<{ createNew?: boolean; returnTo?: string } | undefined> = (root, data = {}) => {
  const decks = loadDecks();
  let name = Object.keys(decks).includes(selectedDeck()) ? selectedDeck() : Object.keys(decks)[0];
  let deck: DeckList = structuredClone(decks[name]);
  let dirty = false;
  const returnTo = data.returnTo === 'Setup' ? 'Setup' : 'Title';
  const filter = { kind: 'all', mtype: 0, attr: 0, race: 0, level: 0, sort: 0, q: '' };
  let tab: 'deck' | 'pool' = data.createNew ? 'pool' : 'deck';

  const select = (label: string, values: readonly string[], key: 'mtype' | 'attr' | 'race' | 'level' | 'sort', show = (v: string) => t(v)) =>
    `<label class="relative min-w-0 flex-1 basis-[30%] sm:basis-0"><span class="sr-only">${esc(label)}</span>
      <select data-filter="${key}" class="h-9 w-full cursor-pointer appearance-none rounded-lg border border-white/10 bg-field/80 pr-6 pl-2.5 text-xs text-ink outline-none focus:border-glow/70">
        ${values.map((value, index) => `<option value="${index}">${esc(index ? show(value) : `${label}: ${t('Any')}`)}</option>`).join('')}</select>
      <span class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[10px] text-brass-txt">▾</span></label>`;

  root.className = 'app-bg fixed inset-0';
  root.innerHTML = `<div class="mx-auto flex h-full w-full max-w-[1500px] flex-col gap-3 px-3 pt-[calc(env(safe-area-inset-top)+10px)] pb-[calc(env(safe-area-inset-bottom)+10px)] sm:px-5 sm:pt-5">
    <header class="flex flex-wrap items-center gap-2">
      <button class="mp-btn small" data-act="back" aria-label="${esc(t('Back'))}">‹<span class="hidden sm:inline">${esc(t('Back'))}</span></button>
      <div class="flex min-w-0 flex-1 items-center gap-1">
        <button class="mp-btn small !px-2.5" data-act="prev" aria-label="${esc(t('Previous'))}">‹</button>
        <button class="min-w-0 flex-1 truncate rounded-lg px-2 py-1 text-center font-display text-sm text-brass-txt hover:bg-white/5 sm:text-lg" data-act="pick" data-name></button>
        <button class="mp-btn small !px-2.5" data-act="next" aria-label="${esc(t('Next'))}">›</button>
      </div>
      <div class="flex w-full gap-1.5 sm:w-auto">
        <button class="mp-btn small flex-1" data-act="new">${esc(t('New'))}</button>
        <button class="mp-btn small flex-1" data-act="rename">${esc(t('Rename'))}</button>
        <button class="mp-btn small flex-1" data-act="clear">${esc(t('Clear'))}</button>
        <button class="mp-btn small danger flex-1" data-act="delete">${esc(t('Delete'))}</button>
        <button class="mp-btn small primary flex-1" data-act="save">${esc(t('Save'))}</button>
      </div>
    </header>
    <p class="-mt-1 truncate text-center text-xs" data-status role="status"></p>
    <div class="grid grid-cols-2 gap-1.5 lg:hidden" role="tablist">
      <button class="mp-btn small" role="tab" data-tab="deck"></button><button class="mp-btn small" role="tab" data-tab="pool">${esc(t('Card List'))}</button>
    </div>
    <div class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] xl:grid-cols-[280px_minmax(0,1fr)_440px] xl:grid-rows-1">
      <section class="mp-panel lg:flex" data-deck>
        <p class="px-4 pt-3 font-display text-[10px] tracking-wider text-brass-txt sm:text-[11px]" data-stats></p>
        <div class="mp-scroll px-3 py-2"><div class="grid grid-cols-[repeat(auto-fill,minmax(52px,1fr))] gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(60px,1fr))]" data-main></div></div>
        <div class="border-t border-white/[.08] px-3 pt-2 pb-3"><p class="eyebrow mb-1.5">${esc(t('Fusion Deck'))} <span data-fcount></span></p>
          <div class="flex gap-1 overflow-x-auto pb-1" data-extra></div></div>
      </section>
      <section class="mp-panel lg:flex" data-pool>
        <div class="grid gap-2 p-3">
          <input class="mp-field" type="search" placeholder="${esc(t('Search name or text…'))}" aria-label="${esc(t('Search name or text…'))}" data-q>
          <div class="grid grid-cols-4 gap-1">${['all', 'monster', 'spell', 'trap'].map((kind) => `<button class="mp-btn small !px-1" data-kind="${kind}">${esc(t(kind === 'all' ? 'All' : kind[0].toUpperCase() + kind.slice(1)))}</button>`).join('')}</div>
          <div class="flex flex-wrap gap-1">${select(t('Card'), MTYPES, 'mtype')}${select(t('Attr'), ATTRS, 'attr', (v) => v)}${select(t('Lv'), LEVELS, 'level')}${select(t('Type'), RACES, 'race')}${select(t('Sort'), SORTS, 'sort')}</div>
          <p class="text-xs text-dim" data-total></p>
        </div>
        <div class="mp-scroll px-3 pb-3" data-scroll><div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(80px,1fr))]" data-grid></div><div class="h-px" data-sentinel></div></div>
      </section>
      <aside class="mp-panel max-h-[34svh] p-3 xl:col-start-1 xl:row-start-1 xl:max-h-none lg:col-span-2 xl:col-span-1" data-info></aside>
    </div></div>`;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => $<T>(root, selector);
  const info = cardInfo(coarsePointer() ? t('Tap a card to see its details. Tap a listed card to add it; tap a deck card to remove it.') : t('Hover over a card to see its details.'), 'row-xl');
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
    `<button class="group relative block w-full touch-manipulation text-left ${from === 'extra' ? 'w-12 flex-none sm:w-14' : ''}" data-id="${id}" data-from="${from}" draggable="true" title="${esc(cardName(getCard(id)))}">${cardHtml(id, 'transition duration-150 group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-brass/20')}${from === 'pool' ? '<span data-badge class="absolute right-1 bottom-1 rounded-md bg-void/90 px-1.5 py-px font-display text-[10px] font-bold"></span>' : ''}</button>`;

  const renderDeck = () => {
    const main = sorted(deck.main), extra = sorted(deck.extra);
    const kind = (k: string) => deck.main.filter((id) => getCard(id).kind === k).length;
    q('[data-stats]').textContent = t('MAIN {main}  ·  MONSTERS {monsters}  ·  SPELLS {spells}  ·  TRAPS {traps}', { main: main.length, monsters: kind('monster'), spells: kind('spell'), traps: kind('trap') });
    q('[data-main]').innerHTML = main.map((id) => tile(id, 'main')).join('') || `<p class="col-span-full py-10 text-center text-sm text-dim">${esc(t('Deck created. Add cards from the right.'))}</p>`;
    q('[data-extra]').innerHTML = extra.map((id) => tile(id, 'extra')).join('');
    q('[data-fcount]').textContent = `(${extra.length})`;
    q('[data-tab=deck]').textContent = `${t('Deck')} (${main.length}${extra.length ? ` + ${extra.length}` : ''})`;
    refreshStatus();
  };

  const poolCards = (): CardDef[] => {
    const level = LEVELS[filter.level];
    const list = CARDS.filter((c) => {
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
  let pool: CardDef[] = [], drawn = 0;
  const badge = (button: HTMLElement) => {
    const id = button.dataset.id!, n = count(id), limit = copyLimit(getCard(id));
    const el = button.querySelector<HTMLElement>('[data-badge]')!;
    // hidden while it would only say 0/3
    el.hidden = !n && limit >= 3;
    el.textContent = `${n}/${limit}`;
    el.style.color = n >= limit ? '#ff9a7a' : n ? '#f0d08a' : '#a39cb8';
  };
  const refreshBadges = () => q('[data-grid]').querySelectorAll<HTMLElement>('[data-id]').forEach(badge);
  const drawMore = () => {
    const grid = q('[data-grid]');
    const next = pool.slice(drawn, drawn + BATCH);
    if (!next.length) return;
    grid.insertAdjacentHTML('beforeend', next.map((card) => tile(card.id, 'pool')).join(''));
    drawn += next.length;
    Array.from(grid.children).slice(-next.length).forEach((node) => badge(node as HTMLElement));
  };
  const renderPool = () => {
    pool = poolCards();
    drawn = 0;
    q('[data-grid]').innerHTML = pool.length ? '' : `<p class="col-span-full py-10 text-center text-dim">${esc(t('No cards match.'))}</p>`;
    q('[data-scroll]').scrollTop = 0;
    q('[data-total]').textContent = pool.length === 1 ? t('1 card') : t('{n} cards', { n: num(pool.length) });
    root.querySelectorAll<HTMLElement>('[data-kind]').forEach((button) => button.classList.toggle('on', button.dataset.kind === filter.kind));
    drawMore();
  };
  const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) drawMore(); }, { root: q('[data-scroll]'), rootMargin: '400px' });
  observer.observe(q('[data-sentinel]'));

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
  const cardOf = (event: Event) => (event.target as HTMLElement).closest<HTMLElement>('[data-id]');
  root.addEventListener('pointerover', (event) => { const card = cardOf(event); if (card && event.pointerType === 'mouse') info.show(getCard(card.dataset.id!)); });
  root.addEventListener('click', (event) => {
    const card = cardOf(event);
    if (!card) return;
    info.show(getCard(card.dataset.id!));
    if (card.dataset.from === 'pool') add(card.dataset.id!); else remove(card.dataset.id!);
  });
  root.addEventListener('contextmenu', (event) => {
    const card = cardOf(event);
    if (!card) return;
    event.preventDefault();
    if (card.dataset.from === 'pool' && !event.shiftKey) remove(card.dataset.id!); else add(card.dataset.id!);
  });
  // drag from the list onto the deck to add; from the deck onto the list to remove
  root.addEventListener('dragstart', (event) => {
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
  return () => { observer.disconnect(); clearTimeout(flashTimer); window.removeEventListener('keydown', keys); window.removeEventListener('beforeunload', unload); };
};
export default deckEditor;
