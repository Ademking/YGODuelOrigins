import { CARDS, getCard } from '../../ocgcore/catalog';
import { OPPONENTS, STARTERS } from '../../data/decks';
import type { DebugSetup } from '../../engine/debug';
import type { CardDef } from '../../engine/types';
import type { DuelInit } from './duel';
import { $, cardHtml, esc, go, header, html, type Screen } from '../dom';

// the debug screen edits the zones every duel engine supports; opponentTraps is for OCGCore tests
type Field = Exclude<keyof DebugSetup, 'opponentTraps'>;
const ZONES: { key: Field; label: string; limit: number }[] = [
  { key: 'hand', label: 'Your hand', limit: 30 },
  { key: 'monsters', label: 'Your monsters', limit: 5 },
  { key: 'traps', label: 'Your set cards', limit: 5 },
  { key: 'opponentMonsters', label: 'Opponent monsters', limit: 5 },
  { key: 'extra', label: 'Fusion Deck', limit: 15 },
];
const PAGE = 60;

function allowed(card: CardDef, zone: Field) {
  if (zone === 'monsters' || zone === 'opponentMonsters') return card.kind === 'monster';
  if (zone === 'traps') return card.kind !== 'monster' && card.stype !== 'field';
  if (zone === 'extra') return card.mtype === 'fusion';
  return card.mtype !== 'fusion';
}

const setupState: DebugSetup = { hand: [], monsters: [], traps: [], opponentMonsters: [], extra: [] };

/** Debug duel: build a starting position zone by zone. Only shown with debug mode on (Alt+Shift+D on the title). */
const debug: Screen = (root) => {
  let zone: Field = 'hand', shown = PAGE;
  root.className = 'app-bg fixed inset-0 overflow-y-auto';
  const page = html(`<div class="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 px-4 pb-6 sm:px-6"></div>`);
  root.append(page);
  page.append(header('Debug Duel', () => void go('Title'), '<button class="mp-btn primary small sm:h-11 sm:px-5" data-start>Start Duel</button>'));
  const body = html(`<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section class="mp-panel p-4"><input class="mp-field" placeholder="Search cards (optional)" aria-label="Search cards" data-q>
      <p class="mt-2 text-xs text-dim" data-count></p>
      <div class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2" data-grid></div>
      <button class="mp-btn mt-3 w-full" data-more>Show more</button></section>
    <aside class="mp-panel gap-3 p-4"><span class="eyebrow">Starting position</span>
      <div class="grid gap-1.5" data-zones></div>
      <p class="text-xs text-dim" data-hint></p>
      <div class="grid gap-1" data-list></div>
      <p class="text-xs text-brass-txt" data-note></p>
      <button class="mp-btn small" data-clear>Clear All</button></aside></div>`);
  page.append(body);
  const note = $(body, '[data-note]');
  const renderList = () => {
    const current = ZONES.find((item) => item.key === zone)!;
    $(body, '[data-zones]').innerHTML = ZONES.map((item) => `<button class="mp-btn small !justify-between ${item.key === zone ? 'on' : ''}" data-zone="${item.key}"><span>${item.label}</span><b>${setupState[item.key].length}</b></button>`).join('');
    $(body, '[data-hint]').textContent = `${current.label}  ${setupState[zone].length} / ${current.limit}`;
    $(body, '[data-list]').innerHTML = setupState[zone].length ? setupState[zone].map((id, index) =>
      `<div class="flex items-center gap-2 rounded-lg bg-raised/60 px-3 py-1.5 text-sm"><span class="flex-1 truncate">${esc(getCard(id).name)}</span><button class="mp-btn small !h-7 !px-2.5" data-remove="${index}" aria-label="Remove">−</button></div>`).join('')
      : '<p class="text-xs text-dim">No cards yet. Pick one from the library.</p>';
  };
  const filtered = () => {
    const query = $<HTMLInputElement>(body, '[data-q]').value.trim().toLowerCase();
    return CARDS.filter((card) => allowed(card, zone) && (!query || card.name.toLowerCase().includes(query))).sort((a, b) => a.name.localeCompare(b.name));
  };
  const renderGrid = () => {
    const cards = filtered();
    $(body, '[data-count]').textContent = `${cards.length} available  ·  click a card to add`;
    $(body, '[data-grid]').innerHTML = cards.slice(0, shown).map((card) =>
      `<button class="group text-left" data-add="${card.id}" title="${esc(card.name)}">${cardHtml(card.id, 'transition group-hover:-translate-y-1')}<span class="mt-1 block truncate text-[10px] text-dim">${esc(card.name)}</span></button>`).join('') || '<p class="col-span-full py-8 text-center text-dim">No cards found.</p>';
    $(body, '[data-more]').hidden = cards.length <= shown;
  };
  body.onclick = (event) => {
    const target = event.target as HTMLElement;
    const zoneButton = target.closest<HTMLElement>('[data-zone]'), add = target.closest<HTMLElement>('[data-add]'), remove = target.closest<HTMLElement>('[data-remove]');
    if (zoneButton) { zone = zoneButton.dataset.zone as Field; shown = PAGE; note.textContent = ''; renderList(); renderGrid(); }
    else if (add) {
      const current = ZONES.find((item) => item.key === zone)!;
      if (setupState[zone].length >= current.limit) { note.textContent = `${current.label} is full.`; return; }
      setupState[zone].push(add.dataset.add!);
      note.textContent = `Added ${getCard(add.dataset.add!).name}`;
      renderList();
    } else if (remove) { setupState[zone].splice(Number(remove.dataset.remove), 1); note.textContent = ''; renderList(); }
  };
  $(body, '[data-q]').oninput = () => { shown = PAGE; renderGrid(); };
  $(body, '[data-more]').onclick = () => { shown += PAGE; renderGrid(); };
  $(body, '[data-clear]').onclick = () => { for (const item of ZONES) setupState[item.key] = []; note.textContent = 'Starting position cleared.'; renderList(); };
  $(page, '[data-start]').onclick = () => {
    const deck = structuredClone(Object.values(STARTERS)[0]);
    deck.extra = [];
    void go('Duel', { deck, deckName: 'Debug', opp: OPPONENTS[0], level: 'easy', debug: structuredClone(setupState) } satisfies DuelInit);
  };
  renderList();
  renderGrid();
};
export default debug;
