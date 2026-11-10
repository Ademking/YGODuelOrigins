import type { BattleInfo, CardDef, Ctx, Effect, EquipSpec, Filter, Lock, Mat, On, Op, Race, Attr, ReqSpec, Rule, Sel, Side, StatDelta, Who, Zone } from './types';
import { getCard, getToken, TOKENS } from '../data/cards';

// ---------------------------------------------------------------------------------------------
// Duel engine: 2004-era rules. Async so both the human UI and the CPU answer prompts the same way.
// Card behaviour is data (types.ts); unusual cards run small scripts against the public API below.
// ---------------------------------------------------------------------------------------------

export interface Card {
  uid: number;
  def: CardDef;
  owner: Side;
  ctrl: Side;
  zone: Zone;
  slot: number;
  faceUp: boolean;
  pos: 'atk' | 'def';
  mv: number; // bumps on every zone change; invalidates stale targets
  turnIn: number; // turn it entered its current zone
  summonedTurn: number;
  posTurn: number;
  attacks: number;
  mods: { atk: number; def: number; turn: number; scope?: 'attack' | 'bp' }[]; // turn -1 = permanent, else lasts through that turn; scope ends it sooner
  equipTo?: number;
  boundTo?: number;
  returnAt?: number;
  properly: boolean; // properly summoned (needed to revive Fusion/Ritual/procedure monsters)
  counter: number;
  noAttackTurn: number;
  opt: Record<number, number>;
  token?: boolean;
  eq?: EquipSpec; // a monster (or trap) currently treated as an Equip Card
  data: Record<string, any>; // per-stay scratch, cleared when the card leaves the field
  last: Record<string, any>; // `data` as it was when the card last left the field
  mark: Record<string, any>; // survives zone changes
}

export interface Player {
  side: Side;
  name: string;
  lp: number;
  deck: Card[];
  hand: Card[];
  m: (Card | null)[];
  s: (Card | null)[];
  f: Card | null;
  gy: Card[];
  banished: Card[];
  extra: Card[];
  normalDone: boolean;
  extraDone: number;
  /** Additional Normal Summons / Sets allowed this turn (Chain Summoning). */
  bonusSummons: number;
  shieldTurn: number;
  noAttackTurn: number;
}

export type Phase = 'DP' | 'SP' | 'M1' | 'BP' | 'M2' | 'EP';
export type SummonHow = 'normal' | 'flip' | 'special' | 'fusion' | 'ritual';

export interface Link {
  card: Card;
  idx: number;
  eff: Effect;
  p: Side;
  targets: Card[][];
  tmv: number[][];
  speed: number;
  ev: Ev;
  isCard: boolean;
  negated?: boolean;
  activationNegated?: boolean;
  num: number;
  mvAtAct: number;
  trig?: Trig;
  data: Record<string, any>;
}

export type Ev =
  | { e: 'open'; main?: boolean; phase?: Phase }
  | { e: 'summon'; cards: Card[]; player: Side; how: SummonHow }
  | { e: 'summoning'; cards: Card[]; player: Side; how: SummonHow; negated?: boolean }
  | { e: 'attack'; attacker: Card; target: Card | null; player: Side; noDmg?: Side[]; after?: (() => Promise<unknown> | unknown)[] }
  | { e: 'chain'; link: Link }
  | { e: 'damage'; player: Side; n: number; battle: boolean; src?: Card; direct?: boolean }
  | { e: 'sent'; card: Card; from: Zone; why: string; by?: Side; owner: Side; ctrl: Side }
  | { e: 'set'; card: Card; player: Side }
  | { e: 'bounce'; cards: Card[]; player: Side }
  | { e: 'equip'; card: Card; target: Card }
  | { e: 'draw'; player: Side; n: number; dp: boolean }
  | { e: 'discard'; player: Side; cards: Card[]; by: Side | null };

export interface Trig { card: Card; idx: number; p: Side; ev: Ev; other?: Card }

export type Action =
  | { a: 'summon' | 'mset'; card: Card; tributes: number; slot?: number; extra?: boolean; lp?: number; alt?: boolean; substitute?: Card }
  | { a: 'flip' | 'pos' | 'ss' | 'gemini'; card: Card; slot?: number }
  | { a: 'act'; card: Card; eff: number; slot?: number }
  | { a: 'sset'; card: Card; slot?: number }
  | { a: 'attack'; card: Card; target: Card | null }
  | { a: 'phase'; to: 'BP' | 'M2' | 'EP' };

export type Purpose = 'good' | 'bad' | 'cost';
export type Prompt =
  | { t: 'main'; actions: Action[]; phase: Phase }
  | { t: 'chain'; actions: Action[]; ev: Ev; text: string }
  | { t: 'select'; text: string; cards: Card[]; min: number; max: number; purpose: Purpose; validate?: (cs: Card[]) => boolean; selectionKind?: 'target'; reveal?: boolean }
  | { t: 'yesno'; text: string; card?: Card; kind: 'trigger' | 'upkeep' | 'choice'; ai?: boolean; eff?: Effect; ev?: Ev }
  | { t: 'option'; text: string; options: string[]; ai?: number }
  | { t: 'position'; card: Card }
  | { t: 'replay'; attacker: Card; targets: (Card | null)[] };

export interface Controller { ask(p: Prompt, duel: Duel, side: Side): Promise<any> }

export type UIEvent =
  | { t: 'coin'; first: Side }
  | { t: 'coinToss'; results: boolean[] }
  | { t: 'diceRoll'; result: number; rerolled: boolean }
  | { t: 'fusion'; card: Card; materials: Card[] }
  | { t: 'ritual'; card: Card }
  | { t: 'turn'; player: Side; turn: number }
  | { t: 'phase'; phase: Phase }
  | { t: 'draw'; player: Side; card: Card }
  | { t: 'move'; card: Card; from: Zone; to: Zone }
  | { t: 'summon'; card: Card; how: SummonHow }
  | { t: 'equip'; card: Card; target: Card }
  | { t: 'set'; card: Card }
  | { t: 'flip'; card: Card }
  | { t: 'pos'; card: Card }
  | { t: 'activate'; card: Card; link: number; player: Side }
  | { t: 'resolve'; card: Card; link: number; negated: boolean }
  | { t: 'attack'; attacker: Card; target: Card | null }
  | { t: 'destroy'; card: Card; by: 'battle' | 'effect' }
  | { t: 'lp'; player: Side; delta: number; lp: number }
  | { t: 'stat'; card: Card }
  | { t: 'shuffle'; player: Side }
  | { t: 'log'; text: string }
  | { t: 'end'; winner: Side | -1; reason: string };

export interface DeckList { main: string[]; extra: string[] }
/** Fusion variants: which Fusion Monsters, where the materials come from, where they go. */
export interface FusionOpts { f?: (fusion: Card) => boolean; pool?: (p: Side) => Card[]; dest?: 'gy' | 'banished' | 'deck'; later?: (fusion: Card) => Promise<unknown> | unknown }

/** A turn-limited rule change (Scapegoat, Waboku, Mesmeric Control, Armored Glass…). Active while turn <= until. */
export interface Temp {
  until: number;
  tag?: string;
  p?: Side;
  lock?: Lock;
  negate?: (d: Duel, c: Card) => boolean;
  lv?: (d: Duel, c: Card) => number;
  summon?: (d: Duel, c: Card, how: SummonHow, p: Side) => Promise<unknown> | unknown;
  race?: (d: Duel, c: Card) => Race | void;
  draw?: (d: Duel, s: Side, cards: Card[]) => Promise<unknown> | unknown;
  /** A card left the field for the Graveyard. Runs later, from settle(). */
  sent?: (d: Duel, c: Card, ctrl: Side) => Promise<unknown> | unknown;
  /** After every damage calculation while active. */
  afterBattle?: (d: Duel, r: BattleInfo) => Promise<unknown> | unknown;
  data?: any;
}
/** Delayed action run at a phase of a given turn (or the next time that phase comes for `side`). */
export interface Task { at: 'DP' | 'SP' | 'EP' | 'BPend'; turn?: number; side?: Side; fn: () => Promise<unknown> | unknown }

export class DuelEnd {
  constructor(public winner: Side | -1, public reason: string) {}
}
export const SURRENDER = '__surrender__';

export const opp = (s: Side): Side => (1 - s) as Side;
export const tributesFor = (lv: number) => (lv >= 7 ? 2 : lv >= 5 ? 1 : 0);
const onFieldZone = (z: Zone) => z === 'mzone' || z === 'szone' || z === 'fzone';
const sum = (a?: number, b?: number) => (a ?? 0) + (b ?? 0);

export class Duel {
  players: [Player, Player];
  turn = 0;
  tp: Side = 0;
  phase: Phase = 'DP';
  chain: Link[] = [];
  pending: Trig[] = [];
  windows: Ev[] = [];
  temps: Temp[] = [];
  tasks: Task[] = [];
  flags: Record<string, number> = {};
  attackNegated = false;
  battleEnded = false;
  result: DuelEnd | null = null;
  logLines: string[] = [];
  curAttack: Extract<Ev, { e: 'attack' }> | null = null;
  battle: { att: Card; tgt: Card | null } | null = null;
  battleGY: Card[] = []; // monsters sent to the Graveyard by battle this turn
  attackCount: [number, number] = [0, 0];
  m1Actions = 0;
  deferred: (() => Promise<unknown> | unknown)[] = [];
  private uid = 1;
  private cards = new Map<number, Card>();
  private prefSlot: number | undefined;
  private surrendered: Side | null = null;
  listens: boolean;

  constructor(
    decks: [DeckList, DeckList],
    names: [string, string],
    public ctl: [Controller, Controller],
    public onEvent: (e: UIEvent) => Promise<void> | void = () => {},
    public rng: () => number = Math.random,
  ) {
    this.players = [0, 1].map((s) => this.mkPlayer(s as Side, names[s], decks[s])) as [Player, Player];
    this.listens = this.allCards().some((c) => c.def.effects?.some((e) => e.when));
  }

  private mkPlayer(side: Side, name: string, dl: DeckList): Player {
    const P: Player = {
      side, name, lp: 8000, deck: [], hand: [], m: [null, null, null, null, null], s: [null, null, null, null, null],
      f: null, gy: [], banished: [], extra: [], normalDone: false, extraDone: 0, bonusSummons: 0, shieldTurn: -1, noAttackTurn: -1,
    };
    for (const id of dl.main) P.deck.push(this.mkCard(getCard(id), side, 'deck'));
    for (const id of dl.extra) P.extra.push(this.mkCard(getCard(id), side, 'extra'));
    return P;
  }

  mkCard(def: CardDef, owner: Side, zone: Zone): Card {
    const c: Card = {
      uid: this.uid++, def, owner, ctrl: owner, zone, slot: -1, faceUp: false, pos: 'atk', mv: 0,
      turnIn: 0, summonedTurn: -1, posTurn: -1, attacks: 0, mods: [], properly: false, counter: 0, noAttackTurn: -1, opt: {},
      data: {}, last: {}, mark: {}, token: def.token,
    };
    this.cards.set(c.uid, c);
    return c;
  }

  // ------------------------------------------------------------------ utilities
  byUid = (uid: number) => this.cards.get(uid);
  allCards = () => [...this.cards.values()];
  onField = (c: Card) => onFieldZone(c.zone);
  monsters = (s: Side) => this.players[s].m.filter((c): c is Card => !!c);
  spellTraps = (s: Side) => [...this.players[s].s, this.players[s].f].filter((c): c is Card => !!c);
  fieldCards = (s: Side) => [...this.monsters(s), ...this.spellTraps(s)];
  faceUpField = () => [...this.fieldCards(0), ...this.fieldCards(1)].filter((c) => c.faceUp);
  /** Face-up, un-negated card with this name on the field (optionally controlled by s). */
  active = (name: string, s?: Side) => this.faceUpField().some((c) => this.nameOf(c) === name && (s === undefined || c.ctrl === s) && !this.negated(c));
  freeSlot(s: Side, row: 'm' | 's') {
    const arr = row === 'm' ? this.players[s].m : this.players[s].s;
    const ok = (i: number) => arr[i] === null && !this.locks().some((l) => (row === 's' ? l.lock.stZone : l.lock.zone)?.(this, l.src, s, i));
    if (this.prefSlot !== undefined && ok(this.prefSlot)) return this.prefSlot;
    for (let i = 0; i < 5; i++) if (ok(i)) return i;
    return -1;
  }
  freeCount(s: Side, row: 'm' | 's') {
    let n = 0;
    const arr = row === 'm' ? this.players[s].m : this.players[s].s;
    for (let i = 0; i < 5; i++) if (arr[i] === null && !this.locks().some((l) => (row === 's' ? l.lock.stZone : l.lock.zone)?.(this, l.src, s, i))) n++;
    return n;
  }
  /** Who currently has the card: its controller on the field, otherwise its owner. */
  holder = (c: Card): Side => (this.onField(c) ? c.ctrl : c.owner);

  surrender(s: Side) { this.surrendered = s; }

  async emit(e: UIEvent) { await this.onEvent(e); }
  log(text: string) {
    this.logLines.push(text);
    void this.onEvent({ t: 'log', text });
  }
  name(s: Side) { return this.players[s].name; }

  async ask<T = any>(s: Side, p: Prompt): Promise<T> {
    if (this.surrendered !== null) throw new DuelEnd(opp(this.surrendered), `${this.name(this.surrendered)} surrendered`);
    const r = await this.ctl[s].ask(p, this, s);
    if (r === SURRENDER || this.surrendered !== null) {
      const who = this.surrendered ?? s;
      throw new DuelEnd(opp(who), `${this.name(who)} surrendered`);
    }
    return r;
  }
  confirm(s: Side, text: string, card?: Card, ai = true) { return this.ask<boolean>(s, { t: 'yesno', kind: 'choice', text, card, ai }); }
  async option(s: Side, text: string, options: string[], ai = 0): Promise<number> {
    if (options.length <= 1) return 0;
    const i = await this.ask<number>(s, { t: 'option', text, options, ai });
    return Math.max(0, Math.min(options.length - 1, Number(i) || 0));
  }
  /** Show cards to player s (looking at a hand, a Deck top, a revealed card…). */
  async reveal(s: Side, cards: Card[], text: string) {
    if (!cards.length) return;
    this.log(`${this.name(s)} looks at ${cards.length} card${cards.length > 1 ? 's' : ''}.`);
    await this.ask(s, { t: 'select', text, cards, min: 0, max: 0, purpose: 'good', reveal: true });
  }

