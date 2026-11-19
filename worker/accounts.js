// Accounts and online stats, in D1 (tables: worker/schema.sql).
// Sign-in is Discord OAuth (scope `identify`, plus `guilds.join` once the server is set up: discord.js); the session is a signed cookie, so checking it reads no database row.
// Secrets: DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET (Discord developer portal → OAuth2) and SESSION_SECRET (any long
// random string). Discord's redirect list needs https://<site>/auth/callback.
//
// Duels are peer to peer, so the server never sees one: each player reports its own result, and a duel counts only
// when both players' reports name each other and agree. A player who started the duel (start()) and then left without
// a result loses it once the opponent has claimed the win and GRACE_MS has passed (abandoned(), on the cron).

import { canJoin, giveRole, joinServer, postDuel } from './discord.js';

const SESSION = 'session', STATE = 'oauth_state', MONTH_S = 30 * 86400;
/** How long a claimed win waits for the opponent's own report before a player who left loses by default. */
export const GRACE_MS = 3 * 60_000;
const OPPOSITE = { win: 'loss', loss: 'win', draw: 'draw' };
const LP = (n) => Number.isInteger(n) && n >= 0 && n <= 1e6;
const MATCH = /^[0-9a-f]{64}$/, USER = /^\d{1,20}$/, AVATAR = /^(a_)?[0-9a-f]{32}$/;
/** The three dorms a player picks on first sign-in. */
export const TEAMS = ['slifer', 'ra', 'obelisk'];
const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
const hmacKey = (secret) => crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);

/** A session token: `<user id>.<expiry, unix seconds>.<HMAC of both>`. */
export async function signSession(secret, id, now = Date.now()) {
  const body = `${id}.${Math.floor(now / 1000) + MONTH_S}`;
  return `${body}.${b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)))}`;
}
/** The user id in a valid, unexpired token, else null. */
export async function readSession(secret, token, now = Date.now()) {
  const [id, exp, sig] = String(token ?? '').split('.');
  if (!secret || !USER.test(id ?? '') || !/^\d+$/.test(exp ?? '') || !sig || Number(exp) < now / 1000) return null;
  try { return await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(`${id}.${exp}`)) ? id : null; }
  catch { return null; }
}

