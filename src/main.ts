import './polyfills';
import './app/app.css';
import { go } from './app/dom';
import { mountBackdrop } from './app/backdrop';
import { mountMusic } from './app/music';
import { loadCardTexts } from './i18n/cards';
import { reloadForUpdate } from './staleBuild';
import { initMonitoring } from './monitoring';
import { restoreReturnHash } from './app/returnHash';
import { loadAccount, onBan } from './multiplayer/account';

initMonitoring();
mountBackdrop();
mountMusic();

// Vite reports a code file from an older deploy that is gone: reload once to pick up the current one.
window.addEventListener('vite:preloadError', (event) => { if (reloadForUpdate()) event.preventDefault(); });

// Card names and text in the player's language load first (English needs nothing); a slow network cannot hold the game.
restoreReturnHash();
// banned or timed out on the Discord server, whenever the server says so: leave whatever is showing for the Banned screen
onBan(() => void go('Banned'));
// the signed-in account, for the duel plates (account.ts); the first screen waits for it, so a banned player never gets in
Promise.race([Promise.all([loadCardTexts(), loadAccount()]), new Promise((resolve) => setTimeout(resolve, 6000))])
  // invite links (#duel=…) and the return from Discord sign-in (#lobby) open the lobby, deck share links (#deck=…) the Deck Builder
  .then(() => location.hash.startsWith('#duel=') || location.hash === '#lobby' ? go('Multiplayer') : location.hash.startsWith('#deck=') ? go('DeckEditor', { importCode: location.hash }) : go('Title'))
  .then(() => document.dispatchEvent(new Event('duel-origins:ready')))
  .catch((error: unknown) => {
    console.error(error);
    document.dispatchEvent(new Event('duel-origins:boot-error'));
  });