  shuffle(s: Side) {
    const d = this.players[s].deck;
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
  }
  async shuffleDeck(s: Side) { this.shuffle(s); await this.emit({ t: 'shuffle', player: s }); }
  coin(): boolean {
    const heads = this.rng() < 0.5;
    this.log(`Coin toss: ${heads ? 'Heads' : 'Tails'}.`);
    return heads;
  }
  async tossCoins(count: number): Promise<boolean[]> {
    const results = Array.from({ length: count }, () => this.coin());
    await this.emit({ t: 'coinToss', results });
    return results;
  }
  /** Calling a coin toss: right 50% of the time. */
  async call(s: Side): Promise<boolean> {
    const right = this.rng() < 0.5;
    this.log(`${this.name(s)} calls the toss ${right ? 'right' : 'wrong'}.`);
    await this.emit({ t: 'coinToss', results: [right] });
    return right;
  }
  async die(): Promise<number> {
    let n = 1 + Math.floor(this.rng() * 6);
    if (this.flags.reroll) {
      this.flags.reroll--;
      this.log(`Die roll: ${n} (re-rolled).`);
      await this.emit({ t: 'diceRoll', result: n, rerolled: true });
      n = 1 + Math.floor(this.rng() * 6);
    }
    this.log(`Die roll: ${n}.`);
    await this.emit({ t: 'diceRoll', result: n, rerolled: false });
    return n;
  }

  // ------------------------------------------------------------------ temps, tasks, flags
  activeTemps() { return this.temps.filter((t) => t.until >= this.turn); }
  addTemp(t: Temp) { this.temps.push(t); }
  hasTemp(tag: string, p?: Side) { return this.activeTemps().some((t) => t.tag === tag && (p === undefined || t.p === undefined || t.p === p)); }
  schedule(t: Task) { this.tasks.push(t); }
  private async runTasks(at: Task['at']) {
    const due = this.tasks.filter((t) => t.at === at && (t.turn === undefined || t.turn === this.turn) && (t.side === undefined || t.side === this.tp));
    this.tasks = this.tasks.filter((t) => !due.includes(t));
    for (const t of due) { await t.fn(); await this.cleanup(); }
    if (due.length) await this.settle();
  }
  flag(k: string, s: Side, n = 1) { this.flags[`${k}:${s}`] = (this.flags[`${k}:${s}`] ?? 0) + n; }
  private consume(k: string, s: Side) {
    const key = `${k}:${s}`;
    if (!this.flags[key]) return false;
    this.flags[key]--;
    return true;
  }

  // ------------------------------------------------------------------ continuous effects
  /** Every active prohibition: from face-up un-negated cards and from temps. */
  locks(): { src: Card | null; lock: Lock }[] {
    const out: { src: Card | null; lock: Lock }[] = [];
    for (const src of this.faceUpField()) if (src.def.lock && !this.negated(src)) out.push({ src, lock: src.def.lock });
    for (const t of this.activeTemps()) if (t.lock) out.push({ src: null, lock: t.lock });
    return out;
  }
  /** A Gemini monster on the field that has not been Normal Summoned a second time (treated as a Normal Monster). */
  dormant(c: Card) { return c.def.ability === 'gemini' && c.zone === 'mzone' && !c.data.gemini; }
  negated(c: Card, depth = 0): boolean {
    if (this.dormant(c)) return true;
    if (depth > 1) return false;
    for (const t of this.temps) if (t.negate && t.until >= this.turn && t.negate(this, c)) return true;
    for (const src of this.faceUpField()) {
      if (src !== c && src.def.negateFn && src.def.negateFn(this, src, c) && !this.negated(src, depth + 1)) return true;
    }
    return false;
  }
  /** Is monster c affected by the card `src`? (Deepsea Warrior, Legendary Fisherman…) */
  affects(src: Card | null, c: Card) {
    if (src && src !== c && this.locks().some((l) => l.lock.unaffected?.(this, l.src, c, src))) return false;
    if (!src || src === c || !c.def.immune || this.negated(c)) return true;
    return !c.def.immune(this, c, src);
  }
  targetable(c: Card, by: Card) {
    if (!this.affects(by, c)) return false;
    if (c.data.untargetable === this.turn && this.holder(by) !== c.ctrl) return false;
    return !this.faceUpField().some((src) => src.def.protect && !this.negated(src) && src.def.protect(this, src, c, by));
  }
  nameOf(c: Card) { return (c.zone === 'mzone' && c.data.nameAs?.turn === this.turn ? c.data.nameAs.name : undefined) ?? c.def.alias ?? c.def.name; }
  handRevealed(s: Side) { return this.faceUpField().some((src) => src.def.reveals && !this.negated(src) && src.def.reveals(this, src, s)); }
  banishLocked(p: Side, c: Card) { return c.zone === 'gy' && this.locks().some((l) => l.lock.banish?.(this, l.src, p, c)); }
  raceOf(c: Card): Race | undefined {
    if (c.zone === 'mzone' && c.faceUp) {
      for (const t of this.activeTemps()) { const r = t.race?.(this, c); if (r) return r; }
      for (const src of this.faceUpField()) {
        if (!src.def.raceFn || this.negated(src) || !this.affects(src, c)) continue;
        const r = src.def.raceFn(this, src, c);
        if (r) return r;
      }
    }
    return c.def.race;
  }
  attrOf(c: Card): Attr | undefined {
    if (c.zone === 'mzone' && c.faceUp) {
      for (const src of this.faceUpField()) {
        if (!src.def.attrFn || this.negated(src) || !this.affects(src, c)) continue;
        const r = src.def.attrFn(this, src, c);
        if (r) return r;
      }
    }
    return c.def.attr;
  }

  // ------------------------------------------------------------------ stats & rules
  /** Current Level: printed (or set by an effect) plus modifiers from face-up cards and turn-limited effects. */
  lvOf(c: Card): number {
    let lv = c.data.lv ?? c.def.lv ?? 0;
    if (c.def.kind !== 'monster' || !lv) return lv;
    if (c.zone === 'mzone' || c.zone === 'hand') {
      for (const src of this.faceUpField()) if (src.def.lvFn && !this.negated(src)) lv += src.def.lvFn(this, src, c);
      for (const t of this.activeTemps()) if (t.lv) lv += t.lv(this, c);
    }
    return Math.max(1, lv);
  }
  atk = (c: Card) => this.stat(c, 'atk');
  defv = (c: Card) => this.stat(c, 'def');
  /** Original (printed or copied) value, before modifiers. */
  base(c: Card, k: 'atk' | 'def'): number {
    if (c.data.copy) return c.data.copy[k] ?? 0;
    if (c.data.absorb !== undefined) {
      const ab = this.byUid(c.data.absorb);
      if (ab && ab.equipTo === c.uid) return ab.data.absorbZero ? 0 : ab.def[k] ?? 0;
    }
    if (c.data.swap === this.turn || (c.data.swapUntil ?? -1) >= this.turn) return c.def[k === 'atk' ? 'def' : 'atk'] ?? 0;
    return c.def[k] ?? 0;
  }
  private statDepth = 0;
  private stat(c: Card, k: 'atk' | 'def'): number {
    if (c.zone !== 'mzone' || !c.faceUp) return c.def[k] ?? 0;
    const v = this.base(c, k);
    if (this.statDepth > 3) return v;
    this.statDepth++;
    try {
      let delta = 0;
      for (const m of c.mods) if (m.turn === -1 || m.turn >= this.turn) delta += m[k];
      for (const e of this.equipsOf(c)) {
        if (this.negated(e) || !this.affects(e, c)) continue;
        const spec = this.eqSpec(e);
        delta += spec?.[k] ?? 0;
        const extra = spec?.fn?.(this, e, c);
        if (extra) delta += extra[k] ?? 0;
      }
      for (const src of this.faceUpField()) {
        if ((!src.def.aura && !src.def.auraFn) || this.negated(src) || !this.affects(src, c)) continue;
        for (const a of src.def.aura ?? []) if (this.match(c, a.f, src.ctrl, src)) delta += a[k] ?? 0;
        const extra = src.def.auraFn?.(this, src, c);
        if (extra) delta += extra[k] ?? 0;
      }
      if (c.def.statFn && !this.negated(c)) delta += c.def.statFn(this, c)?.[k] ?? 0;
      for (const s of [0, 1] as Side[]) for (const g of this.players[s].gy) if (g.def.gyAuraFn) delta += g.def.gyAuraFn(this, g, c)?.[k] ?? 0;
      const aCtr = c.data.ctr?.A;
      if (aCtr && this.battle && !c.def.name.includes('Alien')) {
        const o = this.battle.att === c ? this.battle.tgt : this.battle.tgt === c ? this.battle.att : null;
        if (o && o.def.name.includes('Alien')) delta -= 300 * aCtr;
      }
      if (this.hasTemp('reverse')) delta = -delta;
      return Math.max(0, v + delta);
    } finally {
      this.statDepth--;
    }
  }
  eqSpec(e: Card): EquipSpec | undefined { return e.eq ?? e.def.equip; }
  equipsOf(c: Card): Card[] {
    return [0, 1].flatMap((s) => this.players[s].s).filter((e): e is Card => !!e && e.equipTo === c.uid);
  }
  equippedTo(e: Card): Card | undefined {
    const t = e.equipTo === undefined ? undefined : this.byUid(e.equipTo);
    return t && t.zone === 'mzone' ? t : undefined;
  }
  hasRule(c: Card, r: Rule): boolean {
    if (c.zone !== 'mzone' || !c.faceUp) return false;
    const live = !this.negated(c);
    if (c.data.tempRules?.[r] === this.turn) return true;
    if (this.locks().some((l) => l.lock.grants?.(this, l.src, c, r))) return true;
    if (live && c.def.rules?.includes(r)) return true;
    if (live && c.def.ruleIf?.[r]?.(this, c)) return true;
    return this.equipsOf(c).some((e) => !this.negated(e) && this.eqSpec(e)?.rules?.includes(r));
  }

  revivable(c: Card) {
    if (c.def.kind !== 'monster' || c.token) return false;
    const d = c.def;
    if (d.noSpecial) return false;
    if (d.mtype === 'fusion' || d.mtype === 'ritual' || d.noNormal) return c.properly;
    return true;
  }

  // ------------------------------------------------------------------ filters
  private zoneCards(s: Side, z: Zone): Card[] {
    const P = this.players[s];
    switch (z) {
      case 'mzone': return this.monsters(s);
      case 'szone': return P.s.filter((c): c is Card => !!c);
      case 'fzone': return P.f ? [P.f] : [];
      case 'hand': return P.hand;
      case 'deck': return P.deck;
      case 'gy': return P.gy;
      case 'banished': return P.banished;
      case 'extra': return P.extra;
    }
  }

  find(f: Filter, p: Side, src?: Card | null): Card[] {
    const sides: Side[] = f.side === 'self' ? [p] : f.side === 'opp' ? [opp(p)] : [0, 1];
    const zones: Zone[] = f.zone ? (Array.isArray(f.zone) ? f.zone : [f.zone])
      : f.kind === 'monster' ? ['mzone'] : f.st ? ['szone', 'fzone'] : ['mzone', 'szone', 'fzone'];
    const out: Card[] = [];
    for (const s of sides) for (const z of zones) for (const c of this.zoneCards(s, z)) if (this.match(c, f, p, src)) out.push(c);
    return out;
  }

  match(c: Card, f: Filter, p: Side, src?: Card | null): boolean {
    const d = c.def;
    if (f.side === 'self' && this.holder(c) !== p) return false;
    if (f.side === 'opp' && this.holder(c) === p) return false;
    if (f.notThis && src && c === src) return false;
    if (f.kind && d.kind !== f.kind) return false;
    if (f.st && d.kind === 'monster' && !c.eq && !(c.zone === 'szone' && c.data.asSpell)) return false;
    if (f.mtype && !f.mtype.includes(d.mtype!)) return false;
    if (f.stype && d.stype !== f.stype) return false;
    if (f.id && d.id !== f.id) return false;
    if (f.name && !(Array.isArray(f.name) ? f.name : [f.name]).some((n) => n === d.name || n === d.alias)) return false;
    if (f.set && !(Array.isArray(f.set) ? f.set : [f.set]).some((n) => d.name.includes(n) || !!d.alias?.includes(n))) return false;
    if (f.ability && d.ability !== f.ability) return false;
    const field = this.onField(c);
    if (f.faceUp !== undefined && field && c.faceUp !== f.faceUp) return false;
    if (f.pos && (c.zone !== 'mzone' || c.pos !== f.pos)) return false;
    const info = f.attr || f.race || f.minLv !== undefined || f.maxLv !== undefined || f.minAtk !== undefined || f.maxAtk !== undefined || f.maxDef !== undefined;
    if (info) {
      if (d.kind !== 'monster' || (field && !c.faceUp) || (field && c.zone !== 'mzone')) return false;
      if (f.attr && this.attrOf(c) !== f.attr) return false;
      if (f.race && !f.race.includes(this.raceOf(c)!)) return false;
      if (f.minLv !== undefined && this.lvOf(c) < f.minLv) return false;
      if (f.maxLv !== undefined && this.lvOf(c) > f.maxLv) return false;
      if (f.minAtk !== undefined && this.atk(c) < f.minAtk) return false;
      if (f.maxAtk !== undefined && this.atk(c) > f.maxAtk) return false;
      if (f.maxDef !== undefined && this.defv(c) > f.maxDef) return false;
    }
    if (f.fn && !f.fn(this, c, p, src)) return false;
    return true;
  }

  private reqOk(req: ReqSpec[] | undefined, p: Side, src: Card) {
    return (req ?? []).every((r) => {
      const n = this.find(r.f, p, src).length;
      return n >= (r.n ?? 1) && (r.max === undefined || n <= r.max);
    });
  }

  targetCands(eff: Effect, i: number, p: Side, src: Card): Card[] {
    let cs = this.find(eff.targets![i].f, p, src).filter((c) => !this.onField(c) || this.targetable(c, src));
    const revives = eff.ops.some((o) => o.op === 'summon' && o.s.t === 'target' && (o.s.i ?? 0) === i);
    if (revives) cs = cs.filter((c) => this.revivable(c) && this.canSummon(p, c, 'special'));
    return cs;
  }

  // ------------------------------------------------------------------ main loop
  async run(debugStart = false, first?: Side): Promise<DuelEnd> {
    try {
      this.shuffle(0);
      this.shuffle(1);
      if (debugStart) {
        this.turn = 1;
        this.tp = 1;
        this.log('Debug duel: starting on your turn.');
        await this.draw(1, 5, true);
      } else {
        this.tp = first ?? (this.rng() < 0.5 ? 0 : 1);
        await this.emit({ t: 'coin', first: this.tp });
        this.log(`${this.name(this.tp)} goes first.`);
        for (let i = 0; i < 5; i++) { await this.draw(this.tp, 1, true); await this.draw(opp(this.tp), 1, true); }
      }
      this.pending = [];
      this.checkWin();
      for (;;) await this.doTurn();
    } catch (e) {
      if (!(e instanceof DuelEnd)) throw e;
      this.result = e;
      this.log(e.winner === -1 ? `The duel is a draw (${e.reason}).` : `${this.name(e.winner)} wins! (${e.reason})`);
      await this.emit({ t: 'end', winner: e.winner, reason: e.reason });
      return e;
    }
  }

