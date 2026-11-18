/**
 * The public lobby over Nostr: presence, chat and challenge invites travel as signed ephemeral events through
 * public relays, so there is no player cap and no peer-to-peer mesh. Duels still connect peer to peer (client.ts).
 */
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type Event } from 'nostr-tools/pure';
import * as nip44 from 'nostr-tools/nip44';
import { cleanName, cleanChat } from './protocol';
import { cleanCountry, cleanSeed, type Look } from './profile';
import { t } from '../i18n';
import { GAME_RELAY, type RelayStatus } from './relays';
import { serverNow, syncClock } from './clock';

export type ChatLine = { name: string; text: string; system?: boolean; at?: number; self?: boolean; avatar?: string; country?: string };
export type PeerProfile = { name: string; busy: boolean; avatar?: string; country?: string };

/**
 * The game's own relay, then public relays tested to accept and fan out ephemeral events from fresh keys. Events go to
 * all of them and are de-duplicated. (nostr.oxtr.dev was dropped: it refused every event, its disk was full.)
 */
export const LOBBY_RELAYS = [GAME_RELAY, 'wss://relay.primal.net', 'wss://relay.nostr.net', 'wss://relay.snort.social', 'wss://offchain.pub'];
/** Ephemeral kind (20000-29999): relays forward these to subscribers and do not store them. */
export const LOBBY_KIND = 25050;
export const LOBBY_TAG = 'duelorigins-lobby-v1';
const HEARTBEAT_MS = 25000, EXPIRE_MS = 70000, MAX_AGE_S = 120, MAX_PEERS = 1000;
const CODE = /^[A-HJ-NP-Z2-9]{12}$/;
/** Seconds on the server's clock: the device's own clock may be minutes off (clock.ts). */
const now = () => Math.floor(serverNow() / 1000);

/** What the lobby needs from the relays; tests swap in an in-memory bus. */
export interface LobbyTransport {
  publish(event: Event): Promise<void>;
  /** `since`: seconds on the server's clock; relays send nothing older (some keep a backlog of lobby events). */
  subscribe(onEvent: (event: Event) => void, since?: number): () => void;
  close(): void;
  /** Which relays are connected; transports without real relays leave it out. */
  status?(): RelayStatus;
}
export function nostrTransport(relays = LOBBY_RELAYS): LobbyTransport {
  const pool = new SimplePool({ enableReconnect: true });
  return {
    async publish(event) {
      const results = await Promise.allSettled(pool.publish(relays, event));
      if (!results.some(r => r.status === 'fulfilled')) throw new Error('No relay accepted the event.');
    },
    subscribe(onEvent, since) {
      // `since` comes from the server's clock (clock.ts): from the device clock, a phone running fast got nothing
      const sub = pool.subscribe(relays, { kinds: [LOBBY_KIND], '#t': [LOBBY_TAG], ...(since ? { since } : {}) }, { onevent: onEvent });
      return () => sub.close();
    },
    close() { pool.close(relays); },
    status() {
      const known = pool.listConnectionStatus();
      const status = Object.fromEntries(relays.map((url) => [url, known.get(url) ?? known.get(url + '/') ?? false]));
      return { connected: Object.values(status).filter(Boolean).length, total: relays.length, relays: status };
    },
  };
}

export class Lobby {
  readonly peers = new Map<string, PeerProfile>();
  readonly chat: ChatLine[] = [];
  /** This session's public key: other players address challenges to it. */
  readonly id: string;
  private secret = generateSecretKey();
  private seen = new Map<string, number>();
  private rate = new Map<string, number>();
  private busy = false;
  private lastChat = 0;
  private closed = false;
  /** Events thrown away as too old or too new: many with nobody in the lobby points at a clock problem. */
  stale = 0;
  private unsubscribe = () => {};
  private timers: ReturnType<typeof setInterval>[] = [];
  onChange = () => {};
  onInvite = (_peer: string, _code: string) => {};
  onDecline = (_peer: string, _code: string) => {};
  onError = (_message: string, _code?: string) => {};

  constructor(public name: string, private look: Look, private transport: LobbyTransport = nostrTransport()) {
    this.id = getPublicKey(this.secret);
    // listening and the first announcement wait (briefly) for the server's time, so neither uses a wrong clock
    void Promise.race([syncClock(), new Promise((resolve) => setTimeout(resolve, 3000))]).then(() => {
      if (this.closed) return;
      this.unsubscribe = transport.subscribe(event => this.receive(event), now() - 30);
      void this.announce(true);
    });
    this.timers.push(setInterval(() => void this.announce(), HEARTBEAT_MS), setInterval(() => this.expire(), 10000));
  }
  get avatar() { return this.look.avatar; }
  /** How many lobby relays are connected, or null when the transport cannot tell. */
  relayStatus(): RelayStatus | null { return this.transport.status?.() ?? null; }
  setBusy(busy: boolean) { this.busy = busy; void this.announce(); }
  /** Change avatar or country and tell everyone. */
  setLook(look: Partial<Look>) { this.look = { ...this.look, ...look }; void this.announce(); }

