// YGO Online monsters, part 8 (Iris, the Earth Mother … Mechanical Hound).
import {
  type Card, type Def, type Duel, type Link, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, banishProc, banishVictims, both, ctr, destroyAll, flip, has, ign, merge, opp, pick, quick, randomOf, removeCtr, run, search,
  spellCounterGain, spirit, ssFrom, ssPick, threat, tokenDef, tokens, trig, union, won, atEndPhase, isAttackOn,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
/** "After a Chain with N or more Links resolves" (and the names in it were all different). */
const afterChain = (n: number, fn: (d: Duel, src: Card) => Promise<unknown> | unknown): Def => ({
  onResolve: async (d, src, link: Link) => {
    src.data.chainMax = Math.max(src.data.chainMax ?? 0, link.num);
    src.data.chainNames = [...(src.data.chainNames ?? []), link.card.def.name];
    if (link.num !== 1) return;
    const max = src.data.chainMax, names: string[] = src.data.chainNames;
    src.data.chainMax = 0; src.data.chainNames = [];
    if (max >= n && new Set(names).size === names.length) await fn(d, src);
  },
});
const lightsworn = (n: number): Def => ({ effects: [trig('endPhase', { op: 'mill', who: 'self', n }, { cond: (d, c) => d.tp === c.ctrl })] });
const tributedAtk = (d: Duel, c: Card) => d.allCards().filter((x) => (c.mark.tribs ?? []).includes(x.def.name) && x.owner === c.ctrl && x.mark.sentTurn === c.mark.tribTurn && x.mark.lastWhy === 'tribute');
const setBack = (d: Duel, self: Card, r: { att: Card }) => {
  if (r.att !== self) return;
  const mv = self.mv;
  d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (self.mv !== mv || self.zone !== 'mzone') return; await d.changePos(self, 'def'); d.addTemp({ until: d.turn + 2, lock: { pos: (_d, _s, c) => c === self && c.mv === mv } }); } });
};

