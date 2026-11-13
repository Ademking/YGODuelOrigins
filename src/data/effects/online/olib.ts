// Shared helpers for the YGO Online card pool (cards not in the Joey the Passion catalog).
import type { CardDef } from '../../../engine/types';
import {
  type Card, type Def, type Duel, type Effect, type Filter, type Op, type Side, type Race, type Attr,
  ATTRS, FU, OPP_FU, RACES, act, addCtr, ctr, mostCommon, opp, pick, run, trig,
} from '../lib';

export * from '../lib';

export const named = (name: string): Filter => ({ name });
/** Face-up card(s) with this name (or alias) controlled by s. */
export const has = (d: Duel, s: Side, name: string) => d.fieldCards(s).some((c) => c.faceUp && d.nameOf(c) === name && !d.negated(c));
export const hasSet = (d: Duel, s: Side, set: string, zone: 'mzone' | 'any' = 'mzone') =>
  (zone === 'mzone' ? d.monsters(s) : d.fieldCards(s)).some((c) => c.faceUp && (c.def.name.includes(set) || !!c.def.alias?.includes(set)));
export const inSet = (c: Card, set: string | string[]) => (Array.isArray(set) ? set : [set]).some((s) => c.def.name.includes(s) || !!c.def.alias?.includes(s));

/** A spell that only works while a condition holds when activated. */
export const condSpell = (cond: (d: Duel, p: Side, c: Card) => boolean, ops: Op | Op[], extra: Partial<Effect> = {}): Def =>
  ({ effects: [act({ ops: Array.isArray(ops) ? ops : [ops], cond: (d, c, p) => cond(d, p, c), ...extra })] });

/** Choose a card from candidates and Special Summon it. */
export async function ssPick(d: Duel, p: Side, cands: Card[], text = 'Special Summon a monster', pos?: 'atk' | 'def', ignoreCond = false, by?: Card) {
  const list = cands.filter((c) => c.def.kind === 'monster' && (ignoreCond || d.revivable(c) || c.zone === 'hand' || c.zone === 'deck') && d.canSpecial(p, c));
  const c = await pick(d, p, text, list, 'good');
  if (!c) return undefined;
  const fromDeck = c.zone === 'deck';
  if (ignoreCond) c.properly = true;
  const ok = await d.specialSummon(c, p, pos ?? (await d.askPos(p, c)), 'special', false, by);
  if (fromDeck) d.shuffle(p);
  return ok ? c : undefined;
}
/** Special Summon op from zones by filter (the summoned monster's own Summon conditions are respected unless `ignore`). */
export const ssFrom = (zones: ('hand' | 'deck' | 'gy' | 'banished')[], f: Filter = {}, opts: { pos?: 'atk' | 'def'; ignore?: boolean; side?: 'self' | 'opp' | 'any'; n?: number } = {}): Op =>
  run(async ({ d, p, card }) => {
    for (let i = 0; i < (opts.n ?? 1); i++) {
      const cands = d.find({ side: opts.side ?? 'self', zone: zones, kind: 'monster', ...f }, p, card).filter((c) => opts.ignore || c.zone !== 'gy' && c.zone !== 'banished' ? !c.def.noSpecial : d.revivable(c));
      if (!(await ssPick(d, p, cands, `${card.def.name}: Special Summon a monster`, opts.pos, opts.ignore, card))) break;
    }
  }, (d, me) => 600, (d, p, card) => d.canSpecial(p) && d.find({ side: opts.side ?? 'self', zone: zones, kind: 'monster', ...f }, p, card).some((c) => !c.def.noSpecial && (c.zone === 'hand' || c.zone === 'deck' || opts.ignore || d.revivable(c))));
/** Add a card from these zones to the hand. */
export const addFrom = (zones: ('deck' | 'gy' | 'banished')[], f: Filter = {}, n = 1): Op =>
  run(async ({ d, p, card }) => {
    const cs = d.find({ side: 'self', zone: zones, ...f }, p, card);
    const chosen = await d.select(p, `${card.def.name}: add to your hand`, cs, Math.min(n, cs.length), Math.min(n, cs.length), 'good');
    let shuffle = false;
    for (const c of chosen) { if (c.zone === 'deck') shuffle = true; await d.toHand(c); }
    if (shuffle) await d.shuffleDeck(p);
  }, 500, (d, p, card) => d.find({ side: 'self', zone: zones, ...f }, p, card).length > 0);