const cookie = (request, name) => request.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))?.[1];
const setCookie = (name, value, maxAge) => `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
function redirect(to, ...cookies) {
  const headers = new Headers({ Location: to });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}
const json = (value, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Record one player's report; when the opponent's matching report is already in, count the duel.
 * Returns whether the duel was counted by this report.
 */
export async function report(db, me, { match, opponent, result, lp }, now = Date.now()) {
  if (!MATCH.test(match ?? '') || !USER.test(opponent ?? '') || opponent === me || !(result in OPPOSITE)) return null;
  const [mine, theirsLp] = Array.isArray(lp) && lp.length === 2 && lp.every(LP) ? lp : [null, null];
  await db.prepare('INSERT OR IGNORE INTO reports (match, user, opponent, result, lp, opp_lp, at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(match, me, opponent, result, mine, theirsLp, now).run();
  const theirs = await db.prepare('SELECT result, lp, opp_lp FROM reports WHERE match = ? AND user = ? AND opponent = ?').bind(match, opponent, me).first();
  if (result === 'win' && theirs?.result === 'win') {
    // a dropped connection looks like the opponent leaving on both sides, so both claim the win: when both reports
    // agree on the LP, the player who was ahead takes it
    const ours = await db.prepare('SELECT lp, opp_lp FROM reports WHERE match = ? AND user = ?').bind(match, me).first();
    if (ours?.lp == null || theirs.lp == null || ours.lp !== theirs.opp_lp || ours.opp_lp !== theirs.lp || ours.lp === theirs.lp) return false;
    return count(db, match, me, opponent, ours.lp > theirs.lp ? 'win' : 'loss', now);
  }
  if (theirs?.result !== OPPOSITE[result]) return false;
  // the primary key on matches makes sure two reports arriving together count the duel once
  return count(db, match, me, opponent, result, now);
}

/** Count a duel once: `result` is from `me`'s side. */
async function count(db, match, me, opponent, result, now) {
  const winner = result === 'draw' ? null : result === 'win' ? me : opponent;
  const claim = await db.prepare('INSERT OR IGNORE INTO matches (id, a, b, winner, at) VALUES (?, ?, ?, ?, ?)').bind(match, me, opponent, winner, now).run();
  if (!claim.meta.changes) return false;
  const add = (id, r) => db.prepare('UPDATE users SET wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?')
    .bind(+(r === 'win'), +(r === 'loss'), +(r === 'draw'), id);
  await db.batch([add(me, result), add(opponent, OPPOSITE[result]), db.prepare('DELETE FROM reports WHERE match = ?').bind(match)]);
  return true;
}

/** A player's word that a duel with `opponent` began. */
export async function start(db, me, { match, opponent }, now = Date.now()) {
  if (!MATCH.test(match ?? '') || !USER.test(opponent ?? '') || opponent === me) return false;
  await db.prepare('INSERT OR IGNORE INTO starts (match, user, opponent, at) VALUES (?, ?, ?, ?)').bind(match, me, opponent, now).run();
  return true;
}

/**
 * Count the wins whose opponent started the duel but never reported, GRACE_MS after the claim: leaving mid-duel
 * (closing the tab, dropping the connection) loses it. A claim against someone who never started that duel counts
 * for nothing. Returns the match ids it counted; also clears day-old starts and unpaired reports.
 */
export async function abandoned(db, now = Date.now()) {
  const { results } = await db.prepare(`SELECT r.match, r.user, r.opponent FROM reports r
    JOIN starts s ON s.match = r.match AND s.user = r.opponent AND s.opponent = r.user
    WHERE r.result = 'win' AND r.at <= ?
      AND NOT EXISTS (SELECT 1 FROM reports o WHERE o.match = r.match AND o.user = r.opponent)`).bind(now - GRACE_MS).all();
  const counted = [];
  for (const r of results) if (await count(db, r.match, r.user, r.opponent, 'win', now)) counted.push(r.match);
  const old = now - 86400_000;
  await db.batch([db.prepare('DELETE FROM starts WHERE at < ?').bind(old), db.prepare('DELETE FROM reports WHERE at < ?').bind(old)]);
  return counted;
}

/** Set the player's dorm, once: a later pick is ignored. Returns the dorm the player is in, or null for a bad pick. */
export async function chooseTeam(db, me, team) {
  if (!TEAMS.includes(team)) return null;
  await db.prepare('UPDATE users SET team = ? WHERE id = ? AND team IS NULL').bind(team, me).run();
  return (await db.prepare('SELECT team FROM users WHERE id = ?').bind(me).first())?.team ?? null;
}

/** The top duelists by wins (fewer losses breaks a tie); players without a win aren't listed. */
export async function leaderboard(db, limit = 10) {
  const { results } = await db.prepare('SELECT id, name, avatar, team, wins, losses, draws FROM users WHERE wins > 0 ORDER BY wins DESC, losses ASC, id LIMIT ?').bind(limit).all();
  return results;
}

/** /auth/* and /api/* routes; null for any other path. */
export async function accounts(request, env, path, ctx) {
  const url = new URL(request.url);
  // Discord calls run after the response, so a slow or failing Discord never holds up the page
  const later = (task) => ctx?.waitUntil(task.catch(() => {}));
  const callback = `${url.origin}/auth/callback`;
  if (path === '/auth/discord') {
    if (!env.DISCORD_CLIENT_ID) return new Response('Discord sign-in is not set up.', { status: 503 });
    const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
    const params = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: 'code', scope: canJoin(env) ? 'identify guilds.join' : 'identify', redirect_uri: callback, state });
    return redirect(`https://discord.com/oauth2/authorize?${params}`, setCookie(STATE, state, 600));
  }
  if (path === '/auth/callback') {
    const code = url.searchParams.get('code'), state = cookie(request, STATE);
    if (!code || !state || state !== url.searchParams.get('state')) return redirect('/#lobby', setCookie(STATE, '', 0));
    const token = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri: callback }),
    }).then((r) => (r.ok ? r.json() : null), () => null);
    const user = token?.access_token && await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token.access_token}` } })
      .then((r) => (r.ok ? r.json() : null), () => null);
    if (!user || !USER.test(String(user.id))) return redirect('/#lobby', setCookie(STATE, '', 0));
    const name = String(user.global_name || user.username || 'Duelist').slice(0, 32);
    const avatar = AVATAR.test(String(user.avatar)) ? user.avatar : null;
    // name and picture follow the Discord profile on every sign-in
    await env.DB.prepare('INSERT INTO users (id, name, avatar, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar')
      .bind(String(user.id), name, avatar, Date.now()).run();
    const team = (await env.DB.prepare('SELECT team FROM users WHERE id = ?').bind(String(user.id)).first())?.team;
    later(joinServer(env, String(user.id), token.access_token, team));
    return redirect('/#lobby', setCookie(STATE, '', 0), setCookie(SESSION, await signSession(env.SESSION_SECRET, String(user.id)), MONTH_S));
  }
  if (path === '/auth/logout' && request.method === 'POST') {
    return new Response(null, { status: 204, headers: { 'Set-Cookie': setCookie(SESSION, '', 0) } });
  }
  // public, and the same for everyone: browsers may keep it a minute
  if (path === '/api/leaderboard') return Response.json(await leaderboard(env.DB), { headers: { 'Cache-Control': 'public, max-age=60' } });
  if (path === '/api/me' || path === '/api/result' || path === '/api/team' || path === '/api/start') {
    const me = await readSession(env.SESSION_SECRET, cookie(request, SESSION));
    if (!me) return json({ error: 'signed out' }, 401);
    if (path === '/api/me') {
      const user = await env.DB.prepare('SELECT id, name, avatar, team, wins, losses, draws FROM users WHERE id = ?').bind(me).first();
      return user ? json(user) : json({ error: 'signed out' }, 401);
    }
    // a JSON body: a form on another site can't send one with the cookie without the browser asking this site first
    if (request.method !== 'POST' || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({ error: 'bad request' }, 400);
    const body = (await request.json().catch(() => null)) || {};
    if (path === '/api/team') {
      const team = await chooseTeam(env.DB, me, body.team);
      if (team) later(giveRole(env, me, team));
      return team ? json({ team }) : json({ error: 'bad team' }, 400);
    }
    if (path === '/api/start') return (await start(env.DB, me, body)) ? json({ ok: true }) : json({ error: 'bad start' }, 400);
    const counted = await report(env.DB, me, body);
    if (counted) later(postDuel(env, env.DB, body.match));
    return counted === null ? json({ error: 'bad report' }, 400) : json({ counted });
  }
  return null;
}
