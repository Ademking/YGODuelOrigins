// Accounts and online stats (worker/accounts.js): signed sessions, and a duel counts only when both reports agree.
// D1 is SQLite, so the tests run the real schema on Node's built-in SQLite behind a small D1-shaped wrapper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
// @ts-expect-error plain JavaScript Worker module
import { abandoned, chooseTeam, GRACE_MS, leaderboard, readSession, start, report, signSession } from '../../worker/accounts.js';
// @ts-expect-error plain JavaScript Worker module
import { blocked, joinServer, postDuel } from '../../worker/discord.js';
import { avatarURL, cleanSeed, cleanTeam, flagCanvasURL, flagURL } from '../../src/multiplayer/profile';

function d1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('worker/schema.sql', 'utf8'));
  const prepare = (query: string) => {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { args = values; return statement; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }; },
      async all() { return { results: sql.prepare(query).all(...(args as never[])) }; },
      async first() { return sql.prepare(query).get(...(args as never[])) ?? null; },
    };
    return statement;
  };
  return { sql, prepare, async batch(statements: { run(): Promise<unknown> }[]) { for (const s of statements) await s.run(); } };
}
const user = (db: ReturnType<typeof d1>, id: string) => db.sql.prepare('SELECT wins, losses, draws FROM users WHERE id = ?').get(id);
const setup = () => {
  const db = d1();
  for (const id of ['111', '222', '333']) db.sql.prepare('INSERT INTO users (id, name, created_at) VALUES (?, ?, 0)').run(id, 'p' + id);
  return db;
};
const MATCH = 'a'.repeat(64);

test('a session token reads back its user, and not once tampered with or expired', async () => {
  const token = await signSession('secret', '111', 0);
  assert.equal(await readSession('secret', token, 0), '111');
  assert.equal(await readSession('other secret', token, 0), null);
  assert.equal(await readSession('secret', token.replace('111.', '222.'), 0), null);
  assert.equal(await readSession('secret', token, 31 * 86400_000), null, 'expired after 30 days');
  assert.equal(await readSession('secret', 'junk', 0), null);
  assert.equal(await readSession(undefined, token, 0), null, 'no secret configured');
});

test('a duel counts once both players agree, and only once', async () => {
  const db = setup();
  assert.equal(await report(db, '111', { match: MATCH, opponent: '222', result: 'win' }), false, 'waits for the opponent');
  assert.deepEqual({ ...user(db, '111') }, { wins: 0, losses: 0, draws: 0 });
  assert.equal(await report(db, '222', { match: MATCH, opponent: '111', result: 'loss' }), true);
  assert.deepEqual({ ...user(db, '111') }, { wins: 1, losses: 0, draws: 0 });
  assert.deepEqual({ ...user(db, '222') }, { wins: 0, losses: 1, draws: 0 });
  assert.equal(await report(db, '111', { match: MATCH, opponent: '222', result: 'win' }), false, 'a repeat changes nothing');
  assert.equal(await report(db, '222', { match: MATCH, opponent: '111', result: 'loss' }), false);
  assert.deepEqual({ ...user(db, '111') }, { wins: 1, losses: 0, draws: 0 });
});

test('draws count for both; disagreeing reports count for nobody', async () => {
  const db = setup();
  await report(db, '111', { match: MATCH, opponent: '222', result: 'draw' });
  assert.equal(await report(db, '222', { match: MATCH, opponent: '111', result: 'draw' }), true);
  assert.deepEqual({ ...user(db, '222') }, { wins: 0, losses: 0, draws: 1 });
  const other = 'b'.repeat(64);
  await report(db, '111', { match: other, opponent: '222', result: 'win' });
  assert.equal(await report(db, '222', { match: other, opponent: '111', result: 'win' }), false, 'both claim the win');
  assert.deepEqual({ ...user(db, '111') }, { wins: 0, losses: 0, draws: 1 });
});

