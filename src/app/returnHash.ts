/**
 * An invite link (#duel=…) opened while signed out is kept here through the Discord sign-in, which always comes back
 * to #lobby; main.ts puts the link back so the lobby still joins that room.
 */
export const RETURN_KEY = 'duel-origins.multiplayer.return';

export function restoreReturnHash() {
  if (location.hash !== '#lobby') return;
  try {
    const saved = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    if (saved?.startsWith('#duel=')) history.replaceState(null, '', location.pathname + location.search + saved);
  } catch { /* storage blocked: the lobby opens without the room */ }
}
