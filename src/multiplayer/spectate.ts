/**
 * Spectating online duels. A duel's host also opens a watch room ("watch-" + its watch code, announced in the lobby).
 * A spectator joins it and gets the duel's setup (names, decks, seed, who goes first) and every decision so far, then
 * each new one as it is made. The spectator's own engine replays them, exactly as both players' engines do
 * (lockstep.ts), so the board, animations and log are the same. Spectators only listen: nothing they send reaches
 * the duel.
 */
import type { joinRoom, Room } from 'trystero';
import type { OcgMessage, OcgResponse } from 'ocgcore-wasm';
import type { DeckList } from '../engine/duel';
import { decode, encode, fingerprint, validDeck, cleanName, cleanChat } from './protocol';
import { cleanCountry, cleanSeed, cleanTeam, type Look } from './profile';
import type { DecisionPacket, DuelNetwork, Lockstep } from './lockstep';
import { DUEL_ENDED } from './lockstep';
import { t } from '../i18n';
import type { DuelInit } from '../scenes/DuelScene';
import type { Opponent } from '../data/decks';
import type { ChatLine, Lobby } from './lobby';

/** Spectators per duel: each one adds to the host's upload. */
export const MAX_SPECTATORS = 8;
/** Decisions per history message, so a long duel stays under the 32 KB message limit. */
const HISTORY_CHUNK = 100;
/** Chat lines a spectator who joins late still gets. */
const CHAT_KEPT = 50;
const CODE = /^[A-HJ-NP-Z2-9]{12}$/;
const SEED = /^\d{1,20}$/;

/** One duel as the host sees it: index 0 is the host, 1 the guest; `first` is the host's (0: the host goes first). */
export interface WatchSetup {
  game: number;
  revision: string;
  names: [string, string];
  looks: [Partial<Look>, Partial<Look>];
  decks: [DeckList, DeckList];
  first: 0 | 1;
  seed: DuelNetwork['seed'];
}
/** How a duel ended other than on the board: which player (0 host, 1 guest) surrendered, timed out or left. */
export type WatchEnd = { game: number; player: 0 | 1; how: 'surrender' | 'timeout' | 'left' };

export const isWatchCode = (value: unknown): value is string => typeof value === 'string' && CODE.test(value);
const watchRoomId = (code: string) => 'watch-' + code;
type RoomFactory = typeof joinRoom;
type RoomConfig = Parameters<RoomFactory>[0];

/** The host's side: answers spectators with the setup and history, then forwards each decision. */
export class WatchHost {
  private room: Room;
  private action;
  private viewers = new Set<string>();
  private setup?: WatchSetup;
  private history: DecisionPacket[] = [];
  private chatLog: { side: 0 | 1; text: string }[] = [];
  private closed = false;
  constructor(readonly code: string, factory: RoomFactory, config: RoomConfig) {
    this.room = factory({ ...config, maxUsers: MAX_SPECTATORS + 1, password: code }, watchRoomId(code));
    this.action = this.room.makeAction('watch');
    this.action.onMessage((raw, { peerId }) => this.receive(raw, peerId));
    this.room.onPeerLeave(({ peerId }) => { this.viewers.delete(peerId); });
  }
  get spectators() { return this.viewers.size; }
  /** A new duel (or rematch) in this room: spectators already watching switch to it. */
  start(setup: Omit<WatchSetup, 'game'>, network: Lockstep) {
    if (this.closed) return;
    this.setup = { ...setup, game: (this.setup?.game ?? 0) + 1 };
    this.history = [];
    const game = this.setup.game;
    network.onDecision = packet => {
      if (this.closed || this.setup?.game !== game) return;
      this.history.push(packet);
      this.broadcast({ type: 'decision', game, packet });
    };
    this.broadcast({ type: 'setup', setup: this.setup });
  }
  /** A line of the players' chat (0: the host wrote it, 1: the guest); spectators read it. */
  chat(side: 0 | 1, text: string) {
    if (this.closed) return;
    this.chatLog.push({ side, text });
    if (this.chatLog.length > CHAT_KEPT) this.chatLog.shift();
    this.broadcast({ type: 'chat', side, text });
  }
  end(player: 0 | 1, how: WatchEnd['how']) {
    if (this.setup) this.broadcast({ type: 'end', end: { game: this.setup.game, player, how } satisfies WatchEnd });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    void this.room.leave();
  }
  private receive(raw: unknown, peer: string) {
    if (this.closed || typeof raw !== 'string' || raw.length > 1024) return;
    let m: Record<string, unknown>;
    try { m = decode(raw) as Record<string, unknown>; } catch { return; }
    if (m?.type !== 'watch') return;
    if (!this.viewers.has(peer) && this.viewers.size >= MAX_SPECTATORS) { void this.send({ type: 'refused', reason: 'full' }, [peer]); return; }
    if (!this.setup) return;
    if (m.revision !== this.setup.revision) { void this.send({ type: 'refused', reason: 'version' }, [peer]); return; }
    this.viewers.add(peer);
    void this.catchUp(peer);
  }
  /** The setup, then the decisions so far in chunks; new decisions follow through broadcast. */
  private async catchUp(peer: string) {
    const setup = this.setup!;
    await this.send({ type: 'setup', setup }, [peer]);
    if (this.chatLog.length) await this.send({ type: 'chatlog', lines: this.chatLog }, [peer]);
    for (let from = 0; from < this.history.length; from += HISTORY_CHUNK) {
      await this.send({ type: 'history', game: setup.game, packets: this.history.slice(from, from + HISTORY_CHUNK) }, [peer]);
    }
  }
  private broadcast(value: unknown) {
    if (this.viewers.size) void this.send(value, [...this.viewers]);
  }
  private async send(value: unknown, targets: string[]) {
    try { await this.action.send(encode(value), { target: targets }); } catch { /* a spectator dropping never touches the duel */ }
  }
}

