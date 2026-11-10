// Building blocks for card definitions. Plain data where the op vocabulary fits, `run` scripts otherwise.
import type { AiHint, Attr, CardDef, Ctx, Effect, Filter, Lock, On, Op, Race, Script, Side, StatDelta } from '../../engine/types';
import type { Card, Duel, Ev, Link } from '../../engine/duel';

export type Def = Partial<CardDef>;
export type { Card, Duel, Ev, Link, Ctx, Side, Op, Effect, Filter, Lock, Race, Attr, StatDelta };

export const opp = (s: Side): Side => (1 - s) as Side;
export const arr = <T>(x: T | T[]): T[] => (Array.isArray(x) ? x : [x]);

// ---- filters
export const M: Filter = { side: 'any', zone: 'mzone' };
export const OWN_M: Filter = { side: 'self', zone: 'mzone' };
export const OPP_M: Filter = { side: 'opp', zone: 'mzone' };
export const FU: Filter = { side: 'any', zone: 'mzone', faceUp: true };
export const OWN_FU: Filter = { side: 'self', zone: 'mzone', faceUp: true };
export const OPP_FU: Filter = { side: 'opp', zone: 'mzone', faceUp: true };
export const ST: Filter = { side: 'any', st: true, zone: ['szone', 'fzone'], notThis: true };
export const OPP_ST: Filter = { side: 'opp', st: true, zone: ['szone', 'fzone'] };
export const GY_M = (side: 'self' | 'opp' | 'any' = 'self'): Filter => ({ side, zone: 'gy', kind: 'monster' });
export const DECK = (f: Filter = {}): Filter => ({ side: 'self', zone: 'deck', ...f });

// ---- ops
export const run = (fn: Script, ai?: AiHint, feasible?: (d: Duel, p: Side, card: Card) => boolean): Op => ({ op: 'run', fn, ai, feasible });
export const destroyT: Op = { op: 'destroy', s: { t: 'target' } };
export const tributeOther: Op = { op: 'tribute', s: { t: 'choose', f: { side: 'self', zone: 'mzone', notThis: true } } };
export const tributeSelf: Op = { op: 'tribute', s: { t: 'this' } };
export const discardSelf = run(async ({ d, card }) => { await d.discard(card.owner, [card], null); });
export const statT = (atk: number, def = 0, perm = false): Op => ({ op: 'stat', s: { t: 'target' }, atk, def, perm });
export const destroyAll = (f: Filter): Op => ({ op: 'destroy', s: { t: 'all', f } });
export const search = (f: Filter, n = 1): Op => ({ op: 'toHand', s: { t: 'choose', f: DECK(f), n } });
/** Still-valid targets of target group i. */
export const T = (x: Ctx, i: number) => (x.link.targets[i] ?? []).filter((c, k) => c.mv === x.link.tmv[i][k]);
/** Cost: Tribute 1 other monster you control and remember its ATK / Level in link.data[key]. */
export const tributeFor = (key: string): Op => run(async ({ d, p, card, link }) => {
  const c = await pick(d, p, 'Select a monster to Tribute', d.monsters(p).filter((m) => m !== card && d.tributeOk(m)), 'cost');
  if (!c) return;
  link.data[key] = { atk: c.faceUp ? d.atk(c) : c.def.atk ?? 0, lv: c.def.lv ?? 0, name: c.def.name };
  d.log(`${d.name(p)} tributes ${c.def.name}.`);
  await d.move(c, 'gy', { why: 'tribute' });
}, 0, (d, p, card) => d.monsters(p).some((m) => m !== card && d.tributeOk(m)));
/** Move a card into another player's hand (Exchange, Graverobber); it returns to its owner's piles later. */
export async function giveToHand(d: Duel, c: Card, to: Side) {
  const from = c.zone;
  const pile = from === 'hand' ? d.players[c.owner].hand : from === 'gy' ? d.players[c.owner].gy : null;
  if (!pile || !pile.includes(c)) return;
  pile.splice(pile.indexOf(c), 1);
  c.mark.origOwner ??= c.owner;
  c.owner = to;
  c.ctrl = to;
  c.zone = 'hand';
  c.faceUp = false;
  c.mv++;
  d.players[to].hand.push(c);
  await d.emit({ t: 'move', card: c, from, to: 'hand' });
}
/** Select from cards the chooser may look at (an opponent's hand, a Deck...). */
export async function pickSeen(d: Duel, p: Side, text: string, cards: Card[], purpose: 'good' | 'bad' | 'cost' = 'good') {
  if (!cards.length) return undefined;
  return (await d.select(p, text, cards, 1, 1, purpose, undefined, undefined, true))[0];
}
/** Rough value of stopping the current attack (mirrors ai.ts threat()). */
export function threat(d: Duel, me: Side, ev: Ev): number {
  if (ev.e !== 'attack' || ev.player === me) return -1;
  const a = d.atk(ev.attacker), t = ev.target;
  if (!t) return a;
  if (t.pos === 'atk') { const ta = d.atk(t); return a > ta ? (t.def.atk ?? 0) + (a - ta) : -1; }
  const df = t.faceUp ? d.defv(t) : t.def.def ?? 0;
  return a > df ? (t.def.atk ?? 0) : -1;
}
/** Value of the best monster this player could revive. */
export const bestRevive = (d: Duel, me: Side) => Math.max(-1, ...d.players[me].gy.filter((c) => d.revivable(c)).map((c) => (c.def.atk ?? 0) * 0.8));