/** Declare a monster Type (CPU: the most common one among `pool`). */
export async function declareRace(d: Duel, p: Side, text: string, pool: Card[] = []): Promise<Race> {
  return RACES[await d.option(p, text, RACES, mostCommon(RACES, pool, (c) => c.def.race))];
}
export async function declareAttr(d: Duel, p: Side, text: string, pool: Card[] = []): Promise<Attr> {
  return ATTRS[await d.option(p, text, ATTRS, mostCommon(ATTRS, pool, (c) => c.def.attr))];
}
/** Declare a card name from the cards in this duel (both Decks). */
export async function declareName(d: Duel, p: Side, text: string, prefer: Card[] = [], f: (c: Card) => boolean = () => true): Promise<string> {
  const names = [...new Set(d.allCards().filter((c) => !c.token && f(c)).map((c) => c.def.name))].sort();
  const fav = prefer.find((c) => names.includes(c.def.name))?.def.name;
  return names[await d.option(p, text, names, fav ? names.indexOf(fav) : 0)] ?? '';
}

// ---- A-Counters ("Alien" monsters)
/** Put n A-Counters, one at a time, on face-up monsters the chooser selects. */
export async function placeA(d: Duel, p: Side, n: number, f: Filter = OPP_FU) {
  for (let i = 0; i < n; i++) {
    const c = await pick(d, p, 'Place an A-Counter', d.find(f, p), 'bad');
    if (!c) return;
    addCtr(d, c, 1, 'A');
  }
}
/** Remove A-Counters (each removal feeds "A" Cell Incubator). */
export function removeA(d: Duel, c: Card, n: number) {
  const k = Math.min(n, ctr(c, 'A'));
  if (!k) return 0;
  c.data.ctr.A -= k;
  d.log(`${k} A-Counter${k > 1 ? 's' : ''} removed from ${c.def.name}.`);
  for (const inc of d.faceUpField()) if (inc.def.name === '"A" Cell Incubator' && !d.negated(inc)) addCtr(d, inc, k, 'A');
  return k;
}
export const isAlien = (c: Card) => c.def.name.includes('Alien');

// ---- monsters placed in the Spell & Trap Zone as Continuous Spells (Crystal Beasts)
export async function placeAsSpell(d: Duel, c: Card, s: Side = c.owner) {
  if (d.freeSlot(s, 's') < 0) return false;
  const from = c.zone;
  if (!d.placeST(c, s, true)) return false;
  c.data.asSpell = true;
  d.log(`${c.def.name} is placed in the Spell & Trap Zone as a Continuous Spell.`);
  await d.emit({ t: 'move', card: c, from, to: 'szone' });
  if (c.def.name.includes('Crystal Beast')) for (const t of d.faceUpField()) if (t.def.name === 'Crystal Tree' && !d.negated(t)) addCtr(d, t, 1, 'crystal');
  return true;
}
export const crystalInST = (d: Duel, s: Side) => d.players[s].s.filter((c): c is Card => !!c && c.faceUp && c.def.name.includes('Crystal Beast')).length;
/** "If this card is destroyed while in a Monster Zone, you can place it face-up in your Spell & Trap Zone as a Continuous Spell instead." */
export const crystalBeast = (): Def => ({
  effects: [trig('destroyed', run(async ({ d, card }) => { if (card.zone === 'gy') await placeAsSpell(d, card); }, 300), {
    optional: true, from: ['gy'], cond: (d, c) => c.zone === 'gy' && c.mark.destroyedTurn === d.turn && d.freeSlot(c.owner, 's') >= 0,
  })],
});

/** The Neo-Spacian each Chrysalis becomes. */
export const CHRYSALIS: Record<string, string> = {
  'Chrysalis Chicky': 'Neo-Spacian Air Hummingbird', 'Chrysalis Dolphin': 'Neo-Spacian Aqua Dolphin', 'Chrysalis Larva': 'Neo-Spacian Flare Scarab',
  'Chrysalis Mole': 'Neo-Spacian Grand Mole', 'Chrysalis Pantail': 'Neo-Spacian Dark Panther', 'Chrysalis Pinny': 'Neo-Spacian Glow Moss',
};

