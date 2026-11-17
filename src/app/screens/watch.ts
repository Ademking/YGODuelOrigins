import { icon } from '../icons';
import { OPPONENTS } from '../../data/decks';
import { t } from '../../i18n';
import type { DuelInit } from './duel';
import { esc, go, header, html, type Screen } from '../dom';
import { duelistPicker, RANDOM, randomDuelist } from '../duelist';

// Remembered while the game is open, so coming back from a duel keeps the last match-up.
const picks = [RANDOM, RANDOM];

/** Replay: choose two CPU duelists (either can be left on Random) and watch them play each other. */
const watch: Screen = (root) => {
  root.className = 'app-bg fixed inset-0 overflow-y-auto';
  const page = html(`<div class="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-3 px-4 lg:gap-4 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:px-6"></div>`);
  root.append(page);
  page.append(header(t('Replay'), () => void go('Title')), html(`<p class="-mt-2 text-sm text-dim">${esc(t('Watch two CPU duelists play each other'))}</p>`));
  const grid = html('<div class="grid items-start gap-3 lg:grid-cols-[1fr_auto_1fr] lg:gap-4"></div>');
  grid.append(
    duelistPicker(t('Duelist 1  ·  near side'), picks[0], (index) => { picks[0] = index; }).el,
    html(`<div class="self-center text-center font-display text-lg text-brass-txt/80 max-lg:-my-2 lg:text-3xl">${esc(t('VS'))}</div>`),
    duelistPicker(t('Duelist 2  ·  far side'), picks[1], (index) => { picks[1] = index; }).el,
  );
  const start = html<HTMLButtonElement>(`<button class="mp-btn primary big w-full sm:w-80">${icon('play', 'size-4')}${esc(t('Watch Duel'))}</button>`);
  start.disabled = !OPPONENTS.length;
  start.onclick = () => {
    // Random slots are filled now; two random picks never land on the same duelist.
    const chosen = [...picks];
    for (const slot of [0, 1]) if (chosen[slot] === RANDOM) chosen[slot] = randomDuelist(chosen[1 - slot]);
    const near = OPPONENTS[chosen[0]], far = OPPONENTS[chosen[1]];
    void go('Duel', { deck: near.deck, deckName: near.name, opp: far, level: far.suggested, watch: near } satisfies DuelInit);
  };
  const footer = html('<div class="mt-auto flex justify-center pt-1"></div>');
  footer.append(start);
  page.append(grid, footer);
};
export default watch;
