// Duelist picker: a large portrait with name and deck style, arrows, and a strip of every duelist's face plus Random.
import { OPPONENTS, type Opponent } from '../data/decks';
import { CARDS } from '../ocgcore/catalog';
import { portraitURL } from '../ui/portraits';
import { t } from '../i18n';
import { cardSrc, esc, html } from './dom';

/** Index meaning "pick someone when the duel starts". */
export const RANDOM = -1;

/** A random duelist's index, avoiding `not` when there is a choice. */
export function randomDuelist(not = RANDOM) {
  const free = OPPONENTS.map((_, index) => index).filter((index) => index !== not || OPPONENTS.length === 1);
  return free[Math.floor(Math.random() * free.length)];
}

const DIE = '<svg viewBox="0 0 24 24" class="size-[70%] -rotate-12" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" fill="#e8eaee"/><g fill="#14121f"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="8" cy="16" r="1.7"/><circle cx="16" cy="16" r="1.7"/></g></svg>';

/** A duelist's portrait, or their ace card's art when they have none. */
function face(duelist: Pick<Opponent, 'id' | 'ace' | 'name'>) {
  const portrait = portraitURL(duelist.id);
  if (portrait) return `<img src="${portrait}" alt="${esc(duelist.name)}" class="size-full object-cover object-top" draggable="false">`;
  const ace = CARDS.find((card) => card.name === duelist.ace);
  const src = ace ? cardSrc(ace.id) : '';
  return src ? `<img src="${esc(src)}" alt="${esc(duelist.name)}" class="size-full object-cover" draggable="false">` : `<span class="font-display text-2xl text-brass-txt">${esc(duelist.name.slice(0, 1))}</span>`;
}

export function duelistPicker(label: string, selected: number, onChange: (index: number) => void, extra?: Omit<Opponent, 'deck'>) {
  const roster = extra ? [...OPPONENTS, extra] : OPPONENTS;
  const root = html(`<section class="mp-panel overflow-hidden">
    <div class="flex items-center justify-between px-5 pt-4"><span class="eyebrow">${esc(label)}</span><span class="text-xs text-dim" data-pos></span></div>
    <div class="flex items-center gap-3 px-3 pt-3 sm:px-5">
      <button class="mp-icon text-2xl" data-prev aria-label="${esc(t('Previous'))}">‹</button>
      <div class="relative mx-auto grid aspect-[118/141] w-32 flex-none place-items-center overflow-hidden rounded-2xl border border-brass/40 bg-[linear-gradient(160deg,#2a2250,#0c0a18)] shadow-xl shadow-black/50 sm:w-36" data-big></div>
      <button class="mp-icon text-2xl" data-next aria-label="${esc(t('Next'))}">›</button>
    </div>
    <div class="px-5 pt-3 pb-4 text-center">
      <h2 class="truncate font-display text-lg text-ink sm:text-xl" data-name></h2>
      <p class="text-sm text-brass-txt" data-title></p>
      <p class="mx-auto mt-1 min-h-[2.5em] max-w-[44ch] text-xs text-dim" data-style></p>
    </div>
    <div class="flex snap-x gap-1.5 overflow-x-auto border-t border-white/[.06] bg-field/50 p-3 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(40px,1fr))] sm:overflow-visible" data-strip role="listbox" aria-label="${esc(label)}"></div>
  </section>`);
  const strip = root.querySelector<HTMLElement>('[data-strip]')!;
  const tiles = [RANDOM, ...roster.map((_, index) => index)].map((index) => {
    const duelist = roster[index];
    const tile = html<HTMLButtonElement>(`<button role="option" class="grid aspect-[5/6] w-10 flex-none snap-start place-items-center overflow-hidden rounded-lg border-2 border-transparent bg-raised opacity-60 transition hover:opacity-100 sm:w-auto [&.on]:border-brass [&.on]:opacity-100" title="${esc(duelist?.name ?? t('Random'))}">${
      index === RANDOM ? DIE : duelist.id === extra?.id ? '<span class="font-display text-xl text-brass-txt">+</span>' : face(duelist)}</button>`);
    tile.dataset.click = '';
    tile.onclick = () => choose(index);
    strip.append(tile);
    return tile;
  });
  const anyone = () => OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
  const big = root.querySelector<HTMLElement>('[data-big]')!;
  const refresh = () => {
    const duelist = roster[selected];
    const custom = !!extra && duelist?.id === extra.id;
    root.querySelector('[data-pos]')!.textContent = duelist ? `${selected + 1} / ${roster.length}` : '';
    big.innerHTML = custom ? '<span class="font-display text-6xl text-brass-txt">+</span>'
      : duelist ? face(duelist) : `<div class="absolute inset-0 opacity-25">${face(anyone())}</div><span class="relative font-display text-6xl text-brass-txt">?</span>`;
    root.querySelector('[data-name]')!.textContent = duelist?.name ?? t('Random');
    root.querySelector('[data-title]')!.textContent = duelist?.title ? t(duelist.title) : t('A surprise duelist, picked when the duel starts');
    root.querySelector('[data-style]')!.textContent = duelist?.style ? t(duelist.style) : '';
    tiles.forEach((tile, n) => { tile.classList.toggle('on', n - 1 === selected); tile.setAttribute('aria-selected', String(n - 1 === selected)); });
    tiles[selected + 1].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const choose = (index: number) => { selected = index; refresh(); onChange(index); };
  /** Move through Random and then every duelist. */
  const step = (direction: number) => {
    const count = roster.length + 1;
    choose(((selected + 1 + direction + count) % count) - 1);
  };
  root.querySelector<HTMLButtonElement>('[data-prev]')!.onclick = () => step(-1);
  root.querySelector<HTMLButtonElement>('[data-next]')!.onclick = () => step(1);
  refresh();
  return { el: root, step };
}
