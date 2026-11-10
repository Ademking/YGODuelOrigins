// YGO Online Spells, part 1 ("A" Cell … Crystal Tree). Behaviour reference: Fluorohydride/ygopro-scripts (c<passcode>.lua).
import {
  type Card, type Def, type Duel, type Side,
  CHRYSALIS, DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, SET, ST,
  act, addCtr, addFrom, atEndPhase, both, condSpell, count, crystalInST, ctr, declareAttr, declareName, declareRace,
  destroyAll, destroyAtEnd, grantRule, has, hasSet, ign, inSet, isAlien, killEquippedOnLeave, opp, passive, pick, pickSeen,
  placeA, placeAsSpell, quick, removeA, ritual, run, scoreWipe, search, spell, ssFrom, ssPick, trig, typeEquip,
} from './olib';

const destroyedThisTurn = (d: Duel, c: Card) => c.zone === 'gy' && c.mark.destroyedTurn === d.turn;
const equipped = (d: Duel, card: Card) => d.equippedTo(card);
const chrysalisTarget = (c: Card) => CHRYSALIS[c.def.name];

export const SPELLS_1: Record<string, Def> = {
  '"A" Cell Breeding Device': passive({ effects: [trig('standby', run(({ d, p }) => placeA(d, p, 1)), { cond: (d, c) => d.onField(c) && d.find(OPP_FU, c.ctrl).length > 0 })] }),
  '"A" Cell Incubator': passive({
    lock: {},
    effects: [trig('destroyed', run(({ d, p, card }) => placeA(d, p, card.last.ctr?.A ?? 0, FU)), { cond: (_d, c) => (c.last.ctr?.A ?? 0) > 0 })],
  }),
  '"A" Cell Scatter Burst': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    const lv = d.lvOf(c);
    if (await d.destroy(c, 'effect', undefined, p)) await placeA(d, p, lv);
  }, 300), { targets: [{ f: { ...OWN_FU, fn: (_d, c) => isAlien(c) } }] }),
  '7': passive({
    onResolve: async (d, src) => {
      if (!d.onField(src)) return;
      const sevens = d.spellTraps(src.ctrl).filter((c) => c.faceUp && c.def.name === '7');
      if (sevens.length < 3) return;
      await d.draw(src.ctrl, 3);
      for (const c of sevens) await d.destroy(c, 'effect', undefined, src.ctrl);
    },
    effects: [trig('fieldToGY', run(({ d, card }) => d.heal(card.owner, 700)), { from: ['gy'] })],
  }),
  'A Deal with Dark Ruler': spell(ssFrom(['hand', 'deck'], { name: 'Berserk Dragon' }, { ignore: true }), {
    cond: (d, _c, p) => d.players[p].gy.some((m) => m.def.kind === 'monster' && (m.def.lv ?? 0) >= 8 && m.mark.sentTurn === d.turn && m.mark.lastFaceUp !== undefined),
  }),
  'A Feather of the Phoenix': spell(run(async ({ d, t }) => {
    const c = t[0];
    if (c && c.zone === 'gy') { await d.move(c, 'deck'); d.log(`${c.def.name} is placed on top of the Deck.`); }
  }, 500), { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'self', zone: 'gy' }, good: true }] }),
  'A Legendary Ocean': {
    alias: 'Umi',
    aura: [{ f: { ...M, attr: 'WATER' }, atk: 200, def: 200 }],
    lvFn: (d, _s, c) => (c.def.attr === 'WATER' && d.attrOf(c) === 'WATER' ? -1 : 0),
  },
  'A Wingbeat of Giant Dragon': spell([
    { op: 'toHand', s: { t: 'choose', f: { ...OWN_FU, race: ['Dragon'], minLv: 5 } } },
    destroyAll(ST),
  ], { req: [{ f: { ...OWN_FU, race: ['Dragon'], minLv: 5 } }], ai: (d, me) => d.spellTraps(opp(me)).length * 500 - d.spellTraps(me).length * 400 }),
  'Abyssal Designator': spell(run(async ({ d, p, o }) => {
    const pool = [...d.players[o].hand, ...d.players[o].deck];
    const race = await declareRace(d, p, 'Declare a Type', pool);
    const attr = await declareAttr(d, p, 'Declare an Attribute', pool.filter((c) => c.def.race === race));
    const c = await pick(d, o, `Send a ${attr} ${race} monster to the Graveyard`, pool.filter((c) => c.def.kind === 'monster' && c.def.race === race && c.def.attr === attr), 'cost');
    if (c) { const fromDeck = c.zone === 'deck'; await d.move(c, 'gy', { by: p }); if (fromDeck) await d.shuffleDeck(o); } else d.log('No such monster.');
  }, 300), { cost: [{ op: 'payLP', n: 1000 }] }),
  'Acidic Downpour': { aura: [{ f: { ...M, attr: 'EARTH' }, atk: -500, def: 400 }] },
  'Advanced Ritual Art': spell(run(async ({ d, p, card }) => {
    const normals = d.players[p].deck.filter((c) => c.def.kind === 'monster' && c.def.mtype === 'normal');
    const reach = (lv: number) => { const s = new Set([0]); for (const c of normals) for (const v of [...s]) s.add(v + (c.def.lv ?? 0)); return s.has(lv); };
    const rituals = d.players[p].hand.filter((c) => c.def.mtype === 'ritual' && reach(c.def.lv ?? 0) && d.canSpecial(p, c));
    const rm = await pick(d, p, 'Select a Ritual Monster', rituals, 'good');
    if (!rm) return;
    const lv = rm.def.lv ?? 0;
    const mats = await d.select(p, `Send Normal Monsters with total Levels ${lv}`, normals, 1, normals.length, 'cost', (cs) => cs.reduce((s, c) => s + (c.def.lv ?? 0), 0) === lv);
    for (const m of mats) await d.move(m, 'gy', { why: 'ritual' });
    await d.shuffleDeck(p);
    await d.emit({ t: 'ritual', card: rm });
    await d.specialSummon(rm, p, await d.askPos(p, rm), 'ritual', false, card);
  }, 1500, (d, p) => {
    const normals = d.players[p].deck.filter((c) => c.def.kind === 'monster' && c.def.mtype === 'normal');
    const s = new Set([0]); for (const c of normals) for (const v of [...s]) s.add(v + (c.def.lv ?? 0));
    return d.players[p].hand.some((c) => c.def.mtype === 'ritual' && s.has(c.def.lv ?? 0)) && d.canSpecial(p);
  })),
  'After the Struggle': spell(run(({ d, p }) => {
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { for (const m of both(d)) if (m.data.battled === d.turn) await d.destroy(m, 'effect', undefined, p); } });
  }, 200), { cond: (d) => d.phase === 'M1' }),
  'Allure of Darkness': spell(run(async ({ d, p }) => {
    await d.draw(p, 2);
    const dark = d.players[p].hand.filter((c) => c.def.kind === 'monster' && c.def.attr === 'DARK');
    const c = await pick(d, p, 'Banish 1 DARK monster from your hand', dark, 'cost');
    if (c) await d.banish(c, p);
    else for (const h of [...d.players[p].hand]) await d.move(h, 'gy', { by: p });
  }, (d, me) => (d.players[me].hand.some((c) => c.def.attr === 'DARK' && c.def.kind === 'monster') ? 900 : -1), (d, p) => d.players[p].deck.length >= 2)),
  'Amazoness Spellcaster': spell(run(({ d, link }) => {
    const a = link.targets[0]?.[0], b = link.targets[1]?.[0];
    if (!a || !b || a.zone !== 'mzone' || b.zone !== 'mzone' || a.mv !== link.tmv[0][0] || b.mv !== link.tmv[1][0]) return;
    const x = d.base(a, 'atk'), y = d.base(b, 'atk');
    d.addMod(a, y - x, 0);
    d.addMod(b, x - y, 0);
    d.log(`${a.def.name} and ${b.def.name} switch their original ATK.`);
  }, 800), { targets: [{ f: { ...OWN_FU, fn: (_d, c) => c.def.name.includes('Amazoness') || c.def.name === 'Amazon Archer' }, good: true }, { f: OPP_FU }] }),
  'Amplifier': { noNegate: true, equip: { f: { ...FU, name: 'Jinzo' } }, effects: [killEquippedOnLeave] },
  'Amulet of Ambition': {
    equip: {
      f: { ...FU, mtype: ['normal'] },
      fn: (d, _e, m) => {
        const o = d.battle && (d.battle.att === m ? d.battle.tgt : d.battle.tgt === m ? d.battle.att : null);
        return o && d.lvOf(o) > d.lvOf(m) ? { atk: 500 * (d.lvOf(o) - d.lvOf(m)) } : undefined;
      },
    },
    effects: [trig('fieldToGY', run(async ({ d, card }) => { if (card.zone === 'gy') { await d.move(card, 'deck'); d.log(`${card.def.name} is returned to the top of the Deck.`); } }), { optional: true, from: ['gy'] })],
  },
  'Ancient City - Rainbow Ruins': {
    lock: {
      indestructible: (d, src, c, by) => !!src && c === src && by === 'effect' && crystalInST(d, src.ctrl) >= 1,
    },
    effects: [
      quick(run(async ({ d, p, link }) => {
        const cb = await pick(d, p, 'Send a Crystal Beast to the Graveyard', d.find({ ...OWN_FU, set: 'Crystal Beast' }, p), 'cost');
        if (!cb) return;
        await d.move(cb, 'gy', { by: p });
        const ev = link.ev;
        if (ev.e === 'chain') { ev.link.negated = true; ev.link.activationNegated = true; if (d.onField(ev.link.card)) await d.destroy(ev.link.card, 'effect', undefined, p); }
      }, 800), { label: 'Negate a Spell/Trap', when: (d, ev, p) => ev.e === 'chain' && ev.link.isCard && ev.link.card.def.kind !== 'monster' && ev.link.p !== p, cond: (d, c) => crystalInST(d, c.ctrl) >= 3 && d.find({ ...OWN_FU, set: 'Crystal Beast' }, c.ctrl).length > 0 }),
      ign({ op: 'draw', who: 'self', n: 1 }, { label: 'Draw 1 card', opt: true, cond: (d, c) => crystalInST(d, c.ctrl) >= 4 }),
      ign(run(async ({ d, p }) => { await ssPick(d, p, d.players[p].s.filter((c): c is Card => !!c && c.faceUp && c.def.name.includes('Crystal Beast')), 'Special Summon a Crystal Beast', undefined, true); }, 700), {
        label: 'Special Summon a Crystal Beast', opt: true, cond: (d, c) => crystalInST(d, c.ctrl) >= 5 && d.freeSlot(c.ctrl, 'm') >= 0,
      }),
    ],
  },
  'Ancient Gear Castle': passive({
    aura: [{ f: { ...M, set: 'Ancient Gear' }, atk: 300 }],
    onSummon: (d, src, _c, how) => { if (how === 'normal') addCtr(d, src, 1, 'gear'); },
    onMonsterSet: (d, src) => { addCtr(d, src, 1, 'gear'); },
    tributeSubstitute: (_d, src, monster, required) => monster.def.name.includes('Ancient Gear') && ctr(src, 'gear') >= required,
  }),
  'Ancient Gear Drill': spell(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Set a Spell Card from your Deck', d.find(DECK({ kind: 'spell', fn: (_d, x) => x.def.stype !== 'field' }), p), 'good');
    if (!c || d.freeSlot(p, 's') < 0) return;
    await d.setST(c, p);
    await d.shuffleDeck(p);
    const mv = c.mv;
    d.addTemp({ until: d.turn, lock: { activate: (_d, _s, _p, x) => x === c && x.mv === mv } });
  }, 500), { cond: (d, _c, p) => hasSet(d, p, 'Ancient Gear'), cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  'Ancient Gear Explosive': spell(run(async ({ d, p, o, t }) => {
    const c = t[0];
    if (c && c.zone === 'mzone' && (await d.destroy(c, 'effect', undefined, p))) await d.damage(o, Math.floor((c.def.atk ?? 0) / 2));
  }, (d, me) => Math.max(-1, ...d.find({ ...OWN_FU, set: 'Ancient Gear' }, me).map((c) => (c.def.atk ?? 0) / 2 - 800))), { targets: [{ f: { ...OWN_FU, set: 'Ancient Gear' } }] }),
  'Ancient Gear Factory': spell(run(async ({ d, p }) => {
    const gy = () => d.players[p].gy.filter((c) => c.def.name.includes('Ancient Gear') && !d.banishLocked(p, c));
    const reach = (n: number) => { const s = new Set([0]); for (const c of gy()) for (const v of [...s]) s.add(v + (c.def.lv ?? 0)); return s.has(n); };
    const m = await pick(d, p, 'Reveal an Ancient Gear monster', d.players[p].hand.filter((c) => c.def.kind === 'monster' && c.def.name.includes('Ancient Gear') && reach(2 * (c.def.lv ?? 0))), 'good');
    if (!m) return;
    await d.reveal(opp(p), [m], 'Ancient Gear Factory');
    const lv = 2 * (m.def.lv ?? 0);
    const cs = await d.select(p, `Banish Ancient Gear cards with total Levels ${lv}`, gy(), 1, gy().length, 'cost', (x) => x.reduce((s, c) => s + (c.def.lv ?? 0), 0) === lv);
    for (const c of cs) await d.banish(c, p);
    m.mark.freeSummonTurn = d.turn;
  }, 600)),
  'Ancient Gear Fist': {
    equip: { f: { ...FU, set: 'Ancient Gear' } },
    postBattle: async (d, self, other) => { if (other && other.zone === 'mzone') await d.destroy(other, 'effect', undefined, self.ctrl); },
  },
  'Ancient Gear Tank': {
    equip: { f: { ...FU, set: 'Ancient Gear' }, atk: 600 },
    effects: [trig('destroyed', { op: 'damage', who: 'opp', n: 600 }, { from: ['gy'], cond: (d, c) => c.zone === 'gy' })],
  },
  'Ancient Gear Workshop': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), set: 'Ancient Gear' }, good: true }] }),
  'Ancient Rules': spell(ssFrom(['hand'], { mtype: ['normal'], minLv: 5 })),
  'Ante': spell(run(async ({ d, p, o }) => {
    const lvOf = (c?: Card) => (c && c.def.kind === 'monster' ? c.def.lv ?? 0 : 0);
    const a = await pick(d, p, 'Ante: select a card from your hand', d.players[p].hand, 'cost');
    const b = await pick(d, o, 'Ante: select a card from your hand', d.players[o].hand, 'cost');
    if (a) await d.reveal(o, [a], 'Ante');
    if (b) await d.reveal(p, [b], 'Ante');
    const la = lvOf(a), lb = lvOf(b);
    if (la === lb) { d.log('Ante: same Level.'); return; }
    const [loser, lc] = la < lb ? [p, a] : [o, b];
    await d.damage(loser, 1000);
    if (lc) await d.move(lc, 'gy', { by: p });
  }, (d, me) => (Math.max(0, ...d.players[me].hand.map((c) => c.def.lv ?? 0)) >= 6 ? 400 : -1), (d, p) => d.players[p].hand.length > 1)),
  "Archfiend's Oath": passive({
    effects: [ign(run(async ({ d, p }) => {
      const deck = d.players[p].deck;
      const name = await declareName(d, p, 'Declare a card name', deck.slice(-1), (c) => c.owner === p);
      const top = deck[deck.length - 1];
      if (!top) return;
      await d.reveal(opp(p), [top], "Archfiend's Oath");
      if (top.def.name === name) await d.toHand(top);
      else await d.move(top, 'gy', { by: p });
    }, 200), { label: 'Pay 500 LP: declare a card name', opt: true, cost: [{ op: 'payLP', n: 500 }] })],
  }),
  'Armed Changer': {
    equip: { f: FU },
    postBattle: async (d, self, _o, r) => {
      const won = (r.att === self && r.killedT) || (r.tgt === self && r.killedA);
      if (!won || self.zone !== 'mzone') return;
      const eq = d.equipsOf(self).find((e) => e.def.name === 'Armed Changer');
      if (!eq) return;
      const cs = d.players[eq.ctrl].gy.filter((c) => c.def.kind === 'monster' && (c.def.atk ?? 0) <= d.atk(self));
      const c = await pick(d, eq.ctrl, 'Armed Changer: add a monster to your hand', cs, 'good', true);
      if (c) await d.toHand(c);
    },
    effects: [act({ ops: [], targets: [{ f: FU, good: true }], cost: [run(async ({ d, p, card }) => {
      const c = await pick(d, p, 'Send an Equip Spell to the Graveyard', d.players[p].hand.filter((x) => x !== card && x.def.stype === 'equip'), 'cost');
      if (c) await d.move(c, 'gy', { by: p });
    }, 0, (d, p, card) => d.players[p].hand.some((x) => x !== card && x.def.stype === 'equip'))] })],
  },
  'Arms Hole': spell([addFrom(['deck', 'gy'], { stype: 'equip' }), run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { summon: (_d, _s, q, _c, how) => q === p && how === 'normal', set: (_d, _s, q, c) => q === p && c.def.kind === 'monster' } }))], {
    cost: [{ op: 'mill', who: 'self', n: 1 }], cond: (d, _c, p) => !d.players[p].normalDone,
  }),
  'Array of Revealing Light': passive({
    lock: { attack: (d, src, a) => !!src && d.raceOf(a) === src.data.race && a.data.sumTurn === d.turn },
  }, { ops: [run(async ({ d, p, o, card }) => { card.data.race = await declareRace(d, p, 'Declare a Type', d.players[o].hand.concat(d.players[o].deck)); d.log(`Declared: ${card.data.race}.`); })] }),
  'Assault Armor': {
    equip: { f: { ...OWN_FU, race: ['Warrior'], fn: (d, c) => d.monsters(c.ctrl).length === 1 }, atk: 300 },
    effects: [ign(run(async ({ d, card }) => {
      const m = equipped(d, card);
      await d.move(card, 'gy', { why: 'cost' });
      if (m && m.zone === 'mzone') { m.data.extraAtk = d.turn; d.log(`${m.def.name} can attack twice this turn.`); }
    }, (d) => (d.phase === 'M1' ? 400 : -1)), { label: 'Send to the GY: attack twice', cond: (d, c) => !!equipped(d, c) })],
  },
  'Autonomous Action Unit': spell(run(async ({ d, p, card, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'gy' || !d.canSpecial(p, m)) return;
    if (await d.specialSummon(m, p, 'atk', 'special', false, card)) { await d.equipCard(card, m, {}, p); card.data.keep = true; }
  }, (d, me) => Math.max(-1, ...d.players[opp(me)].gy.filter((c) => d.revivable(c)).map((c) => (c.def.atk ?? 0) - 1500))), {
    cost: [{ op: 'payLP', n: 1500 }], targets: [{ f: GY_M('opp'), good: true }],
  }),
  'Back to Square One': spell(run(async ({ d, t }) => { const c = t[0]; if (c && c.zone === 'mzone') { await d.move(c, 'deck'); d.log(`${c.def.name} is placed on top of the Deck.`); } }, 600), {
    cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: M }],
  }),
  'Ballista of Rampart Smashing': {
    equip: { f: FU },
    preBattle: (d, self, other) => { if (d.battle?.att === self && other && !other.faceUp && other.pos === 'def') { d.addMod(self, 1500, 0, d.turn, 'attack'); d.log(`${self.def.name} gains 1500 ATK.`); } },
  },
  'Banner of Courage': passive({ auraFn: (d, src, c) => (d.phase === 'BP' && d.tp === src.ctrl && c.ctrl === src.ctrl ? { atk: 200 } : undefined) }),
  'Battery Charger': spell(ssFrom(['gy'], { set: 'Batteryman' }), { cost: [{ op: 'payLP', n: 500 }] }),
  'Big Bang Shot': {
    equip: { f: FU, atk: 400, rules: ['pierce'] },
    effects: [trig('leftField', run(async ({ d, card }) => {
      const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined;
      if (m && m.zone === 'mzone') await d.banish(m, card.owner);
    }))],
  },
  'Big Evolution Pill': {
    stays: true, lifetime: 3,
    lock: { noTributes: (d, src, p, c) => !!src && src.ctrl === p && c.def.race === 'Dinosaur' },
    effects: [act({ ops: [], cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Dinosaur'] } } }] })],
  },
  'Big Wave Small Wave': spell(run(async ({ d, p }) => {
    let n = 0;
    for (const m of d.find({ ...OWN_FU, attr: 'WATER' }, p)) if (await d.destroy(m, 'effect', undefined, p)) n++;
    for (let i = 0; i < n; i++) {
      const c = await pick(d, p, 'Special Summon a WATER monster from your hand', d.players[p].hand.filter((x) => x.def.kind === 'monster' && x.def.attr === 'WATER' && d.canSpecial(p, x)), 'good', true);
      if (!c) break;
      await d.specialSummon(c, p, await d.askPos(p, c));
    }
  }, 200), { req: [{ f: { ...OWN_FU, attr: 'WATER' } }] }),
  'Black Magic Ritual': ritual('Magician of Black Chaos'),
  'Blaze Accelerator': passive({
    effects: [ign(run(async ({ d, p, t }) => {
      const c = t[0];
      if (c && c.zone === 'mzone') await d.destroy(c, 'effect', undefined, p);
      d.players[p].noAttackTurn = d.turn;
    }, 700), {
      label: 'Send a Pyro: destroy a monster', targets: [{ f: OPP_M }],
      cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Pyro'], maxAtk: 500 } } }],
      req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Pyro'], maxAtk: 500 } }],
    })],
  }),
  'Blessings of the Nile': passive({
    effects: [trig('anyDiscard', run(({ d, card }) => d.heal(card.ctrl, 1000)), { cond: (_d, c, _p, ev) => ev?.e === 'discard' && ev.player === c.ctrl && ev.by === opp(c.ctrl) })],
  }),
  'Bonding - H2O': spell(run(async ({ d, p }) => {
    for (const [name, n] of [['Hydrogeddon', 2], ['Oxygeddon', 1]] as const) {
      const cs = await d.select(p, `Tribute ${n} "${name}"`, d.find({ ...OWN_M, name }, p).filter((c) => d.tributeOk(c)), n, n, 'cost');
      for (const c of cs) await d.move(c, 'gy', { why: 'tribute' });
    }
    await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck', 'gy'], name: 'Water Dragon' }, p), 'Special Summon Water Dragon', undefined, true);
  }, 2000), { req: [{ f: { ...OWN_M, name: 'Hydrogeddon' }, n: 2 }, { f: { ...OWN_M, name: 'Oxygeddon' } }, { f: { side: 'self', zone: ['hand', 'deck', 'gy'], name: 'Water Dragon' } }] }),
  'Book of Life': spell(run(async ({ d, p, card, link }) => {
    const z = link.targets[0]?.[0], b = link.targets[1]?.[0];
    if (z && z.mv === link.tmv[0][0] && z.zone === 'gy') await d.specialSummon(z, p, await d.askPos(p, z), 'special', false, card);
    if (b && b.mv === link.tmv[1][0] && b.zone === 'gy') await d.banish(b, p);
  }, 900), { targets: [{ f: { ...GY_M('self'), race: ['Zombie'] }, good: true }, { f: GY_M('opp') }] }),
  'Book of Moon': spell(run(async ({ d, t }) => { const c = t[0]; if (c && c.zone === 'mzone' && c.faceUp) { c.pos = 'def'; await d.setFaceDown(c); d.log(`${c.def.name} is flipped face-down.`); } }, 600), { targets: [{ f: FU }] }),
  'Book of Taiyou': spell({ op: 'pos', s: { t: 'target' }, to: 'atk' }, { targets: [{ f: { ...M, faceUp: false } }] }),
  'Boss Rush': passive({
    lock: { summon: (_d, src, p, _c, how) => !!src && src.ctrl === p && how === 'normal', set: (_d, src, p, c) => !!src && src.ctrl === p && c.def.kind === 'monster' },
    effects: [trig('endPhase', ssFrom(['deck'], { fn: (_d, c) => c.def.name.includes('B.E.S.') || c.def.name === 'Big Core' }), {
      optional: true, cond: (d, c) => d.players[c.ctrl].gy.some((m) => (m.def.name.includes('B.E.S.') || m.def.name === 'Big Core') && destroyedThisTurn(d, m)),
    })],
  }),
  'Brain Control': spell({ op: 'control', s: { t: 'target' } }, { cost: [{ op: 'payLP', n: 800 }], targets: [{ f: OPP_FU }] }),
  'Branch!': passive({
    effects: [trig('anyToGY', run(async ({ d, p, link }) => {
      const f = link.trig?.other;
      if (!f) return;
      await ssPick(d, p, d.players[p].gy.filter((c) => c.mark.fusionMatFor === f.def.id && c.def.kind === 'monster'), 'Special Summon a Fusion Material');
    }, 500), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.card.def.mtype === 'fusion' && ev.why === 'effect' || ev?.e === 'sent' && ev.card.def.mtype === 'fusion' && ev.why === 'battle' })],
  }),
  'Broken Bamboo Sword': { equip: { f: FU, atk: 0 } },
  'Bubble Blaster': {
    equip: { f: { ...FU, name: 'Elemental Hero Bubbleman' }, atk: 800, sub: 'battle' },
    battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n),
  },
  'Bubble Illusion': spell(run(({ d, p }) => d.addTemp({ until: d.turn, p, tag: 'trapFromHand' }), 200), { cond: (d, _c, p) => has(d, p, 'Elemental Hero Bubbleman') }),
  'Bubble Shuffle': spell(run(async ({ d, p, o, card }) => {
    const b = await pick(d, p, 'Select your Bubbleman', d.find({ ...OWN_FU, name: 'Elemental Hero Bubbleman', pos: 'atk' }, p), 'cost');
    const x = await pick(d, p, "Select an opponent's monster", d.find({ ...OPP_FU, pos: 'atk' }, p), 'bad');
    if (!b || !x) return;
    await d.changePos(b, 'def');
    await d.changePos(x, 'def');
    if (d.tributeOk(b)) { await d.move(b, 'gy', { why: 'tribute' }); await ssPick(d, p, d.find({ side: 'self', zone: 'hand', set: 'Elemental Hero' }, p), 'Special Summon an Elemental Hero', undefined, false, card); }
    void o;
  }, 600), { req: [{ f: { ...OWN_FU, name: 'Elemental Hero Bubbleman', pos: 'atk' } }, { f: { ...OPP_FU, pos: 'atk' } }] }),
  'Burden of the Mighty': passive({ auraFn: (d, src, c) => (c.ctrl !== src.ctrl ? { atk: -100 * d.lvOf(c) } : undefined) }),
  'Burial from a Different Dimension': spell(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Return up to 3 banished monsters to the Graveyard', d.find({ side: 'any', zone: 'banished', kind: 'monster' }, p), 0, 3, 'good');
    for (const c of cs) await d.move(c, 'gy', { by: p });
  }, 200), { req: [{ f: { side: 'any', zone: 'banished', kind: 'monster' } }] }),
  'Burst Return': condSpell((d, p) => has(d, p, 'Elemental Hero Burstinatrix'), { op: 'toHand', s: { t: 'all', f: { ...FU, set: 'Elemental Hero', fn: (_d, c) => c.def.name !== 'Elemental Hero Burstinatrix' } } }, {
    ai: (d, me) => scoreWipe(d, me, (c) => c.def.name.includes('Elemental Hero') && c.def.name !== 'Elemental Hero Burstinatrix'),
  }),
  'Burst Stream of Destruction': condSpell((d, p) => has(d, p, 'Blue-Eyes White Dragon'), [destroyAll(OPP_M), run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { attack: (dd, _s, a) => a.ctrl === p && dd.nameOf(a) === 'Blue-Eyes White Dragon' } }))], {
    ai: (d, me) => d.monsters(opp(me)).reduce((s, c) => s + (c.def.atk ?? 0), 0) - 500,
  }),
  'Buster Rancher': {
    equip: {
      f: { ...FU, maxAtk: 1000 },
      fn: (d, _e, m) => {
        const o = d.battle && (d.battle.att === m ? d.battle.tgt : d.battle.tgt === m ? d.battle.att : null);
        if (!o) return undefined;
        return (o.pos === 'atk' ? d.atk(o) : d.defv(o)) >= 2500 ? { atk: 2500 } : undefined;
      },
    },
  },
  'Butterfly Dagger - Elma': {
    equip: { f: FU, atk: 300 },
    effects: [trig('destroyed', { op: 'toHand', s: { t: 'this' } }, { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.last.eqTo !== undefined })],
  },
  'Call of the Mummy': passive({
    effects: [ign(ssFrom(['hand'], { race: ['Zombie'] }), { label: 'Special Summon a Zombie', opt: true, cond: (d, c) => d.monsters(c.ctrl).length === 0 })],
  }),
  'Canyon': {
    lock: { battleDmg: (d, _src, att, tgt, n, to) => (tgt && tgt.pos === 'def' && d.raceOf(tgt) === 'Rock' && to === att.ctrl ? n * 2 : n) },
  },
  'Card of Sanctity': spell(run(async ({ d, p, card }) => {
    for (const c of [...d.players[p].hand, ...d.fieldCards(p)]) if (c !== card) await d.banish(c, p);
    const n = 2 - d.players[p].hand.length;
    if (n > 0) await d.draw(p, n);
  }, (d, me) => (d.players[me].hand.length <= 1 && d.fieldCards(me).length <= 1 ? 600 : -1))),
  'Card Shuffle': passive({
    effects: [ign(run(async ({ d, p }) => { const s = (await d.option(p, 'Shuffle which Deck?', ['Your Deck', "Opponent's Deck"])) as 0 | 1; await d.shuffleDeck(s ? opp(p) : p); }, -1), {
      label: 'Pay 300 LP: shuffle a Deck', opt: true, cost: [{ op: 'payLP', n: 300 }],
    })],
  }),
  'Card Trader': passive({
    effects: [trig('standby', run(async ({ d, p }) => {
      const c = await pick(d, p, 'Shuffle a card into your Deck', d.players[p].hand, 'cost');
      if (!c) return;
      await d.move(c, 'deck');
      await d.shuffleDeck(p);
      await d.draw(p, 1);
    }, 100), { optional: true, cond: (d, c) => d.onField(c) && d.players[c.ctrl].hand.length > 0 })],
  }),
  'Cathedral of Nobles': passive({
    lock: { trapSameTurn: (_d, src, p) => !!src && src.ctrl === p },
    effects: [ign(run(async ({ d, p, card }) => {
      const serket = d.find({ ...OWN_FU, name: 'Mystical Beast Serket' }, p)[0];
      if (!serket) return;
      await d.move(serket, 'gy', { why: 'cost' });
      await d.move(card, 'gy', { why: 'cost' });
      await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck', 'extra'], kind: 'monster' }, p), 'Special Summon a monster', undefined, true);
    }, 1500), { label: 'Send with Serket: Special Summon', req: [{ f: { ...OWN_FU, name: 'Mystical Beast Serket' } }] })],
  }),
  'Celestial Transformation': spell(run(async ({ d, p, card }) => {
    const c = await ssPick(d, p, d.players[p].hand.filter((x) => d.raceOf(x) === 'Fairy' || x.def.race === 'Fairy'), 'Special Summon a Fairy', undefined, false, card);
    if (!c) return;
    d.addMod(c, -Math.floor(d.atk(c) / 2), 0, -1);
    destroyAtEnd(d, c, p);
  }, 300), { req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Fairy'] } }] }),
  'Centrifugal Field': {
    effects: [trig('anyToGY', run(async ({ d, p, link }) => {
      const f = link.trig?.other;
      const mats = (f?.def.mats ?? []).map((m) => (typeof m === 'string' ? m : m.name)).filter(Boolean) as string[];
      await ssPick(d, p, d.players[p].gy.filter((c) => mats.includes(c.def.id) || mats.includes(c.def.name)), 'Special Summon a Fusion Material');
    }, 500), { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.card.def.mtype === 'fusion' && ev.why === 'effect' })],
  },
  'Cestus of Dagla': {
    equip: { f: { ...FU, race: ['Fairy'] }, atk: 500 },
    postBattle: async (d, self, _o, r) => { if (r.dmg > 0 && r.dmgTo === opp(self.ctrl)) await d.heal(self.ctrl, r.dmg); },
  },
  'Chain Strike': spell(run(({ d, o, link }) => d.damage(o, 400 * link.num), 800), {
    cond: (d, c) => d.chain.length >= 1 && !d.chain.some((l) => l.card.def.name === c.def.name),
    when: (d, ev) => ev.e === 'chain',
  }),
  'Chain Summoning': spell(run(({ d, p }) => { d.players[p].bonusSummons += d.players[p].normalDone ? 3 : 2; d.log(`${d.name(p)} can Normal Summon or Set up to 3 times this turn.`); }, 300), {
    cond: (d, c) => d.chain.length >= 2 && !d.chain.some((l) => l.card.def.name === c.def.name),
    when: (d, ev) => ev.e === 'chain',
  }),
  'Chaos End': spell(destroyAll(M), { cond: (d, _c, p) => d.players[p].banished.length >= 7, ai: (d, me) => scoreWipe(d, me, () => true) }),
  'Chaos Greed': spell({ op: 'draw', who: 'self', n: 2 }, { cond: (d, _c, p) => d.players[p].banished.length >= 4 && d.players[p].gy.length === 0 }),
  'Checkmate': spell(run(async ({ d, p }) => {
    const k = await pick(d, p, 'Select Terrorking Archfiend', d.find({ ...OWN_FU, name: 'Terrorking Archfiend' }, p), 'good');
    if (k) { grantRule(d, k, 'direct'); d.log(`${k.def.name} can attack directly this turn.`); }
  }, 600), { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, set: 'Archfiend', fn: (_d, c) => c.def.name !== 'Terrorking Archfiend' } } }], req: [{ f: { ...OWN_FU, name: 'Terrorking Archfiend' } }] }),
  'Chthonian Alliance': { equip: { f: FU, fn: (d, _e, m) => ({ atk: 800 * both(d).filter((x) => x !== m && x.faceUp && d.nameOf(x) === d.nameOf(m)).length }) } },
  'Clock Tower Prison': {
    lock: { noDamage: (_d, src, s, battle) => !!src && battle && s === src.ctrl && ctr(src, 'clock') >= 4 },
    effects: [
      trig('oppStandby', run(({ d, card }) => { addCtr(d, card, 1, 'clock'); })),
      trig('destroyed', ssFrom(['hand', 'deck'], { name: 'Destiny Hero - Dreadmaster' }, { ignore: true }), { from: ['gy'], cond: (_d, c) => (c.last.ctr?.clock ?? 0) >= 4 }),
    ],
  },
  'Cloudian Squall': passive({ effects: [trig('standby', run(({ d }) => { for (const m of both(d)) if (m.faceUp) addCtr(d, m, 1, 'fog'); }), { cond: (d, c) => d.onField(c) })] }),
  'Cocoon Party': spell(run(async ({ d, p, card }) => {
    const n = new Set(d.players[p].gy.filter((c) => c.def.name.startsWith('Neo-Spacian')).map((c) => d.nameOf(c))).size;
    for (let i = 0; i < n; i++) if (!(await ssPick(d, p, d.find(DECK({ set: 'Chrysalis' }), p), 'Special Summon a Chrysalis', undefined, false, card))) break;
  }, 500), { req: [{ f: { side: 'self', zone: 'gy', set: 'Neo-Spacian' } }, { f: DECK({ set: 'Chrysalis' }) }] }),
  'Cocoon Rebirth': passive({
    effects: [ign(run(async ({ d, p, link }) => {
      const name = link.data.neo as string | undefined;
      if (name) await ssPick(d, p, d.find({ side: 'any', zone: 'gy', name }, p), `Special Summon ${name}`);
    }, 700), {
      label: 'Tribute a Chrysalis: Special Summon its Neo-Spacian',
      cost: [run(async ({ d, p, link }) => {
        const c = await pick(d, p, 'Tribute a Chrysalis', d.find({ ...OWN_FU, set: 'Chrysalis' }, p).filter((x) => d.tributeOk(x)), 'cost');
        if (!c) return;
        link.data.neo = chrysalisTarget(c);
        await d.move(c, 'gy', { why: 'tribute' });
      }, 0, (d, p) => d.find({ ...OWN_FU, set: 'Chrysalis' }, p).some((c) => d.find({ side: 'any', zone: 'gy', name: chrysalisTarget(c) }, p).length > 0))],
    })],
  }),
  'Colosseum - Cage of the Gladiator Beasts': {
    auraFn: (_d, src, c) => (c.def.name.includes('Gladiator Beast') ? { atk: 100 * ctr(src, 'gb'), def: 100 * ctr(src, 'gb') } : undefined),
    onSummon: (d, src, c, how) => { if (how === 'special' && c.data.from === 'deck') addCtr(d, src, 1, 'gb'); },
  },
  'Combination Attack': spell(run(async ({ d, p, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone') return;
    const u = d.equipsOf(m).find((e) => e.def.ability === 'union');
    if (u) { u.equipTo = undefined; u.eq = undefined; await d.specialSummon(u, p, await d.askPos(p, u)); }
    m.data.extraAtk = d.turn;
    m.attacks = Math.max(0, m.attacks - 1);
  }, 800), { cond: (d) => d.phase === 'BP', targets: [{ f: { ...OWN_FU, fn: (d, c) => c.attacks > 0 && d.equipsOf(c).some((e) => e.def.ability === 'union') }, good: true }] }),
  'Common Soul': passive({
    effects: [trig('leftField', run(async ({ d, card }) => {
      const m = card.last.common !== undefined ? d.byUid(card.last.common) : undefined;
      if (m && m.zone === 'mzone') await d.toHand(m);
    }))],
  }, {
    targets: [{ f: FU, good: true }],
    ops: [run(async ({ d, p, card, t }) => {
      const sel = t[0];
      if (!sel || sel.zone !== 'mzone') return;
      const c = await pick(d, p, 'Special Summon a Neo-Spacian', d.players[p].hand.filter((x) => x.def.name.startsWith('Neo-Spacian') && d.canSpecial(sel.ctrl, x)), 'good');
      if (!c || !(await d.specialSummon(c, sel.ctrl, await d.askPos(p, c), 'special', false, card))) return;
      card.data.common = c.uid;
      d.addMod(sel, c.def.atk ?? 0, 0, -1);
    }, 600)],
  }),
  'Contact': spell(run(async ({ d, p, card }) => {
    const cs = d.find({ ...OWN_FU, set: 'Chrysalis' }, p);
    const names = cs.map(chrysalisTarget);
    for (const c of cs) await d.move(c, 'gy', { by: p });
    for (const n of names) await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: n }, p), `Special Summon ${n}`, undefined, false, card);
  }, 800), { req: [{ f: { ...OWN_FU, set: 'Chrysalis' } }] }),
  'Contact Out': spell(run(async ({ d, p, t }) => {
    const f = t[0];
    if (!f || f.zone !== 'mzone') return;
    const mats = (f.def.mats ?? []).map((m) => (typeof m === 'string' ? d.find({ side: 'self', zone: 'deck', id: m }, p)[0] : d.find({ side: 'self', zone: 'deck', name: m.name }, p)[0]));
    await d.move(f, 'extra');
    if (mats.every(Boolean) && d.freeCount(p, 'm') >= mats.length) for (const m of mats) await d.specialSummon(m!, p, await d.askPos(p, m!));
    await d.shuffleDeck(p);
  }, 300), { targets: [{ f: { ...OWN_FU, mtype: ['fusion'], set: 'Neos' }, good: true }] }),
  'Continuous Destruction Punch': passive({
    afterBattle: async (d, src, r) => {
      if (!r.tgt || r.tgt.ctrl !== src.ctrl || r.tgt.pos !== 'def' || r.att.zone !== 'mzone') return;
      if (d.defv(r.tgt) > d.atk(r.att)) await d.destroy(r.att, 'effect', undefined, src.ctrl);
    },
  }),
  'Contract with Exodia': spell(ssFrom(['hand'], { name: 'Exodia Necross' }, { ignore: true }), {
    cond: (d, _c, p) => ['Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One'].every((n) => d.players[p].gy.some((c) => c.def.name === n)),
  }),
  'Contract with the Abyss': spell({ op: 'ritual', name: (c) => c.def.attr === 'DARK', exact: true }, { ai: 1500 }),
  'Contract with the Dark Master': ritual('Dark Master - Zorc'),
  'Convert Contact': spell([
    run(async ({ d, p }) => {
      for (const zone of ['hand', 'deck'] as const) {
        const c = await pick(d, p, `Send a Neo-Spacian from your ${zone}`, d.find({ side: 'self', zone, set: 'Neo-Spacian' }, p), 'cost');
        if (c) await d.move(c, 'gy', { by: p });
      }
      await d.shuffleDeck(p);
    }),
    { op: 'draw', who: 'self', n: 2 },
  ], { cond: (d, _c, p) => d.monsters(p).length === 0, req: [{ f: { side: 'self', zone: 'hand', set: 'Neo-Spacian' } }, { f: DECK({ set: 'Neo-Spacian' }) }] }),
  'Convulsion of Nature': passive({ lock: {}, reveals: () => false }),
  'Corruption Cell "A"': spell(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 1, 'A'); }, 200), { targets: [{ f: OPP_FU }] }),
  'Cost Down': spell(run(({ d, p }) => d.addTemp({ until: d.turn, lv: (_d, c) => (c.zone === 'hand' && c.owner === p ? -2 : 0) }), (d, me) => (d.players[me].hand.some((c) => (c.def.lv ?? 0) >= 5) && !d.players[me].normalDone ? 500 : -1)), {
    cost: [{ op: 'discard', who: 'self', n: 1 }],
  }),
  'Counter Cleaner': spell(run(({ d }) => { for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) if (c.data.ctr) c.data.ctr = {}; d.log('All counters are removed.'); }, -1), { cost: [{ op: 'payLP', n: 500 }] }),
  'Creature Seizure': spell(run(async ({ d, p, o }) => {
    const a = await pick(d, p, 'Give a Normal Monster to your opponent', d.find({ ...OWN_FU, mtype: ['normal'] }, p), 'cost');
    const b = await pick(d, o, 'Give a Normal Monster to your opponent', d.find({ ...OWN_FU, mtype: ['normal'] }, o), 'cost');
    if (a) await d.takeControl(a, o, true);
    if (b) await d.takeControl(b, p, true);
  }, -1), { req: [{ f: { ...OWN_FU, mtype: ['normal'] } }, { f: { ...OPP_FU, mtype: ['normal'] } }] }),
  'Creature Swap': spell(run(async ({ d, p, o }) => {
    const a = await pick(d, p, 'Select a monster to switch', d.monsters(p), 'cost');
    const b = await pick(d, o, 'Select a monster to switch', d.monsters(o), 'cost');
    if (!a || !b) return;
    d.players[p].m[a.slot] = null;
    d.players[o].m[b.slot] = null;
    const [sa, sb] = [a.slot, b.slot];
    d.players[o].m[sb] = a; a.ctrl = o; a.slot = sb;
    d.players[p].m[sa] = b; b.ctrl = p; b.slot = sa;
    a.posTurn = b.posTurn = d.turn;
    d.log(`${a.def.name} and ${b.def.name} switch control.`);
    await d.emit({ t: 'move', card: a, from: 'mzone', to: 'mzone' });
    await d.emit({ t: 'move', card: b, from: 'mzone', to: 'mzone' });
  }, (d, me) => Math.max(0, ...d.monsters(opp(me)).map((c) => (c.faceUp ? d.atk(c) : 1200))) - Math.min(...d.monsters(me).map((c) => d.atk(c)), 9999) - 300), {
    req: [{ f: OWN_M }, { f: OPP_M }],
  }),
  'Crystal Abundance': spell(run(async ({ d, p, o, card }) => {
    const cbs = d.players[p].s.filter((c): c is Card => !!c && c.faceUp && c.def.name.includes('Crystal Beast'));
    const four = await d.select(p, 'Send 4 Crystal Beast cards to the Graveyard', cbs, 4, 4, 'cost');
    for (const c of four) await d.move(c, 'gy', { by: p });
    let n = 0;
    for (const c of [...d.fieldCards(p), ...d.fieldCards(o)]) {
      if (c === card) continue;
      const theirs = c.ctrl === o;
      await d.move(c, 'gy', { by: p });
      if (theirs) n++;
    }
    for (let i = 0; i < n; i++) if (!(await ssPick(d, p, d.players[p].gy.filter((c) => c.def.name.includes('Crystal Beast')), 'Special Summon a Crystal Beast'))) break;
  }, (d, me) => d.fieldCards(opp(me)).length * 600 - 800), { cond: (d, _c, p) => crystalInST(d, p) >= 4 }),
  'Crystal Beacon': spell(ssFrom(['deck'], { set: 'Crystal Beast' }), { cond: (d, _c, p) => crystalInST(d, p) >= 2 }),
  'Crystal Blessing': spell(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Place up to 2 Crystal Beasts in your Spell & Trap Zone', d.find({ ...GY_M('self'), set: 'Crystal Beast' }, p), 1, 2, 'good');
    for (const c of cs) await placeAsSpell(d, c, p);
  }, 300), { req: [{ f: { ...GY_M('self'), set: 'Crystal Beast' } }] }),
  'Crystal Promise': spell(run(async ({ d, p, t }) => { const c = t[0]; if (c && c.zone === 'szone') { c.data.asSpell = false; await d.specialSummon(c, p, await d.askPos(p, c)); } }, 700), {
    targets: [{ f: { side: 'self', zone: 'szone', set: 'Crystal Beast', fn: (_d, c) => c.def.kind === 'monster' && c.faceUp }, good: true }],
  }),
  'Crystal Release': {
    equip: { f: { ...FU, set: 'Crystal Beast' }, atk: 800 },
    effects: [trig('fieldToGY', run(async ({ d, p }) => { const c = await pick(d, p, 'Place a Crystal Beast from your Deck', d.find(DECK({ kind: 'monster', set: 'Crystal Beast' }), p), 'good'); if (c) { await placeAsSpell(d, c, p); await d.shuffleDeck(p); } }), { optional: true, from: ['gy'] })],
  },
  'Crystal Tree': passive({
    effects: [ign(run(async ({ d, p, card }) => {
      const n = ctr(card, 'crystal');
      await d.move(card, 'gy', { why: 'cost' });
      for (let i = 0; i < n; i++) { const c = await pick(d, p, 'Place a Crystal Beast from your Deck', d.find(DECK({ kind: 'monster', set: 'Crystal Beast' }), p), 'good'); if (!c || !(await placeAsSpell(d, c, p))) break; }
      await d.shuffleDeck(p);
    }, (_d, _me, c) => ctr(c, 'crystal') * 300 - 200), { label: 'Send to the Graveyard: place Crystal Beasts', cond: (_d, c) => ctr(c, 'crystal') > 0 })],
  }),
};