test('two claimed wins: the first claim, or when made together the player ahead on LP', async () => {
  const db = setup();
  await report(db, '111', { match: MATCH, opponent: '222', result: 'win', lp: [6000, 1200] });
  assert.equal(await report(db, '222', { match: MATCH, opponent: '111', result: 'win', lp: [1200, 6000] }), true);
  assert.deepEqual({ ...user(db, '111') }, { wins: 1, losses: 0, draws: 0 });
  assert.deepEqual({ ...user(db, '222') }, { wins: 0, losses: 1, draws: 0 });
  const lied = 'c'.repeat(64);
  await report(db, '111', { match: lied, opponent: '222', result: 'win', lp: [6000, 1200] });
  assert.equal(await report(db, '222', { match: lied, opponent: '111', result: 'win', lp: [8000, 6000] }), false, 'LP that disagree count for nobody');
  const even = 'd'.repeat(64);
  await report(db, '111', { match: even, opponent: '222', result: 'win', lp: [4000, 4000] }, 1000);
  assert.equal(await report(db, '222', { match: even, opponent: '111', result: 'win', lp: [4000, 4000] }, 2000), false, 'level on LP, claimed together');
  const late = 'e'.repeat(64);
  await report(db, '111', { match: late, opponent: '222', result: 'win', lp: [8000, 8000] }, 1000);
  assert.equal(await report(db, '222', { match: late, opponent: '111', result: 'win', lp: [8000, 8000] }, 60_000), true, 'the first claim wins');
  const behind = 'f'.repeat(64);
  await report(db, '111', { match: behind, opponent: '222', result: 'win', lp: [500, 8000] }, 1000);
  assert.equal(await report(db, '222', { match: behind, opponent: '111', result: 'win', lp: [8000, 500] }, 30_000), true, 'the first claim wins even when behind on LP');
  assert.deepEqual({ ...user(db, '111') }, { wins: 3, losses: 0, draws: 0 });
});

test('a third account cannot pair with a report that names someone else', async () => {
  const db = setup();
  await report(db, '111', { match: MATCH, opponent: '222', result: 'win' });
  assert.equal(await report(db, '333', { match: MATCH, opponent: '111', result: 'loss' }), false);
  assert.deepEqual({ ...user(db, '111') }, { wins: 0, losses: 0, draws: 0 });
});

test('malformed reports are refused', async () => {
  const db = setup();
  for (const bad of [{}, { match: 'x', opponent: '222', result: 'win' }, { match: MATCH, opponent: '111', result: 'win' },
    { match: MATCH, opponent: '222', result: 'lose' }, { match: MATCH, opponent: 'abc', result: 'win' }]) {
    assert.equal(await report(db, '111', bad), null, JSON.stringify(bad));
  }
});

test('a dorm is picked once and kept', async () => {
  const db = setup();
  assert.equal(await chooseTeam(db, '111', 'pharaoh'), null, 'not a dorm');
  assert.equal(await chooseTeam(db, '111', 'ra'), 'ra');
  assert.equal(await chooseTeam(db, '111', 'obelisk'), 'ra', 'a second pick changes nothing');
});

test('peers can only send Discord avatars and dorms the game knows', () => {
  const hash = 'a_' + '0f'.repeat(16);
  assert.equal(cleanSeed(`discord:80351110224678912:${hash}`), `discord:80351110224678912:${hash}`);
  assert.equal(avatarURL(`discord:80351110224678912:${hash}`), `https://cdn.discordapp.com/avatars/80351110224678912/${hash}.png?size=128`);
  assert.match(avatarURL('discord:80351110224678912'), /^https:\/\/cdn\.discordapp\.com\/embed\/avatars\/[0-5]\.png$/);
  for (const bad of ['discord:abc', 'discord:1:../../x', 'discord:1:zz', 'https://evil.example/a.png']) assert.equal(cleanSeed(bad), undefined, bad);
  assert.equal(cleanSeed('12'), '12', 'older builds still send portrait numbers');
  assert.equal(cleanTeam('slifer'), 'slifer');
  assert.equal(cleanTeam('constructor'), undefined);
});

test('Discord: joining adds the dorm role, and a counted duel posts without pings', async () => {
  const calls: { url: string, method: string, body?: string }[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method!, body: init.body as string });
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const env = { DISCORD_BOT_TOKEN: 't', DISCORD_GUILD_ID: 'g', DISCORD_ROLE_RA: 'r1', DISCORD_WEBHOOK_URL: 'https://hook' };
    await joinServer(env, '111', 'oauth', 'ra');
    assert.deepEqual(calls.map(c => `${c.method} ${c.url}`), ['PUT https://discord.com/api/v10/guilds/g/members/111',
      'PUT https://discord.com/api/v10/guilds/g/members/111/roles/r1'], 'already a member (204): the role is added after');
    calls.length = 0;
    await joinServer({}, '111', 'oauth', 'ra');
    assert.equal(calls.length, 0, 'nothing without the server set up');
    const db = setup();
    db.sql.prepare("UPDATE users SET name = '@everyone', team = 'slifer' WHERE id = '111'").run();
    await report(db, '111', { match: MATCH, opponent: '222', result: 'loss' });
    await report(db, '222', { match: MATCH, opponent: '111', result: 'win' });
    await postDuel(env, db, MATCH);
    const post = JSON.parse(calls[0].body!);
    assert.equal(post.content, '⚔️ **p222** defeated **@everyone** (Slifer Red)!');
    assert.deepEqual(post.allowed_mentions, { parse: [] });
  } finally { globalThis.fetch = real; }
});

