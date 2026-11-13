// YGO Online Spells, part 4 (Release Restraint … Yu-Jo Friendship).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  act, addCtr, both, canFuse, castCopy, condSpell, ctr, destroyAll, destroyAtEnd, fuse, grantRule, has, ign, opp,
  passive, pick, pickSeen, randomOf, removeCtr, ritual, run, scoreWipe, search, spell, ssFrom, ssPick, tokenDef, tokens, trig,
  atEndPhase, killEquippedOnLeave,
} from './olib';

const secondStandby = (eff: Def = {}): Def => ({
  ...eff,
  effects: [...(eff.effects ?? []), trig('standby', run(({ d, card }) => d.destroy(card, 'effect', undefined, card.ctrl)), { cond: (d, c) => d.onField(c) && (c.data.standbys ?? 0) >= 2 })],
});
const isNormal = (c: Card) => c.def.kind === 'monster' && c.def.mtype === 'normal' && !c.token;
const permLock = (d: Duel, c: Card, lock: Parameters<Duel['addTemp']>[0]['lock']) => d.addTemp({ until: 1e9, lock });

export const SPELLS_4: Record<string, Def> = {
  'Release Restraint': spell(ssFrom(['hand', 'deck'], { name: 'Gearfried the Swordmaster' }, { ignore: true }), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Gearfried the Iron Knight' } } }],
    req: [{ f: { ...OWN_M, name: 'Gearfried the Iron Knight' } }, { f: { side: 'self', zone: ['hand', 'deck'], name: 'Gearfried the Swordmaster' } }],
  }),
  'Reload': spell(run(async ({ d, p, card }) => {
    const hand = d.players[p].hand.filter((c) => c !== card);
    for (const c of hand) await d.move(c, 'deck');
    await d.shuffleDeck(p);
    await d.draw(p, hand.length);
  }, -1), { req: [{ f: { side: 'self', zone: 'hand', notThis: true } }] }),
  'Reversal Quiz': spell(run(async ({ d, p, o, card }) => {
    for (const c of [...d.players[p].hand, ...d.fieldCards(p)]) if (c !== card) await d.move(c, 'gy', { by: p });
    const top = d.players[p].deck[d.players[p].deck.length - 1];
    if (!top) return;
    const kinds = ['monster', 'spell', 'trap'] as const;
    const i = await d.option(p, 'Call the type of the top card of your Deck', ['Monster', 'Spell', 'Trap']);
    await d.reveal(o, [top], 'Reversal Quiz');
    if (top.def.kind === kinds[i]) { const a = d.players[p].lp, b = d.players[o].lp; await d.changeLP(p, b - a); await d.changeLP(o, a - b); }
  }, (d, me) => (d.players[opp(me)].lp - d.players[me].lp) / 3 - 1500)),
  'Reverse of Neos': spell(run(async ({ d, p, card }) => {
    const c = await ssPick(d, p, d.find(DECK({ name: 'Elemental Hero Neos' }), p), 'Special Summon Elemental Hero Neos', 'atk', false, card);
    if (c) { d.addMod(c, 1000, 0, -1); destroyAtEnd(d, c, p); }
  }, 1500), { when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.from === 'mzone' && ev.card.def.mtype === 'fusion' && ev.card.def.name.includes('Neos') && ev.card.mark.destroyedTurn !== undefined, req: [{ f: DECK({ name: 'Elemental Hero Neos' }) }] }),
  'Revoke Fusion': spell(run(async ({ d, p, card }) => {
    const f = await pick(d, p, 'Send a Fusion Monster to the Graveyard', d.players[p].extra.filter((x) => (x.def.mats ?? []).some((m) => d.players[p].hand.some((h) => d.matMatches(m, h)))), 'cost');
    if (!f) return;
    await d.move(f, 'gy', { by: p });
    const c = await ssPick(d, p, d.players[p].hand.filter((h) => (f.def.mats ?? []).some((m) => d.matMatches(m, h))), 'Special Summon a Fusion Material', undefined, false, card);
    if (c) atEndPhase(d, c, (x) => d.move(x, 'gy', { by: p }));
  }, 500), { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', name: 'Polymerization' } } }], req: [{ f: { side: 'self', zone: 'hand', name: 'Polymerization' } }] }),
  'Ribbon of Rebirth': {
    equip: { f: FU },
    effects: [trig('fieldToGY', run(({ d, card }) => {
      const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined;
      if (!m) return;
      const mv = m.mv, p = card.ctrl;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (m.mv === mv && m.zone === 'gy' && d.canSpecial(p, m)) await d.specialSummon(m, p, await d.askPos(p, m)); } });
    }), { from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.zone === 'gy' && m.mark.destroyedHow === 'battle' && m.mark.destroyedTurn === d.turn; } })],
  },
  'Ring of Defense': spell(run(({ d, p }) => d.addTemp({ until: d.turn, p, tag: 'ringOfDefense', lock: { noDamage: (dd, _s, s, battle) => !battle && s === p && dd.chain.some((l) => l.card.def.kind === 'trap') } }), 600), {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.card.def.kind === 'trap' && ev.link.eff.ops.some((o) => o.op === 'damage' || o.op === 'damageAtk' || o.op === 'run'),
  }),
  'Ritual Foregone': spell(run(async ({ d, p, card }) => {
    d.flags[`ritualForegone:${p}`] = d.turn;
    const c = await ssPick(d, p, d.players[p].hand.filter((x) => x.def.mtype === 'ritual'), 'Special Summon a Ritual Monster', undefined, true, card);
    if (c) { c.noAttackTurn = d.turn; destroyAtEnd(d, c, p); }
  }, 200), { cost: [{ op: 'payLP', n: 1000 }], cond: (d, _c, p) => d.flags[`ritualForegone:${p}`] !== d.turn && d.players[p].hand.some((x) => x.def.mtype === 'ritual') && d.canSpecial(p) }),
  'Ritual Weapon': { equip: { f: { ...FU, mtype: ['ritual'], maxLv: 6 }, atk: 1500, def: 1500 } },
  "Rod of Silence - Kay'est": {
    equip: { f: FU, def: 500 },
    effects: [{ type: 'quick', from: ['szone'], label: 'Negate a Spell targeting the equipped monster', ops: [{ op: 'negate', effectOnly: true, destroy: true }],
      when: (d, ev, p, card) => ev.e === 'chain' && ev.link.card !== card && ev.link.card.def.kind === 'spell' && !!d.equippedTo(card) && ev.link.targets.flat().includes(d.equippedTo(card)!), ai: 800 }],
  },
  "Rod of the Mind's Eye": { equip: { f: FU }, battleDmg: (_d, self, _o, n, to) => (to !== self.ctrl && n > 0 ? 1000 : n) },
  'Rose Bud': spell(ssFrom(['hand', 'deck'], { name: 'Elemental Hero Poison Rose' }, { ignore: true }), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Elemental Hero Knospe' } } }], req: [{ f: { ...OWN_M, name: 'Elemental Hero Knospe' } }],
  }),
  'Royal Tribute': condSpell((d, p) => has(d, p, 'Necrovalley'), run(async ({ d, p, o }) => {
    for (const s of [p, o]) { const ms = d.players[s].hand.filter((c) => c.def.kind === 'monster'); if (ms.length) await d.discard(s, ms, p); }
  }, (d, me) => d.players[opp(me)].hand.length * 200 - d.players[me].hand.filter((c) => c.def.kind === 'monster').length * 300)),
  'Ruthless Denial': spell(run(async ({ d, p, o }) => {
    const c = await pick(d, p, 'Send one of your monsters to the Graveyard', d.monsters(p), 'cost');
    if (c) await d.move(c, 'gy', { by: p });
    const r = randomOf(d, d.players[o].hand);
    if (r) await d.move(r, 'gy', { by: p });
  }, -1), { req: [{ f: OWN_M }, { f: { side: 'opp', zone: 'hand' } }] }),
  "Sage's Stone": condSpell((d, p) => has(d, p, 'Dark Magician Girl'), ssFrom(['hand', 'deck'], { name: 'Dark Magician' })),
  'Salvage': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), attr: 'WATER', fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }, n: 2, good: true }] }),
  'Samsara': passive({ lock: { ritualToDeck: true } }),
  'Second Coin Toss': passive({ lock: {} }),
  'Secret Pass to the Treasures': spell(run(({ d, t }) => { if (t[0]) grantRule(d, t[0], 'direct'); }, (d) => (d.phase === 'M1' ? 400 : -1)), { targets: [{ f: { ...OWN_FU, maxAtk: 1000 }, good: true }] }),
  'Senet Switch': passive({
    effects: [ign(run(async ({ d, p }) => {
      const P = d.players[p];
      const c = await pick(d, p, 'Move a monster to an adjacent zone', d.monsters(p).filter((m) => [m.slot - 1, m.slot + 1].some((i) => i >= 0 && i < 5 && !P.m[i])), 'good');
      if (!c) return;
      const to = [c.slot - 1, c.slot + 1].find((i) => i >= 0 && i < 5 && !P.m[i])!;
      P.m[c.slot] = null; P.m[to] = c; c.slot = to;
      await d.emit({ t: 'move', card: c, from: 'mzone', to: 'mzone' });
    }, -1), { label: 'Move a monster', opt: true, req: [{ f: OWN_M }] })],
  }),
  'Senri Eye': passive({
    effects: [trig('standby', run(async ({ d, p, o }) => { const top = d.players[o].deck[d.players[o].deck.length - 1]; if (top) await d.reveal(p, [top], "Top of your opponent's Deck"); }), {
      optional: true, cost: [{ op: 'payLP', n: 100 }], cond: (d, c) => d.onField(c) && d.players[opp(c.ctrl)].deck.length > 0,
    })],
  }),
  'Serial Spell': spell(run(async ({ d, p, card, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    for (const c of [...d.players[p].hand]) await d.move(c, 'gy', { by: p });
    await castCopy(d, p, ev.link.card, card);
  }, 400), { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p === p && ev.link.isCard && ev.link.card.def.kind === 'spell' && ev.link.card.def.stype === 'normal' }),
  'Shield Crush': spell({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { ...M, pos: 'def' } }] }),
  "Shien's Castle of Mist": {
    auraFn: (d, src, c) => (d.battle && d.battle.att === c && d.battle.tgt?.def.name.includes('Six Samurai') && d.battle.tgt.ctrl === src.ctrl ? { atk: -500 } : undefined),
  },
  "Shien's Spy": spell(run(async ({ d, o, t }) => { if (t[0]) await d.takeControl(t[0], o); }, -1), { targets: [{ f: OWN_FU }] }),
  'Shifting Shadows': passive({
    effects: [ign(run(async ({ d, p }) => {
      const downs = d.monsters(p).filter((c) => !c.faceUp);
      const slots = downs.map((c) => c.slot);
      for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(d.rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
      downs.forEach((c, i) => { d.players[p].m[slots[i]] = c; c.slot = slots[i]; });
      d.log(`${d.name(p)} rearranges their face-down monsters.`);
    }, -1), { label: 'Pay 300 LP: shuffle face-down monsters', opt: true, cost: [{ op: 'payLP', n: 300 }], req: [{ f: { ...OWN_M, faceUp: false }, n: 2 }] })],
  }),
  "Shinato's Ark": ritual('Shinato, King of a Higher Plane'),
  'Shooting Star Bow - Ceal': { equip: { f: FU, atk: -1000, rules: ['direct'] } },
  'Short Circuit': condSpell((d, p) => d.find({ ...OWN_FU, set: 'Batteryman' }, p).length >= 3, destroyAll({ side: 'opp' }), { ai: (d, me) => d.fieldCards(opp(me)).length * 700 }),
  'Shrink': spell(run(({ d, t }) => { const c = t[0]; if (c && c.zone === 'mzone') d.addMod(c, -Math.floor(d.base(c, 'atk') / 2), 0); }), {
    targets: [{ f: FU }],
    ai: (d, me) => {
      const attack = d.curAttack;
      if (!attack || attack.player === me) return 0;
      const attacker = attack.attacker;
      const before = d.atk(attacker);
      const blocked = Math.min(before, Math.floor(d.base(attacker, 'atk') / 2));
      if (!attack.target) return blocked;
      const targetStat = attack.target.faceUp
        ? attack.target.pos === 'atk' ? d.atk(attack.target) : d.defv(attack.target)
        : 1500;
      return before >= targetStat && before - blocked <= targetStat ? 800 + blocked : 0;
    },
  }),
  'Silent Doom': spell(run(async ({ d, p, card, t }) => { const c = t[0]; if (c && c.zone === 'gy' && (await d.specialSummon(c, p, 'def', 'special', false, card))) c.noAttackTurn = 1e9; }, 500), { targets: [{ f: { ...GY_M('self'), mtype: ['normal'] }, good: true }] }),
  'Six Samurai United': passive({
    onSummon: (d, src, c, how) => { if (how !== 'flip' && c.def.name.includes('Six Samurai')) addCtr(d, src, 1, 'bushido', 2); },
    effects: [ign(run(async ({ d, p, card }) => { const n = ctr(card, 'bushido'); await d.move(card, 'gy', { why: 'cost' }); await d.draw(p, n); }, (_d, _me, c) => (ctr(c, 'bushido') >= 2 ? 800 : -1)), { label: 'Send to the GY: draw', cond: (_d, c) => ctr(c, 'bushido') > 0 })],
  }),
  'Skyscraper': {
    effects: [trig('anyAttack', run(({ d, link }) => {
      const ev = link.ev;
      if (ev.e !== 'attack' || !ev.target) return;
      if (d.atk(ev.attacker) < d.atk(ev.target)) { d.addMod(ev.attacker, 1000, 0, d.turn, 'attack'); d.log(`${ev.attacker.def.name} gains 1000 ATK.`); }
    }), { cond: (_d, _c, _p, ev) => ev?.e === 'attack' && !!ev.target && ev.target.faceUp && ev.attacker.def.name.includes('Elemental Hero') })],
  },
  'Skyscraper 2 - Hero City': {
    effects: [ign(ssFrom(['gy'], { set: 'Elemental Hero', fn: (_d, c) => c.mark.destroyedHow === 'battle' }), { label: 'Special Summon an Elemental Hero', opt: true, from: ['fzone'] })],
  },
  'Smashing Ground': spell(run(async ({ d, p }) => {
    const cs = d.find(OPP_FU, p);
    const top = Math.max(...cs.map((c) => d.defv(c)));
    const c = await pick(d, p, 'Destroy the highest DEF monster', cs.filter((x) => d.defv(x) === top), 'bad');
    if (c) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => Math.max(-1, ...d.find(OPP_FU, me).map((c) => c.def.atk ?? 0))), { req: [{ f: OPP_FU }] }),
  'Smoke Grenade of the Thief': {
    equip: { f: FU },
    effects: [trig('destroyed', run(async ({ d, p, o }) => {
      const c = await pickSeen(d, p, "Discard a card from your opponent's hand", d.players[o].hand, 'bad');
      if (c) await d.discard(o, [c], p);
    }), { from: ['gy'], cond: (_d, c) => c.mark.destroyedHow === 'effect' && c.mark.lastFaceUp })],
  },
  'Snake Rain': spell(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Send 4 Reptile monsters to the Graveyard', d.find(DECK({ kind: 'monster', race: ['Reptile'] }), p), 4, 4, 'cost');
    for (const c of cs) await d.move(c, 'gy', { by: p });
    await d.shuffleDeck(p);
  }, 100), { cost: [{ op: 'discard', who: 'self', n: 1 }], req: [{ f: DECK({ kind: 'monster', race: ['Reptile'] }), n: 4 }] }),
  'Solar Recharge': spell([{ op: 'draw', who: 'self', n: 2 }, { op: 'mill', who: 'self', n: 2 }], {
    cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', set: 'Lightsworn' } } }],
    req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', set: 'Lightsworn' } }],
  }),
  'Soul Absorption': passive({ onMove: (d, src, _c, _from, to) => (to === 'banished' ? d.heal(src.ctrl, 500) : undefined) }),
  'Soul Devouring Bamboo Sword': secondStandby(passive({
    effects: [trig('anyBattleDamage', run(({ d, o }) => { d.flag('skipDraw', o); d.log(`${d.name(o)} will skip their next Draw Phase.`); }), {
      cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && !!ev.src && ev.src.uid === c.data.sel && d.equipsOf(ev.src).some((e) => e.def.name.includes('Bamboo Sword')),
    })],
  }, { targets: [{ f: { ...FU, fn: (d, c) => d.equipsOf(c).some((e) => e.def.name.includes('Bamboo Sword')) }, good: true }], ops: [run(({ card, t }) => { if (t[0]) card.data.sel = t[0].uid; })] })),
  'Soul of Fire': spell(run(async ({ d, p, o }) => {
    await d.draw(o, 1);
    const c = await pick(d, p, 'Banish a Pyro monster from your Deck', d.find(DECK({ kind: 'monster', race: ['Pyro'] }), p), 'good');
    if (c) { await d.banish(c, p); await d.shuffleDeck(p); await d.damage(o, Math.floor((c.def.atk ?? 0) / 2)); }
    d.players[p].noAttackTurn = d.turn;
  }, (d, me) => Math.max(-1, ...d.find(DECK({ kind: 'monster', race: ['Pyro'] }), me).map((c) => (c.def.atk ?? 0) / 2 - 500))), { req: [{ f: DECK({ kind: 'monster', race: ['Pyro'] }) }] }),
  'Soul Reversal': spell(run(async ({ d, t }) => { const c = t[0]; if (c && c.zone === 'gy') { await d.move(c, 'deck'); d.log(`${c.def.name} is placed on top of the Deck.`); } }, 200), {
    targets: [{ f: { ...GY_M('self'), fn: (_d, c) => !!c.def.effects?.some((e) => e.type === 'flip') }, good: true }],
  }),
  'Soul Taker': spell([{ op: 'destroy', s: { t: 'target' } }, { op: 'heal', who: 'opp', n: 1000 }], { targets: [{ f: OPP_FU }] }),
  'Space Gift': spell(run(({ d, p }) => d.draw(p, new Set(d.find({ ...OWN_FU, set: 'Neo-Spacian' }, p).map((c) => c.def.name)).size), 700), { req: [{ f: { ...OWN_FU, set: 'Neo-Spacian' } }] }),
  'Spark Blaster': {
    equip: { f: { ...FU, name: 'Elemental Hero Sparkman' } },
    effects: [ign(run(async ({ d, p, card, t }) => {
      if (t[0]) await d.changePos(t[0], 'swap');
      card.data.uses = (card.data.uses ?? 0) + 1;
      if (card.data.uses >= 3) await d.destroy(card, 'effect', undefined, p);
    }, 300), { label: 'Change a monster\'s battle position', targets: [{ f: FU }], cond: (d, c) => !!d.equippedTo(c) })],
  },
  'Special Hurricane': spell(destroyAll({ ...M, fn: (_d, c) => !!c.data.how && c.data.how !== 'normal' && c.data.how !== 'flip' }), {
    cost: [{ op: 'discard', who: 'self', n: 1 }], ai: (d, me) => scoreWipe(d, me, (c) => !!c.data.how && c.data.how !== 'normal' && c.data.how !== 'flip') - 500,
  }),
  'Spell Absorption': passive({ onResolve: (d, src, link) => (link.isCard && link.card.def.kind === 'spell' ? d.heal(src.ctrl, 500) : undefined) }),
  'Spell Calling': {
    effects: [act({ ops: [] }), trig('destroyed', run(async ({ d, p, o }) => {
      const c = await pick(d, p, 'Set a Quick-Play Spell from your Deck', d.find(DECK({ stype: 'quick' }), p), 'good');
      if (!c || d.freeSlot(p, 's') < 0) return;
      await d.reveal(o, [c], 'Spell Calling');
      await d.setST(c, p);
      await d.shuffleDeck(p);
    }), { from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false && c.mark.destroyedBy === opp(c.owner) && c.mark.destroyedHow === 'effect' })],
  },
  'Spell Chronicle': passive({
    onResolve: (d, src, link) => { if (link.isCard && link.card.def.kind === 'spell' && link.p !== src.ctrl) addCtr(d, src, 1, 'chronicle'); },
    effects: [
      ign(run(async ({ d, p, o, card }) => {
        const pool = (card.data.chron ?? []).map((u: number) => d.byUid(u)).filter((c: Card | undefined): c is Card => !!c && c.zone === 'banished');
        const c = await pick(d, o, 'Spell Chronicle: give a card to your opponent', pool, 'bad');
        if (c) { await d.toHand(c); card.data.chron = card.data.chron.filter((u: number) => u !== c.uid); }
      }, 400), { label: 'Remove 2 counters: add a chronicled card', cost: [run(({ d, card }) => { removeCtr(d, card, 2, 'chronicle'); }, 0, (_d, _p, c) => ctr(c, 'chronicle') >= 2)] }),
      trig('leftField', run(async ({ d, card }) => {
        const n = (card.last.chron ?? []).map((u: number) => d.byUid(u)).filter((c: Card | undefined) => !!c && c.zone === 'banished').length;
        await d.damage(card.owner, 500 * n, card);
      })),
    ],
  }, {
    req: [{ f: DECK({ st: true, zone: 'deck' }), n: 5 }],
    ops: [run(async ({ d, p, card }) => {
      for (const c of d.players[p].hand.filter((x) => x !== card)) await d.move(c, 'gy', { by: p });
      const cs = await d.select(p, 'Banish 5 Spell/Trap Cards from your Deck', d.players[p].deck.filter((c) => c.def.kind !== 'monster'), 5, 5, 'good');
      card.data.chron = [];
      for (const c of cs) { await d.banish(c, p); card.data.chron.push(c.uid); }
      await d.shuffleDeck(p);
    }, -1)],
  }),
  'Spell Economics': passive({ lock: { noSpellLP: (_d, src, p) => !!src && src.ctrl === p } }),
  'Spell Gear': spell(run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'Send 3 Ancient Gear cards to the Graveyard', d.fieldCards(p).filter((c) => c.faceUp && c.def.name.includes('Ancient Gear')), 3, 3, 'cost');
    for (const c of cs) await d.move(c, 'gy', { by: p });
    for (const z of ['hand', 'deck'] as const) await ssPick(d, p, d.find({ side: 'self', zone: z, name: 'Ancient Gear Golem' }, p), 'Special Summon Ancient Gear Golem', undefined, true, card);
    for (const m of d.monsters(p)) if (m.def.name !== 'Ancient Gear Golem') await d.destroy(m, 'effect', undefined, p);
    d.addTemp({ until: d.turn + 2, p, lock: { summon: (_d, _s, q, _c, how) => q === p && how === 'normal', set: (_d, _s, q, c) => q === p && c.def.kind === 'monster' } });
  }, 1500), { cond: (d, _c, p) => d.fieldCards(p).filter((c) => c.faceUp && c.def.name.includes('Ancient Gear')).length >= 3 }),
  'Spell Reproduction': spell({ op: 'toHand', s: { t: 'target' } }, {
    cost: [run(async ({ d, p, card }) => { const cs = await d.select(p, 'Send 2 Spell Cards to the Graveyard', d.players[p].hand.filter((x) => x !== card && x.def.kind === 'spell'), 2, 2, 'cost'); for (const c of cs) await d.move(c, 'gy', { by: p, why: 'cost' }); }, 0, (d, p, card) => d.players[p].hand.filter((x) => x !== card && x.def.kind === 'spell').length >= 2)],
    targets: [{ f: { side: 'self', zone: 'gy', kind: 'spell' }, good: true }],
  }),
  'Spell Shattering Arrow': spell(run(async ({ d, p, o }) => {
    let n = 0;
    for (const c of d.spellTraps(o).filter((x) => x.faceUp && x.def.kind === 'spell')) if (await d.destroy(c, 'effect', undefined, p)) n++;
    await d.damage(o, 500 * n);
  }, (d, me) => d.spellTraps(opp(me)).filter((x) => x.faceUp && x.def.kind === 'spell').length * 900 - 1), { req: [{ f: { side: 'opp', zone: ['szone', 'fzone'], faceUp: true, kind: 'spell' } }] }),
  'Spiral Spear Strike': passive({
    lock: { grants: (_d, src, c, r) => !!src && r === 'pierce' && c.ctrl === src.ctrl && ['Gaia The Fierce Knight', 'Swift Gaia the Fierce Knight', 'Gaia the Dragon Champion'].includes(c.def.name) },
    effects: [trig('anyBattleDamage', run(async ({ d, p }) => { await d.draw(p, 2); const c = await pick(d, p, 'Discard 1 card', d.players[p].hand, 'cost'); if (c) await d.discard(p, [c], p); }), {
      cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && ev.src?.def.name === 'Gaia the Dragon Champion' && !!d.battle?.tgt && d.battle.tgt.pos === 'def',
    })],
  }),
  'Spiritual Energy Settle Machine': passive({
    effects: [
      trig('endPhase', run(async ({ d, p, card }) => {
        const c = d.tp === p ? await pick(d, p, 'Discard 1 card or destroy Spiritual Energy Settle Machine', d.players[p].hand, 'cost', true) : undefined;
        if (c) await d.discard(p, [c], p); else if (d.tp === p) await d.destroy(card, 'effect', undefined, p);
      }), { cond: (d, c) => d.onField(c) && d.tp === c.ctrl }),
      trig('leftField', run(async ({ d }) => { for (const m of both(d)) if (m.faceUp && m.def.ability === 'spirit') await d.toHand(m); })),
    ],
  }),
  'Spring of Rebirth': passive({ onMove: (d, src, _c, from, to) => (from === 'mzone' && to === 'hand' ? d.heal(src.ctrl, 500) : undefined) }),
  'Stamping Destruction': condSpell((d, p) => d.find({ ...OWN_FU, race: ['Dragon'] }, p).length > 0, run(async ({ d, p, t }) => {
    const c = t[0];
    if (c && d.onField(c)) { const ctrl = c.ctrl; if (await d.destroy(c, 'effect', undefined, p)) await d.damage(ctrl, 500); }
  }, 700), { targets: [{ f: ST }] }),
  'Stray Lambs': spell(run(async ({ d, p }) => {
    await tokens(d, p, 'Lamb Token', 2, 'def');
    d.addTemp({ until: d.turn, p, lock: { summon: (_d, _s, q) => q === p } });
  }, 400), { cond: (d, _c, p) => d.freeCount(p, 'm') >= 2 && d.canSpecial(p) }),
  'Stumbling': passive({ onSummon: async (d, src, c) => { if (d.affects(src, c) && c.faceUp && c.pos === 'atk' && c.zone === 'mzone') await d.changePos(c, 'def'); } }),
  'Summon Cloud': passive({
    effects: [ign(run(async ({ d, p, card }) => {
      const c = await ssPick(d, p, d.find({ side: 'any', zone: ['hand', 'gy'], set: 'Cloudian', maxLv: 4, kind: 'monster' }, p).filter((x) => x.zone === 'gy' || x.owner === p), 'Special Summon a Cloudian');
      if (c && c.data.from === 'gy') await d.destroy(card, 'effect', undefined, p);
    }, 500), { label: 'Special Summon a Cloudian', opt: true, cond: (d, c) => d.monsters(c.ctrl).length === 0 })],
  }),
  "Summoner's Art": spell(search({ kind: 'monster', mtype: ['normal'], minLv: 5 }), { req: [{ f: DECK({ kind: 'monster', mtype: ['normal'], minLv: 5 }) }] }),
  'Super Double Summon': spell(run(({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    c.data.gemini = true;
    d.log(`${c.def.name} is Normal Summoned again and gains its effects.`);
    atEndPhase(d, c, (x) => d.toHand(x));
  }, 500), { targets: [{ f: { ...OWN_FU, ability: 'gemini', fn: (d, c) => d.dormant(c) }, good: true }] }),
  'Super Polymerization': spell(run(async ({ d, p, card }) => {
    await fuse(d, p, card, { pool: (s) => [...d.monsters(s), ...d.monsters(opp(s))] });
  }, 1500, (d, p, card) => canFuse(d, p, card, { pool: (s) => [...d.monsters(s), ...d.monsters(opp(s))] })), { cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  'Super Rejuvenation': spell(run(({ d, p }) => {
    d.schedule({ at: 'EP', turn: d.turn, fn: () => d.draw(p, d.players[p].gy.filter((c) => c.def.race === 'Dragon' && c.mark.sentTurn === d.turn && (c.mark.lastWhy === 'tribute' || c.mark.lastWhy === 'discard' || (c.mark.lastWhy === 'cost' && c.mark.from === 'hand'))).length) });
  }, 200)),
  'Swing of Memories': spell(run(async ({ d, p, card, t }) => { const c = t[0]; if (c && c.zone === 'gy' && (await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card))) destroyAtEnd(d, c, p); }, 400), {
    targets: [{ f: { ...GY_M('self'), mtype: ['normal'] }, good: true }],
  }),
  'Sword of Dark Rites': {
    equip: { f: { ...FU, attr: 'DARK' }, atk: 400 },
    effects: [trig('fieldToGY', { op: 'toHand', s: { t: 'this' } }, { from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.mark.lastWhy === 'tribute' && m.mark.sentTurn === d.turn; } })],
  },
  'Sword of the Soul-Eater': {
    equip: { f: { ...OWN_FU, mtype: ['normal'], maxLv: 3 } },
    effects: [act({ targets: [{ f: { ...OWN_FU, mtype: ['normal'], maxLv: 3 }, good: true }], ops: [{ op: 'equip' }, run(async ({ d, p, t }) => {
      const m = t[0];
      if (!m) return;
      let n = 0;
      for (const c of d.monsters(p).filter((x) => x !== m && isNormal(x))) if (d.tributeOk(c)) { await d.move(c, 'gy', { why: 'tribute' }); n++; }
      if (m.zone === 'mzone') d.addMod(m, 1000 * n, 0, -1);
    }, 300)] })],
  },
  'Swords of Concealing Light': secondStandby(passive({
    lock: { pos: (_d, src, c) => !!src && c.ctrl !== src.ctrl },
  }, { ops: [run(async ({ d, o }) => { for (const c of d.monsters(o)) if (c.faceUp) { c.pos = 'def'; await d.setFaceDown(c); } }, (d, me) => d.monsters(opp(me)).filter((c) => c.faceUp).length * 500)] })),
  'Symbol of Heritage': {
    effects: [act({
      targets: [{ f: { ...GY_M('self'), fn: (d, c) => d.players[c.owner].gy.filter((x) => x.def.name === c.def.name).length >= 3 }, good: true }],
      ops: [run(async ({ d, p, card, t }) => { const m = t[0]; if (m && m.zone === 'gy' && (await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card))) await d.equipCard(card, m, {}, p); }, 900)],
    }), trig('destroyed', run(async ({ d, card }) => { const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined; if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); }))],
  },
  'Symbols of Duty': {
    effects: [act({
      cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_M, mtype: ['normal'] } } }],
      targets: [{ f: GY_M('any'), good: true }],
      ops: [run(async ({ d, p, card, t }) => { const m = t[0]; if (m && m.zone === 'gy' && (await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card))) await d.equipCard(card, m, {}, p); }, 900)],
    }), killEquippedOnLeave],
  },
  'Synthesis Spell': ritual('Lycanthrope'),
  'System Down': spell(run(async ({ d, p, o }) => { for (const c of [...d.monsters(o), ...d.players[o].gy].filter((x) => x.def.kind === 'monster' && d.raceOf(x) === 'Machine')) await d.banish(c, p); }, (d, me) => scoreWipe(d, me, (c) => c.ctrl !== me && d.raceOf(c) === 'Machine') - 800), {
    cost: [{ op: 'payLP', n: 1000 }],
  }),
  'Tail Swipe': spell(run(async ({ d, p, o, t }) => {
    const k = t[0];
    if (!k) return;
    const cs = await d.select(p, 'Return up to 2 monsters to the hand', both(d).filter((c) => (c.faceUp && d.lvOf(c) < d.lvOf(k)) || (!c.faceUp && c.ctrl === o)), 1, 2, 'bad');
    for (const c of cs) await d.toHand(c);
  }, 800), { targets: [{ f: { ...OWN_FU, race: ['Dinosaur'], minLv: 5 }, good: true }] }),
  'Talisman of Trap Sealing': passive({
    negateFn: (_d, _s, c) => c.def.kind === 'trap',
    lock: { activate: (_d, _s, _p, c) => c.def.kind === 'trap' },
    selfDestructIf: (d, c) => !has(d, c.ctrl, 'Sealmaster Meisei'),
  }, { cond: (d, _c, p) => has(d, p, 'Sealmaster Meisei') }),
  'Terraforming': spell(search({ stype: 'field' }), { req: [{ f: DECK({ stype: 'field' }) }] }),
  'The A. Forces': passive({ auraFn: (d, src, c) => (c.ctrl === src.ctrl && d.raceOf(c) === 'Warrior' ? { atk: 200 * d.find({ ...OWN_FU, race: ['Warrior', 'Spellcaster'] }, src.ctrl).length } : undefined) }),
  'The Beginning of the End': spell([{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK' }, n: 5 } }, { op: 'draw', who: 'self', n: 3 }], { cond: (d, _c, p) => d.find({ ...GY_M('self'), attr: 'DARK' }, p).length >= 7 }),
  'The Big March of Animals': spell(run(({ d, p }) => { const n = d.find({ ...OWN_FU, race: ['Beast'] }, p).length; for (const c of d.find({ ...OWN_FU, race: ['Beast'] }, p)) d.addMod(c, 200 * n, 0); }, 400), { req: [{ f: { ...OWN_FU, race: ['Beast'] } }] }),
  'The Flute of Summoning Kuriboh': spell(run(async ({ d, p, card }) => {
    const c = await pick(d, p, 'Select Kuriboh or Winged Kuriboh', d.find(DECK({ name: ['Kuriboh', 'Winged Kuriboh'] }), p), 'good');
    if (!c) return;
    if (d.canSpecial(p, c) && (await d.option(p, c.def.name, ['Add to hand', 'Special Summon'], 1))) await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card);
    else await d.toHand(c);
    await d.shuffleDeck(p);
  }, 500), { req: [{ f: DECK({ name: ['Kuriboh', 'Winged Kuriboh'] }) }] }),
  'The Graveyard in the Fourth Dimension': spell({ op: 'toDeck', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), fn: (_d, c) => / LV\d+$/.test(c.def.name) }, n: 2, good: true }] }),
  'The Law of the Normal': spell(run(async ({ d, p, o, card }) => {
    for (const s of [p, o]) if (d.players[s].hand.length) await d.discard(s, [...d.players[s].hand], p);
    for (const c of [...d.fieldCards(p), ...d.fieldCards(o)]) if (c !== card && !(isNormal(c) && d.lvOf(c) <= 2 && c.zone === 'mzone')) await d.destroy(c, 'effect', undefined, p);
  }, 2000), { cond: (d, _c, p) => d.find({ ...OWN_FU, mtype: ['normal'], maxLv: 2 }, p).length >= 5 }),
  'The Puppet Magic of Dark Ruler': spell(run(async ({ d, p, card, t }) => {
    const f = t[0];
    if (!f) return;
    const lv = f.def.lv ?? 0;
    const cs = await d.select(p, `Banish monsters with total Levels ${lv}`, d.monsters(p), 1, 5, 'cost', (x) => x.reduce((s, c) => s + d.lvOf(c), 0) === lv);
    if (cs.reduce((s, c) => s + d.lvOf(c), 0) !== lv) return;
    for (const c of cs) await d.banish(c, p);
    if (f.zone === 'gy') await d.specialSummon(f, p, await d.askPos(p, f), 'special', false, card);
  }, 1000), { targets: [{ f: { ...GY_M('self'), race: ['Fiend'] }, good: true }] }),
  'The Sanctuary in the Sky': {
    lock: { battleDmg: (d, _src, att, tgt, n, to) => ([att, tgt].some((m) => m && m.ctrl === to && d.raceOf(m) === 'Fairy') ? 0 : n) },
  },
  'The Second Sarcophagus': passive({ lock: {} }, { cond: () => false }),
  'The Secret of the Bandit': spell(run(({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    d.addTemp({ until: d.turn, p, afterBattle: async (dd, r) => {
      const src = r.dmgTo === o ? (r.att.ctrl === p ? r.att : r.tgt) : null;
      if (src === c && r.dmg > 0) { const x = randomOf(dd, dd.players[o].hand); if (x) await dd.discard(o, [x], p); }
    } });
  }, 300), { cond: (d) => d.phase === 'M1', targets: [{ f: FU, good: true }] }),
  'The Third Sarcophagus': passive({ lock: {} }, { cond: () => false }),
  'The Warrior Returning Alive': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), race: ['Warrior'] }, good: true }] }),
  'Thousand Energy': spell(run(({ d, p }) => {
    for (const c of d.find({ ...OWN_FU, mtype: ['normal'] }, p).filter((x) => !x.token && d.lvOf(x) === 2)) d.addMod(c, 1000, 1000);
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { for (const c of d.monsters(p).filter((x) => isNormal(x) && d.lvOf(x) === 2)) await d.destroy(c, 'effect', undefined, p); } });
  }, (d, me) => (d.phase === 'M1' ? d.find({ ...OWN_FU, mtype: ['normal'], maxLv: 2 }, me).length * 400 - 300 : -1)), { req: [{ f: { ...OWN_FU, mtype: ['normal'], minLv: 2, maxLv: 2 } }] }),
  'Thunder Crash': spell(run(async ({ d, p, o }) => { let n = 0; for (const c of d.monsters(p)) if (await d.destroy(c, 'effect', undefined, p)) n++; await d.damage(o, 300 * n); }, (d, me) => d.monsters(me).length * 300 - d.monsters(me).reduce((s, c) => s + (c.def.atk ?? 0), 0) / 2), { req: [{ f: OWN_M }] }),
  'Timidity': spell(run(({ d, p }) => d.addTemp({ until: d.turn + (d.tp === p ? 1 : 2), lock: { indestructible: (_d, _s, c) => (c.zone === 'szone' || c.zone === 'fzone') && !c.faceUp } }), 100)),
  'Token Thanksgiving': spell(run(async ({ d, p }) => { let n = 0; for (const c of both(d).filter((x) => x.token)) if (await d.destroy(c, 'effect', undefined, p)) n++; await d.heal(p, 800 * n); }, (d, me) => both(d).filter((c) => c.token).length * 600), { req: [{ f: { ...M, fn: (_d, c) => !!c.token } }] }),
  'Toon Table of Contents': spell(search({ fn: (_d, c) => c.def.name.includes('Toon') || c.def.name === 'Manga Ryu-Ran' }), { req: [{ f: DECK({ fn: (_d, c) => c.def.name.includes('Toon') || c.def.name === 'Manga Ryu-Ran' }) }] }),
  'Tornado': spell({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { side: 'opp', zone: 'szone' } }], cond: (d, _c, p) => d.spellTraps(opp(p)).filter((c) => c.zone === 'szone').length >= 3 }),
  'Trade-In': spell({ op: 'draw', who: 'self', n: 2 }, { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', minLv: 8, maxLv: 8 } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', minLv: 8, maxLv: 8 } }] }),
  'Transcendent Wings': spell(ssFrom(['hand', 'deck'], { name: 'Winged Kuriboh LV10' }, { ignore: true }), {
    cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_M, name: 'Winged Kuriboh' } } }, run(async ({ d, p, card }) => { const cs = await d.select(p, 'Send 2 cards from your hand to the Graveyard', d.players[p].hand.filter((c) => c !== card), 2, 2, 'cost'); for (const c of cs) await d.move(c, 'gy', { by: p, why: 'cost' }); }, 0, (d, p, card) => d.players[p].hand.filter((c) => c !== card).length >= 2)],
    req: [{ f: { ...OWN_M, name: 'Winged Kuriboh' } }, { f: { side: 'self', zone: ['hand', 'deck'], name: 'Winged Kuriboh LV10' } }],
  }),
  'Tri-Blaze Accelerator': passive({
    effects: [ign(run(async ({ d, p, o, t }) => {
      const c = t[0];
      if (c && c.zone === 'mzone') await d.destroy(c, 'effect', undefined, p);
      await d.damage(o, 500);
      d.players[p].noAttackTurn = d.turn;
    }, 900), {
      label: 'Send a Pyro: destroy a monster and inflict 500 damage', targets: [{ f: OPP_M }],
      cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Pyro'] } } }],
      req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Pyro'] } }],
    })],
  }, { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, name: 'Blaze Accelerator' } } }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, name: 'Blaze Accelerator' } }] }),
  'Trial of the Princesses': {
    equip: { f: { ...FU, name: ['White Magician Pikeru', 'Ebon Magician Curran'] }, atk: 800 },
    effects: [ign(run(async ({ d, p, card }) => {
      const m = d.equippedTo(card);
      if (!m) return;
      const target = m.def.name === 'White Magician Pikeru' ? 'Princess Pikeru' : 'Princess Curran';
      await d.move(m, 'gy', { why: 'tribute' });
      if (d.onField(card)) await d.move(card, 'gy', { why: 'tribute' });
      await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: target }, p), `Special Summon ${target}`, undefined, true);
    }, 1200), { label: 'Tribute: Special Summon a Princess', cond: (d, c) => { const m = d.equippedTo(c); return !!m && m.data.killedHigh === d.turn; } })],
    postBattle: (d, self, o, r) => { if (o && (d.lvOf(o) >= 5 || (o.def.lv ?? 0) >= 5) && ((r.att === self && r.killedT) || (r.tgt === self && r.killedA))) self.data.killedHigh = d.turn; },
  },
  'Triangle Ecstasy Spark': spell(run(({ d, p, o }) => {
    for (const c of both(d).filter((x) => x.faceUp && d.nameOf(x) === 'Harpie Lady Sisters')) d.addMod(c, 2700 - d.atk(c), 0);
    d.addTemp({ until: d.turn, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind === 'trap' }, negate: (_d, c) => c.def.kind === 'trap' && c.ctrl === o && c.zone === 'szone' });
    void p;
  }, 800), { req: [{ f: { ...FU, name: 'Harpie Lady Sisters' } }] }),
  'Triangle Power': spell(run(({ d, p }) => {
    for (const c of d.find({ ...OWN_FU, mtype: ['normal'] }, p).filter((x) => !x.token && d.lvOf(x) === 1)) d.addMod(c, 2000, 2000);
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { for (const c of d.monsters(p).filter((x) => isNormal(x) && d.lvOf(x) === 1)) await d.destroy(c, 'effect', undefined, p); } });
  }, (d, me) => (d.phase === 'M1' ? d.find({ ...OWN_FU, mtype: ['normal'], maxLv: 1 }, me).length * 600 - 300 : -1)), { req: [{ f: { ...OWN_FU, mtype: ['normal'], maxLv: 1 } }] }),
  'Tribute Doll': spell(run(async ({ d, p, card }) => {
    const c = await ssPick(d, p, d.players[p].hand.filter((x) => x.def.kind === 'monster' && (x.def.lv ?? 0) === 7 && !x.def.noNormal && (x.def.mtype === 'normal' || x.def.mtype === 'effect')), 'Special Summon a Level 7 monster', undefined, false, card);
    if (c) c.noAttackTurn = d.turn;
  }, 1200), { cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', minLv: 7, maxLv: 7 } }] }),
  'Tricky Spell 4': spell(run(async ({ d, p, o }) => {
    await tokens(d, p, tokenDef('Tricky Token', 'Spellcaster', 'WIND', 5, 2000, 1200, { rules: ['cantAttack'] }), d.monsters(o).length, 'def');
  }, (d, me) => d.monsters(opp(me)).length * 500), { cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, name: 'The Tricky' } } }], req: [{ f: { ...OWN_FU, name: 'The Tricky' } }, { f: OPP_M }] }),
  'Twin Swords of Flashing Light - Tryce': {
    equip: { f: FU, atk: -500, rules: ['doubleAttack'] },
    effects: [act({ cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: FU, good: true }], ops: [{ op: 'equip' }] })],
  },
  'Twister': spell({ op: 'destroy', s: { t: 'target' } }, { cost: [{ op: 'payLP', n: 500 }], targets: [{ f: { ...ST, faceUp: true } }] }),
  'Two-Man Cell Battle': passive({
    effects: [trig('endPhase', run(async ({ d }) => {
      const tp = d.tp;
      const c = await pick(d, tp, 'Special Summon a Level 4 Normal Monster', d.players[tp].hand.filter((x) => isNormal(x) && x.def.lv === 4 && d.canSpecial(tp, x)), 'good', true);
      if (c) await d.specialSummon(c, tp, await d.askPos(tp, c));
    }), { cond: (d, c) => d.onField(c) })],
  }),
  'Ultra Evolution Pill': spell(ssFrom(['hand'], { race: ['Dinosaur'] }), { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Reptile'] } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Dinosaur'] } }] }),
  'Union Attack': spell(run(({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    const mv = c.mv;
    d.addTemp({ until: d.turn, p, lock: {
      attack: (_d, _s, a) => a.ctrl === p && a !== c && a.pos === 'atk',
      battleDmg: (_d, _s, att, _t, n, to) => (att === c && att.mv === mv && to === o ? 0 : n),
    } });
    const bonus = d.find({ ...OWN_FU, pos: 'atk' }, p).filter((x) => x !== c).reduce((s, x) => s + d.atk(x), 0);
    d.addMod(c, bonus, 0, d.turn, 'bp');
  }, -1), { targets: [{ f: OWN_FU, good: true }] }),
  'Unity': spell(run(({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    const total = d.find(OWN_FU, p).reduce((s, x) => s + (x.def.def ?? 0), 0);
    d.addMod(c, 0, total - d.defv(c));
  }, 300), { targets: [{ f: OWN_M, good: true }] }),
  'Unleash Your Power!': spell(run(({ d, p }) => {
    for (const c of d.monsters(p).filter((x) => x.faceUp && d.dormant(x))) {
      c.data.gemini = true;
      atEndPhase(d, c, async (x) => { x.pos = 'def'; await d.setFaceDown(x); });
    }
  }, 500), { req: [{ f: { ...OWN_FU, ability: 'gemini' } }] }),
  'Valhalla, Hall of the Fallen': passive({ effects: [ign(ssFrom(['hand'], { race: ['Fairy'] }), { label: 'Special Summon a Fairy', opt: true, cond: (d, c) => d.monsters(c.ctrl).length === 0 })] }),
  'Vehicroid Connection Zone': spell(run(async ({ d, p, card }) => {
    const f = await fuse(d, p, card, { f: (x) => x.def.name.includes('roid') });
    if (f) { const mv = f.mv; permLock(d, f, { indestructible: (_d, _s, c, by) => c === f && c.mv === mv && by === 'effect' }); }
  }, 1500, (d, p, card) => canFuse(d, p, card, { f: (x) => x.def.name.includes('roid') }))),
  'Veil of Darkness': passive({
    effects: [trig('anyDraw', run(async ({ d, p }) => {
      const c = d.players[p].hand[d.players[p].hand.length - 1];
      if (!c || c.def.attr !== 'DARK' || c.def.kind !== 'monster') return;
      await d.reveal(opp(p), [c], 'Veil of Darkness');
      await d.move(c, 'gy', { by: p });
      await d.draw(p, 1);
    }, 300), { optional: true, cond: (d, card, _p, ev) => ev?.e === 'draw' && ev.dp && ev.player === card.ctrl && d.phase === 'DP' && d.players[card.ctrl].hand[d.players[card.ctrl].hand.length - 1]?.def.attr === 'DARK' })],
  }),
  'Venom Shot': spell(run(async ({ d, p, t }) => {
    const r = await pick(d, p, 'Send a Reptile from your Deck to the Graveyard', d.find(DECK({ kind: 'monster', race: ['Reptile'] }), p), 'cost');
    if (r) { await d.move(r, 'gy', { by: p }); await d.shuffleDeck(p); }
    if (t[0]) addCtr(d, t[0], 2, 'venom');
  }, 600), { cond: (d, _c, p) => d.find({ ...OWN_FU, fn: (_d, c) => c.def.name.startsWith('Venom') || c.def.name.startsWith('Vennomin') }, p).length > 0, targets: [{ f: OPP_FU }], req: [{ f: DECK({ kind: 'monster', race: ['Reptile'] }) }] }),
  'Venom Swamp': {
    auraFn: (_d, _s, c) => (ctr(c, 'venom') ? { atk: -500 * ctr(c, 'venom') } : undefined),
    effects: [trig('endPhase', run(async ({ d, p }) => {
      for (const m of both(d)) if (m.faceUp && !m.def.name.startsWith('Venom')) addCtr(d, m, 1, 'venom');
      for (const m of both(d)) if (m.faceUp && ctr(m, 'venom') && d.atk(m) === 0) await d.destroy(m, 'effect', undefined, p);
    }), { cond: (d, c) => d.onField(c) })],
  },
  'Vicious Claw': {
    equip: {
      f: FU, atk: 300, sub: 'battle',
      onSub: async (d, eq, m) => {
        const p = eq.ctrl;
        const foe = d.battle ? (d.battle.att === m ? d.battle.tgt : d.battle.att) : null;
        await d.toHand(eq);
        d.addTemp({ until: d.turn, p, lock: { activate: (_d, _s, q, c) => q === p && c.def.name === 'Vicious Claw' } });
        const x = await pick(d, p, 'Destroy 1 monster', both(d).filter((c) => c !== foe), 'bad');
        if (x) await d.destroy(x, 'effect', undefined, p);
        await d.damage(opp(p), 600);
        await tokens(d, opp(p), tokenDef('Evil Token', 'Fiend', 'DARK', 7, 2500, 2500), 1, 'atk');
      },
    },
  },
  'Wave-Motion Cannon': passive({
    effects: [ign(run(async ({ d, o, card }) => { const n = card.data.standbys ?? 0; await d.move(card, 'gy', { why: 'cost' }); await d.damage(o, 1000 * n); }, (d, me, c) => ((c.data.standbys ?? 0) * 1000 >= d.players[opp(me)].lp || (c.data.standbys ?? 0) >= 4 ? 2000 : -1)), { label: 'Send to the GY: inflict damage' })],
  }),
  'Weapon Change': passive({
    effects: [trig('standby', run(async ({ d, p }) => {
      const c = await pick(d, p, 'Switch ATK and DEF', d.find({ ...OWN_FU, race: ['Warrior', 'Machine'] }, p), 'good');
      if (c) { c.data.swapUntil = d.turn + 1; d.log(`${c.def.name}'s ATK and DEF are switched.`); }
    }), { optional: true, cost: [{ op: 'payLP', n: 700 }], cond: (d, c) => d.onField(c) && d.find({ ...OWN_FU, race: ['Warrior', 'Machine'] }, c.ctrl).length > 0 })],
  }),
  'Wetlands': { aura: [{ f: { ...M, race: ['Aqua'], attr: 'WATER', maxLv: 2 }, atk: 1200 }] },
  'White Dragon Ritual': ritual('Paladin of White Dragon'),
  'Wicked-Breaking Flamberge - Baou': {
    equip: { f: FU, atk: 500 },
    postBattle: (d, self, o, r) => { if (o && ((r.att === self && r.killedT) || (r.tgt === self && r.killedA))) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, c) => c === o && c.mv === mv }); } },
    effects: [act({ cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: FU, good: true }], ops: [{ op: 'equip' }] })],
  },
  'Wild Fire': spell(run(async ({ d, p }) => {
    const b = d.find({ side: 'self', zone: 'szone', faceUp: true, name: 'Blaze Accelerator' }, p)[0];
    if (!b || !(await d.destroy(b, 'effect', undefined, p))) return;
    for (const c of both(d)) await d.destroy(c, 'effect', undefined, p);
    await tokens(d, p, tokenDef('Wild Fire Token', 'Pyro', 'FIRE', 3, 1000, 1000), 1, 'atk');
    d.players[p].noAttackTurn = d.turn;
  }, (d, me) => scoreWipe(d, me, () => true)), { cost: [{ op: 'payLP', n: 500 }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, name: 'Blaze Accelerator' } }] }),
  "Wild Nature's Release": spell(run(({ d, p, t }) => { const c = t[0]; if (c && c.zone === 'mzone') { d.addMod(c, d.defv(c), 0); destroyAtEnd(d, c, p); } }, (d) => (d.phase === 'M1' ? 500 : -1)), { targets: [{ f: { ...FU, race: ['Beast', 'Beast-Warrior'] }, good: true }] }),
  'Yellow Luster Shield': passive({ aura: [{ f: { side: 'self', zone: 'mzone' }, def: 300 }] }),
  'Yu-Jo Friendship': spell(run(async ({ d, p, o }) => {
    const unity = d.players[p].hand.some((c) => c.def.name === 'Unity');
    const accept = unity || (await d.ask<boolean>(o, { t: 'yesno', kind: 'choice', text: 'Accept the handshake?', ai: d.players[o].lp < d.players[p].lp }));
    if (!accept) { d.log(`${d.name(o)} refuses the handshake.`); return; }
    const half = Math.floor((d.players[p].lp + d.players[o].lp) / 2);
    await d.changeLP(p, half - d.players[p].lp);
    await d.changeLP(o, half - d.players[o].lp);
  }, (d, me) => (d.players[opp(me)].lp - d.players[me].lp) / 2)),
};
void OPP_M; void ST; void ign; void scoreWipe;