/** "When this card leaves the field, destroy the monster it was equipped to." */
export const killEquippedOnLeave: Effect = trig('leftField', run(async ({ d, card }) => {
  const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined;
  if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner);
}));
/** Destroy (or another fate) a monster at this turn's End Phase if it is still the same card. */
export function atEndPhase(d: Duel, c: Card, fn: (c: Card) => Promise<unknown> | unknown) {
  const mv = c.mv;
  d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (c.mv === mv && d.onField(c)) await fn(c); } });
}
export const destroyAtEnd = (d: Duel, c: Card, by?: Side) => atEndPhase(d, c, (x) => d.destroy(x, 'effect', undefined, by));

/** Turn-limited rule on one monster ('direct', 'pierce', ...). */
export function grantRule(d: Duel, c: Card, r: string) { c.data.tempRules = { ...(c.data.tempRules ?? {}), [r]: d.turn }; }

/** Count cards. */
export const count = (d: Duel, f: Filter, p: Side) => d.find(f, p).length;
export const both = (d: Duel) => [...d.monsters(0), ...d.monsters(1)];
export const faceUpMonsters = (d: Duel) => both(d).filter((c) => c.faceUp);
export const gyOf = (d: Duel, s: Side) => d.players[s].gy;
export const bestBy = (cs: Card[], f: (c: Card) => number) => cs.reduce<Card | undefined>((b, c) => (!b || f(c) > f(b) ? c : b), undefined);

export type { CardDef };
export { opp, FU };

/** Resolve the first effect of `spellCard` as if player p had activated it (Double Spell, Spell Reproduction-style copies). */
export async function castCopy(d: Duel, p: Side, spellCard: Card, src: Card) {
  const eff = spellCard.def.effects?.find((e) => e.type === 'activate');
  if (!eff) return;
  const link = { ...d.pseudoLink(spellCard, p), eff, isCard: false, data: {} as Record<string, unknown> };
  for (let i = 0; i < (eff.targets?.length ?? 0); i++) {
    const t = eff.targets![i];
    const cands = d.targetCands(eff, i, p, spellCard).filter((c) => !link.targets.flat().includes(c));
    const picked = await d.select(p, `Select a target for ${spellCard.def.name}`, cands, Math.min(t.min ?? t.n ?? 1, cands.length), t.n ?? 1, d.targetPurpose(eff, i, spellCard.def), undefined, 'target');
    link.targets.push(picked);
    link.tmv.push(picked.map((c) => c.mv));
  }
  d.log(`${src.def.name} uses the effect of ${spellCard.def.name}.`);
  for (const op of eff.cost ?? []) await d.runOp(op, link, true);
  for (const op of eff.ops) { await d.runOp(op, link, false); await d.cleanup(); }
}
/** Fusion Summon helper usable inside scripts. */
export const fuse = (d: Duel, p: Side, src: Card, o: import('../../../engine/duel').FusionOpts) => d.doFusion(p, src, false, o);
export const canFuse = (d: Duel, p: Side, src: Card, o: import('../../../engine/duel').FusionOpts) => d.fusionOptions(p, src, o).length > 0;

/** Special Summon a Trap Card as a monster (it keeps being a Trap Card; its printed definition returns when it leaves the Monster Zone). */
export async function trapMonster(d: Duel, card: Card, p: Side, stats: Partial<CardDef> & { race: Race; attr: Attr; lv: number; atk: number; def: number }, pos?: 'atk' | 'def') {
  if (!d.canSpecial(p)) return false;
  const orig = card.def;
  card.mark.trapDef = orig;
  card.def = { ...orig, kind: 'monster', mtype: 'effect', stype: undefined, effects: [], ...stats };
  const ok = await d.specialSummon(card, p, pos ?? (await d.askPos(p, card)), 'special', false, card);
  if (!ok) { card.def = orig; delete card.mark.trapDef; }
  return ok;
}
/** Return a Trap monster to its Spell & Trap Zone face-down. */
export async function setTrapBack(d: Duel, card: Card) {
  if (card.zone !== 'mzone' || !card.mark.trapDef) return;
  card.def = card.mark.trapDef;
  delete card.mark.trapDef;
  if (d.placeST(card, card.ctrl, false)) { card.turnIn = d.turn - 1; d.log(`${card.def.name} is Set in the Spell & Trap Zone.`); await d.emit({ t: 'set', card }); }
}
/** "This card becomes an Equip Card" traps. */
export async function trapEquip(d: Duel, card: Card, target: Card | undefined, spec: import('../../../engine/types').EquipSpec) {
  if (!target || target.zone !== 'mzone' || !target.faceUp || !d.onField(card)) return false;
  return d.equipCard(card, target, spec, card.ctrl);
}
/** The attack event of a link opened by an attack declaration. */
export const attackOf = (ev: import('../../../engine/duel').Ev) => (ev.e === 'attack' ? ev : null);
export const chainNum = (d: Duel, card: Card) => d.chain.find((l) => l.card === card)?.num ?? 1;

