/**
 * Player look shared in the lobby: an avatar number (ygopro.online portraits 1 to AVATAR_COUNT) and a country code.
 * Both are validated before use, so peers cannot point the page at other URLs.
 */
import { timeoutSignal } from '../timeoutSignal';
const SEED_KEY = 'duel-origins.multiplayer.avatar';
const COUNTRY_KEY = 'duel-origins.multiplayer.country';
export const AVATAR_COUNT = 346;
export const COUNTRY = /^[A-Z]{2}$/;
export type Look = { avatar: string; country?: string };

const AVATAR_PATH = 'ygopro.online/assets/profile/Avatars/';
export const avatarURL = (id: string) => `https://${AVATAR_PATH}${id}.jpg`;
/** ygopro.online sends no CORS header, so the game canvas (WebGL needs CORS) loads avatars through the wsrv.nl proxy the card art already uses. */
export const avatarCanvasURL = (id: string) => `https://wsrv.nl/?url=${encodeURIComponent(avatarURL(id))}&w=128&h=128&fit=cover`;
export const flagURL = (country: string) => `https://flagsapi.com/${country}/flat/64.png`;
/** flagsapi.com sends no CORS header, so the game canvas draws flags from flagcdn.com instead. */
export const flagCanvasURL = (country: string) => `https://flagcdn.com/w80/${country.toLowerCase()}.png`;
/** An avatar number from 1 to AVATAR_COUNT, as a string without leading zeros. */
export const cleanSeed = (value: unknown) => {
  if (typeof value !== 'string' || !/^[1-9]\d{0,2}$/.test(value)) return undefined;
  return Number(value) <= AVATAR_COUNT ? value : undefined;
};
export const cleanCountry = (value: unknown) => typeof value === 'string' && COUNTRY.test(value) ? value : undefined;
/** A valid avatar for anyone: theirs, or one picked from their name for players who sent none. */
export function avatarFor(avatar: string | undefined, name: string) {
  const valid = cleanSeed(avatar);
  if (valid) return valid;
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0;
  return String(hash % AVATAR_COUNT + 1);
}

export function randomSeed() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % AVATAR_COUNT + 1);
}
export function saveSeed(seed: string) { try { localStorage.setItem(SEED_KEY, seed); } catch { /* private mode */ } }
/** The stored avatar seed, or a new random one (saved) on first visit. */
export function savedSeed() {
  let seed: string | undefined;
  try { seed = cleanSeed(localStorage.getItem(SEED_KEY)); } catch { /* private mode */ }
  if (!seed) { seed = randomSeed(); saveSeed(seed); }
  return seed;
}
/**
 * Country from the player's IP via api.country.is, cached on the device so the lookup runs once.
 * Returns undefined when the service is unreachable; the flag is simply left out.
 */
export async function lookupCountry(): Promise<string | undefined> {
  try { const cached = cleanCountry(localStorage.getItem(COUNTRY_KEY)); if (cached) return cached; } catch { /* private mode */ }
  try {
    const response = await fetch('https://api.country.is/', { signal: timeoutSignal(6000) });
    const country = cleanCountry(String((await response.json() as { country?: unknown }).country ?? '').toUpperCase());
    if (country) try { localStorage.setItem(COUNTRY_KEY, country); } catch { /* private mode */ }
    return country;
  } catch { return undefined; }
}