  async say(text: string) {
    text = cleanChat(text);
    if (!text || Date.now() - this.lastChat < 800) return;
    this.lastChat = Date.now();
    this.addChat({ name: this.name, text, self: true, ...this.look });
    await this.send({ type: 'chat', text });
  }
  /** Invites and declines are NIP-44 encrypted to the recipient, so other relay listeners cannot read room codes. */
  async invite(peer: string, code: string) { await this.send({ type: 'invite', data: this.seal(peer, code) }, peer); }
  async decline(peer: string, code: string) { await this.send({ type: 'decline', data: this.seal(peer, code) }, peer); }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const t of this.timers) clearInterval(t);
    this.unsubscribe();
    // Give the goodbye a moment to reach the relays before the sockets close.
    void this.send({ type: 'leave' }, undefined, true).finally(() => setTimeout(() => this.transport.close(), 1500));
  }

  private seal(peer: string, code: string) { return nip44.encrypt(code, nip44.getConversationKey(this.secret, peer)); }
  private open(peer: string, data: unknown) {
    try { return typeof data === 'string' ? nip44.decrypt(data, nip44.getConversationKey(this.secret, peer)) : ''; } catch { return ''; }
  }
  private async send(content: Record<string, unknown>, to?: string, closing = false) {
    if (this.closed && !closing) return;
    const tags = [['t', LOBBY_TAG], ...(to ? [['p', to]] : [])];
    const event = finalizeEvent({ kind: LOBBY_KIND, created_at: now(), tags, content: JSON.stringify(content) }, this.secret);
    try { await this.transport.publish(event); }
    catch { if (!closing) this.onError(t('Lost touch with the matchmaking servers. Check your internet connection.'), 'relay-failed'); }
  }
  private async announce(ask = false) {
    await this.send({ type: 'presence', name: this.name, busy: this.busy, ...this.look, ...(ask ? { ask: true } : {}) });
  }
  private allow(key: string, interval: number) {
    const t = Date.now();
    if (t - (this.rate.get(key) ?? 0) < interval) return false;
    this.rate.set(key, t); return true;
  }
  private addChat(line: ChatLine) {
    const last = this.chat[this.chat.length - 1];
    // Reconnects and duplicate tabs repeat the same join/leave line; show it once.
    if (line.system && last?.system && last.text === line.text) { this.onChange(); return; }
    this.chat.push({ ...line, at: Date.now() });
    if (this.chat.length > 100) this.chat.shift();
    this.onChange();
  }
  private drop(peer: string) {
    const gone = this.peers.get(peer);
    this.peers.delete(peer); this.seen.delete(peer);
    for (const key of this.rate.keys()) if (key.startsWith(peer + ':')) this.rate.delete(key);
    if (gone) this.addChat({ name: '', text: `${gone.name} left`, system: true });
  }
  private expire() {
    const cutoff = Date.now() - EXPIRE_MS;
    for (const [peer, at] of this.seen) if (at < cutoff) this.drop(peer);
  }
  /** Everything from the relays is untrusted: check signature, tag, age, size and shape before use. */
  receive(event: Event) {
    if (this.closed || event.pubkey === this.id || event.kind !== LOBBY_KIND || event.content.length > 4096) return;
    if (!event.tags.some(t => t[0] === 't' && t[1] === LOBBY_TAG)) return;
    if (Math.abs(now() - event.created_at) > MAX_AGE_S) { this.stale++; return; }
    if (!verifyEvent(event)) return;
    let m: Record<string, unknown>;
    try { m = JSON.parse(event.content); } catch { return; }
    if (!m || typeof m !== 'object') return;
    const peer = event.pubkey;
    if (m.type === 'presence') {
      const name = cleanName(m.name);
      if (!name || typeof m.busy !== 'boolean' || !this.allow(peer + ':presence', 2000)) return;
      const known = this.peers.has(peer);
      if (!known && this.peers.size >= MAX_PEERS) return;
      this.peers.set(peer, { name, busy: m.busy, avatar: cleanSeed(m.avatar), country: cleanCountry(m.country) });
      this.seen.set(peer, Date.now());
      if (!known) this.addChat({ name: '', text: `${name} joined`, system: true });
      else this.onChange();
      // A newcomer asks who is here; answer after a random pause so a big lobby does not reply all at once.
      if (m.ask === true) setTimeout(() => void this.announce(), 300 + Math.random() * 2500);
      return;
    }
    if (!this.peers.has(peer)) return;
    this.seen.set(peer, Date.now());
    const forMe = event.tags.some(t => t[0] === 'p' && t[1] === this.id);
    if (m.type === 'chat') {
      if (!this.allow(peer + ':chat', 800)) return;
      const text = cleanChat(m.text), from = this.peers.get(peer)!;
      if (text) this.addChat({ name: from.name, text, avatar: from.avatar, country: from.country });
    } else if (m.type === 'invite' && forMe) {
      const code = this.open(peer, m.data);
      if (!CODE.test(code) || !this.allow(peer + ':invite', 10000)) return;
      if (this.busy) { void this.decline(peer, code); return; }
      this.onInvite(peer, code);
    } else if (m.type === 'decline' && forMe) {
      const code = this.open(peer, m.data);
      if (CODE.test(code)) this.onDecline(peer, code);
    } else if (m.type === 'leave') this.drop(peer);
  }
}
