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

export type ChatLine = { name: string; text: string; system?: boolean; at?: number; self?: boolean; avatar?: string; country?: string };
export type PeerProfile = { name: string; busy: boolean; avatar?: string; country?: string };

/** Relays tested to accept and fan out ephemeral events from fresh keys. Events go to all of them and are de-duplicated. */
export const LOBBY_RELAYS = ['wss://relay.primal.net', 'wss://relay.nostr.net', 'wss://relay.snort.social', 'wss://offchain.pub', 'wss://nostr.oxtr.dev'];
/** Ephemeral kind (20000-29999): relays forward these to subscribers and do not store them. */
export const LOBBY_KIND = 25050;
export const LOBBY_TAG = 'duelorigins-lobby-v1';
const HEARTBEAT_MS = 25000, EXPIRE_MS = 70000, MAX_AGE_S = 120, MAX_PEERS = 1000;
const CODE = /^[A-HJ-NP-Z2-9]{12}$/;
/** This device's clock, in whole seconds. Lobby times add the measured skew to it (Lobby.now). */
const deviceNow = () => Math.floor(Date.now() / 1000);

/**
 * How many seconds this device's clock is behind real time, read from the game's own web server (its Date header).
 * A PC clock a few minutes off would otherwise date every lobby event wrongly and drop everyone else's as stale, so
 * that player would see an empty lobby and nobody would see them. Undefined when the server cannot be asked.
 */
export async function measureClockSkew(url = typeof location === 'undefined' ? '' : location.href): Promise<number | undefined> {
  if (!url) return undefined;
  try {
    const sent = Date.now();
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const received = Date.now();
    const server = Date.parse(response.headers.get('date') ?? '');
    // the header is truncated to the second: +500 ms centres it; the request's travel time is split evenly
    return Number.isFinite(server) ? Math.round((server + 500 - (sent + received) / 2) / 1000) : undefined;
  } catch { return undefined; }
}

/** What the lobby needs from the relays; tests swap in an in-memory bus. */
export interface LobbyTransport {
  publish(event: Event): Promise<void>;
  subscribe(onEvent: (event: Event) => void): () => void;
  close(): void;
  /** How many relays are connected, of how many. */
  status?(): { connected: number; total: number };
}
export function nostrTransport(relays = LOBBY_RELAYS): LobbyTransport {
  const pool = new SimplePool({ enableReconnect: true });
  return {
    async publish(event) {
      const results = await Promise.allSettled(pool.publish(relays, event));
      if (!results.some(r => r.status === 'fulfilled')) throw new Error('No relay accepted the event.');
    },
    subscribe(onEvent) {
      // No `since`: lobby events are ephemeral (relays forward them live and never store them), and a time filter
      // taken from a wrong device clock would silently hide every player.
      const sub = pool.subscribe(relays, { kinds: [LOBBY_KIND], '#t': [LOBBY_TAG] }, { onevent: onEvent });
      return () => sub.close();
    },
    close() { pool.close(relays); },
    status() {
      const states = pool.listConnectionStatus();
      return { connected: relays.filter(url => states.get(url) || states.get(url + '/')).length, total: relays.length };
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
  private unsubscribe: () => void;
  private timers: ReturnType<typeof setInterval>[] = [];
  /** Seconds to add to this device's clock (see measureClockSkew), and whether the server or other players told us. */
  private skew = 0;
  private clockKnown = false;
  /** Other players' clocks relative to ours, from events too far off to accept: a fallback when the server cannot say. */
  private clockSamples = new Map<string, number>();
  onChange = () => {};
  onInvite = (_peer: string, _code: string) => {};
  onDecline = (_peer: string, _code: string) => {};
  onError = (_message: string, _code?: string) => {};

  constructor(public name: string, private look: Look, private transport: LobbyTransport = nostrTransport(),
    clock: () => Promise<number | undefined> = measureClockSkew) {
    this.id = getPublicKey(this.secret);
    this.unsubscribe = transport.subscribe(event => this.receive(event));
    void this.announce(true);
    this.timers.push(setInterval(() => void this.announce(), HEARTBEAT_MS), setInterval(() => this.expire(), 10000));
    void clock().then(skew => { if (skew !== undefined) this.setSkew(skew); });
    // If most relays cannot be reached, players who only reach the others may be missing: say why.
    const check = setTimeout(() => {
      const status = this.transport.status?.();
      if (!this.closed && status && status.connected > 0 && status.connected < Math.min(2, status.total)) {
        this.addChat({ name: '', system: true, text: t('Only {n} of {total} lobby servers answered. If players are missing, a browser extension, antivirus or network filter may be blocking the others.', status) });
      }
    }, 10000);
    this.timers.push(check as unknown as ReturnType<typeof setInterval>);
  }
  /** Lobby time: this device's clock corrected by the measured skew. */
  now() { return deviceNow() + this.skew; }
  private setSkew(skew: number) {
    this.clockKnown = true;
    if (Math.abs(skew - this.skew) < 5) return;
    this.skew = skew;
    void this.announce(true); // our earlier announcements were dated wrongly: introduce ourselves again
  }
  /**
   * An event too far from our clock to accept. If at least two other players agree that our clock is off (within 30 s
   * of each other), trust them: used only when the web server could not tell us the time.
   */
  private learnClock(peer: string, offset: number) {
    if (this.clockKnown) return;
    this.clockSamples.set(peer, offset);
    if (this.clockSamples.size > 50) this.clockSamples.delete(this.clockSamples.keys().next().value!);
    const sorted = [...this.clockSamples.values()].sort((a, b) => a - b);
    if (sorted.length < 2) return;
    const median = sorted[Math.floor(sorted.length / 2)];
    if (sorted.filter(v => Math.abs(v - median) <= 30).length >= 2) this.setSkew(this.skew + median);
  }
  get avatar() { return this.look.avatar; }
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
    const event = finalizeEvent({ kind: LOBBY_KIND, created_at: this.now(), tags, content: JSON.stringify(content) }, this.secret);
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
    const offset = event.created_at - this.now();
    if (Math.abs(offset) > MAX_AGE_S) {
      // relays forward lobby events live, so a far-off date means one of the two clocks is wrong
      if (!this.clockKnown && verifyEvent(event)) this.learnClock(event.pubkey, offset);
      return;
    }
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