/** Continuous Trap/Spell that Special Summons a monster and is tied to it (Birthright, Escape from the Dark Dimension...). */
export function boundRevive(f: import('../../../engine/types').Filter, opts: { pos?: 'atk' | 'def'; banishOnLeave?: boolean; negate?: boolean; cost?: Op[] } = {}): Def {
  return {
    effects: [
      act({
        targets: [{ f, good: true }], cost: opts.cost,
        ops: [run(async ({ d, p, card, t }) => {
          const m = t[0];
          if (!m || !d.canSpecial(p, m)) return;
          m.properly = true;
          if (!(await d.specialSummon(m, p, opts.pos ?? (await d.askPos(p, m)), 'special', false, card))) return;
          card.data.sel = m.uid; card.data.selMv = m.mv;
          if (opts.negate) { const mv = m.mv; d.addTemp({ until: 1e9, negate: (_d, x) => x === m && x.mv === mv }); }
        }, 900)],
      }),
      trig('leftField', run(async ({ d, card }) => {
        const m = card.last.sel !== undefined ? d.byUid(card.last.sel) : undefined;
        if (!m || m.zone !== 'mzone' || m.mv !== card.last.selMv) return;
        if (await d.destroy(m, 'effect', undefined, card.owner) && opts.banishOnLeave && (m.zone as string) === 'gy') await d.banish(m, card.owner);
      })),
    ],
    selfDestructIf: (d, c) => c.data.sel !== undefined && !d.monsters(c.ctrl).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  };
}

