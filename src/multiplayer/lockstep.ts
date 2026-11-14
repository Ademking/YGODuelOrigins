import type { OcgMessage, OcgResponse } from 'ocgcore-wasm';
import { fingerprint } from './protocol';

export type DecisionPacket = { seq: number; prompt: string; response: OcgResponse | null };
export interface DuelNetwork {
  seed: [string, string, string, string];
  exchange(message: OcgMessage, local: boolean, answer: () => Promise<OcgResponse | undefined>): Promise<OcgResponse | undefined>;
}
/** Ordered, bounded decisions, scoped to one opponent and one private room by the transport. */
export class Lockstep implements DuelNetwork {
  private seq = 0;
  private queued = new Map<number, DecisionPacket>();
  private waiter?: { seq: number; resolve: (packet: DecisionPacket) => void; reject: (error: Error) => void };
  private failure?: Error;
  constructor(public seed: DuelNetwork['seed'], private send: (packet: DecisionPacket) => Promise<void>, private timeout = 180000) {}
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
  }
  async exchange(message: OcgMessage, local: boolean, answer: () => Promise<OcgResponse | undefined>) {
    if (this.failure) throw this.failure;
    const seq = this.seq, prompt = fingerprint(message);
    if (local) {
      if (this.queued.has(seq)) throw new Error('Opponent sent a decision out of turn.');
      const response = await answer();
      if (this.failure) throw this.failure;
      await this.send({ seq, prompt, response: response ?? null });
      this.seq++;
      return response;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const packet = this.queued.get(seq) ?? await new Promise<DecisionPacket>((resolve, reject) => {
      this.waiter = { seq, resolve, reject };
      timer = setTimeout(() => { this.abort('Opponent did not respond. Return to the lobby and reconnect.'); }, this.timeout);
    }).finally(() => { if (timer) clearTimeout(timer); });
    if (packet.prompt !== prompt) { this.abort('The duel went out of sync. Both players must use the same game version.'); throw this.failure; }
    this.queued.delete(seq);
    this.seq++;
    return packet.response ?? undefined;
  }
}
