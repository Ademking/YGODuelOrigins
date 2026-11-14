import { joinRoom, type Room } from 'trystero';
import type { DeckList } from '../engine/duel';
import { APP_ID, PROTOCOL, cleanName, cleanChat, validDeck, decode, encode } from './protocol';
import { Lockstep, type DecisionPacket, type DuelNetwork } from './lockstep';

export type ChatLine = { name: string; text: string; system?: boolean };
export type PeerProfile = { name: string; busy: boolean };
type Hello = { type: 'hello'; name: string; deck: DeckList; revision: string; host: boolean; ready: boolean; protocol: string };
export type Match = { name: string; opponent: string; deck: DeckList; opponentDeck: DeckList; first: 0 | 1; network: Lockstep; session: PrivateRoom };
const config = { appId: APP_ID, identity: 'none' as const, maxReceiveBytes: 32768 };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Connection failed.';
export class Lobby {
  readonly peers = new Map<string, PeerProfile>();
  readonly chat: ChatLine[] = [];
  private room: Room;
  private profile;
  private chatAction;
  private invites;
  private lastChat = 0;
  private rate = new Map<string, number>();
  private busy = false;
  onChange = () => {};
  onInvite = (_peer: string, _code: string) => {};
  onError = (_message: string) => {};
  constructor(public name: string) {
    this.room = joinRoom({ ...config, maxUsers: 64 }, 'lobby');
    this.profile = this.room.makeAction('profile');
    this.chatAction = this.room.makeAction('chat');
    this.invites = this.room.makeAction('invite');
    this.room.onPeerJoin(({ peerId }) => { void this.announce(peerId); });
    this.room.onPeerLeave(({ peerId }) => { this.peers.delete(peerId); for (const key of this.rate.keys()) if (key.startsWith(peerId + ':')) this.rate.delete(key); this.onChange(); });
    this.room.onError(error => this.onError(error.message));
    this.profile.onMessage((raw, { peerId }) => {
      const p = raw as PeerProfile;
      if (!p || !cleanName(p.name) || typeof p.busy !== 'boolean') return;
      this.peers.set(peerId, { name: cleanName(p.name), busy: p.busy });
      this.onChange();
    });
    this.chatAction.onMessage((raw, { peerId }) => {
      if (!this.allow(peerId + ':chat', 800)) return;
      const text = cleanChat(raw), peer = this.peers.get(peerId);
      if (text && peer) this.addChat({ name: peer.name, text });
    });
    this.invites.onMessage((raw, { peerId }) => {
      if (this.busy || !this.peers.has(peerId) || !this.allow(peerId + ':invite', 10000)) return;
      if (typeof raw === 'string' && /^[A-HJ-NP-Z2-9]{12}$/.test(raw)) this.onInvite(peerId, raw);
    });
  }
  private allow(key: string, interval: number) {
    const now = Date.now();
    if (now - (this.rate.get(key) ?? 0) < interval) return false;
    this.rate.set(key, now); return true;
  }
  private addChat(line: ChatLine) {
    this.chat.push(line);
    if (this.chat.length > 100) this.chat.shift();
    this.onChange();
  }
  private async announce(target?: string) {
    try { await this.profile.send({ name: this.name, busy: this.busy }, target ? { target } : undefined); }
    catch (e) { this.onError(errorText(e)); }
  }
  setBusy(busy: boolean) { this.busy = busy; void this.announce(); }
  async say(text: string) {
    text = cleanChat(text);
    if (!text || Date.now() - this.lastChat < 800) return;
    this.lastChat = Date.now();
    await this.chatAction.send(text);
    this.addChat({ name: this.name, text });
  }
  async invite(peer: string, code: string) { await this.invites.send(code, { target: peer }); }
  close() { void this.room.leave(); }
}