export const MONSTERS_8: Record<string, Def> = {
  'Iris, the Earth Mother': afterChain(3, (d, src) => d.draw(src.ctrl, 1)),
  'Iron Blacksmith Kotetsu': { effects: [flip(search({ stype: 'equip' }))] },
  'Jain, Lightsworn Paladin': merge(lightsworn(2), { statFn: (d, c) => (d.battle?.att === c && d.battle.tgt ? { atk: 300 } : undefined) }),
  'Jetroid': { effects: [trig('attacked', run(({ d, p }) => d.addTemp({ until: d.turn, p, tag: 'trapFromHand' })))] },
  'Jinzo - Lord': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, name: 'Jinzo' } } }], req: [{ f: { ...OWN_FU, name: 'Jinzo' } }] },
    negateFn: (_d, _s, c) => c.def.kind === 'trap',
    lock: { activate: (_d, _s, _p, c) => c.def.kind === 'trap' },
    effects: [ign(run(async ({ d, p, o }) => { let n = 0; for (const c of [...d.spellTraps(0), ...d.spellTraps(1)].filter((x) => x.faceUp && x.def.kind === 'trap')) if (await d.destroy(c, 'effect', undefined, p)) n++; await d.damage(o, 300 * n); }, (d, me) => d.spellTraps(opp(me)).filter((c) => c.faceUp && c.def.kind === 'trap').length * 600), { opt: true, label: 'Destroy all face-up Traps' })],
  },
  'Jinzo - Returner': {
    rules: ['direct'],
    effects: [trig('toGY', run(async ({ d, p, card }) => { const j = await ssPick(d, p, P(d, p).gy.filter((c) => c.def.name === 'Jinzo'), 'Special Summon Jinzo', undefined, false, card); if (j) d.schedule({ at: 'EP', side: p, fn: async () => { if (j.zone === 'mzone') await d.destroy(j, 'effect', undefined, p); } }); }), { optional: true, from: ['gy'], cond: (d, c) => P(d, c.owner).gy.some((x) => x.def.name === 'Jinzo') })],
  },
  'Jowls of Dark Demise': { effects: [flip(run(async ({ d, p, t }) => { const c = t[0]; if (c && (await d.takeControl(c, p))) c.data.tempRules = { ...(c.data.tempRules ?? {}), direct: d.turn }; }, 1000), { targets: [{ f: OPP_M }] })] },
  'Judgment Dragon': {
    noNormal: true,
    ssProc: { cond: (d, p) => new Set(P(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.name.includes('Lightsworn')).map((c) => c.def.name)).size >= 4 },
    effects: [
      ign(destroyAll({ side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true }), { label: 'Pay 1000 LP: destroy all other cards', cost: [{ op: 'payLP', n: 1000 }], ai: (d, me) => d.fieldCards(opp(me)).length * 700 - (d.fieldCards(me).length - 1) * 600 }),
      trig('endPhase', { op: 'mill', who: 'self', n: 4 }, { cond: (d, c) => d.tp === c.ctrl }),
    ],
  },
  'KA-2 Des Scissors': { effects: [trig('destroysByBattle', run(({ d, o, link }) => { const x = link.trig?.other; if (x && x.zone === 'gy') return d.damage(o, 500 * (x.def.lv ?? 0)); }))] },
  'Kahkki, Guerilla of Dark World': { effects: [trig('effDiscarded', { op: 'destroy', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: M }] })] },
  'Kaibaman': { effects: [ign(ssFrom(['hand'], { name: 'Blue-Eyes White Dragon' }), { label: 'Tribute: Special Summon Blue-Eyes', cost: [{ op: 'tribute', s: { t: 'this' } }], req: [{ f: { side: 'self', zone: 'hand', name: 'Blue-Eyes White Dragon' } }] })] },
  'Kaiser Glider': {
    lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'battle' && !!d.battle && !!d.battle.tgt && d.atk(d.battle.att) === d.atk(d.battle.tgt) },
    effects: [trig('destroyed', { op: 'toHand', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: M }], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Kaiser Sea Horse': { doubleTribute: (_d, t) => t.def.attr === 'LIGHT' },
  'Kangaroo Champ': { postBattle: async (d, self, o) => { if (o && o.zone === 'mzone' && o.pos === 'atk') await d.changePos(o, 'def'); } },
  'Kelbek': { postBattle: async (d, self, o, r) => { if (o && r.tgt === self && o.zone === 'mzone') await d.toHand(o); } },
  'Keldo': { effects: [trig('battleDestroyed', run(async ({ d, p, o }) => { const cs = await d.select(p, "Shuffle 2 cards from your opponent's Graveyard into the Deck", P(d, o).gy, Math.min(2, P(d, o).gy.length), 2, 'bad'); for (const c of cs) await d.move(c, 'deck'); if (cs.length) await d.shuffleDeck(o); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'King Dragun': {
    protect: (d, src, target, by) => target.zone === 'mzone' && target.ctrl === src.ctrl && d.raceOf(target) === 'Dragon' && d.holder(by) !== src.ctrl,
    effects: [ign(ssFrom(['hand'], { race: ['Dragon'] }), { opt: true, label: 'Special Summon a Dragon' })],
  },
  'King of Destruction - Xexex': { noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === 'Fiend' },
  'King of the Skull Servants': {
    statFn: (d, c) => ({ atk: 1000 * P(d, c.ctrl).gy.filter((x) => x.def.name === 'King of the Skull Servants' || x.def.name === 'Skull Servant').length - d.base(c, 'atk') }),
    effects: [trig('battleDestroyed', run(async ({ d, p, card }) => { if (card.zone === 'gy' && d.canSpecial(p, card)) { card.properly = true; await d.specialSummon(card, p, await d.askPos(p, card)); } }), {
      optional: true, from: ['gy'], cost: [{ op: 'banish', s: { t: 'choose', f: { side: 'self', zone: 'gy', name: ['King of the Skull Servants', 'Skull Servant'], notThis: true } } }],
      cond: (d, c) => c.zone === 'gy' && P(d, c.owner).gy.some((x) => x !== c && (x.def.name === 'King of the Skull Servants' || x.def.name === 'Skull Servant')),
    })],
  },
  'King of the Swamp': { fusionSub: true, effects: [ign(search({ name: 'Polymerization' }), { from: ['hand'], label: 'Discard: add Polymerization', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: 'Polymerization' }) }] })] },
  'King Pyron': { effects: [ign({ op: 'damage', who: 'opp', n: 1000 }, { opt: true, label: 'Inflict 1000 damage' })] },
  'King Tiger Wanghu': { onSummon: async (d, src, c, how) => { if (how !== 'flip' && c.faceUp && c !== src && d.atk(c) <= 1400) await d.destroy(c, 'effect', undefined, src.ctrl); } },
  "King's Knight": { effects: [trig('normalSummoned', ssFrom(['deck'], { name: "Jack's Knight" }), { optional: true, cond: (d, c) => has(d, c.ctrl, "Queen's Knight") })] },
  'Kiryu': merge(union({ name: 'Dark Blade' }, 900, 900), {
    effects: [ign(run(({ d, card }) => { const m = d.equippedTo(card); if (m) m.data.tempRules = { ...(m.data.tempRules ?? {}), direct: d.turn }; }, 500), { from: ['szone'], label: 'Tribute: the equipped monster attacks directly', cost: [run(async ({ d, card, link }) => { link.data.m = d.equippedTo(card); await d.move(card, 'gy', { why: 'tribute' }); })], cond: (d, c) => !!d.equippedTo(c) })],
  }),
  'Koitsu': union({ name: 'Aitsu' }, 3000, 0, { rules: ['pierce'] }),
  'Kryuel': { effects: [trig('battleDestroyed', run(async ({ d, p, o }) => { if (!(await d.call(p))) return; const c = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'] })] },
  'Kuraz the Light Monarch': {
    attackCond: (d, c) => c.data.sumTurn !== d.turn,
    effects: [trig(['normalSummoned', 'specialSummoned'], run(async ({ d, p }) => { for (const c of await d.select(p, 'Destroy up to 2 cards', [...d.fieldCards(0), ...d.fieldCards(1)], 0, 2, 'bad')) { const s = c.ctrl; if (await d.destroy(c, 'effect', undefined, p)) await d.draw(s, 1); } }), { optional: true })],
  },
  'Lady Ninja Yae': { effects: [ign({ op: 'toHand', s: { t: 'all', f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } } }, { label: 'Discard a WIND monster: bounce all opponent Spells/Traps', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WIND' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WIND' } }, { f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }] })] },
  'Lava Golem': {
    noNormal: true,
    effects: [
      ign(run(async ({ d, p, o, card }) => {
        for (const c of await d.select(p, "Tribute 2 of your opponent's monsters", d.monsters(o).filter((x) => d.tributeOk(x)), 2, 2, 'bad')) await d.move(c, 'gy', { why: 'tribute' });
        await d.specialSummon(card, o, 'atk', 'special', false, card);
        d.players[p].normalDone = true;
      }, (d, me) => d.monsters(opp(me)).reduce((s, c) => s + (c.def.atk ?? 0), 0) - 3000), { from: ['hand'], label: "Tribute 2 opponent monsters: Special Summon to their field", cond: (d, _c, p) => d.monsters(opp(p)).filter((x) => d.tributeOk(x)).length >= 2 && !P(d, p).normalDone }),
      trig('standby', run(({ d, card }) => d.damage(card.ctrl, 1000, card)), { cond: (_d, c) => c.zone === 'mzone' && c.faceUp }),
    ],
  },
  'Layard the Liberator': { onResolve: async (d, src, link) => { if (link.isCard && link.card.def.kind === 'trap' && link.card.def.stype === 'counter') for (const c of await d.select(src.ctrl, 'Add 2 banished Fairies to your hand', P(d, src.ctrl).banished.filter((x) => x.def.kind === 'monster' && x.def.race === 'Fairy'), 0, 2, 'good')) await d.toHand(c); } },
  'Legacy Hunter': { postBattle: async (d, self, o, r) => { if (o && r.att === self && r.killedT && o.mark.lastFaceUp === false && o.zone === 'gy') { const c = randomOf(d, P(d, o.owner).hand); if (c) { await d.move(c, 'deck'); await d.shuffleDeck(o.owner); } } } },
  'Legendary Fiend': { effects: [trig('standby', { op: 'stat', s: { t: 'this' }, atk: 700, perm: true }, { cond: (_d, c) => c.zone === 'mzone' && c.faceUp })] },
  'Legendary Flame Lord': merge(spellCounterGain(), { effects: [ign([run(({ d, card }) => { removeCtr(d, card, 3); }), destroyAll({ ...M, notThis: true })], { label: 'Remove 3 Spell Counters: destroy all other monsters', cond: (_d, c) => ctr(c) >= 3 })] }),
  'Legendary Jujitsu Master': { postBattle: async (d, self, o) => { if (o && self.pos === 'def' && o.zone === 'mzone') { await d.move(o, 'deck'); d.log(`${o.def.name} is returned to the top of the Deck.`); } } },
  'Lekunga': { effects: [ign(run(({ d, p }) => tokens(d, p, tokenDef('Lekunga Token', 'Plant', 'WATER', 2, 700, 700), 1, 'atk'), 300), { label: 'Banish 2 WATER monsters: Lekunga Token', cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'WATER' }, n: 2 } }], req: [{ f: { ...GY_M('self'), attr: 'WATER' }, n: 2 }] })] },
  'Lesser Fiend': banishVictims,
  'Levia-Dragon - Daedalus': { effects: [ign(destroyAll({ side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true }), { label: 'Send Umi: destroy all other cards', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: ['szone', 'fzone'], faceUp: true, name: 'Umi' } } }], req: [{ f: { side: 'self', zone: ['szone', 'fzone'], faceUp: true, name: 'Umi' } }], ai: (d, me) => d.fieldCards(opp(me)).length * 700 - (d.fieldCards(me).length - 2) * 600 })] },
  'Lich Lord, King of the Underworld': {
    tribFilter: (d, t) => d.attrOf(t) === 'DARK' || t.def.attr === 'DARK',
    effects: [trig('toGY', { op: 'toHand', s: { t: 'this' } }, { from: ['gy'], cond: (d, c) => c.mark.lastWhy === 'tribute' && d.chain.length > 0 })],
  },
  'Light and Darkness Dragon': {
    noSpecial: true,
    effects: [
      quick(run(({ d, card, link }) => { const ev = link.ev; if (ev.e === 'chain') { ev.link.negated = true; ev.link.activationNegated = true; d.addMod(card, -500, -500, -1); } }, 100), { label: 'Negate an activation (mandatory)', when: (d, ev, _p, card) => ev.e === 'chain' && ev.link.card !== card && d.atk(card) >= 500 }),
      trig('destroyed', run(async ({ d, p }) => {
        const g = await pick(d, p, 'Select a monster in your Graveyard', P(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.name !== 'Light and Darkness Dragon'), 'good');
        for (const c of d.fieldCards(p)) await d.destroy(c, 'effect', undefined, p);
        if (g && d.canSpecial(p, g)) await d.specialSummon(g, p, await d.askPos(p, g));
      }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
    ],
  },
  'Light Effigy': { doubleTribute: (_d, t) => t.def.attr === 'LIGHT' && t.def.mtype === 'normal' },
  'Lightning Punisher': afterChain(3, async (d, src) => { const c = await pick(d, src.ctrl, 'Destroy a card', d.fieldCards(opp(src.ctrl)), 'bad'); if (c) await d.destroy(c, 'effect', undefined, src.ctrl); }),
  'Little-Winguard': { effects: [trig('endPhase', { op: 'pos', s: { t: 'this' }, to: 'swap' }, { optional: true, cond: (d, c) => d.tp === c.ctrl })] },
  'Lonefire Blossom': { effects: [ign(ssFrom(['deck'], { race: ['Plant'] }), { opt: true, label: 'Tribute a Plant: Special Summon a Plant', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, race: ['Plant'] } } }], req: [{ f: DECK({ kind: 'monster', race: ['Plant'] }) }] })] },
  'Lord Poison': { effects: [trig('battleDestroyed', ssFrom(['gy'], { race: ['Plant'], fn: (_d, c) => c.def.name !== 'Lord Poison' }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Lost Guardian': { statFn: (d, c) => ({ def: 700 * P(d, c.ctrl).banished.filter((x) => x.def.kind === 'monster' && x.def.race === 'Rock').length - d.base(c, 'def') }) },
  'Lucky Pied Piper': { effects: [trig('destroysByBattle', { op: 'draw', who: 'self', n: 1 })] },
  'Lumina, Lightsworn Summoner': merge(lightsworn(3), { effects: [ign(ssFrom(['gy'], { set: 'Lightsworn', maxLv: 4 }), { opt: true, label: 'Discard: Special Summon a Lightsworn', cost: [{ op: 'discard', who: 'self', n: 1 }], req: [{ f: { ...GY_M('self'), set: 'Lightsworn', maxLv: 4 } }] })] }),
  'Luminous Soldier': { statFn: (d, c) => { const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null); return o && d.attrOf(o) === 'DARK' ? { atk: 500 } : undefined; } },
  'Lycanthrope': { effects: [trig('battleDamage', run(({ d, p, o }) => d.damage(o, 200 * P(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.mtype === 'normal').length)), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] },
  'Lyla, Lightsworn Sorceress': merge(lightsworn(3), {
    effects: [ign(run(async ({ d, p, card, t }) => {
      await d.changePos(card, 'def');
      const mv = card.mv;
      d.addTemp({ until: d.turn + 2, lock: { pos: (_d, _s, c) => c === card && c.mv === mv } });
      if (t[0]) await d.destroy(t[0], 'effect', undefined, p);
    }, 700), { label: 'Change to Defense: destroy a Spell/Trap', targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }], cond: (_d, c) => c.pos === 'atk' })],
  }),
  'Machine King Prototype': { statFn: (d, c) => { const n = 100 * both(d).filter((x) => x !== c && x.faceUp && d.raceOf(x) === 'Machine').length; return { atk: n, def: n }; } },
  'Machiners Defender': { effects: [flip(search({ name: 'Commander Covington' }))] },
  'Machiners Force': {
    noNormal: true, attackCost: [{ op: 'payLP', n: 1000 }],
    effects: [ign(run(async ({ d, p, card }) => {
      await d.move(card, 'gy', { why: 'cost' });
      for (const n of ['Machiners Soldier', 'Machiners Sniper', 'Machiners Defender']) { const c = P(d, p).gy.find((x) => x.def.name === n); if (c && d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c)); }
    }, -1), { label: 'Send to the GY: Special Summon the Machiners', cond: (d, c) => ['Machiners Soldier', 'Machiners Sniper', 'Machiners Defender'].every((n) => P(d, c.ctrl).gy.some((x) => x.def.name === n)) && d.freeCount(c.ctrl, 'm') >= 2 })],
  },
  'Machiners Sniper': { lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.ctrl === src.ctrl && t.def.name.includes('Machiners') && t.def.name !== 'Machiners Sniper' } },
  'Machiners Soldier': { effects: [trig('normalSummoned', ssFrom(['hand'], { set: 'Machiners', fn: (_d, c) => c.def.name !== 'Machiners Soldier' }), { optional: true, cond: (d, c) => d.monsters(c.ctrl).length === 1 })] },
  'Mad Reloader': {
    effects: [trig('battleDestroyed', run(async ({ d, p }) => {
      const cs = await d.select(p, 'Send 2 cards from your hand to the Graveyard', P(d, p).hand, 2, 2, 'cost');
      if (cs.length < 2) return;
      for (const c of cs) await d.move(c, 'gy', { by: p });
      await d.draw(p, 2);
    }), { from: ['gy'], cond: (d, c) => c.zone === 'gy' && P(d, c.owner).hand.length >= 2 })],
  },
  'Magical Marionette': merge(spellCounterGain(), { statFn: (_d, c) => ({ atk: 200 * ctr(c) }), effects: [ign([run(({ d, card }) => { removeCtr(d, card, 2); }), { op: 'destroy', s: { t: 'target' } }], { label: 'Remove 2 Spell Counters: destroy a monster', targets: [{ f: M }], cond: (_d, c) => ctr(c) >= 2 })] }),
  'Magical Merchant': {
    effects: [flip(run(async ({ d, p }) => {
      const deck = P(d, p).deck;
      for (let i = deck.length - 1; i >= 0; i--) {
        const c = deck[i];
        if (c.def.kind !== 'monster') { await d.toHand(c); return; }
        await d.move(c, 'gy', { by: p, why: 'mill' });
      }
    }, 300))],
  },
  'Magical Plant Mandragola': { effects: [flip(run(({ d }) => { for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) if (c.faceUp && /Spell Counter/.test(c.def.text)) addCtr(d, c, 1); }, 300))] },
  'Magical Reflect Slime': { battleDmg: (d, self, _o, n, to) => { if (to !== self.ctrl) return n; d.deferred.push(() => d.damage(opp(to), n, self, true)); return 0; } },
  'Magical Scientist': {
    effects: [ign(run(async ({ d, p, card }) => {
      const f = await pick(d, p, 'Special Summon a Level 6 or lower Fusion Monster', P(d, p).extra.filter((c) => (c.def.lv ?? 0) <= 6 && d.canSpecial(p, c)), 'good');
      if (!f || !(await d.specialSummon(f, p, await d.askPos(p, f), 'special', false, card))) return;
      f.data.noDirectTurn = d.turn;
      atEndPhase(d, f, (x) => d.move(x, 'extra'));
    }, 600), { label: 'Pay 1000 LP: Special Summon a Fusion Monster', cost: [{ op: 'payLP', n: 1000 }], req: [{ f: { side: 'self', zone: 'extra', maxLv: 6 } }] })],
  },
  "Magician's Valkyria": { lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t !== src && t.ctrl === src.ctrl && t.faceUp && d.raceOf(t) === 'Spellcaster' } },
  'Magna-Slash Dragon': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Send a Continuous Spell: destroy a Spell/Trap', targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, kind: 'spell', stype: 'continuous' } } }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, kind: 'spell', stype: 'continuous' } }] })] },
  'Magnetic Mosquito': { effects: [flip(destroyAll({ ...FU, race: ['Machine'] }))] },
  'Maharaghi': spirit(trig(['normalSummoned', 'flipSummoned'], run(({ d, p }) => {
    d.schedule({ at: 'DP', side: p, fn: async () => {
      const deck = P(d, p).deck;
      const top = deck[deck.length - 2] ?? deck[deck.length - 1];
      if (top) await d.reveal(p, [top], 'Maharaghi');
    } });
  }))),
  'Maiden of the Aqua': {},
  'Majestic Mech - Goryu': { altTributes: [1], rules: ['pierce'], effects: [trig('endPhase', { op: 'toGY', s: { t: 'this' } }, { cond: (d, c) => c.mark.tribCount === 1 && c.data.sumTurn === d.turn && c.data.how === 'normal' })] },
  'Majestic Mech - Ohka': { altTributes: [0], effects: [trig('endPhase', { op: 'toGY', s: { t: 'this' } }, { cond: (d, c) => c.mark.tribCount === 0 && c.data.sumTurn === d.turn && c.data.how === 'normal' })] },
  'Majestic Mech - Senku': {
    effects: [
      trig('battleDamage', { op: 'draw', who: 'self', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl }),
      trig('endPhase', { op: 'toGY', s: { t: 'this' } }, { cond: (d, c) => c.data.sumTurn === d.turn }),
    ],
  },
  'Maji-Gire Panda': { effects: [trig('anyToGY', { op: 'stat', s: { t: 'this' }, atk: 500, perm: true }, { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.from === 'mzone' && ev.card !== c && ev.card.def.race === 'Beast' && ev.card.mark.destroyedTurn === d.turn })] },
  'Maju Garzett': {
    statFn: (d, c) => ({ atk: (c.data.how === 'normal' ? c.mark.garzett ?? 0 : 0) - d.base(c, 'atk') }),
    effects: [trig('normalSummoned', run(({ d, card }) => { card.mark.garzett = tributedAtk(d, card).reduce((s, x) => s + (x.def.atk ?? 0), 0); }))],
  },
  'Makyura the Destructor': { effects: [trig('toGY', run(({ d, card }) => d.addTemp({ until: d.turn, p: card.owner, tag: 'trapFromHand' })), { from: ['gy'] })] },
  // Each copy in the Graveyard mills 1 card during every opponent's Standby Phase.
  'Malice Ascendant': {
    effects: [trig('toGY', run(({ d, card }) => {
      const mv = card.mv, o = opp(card.owner);
      const again = (): void => d.schedule({ at: 'SP', side: o, fn: async () => { if (card.mv !== mv || card.zone !== 'gy') return; await d.mill(o, 1, card.owner); again(); } });
      again();
    }), { from: ['gy'] })],
  },
  'Malice Doll of Demise': {
    effects: [trig('fieldToGY', run(({ d, card }) => { const p = card.owner, mv = card.mv; d.schedule({ at: 'SP', side: p, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); } }); }), {
      from: ['gy'], cond: (d, c) => d.chain.some((l) => l.card.def.kind === 'spell' && l.card.def.stype === 'continuous'),
    })],
  },
  'Man Beast of Ares': afterChain(2, (d, src) => { if (src.zone === 'mzone') d.addMod(src, 500, 0, -1); }),
  "Man-Thro' Tro'": { effects: [ign({ op: 'damage', who: 'opp', n: 800 }, { label: 'Tribute a Normal Monster: 800 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, mtype: ['normal'], fn: (_d, c) => !c.token } } }] })] },
  'Manju of the Ten Thousand Hands': { effects: [trig(['normalSummoned', 'flipSummoned'], search({ fn: (_d, c) => c.def.mtype === 'ritual' || c.def.stype === 'ritual' }), { optional: true })] },
  'Manticore of Darkness': {
    effects: [trig('toGY', run(({ d, card }) => {
      const mv = card.mv, p = card.owner;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => {
        if (card.mv !== mv || card.zone !== 'gy') return;
        const c = await pick(d, p, 'Send a Beast, Beast-Warrior or Winged Beast to revive Manticore', d.find({ side: 'self', zone: ['hand', 'mzone'], kind: 'monster', race: ['Beast', 'Beast-Warrior', 'Winged Beast'] }, p), 'cost', true);
        if (c) { await d.move(c, 'gy', { by: p, why: 'cost' }); if (d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }
      } });
    }), { from: ['gy'] })],
  },
  'Marauding Captain': {
    lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t !== src && t.ctrl === src.ctrl && t.faceUp && d.raceOf(t) === 'Warrior' },
    effects: [trig('normalSummoned', ssFrom(['hand'], { maxLv: 4 }), { optional: true })],
  },
  'Marionette Mite': { effects: [ign({ op: 'control', s: { t: 'target' } }, { from: ['hand'], label: 'Discard: take control of a Fiend or Zombie', targets: [{ f: { ...OPP_FU, race: ['Fiend', 'Zombie'] } }], cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })] })] },
  'Marshmallon': { rules: ['battleImmune'], postBattle: async (d, self, o, r) => { if (o && r.tgt === self && self.mark.lastFaceUp === false) await d.damage(o.ctrl, 1000, self); } },
  'Masked Chopper': { effects: [trig('destroysByBattle', { op: 'damage', who: 'opp', n: 2000 })] },
  'Masked Dragon': { effects: [trig('battleDestroyed', ssFrom(['deck'], { race: ['Dragon'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Master Monk': { noNormal: true, rules: ['doubleAttack'], ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Monk Fighter' } } }], req: [{ f: { ...OWN_M, name: 'Monk Fighter' } }] } },
  'Master of Oz': {},
  'Mataza the Zapper': { rules: ['doubleAttack'], fixedCtrl: true },
  'Maximum Six': { effects: [trig('normalSummoned', run(async ({ d, card }) => { d.addMod(card, 200 * (await d.die()), 0, -1); }), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })] },
  'Mazera DeVille': {
    noNormal: true,
    ssProc: { cond: (d) => d.active('Pandemonium'), cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Warrior of Zera' } } }], req: [{ f: { ...OWN_FU, name: 'Warrior of Zera' } }] },
    effects: [trig('specialSummoned', run(async ({ d, p, o }) => { for (let i = 0; i < 3; i++) { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); } }), { cond: (d, c) => d.active('Pandemonium', c.ctrl) })],
  },
  'Mecha-Dog Marron': {
    effects: [
      trig('battleDestroyed', { op: 'damage', who: 'both', n: 1000 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
      trig('fieldToGY', { op: 'damage', who: 'opp', n: 1000 }, { from: ['gy'], cond: (_d, c) => c.mark.lastWhy !== 'battle' && c.mark.destroyedTurn !== undefined && c.mark.destroyedHow === 'effect' }),
    ],
  },
  'Mechanical Hound': { lock: { activate: (d, src, p, c) => !!src && p !== src.ctrl && c.def.kind === 'spell' && P(d, src.ctrl).hand.length === 0 } },
};

void isAttackOn; void quick; void threat; void won; void OWN_M; void OPP_M; void ST; void banishProc;