test('the leaderboard ranks by wins, fewer losses first on a tie, and skips players without a win', async () => {
  const db = setup();
  db.sql.exec("UPDATE users SET wins = 5, losses = 4 WHERE id = '111'; UPDATE users SET wins = 5, losses = 1 WHERE id = '222'");
  assert.deepEqual((await leaderboard(db)).map((u: { id: string }) => u.id), ['222', '111']);
});

test('a player who started a duel and left without a result loses it after the grace time', async () => {
  const db = setup();
  await start(db, '111', { match: MATCH, opponent: '222' }, 0);
  await start(db, '222', { match: MATCH, opponent: '111' }, 0);
  await report(db, '111', { match: MATCH, opponent: '222', result: 'win' }, 1000);
  assert.deepEqual(await abandoned(db, 1000 + GRACE_MS - 1), [], 'still inside the grace time');
  assert.deepEqual(await abandoned(db, 1000 + GRACE_MS), [MATCH]);
  assert.deepEqual({ ...user(db, '111') }, { wins: 1, losses: 0, draws: 0 });
  assert.deepEqual({ ...user(db, '222') }, { wins: 0, losses: 1, draws: 0 });
  assert.deepEqual(await abandoned(db, 2 * GRACE_MS + 1000), [], 'counted once');
});

test('a lone win claim counts for nothing unless the opponent started that duel, or when they reported too', async () => {
  const db = setup();
  await report(db, '111', { match: MATCH, opponent: '222' , result: 'win' }, 0);
  await start(db, '333', { match: MATCH, opponent: '111' }, 0);
  assert.deepEqual(await abandoned(db, GRACE_MS), [], '222 never started it (a third account cannot stand in)');
  const other = 'c'.repeat(64);
  await start(db, '222', { match: other, opponent: '111' }, 0);
  await report(db, '111', { match: other, opponent: '222', result: 'win' }, 0);
  await report(db, '222', { match: other, opponent: '111', result: 'win' }, 0);
  assert.deepEqual(await abandoned(db, GRACE_MS), [], 'both claim the win: a dispute, not an abandoned duel');
  assert.deepEqual({ ...user(db, '111') }, { wins: 0, losses: 0, draws: 0 });
  assert.equal(await start(db, '111', { match: 'x', opponent: '222' }), false);
});

test('players located in IL show the Palestinian flag', () => {
  assert.equal(flagURL('IL'), 'https://flagsapi.com/PS/flat/64.png');
  assert.equal(flagCanvasURL('IL'), 'https://flagcdn.com/w80/ps.png');
  assert.equal(flagURL('TN'), 'https://flagsapi.com/TN/flat/64.png');
});

test('a player banned or timed out on the Discord server is blocked; Discord down or not set up lets them in', async () => {
  const env = { DISCORD_BOT_TOKEN: 'bot', DISCORD_GUILD_ID: 'g' };
  const now = Date.parse('2026-01-01T00:00:00Z');
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const user = url.split('/').pop();
    if (url.includes('/bans/')) return new Response(null, { status: user === '901' ? 200 : 404 });
    if (user === '904') throw new Error('offline');
    const until = user === '902' ? '2026-01-01T01:00:00Z' : user === '903' ? '2025-12-31T00:00:00Z' : null;
    return Response.json({ user: { id: user }, communication_disabled_until: until });
  }) as typeof fetch;
  try {
    assert.deepEqual(await blocked(env, '901', now), { banned: true });
    assert.deepEqual(await blocked(env, '902', now), { until: Date.parse('2026-01-01T01:00:00Z') });
    assert.equal(await blocked(env, '902', now + 2 * 3600_000), null, 'the timeout is over');
    assert.equal(await blocked(env, '903', now), null, 'an old timeout');
    assert.equal(await blocked(env, '904', now), null, 'Discord unreachable');
    assert.equal(await blocked({}, '901', now), null, 'no server set up');
  } finally { globalThis.fetch = real; }
});
