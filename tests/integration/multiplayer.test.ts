import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import createCore, { OcgMessageType as M, OcgResponseType as R } from 'ocgcore-wasm';
import { OcgDuel, SURRENDER } from '../../src/ocgcore/duel';
import { CARDS } from '../../src/ocgcore/catalog';
import { Lockstep, DuelClock, type DecisionPacket } from '../../src/multiplayer/lockstep';
import { cleanName, cleanChat, validDeck, encode, decode, parseCode, newCode, fingerprint } from '../../src/multiplayer/protocol';
import { OPPONENTS } from '../../src/data/decks';
import type { Prompt, UIEvent } from '../../src/engine/duel';

const seed: [string, string, string, string] = ['101', '202', '303', '404'];
const prompt = { type: M.SELECT_YESNO, player: 0, description: 1n } as const;
test('multiplayer input validation and BigInt wire format', () => {
  assert.equal(cleanName('  Joey\u0000  '), 'Joey');
  assert.equal(cleanChat('x'.repeat(400)).length, 350);
  assert.equal(validDeck({ main: Array(40).fill('__proto__'), extra: [] }), false);
  assert.equal(validDeck(OPPONENTS[0].deck), true);
  const code = newCode();
  assert.equal(parseCode(code.toLowerCase()), code);
  assert.equal(parseCode('https://duelorigins.online/#duel=' + code), code);
  assert.equal(parseCode('<script>'), null);
  assert.deepEqual(decode(encode({ value: 18446744073709551615n })), { value: 18446744073709551615n });
  assert.throws(() => decode('x'.repeat(33000)), /too large/);
});
test('lockstep buffers an early decision, ignores duplicates, and rejects mismatch', async () => {
  let packet: DecisionPacket | undefined;
  const sender = new Lockstep(seed, async p => { packet = p; });
  const receiver = new Lockstep(seed, async () => {});
  const response = { type: R.SELECT_YESNO, yes: true } as const;
  await sender.exchange(prompt, true, async () => response);
  receiver.receive(packet!);
  assert.deepEqual(await receiver.exchange(prompt, false, async () => undefined), response);
  receiver.receive(packet!);
  const bad = new Lockstep(seed, async () => {});
  bad.receive({ seq: 0, prompt: 'different', response });
  await assert.rejects(bad.exchange(prompt, false, async () => undefined), /out of sync/);
});
test('lockstep abort and timeout release pending decisions', async () => {
  const link = new Lockstep(seed, async () => {}, 20);
  await assert.rejects(link.exchange(prompt, false, async () => undefined), /did not respond/);
  const other = new Lockstep(seed, async () => {});
  const waiting = other.exchange(prompt, false, async () => undefined);
  other.abort('Disconnected');
  await assert.rejects(waiting, /Disconnected/);
  const malformed = new Lockstep(seed, async () => {});
  malformed.receive({ seq: 999, prompt: fingerprint(prompt), response: null });
  await assert.rejects(malformed.exchange(prompt, false, async () => undefined), /synchronization/);
});
test('two mirrored OCGCore clients agree on draws, summons, and result', { timeout: 30000 }, async () => {
  const bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/data.json.gz')).toString());
  const [coreA, coreB] = await Promise.all([createCore({ sync: true }), createCore({ sync: true })]);
  const id = (name: string) => CARDS.find(c => c.name === name)!.id;
  const deckA = { main: Array(20).fill(id('Blue-Eyes White Dragon')).concat(Array(20).fill(id('Battle Ox'))), extra: [] };
  const deckB = { main: Array(20).fill(id('Summoned Skull')).concat(Array(20).fill(id('Mystical Elf'))), extra: [] };
  let a!: Lockstep, b!: Lockstep;
  a = new Lockstep(seed, async packet => { b.receive(decode(encode(packet)) as DecisionPacket); }, 5000);
  b = new Lockstep(seed, async packet => { a.receive(decode(encode(packet)) as DecisionPacket); }, 5000);
  const events: UIEvent[][] = [[], []];
  const ask = async (p: Prompt) => {
    if (p.t === 'main') return p.actions.find(action => action.a === 'summon' && !action.tributes)
      ?? p.actions.find(action => action.a === 'phase' && action.to === 'EP');
    if (p.t === 'chain') return null;
    if (p.t === 'select') return p.cards.slice(0, p.min);
    if (p.t === 'yesno') return false;
    if (p.t === 'option') return 0;
    if (p.t === 'position') return 'atk';
    return SURRENDER;
  };
  const left = new OcgDuel([deckA, deckB], ['A', 'B'], ask, e => { events[0].push(e); }, 8000, 0, 0);
  const right = new OcgDuel([deckB, deckA], ['B', 'A'], ask, e => { events[1].push(e); }, 8000, 0, 0);
  await Promise.all([left.run(coreA, bundle, undefined, 0, a), right.run(coreB, bundle, undefined, 1, b)]);
  assert.ok(events[0].some(e => e.t === 'summon'));
  const endA = events[0].find(e => e.t === 'end'), endB = events[1].find(e => e.t === 'end');
  assert.ok(endA && endB);
  assert.equal(endA.winner, 1 - endB.winner);
  assert.equal(left.turn, right.turn);
  assert.equal(left.players[0].deck.length, right.players[1].deck.length);
  const field = (duel: OcgDuel, side: 0 | 1) => duel.players[side].m.map(c => c && [c.def.name, c.pos]);
  assert.deepEqual(field(left, 0), field(right, 1));
  assert.deepEqual(field(left, 1), field(right, 0));
  assert.deepEqual(left.players[0].gy.map(c => c.def.name), right.players[1].gy.map(c => c.def.name));
  assert.equal(events[0].filter(e => e.t === 'draw').length, events[1].filter(e => e.t === 'draw').length);
});

