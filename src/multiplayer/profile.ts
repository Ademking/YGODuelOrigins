/**
 * Player look shared in the lobby: an avatar, a country code and a dorm. The avatar is the player's Discord picture
 * (`discord:<user id>:<hash>`, or `discord:<user id>` for Discord's default one); players on older builds send an
 * ygopro.online portrait number (1 to AVATAR_COUNT). All of it is validated before use, so peers cannot point the page
 * at other URLs.
 */
import { timeoutSignal } from '../timeoutSignal';
const COUNTRY_KEY = 'duel-origins.multiplayer.country';
export const AVATAR_COUNT = 346;
const SEED_KEY = 'duel-origins.multiplayer.avatar';
export function randomSeed() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % AVATAR_COUNT + 1);
}
export function saveSeed(seed: string) { try { localStorage.setItem(SEED_KEY, seed); } catch { /* private mode */ } }
/** A guest's stored portrait, or a new random one (saved) on first visit. */
export function savedSeed() {
  let seed: string | undefined;
  try { seed = cleanSeed(localStorage.getItem(SEED_KEY)); } catch { /* private mode */ }
  if (!seed || seed.startsWith('discord:')) { seed = randomSeed(); saveSeed(seed); }
  return seed;
}
export const COUNTRY = /^[A-Z]{2}$/;
const DISCORD_AVATAR = /^discord:(\d{1,20})(?::((?:a_)?[0-9a-f]{32}))?$/;
/** The dorms (as in Yu-Gi-Oh! GX): chosen once on first sign-in, worn as the avatar's frame colour. */
/** `light`/`dark`: the frame's gradient ends; `god`: the card whose art stands for the dorm (data/cardImages.ts). */
export const TEAMS = {
  slifer: { name: 'Slifer Red', color: '#e0313c', light: '#ff8a8f', dark: '#6e0d14', god: 'god_slifer' },
  ra: { name: 'Ra Yellow', color: '#f2c12e', light: '#fff1a8', dark: '#7a5406', god: 'god_ra' },
  obelisk: { name: 'Obelisk Blue', color: '#2f6fe4', light: '#9cc2ff', dark: '#0c2a6b', god: 'god_obelisk' },
} as const;
export type Team = keyof typeof TEAMS;
export const cleanTeam = (value: unknown): Team | undefined => typeof value === 'string' && Object.keys(TEAMS).includes(value) ? value as Team : undefined;
export const teamColor = (team: Team | undefined) => team ? TEAMS[team].color : undefined;
export type Look = { avatar: string; country?: string; team?: Team };

const AVATAR_PATH = 'ygopro.online/assets/profile/Avatars/';
/** A Discord account's avatar id, for the Look. */
export const discordAvatar = (id: string, hash?: string | null) => `discord:${id}${hash ? ':' + hash : ''}`;
export const avatarURL = (id: string) => {
  const discord = DISCORD_AVATAR.exec(id);
  if (!discord) return `https://${AVATAR_PATH}${id}.jpg`;
  const [, user, hash] = discord;
  return hash ? `https://cdn.discordapp.com/avatars/${user}/${hash}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(user) >> 22n) % 6n)}.png`;
};
/** ygopro.online sends no CORS header, so the game canvas (WebGL needs CORS) loads avatars through the wsrv.nl proxy the card art already uses. */
export const avatarCanvasURL = (id: string) => `https://wsrv.nl/?url=${encodeURIComponent(avatarURL(id))}&w=128&h=128&fit=cover`;
export const flagURL = (country: string) => `https://flagsapi.com/${country}/flat/64.png`;
/** flagsapi.com sends no CORS header, so the game canvas draws flags from flagcdn.com instead. */
export const flagCanvasURL = (country: string) => `https://flagcdn.com/w80/${country.toLowerCase()}.png`;
/** A Discord avatar id, or an avatar number from 1 to AVATAR_COUNT as a string without leading zeros. */
export const cleanSeed = (value: unknown) => {
  if (typeof value === 'string' && DISCORD_AVATAR.test(value)) return value;
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
