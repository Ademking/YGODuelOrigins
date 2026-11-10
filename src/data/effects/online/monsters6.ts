// YGO Online monsters, part 6 (Field-Commander Rahz … Grave Squirmer).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, banishProc, both, destroyAll, flip, has, ign, merge, opp, pick, quick, randomOf, run, search, spirit, ssFrom,
  ssPick, tokenDef, tokens, trig, union, won, atEndPhase, isAttackOn,
} from './olib';

const GB = 'Gladiator Beast';
const byGB = (c: Card) => typeof c.data.ssBy === 'string' && c.data.ssBy.includes(GB);
/** Gladiator Beast tag-out: at the end of the Battle Phase, if it battled, return it to the Deck to Special Summon Gladiator Beasts. */
function tagOut(n = 1, toExtra = false, forced = false): Def {
  return {
    postBattle: (d, self) => {
      if (self.data.tagTurn === d.turn) return;
      self.data.tagTurn = d.turn;
      const p = self.ctrl, mv = self.mv, name = self.def.name;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
        if (self.mv !== mv || self.zone !== 'mzone') return;
        const pool = () => d.find(DECK({ kind: 'monster', set: GB, fn: (_d, c) => c.def.name !== name && !(name === 'Gladiator Beast Gaiodiaz' && c.def.name === 'Gladiator Beast Spartacus') && !(name === 'Gladiator Beast Gyzarus' && c.def.name === 'Gladiator Beast Bestiari') }), p);
        if (!pool().length) return;
        if (!forced && !(await d.confirm(p, `Return ${name} to the Deck to Special Summon a Gladiator Beast?`, self))) return;
        if (!forced || toExtra || n) await d.move(self, toExtra ? 'extra' : 'deck');
        for (let i = 0; i < n; i++) if (!(await ssPick(d, p, pool(), 'Special Summon a Gladiator Beast', undefined, false, self))) break;
        await d.shuffleDeck(p);
      } });
    },
  };
}
/** Gladiator Beast Fusion: return the listed material and other Gladiator Beasts you control to the Deck. */
const gbFusion = (main: string, others: number): Def => ({
  noNormal: true,
  ssProc: {
    from: ['extra'],
    cond: (d, p) => d.find({ ...OWN_FU, name: main }, p).length > 0 && d.find({ ...OWN_FU, set: GB }, p).filter((c) => c.def.name !== main).length >= others,
    cost: [run(async ({ d, p }) => {
      const m = await pick(d, p, `Select "${main}"`, d.find({ ...OWN_FU, name: main }, p), 'cost');
      if (!m) return;
      const rest = await d.select(p, `Select ${others} other Gladiator Beast(s)`, d.find({ ...OWN_FU, set: GB }, p).filter((c) => c !== m), others, others, 'cost');
      for (const c of [m, ...rest]) await d.move(c, 'deck', { why: 'fusion' });
      await d.shuffleDeck(p);
    })],
  },
});
const goblinDef = (d: Duel, self: Card, r: { att: Card }) => {
  if (r.att !== self) return;
  const mv = self.mv;
  d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
    if (self.mv !== mv || self.zone !== 'mzone') return;
    await d.changePos(self, 'def');
    const until = d.turn + 2;
    d.addTemp({ until, lock: { pos: (_d, _s, c) => c === self && c.mv === mv } });
  } });
};
const nextStandby = (d: Duel, p: Side, fn: () => Promise<unknown> | unknown) => d.schedule({ at: 'SP', side: p, fn });
const P = (d: Duel, s: Side) => d.players[s];

