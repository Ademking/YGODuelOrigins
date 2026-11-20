import { t } from '../../i18n';
import { esc, go, header, html, type Screen } from '../dom';
import type { Ban } from '../../multiplayer/account';

/**
 * Shown instead of the online lobby to a player banned from the game's Discord server, or timed out there
 * (worker/discord.js blocked()). Playing the CPU stays open; a timeout reopens the lobby when it ends.
 */
const bannedScreen: Screen<Ban> = (root, ban) => {
  root.className = 'app-bg fixed inset-0 flex flex-col overflow-y-auto';
  const page = html('<div class="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] sm:px-6"></div>');
  root.append(page);
  page.append(header(t('Online Duel'), () => void go('Title')));
  const until = ban?.until;
  const title = until ? t('You are timed out') : t('You are banned');
  const text = until
    ? t('You are timed out on the game\'s Discord server, so you can\'t play online until {time}. You can still duel the CPU.', { time: new Date(until).toLocaleString() })
    : t('Your Discord account is banned from the game\'s server, so you can\'t play online. You can still duel the CPU.');
  const box = html(`<div class="m-auto w-[min(520px,100%)]"><div class="mp-sheet w-full text-center" role="alert">
    <h2 class="!whitespace-normal">${esc(title)}</h2>
    <p class="!mb-1">${esc(text)}</p>
  </div></div>`);
  page.append(box);
  // setTimeout can't wait more than about 24 days
  const reload = until ? setTimeout(() => { location.hash = '#lobby'; location.reload(); }, Math.min(until - Date.now() + 2000, 2 ** 31 - 1)) : undefined;
  return () => clearTimeout(reload);
};
export default bannedScreen;
