// YGO Online monsters, part 7 (Gravekeeper's Assailant … Invasion of Flames).
import {
  type Attr, type Card, type Def, type Duel, type Side,
  ATTRS, DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, both, ctr, declareAttr, declareName, destroyAll, flip, has, ign, isAttackOn, lvUp, markKill, merge,
  opp, pick, quick, randomOf, removeCtr, run, search, spirit, ssFrom, ssPick, threat, tokenDef, tokens, trig, union, won, atEndPhase,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
const setSelf = (label = 'Flip face-down') => ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label, cond: (d, c) => c.faceUp && (d.phase === 'M1' || d.phase === 'M2') && c.data.sumTurn !== d.turn });
const guardian = (equip: string): Def => ({ summonCond: (d, p) => d.spellTraps(p).some((c) => c.faceUp && c.def.name === equip) });
const noTrapsOnSummon = trig('normalSummoned', run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (dd, _s, _p, c) => c.def.kind === 'trap' && dd.windows.some((w) => w.e === 'summon') } })));
const banishedMonsters = (d: Duel) => [...P(d, 0).banished, ...P(d, 1).banished].filter((c) => c.def.kind === 'monster').length;
const victimGY = (fn: (x: Parameters<typeof run>[0] extends (a: infer A) => unknown ? A : never, o: Card) => unknown) => trig('destroysByBattle', run(async (x) => { const o = x.link.trig?.other; if (o && o.zone === 'gy') await fn(x, o); }));
const goblinDef = (d: Duel, self: Card, r: { att: Card }) => {
  if (r.att !== self) return;
  const mv = self.mv;
  d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (self.mv !== mv || self.zone !== 'mzone') return; await d.changePos(self, 'def'); d.addTemp({ until: d.turn + 2, lock: { pos: (_d, _s, c) => c === self && c.mv === mv } }); } });
};
const archfiendQueen = (hits: number[]): Def['onTargeted'] => async (d, self, link) => {
  if (link.p === self.ctrl || !hits.includes((await d.die()))) return;
  link.negated = true;
  if (link.isCard && d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl);
};
const herald = (kind: 'spell' | 'trap'): Def => ({
  effects: [quick({ op: 'negate' }, {
    from: ['hand'], label: `Send with a Fairy: negate a ${kind === 'spell' ? 'Spell' : 'Trap'}`, ai: 900,
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === kind,
    cost: [run(async ({ d, p, card }) => {
      const f = await pick(d, p, 'Send another Fairy from your hand', P(d, p).hand.filter((c) => c !== card && c.def.kind === 'monster' && c.def.race === 'Fairy'), 'cost');
      await d.move(card, 'gy', { by: p, why: 'cost' });
      if (f) await d.move(f, 'gy', { by: p, why: 'cost' });
    }, 0, (d, p, card) => P(d, p).hand.some((c) => c !== card && c.def.kind === 'monster' && c.def.race === 'Fairy'))],
  })],
});

