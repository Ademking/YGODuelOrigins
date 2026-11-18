import { defaultRelayUrls, joinRoom, type Room } from 'trystero';
import { getRelays } from '@trystero-p2p/core';
import { GAME_RELAY } from './relays';
import type { DeckList } from '../engine/duel';
import { APP_ID, PROTOCOL, cleanName, cleanChat, validDeck, decode, encode } from './protocol';
import { cleanCountry, cleanSeed, type Look } from './profile';
import { Lockstep, type DecisionPacket, type DuelNetwork } from './lockstep';

import type { ChatLine } from './lobby';
import { t } from '../i18n';
import { timeoutSignal } from '../timeoutSignal';
/** The public lobby runs over Nostr (lobby.ts); private rooms and duels below stay peer to peer. */
export { Lobby, type ChatLine, type PeerProfile } from './lobby';
type Hello = { type: 'hello'; name: string; deck: DeckList; revision: string; host: boolean; ready: boolean; protocol: string; avatar?: string; country?: string };
/** `looks` is [yours, opponent's]; a missing avatar is picked from the player's name. */
export type Match = { name: string; opponent: string; deck: DeckList; opponentDeck: DeckList; first: 0 | 1; network: Lockstep; session: PrivateRoom; looks: [Partial<Look>, Partial<Look>] };
/**
 * Signaling relays: the game's own relay, plus the same five public relays Trystero picks by default for this app id
 * (so players on an older build still meet on them).
 */
const ROOM_RELAYS = [GAME_RELAY, ...getRelays({ appId: APP_ID }, defaultRelayUrls, 5, true)];
const config = { appId: APP_ID, identity: 'none' as const, maxReceiveBytes: 32768, relayConfig: { urls: ROOM_RELAYS } };
let relay: Promise<RTCIceServer[]> | undefined, relayAt = 0;
/**
 * Short-lived TURN relay logins from the site's /turn endpoint (worker/index.js, Cloudflare TURN), for networks that
 * block direct WebRTC. Empty in `npm run dev` or when the endpoint is down: duels then try direct connections only.
 * The logins last 24 hours; a tab open longer than 12 fetches fresh ones.
 */