/** A duel network fed only by the host's stream: every decision, both players', comes from it in order. */
export class SpectatorNetwork implements DuelNetwork {
  private seq = 0;
  private received = 0;
  private queued = new Map<number, DecisionPacket>();
  private waiter?: { seq: number; resolve: (packet: DecisionPacket) => void; reject: (error: Error) => void };
  private failure?: Error;
  constructor(public seed: DuelNetwork['seed']) {}
  /** Decisions already received but not yet replayed: while there are many, the duel catches up without animations. */
  get backlog() { return this.received - this.seq; }
  receive(packet: DecisionPacket) {
    if (this.failure || !validPacket(packet) || packet.seq < this.seq || this.queued.has(packet.seq)) return;
    if (packet.seq > this.seq + 100000) return;
    this.received = Math.max(this.received, packet.seq + 1);
    if (this.waiter?.seq === packet.seq) { this.waiter.resolve(packet); this.waiter = undefined; }
    else this.queued.set(packet.seq, packet);
  }
  abort(reason: string) {
    if (!this.failure) { this.failure = new Error(reason); this.failure.name = DUEL_ENDED; }
    this.waiter?.reject(this.failure);
    this.waiter = undefined;
    this.queued.clear();
  }
  async exchange(message: OcgMessage): Promise<OcgResponse | undefined> {
    if (this.failure) throw this.failure;
    const seq = this.seq;
    const packet = this.queued.get(seq) ?? await new Promise<DecisionPacket>((resolve, reject) => { this.waiter = { seq, resolve, reject }; });
    if (packet.prompt !== fingerprint(message)) {
      this.abort(t('The duel went out of sync. Reload the page and watch again.'));
      throw this.failure;
    }
    this.queued.delete(seq);
    this.seq++;
    return packet.response ?? undefined;
  }
}

function validPacket(packet: unknown): packet is DecisionPacket {
  const p = packet as DecisionPacket;
  return !!p && typeof p === 'object' && Number.isSafeInteger(p.seq) && p.seq >= 0 && typeof p.prompt === 'string' && p.prompt.length <= 16
    && (p.response === null || (typeof p.response === 'object' && Number.isInteger((p.response as { type?: unknown }).type)));
}
function validSetup(value: unknown): value is WatchSetup {
  const s = value as WatchSetup;
  return !!s && typeof s === 'object' && Number.isSafeInteger(s.game) && typeof s.revision === 'string'
    && Array.isArray(s.names) && s.names.length === 2 && s.names.every(name => !!cleanName(name))
    && Array.isArray(s.decks) && s.decks.length === 2 && s.decks.every(deck => validDeck(deck))
    && (s.first === 0 || s.first === 1)
    && Array.isArray(s.seed) && s.seed.length === 4 && s.seed.every(part => typeof part === 'string' && SEED.test(part) && BigInt(part) < (1n << 64n));
}