// ---- effects
export const act = (e: Omit<Effect, 'type'>): Effect => ({ type: 'activate', ...e });
export const spell = (ops: Op | Op[], extra: Partial<Effect> = {}): Def => ({ effects: [act({ ops: arr(ops), ...extra })] });
/** Continuous / field card whose activation only places it; the card then works through hooks. */
export const passive = (extra: Def, activation: Partial<Effect> = {}): Def => ({ ...extra, effects: [act({ ops: [], ...activation }), ...(extra.effects ?? [])] });
export const flip = (ops: Op | Op[], extra: Partial<Effect> = {}): Effect => ({ type: 'flip', ops: arr(ops), ...extra });
export const trig = (on: On | On[], ops: Op | Op[], extra: Partial<Effect> = {}): Effect => ({ type: 'trigger', on: arr(on), ops: arr(ops), ...extra });
export const ign = (ops: Op | Op[], extra: Partial<Effect> = {}): Effect => ({ type: 'ignition', ops: arr(ops), ...extra });
export const quick = (ops: Op | Op[], extra: Partial<Effect> = {}): Effect => ({ type: 'quick', ops: arr(ops), ...extra });

// ---- predicates
export const isAttackOn = (ev: Ev, p: Side): ev is Extract<Ev, { e: 'attack' }> => ev.e === 'attack' && ev.player !== p;
export const linkOf = (ev: Ev) => (ev.e === 'chain' ? ev.link : null);
export const oppLink = (ev: Ev, p: Side) => (ev.e === 'chain' && ev.link.p !== p ? ev.link : null);
export const oppActivates = (name: string) => (d: Duel, ev: Ev, p: Side) => { const l = oppLink(ev, p); return !!l && l.isCard && l.card.def.name === name; };
export const faceUpNamed = (d: Duel, name: string, s?: Side) => d.monsters(0).concat(d.monsters(1)).filter((c) => c.faceUp && d.nameOf(c) === name && (s === undefined || c.ctrl === s));
export const countFU = (d: Duel, pred: (c: Card) => boolean, s?: Side) =>
  (s === undefined ? [...d.monsters(0), ...d.monsters(1)] : d.monsters(s)).filter((c) => c.faceUp && pred(c)).length;
export const isToon = (c: Card) => / Toon |^Toon |Manga Ryu-Ran/.test(c.def.name) && c.def.kind === 'monster';
export const inBattle = (d: Duel, c: Card) => !!d.battle && (d.battle.att === c || d.battle.tgt === c);
export const battleFoe = (d: Duel, c: Card) => (!d.battle ? null : d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null);
export const umi = (d: Duel) => d.active('Umi');
export const valid = (c: Card, mv: number) => c.mv === mv;

/** Pick one card (or none) and return it. */
export async function pick(d: Duel, p: Side, text: string, cards: Card[], purpose: 'good' | 'bad' | 'cost' = 'good', optional = false): Promise<Card | undefined> {
  if (!cards.length) return undefined;
  const r = await d.select(p, text, cards, optional ? 0 : 1, 1, purpose);
  return r[0];
}
export const randomOf = <T>(d: Duel, xs: T[]): T | undefined => (xs.length ? xs[Math.floor(d.rng() * xs.length)] : undefined);

