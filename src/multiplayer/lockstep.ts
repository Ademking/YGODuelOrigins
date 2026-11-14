import type { OcgMessage, OcgResponse } from 'ocgcore-wasm';
import { fingerprint } from './protocol';

export type DecisionPacket = { seq: number; prompt: string; response: OcgResponse | null };
export interface DuelNetwork {
  seed: [string, string, string, string];
  exchange(message: OcgMessage, local: boolean, answer: () => Promise<OcgResponse | undefined>): Promise<OcgResponse | undefined>;
}
/** Thinking time each player gets for the whole duel. */
export const CLOCK_MS = 10 * 60 * 1000;
/** Chess clock: a side's time runs only while the duel waits on that side's decision. Index 0 is this client. */
export class DuelClock {
  private left: [number, number];
  private running: 0 | 1 | null = null;
  private since = 0;
  constructor(ms = CLOCK_MS, private now = () => Date.now()) { this.left = [ms, ms]; }
  get active() { return this.running; }
  start(who: 0 | 1) { this.stop(); this.running = who; this.since = this.now(); }
  stop() {
    if (this.running === null) return;
    this.left[this.running] = this.remaining(this.running);
    this.running = null;
  }
  remaining(who: 0 | 1) { return Math.max(0, this.left[who] - (this.running === who ? this.now() - this.since : 0)); }
}
/** Ordered, bounded decisions, scoped to one opponent and one private room by the transport. */
export class Lockstep implements DuelNetwork {
  private seq = 0;
  private queued = new Map<number, DecisionPacket>();
  private waiter?: { seq: number; resolve: (packet: DecisionPacket) => void; reject: (error: Error) => void };
  private failure?: Error;
  readonly clock: DuelClock;
  /** `timeout` caps how long to wait for one remote decision; by default the opponent's clock plus a grace period decides. */
  constructor(public seed: DuelNetwork['seed'], private send: (packet: DecisionPacket) => Promise<void>, private timeout = Infinity, clockMs = CLOCK_MS) {
    this.clock = new DuelClock(clockMs);
  }
  receive(packet: DecisionPacket) {
    if (this.failure) return;
    if (!packet || !Number.isSafeInteger(packet.seq) || packet.seq < 0 || typeof packet.prompt !== 'string'
      || packet.prompt.length > 16 || (packet.response !== null && (typeof packet.response !== 'object' || !Number.isInteger(packet.response?.type)))) {
      this.abort('Invalid duel message.'); return;
    }
    if (packet.seq < this.seq) return; // retransmitted decision already applied
    if (packet.seq > this.seq + 64 || this.queued.size >= 64) { this.abort('Duel synchronization failed.'); return; }
    if (this.waiter?.seq === packet.seq) { this.waiter.resolve(packet); this.waiter = undefined; }
    else if (!this.queued.has(packet.seq)) this.queued.set(packet.seq, packet);
  }
  abort(reason: string) {
    this.failure ??= new Error(reason);
    this.waiter?.reject(this.failure);
    this.waiter = undefined;
    this.queued.clear();
    this.clock.stop();
  }
  async exchange(message: OcgMessage, local: boolean, answer: () => Promise<OcgResponse | undefined>) {
    if (this.failure) throw this.failure;
    const seq = this.seq, prompt = fingerprint(message);
    if (local) {
      if (this.queued.has(seq)) throw new Error('Opponent sent a decision out of turn.');
      this.clock.start(0);
      const response = await answer().finally(() => this.clock.stop());
      if (this.failure) throw this.failure;
      await this.send({ seq, prompt, response: response ?? null });
      this.seq++;
      return response;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const packet = this.queued.get(seq) ?? await new Promise<DecisionPacket>((resolve, reject) => {
      this.waiter = { seq, resolve, reject };
      this.clock.start(1);
      // The opponent's own client forfeits when their clock runs out; this grace only catches a dead connection.
      const wait = Math.min(this.timeout, this.clock.remaining(1) + 30000);
      timer = setTimeout(() => { this.abort('Opponent did not respond. Return to the lobby and reconnect.'); }, wait);
    }).finally(() => { if (timer) clearTimeout(timer); this.clock.stop(); });
    if (packet.prompt !== prompt) { this.abort('The duel went out of sync. Both players must use the same game version.'); throw this.failure; }
    this.queued.delete(seq);
    this.seq++;
    return packet.response ?? undefined;
  }
}