test('private room handshake requires both players ready and delivers decisions', async () => {
  const { PrivateRoom } = await import('../../src/multiplayer/client');
  const { PROTOCOL } = await import('../../src/multiplayer/protocol');
  const endpoints: { message?: (data: string, context: { peerId: string }) => unknown; joined?: (context: { peerId: string }) => void }[] = [{}, {}];
  const factory = (side: number) => (() => ({
    makeAction: () => ({
      send: async (data: string) => { queueMicrotask(() => endpoints[1 - side].message?.(data, { peerId: String(side) })); },
      onMessage: (fn: typeof endpoints[number]['message']) => { endpoints[side].message = fn; },
    }),
    onPeerJoin: (fn: typeof endpoints[number]['joined']) => { endpoints[side].joined = fn; },
    onPeerLeave: () => {}, onError: () => {}, leave: async () => {},
  })) as any;
  const hello = { type: 'hello' as const, protocol: PROTOCOL, name: 'A', deck: OPPONENTS[0].deck, revision: 'test', ready: false };
  const host = new PrivateRoom('ABCDEFGH2345', { ...hello, host: true }, factory(0));
  const guest = new PrivateRoom('ABCDEFGH2345', { ...hello, name: 'B', host: false }, factory(1));
  const started: any[] = [];
  host.onStart = m => { started[0] = m; };
  guest.onStart = m => { started[1] = m; };
  const flush = () => new Promise(r => setTimeout(r, 10));
  try {
    endpoints[0].joined!({ peerId: '1' }); endpoints[1].joined!({ peerId: '0' });
    await flush();
    assert.equal(host.opponent?.name, 'B');
    await guest.setReady();
    await flush();
    assert.equal(started.length, 0);
    await host.setReady();
    await flush();
    assert.ok(started[0] && started[1]);
    assert.equal(started[0].first, 1 - started[1].first);
    assert.deepEqual(started[0].network.seed, started[1].network.seed);
    const response = { type: R.SELECT_YESNO, yes: false } as const;
    const waiting = guest.network!.exchange(prompt, false, async () => undefined);
    await host.network!.exchange(prompt, true, async () => response);
    assert.deepEqual(await waiting, response);
    // Forfeit ends the duel but keeps the room, so both players can rematch with a fresh seed.
    let ended = '';
    guest.onEnd = (reason, value) => { ended = value ? reason : ''; };
    await host.forfeit(); await flush();
    assert.equal(ended, 'Your opponent surrendered.');
    assert.equal(guest.rematchState.open, true);
    const firstSeed = started[0].network.seed;
    started.length = 0;
    await guest.requestRematch(); await flush();
    assert.equal(started.length, 0);
    assert.deepEqual(host.rematchState, { mine: false, theirs: true, open: true });
    await host.requestRematch(); await flush();
    assert.ok(started[0] && started[1], 'both sides restart');
    assert.deepEqual(started[0].network.seed, started[1].network.seed);
    assert.notDeepEqual(started[0].network.seed, firstSeed);
    assert.equal(started[0].first, 1 - started[1].first);
    let surrendered = false;
    guest.onEnd = (_, value) => { surrendered = value; };
    await host.leave(true); await flush();
    assert.equal(surrendered, true);
    assert.equal(guest.rematchState.open, false);
  } finally { await host.leave(); await guest.leave(); }
});

test('duel clock only runs for the side being waited on', () => {
  let now = 0;
  const clock = new DuelClock(1000, () => now);
  clock.start(0); now = 300;
  assert.equal(clock.remaining(0), 700);
  assert.equal(clock.remaining(1), 1000);
  clock.start(1); now = 500;
  assert.equal(clock.remaining(0), 700);
  assert.equal(clock.remaining(1), 800);
  clock.stop(); now = 5000;
  assert.equal(clock.remaining(1), 800);
  clock.start(0); now = 9000;
  assert.equal(clock.remaining(0), 0);
  assert.equal(clock.active, 0);
});

test('chat GIFs only accept ids from the built-in library', async () => {
  const { GIF_IDS } = await import('../../src/multiplayer/gifs');
  const known = [...GIF_IDS][0];
  assert.ok(GIF_IDS.size > 50);
  assert.ok(GIF_IDS.has(known));
  assert.ok(!GIF_IDS.has('notInTheLibrary123'));
  assert.ok([...GIF_IDS].every(id => /^[A-Za-z0-9]{5,40}$/.test(id)));
});

test('chat GIF messages only resolve to the GIPHY library or static.klipy.com', async () => {
  const { gifSrc, GIF_IDS } = await import('../../src/multiplayer/gifs');
  const id = [...GIF_IDS][0];
  assert.equal(gifSrc(`gif:${id}`), `https://media.giphy.com/media/${id}/200w.gif`);
  const path = 'ii/8ce8357c78ea940b9c2015daf05ce1a5/c3/5c/djs9fq6i.gif';
  assert.equal(gifSrc(`klipy:${path}`), `https://static.klipy.com/${path}`);
  for (const bad of ['gif:notInTheLibrary123', 'klipy:../../evil.gif', 'klipy://evil.example/x.gif', `klipy:${path}?y=1`, 'klipy:ii/../../../../evil.gif',
    'klipy:ii/8ce8357c78ea940b9c2015daf05ce1a5/c3/5c/a/b.gif', 'klipy:ii/8ce8357c78ea940b9c2015daf05ce1a5/c3/5c/x.png', `tenor:${path}`, 'hello']) assert.equal(gifSrc(bad), null, bad);
});