export const MONSTERS_6: Record<string, Def> = {
  'Field-Commander Rahz': {
    effects: [trig(['normalSummoned', 'specialSummoned'], run(async ({ d, p }) => {
      const c = await pick(d, p, 'Place a Warrior on top of your Deck', d.find(DECK({ kind: 'monster', race: ['Warrior'], maxLv: 4, fn: (_d, x) => x.def.name !== 'Field-Commander Rahz' }), p), 'good');
      if (!c) return;
      await d.shuffleDeck(p);
      const deck = P(d, p).deck; deck.splice(deck.indexOf(c), 1); deck.push(c);
    }))],
  },
  'Fiend Skull Dragon': {
    negateFn: (_d, _s, c) => c.zone === 'mzone' && !!c.def.effects?.some((e) => e.type === 'flip'),
    onTargeted: async (d, self, link) => { if (link.card.def.kind === 'trap') { link.negated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
  },
  'Fiendish Engine Ω': {
    effects: [
      trig('endPhase', run(({ d, p }) => tokens(d, p, tokenDef('Engine Token', 'Machine', 'EARTH', 1, 200, 200), 1, 'atk')), { cond: (d, c) => d.tp === c.ctrl }),
      ign(run(({ d, p, card }) => { d.addMod(card, 1000, 0); atEndPhase(d, card, (x) => d.destroy(x, 'effect', undefined, p)); }, -1), { opt: true, label: '+1000 ATK (destroyed at the End Phase)' }),
    ],
  },
  'Fire Trooper': { effects: [trig('summoned', [{ op: 'toGY', s: { t: 'this' } }, { op: 'damage', who: 'opp', n: 1000 }], { optional: true })] },
  'Firebird': { effects: [trig('anyToGY', { op: 'stat', s: { t: 'this' }, atk: 500, perm: true }, { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.from === 'mzone' && ev.ctrl === c.ctrl && ev.card !== c && ev.card.def.race === 'Winged Beast' && ev.card.mark.destroyedTurn === d.turn })] },
  'Firestorm Prominence': { effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of both(d).filter((x) => !x.faceUp || d.attrOf(x) !== 'FIRE')) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Flame Ogre': { noSpecial: true, effects: [trig('normalSummoned', { op: 'draw', who: 'self', n: 1 })] },
  'Flame Ruler': { doubleTribute: (_d, t) => t.def.attr === 'FIRE' },
  'Flint Lock': {
    lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'battle' && d.equipsOf(src).some((e) => e.def.name === 'Flint') },
    immune: (_d, _s, src) => src.def.name === 'Flint',
    effects: [ign(run(async ({ d, p, card }) => { const f = await pick(d, p, 'Equip a Flint to this card', [...d.spellTraps(0), ...d.spellTraps(1)].filter((c) => c.def.name === 'Flint' && c.faceUp), 'good'); if (f) await d.equipCard(f, card, undefined, f.ctrl); }, 400), {
      opt: true, label: 'Equip a Flint', cond: (d, c) => !d.equipsOf(c).some((e) => e.def.name === 'Flint') && [...d.spellTraps(0), ...d.spellTraps(1)].some((x) => x.def.name === 'Flint' && x.faceUp),
    }),
    ign(run(async ({ d, card, t }) => { const f = d.equipsOf(card).find((e) => e.def.name === 'Flint'); if (f && t[0]) await d.equipCard(f, t[0], undefined, f.ctrl); }, 400), { label: 'Move Flint to another monster', targets: [{ f: { ...OPP_FU } }], cond: (d, c) => d.equipsOf(c).some((e) => e.def.name === 'Flint') })],
  },
  'Flying Saucer Muusik\'i': {
    effects: [trig('anyDraw', run(async ({ d, p }) => {
      const drawn = P(d, p).hand[P(d, p).hand.length - 1];
      const a = await pick(d, p, 'Add an Alien card instead of drawing', d.find(DECK({ set: 'Alien' }), p), 'good');
      if (!a || !drawn) return;
      await d.move(drawn, 'deck');
      await d.toHand(a);
      await d.shuffleDeck(p);
    }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'draw' && ev.dp && ev.player === c.ctrl && d.phase === 'DP' && d.find(DECK({ set: 'Alien' }), c.ctrl).length > 0 })],
  },
  'Fog King': {
    altTributes: [0, 1],
    lock: { tribute: () => true },
    statFn: (d, c) => ({ atk: (c.data.how === 'normal' ? c.mark.fogAtk ?? 0 : 0) - d.base(c, 'atk') }),
    effects: [trig('normalSummoned', run(({ d, card }) => { card.mark.fogAtk = d.allCards().filter((x) => (card.mark.tribs ?? []).includes(x.def.name) && x.zone === 'gy' && x.mark.sentTurn === d.turn).reduce((s, x) => s + (x.def.atk ?? 0), 0); }))],
  },
  'Fossil Dyna Pachycephalo': {
    lock: { summon: (_d, _s, _p, _c, how) => how !== 'normal' && how !== 'flip' },
    effects: [flip(destroyAll({ ...M, fn: (_d, c) => !!c.data.how && c.data.how !== 'normal' && c.data.how !== 'flip' }))],
  },
  'Fossil Tusker': { effects: [trig('destroysByBattle', { op: 'damage', who: 'opp', n: 400 })] },
  'Fox Fire': {
    rules: ['noTribute'],
    effects: [trig('battleDestroyed', run(({ d, card }) => { const mv = card.mv; d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(card.owner, card)) await d.specialSummon(card, card.owner, await d.askPos(card.owner, card)); } }); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && !!c.mark.lastFaceUp })],
  },
  'Freed the Brave Wanderer': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Banish 2 LIGHT monsters: destroy a monster', cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'LIGHT' }, n: 2 } }], req: [{ f: { ...GY_M('self'), attr: 'LIGHT' }, n: 2 }], targets: [{ f: { ...FU, fn: (d, c, _p, src) => !!src && d.atk(c) > d.atk(src) } }] })] },
  'Freed the Matchless General': {
    onTargeted: async (d, self, link) => { if (link.card.def.kind === 'spell') { link.negated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
    effects: [trig('anyDraw', run(async ({ d, p }) => {
      const drawn = P(d, p).hand[P(d, p).hand.length - 1];
      const w = await pick(d, p, 'Add a Level 4 or lower Warrior instead of drawing', d.find(DECK({ kind: 'monster', race: ['Warrior'], maxLv: 4 }), p), 'good');
      if (!w || !drawn) return;
      await d.move(drawn, 'deck');
      await d.toHand(w);
      await d.shuffleDeck(p);
    }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'draw' && ev.dp && ev.player === c.ctrl && d.phase === 'DP' && d.find(DECK({ kind: 'monster', race: ['Warrior'], maxLv: 4 }), c.ctrl).length > 0 })],
  },
  'Freezing Beast': merge(union({ name: 'Burning Beast' }), {
    effects: [trig('anyBattleDamage', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy a face-down Spell or Trap Card', d.find({ ...ST, faceUp: false }, p), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), {
      cond: (d, c, _p, ev) => c.zone === 'szone' && ev?.e === 'damage' && ev.player !== c.ctrl && !!ev.src && d.equippedTo(c) === ev.src,
    })],
  }),
  'Freya, Spirit of Victory': {
    aura: [{ f: { side: 'self', zone: 'mzone', race: ['Fairy'] }, atk: 400, def: 400 }],
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, race: ['Fairy'], fn: (_d, c) => c.def.name !== 'Freya, Spirit of Victory' }, src.ctrl).length > 0 },
  },
  'Frontier Wiseman': { protect: (d, src, target, by) => by.def.kind === 'spell' && target.ctrl === src.ctrl && target.zone === 'mzone' && target.faceUp && d.raceOf(target) === 'Warrior' },
  'Frost and Flame Dragon': {
    noNormal: true,
    ssProc: {
      cond: (d, p) => d.find({ ...GY_M('self'), attr: 'FIRE' }, p).length > 0 && d.find({ ...GY_M('self'), attr: 'WATER' }, p).length >= 2,
      cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'FIRE' } } }, { op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'WATER' }, n: 2 } }],
    },
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Discard: destroy a monster', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: M }] })],
  },
  'Fushi No Tori': spirit(trig('battleDamage', run(({ d, p, link }) => { const ev = link.ev; if (ev.e === 'damage') return d.heal(p, ev.n); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })),
  'Fushioh Richie': {
    noNormal: true,
    ssProc: { from: ['hand', 'deck'], cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Great Dezard' } } }], req: [{ f: { ...OWN_FU, name: 'Great Dezard' } }] },
    onTargeted: async (d, self, link) => { if (link.isCard && link.card.def.kind !== 'monster') { link.negated = true; link.activationNegated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
    effects: [
      ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (d, c) => c.faceUp && (d.phase === 'M1' || d.phase === 'M2') }),
      flip(ssFrom(['gy'], { race: ['Zombie'] }), { optional: true }),
    ],
  },
  'Fusilier Dragon, the Dual-Mode Beast': {
    altTributes: [0],
    statFn: (d, c) => (c.mark.tribCount === 0 && c.data.how === 'normal' ? { atk: -Math.floor(d.base(c, 'atk') / 2), def: -Math.floor(d.base(c, 'def') / 2) } : undefined),
  },
  'Fusion Devourer': { auraFn: (d, src, c) => (d.battle && c.def.mtype === 'fusion' && ((d.battle.att === src && d.battle.tgt === c) || (d.battle.tgt === src && d.battle.att === c)) ? { atk: -d.base(c, 'atk') } : undefined) },
  'Future Samurai': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Banish a monster: destroy a face-up monster', cost: [{ op: 'banish', s: { t: 'choose', f: GY_M('self') } }], req: [{ f: GY_M('self') }], targets: [{ f: FU }] })] },
  'Gaap the Divine Soldier': {
    lock: { pos: () => true },
    onSummon: async (d, _s, c) => { if (c.zone === 'mzone' && (!c.faceUp || c.pos !== 'atk')) await d.changePos(c, 'atk', false); },
    effects: [ign(run(async ({ d, p, o, card }) => {
      const fiends = P(d, p).hand.filter((c) => c.def.kind === 'monster' && c.def.race === 'Fiend');
      if (fiends.length) await d.reveal(o, fiends, 'Gaap the Divine Soldier');
      d.addMod(card, 300 * fiends.length, 0);
    }, 300), { opt: true, label: 'Reveal Fiends: gain ATK', req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Fiend'] } }] })],
  },
  'Gaia Soul the Combustible Collective': {
    rules: ['pierce'],
    effects: [ign(run(async ({ d, p, card }) => {
      const cs = await d.select(p, 'Tribute up to 2 Pyro monsters', d.find({ ...OWN_M, race: ['Pyro'], notThis: true }, p, card).filter((c) => d.tributeOk(c)), 1, 2, 'cost');
      for (const c of cs) await d.move(c, 'gy', { why: 'tribute' });
      d.addMod(card, 1000 * cs.length, 0);
      atEndPhase(d, card, (x) => d.destroy(x, 'effect', undefined, p));
    }, 300), { opt: true, label: 'Tribute Pyros: gain ATK', req: [{ f: { ...OWN_M, race: ['Pyro'], notThis: true } }] })],
  },
  'Gale Lizard': { effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  'Gambler of Legend': {
    effects: [ign(run(async ({ d, p, o }) => {
      const n = (await d.tossCoins(3)).filter(Boolean).length;
      if (n === 3) for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
      else if (n === 2) { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }
      else if (n === 1) { const c = await pick(d, p, 'Destroy 1 card you control', d.fieldCards(p), 'cost'); if (c) await d.destroy(c, 'effect', undefined, p); }
      else if (P(d, p).hand.length) await d.discard(p, [...P(d, p).hand], p);
    }, 300), { opt: true, label: 'Toss 3 coins' })],
  },
  'Gandora the Dragon of Destruction': {
    noSpecial: true,
    effects: [
      ign(run(async ({ d, p, card }) => {
        let n = 0;
        for (const c of [...d.fieldCards(0), ...d.fieldCards(1)].filter((x) => x !== card)) if (await d.destroy(c, 'effect', undefined, p)) { n++; if (c.zone === 'gy') await d.banish(c, p); }
        d.addMod(card, 300 * n, 0, -1);
      }, (d, me) => d.fieldCards(opp(me)).length * 700 - (d.fieldCards(me).length - 1) * 600 - d.players[me].lp / 4), { label: 'Pay half LP: destroy and banish all other cards', cost: [{ op: 'payHalf' }] }),
      trig('endPhase', { op: 'toGY', s: { t: 'this' } }, { cond: (d, c) => c.data.sumTurn === d.turn }),
    ],
  },
  'Garoth, Lightsworn Warrior': {
    effects: [trig('anyToGY', run(async ({ d, p, card }) => {
      if (card.data.garoth === d.turn) return;
      card.data.garoth = d.turn;
      const top = P(d, p).deck.slice(-2);
      await d.mill(p, 2, p);
      await d.draw(p, top.filter((c) => c.def.name.includes('Lightsworn') && c.def.kind === 'monster').length);
    }), { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.from === 'deck' && ev.owner === c.ctrl && d.chain.some((l) => l.card.ctrl === c.ctrl && l.card !== c && l.card.def.name.includes('Lightsworn') && l.card.def.kind === 'monster') })],
  },
  'Gatling Dragon': { effects: [ign(run(async ({ d, p }) => { const n = (await d.tossCoins(3)).filter(Boolean).length; for (const c of await d.select(p, `Destroy ${n} monsters`, both(d), Math.min(n, both(d).length), n, 'bad')) await d.destroy(c, 'effect', undefined, p); }, 600), { opt: true, label: 'Toss 3 coins' })] },
  'Gear Golem the Moving Fortress': { effects: [ign(run(({ d, card }) => { card.data.tempRules = { ...(card.data.tempRules ?? {}), direct: d.turn }; }, 400), { opt: true, label: 'Pay 800 LP: attack directly', cost: [{ op: 'payLP', n: 800 }], cond: (d) => d.phase === 'M1' })] },
  'Gearfried the Swordmaster': { noNormal: true, onMove: undefined, effects: [trig('anyToGY', run(() => {}), { cond: () => false })] },
  'Gellenduo': {
    rules: ['battleImmune'],
    doubleTribute: (_d, t) => t.def.attr === 'LIGHT' && t.def.race === 'Fairy',
    onDamage: async (d, src, s) => { if (s === src.ctrl && d.onField(src)) await d.destroy(src, 'effect'); },
  },
  'Gemini Imps': {
    effects: [quick([{ op: 'negate' }, { op: 'draw', who: 'self', n: 1 }], {
      from: ['hand'], label: 'Send to the Graveyard: negate a discard effect', cost: [run(async ({ d, p, card }) => { await d.move(card, 'gy', { by: p, why: 'cost' }); })],
      when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'discard' && (o.who === 'opp' || o.who === 'both')),
    })],
  },
  'Gemini Lancer': { rules: ['pierce'] },
  'Gemini Summoner': {
    lock: { indestructible: (d, src, c, by) => { if (!src || c !== src || by !== 'battle' || src.data.gsTurn === d.turn) return false; src.data.gsTurn = d.turn; return true; } },
    effects: [trig('oppStandby', run(() => {}), { cond: () => false })],
  },
  'Gernia': { effects: [trig('destroyed', run(({ d, card }) => { const p = card.owner, mv = card.mv; nextStandby(d, p, async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.destroyedHow === 'effect' && c.mark.destroyedBy !== c.owner && !!c.mark.lastFaceUp })] },
  'Getsu Fuhma': { postBattle: async (d, self, o) => { if (o && o.zone === 'mzone' && ['Fiend', 'Zombie'].includes(d.raceOf(o) ?? '')) await d.destroy(o, 'effect', undefined, self.ctrl); } },
  'Ghost Knight of Jackal': { effects: [trig('destroysByBattle', run(async ({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy' && d.canSpecial(p, o)) await d.specialSummon(o, p, 'def'); }), { optional: true })] },
  'Giant Axe Mummy': {
    effects: [ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (d, c) => c.faceUp && (d.phase === 'M1' || d.phase === 'M2') })],
    preBattle: (d, self, other) => { if (d.battle?.tgt === self && !self.faceUp && other && d.atk(other) < (self.def.def ?? 0)) self.data.axe = other.uid; },
    postBattle: async (d, self, o) => { if (o && self.data.axe === o.uid && o.zone === 'mzone') await d.destroy(o, 'effect', undefined, self.ctrl); self.data.axe = undefined; },
  },
  'Giant Kozaky': {
    selfDestructIf: (d) => !both(d).some((c) => c.faceUp && c.def.name === 'Kozaky'),
    effects: [trig('destroyed', run(({ d, card }) => d.damage(card.mark.lastCtrl ?? card.owner, card.def.atk ?? 0, card)), { from: ['gy'], cond: (_d, c) => !!c.mark.lastFaceUp })],
  },
  'Giant Orc': { postBattle: (d, self, _o, r) => goblinDef(d, self, r) },
  'Gigantes': merge(banishProc(1, { attr: 'EARTH' }), { effects: [trig('battleDestroyed', destroyAll({ side: 'any', st: true, zone: ['szone', 'fzone'] }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] }),
  'Gigaplant': { effects: [ign(ssFrom(['hand', 'gy'], { race: ['Insect', 'Plant'] }), { opt: true, label: 'Special Summon an Insect or Plant' })] },
  'Gilford the Legend': {
    noSpecial: true,
    effects: [trig('normalSummoned', run(async ({ d, p }) => {
      for (const e of P(d, p).gy.filter((c) => c.def.stype === 'equip')) {
        const t = await pick(d, p, `Equip ${e.def.name}`, d.find({ ...OWN_FU, race: ['Warrior'] }, p).filter((m) => !e.def.equip?.f || d.match(m, e.def.equip.f, p, e)), 'good');
        if (!t || d.freeSlot(p, 's') < 0) break;
        await d.equipCard(e, t, undefined, p);
      }
    }), { optional: true })],
  },
  'Gilford the Lightning': { altTributes: [3], effects: [trig('normalSummoned', destroyAll(OPP_M), { cond: (_d, c) => c.mark.tribCount === 3 })] },
  'Gladiator Beast Alexander': merge(tagOut(), { noNormal: true, immune: (_d, self, src) => self.data.how === 'special' && src.def.kind === 'spell' }),
  'Gladiator Beast Bestiari': merge(tagOut(), { effects: [trig('specialSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: ST }], cond: (_d, c) => byGB(c) })] }),
  'Gladiator Beast Darius': merge(tagOut(), {
    effects: [
      trig('specialSummoned', run(async ({ d, p, card }) => {
        const c = await ssPick(d, p, d.find({ ...GY_M('self'), set: GB }, p), 'Special Summon a Gladiator Beast', undefined, false, card);
        if (!c) return;
        card.data.darius = c.uid;
        const mv = c.mv;
        d.addTemp({ until: 1e9, negate: (_d, x) => x === c && x.mv === mv });
      }), { optional: true, cond: (d, c) => byGB(c) && d.find({ ...GY_M('self'), set: GB }, c.ctrl).length > 0 }),
      trig('leftField', run(async ({ d, card }) => { const m = card.last.darius !== undefined ? d.byUid(card.last.darius) : undefined; if (m && m.zone === 'mzone') { await d.move(m, 'deck'); await d.shuffleDeck(m.owner); } })),
    ],
  }),
  'Gladiator Beast Dimacari': merge(tagOut(), { extraAttacks: (_d, c) => (byGB(c) ? 1 : 0) }),
  'Gladiator Beast Gaiodiaz': merge(gbFusion('Gladiator Beast Spartacus', 1), tagOut(2, true), { effects: [trig('destroysByBattle', run(({ d, o, link }) => { const x = link.trig?.other; if (x && x.zone === 'gy') return d.damage(o, x.def.def ?? 0); }))] }),
  'Gladiator Beast Gyzarus': merge(gbFusion('Gladiator Beast Bestiari', 1), tagOut(2, true), {
    effects: [trig('specialSummoned', run(async ({ d, p }) => { for (const c of await d.select(p, 'Destroy up to 2 cards', [...d.fieldCards(0), ...d.fieldCards(1)], 0, 2, 'bad')) await d.destroy(c, 'effect', undefined, p); }), { optional: true })],
  }),
  'Gladiator Beast Heraklinos': merge(gbFusion('Gladiator Beast Laquari', 2), { effects: [quick({ op: 'negate' }, { label: 'Discard: negate a Spell/Trap', cost: [{ op: 'discard', who: 'self', n: 1 }], on: ['activateST'], ai: 800 })] }),
  'Gladiator Beast Hoplomus': merge(tagOut(), { statFn: (d, c) => (byGB(c) ? { def: 2400 - d.base(c, 'def') } : undefined) }),
  'Gladiator Beast Laquari': merge(tagOut(), { statFn: (d, c) => (byGB(c) ? { atk: 2100 - d.base(c, 'atk') } : undefined) }),
  'Gladiator Beast Murmillo': merge(tagOut(), { effects: [trig('specialSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: FU }], cond: (_d, c) => byGB(c) })] }),
  'Gladiator Beast Octavius': {
    effects: [trig('specialSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { side: 'any', zone: ['szone', 'fzone'], faceUp: false } }], cond: (_d, c) => byGB(c) })],
    postBattle: (d, self) => {
      if (d.tp !== self.ctrl || self.data.tagTurn === d.turn) return;
      self.data.tagTurn = d.turn;
      const p = self.ctrl, mv = self.mv;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
        if (self.mv !== mv || self.zone !== 'mzone') return;
        const c = await pick(d, p, 'Discard 1 card to keep Gladiator Beast Octavius', P(d, p).hand, 'cost', true);
        if (c) await d.discard(p, [c], p); else { await d.move(self, 'deck'); await d.shuffleDeck(p); }
      } });
    },
  },
  'Gladiator Beast Secutor': {
    postBattle: (d, self) => {
      if (!byGB(self) || self.data.tagTurn === d.turn) return;
      self.data.tagTurn = d.turn;
      const p = self.ctrl, mv = self.mv;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
        if (self.mv !== mv || self.zone !== 'mzone') return;
        await d.move(self, 'deck');
        for (let i = 0; i < 2; i++) if (!(await ssPick(d, p, d.find(DECK({ kind: 'monster', set: GB, fn: (_d, c) => c.def.name !== 'Gladiator Beast Secutor' }), p), 'Special Summon a Gladiator Beast', undefined, false, self))) break;
        await d.shuffleDeck(p);
      } });
    },
  },
  'Gladiator Beast Spartacus': merge(tagOut(), { noNormal: true, effects: [trig('specialSummoned', search({ stype: 'equip', set: GB }), { cond: (d, c) => d.find(DECK({ stype: 'equip', set: GB }), c.ctrl).length > 0 })] }),
  'Gladiator Beast Torax': {
    postBattle: (d, self) => {
      if (!byGB(self) || self.data.tagTurn === d.turn) return;
      self.data.tagTurn = d.turn;
      const p = self.ctrl, mv = self.mv;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (self.mv === mv && self.zone === 'mzone' && (await d.confirm(p, 'Return Torax to the Deck to draw 1 card?', self))) { await d.move(self, 'deck'); await d.shuffleDeck(p); await d.draw(p, 1); } } });
    },
  },
  'Goblin Black Ops': { rules: ['direct'], postBattle: (d, self, _o, r) => goblinDef(d, self, r) },
  'Goblin Elite Attack Force': { postBattle: (d, self, _o, r) => goblinDef(d, self, r) },
  'Goblin King': {
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, race: ['Fiend'], notThis: true }, src.ctrl, src).length > 0 },
    statFn: (d, c) => { const n = 1000 * both(d).filter((x) => x !== c && x.faceUp && d.raceOf(x) === 'Fiend').length; return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
  },
  'Goblin of Greed': { lock: { activate: (_d, _s, _p, c) => !!c.def.effects?.some((e) => (e.cost ?? []).some((o) => o.op === 'discard')) } },
  'Goblin Recon Squad': {
    postBattle: (d, self, _o, r) => goblinDef(d, self, r),
    effects: [trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (!c) return; await d.reveal(p, [c], 'Goblin Recon Squad'); if (c.def.kind === 'spell') await d.move(c, 'gy', { by: p }); }), { optional: true, cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl })],
  },
  'Goblin Zombie': {
    effects: [
      trig('battleDamage', { op: 'mill', who: 'opp', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl }),
      trig('fieldToGY', search({ kind: 'monster', race: ['Zombie'], fn: (_d, c) => (c.def.def ?? 0) <= 1200 }), { from: ['gy'], cond: (d, c) => d.find(DECK({ kind: 'monster', race: ['Zombie'] }), c.owner).length > 0 }),
    ],
  },
  'Goe Goe the Gallant Ninja': { effects: [trig('battleDamage', run(async ({ d, p, o }) => { for (let i = 0; i < 2; i++) { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); } }), { cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && P(d, ev.player).hand.length >= 5 })] },
  'Goggle Golem': { statFn: (d, c) => ({ atk: 2100 - d.base(c, 'atk') }) },
  'Goka, the Pyre of Malice': {
    ssProc: { cond: (d, p) => d.find({ ...OWN_FU, attr: 'FIRE' }, p).length > 0 },
    effects: [
      trig('specialSummoned', run(async ({ d, p, card }) => { const c = await pick(d, p, 'Destroy a FIRE monster you control', d.find({ ...OWN_FU, attr: 'FIRE' }, p).filter((x) => x !== card), 'cost'); if (c) await d.destroy(c, 'effect', undefined, p); }), { cond: (_d, c) => c.properly && c.data.ssBy === undefined }),
      trig('standby', run(({ d, p }) => tokens(d, p, tokenDef('Fireball Token', 'Pyro', 'FIRE', 1, 100, 100), 1, 'def')), { cond: (d, c) => c.zone === 'mzone' && c.faceUp && d.canSpecial(c.ctrl) }),
      ign({ op: 'stat', s: { t: 'this' }, atk: 500 }, { label: 'Tribute a FIRE monster: +500 ATK', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'FIRE', notThis: true } } }], ai: -1 }),
    ],
  },
  'Gokipon': { effects: [trig('battleDestroyed', search({ kind: 'monster', race: ['Insect'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Goldd, Wu-Lord of Dark World': {
    effects: [trig('effDiscarded', run(async ({ d, p, o, card }) => {
      if (card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card));
      if (card.mark.sentBy !== undefined && card.mark.sentBy !== p) for (const c of await d.select(p, 'Destroy up to 2 cards', d.fieldCards(o), 0, 2, 'bad')) await d.destroy(c, 'effect', undefined, p);
    }), { from: ['gy'] })],
  },
  'Golden Flying Fish': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Tribute a Fish: destroy a card', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Fish'], notThis: true } } }], targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }] })] },
  'Golden Homunculus': { statFn: (d, c) => { const n = 300 * P(d, c.ctrl).banished.length; return { atk: n, def: n }; } },
  'Golden Ladybug': { effects: [trig('standby', run(async ({ d, p, card }) => { await d.reveal(opp(p), [card], 'Golden Ladybug'); await d.heal(p, 500); }), { optional: true, opt: true, from: ['hand'], cond: (_d, c) => c.zone === 'hand' })] },
  'Golem Sentry': {
    effects: [
      ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (_d, c) => c.faceUp }),
      trig('flipSummoned', { op: 'toHand', s: { t: 'target' } }, { targets: [{ f: OPP_M }] }),
    ],
  },
  'Gora Turtle': { lock: { attack: (d, _s, a) => d.atk(a) >= 1900 } },
  'Gora Turtle of Illusion': { onTargeted: (d, self, link) => { if (link.p !== self.ctrl && link.isCard && link.card.def.kind !== 'monster' && self.faceUp) link.negated = true; } },
  'Gorz the Emissary of Darkness': {
    effects: [quick(run(async ({ d, p, o, card, link }) => {
      const ev = link.ev;
      if (ev.e !== 'damage' || card.zone !== 'hand' || !d.canSpecial(p, card)) return;
      if (!(await d.specialSummon(card, p, await d.askPos(p, card)))) return;
      if (ev.battle) await tokens(d, p, tokenDef('Emissary of Darkness Token', 'Fairy', 'LIGHT', 7, ev.n, ev.n), 1, 'def');
      else await d.damage(o, ev.n, card);
    }, 1500), { from: ['hand'], label: 'Special Summon Gorz', when: (d, ev, p) => ev.e === 'damage' && ev.player === p && d.fieldCards(p).length === 0 && (!ev.src || d.holder(ev.src) !== p) })],
  },
  "Gradius' Option": {
    noNormal: true,
    ssProc: { cond: (d, p) => d.find({ ...OWN_FU, name: 'Gradius' }, p).length > 0 },
    effects: [trig('specialSummoned', run(({ d, p, card }) => { const g = d.find({ ...OWN_FU, name: 'Gradius' }, p)[0]; if (g) { card.data.gradius = g.uid; card.data.gradiusMv = g.mv; } }))],
    statFn: (d, c) => { const g = c.data.gradius !== undefined ? d.byUid(c.data.gradius) : undefined; return g && g.zone === 'mzone' ? { atk: d.atk(g) - d.base(c, 'atk'), def: d.defv(g) - d.base(c, 'def') } : undefined; },
    selfDestructIf: (d, c) => c.data.gradius !== undefined && !d.monsters(c.ctrl).some((m) => m.uid === c.data.gradius && m.mv === c.data.gradiusMv),
  },
  'Gragonith, Lightsworn Dragon': {
    rules: ['pierce'],
    statFn: (d, c) => { const n = 300 * new Set(P(d, c.ctrl).gy.filter((x) => x.def.kind === 'monster' && x.def.name.includes('Lightsworn')).map((x) => x.def.name)).size; return { atk: n, def: n }; },
    effects: [trig('endPhase', { op: 'mill', who: 'self', n: 3 }, { cond: (d, c) => d.tp === c.ctrl })],
  },
  'Granadora': {
    effects: [
      trig('summoned', { op: 'heal', who: 'self', n: 1000 }),
      trig('destroyed', run(({ d, card }) => d.damage(card.owner, 2000, card)), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
    ],
  },
  'Grandmaster of the Six Samurai': {
    summonCond: (d, p) => !has(d, p, 'Grandmaster of the Six Samurai'),
    ssProc: { cond: (d, p) => d.find({ ...OWN_FU, set: 'Six Samurai' }, p).length > 0 && !has(d, p, 'Grandmaster of the Six Samurai') },
    effects: [trig('destroyed', run(async ({ d, p }) => { const c = await pick(d, p, 'Add a Six Samurai', d.find({ ...GY_M('self'), set: 'Six Samurai' }, p), 'good'); if (c) await d.toHand(c); }), { from: ['gy'], cond: (_d, c) => c.mark.destroyedHow === 'effect' && c.mark.destroyedBy !== c.owner })],
  },
  'Granmarg the Rock Monarch': { effects: [trig('normalSummoned', { op: 'destroy', s: { t: 'target' } }, { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0, targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], faceUp: false } }] })] },
  'Grass Phantom': { statFn: (d, c) => ({ atk: 500 * P(d, c.ctrl).gy.filter((x) => x.def.name === 'Grass Phantom').length }) },
  'Grasschopper': { rules: ['attackAll'] },
  'Grave Ohja': {
    lock: { target: (d, src, a, t) => !!src && t === src && d.monsters(src.ctrl).some((m) => !m.faceUp && m.pos === 'def') && a.ctrl !== src.ctrl },
    onSummon: async (d, src, _c, how, p) => { if (how === 'flip' && p === src.ctrl) await d.damage(opp(src.ctrl), 300, src); },
  },
  'Grave Protector': { afterBattle: async (d, _src, r) => { for (const c of [r.att, r.tgt]) if (c && c.zone === 'gy' && c.mark.destroyedHow === 'battle' && c.mark.destroyedTurn === d.turn) { await d.move(c, 'deck'); await d.shuffleDeck(c.owner); } } },
  'Grave Squirmer': { effects: [trig('battleDestroyed', { op: 'destroy', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'] } }], cond: (_d, c) => c.zone === 'gy' })] },
};

// Gearfried the Swordmaster: destroy an opponent's monster each time it becomes equipped.
MONSTERS_6['Gearfried the Swordmaster'] = {
  noNormal: true,
  onResolve: async (d, src, link) => {
    if (src.zone !== 'mzone' || link.card.equipTo !== src.uid || link.card.data.gfDone) return;
    link.card.data.gfDone = true;
    const c = await pick(d, src.ctrl, 'Destroy an opponent\'s monster', d.monsters(opp(src.ctrl)), 'bad');
    if (c) await d.destroy(c, 'effect', undefined, src.ctrl);
  },
};
// Gemini Summoner: in the opponent's End Phase, pay 500 LP to Normal Summon a Gemini monster.
MONSTERS_6['Gemini Summoner'].effects = [trig('endPhase', run(async ({ d, p }) => {
  const dormant = d.monsters(p).filter((c) => c.faceUp && d.dormant(c));
  const hand = P(d, p).hand.filter((c) => c.def.ability === 'gemini' && d.tributesNeeded(p, c) === 0);
  const c = await pick(d, p, 'Gemini Summoner: Normal Summon a Gemini monster', [...dormant, ...hand], 'good');
  if (!c) return;
  await d.changeLP(p, -500, true);
  if (c.zone === 'mzone') { c.data.gemini = true; d.log(`${c.def.name} gains its effects.`); }
  else if (d.placeMonster(c, p, true, 'atk')) { await d.emit({ t: 'summon', card: c, how: 'normal' }); c.data.how = 'normal'; c.data.sumTurn = d.turn; }
}), { optional: true, opt: true, cond: (d, c) => d.tp !== c.ctrl && d.players[c.ctrl].lp > 500 })];
void isAttackOn; void won; void addCtr; void OWN_M;
