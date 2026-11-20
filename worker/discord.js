// The game's Discord server: players join it on sign-in, wear their dorm's role, and finished duels post to a channel.
// Each part runs only once its secrets are set, and a Discord failure never blocks sign-in or stats.
// A player banned or timed out on the server can't play (blocked(); the bot also needs Ban Members to see bans).
// Secrets: DISCORD_BOT_TOKEN (Bot → Token; the bot is in the server with Manage Roles, Create Invite and Ban Members,
// its role above the dorm roles), DISCORD_GUILD_ID, DISCORD_ROLE_SLIFER / DISCORD_ROLE_RA / DISCORD_ROLE_OBELISK (role ids), and
// DISCORD_WEBHOOK_URL (channel → Integrations → Webhooks).

const API = 'https://discord.com/api/v10';
const NAMES = { slifer: 'Slifer Red', ra: 'Ra Yellow', obelisk: 'Obelisk Blue' };

/** Whether sign-in should ask for `guilds.join`. */
export const canJoin = (env) => !!(env.DISCORD_BOT_TOKEN && env.DISCORD_GUILD_ID);

const guild = (env, path, method = 'GET', body) => fetch(`${API}/guilds/${env.DISCORD_GUILD_ID}/${path}`, {
  method,
  headers: { Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body && JSON.stringify(body),
}).catch(() => null);
const bot = (env, path, method, body) => guild(env, `members/${path}`, method, body);
const roleOf = (env, team) => team && env[`DISCORD_ROLE_${team.toUpperCase()}`];

/** Give the player their dorm's role (they must be in the server). */
export async function giveRole(env, user, team) {
  const role = roleOf(env, team);
  if (canJoin(env) && role) await bot(env, `${user}/roles/${role}`, 'PUT');
}

/** Add the player to the server with the OAuth token from sign-in, wearing their dorm's role if they have one. */
export async function joinServer(env, user, accessToken, team) {
  if (!canJoin(env) || !accessToken) return;
  const role = roleOf(env, team);
  const added = await bot(env, user, 'PUT', { access_token: accessToken, ...(role ? { roles: [role] } : {}) });
  // 204: already a member, so the roles above were ignored
  if (added?.status === 204) await giveRole(env, user, team);
}

/** Recent answers per player, so every API call doesn't ask Discord again. */
const checked = new Map();
const CHECK_MS = 60_000;

/**
 * Whether the player is shut out of the game: `{ banned: true }` when banned from the server, `{ until }` (ms) while
 * timed out, else null. Discord not set up or not answering lets the player in.
 */
export async function blocked(env, user, now = Date.now()) {
  if (!canJoin(env)) return null;
  let found = checked.get(user);
  if (!found || now - found.at >= CHECK_MS) {
    const [ban, member] = await Promise.all([guild(env, `bans/${user}`), bot(env, user)]);
    const until = member?.ok ? Date.parse((await member.json().catch(() => null))?.communication_disabled_until ?? '') : NaN;
    found = { at: now, banned: ban?.status === 200, until: Number.isFinite(until) ? until : 0 };
    if (checked.size > 5000) checked.clear();
    checked.set(user, found);
  }
  return found.banned ? { banned: true } : found.until > now ? { until: found.until } : null;
}

/** Post a counted duel to the server's channel. */
export async function postDuel(env, db, match) {
  if (!env.DISCORD_WEBHOOK_URL) return;
  const row = await db.prepare(`SELECT m.winner, a.id AS a, a.name AS an, a.team AS at, b.id AS b, b.name AS bn, b.team AS bt
    FROM matches m JOIN users a ON a.id = m.a JOIN users b ON b.id = m.b WHERE m.id = ?`).bind(match).first();
  if (!row) return;
  const who = (name, team) => `**${String(name).replace(/[*_~`|\\]/g, '')}**${team ? ` (${NAMES[team]})` : ''}`;
  const A = who(row.an, row.at), B = who(row.bn, row.bt);
  const content = !row.winner ? `🤝 ${A} and ${B} fought to a draw.` : row.winner === row.a ? `⚔️ ${A} defeated ${B}!` : `⚔️ ${B} defeated ${A}!`;
  // no pings: player names are theirs to pick, so "@everyone" in a name stays plain text
  await fetch(env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
  }).catch(() => null);
}