export const MONSTERS_7: Record<string, Def> = {
  "Gravekeeper's Assailant": { effects: [trig('attacks', { op: 'pos', s: { t: 'target' }, to: 'swap' }, { optional: true, cond: (d) => d.active('Necrovalley'), targets: [{ f: OPP_FU }] })] },
  "Gravekeeper's Cannonholder": { effects: [ign({ op: 'damage', who: 'opp', n: 700 }, { label: "Tribute a Gravekeeper's: 700 damage", cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, set: "Gravekeeper's", fn: (_d, c) => c.def.name !== "Gravekeeper's Cannonholder" } } }] })] },
  "Gravekeeper's Chief": {
    summonCond: (d, p) => !has(d, p, "Gravekeeper's Chief"),
    effects: [trig('normalSummoned', ssFrom(['gy'], { set: "Gravekeeper's" }), { optional: true, cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })],
  },
  "Gravekeeper's Commandant": { effects: [ign(search({ name: 'Necrovalley' }), { from: ['hand'], label: 'Discard: add Necrovalley', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: 'Necrovalley' }) }] })] },
  "Gravekeeper's Curse": { effects: [trig('summoned', { op: 'damage', who: 'opp', n: 500 })] },
  "Gravekeeper's Guard": { effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  "Gravekeeper's Spear Soldier": { rules: ['pierce'] },
  "Gravekeeper's Spy": { effects: [flip(ssFrom(['deck'], { set: "Gravekeeper's", fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }))] },
  "Gravekeeper's Vassal": { battleDmg: (d, self, _o, n, to) => { if (to === self.ctrl) return n; d.deferred.push(() => d.damage(to, n, self, false)); return 0; } },
  "Gravekeeper's Watcher": {
    effects: [quick({ op: 'negate' }, { from: ['hand'], label: 'Send to the Graveyard: negate a discard effect', cost: [run(async ({ d, p, card }) => { await d.move(card, 'gy', { by: p, why: 'cost' }); })], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'discard' && (o.who === 'opp' || o.who === 'both')), ai: 800 })],
  },
  'Gravi-Crush Dragon': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Send a Continuous Spell: destroy a monster', targets: [{ f: OPP_M }], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, kind: 'spell', stype: 'continuous' } } }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, kind: 'spell', stype: 'continuous' } }] })] },
  'Gravitic Orb': { effects: [flip({ op: 'pos', s: { t: 'all', f: OPP_FU }, to: 'swap' })] },
  'Gravity Behemoth': {
    tributes: (d) => (d.turn > 1 && d.fieldCards(0).length + d.fieldCards(1).length === 0 ? 0 : 1),
    effects: [ign([{ op: 'destroy', s: { t: 'target' } }, { op: 'noAttackSelf' }], { label: 'Destroy a Field Spell', targets: [{ f: { side: 'opp', zone: 'fzone' } }] })],
  },
  'Gray Wing': { effects: [ign(run(({ d, card }) => { card.data.extraAtk = d.turn; }, 400), { label: 'Discard: attack twice', cost: [{ op: 'discard', who: 'self', n: 1 }], cond: (d) => d.phase === 'M1', opt: true })] },
  'Great Dezard': {
    onTargeted: async (d, self, link) => { if ((self.data.kills ?? 0) >= 1 && link.isCard && link.card.def.kind !== 'monster') { link.negated = true; link.activationNegated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
    postBattle: (d, self, _o, r) => { if (won(self, r)) self.data.kills = (self.data.kills ?? 0) + 1; },
    effects: [ign(run(async ({ d, p, card }) => {
      await d.move(card, 'gy', { why: 'tribute' });
      await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Fushioh Richie' }, p), 'Special Summon Fushioh Richie', undefined, true, card);
    }, 1500), { label: 'Tribute: Special Summon Fushioh Richie', cond: (d, c) => (c.data.kills ?? 0) >= 2 && (d.phase === 'M1' || d.phase === 'M2') })],
  },
  'Great Long Nose': spirit(trig('battleDamage', run(({ d, o }) => { d.addTemp({ until: d.turn + 1, tag: 'noBP', p: o }); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })),
  'Great Maju Garzett': {
    statFn: (d, c) => ({ atk: (c.data.how === 'normal' ? c.mark.garzett ?? 0 : 0) - d.base(c, 'atk') }),
    effects: [trig('normalSummoned', run(({ d, card }) => { const t = d.allCards().find((x) => (card.mark.tribs ?? []).includes(x.def.name) && x.zone === 'gy' && x.mark.sentTurn === d.turn); card.mark.garzett = 2 * (t?.def.atk ?? 0); }))],
  },
  'Great Phantom Thief': {
    effects: [trig('battleDamage', run(async ({ d, p, o }) => {
      const name = await declareName(d, p, 'Declare a card name', P(d, o).hand);
      await d.reveal(p, P(d, o).hand, "Opponent's hand");
      const hit = P(d, o).hand.filter((c) => c.def.name === name);
      if (hit.length) await d.discard(o, hit, p);
    }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Great Shogun Shien': {
    ssProc: { cond: (d, p) => d.find({ ...OWN_FU, set: 'Six Samurai' }, p).length >= 2 },
    lock: { activate: (d, src, p, c, effect) => !!src && p !== src.ctrl && effect.type === 'activate' && c.def.kind !== 'monster' && (d.flags[`stActivations:${p}:${d.turn}`] ?? 0) > 0 },
    destroySub: async (d, card) => {
      const candidates = d.monsters(card.ctrl).filter((monster) => monster !== card && monster.def.name.includes('Six Samurai'));
      if (!candidates.length || !(await d.confirm(card.ctrl, 'Destroy another Six Samurai instead?', card))) return undefined;
      return pick(d, card.ctrl, 'Choose a Six Samurai to destroy', candidates, 'cost');
    },
  },
  'Great Spirit': {
    effects: [setSelf(), trig('flipSummoned', run(({ d, t }) => { const c = t[0]; if (c) { c.data.swap = d.turn; d.log(`${c.def.name}'s original ATK and DEF are switched.`); } }), { optional: true, targets: [{ f: { ...FU, attr: 'EARTH' } }] })],
  },
  'Greed Quasar': {
    statFn: (d, c) => { const lv = (c.def.lv ?? 7) + (c.data.quasar ?? 0); return { atk: 300 * lv - d.base(c, 'atk'), def: 300 * lv - d.base(c, 'def') }; },
    postBattle: (_d, self, o, r) => { if (o && won(self, r)) self.data.quasar = (self.data.quasar ?? 0) + (o.def.lv ?? 0); },
  },
  'Green Baboon, Defender of the Forest': {
    effects: [trig('anyToGY', run(async ({ d, p, card }) => { if ((card.zone === 'hand' || card.zone === 'gy') && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }), {
      optional: true, from: ['hand', 'gy'], cost: [{ op: 'payLP', n: 1000 }], cond: (d, c, _p, ev) => (c.zone === 'hand' || c.zone === 'gy') && ev?.e === 'sent' && ev.ctrl === c.owner && ev.card !== c && ev.card.def.race === 'Beast' && ev.from === 'mzone' && ev.card.mark.destroyedTurn === d.turn,
    })],
  },
  'Green Gadget': { effects: [trig(['normalSummoned', 'specialSummoned'], search({ name: 'Red Gadget' }), { optional: true })] },
  'Gren Maju Da Eiza': { statFn: (d, c) => { const n = 400 * P(d, c.ctrl).banished.length; return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; } },
  'Gren, Tactician of Dark World': { effects: [trig('effDiscarded', { op: 'destroy', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: ST }] })] },
  'Grinder Golem': {
    noNormal: true,
    effects: [ign(run(async ({ d, p, o, card }) => {
      if (!(await d.specialSummon(card, o, 'atk', 'special', false, card))) return;
      await tokens(d, p, tokenDef('Grinder Token', 'Fiend', 'DARK', 1, 0, 0), 2, 'atk');
      d.players[p].normalDone = true;
    }, -1), { from: ['hand'], label: 'Special Summon to the opponent\'s field', cond: (d, _c, p) => d.freeSlot(opp(p), 'm') >= 0 && d.freeCount(p, 'm') >= 2 && !P(d, p).normalDone })],
  },
  'Guard Dog': { effects: [flip(run(({ d, o }) => d.addTemp({ until: d.turn, p: o, lock: { summon: (_d, _s, q, _c, how) => q === o && how !== 'normal' && how !== 'flip' } }), 200))] },
  'Guardian Angel Joan': { effects: [victimGY(({ d, p }, o) => d.heal(p, o.def.atk ?? 0))] },
  'Guardian Baou': merge(guardian('Wicked-Breaking Flamberge - Baou'), {
    effects: [victimGY(({ d, card }) => { d.addMod(card, 1000, 0, -1); })],
    postBattle: (d, self, o, r) => { if (o && won(self, r)) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } },
  }),
  'Guardian Ceal': merge(guardian('Shooting Star Bow - Ceal'), {
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Send an Equip Card: destroy a monster', targets: [{ f: OPP_M }], cost: [run(async ({ d, p, card }) => { const e = await pick(d, p, 'Send an Equip Card', d.equipsOf(card).filter((x) => x.ctrl === p), 'cost'); if (e) await d.move(e, 'gy', { by: p, why: 'cost' }); }, 0, (d, p, card) => d.equipsOf(card).some((x) => x.ctrl === p))] })],
  }),
  'Guardian Elma': merge(guardian('Butterfly Dagger - Elma'), {
    effects: [trig(['normalSummoned', 'specialSummoned'], run(async ({ d, p, card }) => { const e = await pick(d, p, 'Equip an Equip Spell from your Graveyard', P(d, p).gy.filter((c) => c.def.stype === 'equip' && (!c.def.equip?.f || d.match(card, c.def.equip.f, p, c))), 'good'); if (e) await d.equipCard(e, card, undefined, p); }), { optional: true })],
  }),
  'Guardian Grarl': merge(guardian('Gravity Axe - Grarl'), { ssProc: { cond: (d, p, c) => P(d, p).hand.length === 1 && P(d, p).hand[0] === c && d.spellTraps(p).some((x) => x.faceUp && x.def.name === 'Gravity Axe - Grarl') } }),
  "Guardian Kay'est": merge(guardian("Rod of Silence - Kay'est"), { immune: (_d, _s, src) => src.def.kind === 'spell', lock: { target: (_d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl } }),
  'Guardian Sphinx': { effects: [setSelf(), trig('flipSummoned', { op: 'toHand', s: { t: 'all', f: OPP_M } })] },
  'Guardian Statue': { effects: [setSelf(), trig('flipSummoned', { op: 'toHand', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  'Guardian Tryce': merge(guardian('Twin Swords of Flashing Light - Tryce'), {
    effects: [trig('destroyed', run(async ({ d, card }) => {
      const t = d.allCards().find((x) => (card.mark.tribs ?? []).includes(x.def.name) && x.zone === 'gy' && x.owner === card.owner);
      if (t && d.canSpecial(card.owner, t)) await d.specialSummon(t, card.owner, await d.askPos(card.owner, t));
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && (c.mark.tribs ?? []).length > 0 })],
  }),
  'Gyaku-Gire Panda': { rules: ['pierce'], statFn: (d, c) => ({ atk: 500 * d.monsters(opp(c.ctrl)).length }) },
  'Gyroid': { lock: { indestructible: (d, src, c, by) => { if (!src || c !== src || by !== 'battle' || src.data.gy === d.turn) return false; src.data.gy = d.turn; return true; } } },
  'Hade-Hane': { effects: [flip(run(async ({ d, p }) => { for (const c of await d.select(p, 'Return up to 3 monsters to the hand', both(d), 0, 3, 'bad')) await d.toHand(c); }, 800))] },
  'Hamon, Lord of Striking Thunder': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, kind: 'spell', stype: 'continuous' }, n: 3 } }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, kind: 'spell', stype: 'continuous' }, n: 3 }] },
    effects: [victimGY(({ d, o }) => d.damage(o, 1000))],
    lock: { target: (_d, src, a, t) => !!src && src.pos === 'def' && a.ctrl !== src.ctrl && t !== src },
  },
  'Hand of Nephthys': {
    effects: [ign(ssFrom(['hand', 'deck'], { name: 'Sacred Phoenix of Nephthys' }, { ignore: true }), {
      label: 'Tribute with another monster: Special Summon Sacred Phoenix', cost: [{ op: 'tribute', s: { t: 'this' } }, { op: 'tribute', s: { t: 'choose', f: OWN_M } }],
      req: [{ f: { ...OWN_M, notThis: true } }, { f: { side: 'self', zone: ['hand', 'deck'], name: 'Sacred Phoenix of Nephthys' } }],
    })],
  },
  'Hannibal Necromancer': {
    effects: [
      trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, 1, 'spell', 1); })),
      ign([run(({ d, card }) => { removeCtr(d, card, 1); }), { op: 'destroy', s: { t: 'target' } }], { label: 'Remove a Spell Counter: destroy a face-up Trap', targets: [{ f: { side: 'any', zone: 'szone', faceUp: true, kind: 'trap' } }], cond: (_d, c) => ctr(c) > 0 }),
    ],
  },
  'Harpie Lady 1': { alias: 'Harpie Lady', aura: [{ f: { ...M, attr: 'WIND' }, atk: 300 }] },
  'Harpie Lady 2': { alias: 'Harpie Lady', postBattle: (d, self, o, r) => { if (o && won(self, r) && o.def.effects?.some((e) => e.type === 'flip')) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } } },
  'Harpie Lady 3': { alias: 'Harpie Lady', postBattle: (d, self, o) => { if (o && o.zone === 'mzone') { const mv = o.mv; d.addTemp({ until: d.turn + 4, lock: { attack: (_d, _s, a) => a === o && a.mv === mv } }); } } },
  'Harpie Queen': { alias: 'Harpie Lady', effects: [ign(search({ name: "Harpies' Hunting Ground" }), { from: ['hand'], label: "Discard: add Harpies' Hunting Ground", cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: "Harpies' Hunting Ground" }) }] })] },
  "Harpie's Pet Baby Dragon": {
    lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.ctrl === src.ctrl && t !== src && t.def.name.includes('Harpie') && t.def.name !== "Harpie's Brother" && harpies(d, src) >= 1 },
    statFn: (d, c) => (harpies(d, c) >= 2 ? { atk: d.base(c, 'atk'), def: d.base(c, 'def') } : undefined),
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Destroy a card', targets: [{ f: { side: 'opp' } }], cond: (d, c) => harpies(d, c) >= 3 })],
  },
  'Harvest Angel of Wisdom': { effects: [trig('battleDestroyed', { op: 'toHand', s: { t: 'target' } }, { optional: true, from: ['gy'], targets: [{ f: { side: 'self', zone: 'gy', kind: 'trap', stype: 'counter' }, good: true }], cond: (_d, c) => c.zone === 'gy' })] },
  'Heavy Mech Support Platform': union({ race: ['Machine'] }, 500, 500),
  'Hecatrice': { effects: [ign(search({ name: 'Valhalla, Hall of the Fallen' }), { from: ['hand'], label: 'Discard: add Valhalla', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: 'Valhalla, Hall of the Fallen' }) }] })] },
  'Helios - The Primordial Sun': { statFn: (d, c) => { const n = 100 * banishedMonsters(d); return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; } },
  'Helios Duo Megistus': helios('Helios - The Primordial Sun', 200, 300),
  'Helios Trice Megistus': merge(helios('Helios Duo Megistus', 300, 500), { extraAttacks: (d, c) => (d.monsters(opp(c.ctrl)).length > 0 ? 1 : 0) }),
  'Helping Robo For Combat': { effects: [trig('destroysByBattle', run(async ({ d, p }) => { await d.draw(p, 1); const c = await pick(d, p, 'Return a card to the bottom of your Deck', P(d, p).hand, 'cost'); if (c) await d.move(c, 'deck', { bottom: true }); }))] },
  'Helpoemer': {
    noSpecial: true,
    // While it stays in the Graveyard after being destroyed by battle, the opponent discards at the end of each of their Battle Phases.
    effects: [trig('battleDestroyed', run(({ d, card }) => {
      const mv = card.mv, o = opp(card.owner);
      const again = (): void => d.schedule({ at: 'BPend', side: o, fn: async () => { if (card.mv !== mv || card.zone !== 'gy') return; const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], card.owner); again(); } });
      again();
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Herald of Creation': { effects: [ign({ op: 'toHand', s: { t: 'target' } }, { opt: true, label: 'Discard: add a Level 7+ monster', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { ...GY_M('self'), minLv: 7 }, good: true }] })] },
  'Herald of Green Light': herald('spell'),
  'Herald of Purple Light': herald('trap'),
  'Hero Kid': { effects: [trig('specialSummoned', run(async ({ d, p }) => { for (const c of await d.select(p, 'Special Summon Hero Kids', d.find(DECK({ name: 'Hero Kid' }), p), 0, d.freeCount(p, 'm'), 'good')) await d.specialSummon(c, p, await d.askPos(p, c)); await d.shuffleDeck(p); }), { optional: true })] },
  'Hieracosphinx': { lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.ctrl === src.ctrl && !t.faceUp && t.pos === 'def' } },
  'Hiita the Fire Charmer': { effects: [flip(run(async ({ d, p, card, t }) => { if (t[0]) await d.takeControl(t[0], p, true, card); }, 1000), { targets: [{ f: { ...OPP_FU, attr: 'FIRE' } }] })] },
  'Hino-Kagu-Tsuchi': spirit(trig('battleDamage', run(({ d, o }) => { d.schedule({ at: 'DP', side: o, fn: async () => { if (P(d, o).hand.length) await d.discard(o, [...P(d, o).hand].slice(0, -1), opp(o)); } }); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })),
  'Homunculus the Alchemic Being': {
    attrFn: (_d, src, c) => (c === src ? src.data.attr : undefined),
    effects: [ign(run(async ({ d, p, card }) => { card.data.attr = await declareAttr(d, p, 'Choose an Attribute', both(d)); }, 50), { opt: true, label: 'Change Attribute' })],
  },
  'Honest': {
    effects: [
      ign({ op: 'toHand', s: { t: 'this' } }, { label: 'Return to the hand', ai: -1 }),
      quick(run(({ d, p }) => {
        const b = d.battle;
        if (!b || !b.tgt) return;
        const [mine, foe] = b.att.ctrl === p ? [b.att, b.tgt] : [b.tgt, b.att];
        if (mine.zone === 'mzone') d.addMod(mine, d.atk(foe), 0);
      }, 1500), { from: ['hand'], label: 'Send to the GY: gain the opponent\'s ATK', cost: [run(async ({ d, p, card }) => { await d.move(card, 'gy', { by: p, why: 'cost' }); })],
        when: (d, ev, p) => ev.e === 'attack' && !!ev.target && [ev.attacker, ev.target].some((m) => m && m.ctrl === p && m.faceUp && d.attrOf(m) === 'LIGHT') }),
    ],
  },
  'Horus the Black Flame Dragon LV4': merge(markKill, { fixedCtrl: true, effects: [lvUp('Horus the Black Flame Dragon LV6', 'endBattle')] }),
  'Horus the Black Flame Dragon LV6': merge(markKill, { immune: (_d, _s, src) => src.def.kind === 'spell', effects: [lvUp('Horus the Black Flame Dragon LV8', 'endBattle')] }),
  'Horus the Black Flame Dragon LV8': { noNormal: true, effects: [quick({ op: 'negate' }, { label: 'Negate a Spell', on: ['activateSpell'], ai: 900 })] },
  "Horus' Servant": { protect: (d, src, target, by) => target.ctrl === src.ctrl && target.def.name.startsWith('Horus the Black Flame Dragon') && d.holder(by) !== src.ctrl },
  'Howling Insect': { effects: [trig('battleDestroyed', ssFrom(['deck'], { race: ['Insect'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Hunter Owl': {
    statFn: (d, c) => ({ atk: 500 * d.find({ ...OWN_FU, attr: 'WIND' }, c.ctrl).length }),
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, attr: 'WIND', notThis: true }, src.ctrl, src).length > 0 },
  },
  'Hydrogeddon': { effects: [trig('destroysByBattle', ssFrom(['deck'], { name: 'Hydrogeddon' }), { optional: true })] },
  'Hyena': { effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of d.find(DECK({ name: 'Hyena' }), p)) { if (!d.canSpecial(p, c)) break; await d.specialSummon(c, p, await d.askPos(p, c)); } await d.shuffleDeck(p); }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Hyper Hammerhead': { postBattle: async (_d, self, o) => { const d = _d; if (o && o.zone === 'mzone' && o.ctrl !== self.ctrl) await d.toHand(o); } },
  'Ice Master': {
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'WATER' }, n: 2 } }], req: [{ f: { ...OWN_M, attr: 'WATER' }, n: 2 }] },
    effects: [
      ign(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 1, 'ice'); }, 200), { opt: true, label: 'Place an Ice Counter', targets: [{ f: FU }] }),
      ign(destroyAll({ ...M, fn: (_d, c) => ctr(c, 'ice') > 0 }), { label: 'Tribute: destroy all monsters with Ice Counters', cost: [{ op: 'tribute', s: { t: 'this' } }], req: [{ f: { ...M, fn: (_d, c) => ctr(c, 'ice') > 0 } }] }),
    ],
  },
  'Il Blud': {
    effects: [
      ign(run(async ({ d, p, card }) => { const c = await ssPick(d, p, d.find({ side: 'any', zone: ['hand', 'gy'], kind: 'monster', race: ['Zombie'] }, p).filter((x) => x.zone === 'gy' || x.owner === p), 'Special Summon a Zombie', undefined, false, card); if (c) card.data.blud = [...(card.data.blud ?? []), c.uid]; }, 800), { opt: true, label: 'Special Summon a Zombie' }),
      trig('leftField', run(async ({ d, card }) => { for (const u of card.last.blud ?? []) { const m = d.byUid(u); if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); } })),
    ],
  },
  'Imprisoned Queen Archfiend': {
    upkeep: 1000,
    effects: [trig('standby', run(async ({ d, p }) => { const c = await pick(d, p, 'A Level 4 or lower Fiend gains 1000 ATK', d.find({ ...OWN_FU, race: ['Fiend'], maxLv: 4 }, p), 'good'); if (c) d.addMod(c, 1000, 0); }), {
      from: ['gy'], cond: (d, c) => c.zone === 'gy' && d.active('Pandemonium') && d.find({ ...OWN_FU, race: ['Fiend'], maxLv: 4 }, c.owner).length > 0,
    })],
  },
  'Inaba White Rabbit': spirit(),
  'Indomitable Fighter Lei Lei': { postBattle: (d, self, _o, r) => goblinDef(d, self, r) },
  'Infernal Dragon': {
    effects: [trig('destroyed', run(async ({ d, p, card }) => {
      const t = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost');
      if (!t) return;
      await d.move(t, 'gy', { why: 'tribute' });
      if (card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card));
    }), { optional: true, from: ['gy'], cond: (d, c) => c.zone === 'gy' && d.monsters(c.owner).some((m) => d.tributeOk(m)) })],
    postBattle: (d, self, _o, r) => { if (r.att === self) atEndPhase(d, self, (x) => d.move(x, 'gy', { by: x.ctrl })); },
  },
  'Infernal Flame Emperor': {
    noSpecial: true,
    effects: [trig('normalSummoned', run(async ({ d, p }) => {
      const cs = await d.select(p, 'Banish up to 5 FIRE monsters', d.find({ ...GY_M('self'), attr: 'FIRE' }, p), 0, 5, 'cost');
      for (const c of cs) await d.banish(c, p);
      for (const c of await d.select(p, `Destroy ${cs.length} Spell/Trap Cards`, d.find(ST, p), Math.min(cs.length, d.find(ST, p).length), cs.length, 'bad')) await d.destroy(c, 'effect', undefined, p);
    }), { optional: true, cond: (d, c) => (c.mark.tribCount ?? 0) > 0 && d.find({ ...GY_M('self'), attr: 'FIRE' }, c.ctrl).length > 0 })],
  },
  'Infernal Incinerator': {
    tributes: () => 1,
    tribFilter: (d, t) => (t.faceUp ? d.atk(t) : t.def.atk ?? 0) >= 2000,
    statFn: (d, c) => ({ atk: 200 * d.monsters(opp(c.ctrl)).length - 500 * (d.monsters(c.ctrl).length - 1) }),
    effects: [trig('normalSummoned', run(async ({ d, p }) => { if (P(d, p).hand.length) await d.discard(p, [...P(d, p).hand], null); }))],
  },
  'Infernalqueen Archfiend': {
    upkeep: 500,
    onTargeted: archfiendQueen([2, 5]),
    effects: [trig(['standby', 'oppStandby'], run(async ({ d, p }) => { const c = await pick(d, p, 'An Archfiend gains 1000 ATK', d.find({ ...OWN_FU, set: 'Archfiend' }, p), 'good'); if (c) d.addMod(c, 1000, 0); }), { cond: (d, c) => d.find({ ...OWN_FU, set: 'Archfiend' }, c.ctrl).length > 0 })],
  },
  'Inferno': merge(banishProc(1, { attr: 'FIRE' }), { effects: [victimGY(({ d, o }) => d.damage(o, 1500))] }),
  'Inferno Hammer': { effects: [trig('destroysByBattle', run(async ({ d, t }) => { const c = t[0]; if (c && c.faceUp) { c.pos = 'def'; await d.setFaceDown(c); } }), { optional: true, targets: [{ f: OPP_FU }] })] },
  'Infinity Dark': { effects: [trig('attacks', { op: 'pos', s: { t: 'target' }, to: 'swap' }, { optional: true, targets: [{ f: OPP_FU }] })] },
  'Injection Fairy Lily': {
    effects: [quick(run(({ d, card }) => { d.addMod(card, 3000, 0, d.turn, 'attack'); }, (d, me, card, ev) => (ev.e === 'attack' && d.players[me].lp > 4000 ? 1200 : -1)), {
      label: 'Pay 2000 LP: +3000 ATK', cost: [{ op: 'payLP', n: 2000 }], when: (_d, ev, _p, card) => ev.e === 'attack' && (ev.attacker === card || ev.target === card),
    })],
  },
  'Insect Princess': {
    onSummon: async (d, src, c) => { if (c.ctrl !== src.ctrl && c.faceUp && d.raceOf(c) === 'Insect' && c.pos === 'def') await d.changePos(c, 'atk'); },
    lock: { pos: (d, src, c) => !!src && c.ctrl !== src.ctrl && c.faceUp && d.raceOf(c) === 'Insect' },
    postBattle: (d, self, o, r) => { if (o && won(self, r) && o.def.race === 'Insect') d.addMod(self, 500, 0, -1); },
  },
  'Interplanetary Invader "A"': {
    postBattle: (d, self, o, r) => {
      if (!o || r.tgt !== self || self.pos !== 'atk') return;
      const p = self.ctrl, mv = o.mv;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (o.mv === mv && o.zone === 'mzone') await d.takeControl(o, p, true); } });
    },
  },
  'Invader of Darkness': { lock: { activate: (_d, src, p, c) => !!src && p !== src.ctrl && c.def.kind === 'spell' && c.def.stype === 'quick' } },
  'Invasion of Flames': { effects: [noTrapsOnSummon] },
};

function harpies(d: Duel, c: Card) { return d.find({ ...OWN_FU, fn: (_d, x) => x.def.name.includes('Harpie') && x !== c && x.def.name !== "Harpie's Brother" }, c.ctrl).length; }
function helios(prev: string, mult: number, bonus: number): Def {
  return {
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: prev } } }], req: [{ f: { ...OWN_FU, name: prev } }] },
    statFn: (d, c) => { const n = mult * banishedMonsters(d) + (c.mark.heliosBonus ?? 0); return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
    effects: [trig('battleDestroyed', run(({ d, card }) => {
      const mv = card.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(card.owner, card)) { card.mark.heliosBonus = (card.mark.heliosBonus ?? 0) + bonus; card.properly = true; await d.specialSummon(card, card.owner, 'atk'); } } });
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  };
}
void ATTRS; void attackOf; void isAttackOn; void threat; void randomOf; void OWN_M; void ([] as Attr[]);
