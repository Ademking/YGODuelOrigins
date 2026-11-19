// The game's own Nostr relay (worker/relay.js): what it accepts and who it passes events to.
import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error plain JavaScript Worker module
import { GameRelay, isGameEvent, matches } from '../../worker/relay.js';

const lobbyEvent = (extra: object = {}) => ({ id: 'e1', pubkey: 'p1', sig: 's1', kind: 25050, created_at: 1000, content: '{}', tags: [['t', 'duelorigins-lobby-v2']], ...extra });

/** A socket with the Hibernation API's attachment methods; `sent` collects what the relay sends it. */
function socket() {
  let attachment: unknown;
  return { sent: [] as unknown[], send(text: string) { this.sent.push(JSON.parse(text)); },
    serializeAttachment(value: unknown) { attachment = structuredClone(value); }, deserializeAttachment: () => structuredClone(attachment), close() {} };
}
function relay() {
  const sockets: ReturnType<typeof socket>[] = [];
  const instance = new GameRelay({ getWebSockets: () => sockets, acceptWebSocket() {} });
  const join = () => { const ws = socket(); ws.serializeAttachment({ subs: {}, window: 0, count: 0 }); sockets.push(ws); return ws; };
  return { instance, join, say: (ws: object, message: unknown) => instance.webSocketMessage(ws, JSON.stringify(message)) };
}

test('the relay takes lobby and duel signaling events only', () => {
  assert.equal(isGameEvent(lobbyEvent()), true);
  assert.equal(isGameEvent(lobbyEvent({ kind: 24242, tags: [['x', 'a1b2']] })), true, 'Trystero signaling');
  assert.equal(isGameEvent(lobbyEvent({ kind: 1 })), false, 'not ephemeral');
  assert.equal(isGameEvent(lobbyEvent({ tags: [['t', 'bitcoin']] })), false, 'another app');
  assert.equal(isGameEvent(lobbyEvent({ tags: [['t', 'duelorigins-lobby-v2', 7]] })), false, 'malformed tag');
  assert.equal(isGameEvent(lobbyEvent({ sig: undefined })), false);
});

test('filters match on kinds and tags, whatever the time', () => {
  const event = lobbyEvent();
  assert.equal(matches({ kinds: [25050], '#t': ['duelorigins-lobby-v2'], since: 990 }, event), true);
  assert.equal(matches({ kinds: [25051] }, event), false);
  assert.equal(matches({ '#t': ['other'] }, event), false);
  assert.equal(matches({ since: 1001, until: 10 }, event), true, 'times come from device clocks, which can be off');
  assert.equal(matches({ '#x': ['topic'] }, event), false);
});

test('an event reaches every matching subscription, and junk is refused', () => {
  const { join, say } = relay();
  const alice = join(), bob = join(), other = join();
  say(alice, ['REQ', 'lobby', { kinds: [25050], '#t': ['duelorigins-lobby-v2'] }]);
  say(bob, ['REQ', 'lobby', { kinds: [25050], '#t': ['duelorigins-lobby-v2'] }]);
  say(other, ['REQ', 'room', { kinds: [24242], '#x': ['room-topic'] }]);
  assert.deepEqual(alice.sent, [['EOSE', 'lobby']]);
  say(bob, ['EVENT', lobbyEvent()]);
  assert.deepEqual(bob.sent.at(-2), ['OK', 'e1', true, '']);
  assert.deepEqual(alice.sent.at(-1), ['EVENT', 'lobby', lobbyEvent()]);
  assert.equal(other.sent.length, 1, 'only its EOSE');
  say(alice, ['EVENT', lobbyEvent({ id: 'spam', kind: 1 })]);
  assert.deepEqual(alice.sent.at(-1), ['OK', 'spam', false, 'blocked: YGO Duel Origins events only']);
  say(alice, ['CLOSE', 'lobby']);
  say(bob, ['EVENT', lobbyEvent({ id: 'e2' })]);
  assert.notDeepEqual(alice.sent.at(-1)?.[0], 'EVENT', 'closed subscription gets nothing');
});

test('a connection that floods the relay is slowed down', () => {
  const { join, say } = relay();
  const ws = join();
  for (let i = 0; i < 151; i++) say(ws, ['EVENT', lobbyEvent({ id: 'e' + i })]);
  assert.deepEqual(ws.sent.at(-1), ['NOTICE', 'rate-limited: slow down']);
});