// ---- monster helpers
/** "If this card attacks, your opponent cannot activate Spell or Trap Cards until the end of the Damage Step." */
export const noSTOnAttack = (pred: (d: Duel, c: Card) => boolean = () => true): import('../../../engine/types').Lock => ({
  activate: (d, src, p, c) => !!src && d.curAttack?.attacker === src && p !== src.ctrl && c.def.kind !== 'monster' && pred(d, src),
});
/** Arcana Force: toss a coin when Summoned; `heads(c)` / `tails(c)` tell which result applies (Light Barrier lets the controller choose). */
export const arcanaFlip: Effect = trig('summoned', run(async ({ d, p, card }) => {
  const barrier = d.active('Light Barrier', p);
  const heads = barrier ? (await d.option(p, `${card.def.name}: choose the effect`, ['Heads', 'Tails'])) === 0 : (await d.tossCoins(1))[0];
  card.data.arcana = heads ? 'heads' : 'tails';
  d.log(`${card.def.name}: ${heads ? 'Heads' : 'Tails'}.`);
}));
export const heads = (c: Card) => c.data.arcana === 'heads';
export const tails = (c: Card) => c.data.arcana === 'tails';
/** LV monsters: send this face-up card to the Graveyard to Special Summon the next LV from hand or Deck, ignoring conditions. */
export function lvUp(next: string, when: 'standby' | 'endBattle', cond: (d: Duel, c: Card) => boolean = () => true): Effect {
  const go = run(async ({ d, p, card }) => {
    if (card.zone !== 'mzone') return;
    await d.move(card, 'gy', { why: 'cost' });
    await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: next }, p), `Special Summon ${next}`, undefined, true, card);
  }, 1200);
  const has = (d: Duel, c: Card) => d.find({ side: 'self', zone: ['hand', 'deck'], name: next }, c.ctrl).length > 0;
  return when === 'standby'
    ? trig('standby', go, { optional: true, cond: (d, c) => c.zone === 'mzone' && c.faceUp && has(d, c) && cond(d, c) })
    : trig('endPhase', go, { optional: true, cond: (d, c) => c.zone === 'mzone' && c.faceUp && c.data.killTurn === d.turn && has(d, c) && cond(d, c) });
}
/** Marks the turn this card destroyed a monster by battle (for "during the End Phase of a turn this card destroyed a monster"). */
export const markKill: Partial<CardDef> = { postBattle: (d, self, _o, r) => { if ((r.att === self && r.killedT) || (r.tgt === self && r.killedA)) self.data.killTurn = d.turn; } };
/** Names of the monsters Tributed to Tribute Summon this card (when it is the current Summon). */
export const tributed = (c: Card) => (c.data.how === 'normal' && c.mark.tribTurn === c.data.sumTurn ? (c.mark.tribs as string[]) ?? [] : []);
/** Did this card destroy the other monster by battle in r? */
export const won = (self: Card, r: import('../../../engine/types').BattleInfo) => (r.att === self && r.killedT) || (r.tgt === self && r.killedA);
/** Contact Fusion: Special Summon from the Fusion Deck by returning the listed materials you control to the Deck (or banishing them). */
export function contact(names: string[], dest: 'deck' | 'banished' = 'deck', zones: ('mzone' | 'hand' | 'gy')[] = ['mzone']): Partial<CardDef> {
  const find = (d: Duel, p: Side, n: string) => d.find({ side: 'self', zone: zones, fn: (engine, c) => engine.nameOf(c) === n }, p);
  return {
    noNormal: true,
    noFusionSpell: true,
    ssProc: {
      from: ['extra'],
      cond: (d, p) => names.every((n) => find(d, p, n).length > 0),
      cost: [run(async ({ d, p }) => {
        const materials: Card[] = [];
        for (const n of names) {
          const candidates = find(d, p, n).filter((c) => !materials.includes(c));
          const c = await pick(d, p, `Select "${n}"`, candidates, 'cost');
          if (c) materials.push(c);
        }
        const hidden = materials.filter((c) => c.zone === 'hand' || !c.faceUp);
        await d.reveal(p, hidden, 'Contact Fusion materials');
        await d.reveal(opp(p), hidden, 'Contact Fusion materials');
        for (const c of materials) await d.move(c, dest, { why: 'fusion' });
        if (dest === 'deck') await d.shuffleDeck(p);
      })],
    },
  };
}
/** Neos Fusion: returns to the Fusion Deck in the End Phase (optional with Neo Space / Instant Neo Space). */
export const neosReturn: Effect = trig('endPhase', run(async ({ d, card }) => {
  if (card.zone !== 'mzone') return;
  if (d.active('Neo Space') && !(await d.confirm(card.ctrl, `Return ${card.def.name} to the Fusion Deck?`, card, false))) return;
  await d.move(card, 'extra');
}), { cond: (d, c) => c.zone === 'mzone' && !d.equipsOf(c).some((e) => e.def.name === 'Instant Neo Space') });
/** Monsters this card destroys by battle are banished. */
export const banishVictims: Partial<CardDef> = { postBattle: async (d, self, o, r) => { if (o && won(self, r) && o.zone === 'gy') await d.banish(o, self.ctrl); } };
/** Cloudian template: indestructible by battle, destroyed in face-up Defense Position, Fog Counters on Normal Summon. */
export const cloudian = (summonFog = true): Partial<CardDef> => ({
  rules: ['battleImmune'],
  selfDestructIf: (_d, c) => c.zone === 'mzone' && c.faceUp && c.pos === 'def',
  effects: summonFog ? [trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, [...d.monsters(0), ...d.monsters(1)].filter((c) => c.faceUp && c.def.name.includes('Cloudian')).length, 'fog'); }))] : [],
});
/** Cyberdark: equip a Dragon from your Graveyard on Summon, gain its ATK, it is destroyed instead in battle. */
export const cyberdark = (maxLv: number, on: import('../../../engine/types').On[]): Partial<CardDef> => ({
  battleSub: (d, c) => d.equipsOf(c).find((e) => e.uid === c.data.cdEq),
  statFn: (d, c) => { const e = d.equipsOf(c).find((x) => x.uid === c.data.cdEq); return e ? { atk: e.def.atk ?? 0 } : undefined; },
  effects: [trig(on, run(async ({ d, p, card }) => {
    const g = await pick(d, p, 'Equip a Dragon from your Graveyard', d.players[p].gy.filter((c) => c.def.kind === 'monster' && c.def.race === 'Dragon' && (c.def.lv ?? 0) <= maxLv), 'good');
    if (g && (await d.equipCard(g, card, {}, p))) card.data.cdEq = g.uid;
  }), { cond: (d, c) => d.players[c.ctrl].gy.some((x) => x.def.kind === 'monster' && x.def.race === 'Dragon' && (x.def.lv ?? 0) <= maxLv) })],
});
