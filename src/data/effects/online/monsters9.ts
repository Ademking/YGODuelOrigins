// YGO Online monsters, part 9 (Medusa Worm … Phantom of Chaos).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, both, ctr, destroyAll, flip, has, ign, isAttackOn, lvUp, markKill, merge, opp, pick, pickSeen, quick,
  randomOf, removeCtr, run, search, spellCounterGain, spirit, ssFrom, ssPick, threat, tokenDef, tokens, trig, union, won, atEndPhase, umi,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
const setSelf = ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (d, c) => c.faceUp && c.data.sumTurn !== d.turn });
const victimGY = (fn: (d: Duel, p: Side, o: Card) => unknown) => trig('destroysByBattle', run(async ({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy') await fn(d, p, o); }));
const destroyNoCalc = (pred: (d: Duel, self: Card, t: Card) => boolean, keepDown = false): Def['preBattle'] => async (d, self, other) => {
  if (d.battle?.att !== self || !other || !pred(d, self, other)) return false;
  if (!keepDown && !other.faceUp) { other.faceUp = true; await d.emit({ t: 'flip', card: other }); }
  await d.destroy(other, 'effect', undefined, self.ctrl);
  self.data.killTurn = d.turn;
  return true;
};
const mysticSw = (next?: string): Def => merge(markKill, {
  preBattle: destroyNoCalc((_d, _s, t) => !t.faceUp && t.pos === 'def', true),
  effects: next ? [lvUp(next, 'endBattle')] : [],
});
const glowMoss = (selfDraw: boolean): Def => ({
  effects: [trig(['attacks', 'attacked'], run(async ({ d, p, o, card, link }) => {
    const who = selfDraw ? p : o;
    await d.draw(who, 1);
    const c = P(d, who).hand[P(d, who).hand.length - 1];
    if (!c) return;
    await d.reveal(selfDraw ? o : p, [c], 'Glow Moss');
    const ev = attackOf(link.ev);
    if (c.def.kind === 'monster') { d.attackNegated = true; d.battleEnded = true; }
    else if (c.def.kind === 'spell') { if (ev && ev.attacker === card && (await d.confirm(p, 'Change the attack to a direct attack?', card))) ev.target = null; }
    else await d.changePos(card, 'def');
  }))],
});
const aquaDolphin = (selfDamage: boolean): Def => ({
  effects: [ign(run(async ({ d, p, o }) => {
    await d.reveal(p, P(d, o).hand, "Opponent's hand");
    const c = await pickSeen(d, p, 'Select a Monster Card', P(d, o).hand.filter((x) => x.def.kind === 'monster'), 'bad');
    if (!c) return;
    if (d.monsters(p).some((m) => m.faceUp && d.atk(m) >= (c.def.atk ?? 0))) { await d.move(c, 'gy', { by: p }); await d.damage(o, 500); }
    else if (selfDamage) await d.damage(p, 500);
  }, 500), { opt: true, label: 'Discard: look at the opponent\'s hand', cost: [{ op: 'discard', who: 'self', n: 1 }], cond: (d, c) => P(d, opp(c.ctrl)).hand.length > 0 })],
});

export const MONSTERS_9: Record<string, Def> = {
  'Medusa Worm': { effects: [setSelf, trig('flipSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  'Mefist the Infernal General': { rules: ['pierce'], effects: [trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] },
  'Megarock Dragon': {
    noNormal: true,
    ssProc: { cond: (d, p) => d.find({ ...GY_M('self'), race: ['Rock'] }, p).length > 0, cost: [run(async ({ d, p, card }) => { const cs = await d.select(p, 'Banish Rock monsters', d.find({ ...GY_M('self'), race: ['Rock'] }, p), 1, 60, 'cost'); card.mark.mega = cs.length; for (const c of cs) await d.banish(c, p); })] },
    statFn: (d, c) => { const n = 700 * (c.mark.mega ?? 0); return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
  },
  'Mei-Kou, Master of Barriers': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Tribute: destroy a Continuous Spell/Trap', cost: [{ op: 'tribute', s: { t: 'this' } }], targets: [{ f: { side: 'any', zone: 'szone', faceUp: true, stype: 'continuous' } }] })] },
  'Meltiel, Sage of the Sky': {
    onResolve: async (d, src, link) => {
      if (!link.isCard || link.card.def.kind !== 'trap' || link.card.def.stype !== 'counter') return;
      await d.heal(src.ctrl, 1000);
      if (d.active('The Sanctuary in the Sky')) { const c = await pick(d, src.ctrl, 'Destroy a card', d.fieldCards(opp(src.ctrl)), 'bad'); if (c) await d.destroy(c, 'effect', undefined, src.ctrl); }
    },
  },
  'Memory Crusher': { effects: [trig('battleDamage', run(({ d, o }) => d.damage(o, 100 * P(d, o).extra.length)), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl })] },
  'Mermaid Knight': { ruleIf: { doubleAttack: (d) => umi(d) } },
  'Metabo Globster': { effects: [trig('toGY', run(({ d, p }) => tokens(d, p, tokenDef('Metabo Token', 'Fiend', 'DARK', 1, 0, 0, { rules: ['noTribute'] }), 3, 'def')), { from: ['gy'], cond: (d, c) => c.mark.lastWhy === 'tribute' && d.monsters(c.owner).some((m) => m.data.sumTurn === d.turn && m.def.attr === 'DARK' && (m.mark.tribs ?? []).includes(c.def.name)) })] },
  'Metal Shooter': {
    statFn: (_d, c) => ({ atk: 800 * ctr(c, 'shoot') }),
    effects: [trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, 2, 'shoot'); }))],
    lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'effect' && removeCtr(d, src, 1, 'shoot') > 0 },
  },
  'Metallizing Parasite - Lunatite': union({}, 0, 0),
  'Meteo the Matchless': { noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === 'Beast-Warrior' },
  'Mezuki': { effects: [ign(ssFrom(['gy'], { race: ['Zombie'] }), { from: ['gy'], label: 'Banish: Special Summon a Zombie', cost: [{ op: 'banish', s: { t: 'this' } }], req: [{ f: { ...GY_M('self'), race: ['Zombie'], notThis: true } }] })] },
  'Mid Shield Gardna': {
    effects: [setSelf],
    onTargeted: async (d, self, link) => { if (!self.faceUp && link.isCard && link.card.def.kind === 'spell' && link.targets.flat().length === 1) { link.negated = true; link.activationNegated = true; await d.changePos(self, 'reveal', false); } },
  },
  'Millennium Scorpion': { effects: [victimGY((d, _p, o) => { void o; })], postBattle: (d, self, o, r) => { if (o && won(self, r) && o.zone === 'gy') d.addMod(self, 500, 0, -1); } },
  'Mind on Air': { reveals: (_d, src, s) => s !== src.ctrl },
  'Mine Golem': { effects: [trig('battleDestroyed', { op: 'damage', who: 'opp', n: 500 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Miracle Flipper': {
    summonCond: (d, p) => !has(d, p, 'Miracle Flipper'),
    lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t !== src && t.faceUp && t.ctrl === src.ctrl },
    effects: [
      trig('battleDestroyed', run(({ d, card }) => { const mv = card.mv; d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(opp(card.owner), card)) await d.specialSummon(card, opp(card.owner), 'atk'); } }); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
      trig('destroyed', { op: 'destroy', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: OPP_M }], cond: (_d, c) => c.mark.destroyedHow === 'effect' }),
    ],
  },
  'Miracle Jurassic Egg': {
    lock: { banish: (_d, src, _p, c) => c === src },
    effects: [
      trig('anyToGY', run(({ d, card }) => { addCtr(d, card, 2, 'egg'); }), { cond: (_d, c, _p, ev) => ev?.e === 'sent' && ev.owner === c.ctrl && ev.card.def.kind === 'monster' && ev.card.def.race === 'Dinosaur' }),
      ign(run(async ({ d, p, link }) => { await ssPick(d, p, d.find(DECK({ kind: 'monster', race: ['Dinosaur'], fn: (_d, c) => (c.def.lv ?? 0) <= (link.data.n ?? 0) }), p), 'Special Summon a Dinosaur'); }, 800), {
        label: 'Tribute: Special Summon a Dinosaur', cost: [run(async ({ d, card, link }) => { link.data.n = ctr(card, 'egg'); await d.move(card, 'gy', { why: 'tribute' }); })], cond: (_d, c) => ctr(c, 'egg') > 0,
      }),
    ],
  },
  'Mirage Dragon': { lock: { activate: (d, src, p, c) => !!src && p !== src.ctrl && c.def.kind === 'trap' && d.phase === 'BP' } },
  'Mirage Knight': {
    noNormal: true,
    statFn: (d, c) => { const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null); return o ? { atk: o.def.atk ?? 0 } : undefined; },
    postBattle: (d, self) => { atEndPhase(d, self, (x) => d.banish(x, x.ctrl)); },
  },
  'Mist Archfiend': {
    altTributes: [0],
    effects: [trig('endPhase', run(async ({ d, p, card }) => { if (await d.destroy(card, 'effect', undefined, p)) await d.damage(p, 1000); }), { cond: (d, c) => c.mark.tribCount === 0 && c.data.how === 'normal' && c.data.sumTurn === d.turn })],
  },
  'Moai Interceptor Cannons': { effects: [setSelf] },
  'Mobius the Frost Monarch': { effects: [trig('normalSummoned', run(async ({ d, p }) => { for (const c of await d.select(p, 'Destroy up to 2 Spell/Trap Cards', d.find(ST, p), 0, 2, 'bad')) await d.destroy(c, 'effect', undefined, p); }), { optional: true, cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })] },
  'Moisture Creature': { altTributes: [3], effects: [trig('normalSummoned', destroyAll({ side: 'opp', st: true, zone: ['szone', 'fzone'] }), { cond: (_d, c) => c.mark.tribCount === 3 })] },
  'Mokey Mokey King': { effects: [trig('leftField', run(async ({ d, p }) => { for (const c of P(d, p).gy.filter((x) => x.def.name === 'Mokey Mokey')) { if (!d.canSpecial(p, c)) break; await d.specialSummon(c, p, await d.askPos(p, c)); } }), { optional: true })] },
  'Molten Zombie': { effects: [trig('specialSummoned', { op: 'draw', who: 'self', n: 1 }, { cond: (_d, c) => c.data.from === 'gy' })] },
  'Monk Fighter': { battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n) },
  'Mormolith': {
    effects: [ign(run(async ({ d, p, link }) => { for (const c of both(d).filter((x) => x.faceUp && d.defv(x) <= (link.data.atk ?? 0))) await d.destroy(c, 'effect', undefined, p); }, 600), {
      label: 'Tribute an EARTH monster: destroy monsters',
      cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Tribute an EARTH monster', d.find({ ...OWN_M, attr: 'EARTH' }, p).filter((x) => d.tributeOk(x)), 'cost'); if (c) { link.data.atk = c.faceUp ? d.atk(c) : c.def.atk; await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p) => d.find({ ...OWN_FU, attr: 'EARTH' }, p).length > 0)],
    })],
  },
  'Mosaic Manticore': {
    effects: [trig('normalSummoned', run(({ d, p, card }) => {
      const tribs = d.allCards().filter((x) => (card.mark.tribs ?? []).includes(x.def.name) && x.owner === p && x.zone === 'gy' && x.mark.sentTurn === d.turn);
      d.schedule({ at: 'SP', side: p, fn: async () => {
        for (const c of tribs) if (c.zone === 'gy' && d.canSpecial(p, c) && (await d.specialSummon(c, p, await d.askPos(p, c)))) { c.noAttackTurn = 1e9; const mv = c.mv; d.addTemp({ until: 1e9, negate: (_d, x) => x === c && x.mv === mv }); }
      } });
    }), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })],
  },
  'Mucus Yolk': {
    rules: ['direct'],
    effects: [trig('battleDamage', run(({ d, p, card }) => { const mv = card.mv; d.schedule({ at: 'SP', side: p, fn: () => { if (card.mv === mv && card.zone === 'mzone') d.addMod(card, 1000, 0, -1); } }); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Mudora': { statFn: (d, c) => ({ atk: 200 * P(d, c.ctrl).gy.filter((x) => x.def.kind === 'monster' && x.def.race === 'Fairy').length }) },
  'Mutant Mindmaster': {
    effects: [trig('attacks', run(async ({ d, p, card, link }) => {
      const ev = attackOf(link.ev);
      const t = await pick(d, p, 'Take control of a monster to attack with', d.find({ ...OPP_FU, pos: 'atk' }, p).filter((c) => c !== ev?.target), 'good');
      if (!ev || !t || !(await d.takeControl(t, p))) return;
      ev.attacker = t;
      t.data.noDirectTurn = d.turn;
      d.schedule({ at: 'BPend', turn: d.turn, fn: () => d.returnControl(t) });
      void card;
    }), { optional: true, cond: (d, c) => d.find({ ...OPP_FU, pos: 'atk' }, c.ctrl).length > 0 })],
  },
  'Mysterious Guard': {
    effects: [flip(run(async ({ d, p }) => {
      const c = await pick(d, p, 'Return a face-up monster to the top of the Deck', both(d).filter((x) => x.faceUp), 'bad');
      if (c) { await d.move(c, 'deck'); d.log(`${c.def.name} is returned to the top of the Deck.`); }
      if (d.find({ ...OWN_FU, race: ['Warrior'] }, p).length) { const x = await pick(d, p, 'You can return another face-up monster to the hand', both(d).filter((m) => m.faceUp), 'bad', true); if (x) await d.toHand(x); }
    }, 700))],
  },
  'Mystic Swordsman LV2': mysticSw('Mystic Swordsman LV4'),
  'Mystic Swordsman LV4': merge(mysticSw('Mystic Swordsman LV6'), { setOnly: true }),
  'Mystic Swordsman LV6': merge(mysticSw(), { setOnly: true }),
  'Mystical Beast Serket': {
    selfDestructIf: (d, c) => !d.active('Cathedral of Nobles', c.ctrl),
    postBattle: async (d, self, o, r) => { if (o && won(self, r)) { if (o.zone === 'gy') await d.banish(o, self.ctrl); d.addMod(self, 500, 0, -1); } },
  },
  'Mystical Knight of Jackal': { effects: [victimGY(async (d, p, o) => { if (await d.confirm(p, `Return ${o.def.name} to the top of the Deck?`, o)) await d.move(o, 'deck'); })] },
  'Mythical Beast Cerberus': merge(spellCounterGain(), {
    statFn: (_d, c) => ({ atk: 500 * ctr(c) }),
    postBattle: (d, self) => { const mv = self.mv; d.schedule({ at: 'BPend', turn: d.turn, fn: () => { if (self.mv === mv && self.zone === 'mzone' && self.data.ctr) self.data.ctr.spell = 0; } }); },
  }),
  'Nanobreaker': { preBattle: destroyNoCalc((d, _s, t) => t.faceUp && d.lvOf(t) <= 3) },
  'Necro Gardna': { effects: [quick({ op: 'negateAttack' }, { from: ['gy'], label: 'Banish: negate an attack', cost: [{ op: 'banish', s: { t: 'this' } }], when: (_d, ev, p) => isAttackOn(ev, p), ai: (d, me, _c, ev) => threat(d, me, ev) })] },
  'Necroface': {
    statFn: (_d, c) => ({ atk: 100 * (c.data.necro ?? 0) }),
    effects: [
      trig('normalSummoned', run(async ({ d, card }) => { let n = 0; const owners = new Set<Side>(); for (const s of [0, 1] as Side[]) for (const c of [...P(d, s).banished]) { owners.add(c.owner); await d.move(c, 'deck'); n++; } for (const s of owners) await d.shuffleDeck(s); card.data.necro = n; })),
      trig('banished', run(async ({ d }) => { for (const s of [0, 1] as Side[]) for (const c of P(d, s).deck.slice(-5)) await d.banish(c, s); }), { from: ['banished'] }),
    ],
  },
  'Needle Burrower': { effects: [victimGY((d, _p, o) => d.damage(opp(_p), 500 * (o.def.lv ?? 0)))] },
  'Neko Mane King': {
    effects: [trig('toGY', run(({ d }) => { d.battleEnded = true; d.skipM2 = true; d.log('The turn ends.'); }), { from: ['gy'], cond: (d, c) => d.tp !== c.owner && c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner })],
  },
  'Neo Space Pathfinder': { effects: [ign(run(async ({ d, p }) => { const c = await pick(d, p, 'Add Neo Space', d.find({ side: 'self', zone: ['deck', 'gy'], name: 'Neo Space' }, p), 'good'); if (c) { const fromDeck = c.zone === 'deck'; await d.toHand(c); if (fromDeck) await d.shuffleDeck(p); } }, 400), { from: ['hand'], label: 'Discard: add Neo Space', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: { side: 'self', zone: ['deck', 'gy'], name: 'Neo Space' } }] })] },
  'Neo-Parshath, the Sky Paladin': {
    rules: ['pierce'],
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Airknight Parshath' } } }], req: [{ f: { ...OWN_FU, name: 'Airknight Parshath' } }] },
    statFn: (d, c) => { const diff = P(d, c.ctrl).lp - P(d, opp(c.ctrl)).lp; return d.active('The Sanctuary in the Sky') && diff > 0 ? { atk: diff, def: diff } : undefined; },
    effects: [trig('battleDamage', { op: 'draw', who: 'self', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Neo-Spacian Air Hummingbird': { effects: [ign(run(({ d, p, o }) => d.heal(p, 500 * P(d, o).hand.length), (d, me) => 500 * P(d, opp(me)).hand.length - 200), { opt: true, label: 'Gain LP', cond: (d) => d.phase === 'M1' || d.phase === 'M2' })] },
  'Neo-Spacian Aqua Dolphin': aquaDolphin(true),
  'Neo-Spacian Dark Panther': {
    effects: [ign(run(({ d, card, t }) => { const c = t[0]; if (c) { card.data.nameAs = { name: c.def.name, turn: d.turn }; d.log(`${card.def.name} is treated as "${c.def.name}".`); } }, 100), { opt: true, label: 'Copy a monster\'s name', targets: [{ f: OPP_FU }] })],
  },
  'Neo-Spacian Flare Scarab': { statFn: (d, c) => ({ atk: 400 * d.spellTraps(opp(c.ctrl)).length }) },
  'Neo-Spacian Glow Moss': glowMoss(false),
  'Neo-Spacian Grand Mole': {
    preBattle: async (d, self, other) => {
      if (!other || other.ctrl === self.ctrl || !(await d.confirm(self.ctrl, 'Return both monsters to the hand?', self))) return false;
      await d.toHand(other);
      await d.toHand(self);
      return true;
    },
  },
  'Neo-Spacian Marine Dolphin': merge(aquaDolphin(false), { alias: 'Neo-Spacian Aqua Dolphin', noNormal: true }),
  'Neo-Spacian Twinkle Moss': merge(glowMoss(true), { alias: 'Neo-Spacian Glow Moss', noNormal: true }),
  'Newdoria': { effects: [trig('battleDestroyed', { op: 'destroy', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: M }], cond: (_d, c) => c.zone === 'gy' })] },
  'Night Assailant': {
    effects: [
      flip({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: OPP_M }] }),
      trig('toGY', { op: 'toHand', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: { ...GY_M('self'), fn: (_d, c) => !!c.def.effects?.some((e) => e.type === 'flip') && c.def.name !== 'Night Assailant' }, good: true }], cond: (_d, c) => c.mark.from === 'hand' }),
    ],
  },
  'Nightmare Horse': { rules: ['direct'] },
  'Nightmare Penguin': {
    aura: [{ f: { side: 'self', zone: 'mzone', attr: 'WATER' }, atk: 200 }],
    effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { side: 'opp' } }] })],
  },
  'Ninja Grandmaster Sasuke': { preBattle: destroyNoCalc((_d, _s, t) => t.faceUp && t.pos === 'def') },
  'Nobleman-Eater Bug': { effects: [flip({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: M, n: 2 }] })] },
  'Nova Summoner': {
    effects: [trig('battleDestroyed', run(async ({ d, p }) => {
      const pool = d.find(DECK({ kind: 'monster', attr: 'LIGHT', race: ['Fairy'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }), p);
      const air = d.active('The Sanctuary in the Sky') ? d.find(DECK({ name: 'Airknight Parshath' }), p) : [];
      await ssPick(d, p, [...pool, ...air], 'Special Summon a LIGHT Fairy');
      await d.shuffleDeck(p);
    }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Nubian Guard': { effects: [trig('battleDamage', run(async ({ d, p }) => { const c = await pick(d, p, 'Return a Continuous Spell to the top of your Deck', P(d, p).gy.filter((x) => x.def.kind === 'spell' && x.def.stype === 'continuous'), 'good'); if (c) await d.move(c, 'deck'); }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && P(d, c.ctrl).gy.some((x) => x.def.stype === 'continuous' && x.def.kind === 'spell') })] },
  'Nurse Reficule the Fallen One': { lock: { healToDamage: (_d, src, s) => !!src && s !== src.ctrl } },
  'Obnoxious Celtic Guard': { lock: { indestructible: (d, src, c, by) => { if (!src || c !== src || by !== 'battle' || !d.battle) return false; const o = d.battle.att === src ? d.battle.tgt : d.battle.att; return !!o && d.atk(o) >= 1900; } } },
  'Obsidian Dragon': { protect: (d, src, target, by) => target.ctrl === src.ctrl && target.zone === 'mzone' && target.faceUp && d.attrOf(target) === 'DARK' && by.def.kind !== 'monster' },
  'Ocean Dragon Lord - Neo-Daedalus': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Levia-Dragon - Daedalus' } } }], req: [{ f: { ...OWN_M, name: 'Levia-Dragon - Daedalus' } }] },
    effects: [ign(run(async ({ d, p, card }) => {
      for (const s of [0, 1] as Side[]) for (const c of [...d.fieldCards(s), ...P(d, s).hand]) if (c !== card) await d.move(c, 'gy', { by: p });
    }, (d, me) => (d.fieldCards(opp(me)).length + P(d, opp(me)).hand.length) * 500 - (d.fieldCards(me).length + P(d, me).hand.length) * 400), { label: 'Send Umi: send all other cards to the Graveyard', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: ['szone', 'fzone'], faceUp: true, name: 'Umi' } } }], req: [{ f: { side: 'self', zone: ['szone', 'fzone'], faceUp: true, name: 'Umi' } }] })],
  },
  "Ocean's Keeper": { rules: ['pierce'], effects: [trig('battleDestroyed', search({ name: ['Thousand-Eyes Jellyfish', 'Cranium Fish'] }), { from: ['gy'] })] },
  'Ojama King': {
    lock: { zone: (_d, src, s, slot) => !!src && s !== src.ctrl && (src.data.zones ?? []).includes(slot) },
    effects: [trig('summoned', run(({ d, o, card }) => { card.data.zones = [0, 1, 2, 3, 4].filter((i) => !P(d, o).m[i]).slice(0, 3); }))],
  },
  'Ojama Knight': {
    mats: [{ set: 'Ojama' }, { set: 'Ojama' }],
    lock: { zone: (_d, src, s, slot) => !!src && s !== src.ctrl && (src.data.zones ?? []).includes(slot) },
    effects: [trig('summoned', run(({ d, o, card }) => { card.data.zones = [0, 1, 2, 3, 4].filter((i) => !P(d, o).m[i]).slice(0, 2); }))],
  },
  'Old Vindictive Magician': { effects: [flip({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  'Orca Mega-Fortress of Darkness': {
    effects: [
      ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Tribute Torpedo Fish: destroy a monster', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Torpedo Fish' } } }], targets: [{ f: M }] }),
      ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Tribute Cannonball Spear Shellfish: destroy a Spell/Trap', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Cannonball Spear Shellfish' } } }], targets: [{ f: ST }] }),
    ],
  },
  'Otohime': spirit(trig(['normalSummoned', 'flipSummoned'], { op: 'pos', s: { t: 'target' }, to: 'swap' }, { optional: true, targets: [{ f: OPP_FU }] })),
  'Outstanding Dog Marron': { effects: [trig('toGY', run(async ({ d, card }) => { await d.move(card, 'deck'); await d.shuffleDeck(card.owner); }), { from: ['gy'] })] },
  'Oxygeddon': { effects: [trig('battleDestroyed', { op: 'damage', who: 'both', n: 800 }, { from: ['gy'], cond: (d, c) => c.zone === 'gy' && !!d.battle && [d.battle.att, d.battle.tgt].some((m) => m && m !== c && d.raceOf(m) === 'Pyro') })] },
  'Paladin of White Dragon': {
    preBattle: destroyNoCalc((_d, _s, t) => !t.faceUp && t.pos === 'def'),
    effects: [ign(run(async ({ d, p, card }) => { const c = await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Blue-Eyes White Dragon' }, p), 'Special Summon Blue-Eyes White Dragon', undefined, false, card); if (c) c.noAttackTurn = d.turn; }, 1200), { label: 'Tribute: Special Summon Blue-Eyes', cost: [{ op: 'tribute', s: { t: 'this' } }], req: [{ f: { side: 'self', zone: ['hand', 'deck'], name: 'Blue-Eyes White Dragon' } }] })],
  },
  'Pandemonium Watchbear': { lock: { indestructible: (d, src, c, by) => !!src && by === 'effect' && c.def.name === 'Pandemonium' && c.ctrl === src.ctrl && d.chain.length > 0 && d.chain[d.chain.length - 1].p !== src.ctrl } },
  'Parasitic Ticky': { statFn: (d, c) => { const n = 500 * both(d).filter((x) => x.token).length; return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; } },
  'Patrician of Darkness': {
    effects: [quick(run(async ({ d, p, link }) => {
      const ev = attackOf(link.ev);
      if (!ev) return;
      const t = await pick(d, p, 'Select the attack target', d.attackTargets(ev.attacker).filter((x): x is Card => !!x), 'good');
      if (t) { ev.target = t; d.log(`The attack target becomes ${t.faceUp ? t.def.name : 'a face-down monster'}.`); }
    }, (d, me, _c, ev) => (ev.e === 'attack' && d.monsters(me).length > 1 ? threat(d, me, ev) / 2 : -1)), { label: 'Select the attack target', when: (d, ev, p) => isAttackOn(ev, p) && d.monsters(p).length > 1 })],
  },
  'Patroid': { effects: [ign(run(async ({ d, p, t }) => { if (t[0]) await d.reveal(p, [t[0]], 'Face-down card'); }, 100), { opt: true, label: 'Look at a face-down card', targets: [{ f: { side: 'opp', zone: ['mzone', 'szone'], faceUp: false } }], cond: (d) => d.phase === 'M1' || d.phase === 'M2' })] },
  'Penumbral Soldier Lady': { statFn: (d, c) => { const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null); return o && d.attrOf(o) === 'LIGHT' ? { atk: 1000 } : undefined; } },
  'Perfect Machine King': { statFn: (d, c) => ({ atk: 500 * both(d).filter((x) => x !== c && x.faceUp && d.raceOf(x) === 'Machine').length }) },
  'Peten the Dark Clown': { effects: [trig('toGY', ssFrom(['hand', 'deck'], { name: 'Peten the Dark Clown' }), { optional: true, from: ['gy'], cost: [{ op: 'banish', s: { t: 'this' } }] })] },
  'Phantom Beast Cross-Wing': { gyAuraFn: (_d, _src, c) => (c.zone === 'mzone' && (c.def.name.includes('Phantom Beast') || c.def.name === 'Gazelle the King of Mythical Beasts') ? { atk: 300 } : undefined) },
  'Phantom Beast Rock-Lizard': {
    tributes: (d, p) => (d.monsters(p).some((m) => m.def.name.includes('Phantom Beast') || m.def.name === 'Gazelle the King of Mythical Beasts') ? 1 : 2),
    effects: [
      trig('destroysByBattle', { op: 'damage', who: 'opp', n: 500 }),
      trig('destroyed', { op: 'damage', who: 'opp', n: 2000 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.destroyedHow === 'effect' && c.mark.destroyedBy !== c.owner }),
    ],
  },
  'Phantom Beast Thunder-Pegasus': {
    effects: [quick(run(({ d, p, link }) => {
      const ev = attackOf(link.ev);
      const t = ev?.target;
      if (!t) return;
      const mv = t.mv;
      d.addTemp({ until: d.turn, p, lock: {
        battleDmg: (_d, _s, _a, tg, n, to) => (tg === t && to === p ? 0 : n),
        indestructible: (_d, _s, c, by) => by === 'battle' && c === t && c.mv === mv,
      } });
    }, (d, me, _c, ev) => threat(d, me, ev)), { from: ['gy'], label: 'Banish: protect a Phantom Beast', cost: [{ op: 'banish', s: { t: 'this' } }], when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && (ev.target.def.name.includes('Phantom Beast') || ev.target.def.name === 'Gazelle the King of Mythical Beasts') })],
  },
  'Phantom Beast Wild-Horn': { rules: ['pierce'] },
  'Phantom Cricket': { effects: [flip(run(async ({ d, t }) => { const c = t[0]; if (c && c.zone === 'mzone') { await d.move(c, 'deck'); d.log('A face-down monster is returned to the top of the Deck.'); } }, 500), { targets: [{ f: { ...M, faceUp: false } }] })] },
  'Phantom Dragon': {
    lock: { zone: (_d, src, s, slot) => !!src && s === src.ctrl && (src.data.zones ?? []).includes(slot) },
    effects: [
      quick(run(async ({ d, p, card }) => { if (card.zone === 'hand' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }, 1200), { from: ['hand'], label: 'Special Summon Phantom Dragon', when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip' }),
      trig('summoned', run(({ d, p, card }) => { card.data.zones = [0, 1, 2, 3, 4].filter((i) => !P(d, p).m[i]).slice(0, 2); })),
    ],
  },
  'Phantom Dragonray Bronto': {
    statFn: (d, c) => ({ atk: 2300 - d.base(c, 'atk') }),
    postBattle: (d, self, _o, r) => { if (r.att !== self) return; const mv = self.mv; d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (self.mv !== mv || self.zone !== 'mzone') return; await d.changePos(self, 'def'); d.addTemp({ until: d.turn + 2, lock: { pos: (_d, _s, c) => c === self && c.mv === mv } }); } }); },
  },
  'Phantom of Chaos': {
    battleDmg: (_d, self, _o, n, to) => (to !== self.ctrl ? 0 : n),
    statFn: (d, c) => (c.data.chaos?.turn === d.turn ? { atk: c.data.chaos.atk - d.base(c, 'atk') } : undefined),
    effects: [ign(run(async ({ d, p, card }) => {
      const m = await pick(d, p, 'Banish an Effect Monster', P(d, p).gy.filter((x) => x.def.kind === 'monster' && x.def.mtype === 'effect'), 'cost');
      if (!m) return;
      await d.banish(m, p);
      card.data.chaos = { turn: d.turn, atk: m.def.atk ?? 0 };
      card.data.nameAs = { name: m.def.name, turn: d.turn };
    }, 500), { opt: true, label: 'Banish an Effect Monster: copy its name and ATK', req: [{ f: { side: 'self', zone: 'gy', kind: 'monster', mtype: ['effect'] } }] })],
  },
};

void ssFrom; void tokens; void FU; void OWN_M; void banishProc;
