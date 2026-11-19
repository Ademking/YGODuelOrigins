import test from 'node:test';
import assert from 'node:assert/strict';
import { finalizeEvent, generateSecretKey, type Event } from 'nostr-tools/pure';
import { Lobby, LOBBY_KIND, LOBBY_TAG, type LobbyTransport } from '../../src/multiplayer/lobby';

/** In-memory relay: every published event reaches every subscriber (including sniffers), like a public Nostr relay. */
function bus() {
  const subscribers = new Set<(event: Event) => void>();
  const log: Event[] = [];
  const transport = (): LobbyTransport => {
    let mine: ((event: Event) => void) | undefined;
    return {
      async publish(event) { log.push(event); for (const fn of subscribers) queueMicrotask(() => fn(event)); },
      subscribe(onEvent) { mine = onEvent; subscribers.add(onEvent); return () => { subscribers.delete(onEvent); }; },
      close() { if (mine) subscribers.delete(mine); },
    };
  };
  return { transport, log };
}
const flush = () => new Promise(r => setTimeout(r, 20));

test('nostr lobby: presence, chat, private invites and leaving', async () => {
  const relay = bus();
  const a = new Lobby('Yugi', { avatar: '1', country: 'JP' }, relay.transport());
  const b = new Lobby('Kaiba', { avatar: '2' }, relay.transport());
  const c = new Lobby('Joey', { avatar: '3' }, relay.transport());
  try {
    await flush();
    // Everyone sees everyone: newcomers ask, others answer (after a short random pause).
    await new Promise(r => setTimeout(r, 3000));
    assert.deepEqual([...a.peers.values()].map(p => p.name).sort(), ['Joey', 'Kaiba']);
    assert.equal(b.peers.get(a.id)?.country, 'JP');
    assert.equal(c.peers.size, 2);

    await a.say('hello lobby'); await flush();
    assert.equal(b.chat.at(-1)?.text, 'hello lobby');
    assert.equal(b.chat.at(-1)?.avatar, '1');

    // Invites are encrypted to the recipient: Joey sees the event but cannot read or act on it.
    const invites: string[] = [];
    b.onInvite = (peer, code) => invites.push(`${peer === a.id ? 'Yugi' : '?'}:${code}`);
    c.onInvite = () => invites.push('Joey got it');
    await a.invite(b.id, 'ABCDEFGH2345'); await flush();
    assert.deepEqual(invites, ['Yugi:ABCDEFGH2345']);
    assert.ok(!relay.log.some(e => e.content.includes('ABCDEFGH2345')), 'room code never travels in clear text');

    let declined = '';
    a.onDecline = (_peer, code) => { declined = code; };
    await b.decline(a.id, 'ABCDEFGH2345'); await flush();
    assert.equal(declined, 'ABCDEFGH2345');

    c.close(); await flush();
    assert.equal(a.peers.has(c.id), false);
    assert.equal(a.chat.at(-1)?.text, 'Joey left');
  } finally { a.close(); b.close(); c.close(); }
});

test('nostr lobby ignores forged, foreign, stale and malformed events', async () => {
  const relay = bus();
  const a = new Lobby('Yugi', { avatar: '1' }, relay.transport());
  try {
    const sk = generateSecretKey();
    const make = (content: unknown, tags = [['t', LOBBY_TAG]], created_at = Math.floor(Date.now() / 1000)) =>
      finalizeEvent({ kind: LOBBY_KIND, created_at, tags, content: typeof content === 'string' ? content : JSON.stringify(content) }, sk);
    const good = make({ type: 'presence', name: 'Mai', busy: false, avatar: '999', country: 'xx' });
    // Signature no longer matches. (Round-trip through JSON like a relay does; the in-object "verified" cache must not carry over.)
    a.receive(JSON.parse(JSON.stringify({ ...good, content: good.content.replace('Mai', 'Bad') })));
    a.receive(make({ type: 'presence', name: 'Rex', busy: false }, [['t', 'other-app']]));       // another app's tag
    a.receive(make({ type: 'presence', name: 'Old', busy: false }, undefined, 1));               // far in the past
    a.receive(make('not json'));
    a.receive(make({ type: 'presence', name: '', busy: false }));
    a.receive(make({ type: 'chat', text: 'hi' }));                                                // chat before presence
    assert.equal(a.peers.size, 0);
    assert.equal(a.chat.length, 0);
    a.receive(good);
    // Unknown avatar numbers and bad country codes are dropped, not trusted.
    assert.deepEqual([...a.peers.values()], [{ name: 'Mai', busy: false, avatar: undefined, country: undefined, team: undefined }]);
  } finally { a.close(); }
});

test('nostr lobby lists each Discord account once and never your own', async () => {
  const relay = bus();
  const a = new Lobby('Yugi', { avatar: 'discord:111' }, relay.transport());
  const b = new Lobby('Kaiba', { avatar: 'discord:222' }, relay.transport());
  try {
    await new Promise(r => setTimeout(r, 3000));
    // Kaiba enters again (or on another device) and Yugi opens a second tab
    const b2 = new Lobby('Kaiba', { avatar: 'discord:222' }, relay.transport());
    const a2 = new Lobby('Yugi', { avatar: 'discord:111' }, relay.transport());
    try {
      await new Promise(r => setTimeout(r, 3000));
      assert.deepEqual([...a.peers.keys()], [b2.id], 'the newer Kaiba replaces the older one');
      assert.deepEqual([...a2.peers.values()].map(p => p.name), ['Kaiba'], 'Yugi does not see Yugi');
    } finally { b2.close(); a2.close(); }
  } finally { a.close(); b.close(); }
});
