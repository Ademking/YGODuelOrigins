// Test harness: build a duel in a chosen board state and answer prompts deterministically.
import { Duel, opp, type Card, type Controller, type Ev, type Prompt } from '../src/engine/duel';
import type { Side } from '../src/engine/types';
import { CARDS } from '../src/data/cards';

export type Answer = (p: Prompt, d: Duel, s: Side) => unknown;

/** Answers queued prompts in order; anything unqueued gets a fixed, simple default. */
export class TestCtl implements Controller {
  queue: Answer[] = [];
  seen: Prompt[] = [];
  async ask(p: Prompt, d: Duel, s: Side) {
    this.seen.push(p);
    const next = this.queue[0];
    if (next) {
      const r = next(p, d, s);
      if (r !== undefined) { this.queue.shift(); return r; }
    }
    switch (p.t) {
      case 'select': return p.cards.slice(0, p.min);
      case 'yesno': return true;
      case 'option': return p.ai ?? 0;
      case 'position': return 'atk';
      case 'chain': return null;
      case 'replay': return p.targets[0] ?? false;
      case 'main': return p.actions.find((a) => a.a === 'phase' && a.to === 'EP') ?? p.actions[p.actions.length - 1];
    }
  }
}

export const byName = (name: string) => {
  const c = CARDS.find((x) => x.name === name);
  if (!c) throw new Error(`No playable card named ${name}`);
  return c;
};

type Mon = string | { name: string; pos?: 'atk' | 'def'; faceUp?: boolean };
type ST = string | { name: string; faceUp?: boolean };
export interface SideSpec { hand?: string[]; m?: Mon[]; s?: ST[]; f?: string; gy?: string[]; deck?: string[]; extra?: string[]; banished?: string[]; lp?: number }

const FILLER = 'Seiyaryu'; // 2500/2300: never a valid search target in the tests

/** Duel at turn 3, player 0's Main Phase 1, with the given cards placed directly. */
export function setup(p0: SideSpec = {}, p1: SideSpec = {}, rng: () => number = () => 0.3) {
  const ctl: [TestCtl, TestCtl] = [new TestCtl(), new TestCtl()];
  const filler = byName(FILLER).id;
  const d = new Duel([{ main: [], extra: [] }, { main: [], extra: [] }], ['P0', 'P1'], ctl, () => {}, rng);
  d.turn = 3;
  d.tp = 0;
  d.phase = 'M1';
  d.listens = true;
  const add = (s: Side, name: string, zone: 'hand' | 'deck' | 'gy' | 'extra' | 'banished') => {
    const c = d.mkCard(byName(name), s, zone);
    c.faceUp = zone === 'gy' || zone === 'banished' || zone === 'extra';
    d.players[s][zone === 'gy' ? 'gy' : zone].push(c);
    return c;
  };
  ([p0, p1] as SideSpec[]).forEach((spec, i) => {
    const s = i as Side;
    const P = d.players[s];
    if (spec.lp !== undefined) P.lp = spec.lp;
    for (let k = 0; k < 10; k++) d.players[s].deck.push(d.mkCard(CARDS.find((c) => c.id === filler)!, s, 'deck'));
    for (const n of spec.deck ?? []) add(s, n, 'deck');
    for (const n of spec.hand ?? []) add(s, n, 'hand');
    for (const n of spec.gy ?? []) add(s, n, 'gy');
    for (const n of spec.extra ?? []) add(s, n, 'extra');
    for (const n of spec.banished ?? []) add(s, n, 'banished');
    for (const m of spec.m ?? []) {
      const o = typeof m === 'string' ? { name: m } : m;
      const c = add(s, o.name, 'hand');
      d.placeMonster(c, s, o.faceUp ?? true, o.pos ?? 'atk');
      c.turnIn = c.summonedTurn = 1;
    }
    for (const x of spec.s ?? []) {
      const o = typeof x === 'string' ? { name: x } : x;
      const c = add(s, o.name, 'hand');
      d.placeST(c, s, o.faceUp ?? false);
      c.turnIn = 1;
    }
    if (spec.f) { const c = add(s, spec.f, 'hand'); P.hand.splice(P.hand.indexOf(c), 1); P.f = c; Object.assign(c, { zone: 'fzone', slot: 0, faceUp: true, turnIn: 1 }); }
  });
  const find = (s: Side, name: string) => {
    const c = d.allCards().find((x) => x.owner === s && x.def.name === name) ?? d.allCards().find((x) => d.holder(x) === s && x.def.name === name);
    if (!c) throw new Error(`P${s} has no ${name}`);
    return c;
  };
  /** Activate an effect of `card` in an open Main Phase window and resolve the chain (opponent may respond). */
  async function act(card: Card, eff?: number, p: Side = d.holder(card), ev: Ev = { e: 'open', main: true, phase: d.phase }) {
    const i = eff ?? card.def.effects!.findIndex((_, k) => d.canActivate(card, k, p, [ev], 1));
    if (i < 0 || !d.canActivate(card, i, p, [ev], 1)) throw new Error(`${card.def.name} cannot be activated`);
    await d.activate(card, i, p, ev);
    await d.chainLoop(ev, opp(p));
    await d.settle();
  }
  const canAct = (card: Card, p: Side = d.holder(card), ev: Ev = { e: 'open', main: true, phase: d.phase }) =>
    (card.def.effects ?? []).some((_, k) => d.canActivate(card, k, p, [ev], 1));
  /** Queue answers for player s. */
  const answer = (s: Side, ...fns: Answer[]) => { ctl[s].queue.push(...fns); };
  return { d, ctl, find, act, canAct, answer, P0: d.players[0], P1: d.players[1] };
}

/** Answer helpers. */
export const pickNamed = (...names: string[]): Answer => (p) => (p.t === 'select' ? p.cards.filter((c) => names.includes(c.def.name)).slice(0, Math.max(p.min, names.length)) : undefined);
export const pickCards = (...cards: Card[]): Answer => (p) => (p.t === 'select' ? cards.filter((c) => p.cards.includes(c)) : undefined);
export const chooseOption = (label: string): Answer => (p) => (p.t === 'option' ? Math.max(0, p.options.indexOf(label)) : undefined);
export const sayNo: Answer = (p) => (p.t === 'yesno' ? false : undefined);
/** Activate `name` at the first chain prompt that offers it (earlier chain prompts get the default pass). */
export const respondWith = (name: string): Answer => (p) => (p.t === 'chain' ? p.actions.find((a) => a.a === 'act' && a.card.def.name === name) : undefined);
export const position = (pos: 'atk' | 'def'): Answer => (p) => (p.t === 'position' ? pos : undefined);

/** Seeded RNG for reproducible duels. */
export function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