/** "Any monster that destroys this card in battle loses 500 ATK and DEF." */
export const curse: Effect = trig('battleDestroyed', { op: 'stat', s: { t: 'other' }, atk: -500, def: -500, perm: true });

/** Static ATK swing for an Attribute pair (Hoshiningen family). */
export const attrSwing = (up: Attr, down: Attr): Def => ({ aura: [{ f: { ...M, attr: up }, atk: 500 }, { f: { ...M, attr: down }, atk: -400 }] });
export const typeEquip = (races: Race[], atk: number, def: number): Def => ({ equip: { f: { ...FU, race: races }, atk, def } });

/** Standby heal for monsters like Spirit of the Breeze. */
export const standbyHeal = (n: number, cond: (d: Duel, c: Card) => boolean = () => true): Effect =>
  trig('standby', run(({ d, p }) => d.heal(p, n)), { cond: (d, c) => d.onField(c) && c.faceUp && cond(d, c) });

/** "Pay N LP / Tribute N" style ignition with a simple payoff. */
export const ignition = (label: string, ops: Op | Op[], extra: Partial<Effect> = {}) => ign(ops, { label, ...extra });

/** Searchers that trigger when Normal or Flip Summoned. */
export const onSummonSearch = (f: Filter): Effect => trig(['normalSummoned', 'flipSummoned'], search(f), { optional: true });

/** Destroy face-up monsters of a Type (Eternal Draught family). */
export const typeWipe = (race: Race): Def => spell(destroyAll({ ...FU, race: [race] }), { ai: (d, me) => scoreWipe(d, me, (c) => d.raceOf(c) === race) });
export function scoreWipe(d: Duel, me: Side, pred: (c: Card) => boolean) {
  let s = 0;
  for (const side of [0, 1] as Side[]) for (const c of d.monsters(side)) if (c.faceUp && pred(c)) s += (side === me ? -1 : 1) * ((c.def.atk ?? 0) + 300);
  return s;
}

/** Special Summon from hand by banishing monsters of an Attribute/Type from your Graveyard. */
export const banishProc = (n: number, f: Filter): Def => ({
  noNormal: true,
  ssProc: { cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), ...f }, n } }], req: [{ f: { ...GY_M('self'), ...f }, n }] },
});

/** Tribute specific face-up/hand monsters (Gate Guardian, Valkyrion). */
export function tributeNamed(names: string[], zones: ('hand' | 'mzone')[]): Op {
  const cands = (d: Duel, p: Side, name: string, card: Card) => d.find({ side: 'self', zone: zones, name, fn: (dd, c) => c !== card && (c.zone !== 'mzone' || dd.tributeOk(c)) }, p);
  return run(async ({ d, p, card }) => {
    const used: Card[] = [];
    for (const name of names) {
      const c = await pick(d, p, `Tribute "${name}"`, cands(d, p, name, card).filter((x) => !used.includes(x)), 'cost');
      if (c) used.push(c);
    }
    for (const c of used) { d.log(`${d.name(p)} tributes ${c.def.name}.`); await d.move(c, 'gy', { why: 'tribute' }); }
  }, 0, (d, p, card) => names.every((n) => cands(d, p, n, card).length > 0) && (d.freeSlot(p, 'm') >= 0 || zones.includes('mzone')));
}

/** "This card cannot attack unless you Tribute 1 monster" (Panther Warrior, Insect Queen). */
export const tributeToAttack: Op[] = [{ op: 'tribute', s: { t: 'choose', f: { side: 'self', zone: 'mzone', notThis: true } } }];

/** Lock that applies while the source is face-up: forbid attacks of matching monsters. */
export const noAttackLock = (pred: (d: Duel, src: Card, a: Card) => boolean): Lock => ({ attack: (d, src, a) => !!src && pred(d, src, a) });

/** Equip that only allows monsters matching `f`. */
export const equipTo = (f: Filter, spec: Omit<NonNullable<CardDef['equip']>, 'f'> = {}): Def => ({ equip: { f, ...spec } });