  private async doTurn() {
    this.turn++;
    if (this.turn > 1) {
      this.tp = opp(this.tp);
      if (this.consume('skipTurn', this.tp)) {
        this.log(`${this.name(this.tp)}'s turn is skipped.`);
        this.tp = opp(this.tp);
      }
    }
    if (this.turn > 400) throw new DuelEnd(-1, 'turn limit');
    const P = this.players[this.tp];
    for (const X of this.players) X.bonusSummons = 0;
    P.normalDone = false;
    P.extraDone = 0;
    this.battleGY = [];
    this.attackCount = [0, 0];
    this.m1Actions = 0;
    for (const s of [0, 1] as Side[]) for (const c of this.monsters(s)) c.attacks = 0;
    this.log(`— Turn ${this.turn}: ${P.name} —`);
    await this.emit({ t: 'turn', player: this.tp, turn: this.turn });

    await this.setPhase('DP');
    if (this.consume('skipDraw', this.tp)) this.log(`${P.name} skips the Draw Phase.`);
    else await this.draw(this.tp, 1, true);
    await this.runTasks('DP');
    await this.settle();
    await this.chainLoop({ e: 'open', phase: 'DP' }, opp(this.tp));
    await this.settle();
    await this.setPhase('SP');
    if (this.consume('skipSP', this.tp)) this.log(`${P.name} skips the Standby Phase.`);
    else await this.standby();
    await this.setPhase('M1');
    const next = this.hasTemp('skipM1', this.tp) ? (this.log(`${P.name} skips Main Phase 1.`), 'BP') : await this.mainPhase(false);
    if (next === 'BP') {
      for (let bp = 0; bp < 1 + (this.consume('extraBP', this.tp) ? 1 : 0); bp++) {
        if (bp) { this.log(`${P.name} conducts a second Battle Phase.`); for (const c of this.monsters(this.tp)) c.attacks = 0; }
        await this.setPhase('BP');
        await this.battlePhase();
        if (this.skipM2) break;
      }
      if (!this.skipM2) {
        await this.setPhase('M2');
        await this.mainPhase(true);
      }
    }
    await this.setPhase('EP');
    await this.endPhase();
  }

  private async setPhase(ph: Phase) {
    this.phase = ph;
    await this.emit({ t: 'phase', phase: ph });
  }

  async draw(s: Side, n: number, dp = false) {
    const P = this.players[s];
    const drawn: Card[] = [];
    for (let i = 0; i < n; i++) {
      const c = P.deck.pop();
      if (!c) throw new DuelEnd(opp(s), `${P.name} could not draw`);
      c.zone = 'hand';
      c.faceUp = false;
      c.mv++;
      c.turnIn = this.turn;
      P.hand.push(c);
      drawn.push(c);
      await this.emit({ t: 'draw', player: s, card: c });
      this.raise('drawn', c);
    }
    if (!drawn.length) return;
    const ev: Ev = { e: 'draw', player: s, n: drawn.length, dp };
    for (const f of this.faceUpField()) this.raise('anyDraw', f, undefined, ev);
    for (const g of P.gy) if (g.def.effects?.some((e) => e.from?.includes('gy') && e.on?.includes('anyDraw'))) this.raise('anyDraw', g, undefined, ev);
    for (const t of this.activeTemps()) if (t.draw) await t.draw(this, s, drawn);
    if (!dp) this.queueWindow(ev);
  }

  private async standby() {
    const tp = this.tp;
    for (const c of this.fieldCards(tp)) {
      if (!c.faceUp || !c.def.upkeep || !this.onField(c) || this.negated(c) || this.locks().some((l) => l.lock.noUpkeep?.(this, l.src, c))) continue;
      const P = this.players[tp];
      const pay = P.lp > c.def.upkeep && (await this.ask<boolean>(tp, { t: 'yesno', kind: 'upkeep', card: c, text: `Pay ${c.def.upkeep} LP to keep "${c.def.name}"?` }));
      if (pay) await this.changeLP(tp, -c.def.upkeep, true);
      else await this.destroy(c, 'effect');
    }
    for (const c of this.fieldCards(tp)) {
      if (!c.faceUp) continue;
      c.data.standbys = (c.data.standbys ?? 0) + 1;
      this.raise('standby', c);
    }
    for (const c of this.players[tp].gy) this.raise('standby', c);
    for (const c of this.fieldCards(opp(tp))) if (c.faceUp) this.raise('oppStandby', c);
    await this.settle();
    await this.runTasks('SP');
    await this.chainLoop({ e: 'open', phase: 'SP' }, tp, 1);
    await this.settle();
  }

  private async mainPhase(second: boolean): Promise<'BP' | 'EP'> {
    for (let guard = 0; guard < 400; guard++) {
      const acts = this.mainActions(this.tp, second);
      const a = await this.ask<Action>(this.tp, { t: 'main', actions: acts, phase: this.phase });
      if (a.a === 'phase') return a.to === 'BP' ? 'BP' : 'EP';
      if (!second) this.m1Actions++;
      await this.perform(a);
      await this.settle();
    }
    return 'EP';
  }

  // ------------------------------------------------------------------ summoning legality
  canSummon(p: Side, c: Card, how: SummonHow | 'set'): boolean {
    if (this.hasTemp('noSummon', p) && how !== 'set') return false;
    const lk = this.locks();
    if (how === 'set') return !lk.some((l) => l.lock.set?.(this, l.src, p, c));
    return !lk.some((l) => l.lock.summon?.(this, l.src, p, c, how));
  }
  tributeOk(c: Card) {
    return !c.def.rules?.includes('noTribute') && !this.locks().some((l) => l.lock.tribute?.(this, l.src, c));
  }
  tributePool(p: Side): Card[] {
    const own = this.monsters(p).filter((c) => this.tributeOk(c));
    const soul = this.activeTemps().filter((t) => t.tag === 'soulExchange' && t.p === p).map((t) => this.byUid(t.data)).filter((c): c is Card => !!c && c.zone === 'mzone' && c.ctrl !== p && this.tributeOk(c));
    return [...own, ...soul];
  }
  tribWeight(t: Card, c: Card) { return !c.def.fixedTributes && t.def.doubleTribute && !this.negated(t) && t.def.doubleTribute(this, c) ? 2 : 1; }
  tributesNeeded(p: Side, c: Card) {
    if (c.def.fixedTributes) return c.def.tributes?.(this, p) ?? tributesFor(this.lvOf(c));
    if (c.mark.freeSummonTurn === this.turn || this.locks().some((l) => l.lock.noTributes?.(this, l.src, p, c))) return 0;
    return c.def.tributes?.(this, p) ?? tributesFor(this.lvOf(c)); }
  extraSummons(p: Side) { return this.locks().reduce((n, l) => n + (l.lock.extraSummon?.(this, l.src, p) ?? 0), 0); }
  private handCost(_p: Side) { return this.locks().reduce((n, l) => n + (l.lock.handCost ?? 0), 0); }

  mainActions(p: Side, second: boolean): Action[] {
    const acts: Action[] = [];
    const P = this.players[p];
    const open: Ev[] = [{ e: 'open', main: true }];
    const freeM = this.freeSlot(p, 'm') >= 0;
    const pool = this.tributePool(p);
    const hc = this.handCost(p);
    const handOk = hc === 0 || P.lp > hc;
    const extraOk = P.normalDone && (P.bonusSummons > 0 || (P.extraDone < this.extraSummons(p) && P.lp > 500));
    for (const c of P.hand) {
      const d = c.def;
      if (d.kind === 'monster') {
        if ((!P.normalDone || extraOk) && handOk && !d.noNormal && !d.token && (d.mtype === 'normal' || d.mtype === 'effect') && (d.summonCond?.(this, p) ?? true)) {
          const need = this.tributesNeeded(p, c);
          const tp = d.tribFilter ? pool.filter((t) => d.tribFilter!(this, t)) : pool;
          const usable = (candidates: Card[], count: number) => count === 0 ? freeM : candidates.reduce((s, t) => s + this.tribWeight(t, c), 0) >= count && (freeM || candidates.some((t) => t.ctrl === p));
          const extra = P.normalDone || undefined;
          if (usable(tp, need) && this.canSummon(p, c, 'normal') && !d.setOnly) acts.push({ a: 'summon', card: c, tributes: need, extra });
          if (usable(tp, need) && !d.noNormalSet && this.canSummon(p, c, 'set')) acts.push({ a: 'mset', card: c, tributes: need, extra });
          if (need > 0 && freeM && !d.setOnly && this.canSummon(p, c, 'normal')) {
            for (const source of this.fieldCards(p)) {
              if (!d.fixedTributes && source.faceUp && !this.negated(source) && this.tributeOk(source) && source.def.tributeSubstitute?.(this, source, c, need)) {
                acts.push({ a: 'summon', card: c, tributes: need, extra, substitute: source });
              }
            }
          }
          for (const n of d.altTributes ?? []) {
            if (n === need) continue;
            const altUsable = (candidates: Card[]) => n === 0 ? freeM : candidates.length >= n && (freeM || candidates.some((t) => t.ctrl === p));
            if (altUsable(tp) && this.canSummon(p, c, 'normal')) acts.push({ a: 'summon', card: c, tributes: n, extra, alt: true });
            if (altUsable(tp) && !d.noNormalSet && this.canSummon(p, c, 'set')) acts.push({ a: 'mset', card: c, tributes: n, extra, alt: true });
          }
          const lp = need && !d.fixedTributes ? this.locks().map((l) => l.lock.tributeLP?.(this, l.src, p, c, need)).find((x) => x !== undefined) : undefined;
          if (lp !== undefined && freeM && P.lp > lp) {
            if (this.canSummon(p, c, 'normal')) acts.push({ a: 'summon', card: c, tributes: 0, extra, lp });
            if (!d.noNormalSet && this.canSummon(p, c, 'set')) acts.push({ a: 'mset', card: c, tributes: 0, extra, lp });
          }
        }
        if (d.ssProc && handOk && (d.ssProc.from ?? ['hand']).includes('hand') && this.procOk(c, p)) acts.push({ a: 'ss', card: c });
        d.effects?.forEach((_, i) => { if (this.canActivate(c, i, p, open, 1)) acts.push({ a: 'act', card: c, eff: i }); });
      } else {
        if (handOk) d.effects?.forEach((_, i) => { if (this.canActivate(c, i, p, open, 1)) acts.push({ a: 'act', card: c, eff: i }); });
        if (handOk && d.stype !== 'field' && this.freeSlot(p, 's') >= 0 && this.canSummon(p, c, 'set')) acts.push({ a: 'sset', card: c });
      }
    }
    const posLocked = (c: Card) => this.locks().some((l) => l.lock.pos?.(this, l.src, c));
    for (const c of this.monsters(p)) {
      if (c.faceUp && this.dormant(c) && c.ctrl === p && (!P.normalDone || extraOk) && handOk && this.canSummon(p, c, 'normal')) acts.push({ a: 'gemini', card: c });
      if (!c.faceUp && c.turnIn < this.turn && c.posTurn !== this.turn && !posLocked(c) && this.canSummon(p, c, 'flip')) acts.push({ a: 'flip', card: c });
      if (c.faceUp && c.summonedTurn !== this.turn && c.posTurn !== this.turn && c.attacks === 0 && !posLocked(c)) acts.push({ a: 'pos', card: c });
      c.def.effects?.forEach((_, i) => { if (this.canActivate(c, i, p, open, 1)) acts.push({ a: 'act', card: c, eff: i }); });
    }
    for (const c of P.extra) if (c.def.ssProc?.from?.includes('extra') && handOk && this.procOk(c, p)) acts.push({ a: 'ss', card: c });
    for (const c of [...this.spellTraps(p), ...P.gy]) {
      c.def.effects?.forEach((_, i) => { if (this.canActivate(c, i, p, open, 1)) acts.push({ a: 'act', card: c, eff: i }); });
    }
    if (!second && this.turn > 1 && !this.hasTemp('noBP', p) && !this.locks().some((l) => l.lock.noBP?.(this, l.src, p))) acts.push({ a: 'phase', to: 'BP' });
    acts.push({ a: 'phase', to: 'EP' });
    return acts;
  }
  private procOk(c: Card, p: Side) {
    const pr = c.def.ssProc!;
    const freesZone = (pr.cost ?? []).some((o) => o.op === 'tribute' || o.op === 'run');
    if (this.freeSlot(p, 'm') < 0 && !freesZone) return false;
    return this.canSummon(p, c, 'special') && this.reqOk(pr.req, p, c) && (pr.cond?.(this, p, c) ?? true) && (pr.cost ?? []).every((o) => this.opFeasible(o, p, c, true));
  }

  private async perform(a: Action) {
    const tp = this.tp;
    this.prefSlot = 'slot' in a ? a.slot : undefined;
    try {
      const fromHand = 'card' in a && a.card.zone === 'hand';
      if (fromHand && a.a !== 'attack') { const hc = this.handCost(tp); if (hc) await this.changeLP(tp, -hc, true); }
      switch (a.a) {
        case 'summon': case 'mset':
          if (a.extra && this.players[tp].bonusSummons > 0) this.players[tp].bonusSummons--;
          else if (a.extra) { await this.changeLP(tp, -500, true); this.players[tp].extraDone++; }
          if (a.lp) { await this.changeLP(tp, -a.lp, true); a.card.mark.freeSummonTurn = this.turn; }
          await this.normalSummon(a.card, tp, a.a === 'mset', !!a.extra, a.alt ? a.tributes : undefined, a.substitute);
          break;
        case 'flip': await this.flipSummon(a.card, tp); break;
        case 'gemini':
          if (!this.players[tp].normalDone) this.players[tp].normalDone = true;
          else if (this.players[tp].bonusSummons > 0) this.players[tp].bonusSummons--;
          else { await this.changeLP(tp, -500, true); this.players[tp].extraDone++; }
          a.card.data.gemini = true;
          this.log(`${this.name(tp)} Normal Summons ${a.card.def.name} again; it gains its effects.`);
          await this.summonNegationWindow([a.card], tp, 'normal');
          break;
        case 'pos': {
          const was = a.card.pos;
          a.card.pos = was === 'atk' ? 'def' : 'atk';
          a.card.posTurn = this.turn;
          this.log(`${this.name(tp)} changes ${a.card.def.name} to ${a.card.pos === 'atk' ? 'Attack' : 'Defense'} Position.`);
          await this.emit({ t: 'pos', card: a.card });
          this.raise(a.card.pos === 'def' ? 'toDef' : 'toAtk', a.card);
          break;
        }
        case 'sset': await this.setST(a.card, tp); break;
        case 'ss': await this.procSummon(a.card, tp); break;
        case 'act': {
          const ev: Ev = { e: 'open', main: this.phase === 'M1' || this.phase === 'M2', phase: this.phase };
          await this.activate(a.card, a.eff, tp, ev);
          this.prefSlot = undefined;
          await this.chainLoop(ev, opp(tp));
          break;
        }
        case 'attack': await this.attack(a.card, a.target); break;
        case 'phase': break;
      }
    } finally {
      this.prefSlot = undefined;
    }
  }

