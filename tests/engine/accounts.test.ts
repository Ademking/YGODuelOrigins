// Accounts and online stats (worker/accounts.js): signed sessions, and a duel counts only when both reports agree.
// D1 is SQLite, so the tests run the real schema on Node's built-in SQLite behind a small D1-shaped wrapper.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
// @ts-expect-error plain JavaScript Worker module
import { chooseTeam, readSession, report, signSession } from '../../worker/accounts.js';
// @ts-expect-error plain JavaScript Worker module
import { joinServer, postDuel } from '../../worker/discord.js';
import { avatarURL, cleanSeed, cleanTeam } from '../../src/multiplayer/profile';

function d1() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('worker/schema.sql', 'utf8'));
  const prepare = (query: string) => {
    let args: unknown[] = [];
    const statement = {
      bind(...values: unknown[]) { args = values; return statement; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...(args as never[])).changes) } }; },
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