export class PrivateRoom {
  readonly chat: ChatLine[] = [];
  opponent?: Hello;
  network?: Lockstep;
  onChange = () => {};
  onChat = () => {};
  onStart = (_match: Match) => {};
  onEnd = (_reason: string, _surrendered: boolean) => {};
  error = '';
  private room: Room;
  private action;
  private peer?: string;
  private ready = false;
  private started = false;
  private pendingSeed?: DuelNetwork['seed'];
  private pendingFirst: 0 | 1 = 0;
  private closed = false;
  private lastChat = 0;
  private receivedChat = 0;
  private connectionTimer: ReturnType<typeof setTimeout>;
  private handshakeTimer?: ReturnType<typeof setTimeout>;
  constructor(public code: string, private hello: Hello, roomFactory: typeof joinRoom = joinRoom) {
    this.room = roomFactory({ ...config, maxUsers: 2, password: code }, 'duel-' + code);
    this.action = this.room.makeAction('duel');
    this.action.onMessage((raw, { peerId }) => { void this.receive(raw, peerId).catch(e => this.fail(errorText(e))); });
    this.room.onPeerJoin(({ peerId }) => { void this.send({ ...hello, ready: this.ready }, peerId).catch(e => this.fail(errorText(e))); });
    this.room.onPeerLeave(({ peerId }) => { if (peerId === this.peer) this.fail('Your opponent disconnected.'); });
    this.room.onError(error => { if (!this.opponent) { this.error = error.message; this.onChange(); } });
    this.connectionTimer = setTimeout(() => {
      if (!this.opponent) { this.error = 'Still waiting for a connection. Check the code, keep both tabs open, or try another network. Some networks require a TURN relay.'; this.onChange(); }
    }, 30000);
  }
  static async create(code: string, host: boolean, name: string, deck: DeckList) {
    const response = await fetch(`${import.meta.env.BASE_URL}ocgcore/revision`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Could not verify the duel engine version. Reload and try again.');
    const revision = (await response.text()).trim();
    return new PrivateRoom(code, { type: 'hello', protocol: PROTOCOL, host, name, deck: structuredClone(deck), revision, ready: false });
  }
  get isHost() { return this.hello.host; }
  get isReady() { return this.ready; }
  get hasStarted() { return this.started; }
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
      if (m.protocol !== PROTOCOL || m.revision !== this.hello.revision) throw new Error('Different game versions. Both players should reload the same deployment.');
      if (typeof m.host !== 'boolean' || m.host === this.hello.host) throw new Error('This room already has a host. Join using their code.');
      if (!cleanName(m.name) || !validDeck(m.deck) || typeof m.ready !== 'boolean') throw new Error('Opponent sent invalid deck or profile data.');
      const firstHello = !this.peer;
      this.peer = peer;
      this.opponent = { ...m, name: cleanName(m.name) } as Hello;
      this.error = '';
      clearTimeout(this.connectionTimer);
      if (firstHello) await this.send({ ...this.hello, ready: this.ready });
      this.onChange();
      if (this.isHost && this.ready && this.opponent.ready && !this.pendingSeed) {
        this.pendingSeed = Array.from(crypto.getRandomValues(new BigUint64Array(4)), String) as DuelNetwork['seed'];
        this.pendingFirst = crypto.getRandomValues(new Uint8Array(1))[0] % 2 as 0 | 1;
        this.makeNetwork(this.pendingSeed);
        this.handshakeTimer = setTimeout(() => this.fail('Opponent did not acknowledge the duel. Recreate the room.'), 20000);
        await this.send({ type: 'start', seed: this.pendingSeed, first: this.pendingFirst });
      }
      return;
    }
    if (!this.peer || peer !== this.peer || !this.opponent) return;
    if (m.type === 'start' && !this.isHost && !this.started) {
      if (!this.ready || !this.opponent.ready || !Array.isArray(m.seed) || m.seed.length !== 4
        || !m.seed.every(s => typeof s === 'string' && /^\d{1,20}$/.test(s) && BigInt(s) < (1n << 64n))
        || (m.first !== 0 && m.first !== 1)) throw new Error('Invalid duel setup.');
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
    } else if (m.type === 'leave') {
      this.fail(m.surrender === true ? 'Your opponent surrendered.' : 'Your opponent left the room.', m.surrender === true);
    }
  }
  private makeNetwork(seed: DuelNetwork['seed']) {
    this.network = new Lockstep(seed, packet => this.send({ type: 'decision', packet }));
  }
  private start(first: 0 | 1) {
    if (!this.network || !this.opponent || this.started) return;
    this.started = true;
    this.onStart({ name: this.hello.name, opponent: this.opponent.name, deck: this.hello.deck,
      opponentDeck: this.opponent.deck, first, network: this.network, session: this });
  }
  async setReady() {
    if (this.started || !this.opponent || this.ready) return;
    this.ready = true;
    await this.send({ ...this.hello, ready: true });
    this.onChange();
    // Host may be the second player to press Ready.
    if (this.isHost && this.opponent.ready) await this.receive(encode(this.opponent), this.peer!);
  }
  private addChat(name: string, text: string) {
    this.chat.push({ name, text });
    if (this.chat.length > 100) this.chat.shift();
    this.onChat();
  }
  async say(text: string) {
    text = cleanChat(text);
    if (!text || Date.now() - this.lastChat < 800 || !this.peer) return;
    this.lastChat = Date.now();
    await this.send({ type: 'chat', text });
    this.addChat(this.hello.name, text);
  }
  fail(reason: string, surrendered = false) {
    if (this.closed) return;
    this.error = reason;
    this.network?.abort(reason);
    this.onChange();
    this.onEnd(reason, surrendered);
  }
  async leave(surrender = false) {
    if (this.closed) return;
    try { await this.send({ type: 'leave', surrender }); } catch {}
    this.closed = true;
    clearTimeout(this.connectionTimer);
    clearTimeout(this.handshakeTimer);
    this.network?.abort('You left the duel.');
    await this.room.leave();
  }
}