  // ------------------------------------------------------------------ placement / movement
  private detach(c: Card) {
    const P = this.players[this.onField(c) ? c.ctrl : c.owner];
    const rm = (arr: Card[]) => { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); };
    switch (c.zone) {
      case 'mzone': if (P.m[c.slot] === c) P.m[c.slot] = null; break;
      case 'szone': if (P.s[c.slot] === c) P.s[c.slot] = null; break;
      case 'fzone': if (P.f === c) P.f = null; break;
      case 'hand': rm(P.hand); break;
      case 'deck': rm(P.deck); break;
      case 'gy': rm(P.gy); break;
      case 'banished': rm(P.banished); break;
      case 'extra': rm(P.extra); break;
    }
  }

  private resetFieldState(c: Card) {
    c.pos = 'atk';
    c.mods = [];
    c.equipTo = undefined;
    c.boundTo = undefined;
    c.returnAt = undefined;
    c.counter = 0;
    c.attacks = 0;
    c.summonedTurn = -1;
    c.posTurn = -1;
    c.slot = -1;
    if (c.equipTo !== undefined) c.data.eqTo = c.equipTo;
    c.eq = undefined;
    c.last = c.data;
    c.data = {};
  }

  async move(c: Card, to: Zone, o: { top?: boolean; bottom?: boolean; why?: string; by?: Side } = {}) {
    const from = c.zone;
    const wasField = this.onField(c);
    const bound = c.boundTo;
    const ctrl = c.ctrl;
    c.mark.lastPos = c.pos;
    c.mark.lastFaceUp = c.faceUp;
    c.mark.lastWhy = o.why;
    c.mark.from = from;
    if (to === 'gy' && !c.token && this.locks().some((l) => l.lock.gyToBanish === true || (typeof l.lock.gyToBanish === 'function' && l.lock.gyToBanish(this, l.src, c)))) to = 'banished';
    if (to === 'hand' && from === 'mzone' && this.locks().some((l) => l.lock.bounceToBanish)) to = 'banished';
    if (to === 'deck' && from === 'gy' && this.locks().some((l) => l.lock.gyToDeckBanish)) to = 'banished';
    if (to === 'hand' && (from === 'deck' || from === 'gy' || from === 'banished') && this.locks().some((l) => l.lock.noAdd?.(this, l.src, c))) { this.log(`${c.def.name} cannot be added to the hand.`); return; }
    this.detach(c);
    if (wasField) this.resetFieldState(c);
    if (c.mark.trapDef && from === 'mzone') { c.def = c.mark.trapDef; delete c.mark.trapDef; }
    if (c.token) {
      this.cards.delete(c.uid);
      c.zone = to;
      c.mv++;
      await this.emit({ t: 'move', card: c, from, to });
      return;
    }
    if (to === 'hand' || to === 'deck' || to === 'extra') {
      c.properly = false;
      if (c.def.mtype === 'fusion') to = 'extra';
    }
    if (c.mark.origOwner !== undefined && to !== 'hand') { c.owner = c.mark.origOwner; delete c.mark.origOwner; }
    const P = this.players[c.owner];
    c.ctrl = c.owner;
    c.zone = to;
    c.mv++;
    c.turnIn = this.turn;
    c.faceUp = to === 'gy' || to === 'banished' || to === 'extra';
    if (to === 'deck' && o.bottom) P.deck.unshift(c);
    else ({ hand: P.hand, deck: P.deck, gy: P.gy, banished: P.banished, extra: P.extra } as Record<string, Card[]>)[to].push(c);
    await this.emit({ t: 'move', card: c, from, to });
    for (const f of this.faceUpField()) if (f.def.onMove && !this.negated(f)) { const fn = f.def.onMove; this.deferred.push(() => fn(this, f, c, from, to)); }
    for (const s of [0, 1] as Side[]) for (const g of this.players[s].gy) if (g.def.gyOnMove && g !== c) { const fn = g.def.gyOnMove; this.deferred.push(() => fn(this, g, c, from, to)); }
    if (to === 'gy') {
      c.mark.sentBy = o.by;
      c.mark.sentTurn = this.turn;
      this.raise('toGY', c);
      if (wasField) this.raise('fieldToGY', c);
      const sent: Ev = { e: 'sent', card: c, from, why: o.why ?? 'effect', by: o.by, owner: c.owner, ctrl };
      for (const f of this.faceUpField()) this.raise('anyToGY', f, c, sent);
      if (wasField) {
        this.queueWindow({ e: 'sent', card: c, from, why: o.why ?? 'effect', by: o.by, owner: c.owner, ctrl });
        for (const t of this.activeTemps()) if (t.sent) { const fn = t.sent; this.deferred.push(() => fn(this, c, ctrl)); }
      }
    }
    if (to === 'banished') this.raise('banished', c);
    if (wasField) this.raise('leftField', c);
    if (wasField && bound !== undefined) {
      const m = this.byUid(bound);
      if (m && m.zone === 'mzone') await this.destroy(m, 'effect');
    }
  }

  placeMonster(c: Card, s: Side, faceUp: boolean, pos: 'atk' | 'def') {
    const i = this.freeSlot(s, 'm');
    if (i < 0) return false;
    this.detach(c);
    const P = this.players[s];
    P.m[i] = c;
    Object.assign(c, { zone: 'mzone', slot: i, ctrl: s, faceUp, pos, turnIn: this.turn, summonedTurn: this.turn });
    c.mv++;
    return true;
  }

  placeST(c: Card, s: Side, faceUp: boolean) {
    const i = this.freeSlot(s, 's');
    if (i < 0) return false;
    const wasField = this.onField(c);
    this.detach(c);
    if (wasField) this.resetFieldState(c);
    this.players[s].s[i] = c;
    Object.assign(c, { zone: 'szone', slot: i, ctrl: s, faceUp, turnIn: this.turn });
    c.mv++;
    return true;
  }

  private async placeField(c: Card, s: Side) {
    for (const side of [0, 1] as Side[]) {
      const old = this.players[side].f;
      if (old && old !== c && (old.faceUp || side === s)) await this.destroy(old, 'effect');
    }
    this.detach(c);
    this.players[s].f = c;
    Object.assign(c, { zone: 'fzone', slot: 0, ctrl: s, faceUp: true, turnIn: this.turn });
    c.mv++;
  }

  async setST(c: Card, p: Side) {
    if (!this.placeST(c, p, false)) return;
    this.log(`${this.name(p)} sets a card in the Spell & Trap Zone.`);
    await this.emit({ t: 'set', card: c });
  }

  /** Attach `eq` (any card) to `target` as an Equip Card in its holder's Spell & Trap Zone. */
  async equipCard(eq: Card, target: Card, spec?: EquipSpec, side: Side = eq.owner) {
    if (target.zone !== 'mzone' || !target.faceUp) return false;
    if (!(this.onField(eq) && eq.zone === 'szone') && !this.placeST(eq, side, true)) return false;
    eq.faceUp = true;
    eq.equipTo = target.uid;
    if (spec) eq.eq = spec;
    this.log(`${eq.def.name} is equipped to ${target.def.name}.`);
    await this.emit({ t: 'equip', card: eq, target });
    await this.emit({ t: 'stat', card: target });
    this.queueWindow({ e: 'equip', card: eq, target });
    return true;
  }

  async destroy(c: Card, by: 'battle' | 'effect', other?: Card, src?: Side): Promise<boolean> {
    if (!this.onField(c)) return false;
    if (by === 'battle' && (this.hasRule(c, 'battleImmune') || this.players[c.ctrl].shieldTurn === this.turn)) return false;
    if (this.locks().some((l) => l.lock.indestructible?.(this, l.src, c, by))) { this.log(`${c.def.name} is not destroyed.`); return false; }
    const subEq = c.zone === 'mzone' ? this.equipsOf(c).find((e) => { const s = this.eqSpec(e)?.sub; return (s === true || (s === 'battle' && by === 'battle')) && !this.negated(e); }) : undefined;
    if (subEq) {
      const spec = this.eqSpec(subEq)!;
      if (spec.onSub) { await spec.onSub(this, subEq, c); return false; }
      this.log(`${subEq.def.name} is destroyed in place of ${c.def.name}.`); await this.destroy(subEq, 'effect', undefined, src); return false;
    }
    if (c.faceUp && c.def.destroySub && !this.negated(c)) {
      const sub = await c.def.destroySub(this, c);
      if (sub && sub !== c && await this.destroy(sub, 'effect', undefined, src)) {
        this.log(`${sub.def.name} is destroyed in place of ${c.def.name}.`);
        return false;
      }
    }
    if (by === 'battle' && c.def.battleSub && !this.negated(c)) {
      const sub = c.def.battleSub(this, c);
      if (sub) { this.log(`${sub.def.name} is destroyed in place of ${c.def.name}.`); await this.destroy(sub, 'effect', undefined, src); return false; }
    }
    await this.emit({ t: 'destroy', card: c, by });
    this.log(`${c.def.name} is destroyed.`);
    c.mark.destroyedBy = src;
    c.mark.destroyedTurn = this.turn;
    c.mark.destroyedHow = by;
    const controller = c.ctrl;
    await this.move(c, 'gy', { why: by, by: src });
    if (by === 'battle' && c.zone === 'gy') this.battleGY.push(c);
    this.raise('destroyed', c, other);
    if (by === 'battle') this.raise('battleDestroyed', c, other);
    if (c.token && c.def.onTokenDestroyed) {
      const onDestroyed = c.def.onTokenDestroyed;
      this.deferred.push(() => onDestroyed(this, c, controller));
    }
    return true;
  }
  async banish(c: Card, by?: Side) {
    if (by !== undefined && this.banishLocked(by, c)) { this.log(`${c.def.name} cannot be banished.`); return; }
    if (c.zone === 'gy' && this.hasTemp('spiritElim', c.owner)) {
      const subs = this.monsters(c.owner);
      if (subs.length) {
        const [s] = await this.select(c.owner, `Spirit Elimination: banish a monster you control instead of ${c.def.name}`, subs, 1, 1, 'cost');
        c = s;
      }
    }
    this.log(`${c.def.name} is banished.`);
    await this.move(c, 'banished');
  }
  async toHand(c: Card) {
    const from = c.zone;
    await this.move(c, 'hand');
    this.log(`${c.def.name} is ${from === 'deck' ? 'added to the hand from the Deck' : 'returned to the hand'}.`);
  }
  async discard(s: Side, cards: Card[], by: Side | null) {
    if (!cards.length) return;
    for (const c of cards) {
      this.log(`${this.name(s)} discards ${c.def.name}.`);
      await this.move(c, 'gy', { why: 'discard', by: by ?? undefined });
      if (by !== null && by !== s) this.raise('discarded', c);
      if (by !== null) this.raise('effDiscarded', c);
    }
    const ev: Ev = { e: 'discard', player: s, cards, by };
    for (const f of this.faceUpField()) this.raise('anyDiscard', f, undefined, ev);
    this.queueWindow(ev);
  }
  async mill(s: Side, n: number, by?: Side) {
    for (let i = 0; i < n; i++) {
      const c = this.players[s].deck[this.players[s].deck.length - 1];
      if (!c) break;
      await this.move(c, 'gy', { why: 'mill', by });
      if (by !== undefined && by !== s) this.raise('milled', c);
    }
  }

  async cleanup() {
    for (const s of [0, 1] as Side[]) {
      for (const e of [...this.players[s].s]) {
        if (!e || !e.faceUp) continue;
        if (e.equipTo !== undefined) {
          const t = this.byUid(e.equipTo);
          if (!t || t.zone !== 'mzone' || !t.faceUp || this.hasRule(t, 'noEquip')) { e.equipTo = undefined; await this.destroy(e, 'effect'); continue; }
        }
        if (e.boundTo !== undefined) {
          const t = this.byUid(e.boundTo);
          if (!t || t.zone !== 'mzone') { e.boundTo = undefined; await this.destroy(e, 'effect'); }
        }
      }
      for (const c of this.fieldCards(s)) {
        if (c.faceUp && c.def.selfDestructIf && this.onField(c) && c.def.selfDestructIf(this, c)) await this.destroy(c, 'effect');
      }
      for (const m of this.monsters(s)) {
        if (m.data.heldBy === undefined) continue;
        const h = this.byUid(m.data.heldBy);
        const holds = h && this.onField(h) && h.mv === m.data.heldMv && (h.zone === 'mzone' || h.equipTo === undefined || h.equipTo === m.uid);
        if (!holds) { m.data.heldBy = undefined; await this.returnControl(m); }
      }
    }
  }

  async changeLP(s: Side, delta: number, isCost = false) {
    if (delta === 0) return;
    if (isCost && delta < 0) this.flags[`paid:${s}:${this.turn}`] = (this.flags[`paid:${s}:${this.turn}`] ?? 0) - delta;
    const P = this.players[s];
    P.lp = Math.max(0, P.lp + delta);
    this.log(delta < 0 ? `${P.name} ${isCost ? 'pays' : 'takes'} ${-delta} ${isCost ? 'LP' : 'damage'}. (LP ${P.lp})` : `${P.name} gains ${delta} LP. (LP ${P.lp})`);
    await this.emit({ t: 'lp', player: s, delta, lp: P.lp });
  }
  /** Effect (or battle) damage. Returns the damage actually dealt. */
  async damage(s: Side, n: number, src?: Card | null, battle = false, direct = false): Promise<number> {
    n = Math.floor(n);
    if (n <= 0) return 0;
    if (this.locks().some((l) => l.lock.noDamage?.(this, l.src, s, battle))) { this.log(`${this.name(s)} takes no damage.`); return 0; }
    if (this.locks().some((l) => l.lock.damageToHeal?.(this, l.src, s))) { await this.heal(s, n); return 0; }
    if (!battle && this.locks().some((l) => l.lock.redirect?.(this, l.src, s))) { this.log(`The damage is redirected to ${this.name(opp(s))}.`); s = opp(s); }
    await this.changeLP(s, -n);
    this.queueWindow({ e: 'damage', player: s, n, battle, src: src ?? undefined, direct });
    for (const f of this.faceUpField()) if (f.def.onDamage && !this.negated(f)) { const fn = f.def.onDamage; this.deferred.push(() => fn(this, f, s, n, src ?? null, battle)); }
    return n;
  }
  async heal(s: Side, n: number) {
    n = Math.floor(n);
    if (n <= 0) return;
    if (this.locks().some((l) => l.lock.healToDamage?.(this, l.src, s))) { await this.damage(s, n); return; }
    await this.changeLP(s, n);
    for (const c of this.fieldCards(s)) if (c.faceUp) this.raise('lpGain', c);
  }
  private checkLP() {
    const dead = [0, 1].filter((s) => this.players[s].lp <= 0) as Side[];
    if (dead.length === 2) throw new DuelEnd(-1, 'both players reached 0 LP');
    if (dead.length === 1) throw new DuelEnd(opp(dead[0]), `${this.name(dead[0])}'s Life Points reached 0`);
    this.checkWin();
  }
  private checkWin() {
    for (const c of this.cards.values()) {
      if (c.def.winCheck && c.def.winCheck(this, c)) throw new DuelEnd(this.holder(c), `${c.def.name}`);
    }
  }
  private sides(who: Who, p: Side): Side[] {
    return who === 'self' ? [p] : who === 'opp' ? [opp(p)] : [p, opp(p)];
  }
  addMod(c: Card, atk: number, def: number, turn = this.turn, scope?: 'attack' | 'bp') {
    if (c.zone !== 'mzone' || !c.faceUp) return;
    c.mods.push({ atk, def, turn, scope });
  }

  // ------------------------------------------------------------------ summoning
  private async normalSummon(c: Card, p: Side, set: boolean, extra: boolean, override?: number, substitute?: Card) {
    const need = override ?? this.tributesNeeded(p, c);
    c.mark.tribCount = need;
    c.mark.tribs = [];
    c.mark.tribTurn = this.turn;
    const P = this.players[p];
    if (need && substitute) {
      c.mark.tribs = [substitute.def.name];
      this.log(`${P.name} tributes ${substitute.def.name}.`);
      await this.move(substitute, 'gy', { why: 'tribute' });
    } else if (need) {
      const pool = this.tributePool(p);
      const freeNow = this.freeSlot(p, 'm') >= 0;
      const cands = pool.filter((t) => c.def.tribFilter?.(this, t) ?? true);
      const weighted = cands.some((t) => this.tribWeight(t, c) > 1);
      const total = (cs: Card[]) => cs.reduce((s, t) => s + this.tribWeight(t, c), 0);
      const validate = weighted ? (cs: Card[]) => total(cs) === need && (freeNow || cs.some((x) => x.ctrl === p)) : freeNow ? undefined : (cs: Card[]) => cs.length === need && cs.some((x) => x.ctrl === p);
      const pick = await this.select(p, `Select ${need} monster${need > 1 ? 's' : ''} to Tribute for ${c.def.name}`, cands, weighted ? 1 : need, need, 'cost', validate);
      c.mark.tribs = pick.map((t) => t.def.name);
      c.mark.tribTurn = this.turn;
      for (const t of pick) { this.log(`${P.name} tributes ${t.def.name}.`); await this.move(t, 'gy', { why: 'tribute' }); }
    }
    if (!extra) P.normalDone = true;
    const faceUpSet = set && this.locks().some((l) => l.lock.faceUpSet);
    const pos = set || c.def.summonPos === 'def' ? 'def' : 'atk';
    if (!this.placeMonster(c, p, !set || faceUpSet, pos)) return;
    if (set && !faceUpSet) {
      this.log(`${P.name} sets a monster.`);
      await this.emit({ t: 'set', card: c });
      for (const src of this.faceUpField()) if (src.def.onMonsterSet && !this.negated(src)) await src.def.onMonsterSet(this, src, c, p);
      this.queueWindow({ e: 'set', card: c, player: p });
      return;
    }
    await this.summonNegationWindow([c], p, 'normal');
  }

  private async flipSummon(c: Card, p: Side) {
    c.faceUp = true;
    c.pos = 'atk';
    c.posTurn = this.turn;
    await this.emit({ t: 'flip', card: c });
    await this.summonNegationWindow([c], p, 'flip');
  }

  private async procSummon(c: Card, p: Side) {
    const pseudo = this.pseudoLink(c, p);
    for (const op of c.def.ssProc?.cost ?? []) await this.runOp(op, pseudo, true);
    const pos = await this.askPos(p, c);
    if (!this.placeMonster(c, p, true, pos)) return;
    c.properly = true;
    await this.summonNegationWindow([c], p, 'special');
  }

  /** Summon negation window (counter traps only), then the summon succeeds. */
  private async summonNegationWindow(cards: Card[], p: Side, how: SummonHow) {
    const ev: Ev = { e: 'summoning', cards, player: p, how };
    await this.emit({ t: 'summon', card: cards[0], how });
    if (!(how === 'normal' && cards.some((card) => card.def.protectedNormalSummon))) await this.chainLoop(ev, opp(p));
    if ((ev as { negated?: boolean }).negated) return;
    await this.announceSummon(cards, p, how);
  }

  private async announceSummon(cards: Card[], p: Side, how: SummonHow) {
    const ev: Ev = { e: 'summon', cards, player: p, how };
    for (const src of this.faceUpField()) {
      if (!src.def.onSummon || this.negated(src)) continue;
      for (const c of cards) if (c.zone === 'mzone') await src.def.onSummon(this, src, c, how, p);
    }
    if (!(how === 'normal' && cards.some((card) => card.def.protectedNormalSummon))) this.windows.push(ev);
    for (const t of this.activeTemps()) if (t.summon) for (const c of cards) if (c.zone === 'mzone') await t.summon(this, c, how, p);
    for (const c of cards) {
      if (c.zone !== 'mzone') continue;
      c.mark.how = how;
      c.data.how = how;
      c.data.sumTurn = this.turn;
      const verb = how === 'normal' ? 'Normal Summons' : how === 'flip' ? 'Flip Summons' : how === 'fusion' ? 'Fusion Summons' : how === 'ritual' ? 'Ritual Summons' : 'Special Summons';
      this.log(`${this.name(p)} ${verb} ${c.def.name}.`);
      if (how === 'flip') this.raiseFlip(c, ev);
      this.raise('summoned', c, undefined, ev);
      if (how === 'normal') this.raise('normalSummoned', c, undefined, ev);
      if (how === 'flip') this.raise('flipSummoned', c, undefined, ev);
      if (how === 'special' || how === 'fusion' || how === 'ritual') this.raise('specialSummoned', c, undefined, ev);
      if (how === 'ritual') this.raise('ritualSummoned', c, undefined, ev);
    }
    if (!(how === 'normal' && cards.some((card) => card.def.protectedNormalSummon))) {
      for (const source of this.faceUpField()) this.raise('anySummon', source, undefined, ev);
    }
  }

  canSpecial(p: Side, c?: Card) {
    return this.freeSlot(p, 'm') >= 0 && !this.hasTemp('noSummon', p) && (!c || (!c.def.noSpecial && this.canSummon(p, c, 'special')));
  }
  async specialSummon(c: Card, p: Side, pos: 'atk' | 'def', how: SummonHow = 'special', faceDown = false, by?: Card) {
    if (!this.canSpecial(p, c)) return false;
    const from = c.zone;
    if (!this.placeMonster(c, p, !faceDown, faceDown ? 'def' : pos)) return false;
    if (how === 'fusion' || how === 'ritual') c.properly = true;
    c.data.from = from;
    c.data.ssBy = by?.def.name;
    c.data.how = how;
    if (faceDown) {
      this.log(`${this.name(p)} Special Summons a monster in face-down Defense Position.`);
      await this.emit({ t: 'set', card: c });
      this.windows.push({ e: 'summon', cards: [c], player: p, how });
      return true;
    }
    if (how === 'fusion' || how === 'ritual') {
      // The summon itself can be negated (Solemn Judgment, Horn of Heaven) once the summoning card has resolved.
      this.deferred.push(() => (c.zone === 'mzone' && c.ctrl === p ? this.summonNegationWindow([c], p, how) : undefined));
      return true;
    }
    await this.emit({ t: 'summon', card: c, how });
    await this.announceSummon([c], p, how);
    return true;
  }
  async summonToken(p: Side, name: string | CardDef, pos: 'atk' | 'def' = 'def') {
    // An effect may hand over its own stats (a copied ATK, a chosen Level) and rules, but when the game has that Token
    // card the Token keeps the card's identity: its id (and so its artwork) and its text.
    const known = typeof name === 'string' ? undefined : TOKENS[name.name];
    const def = typeof name === 'string' ? getToken(name) : { ...name, ...(known && { id: known.id, text: known.text, art: known.art }), token: true };
    const c = this.mkCard(def, p, 'hand');
    this.players[p].hand.push(c);
    if (!(await this.specialSummon(c, p, pos))) { this.detach(c); this.cards.delete(c.uid); return null; }
    return c;
  }

  askPos(p: Side, c: Card): Promise<'atk' | 'def'> {
    return this.ask(p, { t: 'position', card: c });
  }

  fusionOptions(p: Side, exclude?: Card, o: FusionOpts = {}): Card[] {
    const pool = this.fusionPool(p, exclude, o);
    const needsZone = this.freeSlot(p, 'm') < 0;
    return this.players[p].extra.filter((f) => f.def.mats && (o.f?.(f) ?? !f.def.text.includes('"Dark Fusion"')) && !f.def.noSpecial && this.canSummon(p, f, 'fusion') && this.satisfiable(f.def.mats, pool, false, needsZone ? p : undefined));
  }
  private fusionPool(p: Side, exclude?: Card, o: FusionOpts = {}) {
    if (o.pool) return o.pool(p).filter((c) => c.def.kind === 'monster' && c !== exclude);
    if (this.hasTemp('chainMaterial', p)) return [...this.players[p].hand, ...this.monsters(p), ...this.players[p].deck, ...this.players[p].gy].filter((c) => c.def.kind === 'monster' && c !== exclude);
    return [...this.players[p].hand.filter((c) => c.def.kind === 'monster' && c !== exclude), ...this.monsters(p)];
  }
  matMatches(m: Mat, c: Card) {
    if (c.def.kind !== 'monster' || c.token) return false;
    if (typeof m === 'string') return c.def.id === m;
    return (!m.race || c.def.race === m.race) && (!m.attr || c.def.attr === m.attr) && (!m.name || this.nameOf(c) === m.name || c.def.name === m.name)
      && (!m.set || c.def.name.includes(m.set) || !!c.def.alias?.includes(m.set)) && (!m.fn || m.fn(c));
  }
  private subFor(m: Mat, c: Card) { return typeof m === 'string' && !!c.def.fusionSub && !c.token; }
  private satisfiable(mats: Mat[], pool: Card[], sub = false, needsZone?: Side): boolean {
    if (!mats.length) return needsZone === undefined;
    const [m, ...rest] = mats;
    return pool.some((c, i) => {
      const direct = this.matMatches(m, c);
      const asSub = !direct && !sub && this.subFor(m, c);
      const freesZone = c.zone === 'mzone' && c.ctrl === needsZone;
      return (direct || asSub) && this.satisfiable(rest, pool.filter((_, j) => j !== i), sub || asSub, freesZone ? undefined : needsZone);
    });
  }
  matName(m: Mat) {
    return typeof m === 'string' ? `"${getCard(m).name}"` : m.text ?? (m.name ? `"${m.name}"` : `1 ${m.set ? `"${m.set}" ` : ''}${m.attr ?? ''}${m.race ?? ''} monster`.replace(/  +/g, ' '));
  }

  async doFusion(p: Side, src: Card, banishMats = false, o: FusionOpts = {}) {
    const opts = this.fusionOptions(p, src, o);
    if (!opts.length) return null;
    const uniq = opts.filter((c, i) => opts.findIndex((o) => o.def.id === c.def.id) === i);
    const [f] = await this.select(p, 'Select a Fusion Monster to Fusion Summon', uniq, 1, 1, 'good');
    const mats = f.def.mats!;
    const pool = this.fusionPool(p, src, o);
    const chosen: Card[] = [];
    let sub = false;
    let needsZone: Side | undefined = this.freeSlot(p, 'm') < 0 ? p : undefined;
    for (let i = 0; i < mats.length; i++) {
      const left = pool.filter((c) => !chosen.includes(c));
      const cands = left.filter((c) => {
        const direct = this.matMatches(mats[i], c);
        const asSub = !direct && !sub && this.subFor(mats[i], c);
        const freesZone = c.zone === 'mzone' && c.ctrl === needsZone;
        return (direct || asSub) && this.satisfiable(mats.slice(i + 1), left.filter((x) => x !== c), sub || asSub, freesZone ? undefined : needsZone);
      });
      const [m] = await this.select(p, `Select Fusion Material: ${this.matName(mats[i])}`, cands, 1, 1, 'cost', undefined, undefined, undefined, true);
      if (!this.matMatches(mats[i], m)) sub = true;
      if (m.zone === 'mzone' && m.ctrl === needsZone) needsZone = undefined;
      chosen.push(m);
    }
    const last = mats[mats.length - 1];
    if (typeof last !== 'string' && last.more) {
      const more = pool.filter((c) => !chosen.includes(c) && this.matMatches(last, c));
      if (more.length) chosen.push(...(await this.select(p, `Select any additional Fusion Materials: ${this.matName(last)}`, more, 0, more.length, 'cost')));
    }
    f.mark.matCount = chosen.length;
    f.mark.matAtk = chosen.reduce((n, m) => n + (m.faceUp && m.zone === 'mzone' ? this.atk(m) : m.def.atk ?? 0), 0);
    for (const m of chosen) {
      const chainMat = !o.pool && this.hasTemp('chainMaterial', p);
      const dest = chainMat ? 'banished' : o.dest ?? (banishMats ? 'banished' : 'gy');
      this.log(`${m.def.name} is ${dest === 'banished' ? 'banished' : dest === 'deck' ? 'shuffled into the Deck' : 'sent to the Graveyard'} as Fusion Material.`);
      m.mark.fusionMatTurn = this.turn;
      m.mark.fusionMatFor = f.def.id;
      await this.move(m, dest, { why: 'fusion' });
    }
    if (o.dest === 'deck') this.shuffle(p);
    if (o.later) { await o.later(f); return f; }
    if (!this.canSpecial(p, f)) return null;
    await this.emit({ t: 'fusion', card: f, materials: chosen });
    await this.specialSummon(f, p, await this.askPos(p, f), 'fusion');
    if (!o.pool && this.hasTemp('chainMaterial', p)) { const mv = f.mv; this.schedule({ at: 'EP', turn: this.turn, fn: async () => { if (f.mv === mv && f.zone === 'mzone') await this.destroy(f, 'effect', undefined, p); } }); }
    return f;
  }

  private ritualPool(p: Side, rm: Card, src: Card) {
    return [...this.players[p].hand.filter((c) => c.def.kind === 'monster' && c !== rm && c !== src), ...this.monsters(p)].filter((c) => this.tributeOk(c));
  }
  private ritualMonsters(p: Side, name: string | ((c: Card) => boolean)) {
    return this.players[p].hand.filter((c) => c.def.kind === 'monster' && (typeof name === 'string' ? c.def.name === name : c.def.mtype === 'ritual' && name(c)));
  }
  private ritualOk(p: Side, rm: Card, src: Card, exact = false) {
    if (!this.canSummon(p, rm, 'ritual')) return false;
    const pool = this.ritualPool(p, rm, src);
    const lv = rm.def.lv ?? 0;
    const room = this.freeSlot(p, 'm') >= 0 || pool.some((c) => c.zone === 'mzone');
    if (!exact) return room && pool.reduce((s, c) => s + this.lvOf(c), 0) >= lv;
    const sums = new Set([0]);
    for (const c of pool) for (const v of [...sums]) if (v + this.lvOf(c) <= lv) sums.add(v + this.lvOf(c));
    return room && sums.has(lv);
  }
  ritualFeasible(p: Side, name: string | ((c: Card) => boolean), src: Card, exact = false) {
    return this.ritualMonsters(p, name).some((rm) => this.ritualOk(p, rm, src, exact));
  }
  async doRitual(p: Side, name: string | ((c: Card) => boolean), src: Card, exact = false) {
    const opts = this.ritualMonsters(p, name).filter((rm) => this.ritualOk(p, rm, src, exact));
    if (!opts.length) return;
    const rm = opts.length === 1 ? opts[0] : (await this.select(p, 'Select a Ritual Monster to Ritual Summon', opts, 1, 1, 'good'))[0];
    const lv = rm.def.lv!;
    const pool = this.ritualPool(p, rm, src);
    const freeNow = this.freeSlot(p, 'm') >= 0;
    const total = (cs: Card[]) => cs.reduce((s, c) => s + this.lvOf(c), 0);
    const validate = (cs: Card[]) => (exact ? total(cs) === lv : total(cs) >= lv) && (freeNow || cs.some((c) => c.zone === 'mzone'));
    const trib = await this.select(p, `Tribute monsters whose total Levels are ${lv} or more`, pool, 1, pool.length, 'cost', validate);
    const toDeck = this.locks().some((l) => l.lock.ritualToDeck);
    for (const t of trib) { this.log(`${t.def.name} is tributed for the Ritual.`); await this.move(t, toDeck ? 'deck' : 'gy', { why: 'tribute' }); }
    if (toDeck) this.shuffle(p);
    if (!this.canSpecial(p, rm)) return;
    await this.emit({ t: 'ritual', card: rm });
    await this.specialSummon(rm, p, await this.askPos(p, rm), 'ritual');
  }

  /** Take control of c. Until the End Phase unless `perm`; `holder` = control lasts while that card stays. */
  async takeControl(c: Card, p: Side, perm = false, holder?: Card) {
    if (c.zone !== 'mzone' || c.ctrl === p) return false;
    if ((c.owner !== p && this.locks().some((l) => l.lock.noControl)) || (c.faceUp && c.def.fixedCtrl && !this.negated(c))) { this.log('Control cannot change.'); return false; }
    const i = this.freeSlot(p, 'm');
    if (i < 0) return false;
    const from = c.zone;
    this.detach(c);
    this.players[p].m[i] = c;
    c.slot = i;
    c.ctrl = p;
    c.returnAt = perm || holder ? undefined : this.turn;
    if (holder) { c.data.heldBy = holder.uid; c.data.heldMv = holder.mv; }
    this.log(`${this.name(p)} takes control of ${c.def.name}.`);
    await this.emit({ t: 'move', card: c, from, to: 'mzone' });
    this.raise('controlChanged', c);
    return true;
  }
  async returnControl(c: Card) {
    if (c.zone !== 'mzone' || c.ctrl === c.owner) return;
    const slot = this.players[c.owner].m.indexOf(null);
    if (slot < 0) { await this.move(c, 'gy', { why: 'rule' }); return; }
    this.detach(c);
    this.players[c.owner].m[slot] = c;
    c.slot = slot;
    c.ctrl = c.owner;
    this.log(`${c.def.name} returns to ${this.name(c.owner)}.`);
    await this.emit({ t: 'move', card: c, from: 'mzone', to: 'mzone' });
  }

  async changePos(c: Card, to: 'atk' | 'def' | 'reveal' | 'swap', triggerFlip = true) {
    if (c.zone !== 'mzone') return;
    const wasDown = !c.faceUp;
    const was = c.pos;
    if (to === 'reveal') { if (!wasDown) return; } else c.pos = to === 'swap' ? (c.pos === 'atk' ? 'def' : 'atk') : to;
    c.faceUp = true;
    await this.emit({ t: 'pos', card: c });
    if (!wasDown && was !== c.pos) this.raise(c.pos === 'def' ? 'toDef' : 'toAtk', c);
    if (wasDown) { await this.emit({ t: 'flip', card: c }); if (triggerFlip) this.raiseFlip(c); }
  }
  /** Turn a face-up card face-down (keeps its battle position for monsters). */
  async setFaceDown(c: Card) {
    if (!this.onField(c) || !c.faceUp) return;
    c.faceUp = false;
    delete c.data.ctr;
    c.mods = [];
    for (const e of this.equipsOf(c)) await this.destroy(e, 'effect');
    await this.emit({ t: 'pos', card: c });
  }

  // ------------------------------------------------------------------ activation & chains
  speedOf(c: Card, e: Effect) {
    if (e.type === 'quick') return 2;
    if (e.type !== 'activate') return 1;
    if (c.def.kind === 'trap') return c.def.stype === 'counter' ? 3 : 2;
    return c.def.stype === 'quick' ? 2 : 1;
  }

  private matchOn(eff: Effect, ev: Ev, p: Side, card: Card): boolean {
    const fits = (c: Card) => this.onField(c) && (!eff.onF || this.match(c, eff.onF, p));
    const onOk = !eff.on || eff.on.some((on: On) => {
      switch (on) {
        case 'oppSummon': return ev.e === 'summon' && ev.player !== p && ev.cards.some(fits);
        case 'oppNormalFlip': return ev.e === 'summon' && ev.player !== p && (ev.how === 'normal' || ev.how === 'flip') && ev.cards.some(fits);
        case 'anySummon': return ev.e === 'summon' && ev.cards.some(fits);
        case 'oppAttack': return ev.e === 'attack' && ev.player !== p && fits(ev.attacker);
        case 'summoning': return ev.e === 'summoning' && ev.player !== p && !ev.negated;
        case 'activateSpell': return ev.e === 'chain' && ev.link.isCard && ev.link.p !== p && ev.link.card.def.kind === 'spell';
        case 'activateTrap': return ev.e === 'chain' && ev.link.isCard && ev.link.p !== p && ev.link.card.def.kind === 'trap';
        case 'activateST': return ev.e === 'chain' && ev.link.isCard && ev.link.p !== p;
        default: return false;
      }
    });
    return onOk && (!eff.when || eff.when(this, ev, p, card));
  }

  canActivate(card: Card, idx: number, p: Side, evs: Ev[], min: number): boolean {
    const eff = card.def.effects![idx];
    const d = card.def;
    if (eff.type === 'trigger' || eff.type === 'flip') return false;
    if (eff.opt && card.opt[idx] === this.turn) return false;
    if (eff.once && card.data[`once${idx}`]) return false;
    if (this.chain.some((l) => l.card === card && l.idx === idx)) return false; // one link per effect per chain
    if (this.negated(card)) return false;
    if (this.locks().some((l) => l.lock.activate?.(this, l.src, p, card, eff))) return false;
    const speed = this.speedOf(card, eff);
    if (speed < min) return false;
    const empty = this.chain.length === 0 && p === this.tp;
    if (speed === 1) {
      const ok = eff.phase
        ? empty && evs.some((e) => e.e === 'open' && eff.phase!.includes((e.phase ?? this.phase) as 'SP'))
        : empty && evs.some((e) => e.e === 'open' && e.main);
      if (!ok) return false;
    }
    if (eff.type === 'activate') {
      if (card.zone === 'hand') {
        if ((d.kind !== 'spell' && !(d.kind === 'trap' && this.hasTemp('trapFromHand', p))) || card.owner !== p) return false;
        if (d.stype === 'quick' && p !== this.tp) return false;
        if (d.stype !== 'field' && this.freeSlot(p, 's') < 0) return false;
      } else if (card.zone === 'szone' || card.zone === 'fzone') {
        if (card.faceUp || card.ctrl !== p) return false;
        if ((d.kind === 'trap' || d.stype === 'quick') && card.turnIn >= this.turn && !(d.kind === 'trap' && this.locks().some((l) => l.lock.trapSameTurn?.(this, l.src, p)))) return false;
      } else return false;
    } else {
      const zones = eff.from ?? (d.kind === 'monster' ? ['mzone'] : ['szone', 'fzone']);
      if (!zones.includes(card.zone)) return false;
      if (this.onField(card) ? !card.faceUp || card.ctrl !== p : card.owner !== p) return false;
    }
    let ev: Ev | undefined;
    if (eff.on || eff.when) {
      ev = evs.find((e) => this.matchOn(eff, e, p, card));
      if (!ev) return false;
    }
    if (eff.cond && !eff.cond(this, card, p, ev ?? evs[evs.length - 1])) return false;
    return this.feasible(card, eff, p);
  }

  private feasible(card: Card, eff: Effect, p: Side) {
    if (!this.reqOk(eff.req, p, card)) return false;
    for (let i = 0; i < (eff.targets?.length ?? 0); i++) {
      const t = eff.targets![i];
      if (this.targetCands(eff, i, p, card).length < (t.min ?? t.n ?? 1)) return false;
    }
    if (!(eff.cost ?? []).every((o) => this.opFeasible(o, p, card, true))) return false;
    return eff.ops.every((o) => this.opFeasible(o, p, card, false));
  }

  opFeasible(op: Op, p: Side, card: Card, isCost: boolean): boolean {
    const P = this.players[p];
    switch (op.op) {
      case 'payLP': return P.lp > op.n || (isCost && card.def.kind === 'spell' && this.locks().some((l) => l.lock.noSpellLP?.(this, l.src, p)));
      case 'discard': return !isCost || P.hand.filter((c) => c !== card).length >= op.n;
      case 'draw': return op.who !== 'self' || P.deck.length >= op.n;
      case 'fusion': return this.fusionOptions(p, card).length > 0;
      case 'ritual': return this.ritualFeasible(p, op.name, card, op.exact);
      case 'summon': if (!this.canSpecial(p)) return false; break;
      case 'control': if (this.freeSlot(p, 'm') < 0) return false; break;
      case 'run': return op.feasible ? op.feasible(this, p, card) : true;
    }
    if ('s' in op && !('soft' in op && op.soft)) {
      const s = op.s;
      if (s.t === 'choose' || s.t === 'all') {
        let cs = this.find(s.f, p, card);
        if (op.op === 'summon') cs = cs.filter((c) => this.revivable(c) && this.canSummon(p, c, 'special'));
        if (op.op === 'tribute') cs = cs.filter((c) => this.tributeOk(c));
        if (op.op === 'banish') cs = cs.filter((c) => !this.banishLocked(p, c));
        if (cs.length < (s.t === 'choose' && isCost ? s.n ?? 1 : 1)) return false;
      }
    }
    return true;
  }

  pseudoLink(card: Card, p: Side): Link {
    return { card, idx: -1, eff: { type: 'ignition', ops: [] }, p, targets: [], tmv: [], speed: 1, ev: { e: 'open' }, isCard: false, num: 0, mvAtAct: card.mv, data: {} };
  }

  targetPurpose(eff: Effect, i: number, def: CardDef): Purpose {
    if (def.equip) return (def.equip.atk ?? 0) < 0 ? 'bad' : 'good';
    if (eff.targets?.[i]?.good) return 'good';
    const op = eff.ops.find((o) => 's' in o && o.s.t === 'target' && (o.s.i ?? 0) === i);
    if (!op) return 'bad';
    if (op.op === 'summon') return 'good';
    if (op.op === 'stat') return (op.atk ?? 0) >= 0 && (op.def ?? 0) >= 0 ? 'good' : 'bad';
    return 'bad';
  }

  async activate(card: Card, idx: number, p: Side, ev: Ev, trig?: Trig) {
    const eff = card.def.effects![idx];
    const isCard = eff.type === 'activate';
    if (isCard) {
      if (card.zone === 'hand') {
        if (card.def.kind === 'trap') { const t = this.activeTemps().find((x) => x.tag === 'trapFromHand' && (x.p === undefined || x.p === p)); if (t) this.temps.splice(this.temps.indexOf(t), 1); }
        if (card.def.stype === 'field') await this.placeField(card, p);
        else this.placeST(card, p, true);
      }
      card.faceUp = true;
    }
    if (eff.opt) card.opt[idx] = this.turn;
    if (eff.once) card.data[`once${idx}`] = true;
    const evs: Ev[] = [ev, ...(this.chain.length ? [{ e: 'chain', link: this.chain[this.chain.length - 1] } as Ev] : [])];
    const matched = eff.on || eff.when ? [...evs].reverse().find((e) => this.matchOn(eff, e, p, card)) ?? ev : ev;
    const link: Link = {
      card, idx, eff, p, targets: [], tmv: [], speed: this.speedOf(card, eff), ev: trig ? trig.ev : matched, isCard,
      num: this.chain.length + 1, mvAtAct: card.mv, trig, data: {},
    };
    this.log(`${this.name(p)} activates ${card.def.name}${link.num > 1 ? ` (Chain Link ${link.num})` : ''}.`);
    await this.emit({ t: 'activate', card, link: link.num, player: p });
    for (let i = 0; i < (eff.targets?.length ?? 0); i++) {
      const t = eff.targets![i];
      const n = t.n ?? 1;
      const cands = this.targetCands(eff, i, p, card).filter((c) => !link.targets.flat().includes(c));
      const picked = await this.select(p, `Select a target for ${card.def.name}`, cands, Math.min(t.min ?? n, cands.length), n, this.targetPurpose(eff, i, card.def), undefined, 'target');
      link.targets.push(picked);
      link.tmv.push(picked.map((c) => c.mv));
      if (picked.length) this.log(`Target: ${picked.map((c) => (this.onField(c) && !c.faceUp ? 'a face-down card' : c.def.name)).join(', ')}.`);
    }
    for (const t of link.targets.flat()) if (t.def.onTargeted && !this.negated(t)) await t.def.onTargeted(this, t, link);
    if (card.mark.actDmg && isCard) { const n = card.mark.actDmg; delete card.mark.actDmg; await this.damage(p, n, card); }
    for (const op of eff.cost ?? []) await this.runOp(op, link, true);
    this.chain.push(link);
    if (isCard && card.def.kind !== 'monster') {
      const key = `stActivations:${p}:${this.turn}`;
      this.flags[key] = (this.flags[key] ?? 0) + 1;
    }
  }

  responseOptions(p: Side, evs: Ev[], min: number): Action[] {
    const out: Action[] = [];
    const P = this.players[p];
    const consider = (c: Card) => c.def.effects?.forEach((_, i) => { if (this.canActivate(c, i, p, evs, min)) out.push({ a: 'act', card: c, eff: i }); });
    for (const c of P.hand) consider(c);
    for (const c of this.spellTraps(p)) consider(c);
    for (const c of this.monsters(p)) consider(c);
    for (const c of P.gy) if (c.def.effects?.some((e) => e.from?.includes('gy'))) consider(c);
    return out;
  }

  describeEv(ev: Ev): string {
    switch (ev.e) {
      case 'summon': return `${this.name(ev.player)} summoned ${ev.cards.map((c) => (c.faceUp ? c.def.name : 'a face-down monster')).join(', ')}.`;
      case 'summoning': return `${this.name(ev.player)} is summoning ${ev.cards.map((c) => c.def.name).join(', ')}.`;
      case 'attack': return `${ev.attacker.def.name} declares an attack${ev.target ? ` on ${ev.target.faceUp ? ev.target.def.name : 'a face-down monster'}` : ' directly'}.`;
      case 'chain': return `${this.name(ev.link.p)} activated ${ev.link.card.def.name}.`;
      case 'open': return ev.phase === 'EP' ? 'End Phase.' : ev.phase === 'BP' ? 'Battle Phase begins.' : ev.phase === 'SP' ? 'Standby Phase.' : 'Open game state.';
      case 'damage': return `${this.name(ev.player)} took ${ev.n} damage.`;
      case 'sent': return `${ev.card.def.name} was sent to the Graveyard.`;
      case 'set': return `${this.name(ev.player)} set a monster.`;
      case 'bounce': return `${ev.cards.map((c) => c.def.name).join(', ')} returned to the hand.`;
      case 'equip': return `${ev.card.def.name} was equipped to ${ev.target.def.name}.`;
      case 'draw': return `${this.name(ev.player)} drew ${ev.n} card${ev.n > 1 ? 's' : ''}.`;
      case 'discard': return `${this.name(ev.player)} discarded ${ev.cards.length} card${ev.cards.length > 1 ? 's' : ''}.`;
    }
  }

  private queueWindow(ev: Ev) { if (this.listens) this.windows.push(ev); }

  async chainLoop(ev: Ev, first: Side, minOverride?: number) {
    let p = first;
    let passes = 0;
    while (passes < 2) {
      const top = this.chain[this.chain.length - 1];
      const chainEv: Ev | null = top ? { e: 'chain', link: top } : null;
      const evs: Ev[] = chainEv ? [ev, chainEv] : [ev];
      const min = top ? Math.max(2, top.speed) : ev.e === 'summoning' ? 3 : minOverride ?? 2;
      const opts = this.responseOptions(p, evs, min);
      let pick: Action | null = null;
      if (opts.length) {
        const shown = chainEv ?? ev;
        pick = await this.ask<Action | null>(p, { t: 'chain', actions: opts, ev: shown, text: this.describeEv(shown) });
      }
      if (pick && pick.a === 'act') {
        await this.activate(pick.card, pick.eff, p, ev);
        passes = 0;
      } else passes++;
      p = opp(p);
    }
    if (this.chain.length) await this.resolveChain();
  }

  private async resolveChain() {
    while (this.chain.length) {
      const link = this.chain[this.chain.length - 1];
      if (link.activationNegated && link.isCard && link.card.def.kind !== 'monster') {
        const key = `stActivations:${link.p}:${this.turn}`;
        this.flags[key] = Math.max(0, (this.flags[key] ?? 0) - 1);
      }
      await this.emit({ t: 'resolve', card: link.card, link: link.num, negated: !!link.negated });
      if (link.negated) this.log(`${link.card.def.name}'s ${link.activationNegated ? 'activation' : 'effect'} was negated.`);
      else if (link.isCard && this.onField(link.card) && this.negated(link.card)) this.log(`${link.card.def.name}'s effect is negated.`);
      else {
        for (const op of link.eff.ops) {
          await this.runOp(op, link, false);
          await this.cleanup();
          this.checkLP();
          if (link.data.stop) break;
        }
      }
      if (!link.negated) for (const f of this.faceUpField()) if (f.def.onResolve && !this.negated(f)) await f.def.onResolve(this, f, link);
      this.chain.pop();
      const c = link.card;
      if (link.isCard && this.onField(c) && c.mv === link.mvAtAct) {
        const st = c.def.stype;
        const stays = !link.activationNegated && (st === 'continuous' || st === 'field' || c.def.stays || c.equipTo !== undefined || c.data.keep);
        if (!stays) await this.move(c, 'gy', { why: 'rule' });
      }
      await this.cleanup();
    }
  }

  raise(on: On, card: Card, other?: Card, ev: Ev = { e: 'open' }) {
    card.def.effects?.forEach((e, idx) => {
      if (e.type === 'trigger' && e.on?.includes(on)) {
        if (this.onField(card) && card.faceUp && this.negated(card)) return;
        const p = this.onField(card) ? card.ctrl : card.owner;
        this.pending.push({ card, idx, p, other, ev });
      }
    });
  }
  private raiseFlip(card: Card, ev: Ev = { e: 'open' }) {
    if (this.negated(card)) return;
    card.def.effects?.forEach((e, idx) => {
      if (e.type === 'flip') this.pending.push({ card, idx, p: card.ctrl, ev });
    });
    card.mark.flipped = true;
    card.data.flipped = true;
    card.data.flipTurn = this.turn;
  }

  private canTrigger(t: Trig) {
    const eff = t.card.def.effects![t.idx];
    if (eff.opt && t.card.opt[t.idx] === this.turn) return false;
    if (eff.once && t.card.data[`once${t.idx}`]) return false;
    if (eff.cond && !eff.cond(this, t.card, t.p, t.ev)) return false;
    for (let i = 0; i < (eff.targets?.length ?? 0); i++) {
      const tg = eff.targets![i];
      if (this.targetCands(eff, i, t.p, t.card).length < (tg.min ?? tg.n ?? 1)) return false;
    }
    return (eff.cost ?? []).every((o) => this.opFeasible(o, t.p, t.card, true));
  }

  /** Resolve pending trigger effects and response windows until the game state is quiet. */
  async settle() {
    for (let guard = 0; guard < 300; guard++) {
      this.checkLP();
      if (this.deferred.length) {
        for (const fn of this.deferred.splice(0)) { await fn(); await this.cleanup(); }
        continue;
      }
      if (this.pending.length) {
        const trigs = this.pending.splice(0).sort((a, b) => (a.p === this.tp ? 0 : 1) - (b.p === this.tp ? 0 : 1));
        const ctx = trigs.find((t) => t.ev.e === 'summon')?.ev ?? { e: 'open' };
        this.windows = this.windows.filter((e) => e !== ctx);
        let last: Side = this.tp;
        for (const t of trigs) {
          if (!this.canTrigger(t)) continue;
          const eff = t.card.def.effects![t.idx];
          if (eff.optional && !(await this.ask<boolean>(t.p, { t: 'yesno', kind: 'trigger', card: t.card, text: `Activate the effect of "${t.card.def.name}"?`, eff, ev: t.ev }))) continue;
          await this.activate(t.card, t.idx, t.p, ctx, t);
          last = t.p;
        }
        if (this.chain.length) {
          if (ctx.e === 'summon' && ctx.how === 'normal' && ctx.cards.some((card) => card.def.protectedNormalSummon)) await this.resolveChain();
          else await this.chainLoop(ctx, opp(last));
        }
        continue;
      }
      if (this.windows.length) {
        await this.chainLoop(this.windows.shift()!, this.tp);
        continue;
      }
      return;
    }
  }

  // ------------------------------------------------------------------ op interpreter
  private async resolveSel(s: Sel, link: Link, purpose: Purpose, op: Op): Promise<Card[]> {
    const ok = (c: Card) => !this.onField(c) || this.affects(link.card, c);
    switch (s.t) {
      case 'target': {
        const i = s.i ?? 0;
        return (link.targets[i] ?? []).filter((c, k) => c.mv === link.tmv[i][k] && ok(c));
      }
      case 'this': return [link.card];
      case 'event': {
        const ev = link.ev;
        const cs = ev.e === 'summon' || ev.e === 'summoning' ? ev.cards : ev.e === 'attack' ? [ev.attacker] : ev.e === 'sent' ? [ev.card] : [];
        return cs.filter((c) => (this.onField(c) || ev.e === 'sent') && (!link.eff.onF || this.match(c, link.eff.onF, link.p)) && ok(c));
      }
      case 'other': {
        const o = link.trig?.other;
        return o && this.onField(o) && ok(o) ? [o] : [];
      }
      case 'all': return this.find(s.f, link.p, link.card).filter(ok);
      case 'choose': {
        let cs = this.find(s.f, link.p, link.card).filter(ok);
        if (op.op === 'summon') cs = cs.filter((c) => this.revivable(c) && this.canSummon(link.p, c, 'special'));
        if (op.op === 'tribute') cs = cs.filter((c) => this.tributeOk(c));
        const n = Math.min(s.n ?? 1, cs.length);
        if (!n) return [];
        const by = s.by === 'opp' ? opp(link.p) : link.p;
        const verb: Record<string, string> = { destroy: 'destroy', banish: 'banish', toHand: 'add to hand', toGY: 'send to the Graveyard', toDeck: 'return to the Deck', tribute: 'Tribute', summon: 'Special Summon', stat: 'affect', pos: 'change', control: 'take' };
        return this.select(by, `${link.card.def.name}: select ${s.upTo ? 'up to ' : ''}${n} card${n > 1 ? 's' : ''} to ${verb[op.op] ?? 'select'}`, cs, s.upTo ? 0 : n, n, purpose);
      }
    }
  }

  async select(p: Side, text: string, cards: Card[], min: number, max: number, purpose: Purpose, validate?: (cs: Card[]) => boolean, selectionKind?: 'target', reveal?: boolean, forcePrompt = false): Promise<Card[]> {
    if (!cards.length) return [];
    if (!forcePrompt && !validate && min === max && cards.length <= min) return cards.slice();
    const r = await this.ask<Card[]>(p, { t: 'select', text, cards, min, max, purpose, validate, selectionKind, reveal });
    return (r ?? []).filter((c) => cards.includes(c)).slice(0, max);
  }

  ctx(link: Link, isCost: boolean): Ctx {
    const t = (link.targets[0] ?? []).filter((c, k) => c.mv === link.tmv[0][k]);
    return { d: this, p: link.p, o: opp(link.p), card: link.card, link, t, isCost };
  }

  async runOp(op: Op, link: Link, isCost: boolean) {
    const p = link.p;
    const sel = (s: Sel, purpose: Purpose) => this.resolveSel(s, link, purpose, op);
    switch (op.op) {
      case 'destroy': for (const c of await sel(op.s, 'bad')) if (!link.data.spare?.includes(c.uid)) await this.destroy(c, 'effect', undefined, p); break;
      case 'banish': for (const c of await sel(op.s, isCost ? 'cost' : 'bad')) await this.banish(c, p); break;
      case 'toGY': for (const c of await sel(op.s, 'bad')) await this.move(c, 'gy', { by: p }); break;
      case 'tribute': for (const c of await sel(op.s, 'cost')) { this.log(`${this.name(p)} tributes ${c.def.name}.`); await this.move(c, 'gy', { why: 'tribute' }); } break;
      case 'toHand': case 'toDeck': {
        const cs = await sel(op.s, op.s.t === 'choose' && op.s.f.zone !== 'mzone' ? 'good' : 'bad');
        const shuffleSides = new Set<Side>();
        const bounced: Card[] = [];
        for (const c of cs) {
          if (c.zone === 'deck') shuffleSides.add(c.owner);
          const where = c.zone;
          await this.move(c, op.op === 'toHand' ? 'hand' : 'deck');
          if (op.op === 'toDeck') shuffleSides.add(c.owner);
          if (op.op === 'toHand' && where === 'mzone') bounced.push(c);
          this.log(`${c.def.name} is ${op.op === 'toHand' ? (where === 'deck' ? 'added to the hand from the Deck' : 'returned to the hand') : 'shuffled into the Deck'}.`);
        }
        for (const s of shuffleSides) await this.shuffleDeck(s);
        for (const s of [0, 1] as Side[]) { const mine = bounced.filter((c) => c.owner === s); if (mine.length) this.queueWindow({ e: 'bounce', cards: mine, player: s }); }
        break;
      }
      case 'summon': {
        const cs = await sel(op.s, 'good');
        const fromDeck = cs.some((c) => c.zone === 'deck');
        for (const c of cs) {
          if (!this.revivable(c) || !this.canSpecial(p, c)) continue;
          const pos = op.pos ?? (await this.askPos(p, c));
          if ((await this.specialSummon(c, p, pos, 'special', false, link.card)) && op.bind) link.card.boundTo = c.uid;
        }
        if (fromDeck) this.shuffle(p);
        break;
      }
      case 'draw': for (const s of this.sides(op.who, p)) await this.draw(s, op.n); break;
      case 'damage': for (const s of this.sides(op.who, p)) await this.damage(s, op.n, link.card); break;
      case 'heal': for (const s of this.sides(op.who, p)) await this.heal(s, op.n); break;
      case 'discard':
        for (const s of this.sides(op.who, p)) {
          const hand = this.players[s].hand.filter((c) => c !== link.card);
          const n = Math.min(op.n, hand.length);
          const pick = await this.select(s, `Discard ${n} card${n > 1 ? 's' : ''}`, hand, n, n, 'cost');
          await this.discard(s, pick, isCost ? null : p);
        }
        break;
      case 'mill': for (const s of this.sides(op.who, p)) await this.mill(s, op.n, p); break;
      case 'payLP': case 'payHalf':
        if (isCost && link.card.def.kind === 'spell' && this.locks().some((l) => l.lock.noSpellLP?.(this, l.src, p))) { this.log('No LP are paid (Spell Economics).'); break; }
        await this.changeLP(p, op.op === 'payLP' ? -op.n : -Math.floor(this.players[p].lp / 2), true);
        break;
      case 'stat':
        for (const c of await sel(op.s, (op.atk ?? 0) >= 0 && (op.def ?? 0) >= 0 ? 'good' : 'bad')) {
          if (c.zone !== 'mzone' || !c.faceUp) continue;
          c.mods.push({ atk: op.atk ?? 0, def: op.def ?? 0, turn: op.perm ? -1 : this.turn });
          const parts = [op.atk ? `${op.atk > 0 ? 'gains' : 'loses'} ${Math.abs(op.atk)} ATK` : '', op.def ? `${op.def > 0 ? 'gains' : 'loses'} ${Math.abs(op.def)} DEF` : ''].filter(Boolean);
          this.log(`${c.def.name} ${parts.join(' and ')}.`);
          await this.emit({ t: 'stat', card: c });
        }
        break;
      case 'pos': for (const c of await sel(op.s, 'bad')) await this.changePos(c, op.to); break;
      case 'negate': {
        const ev = link.ev;
        if (ev.e === 'chain') {
          if (ev.link.card.def.noNegate) { this.log(`${ev.link.card.def.name} cannot be negated.`); break; }
          ev.link.negated = true;
          ev.link.activationNegated = !op.effectOnly;
          if ((op.destroy ?? !op.effectOnly) && ev.link.isCard && this.onField(ev.link.card)) await this.destroy(ev.link.card, 'effect', undefined, p);
        } else if (ev.e === 'summoning') {
          ev.negated = true;
          this.log('The Summon was negated.');
          for (const c of ev.cards) if (this.onField(c)) await this.destroy(c, 'effect', undefined, p);
        }
        break;
      }
      case 'negateAttack':
        this.attackNegated = true;
        if (op.endBattle) this.battleEnded = true;
        this.log(op.endBattle ? 'The attack is negated and the Battle Phase ends.' : 'The attack is negated.');
        break;
      case 'damageAtk': {
        const [c] = await sel(op.s, 'bad');
        if (c && c.zone === 'mzone' && c.faceUp) { const a = this.atk(c); for (const s of this.sides(op.who, p)) await this.damage(s, a, link.card); }
        break;
      }
      case 'control': for (const c of await sel(op.s, 'bad')) await this.takeControl(c, p); break;
      case 'fusion': await this.doFusion(p, link.card); break;
      case 'ritual': await this.doRitual(p, op.name, link.card, op.exact); break;
      case 'equip': {
        const t = link.targets[0]?.[0];
        if (t && t.mv === link.tmv[0][0] && t.zone === 'mzone' && t.faceUp && this.onField(link.card) && this.affects(link.card, t)) {
          const f = this.eqSpec(link.card)?.f;
          if (!f || this.match(t, f, p, link.card)) await this.equipCard(link.card, t);
        }
        break;
      }
      case 'shield': this.players[p].shieldTurn = this.turn; this.log(`${this.name(p)}'s monsters are protected from battle this turn.`); break;
      case 'noAttacks': this.players[opp(p)].noAttackTurn = this.turn; this.log(`${this.name(opp(p))} cannot declare an attack this turn.`); break;
      case 'noAttackSelf': link.card.noAttackTurn = this.turn; break;
      case 'run': await op.fn(this.ctx(link, isCost)); break;
    }
  }

  // ------------------------------------------------------------------ battle
  /** Attacks every opponent monster once each (Diffusion Wave-Motion, Asura Priest). */
  hits(c: Card): number[] { return c.data.hitTurn === this.turn ? c.data.hit ?? [] : []; }
  attacksAll(c: Card) { return c.data.attackAll === this.turn || (this.hasRule(c, 'attackAll') && this.monsters(opp(c.ctrl)).length > 0 && !(c.data.hitDirect === this.turn)); }
  attackTax(c: Card) { return this.locks().reduce((n, l) => n + (l.lock.tax?.(this, l.src, c) ?? 0), 0); }
  canAttack(c: Card): boolean {
    if (this.phase !== 'BP' || this.turn === 1 || c.zone !== 'mzone' || c.ctrl !== this.tp || !c.faceUp) return false;
    if (c.pos !== 'atk' && !this.hasRule(c, 'attackFromDef')) return false;
    const limit = this.attacksAll(c) ? this.monsters(opp(c.ctrl)).filter((m) => !this.hits(c).includes(m.uid)).length + c.attacks : c.data.attackN?.turn === this.turn ? c.data.attackN.n : (this.hasRule(c, 'doubleAttack') ? 2 : 1) + (c.data.extraAtk === this.turn ? 1 : 0) + (!this.negated(c) ? c.def.extraAttacks?.(this, c) ?? 0 : 0);
    if (c.attacks >= limit) return false;
    if (this.hasRule(c, 'cantAttack') || c.noAttackTurn === this.turn || this.players[c.ctrl].noAttackTurn === this.turn) return false;
    for (const s of [0, 1] as Side[]) {
      for (const x of this.fieldCards(s)) {
        if (!x.faceUp || !x.def.rules || this.negated(x)) continue;
        if (x.def.rules.includes('lockOppAttack') && x.ctrl !== c.ctrl && x.zone !== 'mzone') return false;
        if (x.def.rules.includes('lockLv4Attack') && x.zone !== 'mzone' && this.lvOf(c) >= 4) return false;
        if (x.def.rules.includes('lockAtk1500') && x.zone !== 'mzone' && this.atk(c) >= 1500) return false;
      }
    }
    if (this.locks().some((l) => l.lock.attack?.(this, l.src, c))) return false;
    if (c.def.attackCond && !this.negated(c) && !c.def.attackCond(this, c)) return false;
    const tax = this.attackTax(c);
    if (tax && this.players[c.ctrl].lp <= tax) return false;
    if (!this.negated(c) && !(c.def.attackCost ?? []).every((o) => this.opFeasible(o, c.ctrl, c, true))) return false;
    return this.attackTargets(c).length > 0;
  }

  attackTargets(c: Card): (Card | null)[] {
    const mons = this.monsters(opp(c.ctrl));
    const lk = this.locks();
    const allowed = (t: Card | null) => !lk.some((l) => l.lock.target?.(this, l.src, c, t)) && !(this.attacksAll(c) && (t === null || this.hits(c).includes(t.uid))) && !(c.data.noDirectTurn === this.turn && t === null);
    if (lk.some((l) => l.lock.forceDirect?.(this, l.src, c))) return [null];
    const out: (Card | null)[] = mons.filter(allowed);
    if ((!mons.length || this.hasRule(c, 'direct')) && !this.hasRule(c, 'noDirect') && allowed(null)) out.push(null);
    return out;
  }

  private async battlePhase() {
    this.battleEnded = false;
    await this.chainLoop({ e: 'open', phase: 'BP' }, opp(this.tp));
    await this.settle();
    for (let guard = 0; guard < 100 && !this.battleEnded; guard++) {
      const acts: Action[] = [];
      for (const c of this.monsters(this.tp)) if (this.canAttack(c)) for (const t of this.attackTargets(c)) acts.push({ a: 'attack', card: c, target: t });
      acts.push(...this.responseOptions(this.tp, [{ e: 'open', phase: 'BP' }], 2));
      acts.push({ a: 'phase', to: 'M2' }, { a: 'phase', to: 'EP' });
      const a = await this.ask<Action>(this.tp, { t: 'main', actions: acts, phase: 'BP' });
      if (a.a === 'phase') { if (a.to === 'EP') this.skipM2 = true; break; }
      if (a.a === 'act') { await this.activate(a.card, a.eff, this.tp, { e: 'open', phase: 'BP' }); await this.chainLoop({ e: 'open', phase: 'BP' }, opp(this.tp)); }
      else if (a.a === 'attack') await this.attack(a.card, a.target);
      await this.settle();
    }
    this.dropMods('bp');
    await this.runTasks('BPend');
  }
  skipM2 = false;

  private validAttacker(c: Card) {
    return c.zone === 'mzone' && c.ctrl === this.tp && c.faceUp && (c.pos === 'atk' || this.hasRule(c, 'attackFromDef'));
  }

  private async attack(att: Card, tgt: Card | null) {
    att.attacks++;
    if (tgt) att.data.hit = [...(att.data.hitTurn === this.turn ? att.data.hit ?? [] : []), tgt.uid];
    else att.data.hitDirect = this.turn;
    att.data.hitTurn = this.turn;
    this.attackCount[att.ctrl]++;
    this.attackNegated = false;
    const defSide = opp(att.ctrl);
    const tax = this.attackTax(att);
    if (tax) await this.changeLP(att.ctrl, -tax, true);
    if (!this.negated(att) && att.def.attackCost?.length) {
      const pseudo = this.pseudoLink(att, att.ctrl);
      for (const op of att.def.attackCost) await this.runOp(op, pseudo, true);
    }
    const before = this.monsters(defSide).length;
    this.log(`${att.def.name} attacks ${tgt ? (tgt.faceUp ? tgt.def.name : 'a face-down monster') : this.name(defSide) + ' directly'}.`);
    await this.emit({ t: 'attack', attacker: att, target: tgt });
    const ev: Extract<Ev, { e: 'attack' }> = { e: 'attack', attacker: att, target: tgt, player: att.ctrl };
    this.curAttack = ev;
    try {
      this.raise('attacks', att, tgt ?? undefined, ev);
      if (tgt) this.raise('attacked', tgt, att, ev);
      for (const f of this.faceUpField()) this.raise('anyAttack', f, att, ev);
      await this.settle();
      await this.chainLoop(ev, defSide);
      await this.settle();
      if (ev.attacker !== att) { att = ev.attacker; att.attacks++; }
      if (this.attackNegated || !this.validAttacker(att)) return;
      let target = ev.target;
      const redirected = target !== tgt;
      const gone = target && (target.zone !== 'mzone');
      if (gone || (!redirected && this.monsters(defSide).length !== before)) {
        const choice = await this.ask<Card | null | false>(att.ctrl, { t: 'replay', attacker: att, targets: this.attackTargets(att) });
        if (choice === false) { this.log(`${att.def.name} does not attack again.`); return; }
        target = choice;
        ev.target = target;
        this.log(`Replay: ${att.def.name} attacks ${target ? (target.faceUp ? target.def.name : 'a face-down monster') : 'directly'}.`);
        await this.emit({ t: 'attack', attacker: att, target });
      }
      await this.damageStep(att, target);
      for (const fn of ev.after ?? []) { await fn(); await this.cleanup(); }
    } finally {
      this.curAttack = null;
      this.dropMods('attack');
    }
  }

  private dropMods(scope: 'attack' | 'bp') {
    for (const s of [0, 1] as Side[]) for (const m of this.monsters(s)) m.mods = m.mods.filter((x) => x.scope !== scope && (scope !== 'bp' || x.scope !== 'attack'));
  }

  private hookSrcs(c: Card) { return [c, ...this.equipsOf(c)].filter((x) => !this.negated(x)); }

  private async battleDamage(s: Side, n: number, source: Card, other: Card | null) {
    if (n <= 0) return 0;
    for (const c of [source, other]) {
      if (!c) continue;
      for (const h of this.hookSrcs(c)) if (h.def.battleDmg) n = h.def.battleDmg(this, c, c === source ? other : source, n, s);
    }
    if (this.battle) for (const l of this.locks()) if (l.lock.battleDmg) n = l.lock.battleDmg(this, l.src, this.battle.att, this.battle.tgt, n, s);
    if (n <= 0) { this.log(`${this.name(s)} takes no battle damage.`); return 0; }
    if (this.players[s].shieldTurn === this.turn || this.curAttack?.noDmg?.includes(s) || this.hasTemp('noBattleDmg', s)) { this.log(`${this.name(s)} takes no battle damage.`); return 0; }
    const dealt = await this.damage(s, n, source, true, !other);
    if (dealt) {
      const ev: Ev = { e: 'damage', player: s, n: dealt, battle: true, src: source, direct: !other };
      this.raise('battleDamage', source, other ?? undefined, ev);
      for (const f of this.faceUpField()) this.raise('anyBattleDamage', f, source, ev);
    }
    this.checkLP();
    return dealt;
  }

  private async damageStep(att: Card, tgt: Card | null) {
    this.battle = { att, tgt };
    att.data.battled = this.turn;
    if (tgt) { tgt.data.battled = this.turn; att.data.battledWith = tgt.uid; tgt.data.battledWith = att.uid; }
    try {
      let skip = false;
      for (const [c, o] of [[att, tgt], [tgt, att]] as [Card | null, Card | null][]) {
        if (!c) continue;
        for (const h of this.hookSrcs(c)) if (h.def.preBattle && (await h.def.preBattle(this, c, o))) skip = true;
      }
      await this.cleanup();
      if (skip || !this.validAttacker(att) || (tgt && tgt.zone !== 'mzone')) return;
      const info: BattleInfo = { att, tgt, killedT: false, killedA: false, dmg: 0, dmgTo: null };
      if (!tgt) {
        info.dmgTo = opp(att.ctrl);
        info.dmg = await this.battleDamage(opp(att.ctrl), this.atk(att), att, null);
      } else {
        let flipped = false;
        if (!tgt.faceUp) {
          tgt.faceUp = true;
          flipped = true;
          this.log(`The face-down monster is ${tgt.def.name}.`);
          await this.emit({ t: 'flip', card: tgt });
        }
        const a = this.atk(att);
        let killT = false, killA = false, dmgTo: Side | null = null, dmg = 0;
        if (tgt.pos === 'atk') {
          const t = this.atk(tgt);
          if (a > t) { killT = true; dmgTo = tgt.ctrl; dmg = a - t; }
          else if (a < t) { killA = true; dmgTo = att.ctrl; dmg = t - a; }
          else if (a > 0) killT = killA = true;
        } else {
          const d = this.defv(tgt);
          if (a > d) { killT = true; if (this.hasRule(att, 'pierce')) { dmgTo = tgt.ctrl; dmg = a - d; } }
          else if (a < d) { dmgTo = att.ctrl; dmg = d - a; }
        }
        if (dmgTo !== null) { info.dmgTo = dmgTo; info.dmg = await this.battleDamage(dmgTo, dmg, dmgTo === tgt.ctrl ? att : tgt, dmgTo === tgt.ctrl ? tgt : att); }
        const tDead = killT && (await this.destroy(tgt, 'battle', att, att.ctrl));
        const aDead = killA && (await this.destroy(att, 'battle', tgt, tgt.ctrl));
        info.killedT = tDead;
        info.killedA = aDead;
        if (tDead) this.raise('destroysByBattle', att, tgt);
        if (aDead) this.raise('destroysByBattle', tgt, att);
        if (flipped && tgt.zone !== 'banished') this.raiseFlip(tgt);
      }
      for (const [c, o] of [[att, tgt], [tgt, att]] as [Card | null, Card | null][]) {
        if (!c) continue;
        const srcs = this.onField(c) ? this.hookSrcs(c) : [c];
        for (const h of srcs) if (h.def.postBattle) await h.def.postBattle(this, c, o, info);
      }
      for (const src of this.faceUpField()) if (src.def.afterBattle && !this.negated(src)) await src.def.afterBattle(this, src, info);
      for (const t of this.activeTemps()) if (t.afterBattle) await t.afterBattle(this, info);
      await this.cleanup();
    } finally {
      this.battle = null;
    }
  }

  // ------------------------------------------------------------------ end phase
  private async endPhase() {
    this.skipM2 = false;
    await this.chainLoop({ e: 'open', phase: 'EP' }, opp(this.tp));
    await this.settle();
    for (const c of this.faceUpField()) this.raise('endPhase', c);
    await this.settle();
    await this.runTasks('EP');
    for (const s of [0, 1] as Side[]) {
      for (const c of this.monsters(s)) {
        if (c.returnAt === undefined || c.returnAt > this.turn || c.ctrl === c.owner) continue;
        c.returnAt = undefined;
        await this.returnControl(c);
      }
    }
    for (const c of this.fieldCards(opp(this.tp))) {
      if (!c.faceUp || !c.def.lifetime) continue;
      c.counter++;
      if (c.counter >= c.def.lifetime) { this.log(`${c.def.name} fades away.`); await this.move(c, 'gy', { why: 'rule' }); }
    }
    const P = this.players[this.tp];
    const limit = this.flags[`handLimit:${this.tp}`] || 6;
    if (P.hand.length > limit && !this.locks().some((l) => l.lock.handLimit)) {
      const n = P.hand.length - limit;
      const pick = await this.select(this.tp, `Hand limit: discard ${n} card${n > 1 ? 's' : ''}`, P.hand, n, n, 'cost');
      for (const c of pick) { this.log(`${P.name} discards ${c.def.name}.`); await this.move(c, 'gy', { why: 'rule' }); }
    }
    await this.settle();
  }
}

export type { StatDelta };
