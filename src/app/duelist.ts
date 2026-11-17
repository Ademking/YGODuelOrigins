// Duelist picker: a large portrait with name and deck style, arrows, and a strip of every duelist's face plus Random.
import { icon } from './icons';
import { OPPONENTS, type Opponent } from '../data/decks';
import { CARDS } from '../ocgcore/catalog';
import { portraitURL } from '../ui/portraits';
import { t } from '../i18n';
import { artSrc, esc, html, reducedMotionPreferred } from './dom';

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
  // the hi-res close-ups are square; the small ones carry a game frame, so they are scaled past it
  if (portrait) return portrait.includes('/hd/') ? `<img src="${portrait}" alt="${esc(duelist.name)}" class="size-full object-cover" draggable="false">`
    : `<img src="${portrait}" alt="${esc(duelist.name)}" class="absolute top-[-6%] left-[-11%] h-auto w-[122%] max-w-none" draggable="false">`;
  const ace = CARDS.find((card) => card.name === duelist.ace);
  const src = ace ? artSrc(ace.id) : '';
  return src ? `<img src="${esc(src)}" alt="${esc(duelist.name)}" class="size-full object-cover" draggable="false">` : `<span class="font-display text-2xl text-brass-txt">${esc(duelist.name.slice(0, 1))}</span>`;
}

export function duelistPicker(label: string, selected: number, onChange: (index: number) => void, extra?: Omit<Opponent, 'deck'>) {
  const roster = extra ? [...OPPONENTS, extra] : OPPONENTS;
  const root = html(`<section class="mp-panel flex min-h-0 flex-col overflow-hidden">
    <div class="flex items-center justify-between px-5 pt-4"><span class="eyebrow">${esc(label)}</span><span class="text-xs text-dim" data-pos></span></div>
    <div class="flex items-center gap-2 px-3 py-3 lg:gap-3 lg:px-5 lg:pb-4">
      <button class="mp-icon" data-prev aria-label="${esc(t('Previous'))}">${icon('prev')}</button>
      <div class="flex min-w-0 flex-1 items-center gap-3 lg:gap-6">
        <div class="relative grid aspect-square w-20 flex-none place-items-center overflow-hidden border border-brass/40 bg-[linear-gradient(160deg,#2a2250,#0c0a18)] shadow-xl shadow-black/50 lg:w-40 xl:w-48" data-big></div>
        <div class="min-w-0 flex-1">
          <h2 class="truncate font-display text-base text-ink lg:text-3xl" data-name></h2>
          <p class="line-clamp-2 text-xs text-brass-txt lg:mt-1 lg:text-base" data-title></p>
          <p class="mt-3 line-clamp-3 max-w-[48ch] text-sm text-dim max-lg:hidden" data-style></p>
        </div>
      </div>
      <button class="mp-icon" data-next aria-label="${esc(t('Next'))}">${icon('next')}</button>
    </div>
    <div class="flex snap-x gap-1.5 overflow-x-auto border-t border-white/[.06] bg-field/50 p-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[repeat(auto-fill,4rem)] lg:justify-between lg:gap-2 xl:grid-cols-[repeat(auto-fill,76px)] lg:content-start lg:overflow-x-hidden lg:overflow-y-auto" data-strip role="listbox" aria-label="${esc(label)}"></div>
  </section>`);
  const strip = root.querySelector<HTMLElement>('[data-strip]')!;
  const tiles = [RANDOM, ...roster.map((_, index) => index)].map((index) => {
    const duelist = roster[index];
    const tile = html<HTMLButtonElement>(`<button role="option" class="relative grid aspect-square w-10 flex-none snap-start place-items-center overflow-hidden border-2 border-transparent bg-raised opacity-75 transition hover:opacity-100 lg:size-16 xl:size-[76px] [&.on]:border-brass [&.on]:opacity-100" title="${esc(duelist?.name ?? t('Random'))}">${
      index === RANDOM ? DIE : face(duelist)}</button>`);
    tile.dataset.click = '';
    tile.onclick = () => choose(index);
    strip.append(tile);
    return tile;
  });
  const anyone = () => OPPONENTS[Math.floor(Math.random() * OPPONENTS.length)];
  const big = root.querySelector<HTMLElement>('[data-big]')!;
  let shuffle: ReturnType<typeof setInterval> | undefined;
  const refresh = () => {
    const duelist = roster[selected];
    root.querySelector('[data-pos]')!.textContent = duelist ? `${selected + 1} / ${roster.length}` : '';
    clearInterval(shuffle);
    if (duelist) big.innerHTML = face(duelist);
    else {
      // Random flicks through the roster's faces
      const show = () => { big.innerHTML = `<div class="absolute inset-0 opacity-40 grayscale">${face(anyone())}</div><span class="relative font-display text-5xl text-brass-txt drop-shadow-[0_2px_8px_#000] lg:text-8xl">?</span>`; };
      show();
      if (!reducedMotionPreferred()) shuffle = setInterval(() => { if (big.isConnected) show(); else clearInterval(shuffle); }, 260);
    }
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
