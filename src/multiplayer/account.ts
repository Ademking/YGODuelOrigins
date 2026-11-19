/**
 * The signed-in Discord account and its online stats (worker/accounts.js). Signed out, in `npm run dev` or with the
 * server unreachable, there is no account and online duels simply aren't counted.
 */
import { timeoutSignal } from '../timeoutSignal';
import { cleanTeam, type Team } from './profile';

/** `avatar`: the Discord avatar hash (null: Discord's default picture); `team`: the dorm, null until chosen. */
export type Account = { id: string; name: string; avatar: string | null; team: Team | null; wins: number; losses: number; draws: number };
export type Result = 'win' | 'loss' | 'draw';
/** Account ids are Discord's numeric ids; an opponent's arrives over the duel connection, so it is checked. */
export const cleanAccount = (value: unknown) => typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : undefined;

let latest: Account | null = null;
/** The account as last loaded (main.ts loads it at start, the lobby again on each visit): for screens that can't wait. */
export const signedIn = () => latest;

export async function loadAccount(): Promise<Account | null> {
  try {
    const response = await fetch('/api/me', { cache: 'no-store', signal: timeoutSignal(6000) });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('json')) return latest = null;
    const a = await response.json() as Account;
    return latest = cleanAccount(a.id) ? { ...a, team: cleanTeam(a.team) ?? null } : null;
  } catch { return latest; }
}

/** Pick the player's dorm (once). Returns the dorm the server holds, or null when it could not be saved. */
export async function chooseTeam(team: Team): Promise<Team | null> {
  try {
    const response = await fetch('/api/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ team }), signal: timeoutSignal(8000) });
    return response.ok ? cleanTeam((await response.json() as { team?: unknown }).team) ?? null : null;
  } catch { return null; }
}

/** The top duelists by wins (worker/accounts.js); empty when the server can't be reached. */
export async function loadLeaderboard(): Promise<Account[]> {
  try {
    const response = await fetch('/api/leaderboard', { signal: timeoutSignal(6000) });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('json')) return [];
    const rows = await response.json() as Account[];
    return Array.isArray(rows) ? rows.filter(a => cleanAccount(a.id)).map(a => ({ ...a, team: cleanTeam(a.team) ?? null })) : [];
  } catch { return []; }
}

export async function signOut() {
  latest = null;
  try { await fetch('/auth/logout', { method: 'POST', signal: timeoutSignal(6000) }); } catch { /* offline: the cookie stays */ }
}

/** Both players derive the same match id from the duel's seed (a rematch has a new seed). */
const ids = new Map<string, Promise<string>>();
/** Kept per seed, so a report sent while the page closes doesn't wait on hashing. */
export function matchId(seed: readonly string[]) {
  const key = seed.join(',');
  if (!ids.has(key)) ids.set(key, hashSeed(key));
  return ids.get(key)!;
}
async function hashSeed(seed: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Tell the server a duel began, so leaving it without a result later counts as a loss. */
export async function reportStart(seed: readonly string[], opponent: string) {
  try {
    await fetch('/api/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: timeoutSignal(8000),
      body: JSON.stringify({ match: await matchId(seed), opponent }),
    });
  } catch { /* offline: leaving this duel can't be held against the opponent */ }
}

/** Tell the server how a duel ended for you; it counts once your opponent's report agrees. */
export async function reportResult(seed: readonly string[], opponent: string, result: Result, lp: [mine: number, theirs: number]) {
  try {
    await fetch('/api/result', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, signal: timeoutSignal(8000),
      body: JSON.stringify({ match: await matchId(seed), opponent, result, lp }),
    });
  } catch { /* offline: this duel goes uncounted */ }
}
