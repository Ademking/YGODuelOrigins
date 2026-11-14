/** Player look shared in the lobby: a DiceBear avatar seed and a country code. Both are validated before use. */
const SEED_KEY = 'duel-origins.multiplayer.avatar';
const COUNTRY_KEY = 'duel-origins.multiplayer.country';
export const SEED = /^[a-z0-9]{4,32}$/;
export const COUNTRY = /^[A-Z]{2}$/;
export type Look = { avatar: string; country?: string };

export const avatarURL = (seed: string) => `https://api.dicebear.com/10.x/dylan/svg?seed=${encodeURIComponent(seed)}&backgroundColor=00000000`;
export const flagURL = (country: string) => `https://flagsapi.com/${country}/flat/64.png`;
export const cleanSeed = (value: unknown) => typeof value === 'string' && SEED.test(value) ? value : undefined;
export const cleanCountry = (value: unknown) => typeof value === 'string' && COUNTRY.test(value) ? value : undefined;

export function randomSeed() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => 'abcdefghijklmnopqrstuvwxyz0123456789'[n % 36]).join('');
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
    const response = await fetch('https://api.country.is/', { signal: AbortSignal.timeout(6000) });
    const country = cleanCountry(String((await response.json() as { country?: unknown }).country ?? '').toUpperCase());
    if (country) try { localStorage.setItem(COUNTRY_KEY, country); } catch { /* private mode */ }
    return country;
  } catch { return undefined; }
}
