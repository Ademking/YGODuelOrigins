import { icon } from '../icons';
import { loadDecks, OPPONENTS, selectedDeck, setSelectedDeck, validateDeck, type Opponent } from '../../data/decks';
import { getCard } from '../../ocgcore/catalog';
import type { DeckList } from '../../engine/duel';
import { num, t } from '../../i18n';
import type { DuelInit } from './duel';
import { $, cardHtml, chooseFromList, esc, go, header, html, type Screen } from '../dom';
import { duelistPicker, RANDOM, randomDuelist } from '../duelist';

const store = {
  get: (key: string) => { try { return localStorage.getItem(key); } catch { return null; } },
  set: (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* ignore */ } },
};

function aceOf(deck: DeckList): string | null {
  const monsters = [...deck.main, ...deck.extra].map(getCard).filter((card) => card.kind === 'monster');
  return monsters.sort((first, second) => (second.atk ?? 0) - (first.atk ?? 0))[0]?.id ?? null;
}

/** Before a duel: pick the opponent (or Random) and your deck, then the starting Life Points. */
const setup: Screen = (root) => {
  const custom: Omit<Opponent, 'deck'> = { id: 'custom-deck', name: t('Custom Deck'), title: t('Custom CPU opponent'), art: '', ace: '', style: '', suggested: 'normal' };
  const customIndex = OPPONENTS.length;
  const saved = store.get('arcana-duel.opp');
  let opponentIndex = saved === custom.id ? customIndex : saved === 'random' ? RANDOM : Math.max(0, OPPONENTS.findIndex((opponent) => opponent.id === saved));
  const decks = loadDecks();
  const names = Object.keys(decks);
  let deckIndex = Math.max(0, names.indexOf(selectedDeck()));
  const cpuDecks = names.filter((name) => !validateDeck(decks[name], { enforceBanlist: false }).length);
  let cpuIndex = cpuDecks.indexOf(store.get('arcana-duel.cpu-deck') ?? '');
  let startingLP: 4000 | 8000 = store.get('arcana-duel.starting-lp') === '4000' ? 4000 : 8000;

  root.className = 'app-bg fixed inset-0 overflow-y-auto';
  const page = html(`<div class="mx-auto flex min-h-full w-full max-w-6xl lg:h-full flex-col gap-3 px-4 lg:gap-4 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:px-6"></div>`);
  root.append(page);
  page.append(header(t('Duel Setup'), () => void go('Title')));
  const picker = duelistPicker(t('CPU opponent'), opponentIndex, (index) => {
    opponentIndex = index;
    store.set('arcana-duel.opp', index === customIndex ? custom.id : OPPONENTS[index]?.id ?? 'random');
    refresh();
  }, custom);
  const cpuSelect = html<HTMLButtonElement>('<button class="mp-btn mx-3 mb-3 !justify-between lg:mx-5 lg:mb-4"></button>');
  picker.el.append(cpuSelect);
  const deckPanel = html(`<section class="mp-panel overflow-hidden">
    <div class="flex items-center justify-between px-5 pt-4"><span class="eyebrow">${esc(t('Player deck'))}</span><span class="text-xs text-dim" data-pos></span></div>
    <div class="flex items-center gap-2 px-3 py-3 lg:gap-3 lg:px-5">
      <button class="mp-icon" data-prev aria-label="${esc(t('Previous'))}">${icon('prev')}</button>
      <div class="flex min-w-0 flex-1 items-center gap-3 lg:flex-col lg:gap-0">
        <div class="w-16 flex-none lg:mx-auto lg:w-32" data-art></div>
        <div class="min-w-0 flex-1 lg:w-full lg:pt-3 lg:text-center">
          <h2 class="truncate font-display text-base lg:text-xl" data-name></h2>
          <p class="text-xs text-brass-txt lg:text-sm" data-count></p>
          <p class="mt-1 line-clamp-2 text-xs lg:min-h-[1.5em]" data-status></p>
        </div>
      </div>
      <button class="mp-icon" data-next aria-label="${esc(t('Next'))}">${icon('next')}</button>
    </div>
    <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-white/[.06] px-3 py-3 lg:grid-cols-2 lg:px-5 lg:pb-5">
      <button class="mp-btn !justify-between lg:col-span-2" data-choose><span class="truncate">${esc(t('Choose Player Deck ▾').replace(' ▾', ''))}</span>${icon('down', 'size-4 text-brass-txt')}</button>
      <button class="mp-btn max-lg:!w-11 max-lg:!px-0" data-edit aria-label="${esc(t('Edit Deck'))}" title="${esc(t('Edit Deck'))}">${icon('rename', 'size-4')}<span class="max-lg:hidden">${esc(t('Edit Deck'))}</span></button>
      <button class="mp-btn max-lg:!w-11 max-lg:!px-0" data-new aria-label="${esc(t('+ New Deck'))}" title="${esc(t('+ New Deck'))}">${icon('plus', 'size-4')}<span class="max-lg:hidden">${esc(t('+ New Deck').replace('+ ', ''))}</span></button>
    </div></section>`);
  // phones: one column with the duel button at the bottom; desktop: the roster fills the left, your deck and the button sit on the right
  const grid = html('<div class="flex flex-1 flex-col gap-3 lg:grid lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5"></div>');
  const side = html('<div class="flex flex-1 flex-col gap-3 lg:min-h-0 lg:gap-5"></div>');
  grid.append(picker.el, html(`<div class="text-center font-display text-lg text-brass-txt/80 -my-2 lg:hidden">${esc(t('VS'))}</div>`), side);
  const lp = html(`<div class="flex items-center justify-center gap-2" role="radiogroup" aria-label="${esc(t('Starting Life Points'))}">
    <span class="mr-1 text-sm text-dim">${esc(t('Starting Life Points'))}</span>
    ${[4000, 8000].map((value) => `<button class="mp-btn small" role="radio" data-lp="${value}">${num(value)}</button>`).join('')}</div>`);
  const start = html<HTMLButtonElement>(`<button class="mp-btn primary big w-full sm:w-80 lg:w-full">${icon('play', 'size-4')}${esc(t('Begin Duel'))}</button>`);
  const footer = html('<div class="mt-auto flex flex-col items-center gap-3 pt-1 lg:border lg:border-white/[.09] lg:bg-panel lg:p-5 lg:shadow-[0_10px_30px_#0006]"></div>');
  footer.append(lp, start);
  side.append(deckPanel, footer);
  page.append(grid);

  const edit = (createNew: boolean) => {
    if (names[deckIndex]) setSelectedDeck(names[deckIndex]);
    void go('DeckEditor', { createNew, returnTo: 'Setup' });
  };
  $(deckPanel, '[data-edit]').onclick = () => edit(false);
  $(deckPanel, '[data-new]').onclick = () => edit(true);
  const selectDeck = (index: number) => {
    if (!names.length || index < 0 || index >= names.length) return;
    deckIndex = index;
    setSelectedDeck(names[deckIndex]);
    refresh();
  };
  $(deckPanel, '[data-prev]').onclick = () => selectDeck((deckIndex - 1 + names.length) % names.length);
  $(deckPanel, '[data-next]').onclick = () => selectDeck((deckIndex + 1) % names.length);
  $<HTMLButtonElement>(deckPanel, '[data-choose]').disabled = !names.length;
  $(deckPanel, '[data-choose]').onclick = async () => {
    const index = await chooseFromList(t('Player deck'), names, deckIndex);
    if (index !== null) selectDeck(index);
  };
  cpuSelect.onclick = async () => {
    const index = await chooseFromList(t('CPU deck'), cpuDecks, cpuIndex);
    if (index === null) return;
    cpuIndex = index;
    store.set('arcana-duel.cpu-deck', cpuDecks[index]);
    refresh();
  };
  lp.querySelectorAll<HTMLButtonElement>('[data-lp]').forEach((button) => {
    button.onclick = () => { startingLP = Number(button.dataset.lp) as 4000 | 8000; store.set('arcana-duel.starting-lp', String(startingLP)); refresh(); };
  });
  start.onclick = () => {
    const deckName = names[deckIndex];
    const cpuDeck = cpuIndex >= 0 ? decks[cpuDecks[cpuIndex]] : undefined;
    const opponent = opponentIndex === customIndex ? cpuDeck && { ...custom, deck: cpuDeck } : OPPONENTS[opponentIndex === RANDOM ? randomDuelist() : opponentIndex];
    if (!deckName || !opponent || validateDeck(decks[deckName], { enforceBanlist: false }).length) return;
    setSelectedDeck(deckName);
    void go('Duel', { deck: decks[deckName], deckName, opp: opponent, level: opponent.suggested, startingLP } satisfies DuelInit);
  };

  const refresh = () => {
    const deckName = names[deckIndex];
    const deck = deckName ? decks[deckName] : undefined;
    $(deckPanel, '[data-pos]').textContent = names.length ? `${deckIndex + 1} / ${names.length}` : '';
    $(deckPanel, '[data-art]').innerHTML = cardHtml(deck ? aceOf(deck) : null, 'shadow-xl shadow-black/60', true);
    $(deckPanel, '[data-name]').textContent = deckName ?? t('No deck selected');
    $(deckPanel, '[data-count]').textContent = deck ? t('{main} main cards  /  {extra} fusion cards', { main: deck.main.length, extra: deck.extra.length }) : t('Create a deck to begin');
    const errors = deck ? validateDeck(deck, { enforceBanlist: false }) : [t('Create a deck to begin.')];
    const status = $(deckPanel, '[data-status]');
    status.textContent = errors[0] ?? t('Ready to duel');
    status.className = `mt-1 min-h-[1.5em] text-xs ${errors.length ? 'text-bad' : 'text-ok'}`;
    const isCustom = opponentIndex === customIndex;
    cpuSelect.hidden = !isCustom;
    cpuSelect.disabled = !cpuDecks.length;
    cpuSelect.innerHTML = `<span class="truncate">${esc(cpuIndex >= 0 ? cpuDecks[cpuIndex] : cpuDecks.length ? t('Choose CPU Deck ▾').replace(' ▾', '') : t('No valid saved decks'))}</span>${icon('down', 'size-4 text-brass-txt')}`;
    cpuSelect.classList.toggle('on', cpuIndex >= 0);
    lp.querySelectorAll<HTMLButtonElement>('[data-lp]').forEach((button) => {
      const on = Number(button.dataset.lp) === startingLP;
      button.classList.toggle('on', on);
      button.setAttribute('aria-checked', String(on));
    });
    start.disabled = !deck || !!errors.length || (isCustom ? cpuIndex < 0 : !OPPONENTS.length);
  };
  // arrow keys step through the opponents
  const keys = (event: KeyboardEvent) => {
    if (document.querySelector('dialog[open]') || (event.target as HTMLElement).matches('input, textarea')) return;
    if (event.key === 'ArrowLeft') picker.step(-1);
    else if (event.key === 'ArrowRight') picker.step(1);
  };
  window.addEventListener('keydown', keys);
  refresh();
  return () => window.removeEventListener('keydown', keys);
};
export default setup;