export function relayServers() {
  if (Date.now() - relayAt > 12 * 3600_000) { relay = undefined; relayAt = Date.now(); }
  relay ??= fetch('/turn', { signal: timeoutSignal(5000) })
    .then(response => (response.ok ? response.json() : []))
    .then((servers: unknown) => (Array.isArray(servers) ? servers as RTCIceServer[] : []))
    .catch(() => { relay = undefined; return []; });
  return relay;
}
/** Plain-language text for Trystero room errors. */
function roomErrorText(error: { code?: string; message: string }, who: string) {
  switch (error.code) {
    case 'peer-connect-failed': case 'handshake-failed': case 'peer-error':
      return t("Couldn't connect to {player}. One of your networks is blocking direct connections.", { player: who });
    case 'relay-failed': return t('Lost touch with the matchmaking servers. Check your internet connection.');
    default: return error.message;
  }
}
const errorText = (error: unknown) => error instanceof Error ? error.message : t('Connection failed.');
export class PrivateRoom {
  readonly chat: ChatLine[] = [];
  opponent?: Hello;
  network?: Lockstep;
  onChange = () => {};
  onChat = (_line?: ChatLine) => {};
  onStart = (_match: Match) => {};
  onEnd = (_reason: string, _surrendered: boolean) => {};
  error = '';
  private room: Room;
  private action;
  private peer?: string;
  private ready = false;
  private started = false;
  private wantRematch = false;
  private opponentRematch = false;
  private pendingSeed?: DuelNetwork['seed'];
  private pendingFirst: 0 | 1 = 0;
  private closed = false;
  private lastChat = 0;
  private receivedChat = 0;
  private connectionTimer: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  constructor(public code: string, private hello: Hello, roomFactory: typeof joinRoom = joinRoom, relay: RTCIceServer[] = []) {
    this.room = roomFactory({ ...config, ...(relay.length ? { turnConfig: relay } : {}), maxUsers: 2, password: code }, 'duel-' + code);
    this.action = this.room.makeAction('duel');
    this.action.onMessage((raw, { peerId }) => { void this.receive(raw, peerId).catch(e => this.fail(errorText(e), false, true)); });
    this.room.onPeerJoin(({ peerId }) => { void this.send({ ...hello, ready: this.ready }, peerId).catch(e => this.fail(errorText(e))); });
    this.room.onPeerLeave(({ peerId }) => { if (peerId === this.peer) this.fail(t('Your opponent disconnected.')); });
    this.room.onError(error => { if (!this.opponent) { this.error = roomErrorText(error, 'your opponent'); this.onChange(); } });
    this.connectionTimer = setTimeout(() => {
      if (!this.opponent) { this.error = relay.length ? t('Still waiting for a connection. Check the code and keep both tabs open.') : t('Still waiting. Check the code and keep both tabs open, or press Try again.'); this.onChange(); }
    }, 30000);
  }
  static async create(code: string, host: boolean, name: string, deck: DeckList, look: Partial<Look> = {}) {
    const [response, relay] = await Promise.all([fetch(`${import.meta.env.BASE_URL}ocgcore/revision`, { signal: timeoutSignal(15000) }), relayServers()]);
    if (!response.ok) throw new Error(t('Could not verify the duel engine version. Reload and try again.'));
    const revision = (await response.text()).trim();
    return new PrivateRoom(code, { type: 'hello', protocol: PROTOCOL, host, name, deck: structuredClone(deck), revision, ready: false, ...look }, joinRoom, relay);
  }
  get isHost() { return this.hello.host; }
  get isReady() { return this.ready; }
  get hasStarted() { return this.started; }
  get rematchState() { return { mine: this.wantRematch, theirs: this.opponentRematch, open: !this.closed && !this.error && this.started }; }
  /** After a finished duel: both players ask, then the host deals a fresh seed through the normal start/ack handshake. */
  async requestRematch() {
    if (this.closed || this.error || !this.started || this.wantRematch) return;
    this.wantRematch = true;
    this.onChange();
    await this.send({ type: 'rematch' });
    await this.dealRematch();
  }
  private async dealRematch() {
    if (!this.isHost || !this.wantRematch || !this.opponentRematch) return;
    this.wantRematch = this.opponentRematch = false;
    this.started = false;
    this.pendingSeed = Array.from(crypto.getRandomValues(new BigUint64Array(4)), String) as DuelNetwork['seed'];
    this.pendingFirst = crypto.getRandomValues(new Uint8Array(1))[0] % 2 as 0 | 1;
    this.makeNetwork(this.pendingSeed);
    this.handshakeTimer = setTimeout(() => this.fail(t('Opponent did not acknowledge the rematch.')), 20000);
    await this.send({ type: 'start', seed: this.pendingSeed, first: this.pendingFirst, rematch: true });
  }
  private send(value: unknown, target = this.peer) {
    if (this.closed) return Promise.reject(new Error('Room closed.'));
    if (!target) return Promise.resolve();
    return this.action.send(encode(value), { target });
  }
  private async receive(raw: unknown, peer: string) {
    if (this.closed || typeof raw !== 'string' || raw.length > 32768) return;
    const m = decode(raw) as Record<string, unknown>;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'hello') {
      if (this.started || (this.peer && this.peer !== peer)) return;
      if (m.protocol !== PROTOCOL || m.revision !== this.hello.revision) throw new Error(t('Different game versions. Both players should reload the same deployment.'));
      if (typeof m.host !== 'boolean' || m.host === this.hello.host) throw new Error(t('This room already has a host. Join using their code.'));
      if (!cleanName(m.name) || !validDeck(m.deck) || typeof m.ready !== 'boolean') throw new Error(t('Opponent sent invalid deck or profile data.'));
      const firstHello = !this.peer;
      this.peer = peer;
      this.opponent = { ...m, name: cleanName(m.name), avatar: cleanSeed(m.avatar), country: cleanCountry(m.country) } as Hello;
      this.error = '';
      clearTimeout(this.connectionTimer);
      if (firstHello) await this.send({ ...this.hello, ready: this.ready });
      this.onChange();
      if (this.isHost && this.ready && this.opponent.ready && !this.pendingSeed) {
        this.pendingSeed = Array.from(crypto.getRandomValues(new BigUint64Array(4)), String) as DuelNetwork['seed'];
        this.pendingFirst = crypto.getRandomValues(new Uint8Array(1))[0] % 2 as 0 | 1;
        this.makeNetwork(this.pendingSeed);
        this.handshakeTimer = setTimeout(() => this.fail(t('Opponent did not acknowledge the duel. Recreate the room.')), 20000);
        await this.send({ type: 'start', seed: this.pendingSeed, first: this.pendingFirst });
      }
      return;
    }
    if (!this.peer || peer !== this.peer || !this.opponent) return;
    if (m.type === 'rematch') {
      if (!this.started || this.opponentRematch) return;
      this.opponentRematch = true;
      this.onChange();
      await this.dealRematch();
      return;
    }
    // The guest accepts the host's rematch deal only after asking for one itself.
    if (m.type === 'start' && m.rematch === true && !this.isHost && this.started && this.wantRematch && this.opponentRematch) {
      this.wantRematch = this.opponentRematch = false;
      this.started = false;
    }
    if (m.type === 'start' && !this.isHost && !this.started) {
      if (!this.ready || !this.opponent.ready || !Array.isArray(m.seed) || m.seed.length !== 4
        || !m.seed.every(s => typeof s === 'string' && /^\d{1,20}$/.test(s) && BigInt(s) < (1n << 64n))
        || (m.first !== 0 && m.first !== 1)) throw new Error(t('Invalid duel setup.'));
      this.makeNetwork(m.seed as DuelNetwork['seed']);
      await this.send({ type: 'ack' });
      this.start(m.first === 0 ? 1 : 0);
    } else if (m.type === 'ack' && this.isHost && this.pendingSeed && !this.started) {
      clearTimeout(this.handshakeTimer);
      this.start(this.pendingFirst);
    } else if (m.type === 'decision' && this.network) {
      this.network.receive(m.packet as DecisionPacket);
    } else if (m.type === 'chat') {
      const text = cleanChat(m.text);
      if (!text || Date.now() - this.receivedChat < 800) return;
      this.receivedChat = Date.now();
      this.addChat(this.opponent.name, text);
    } else if (m.type === 'forfeit') {
      const reason = m.timeout === true ? t('Your opponent ran out of time.') : t('Your opponent surrendered.');
      this.network?.abort(reason);
      this.onEnd(reason, true);
    } else if (m.type === 'leave') {
      this.fail(m.timeout === true ? t('Your opponent ran out of time.') : m.surrender === true ? t('Your opponent surrendered.') : t('Your opponent left the room.'), m.surrender === true);
    }
  }
  private makeNetwork(seed: DuelNetwork['seed']) {
    this.network = new Lockstep(seed, packet => this.send({ type: 'decision', packet }));
  }
  private start(first: 0 | 1) {
    if (!this.network || !this.opponent || this.started) return;
    this.started = true;
    this.onStart({ name: this.hello.name, opponent: this.opponent.name, deck: this.hello.deck,
      opponentDeck: this.opponent.deck, first, network: this.network, session: this,
      looks: [{ avatar: this.hello.avatar, country: this.hello.country }, { avatar: this.opponent.avatar, country: this.opponent.country }] });
  }
  async setReady() {
    if (this.started || !this.opponent || this.ready) return;
    this.ready = true;
    await this.send({ ...this.hello, ready: true });
    this.onChange();
    // Host may be the second player to press Ready.
    if (this.isHost && this.opponent.ready) await this.receive(encode(this.opponent), this.peer!);
  }
  private addChat(name: string, text: string, self = false) {
    const who = self ? this.hello : this.opponent;
    const line = { name, text, at: Date.now(), self, avatar: who?.avatar, country: who?.country };
    this.chat.push(line);
    if (this.chat.length > 100) this.chat.shift();
    this.onChat(line);
  }
  async say(text: string) {
    text = cleanChat(text);
    if (!text || Date.now() - this.lastChat < 800 || !this.peer) return;
    this.lastChat = Date.now();
    await this.send({ type: 'chat', text });
    this.addChat(this.hello.name, text, true);
  }
  fail(reason: string, surrendered = false, bug = false) {
    if (this.closed) return;
    this.error = reason;
    this.network?.abort(reason, bug);
    this.onChange();
    this.onEnd(reason, surrendered);
  }
  /** Lose the current duel (surrender or clock) without leaving the room. */
  async forfeit(timeout = false) {
    if (this.closed) return;
    this.network?.abort(timeout ? t('You ran out of time.') : t('You surrendered.'));
    try { await this.send({ type: 'forfeit', timeout }); } catch {}
  }
  async leave(surrender = false, timeout = false) {
    if (this.closed) return;
    try { await this.send({ type: 'leave', surrender, timeout }); } catch {}
    this.closed = true;
    clearTimeout(this.connectionTimer);
    clearTimeout(this.handshakeTimer);
    this.network?.abort(t('You left the duel.'));
    await this.room.leave();
  }
}
