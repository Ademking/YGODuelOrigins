import { t } from '../../i18n';
import { esc, html, type Screen } from '../dom';
import type { Ban } from '../../multiplayer/account';

/**
 * A player banned from the game's Discord server, or timed out there, can't play (worker/discord.js blocked()).
 * Nothing on this screen leads anywhere else; a timeout reloads the game when it ends.
 */
const bannedScreen: Screen<Ban> = (root, ban) => {
  root.className = 'app-bg fixed inset-0 grid place-items-center overflow-y-auto p-4';
  const until = ban?.until;
  const title = until ? t('You are timed out') : t('You are banned');
  const text = until
    ? t('You are timed out on the game\'s Discord server, so you can\'t play until {time}.', { time: new Date(until).toLocaleString() })
    : t('Your Discord account is banned from the game\'s server, so you can\'t play.');
  root.append(html(`<div class="mp-sheet w-[min(520px,100%)] text-center" role="alert">
    <h2 class="!whitespace-normal">${esc(title)}</h2>
    <p>${esc(text)}</p>
  </div>`));
  // setTimeout can't wait more than about 24 days
  const reload = until ? setTimeout(() => location.reload(), Math.min(until - Date.now() + 2000, 2 ** 31 - 1)) : undefined;
  return () => clearTimeout(reload);
};
export default bannedScreen;