/** Toon monster template (Toon World needed, no attack the turn summoned, 500 LP per attack, dies with Toon World). */
export function toon(): Def {
  const hasWorld = (d: Duel, s: Side) => d.active('Toon World', s);
  const oppToons = (d: Duel, c: Card) => d.monsters(opp(c.ctrl)).filter((m) => m.faceUp && isToon(m));
  return {
    summonCond: (d, p) => hasWorld(d, p),
    attackCond: (d, c) => c.data.sumTurn !== d.turn && c.summonedTurn !== d.turn,
    attackCost: [{ op: 'payLP', n: 500 }],
    ruleIf: { direct: (d, c) => oppToons(d, c).length === 0 },
    lock: { target: (d, src, a, t) => a === src && oppToons(d, a).length > 0 && !(t && isToon(t)) },
    selfDestructIf: (d, c) => !hasWorld(d, c.ctrl),
  };
}

/** Ritual Spell for `name`. */
export const ritual = (name: string): Def => spell({ op: 'ritual', name }, { ai: 1500 });

/** Turn-limited rule change. */
export const temp = (d: Duel, t: Parameters<Duel['addTemp']>[0]) => d.addTemp(t);

/** Ask yes/no; the CPU says yes. */
export const yes = (d: Duel, p: Side, text: string, card?: Card) => d.confirm(p, text, card);

/** Reveal-then-maybe-destroy used by Reaper of the Cards / Trap Master / Armed Ninja / De-Spell. */
export function probe(kind: 'spell' | 'trap'): Op {
  return run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || !d.onField(c)) return;
    if (!c.faceUp) { d.log(`The face-down card is ${c.def.name}.`); await d.reveal(p, [c], 'The targeted card'); }
    if (c.def.kind === kind) await d.destroy(c, 'effect', undefined, p);
    else d.log(`${c.def.name} is returned to its position.`);
  }, 400);
}
export const probeTarget = (kind: 'spell' | 'trap'): Filter => ({ side: 'any', zone: ['szone', 'fzone'], notThis: true, fn: (_d, c) => !c.faceUp || c.def.kind === kind });

