import './app/app.css';
import { go } from './app/dom';
import { mountBackdrop } from './app/backdrop';
import { mountMusic } from './app/music';
import { loadCardTexts } from './i18n/cards';
import { reloadForUpdate } from './staleBuild';
import { initMonitoring } from './monitoring';

initMonitoring();
mountBackdrop();
mountMusic();

// Vite reports a code file from an older deploy that is gone: reload once to pick up the current one.
window.addEventListener('vite:preloadError', (event) => { if (reloadForUpdate()) event.preventDefault(); });

// Card names and text in the player's language load first (English needs nothing); a slow network cannot hold the game.
Promise.race([loadCardTexts(), new Promise((resolve) => setTimeout(resolve, 6000))])
  .then(() => go(location.hash.startsWith('#duel=') ? 'Multiplayer' : 'Title'))
  .then(() => document.dispatchEvent(new Event('duel-origins:ready')))
  .catch((error: unknown) => {
    console.error(error);
    document.dispatchEvent(new Event('duel-origins:boot-error'));
  });