/** A spectator's connection to one watch room. */
export class Spectator {
  network?: SpectatorNetwork;
  setup?: WatchSetup;
  /** The players' chat, read-only (the duel chat drawer shows it). */
  readonly chat: ChatLine[] = [];
  onChat = (_line?: ChatLine) => {};
  /** A duel to show: the first one, or the next after a rematch. */
  onSetup = (_setup: WatchSetup, _network: SpectatorNetwork) => {};
  onEnd = (_end: WatchEnd) => {};
  onError = (_message: string) => {};
  private room: Room;
  private action;
  private host?: string;
  private closed = false;
  private timer: ReturnType<typeof setTimeout>;
  constructor(readonly code: string, private revision: string, factory: RoomFactory, config: RoomConfig) {
    this.room = factory({ ...config, maxUsers: MAX_SPECTATORS + 1, password: code }, watchRoomId(code));
    this.action = this.room.makeAction('watch');
    this.action.onMessage((raw, { peerId }) => this.receive(raw, peerId));
    // ask everyone already in the room; only the host answers
    this.room.onPeerJoin(({ peerId }) => { void this.action.send(encode({ type: 'watch', revision }), { target: peerId }).catch(() => {}); });
    this.room.onPeerLeave(({ peerId }) => {
      if (peerId === this.host) this.fail(t('The duel ended: the players left.'));
    });
    this.timer = setTimeout(() => { if (!this.setup) this.fail(t("Couldn't reach that duel. It may have just ended.")); }, 20000);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    clearTimeout(this.timer);
    this.network?.abort(t('You stopped watching.'));
    void this.room.leave();
  }
  private fail(message: string) {
    if (this.closed) return;
    this.network?.abort(message);
    this.onError(message);
  }
  private addChat(side: unknown, raw: unknown, notify = true) {
    const text = cleanChat(raw);
    if (!this.setup || (side !== 0 && side !== 1) || !text) return;
    const look = this.setup.looks[side];
    const line: ChatLine = { name: this.setup.names[side], text, at: Date.now(), side, avatar: look.avatar, country: look.country, team: look.team };
    this.chat.push(line);
    if (this.chat.length > 100) this.chat.shift();
    if (notify) this.onChat(line);
  }
  private receive(raw: unknown, peer: string) {
    if (this.closed || typeof raw !== 'string' || raw.length > 32768) return;
    let m: Record<string, unknown>;
    try { m = decode(raw) as Record<string, unknown>; } catch { return; }
    if (!m || typeof m !== 'object' || (this.host && peer !== this.host)) return;
    if (m.type === 'refused') {
      this.fail(m.reason === 'full' ? t('This duel already has the most spectators.') : t('This duel runs on a different game version. Reload the page to watch it.'));
      return;
    }
    if (m.type === 'setup') {
      if (!validSetup(m.setup) || m.setup.revision !== this.revision) return;
      if (this.setup && m.setup.game <= this.setup.game) return;
      this.host = peer;
      clearTimeout(this.timer);
      const setup = m.setup;
      this.setup = {
        ...setup,
        names: [cleanName(setup.names[0]), cleanName(setup.names[1])],
        looks: [0, 1].map(i => ({ avatar: cleanSeed(setup.looks?.[i]?.avatar), country: cleanCountry(setup.looks?.[i]?.country), team: cleanTeam(setup.looks?.[i]?.team) })) as WatchSetup['looks'],
      };
      this.network?.abort(t('A new duel started.'));
      this.network = new SpectatorNetwork(this.setup.seed);
      this.onSetup(this.setup, this.network);
      return;
    }
    if (!this.setup) return;
    // chat carries on across rematches: it belongs to the room, not one duel
    if (m.type === 'chat') { this.addChat(m.side, m.text); return; }
    if (m.type === 'chatlog' && Array.isArray(m.lines)) {
      for (const line of m.lines.slice(-CHAT_KEPT)) this.addChat((line as { side?: unknown })?.side, (line as { text?: unknown })?.text, false);
      this.onChat();
      return;
    }
    if (!this.network || m.game !== this.setup.game) return;
    if (m.type === 'decision') this.network.receive(m.packet as DecisionPacket);
    else if (m.type === 'history' && Array.isArray(m.packets)) for (const packet of m.packets) this.network.receive(packet as DecisionPacket);
    else if (m.type === 'end') {
      const end = m.end as WatchEnd;
      if (end && (end.player === 0 || end.player === 1) && ['surrender', 'timeout', 'left'].includes(end.how)) this.onEnd(end);
    }
  }
}

/** Plain-language end of a watched duel that stopped off the board. */
export function watchEndText(end: WatchEnd, names: [string, string]) {
  const player = names[end.player];
  return end.how === 'surrender' ? t('{player} surrendered.', { player })
    : end.how === 'timeout' ? t('{player} ran out of time.', { player }) : t('{player} left the duel.', { player });
}

/** The duel screen for a spectated online duel: its host on the near side, the guest across, both hands shown. */
export function spectateInit(viewer: Spectator, setup: WatchSetup, network: SpectatorNetwork, lobby?: Lobby): DuelInit {
  const player = (side: 0 | 1): Opponent => ({ id: 'online', name: setup.names[side], title: t('Online duelist'), art: '', ace: '', style: '', deck: setup.decks[side], suggested: 'normal' });
  return { deck: setup.decks[0], deckName: setup.names[0], opp: player(1), watch: player(0), level: 'normal', startingLP: 8000, spectate: { viewer, setup, network }, lobby };
}