/** Option prompt over all monster Types / Attributes. */
export const RACES: Race[] = ['Dragon', 'Spellcaster', 'Warrior', 'Beast', 'Beast-Warrior', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock', 'Winged Beast', 'Insect', 'Plant', 'Fairy', 'Thunder', 'Dinosaur', 'Reptile', 'Sea Serpent', 'Fish'];
export const ATTRS: Attr[] = ['DARK', 'LIGHT', 'EARTH', 'WATER', 'FIRE', 'WIND'];
/** Index of the value most common among `cards` (CPU default for declarations). */
export function mostCommon<T>(values: T[], cards: Card[], of: (c: Card) => T | undefined): number {
  const n = values.map((v) => cards.filter((c) => of(c) === v).length);
  return n.indexOf(Math.max(...n));
}

// ---- mechanics added for the YGO Online card pool
/** Merge card definitions; effects arrays are concatenated. */
export function merge(...defs: Def[]): Def {
  const out: Def = {};
  for (const x of defs) { const effects = [...(out.effects ?? []), ...(x.effects ?? [])]; Object.assign(out, x); if (effects.length) out.effects = effects; }
  return out;
}
/** Archetype filter: "a monster whose name includes …". */
export const SET = (set: string | string[], f: Filter = {}): Filter => ({ ...f, set });

/** Counters (Spell Counters, A-Counters...) live in card.data and vanish when the card leaves the field. */
export const ctr = (c: Card, kind = 'spell'): number => c.data.ctr?.[kind] ?? 0;
export function addCtr(d: Duel, c: Card, n = 1, kind = 'spell', max = Infinity) {
  if (!d.onField(c) || !c.faceUp || n <= 0) return 0;
  c.data.ctr ??= {};
  const before = c.data.ctr[kind] ?? 0;
  c.data.ctr[kind] = Math.max(before, Math.min(max, before + n));
  const added = c.data.ctr[kind] - before;
  if (added > 0) d.log(`${added} ${kind === 'spell' ? 'Spell' : kind} Counter${added > 1 ? 's' : ''} placed on ${c.def.name} (${c.data.ctr[kind]}).`);
  return added;
}
export function removeCtr(d: Duel, c: Card, n: number, kind = 'spell') {
  const have = ctr(c, kind);
  const k = Math.max(0, Math.min(n, have));
  if (k > 0) { c.data.ctr[kind] = have - k; d.log(`${k} ${kind === 'spell' ? 'Spell' : kind} Counter${k > 1 ? 's' : ''} removed from ${c.def.name}.`); }
  return k;
}
/** "Each time a Spell Card is activated, place 1 Spell Counter on this card." */
export const spellCounterGain = (max = Infinity, onlyOwn = false): Def => ({
  onResolve: (d, src, link) => { if (link.isCard && link.card.def.kind === 'spell' && (!onlyOwn || link.p === src.ctrl)) addCtr(d, src, 1, 'spell', max); },
});
/** Cost op: remove n counters from this card. */
export const payCtr = (n: number, kind = 'spell'): Op => run(({ d, card }) => { removeCtr(d, card, n, kind); }, 0, (_d, _p, card) => ctr(card, kind) >= n);

/** Union monster: once per turn equip to a matching monster you control, or unequip and Special Summon in Attack Position. */
export function union(target: Filter, atk = 0, def = 0, extra: Partial<NonNullable<CardDef['equip']>> = {}): Def {
  const spec = { f: { ...OWN_FU, ...target }, atk, def, sub: true, own: true, ...extra };
  const turnFree = (d: Duel, c: Card) => c.mark.unionTurn !== d.turn;
  const hasUnion = (d: Duel, m: Card) => d.equipsOf(m).some((e) => e.def.ability === 'union');
  return {
    effects: [
      ign(run(async ({ d, p, card, t }) => {
        card.mark.unionTurn = d.turn;
        const m = t[0];
        if (m && m.zone === 'mzone' && m.faceUp && m.ctrl === p && card.zone === 'mzone') await d.equipCard(card, m, spec, p);
      }, 200), { label: 'Equip as a Union', targets: [{ f: { ...spec.f, notThis: true, fn: (d, m, p, src) => (!spec.f.fn || spec.f.fn(d, m, p, src)) && !hasUnion(d, m) }, good: true }], cond: (d, c) => turnFree(d, c) }),
      ign(run(async ({ d, p, card }) => {
        card.mark.unionTurn = d.turn;
        if (card.zone !== 'szone' || card.equipTo === undefined) return;
        card.equipTo = undefined;
        card.eq = undefined;
        await d.specialSummon(card, p, 'atk', 'special', false, card);
      }, 100), { label: 'Unequip and Special Summon', from: ['szone'], cond: (d, c) => turnFree(d, c) && c.equipTo !== undefined && d.freeSlot(c.ctrl, 'm') >= 0 }),
    ],
  };
}

/** Spirit monster: cannot be Special Summoned; returns to the hand in the End Phase of the turn it was Summoned or flipped. */
export const spirit = (...effects: Effect[]): Def => ({
  noSpecial: true,
  effects: [
    trig('endPhase', { op: 'toHand', s: { t: 'this' } }, { cond: (d, c) => c.zone === 'mzone' && !d.active('Spiritual Energy Settle Machine') && ((c.data.sumTurn === d.turn && (c.data.how === 'normal' || c.data.how === 'flip')) || c.data.flipTurn === d.turn) }),
    ...effects,
  ],
});

/** Gemini monster whose effects only work after it is Normal Summoned again (the engine treats it as negated until then). */
export const gemini = (x: Def): Def => x;

/** Special Summon a Token with given stats. */
export const tokenDef = (name: string, race: Race, attr: Attr, lv: number, atk: number, def: number, extra: Partial<CardDef> = {}): CardDef =>
  ({ id: `token_${name.replace(/\W+/g, '_')}`, name, kind: 'monster', art: '', text: '', mtype: 'normal', race, attr, lv, atk, def, token: true, ...extra });
export async function tokens(d: Duel, p: Side, t: string | CardDef, n: number, pos: 'atk' | 'def' = 'def') {
  const out: Card[] = [];
  for (let i = 0; i < n && d.canSpecial(p); i++) { const c = await d.summonToken(p, t, pos); if (c) out.push(c); }
  return out;
}
