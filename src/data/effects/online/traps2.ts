// YGO Online Traps, part 2 (Dark Scorpion Combination … Interdimensional Warp).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  act, addCtr, attackOf, both, boundRevive, ctr, declareAttr, destroyAll, destroyAtEnd, grantRule, has, isAttackOn,
  opp, passive, pick, pickSeen, placeA, quick, randomOf, run, scoreWipe, spell, ssFrom, ssPick, threat, trapEquip, trapMonster, trig, union,
  atEndPhase, castCopy,
} from './olib';

const trap = spell;
const SCORPIONS = ['Don Zaloog', 'Cliff the Trap Remover', 'Dark Scorpion - Chick the Yellow', 'Dark Scorpion - Gorg the Strong', 'Dark Scorpion - Meanae the Thorn'];
const virus = (kinds: (d: Duel, c: Card, choice: number) => boolean, tribMin: number, choose: boolean): Def => trap(run(async ({ d, p, o, link }) => {
  const choice = choose ? await d.option(p, 'Choose a card type', ['Spell Cards', 'Trap Cards']) : 0;
  const hit = (c: Card) => kinds(d, c, choice);
  for (const c of d.fieldCards(o)) if (hit(c)) await d.destroy(c, 'effect', undefined, p);
  await d.reveal(p, d.players[o].hand, "Opponent's hand");
  for (const c of d.players[o].hand.filter(hit)) await d.move(c, 'gy', { by: p });
  d.addTemp({ until: d.turn + 6, p: o, draw: async (dd, s, cards) => { if (s !== o) return; await dd.reveal(p, cards, 'Drawn card'); for (const c of cards.filter(hit)) await dd.move(c, 'gy', { by: p }); } });
  void link;
}, 1500), {
  cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'DARK', minAtk: tribMin } } }],
  req: [{ f: { ...OWN_FU, attr: 'DARK', minAtk: tribMin } }],
});
const destroyAtk = (ev: { e: string }) => ev;

export const TRAPS_2: Record<string, Def> = {
  'Dark Scorpion Combination': trap(run(({ d, p }) => {
    const ids: number[] = [];
    for (const m of d.monsters(p)) if (m.faceUp && SCORPIONS.includes(m.def.name)) { grantRule(d, m, 'direct'); ids.push(m.uid); }
    d.addTemp({ until: d.turn, p, lock: { battleDmg: (_d, _s, att, tgt, n, to) => (!tgt && ids.includes(att.uid) && to !== p ? 400 : n) } });
  }, 1000), { cond: (d, _c, p) => SCORPIONS.every((n) => has(d, p, n)) }),
  'Dark Spirit Art - Greed': trap(run(async ({ d, p, o }) => {
    const sp = d.players[o].hand.filter((c) => c.def.kind === 'spell');
    if (sp.length && (await d.confirm(o, 'Reveal a Spell Card to negate Dark Spirit Art - Greed?'))) { await d.reveal(p, [sp[0]], 'Revealed Spell'); d.log('The effect is negated.'); return; }
    await d.draw(p, 2);
  }, 600), { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'DARK' } } }] }),
  'Deck Devastation Virus': virus((_d, c) => c.def.kind === 'monster' && (c.zone === 'mzone' ? c.faceUp || true : true) && (c.def.atk ?? 0) <= 1500, 2000, false),
  'Defensive Tactics': trap(run(async ({ d, p, card }) => {
    d.addTemp({ until: d.turn, p, tag: 'noBattleDmg' });
    d.addTemp({ until: d.turn, lock: { indestructible: (_d, _s, c, by) => by === 'battle' && c.ctrl === p } });
    await d.move(card, 'deck', { bottom: true });
  }, (d, me, _c, ev) => threat(d, me, ev)), { cond: (d, _c, p) => d.find({ ...OWN_M, set: 'Gladiator Beast' }, p).length > 0 }),
  'Des Counterblow': passive({ effects: [trig('anyBattleDamage', run(async ({ d, p, link }) => { const ev = link.ev; if (ev.e === 'damage' && ev.src && ev.src.zone === 'mzone') await d.destroy(ev.src, 'effect', undefined, p); }), { cond: (_d, _c, _p, ev) => ev?.e === 'damage' && !!ev.direct })] }),
  'Desert Sunlight': trap(run(async ({ d, p }) => { for (const c of d.monsters(p)) { if (!c.faceUp) await d.changePos(c, 'reveal'); if (c.pos !== 'def') await d.changePos(c, 'def', false); } }, (d, me, _c, ev) => threat(d, me, ev) / 2), { req: [{ f: OWN_M }] }),
  'Destiny Mirage': trap(run(async ({ d, p, card }) => {
    for (const c of d.players[p].gy.filter((x) => x.def.name.includes('Destiny Hero') && x.mark.destroyedTurn === d.turn)) { if (!d.canSpecial(p, c)) break; await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card); }
  }, 1000), { when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.card.def.name.includes('Destiny Hero') && ev.why === 'effect' && ev.by === opp(p) }),
  'Destiny Signal': trap(ssFrom(['hand', 'deck'], { set: 'Destiny Hero', maxLv: 4 }), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.from === 'mzone' }),
  'Destruction Jammer': trap({ op: 'negate' }, {
    cost: [{ op: 'discard', who: 'self', n: 1 }],
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'destroy' && 's' in o && (o.s.t === 'target' || ('f' in o.s && (o.s.f.zone === 'mzone' || o.s.f.kind === 'monster' || (!o.s.f.zone && !o.s.f.st))))),
  }),
  'Destruction of Destiny': trap(run(async ({ d, p }) => {
    const top = d.players[p].deck.slice(-3);
    await d.mill(p, 3, p);
    await d.damage(p, 1000 * top.filter((c) => c.def.kind !== 'monster').length);
  }, -1)),
  'Destruction Ring': trap(run(async ({ d, p, o, t }) => { if (t[0] && (await d.destroy(t[0], 'effect', undefined, p))) { await d.damage(p, 1000); await d.damage(o, 1000); } }, (d, me) => (d.players[opp(me)].lp <= 1000 && d.players[me].lp > 1000 ? 5000 : -1)), { targets: [{ f: OWN_FU }] }),
  'Destructive Draw': passive({
    effects: [
      trig('anyDraw', run(({ d, link }) => { const ev = link.ev; if (ev.e === 'draw') return d.draw(ev.player, 1); }), { optional: true, cond: (d, _c, _p, ev) => ev?.e === 'draw' && ev.dp && d.phase === 'DP' && d.players[ev.player].hand.length === 1 }),
      trig('endPhase', run(({ d, card }) => d.changeLP(card.ctrl, -Math.min(700, d.players[card.ctrl].lp))), { cond: (d, c) => d.onField(c) && d.tp === c.ctrl }),
      trig('leftField', run(({ d, card }) => d.damage(card.ctrl, 3000)), { cond: (_d, c) => !!c.mark.lastFaceUp }),
    ],
  }),
  'Detonator Circle "A"': trap(run(async ({ d, p, o, t }) => { if (t[0] && (await d.destroy(t[0], 'effect', undefined, p))) { await d.damage(p, 1000); await d.damage(o, 1000); } }, 300), { targets: [{ f: { ...FU, fn: (_d, c) => ctr(c, 'A') > 0 } }] }),
  'Dice Re-Roll': trap(run(({ d }) => { d.flags.reroll = (d.flags.reroll ?? 0) + 1; }, -1)),
  'Dice Try!': trap({ op: 'negate' }, { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && /die|dice/i.test(ev.link.card.def.text) }),
  'Dimension Wall': trap(run(({ d, p, o }) => d.addTemp({ until: d.turn, p, lock: { battleDmg: (dd, _s, _a, _t, n, to) => { if (to !== p) return n; dd.deferred.push(() => dd.damage(o, n, null, true)); return 0; } } }), (d, me, _c, ev) => threat(d, me, ev) + 300), { on: ['oppAttack'] }),
  'Dimensional Inversion': trap(run(async ({ d, p, card, link }) => {
    const ev = link.ev;
    void ev;
    await ssPick(d, p, d.players[p].banished.filter((c) => c.def.kind === 'monster' && c.mark.from !== undefined && c.turnIn === d.turn && c.owner === p), 'Special Summon a banished monster', undefined, false, card);
  }, 800), { cond: (d, _c, p) => d.players[p].banished.some((c) => c.def.kind === 'monster' && c.turnIn === d.turn) }),
  'Dimensional Prison': trap({ op: 'banish', s: { t: 'event' } }, { on: ['oppAttack'], ai: (d, me, _c, ev) => threat(d, me, ev) + (ev.e === 'attack' ? ev.attacker.def.atk ?? 0 : 0) }),
  'Disappear': trap({ op: 'banish', s: { t: 'target' } }, { targets: [{ f: { side: 'opp', zone: 'gy' } }] }),
  'Disarm': trap({ op: 'negate' }, {
    on: ['activateSpell'],
    cost: [run(async ({ d, p }) => { const c = await pick(d, p, 'Return a Gladiator Beast to the Deck', d.find({ side: 'self', zone: 'hand', kind: 'monster', set: 'Gladiator Beast' }, p), 'cost'); if (c) { await d.move(c, 'deck'); await d.shuffleDeck(p); } }, 0, (d, p) => d.find({ side: 'self', zone: 'hand', kind: 'monster', set: 'Gladiator Beast' }, p).length > 0)],
  }),
  'Disarmament': trap(run(async ({ d, p }) => { for (const c of [...d.spellTraps(0), ...d.spellTraps(1)].filter((x) => x.equipTo !== undefined)) await d.destroy(c, 'effect', undefined, p); }, (d, me) => d.spellTraps(opp(me)).filter((c) => c.equipTo !== undefined).length * 600 - d.spellTraps(me).filter((c) => c.equipTo !== undefined).length * 600)),
  'Disturbance Strategy': trap(run(async ({ d, o }) => { const n = d.players[o].hand.length; for (const c of [...d.players[o].hand]) await d.move(c, 'deck'); await d.shuffleDeck(o); await d.draw(o, n); }, 50), { req: [{ f: { side: 'opp', zone: 'hand' } }] }),
  'Divine Wrath': trap({ op: 'negate' }, { cost: [{ op: 'discard', who: 'self', n: 1 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && !ev.link.isCard && ev.link.card.def.kind === 'monster' }),
  'DNA Transplant': passive({ attrFn: (_d, src) => src.data.attr }, { ops: [run(async ({ d, p, card }) => { card.data.attr = await declareAttr(d, p, 'Declare an Attribute', both(d)); })] }),
  'Dora of Fate': trap(run(({ d, p, o, t }) => {
    const x = t[0];
    if (!x) return;
    const lv = d.lvOf(x);
    d.addTemp({ until: d.turn + 1, p, summon: async (dd, c, how, s) => { if (s === p && how === 'normal' && dd.tp === p && (c.def.lv ?? 0) === lv - 1) await dd.damage(o, lv * 500); } });
  }, 200), { cond: (d, _c, p) => d.tp !== p, targets: [{ f: OPP_FU }] }),
  'Double Tag Team': trap(ssFrom(['hand', 'deck'], { set: 'Gladiator Beast', maxLv: 4 }), { when: (_d, ev, p) => ev.e === 'summon' && ev.player === p && ev.how === 'special' && ev.cards.some((c) => c.def.name.includes('Gladiator Beast')) }),
  'Double-Edged Sword Technique': trap(run(async ({ d, p, card, link }) => {
    for (const c of (link.targets[0] ?? []).filter((x, k) => x.mv === link.tmv[0][k] && x.zone === 'gy')) {
      if (!(await d.specialSummon(c, p, 'atk', 'special', false, card))) continue;
      atEndPhase(d, c, async (x) => { const a = d.atk(x); if (await d.destroy(x, 'effect', undefined, p)) await d.damage(p, a); });
    }
  }, 600), { targets: [{ f: { ...GY_M('self'), set: 'Six Samurai' }, n: 2, good: true }], cond: (d, _c, p) => d.freeCount(p, 'm') >= 2 }),
  "Dragon's Rage": passive({ lock: { grants: (d, src, c, r) => !!src && r === 'pierce' && c.ctrl === src.ctrl && d.raceOf(c) === 'Dragon' } }),
  'Draining Shield': trap([{ op: 'negateAttack' }, run(({ d, p, link }) => { const ev = attackOf(link.ev); if (ev) return d.heal(p, d.atk(ev.attacker)); })], { on: ['oppAttack'], ai: (d, me, _c, ev) => threat(d, me, ev) + 400 }),
  'Dramatic Rescue': trap(run(async ({ d, p, card, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const t = ev.link.targets.flat().find((c) => c.zone === 'mzone' && (c.def.name.includes('Amazoness') || c.def.name === 'Amazon Archer'));
    if (!t) return;
    await d.toHand(t);
    await ssPick(d, p, d.players[p].hand.filter((c) => c !== t), 'Special Summon a monster from your hand', undefined, false, card);
  }, 800), { when: (_d, ev) => ev.e === 'chain' && ev.link.targets.flat().some((c) => c.zone === 'mzone' && (c.def.name.includes('Amazoness') || c.def.name === 'Amazon Archer')) }),
  'Drastic Drop Off': trap(run(async ({ d, o }) => {
    const c = await pick(d, o, 'Discard 1 of the drawn cards', d.players[o].hand.filter((x) => x.turnIn === d.turn), 'cost');
    if (c) await d.discard(o, [c], opp(o));
  }, 500), { when: (_d, ev, p) => ev.e === 'draw' && ev.player !== p }),
  'Drop Off': trap(run(async ({ d, o }) => {
    const c = d.players[o].hand[d.players[o].hand.length - 1];
    if (c && c.turnIn === d.turn) await d.discard(o, [c], opp(o));
  }, 500), { cond: (d, _c, p) => d.phase === 'DP' && d.tp !== p }),
  'Edge Hammer': trap(run(async ({ d, p, o, t }) => { const c = t[0]; if (c && (await d.destroy(c, 'effect', undefined, p))) await d.damage(o, c.def.atk ?? 0); }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => (c.def.atk ?? 0) * 2))), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Elemental Hero Bladedge' } } }], targets: [{ f: OPP_M }],
  }),
  'Elemental Absorber': passive({
    lock: { attack: (d, src, a) => !!src && a.ctrl !== src.ctrl && d.attrOf(a) === src.data.attr },
  }, {
    cost: [run(async ({ d, p, card, link }) => { const c = await pick(d, p, 'Banish a monster from your hand', d.players[p].hand.filter((x) => x.def.kind === 'monster'), 'cost'); if (c) { link.data.attr = c.def.attr; await d.banish(c, p); } }, 0, (d, p) => d.players[p].hand.some((x) => x.def.kind === 'monster'))],
    ops: [run(({ card, link }) => { card.data.attr = link.data.attr; })],
  }),
  'Elemental Burst': trap(destroyAll({ side: 'opp' }), {
    cost: (['WIND', 'WATER', 'FIRE', 'EARTH'] as const).map((attr) => ({ op: 'tribute' as const, s: { t: 'choose' as const, f: { ...OWN_M, attr } } })),
    req: (['WIND', 'WATER', 'FIRE', 'EARTH'] as const).map((attr) => ({ f: { ...OWN_FU, attr } })),
  }),
  'Elemental Recharge': trap(run(({ d, p }) => d.heal(p, 1000 * d.find({ ...OWN_FU, set: 'Elemental Hero' }, p).length), 600), { req: [{ f: { ...OWN_FU, set: 'Elemental Hero' } }] }),
  'Eliminating the League': trap(run(async ({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    const name = c.def.name;
    if (await d.destroy(c, 'effect', undefined, p)) { await d.reveal(p, d.players[o].hand, "Opponent's hand"); for (const h of d.players[o].hand.filter((x) => x.def.name === name)) await d.move(h, 'gy', { by: p }); }
  }, 900), {
    targets: [{ f: OPP_FU }],
    cost: [run(async ({ d, p, card }) => { const c = await pick(d, p, 'Discard a Spell Card', d.players[p].hand.filter((x) => x !== card && x.def.kind === 'spell'), 'cost'); if (c) await d.discard(p, [c], null); }, 0, (d, p) => d.players[p].hand.some((x) => x.def.kind === 'spell'))],
  }),
  'Embodiment of Apophis': {
    effects: [act({ cond: (d) => d.phase === 'M1' || d.phase === 'M2', ops: [run(async ({ d, p, card }) => { await trapMonster(d, card, p, { race: 'Reptile', attr: 'EARTH', lv: 4, atk: 1600, def: 1800, mtype: 'normal' }); }, 500)] })],
  },
  'Energy Drain': trap(run(({ d, o, t }) => { const c = t[0]; if (c) { const n = 200 * d.players[o].hand.length; d.addMod(c, n, n); } }, (d, me) => d.players[opp(me)].hand.length * 150), { targets: [{ f: OWN_FU, good: true }] }),
  'Energy-Absorbing Monolith': trap(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { noDamage: (dd, _s, s, battle) => !battle && s === p && dd.chain.length > 0 } }), 800), {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'damage' && (o.who === 'opp' || o.who === 'both')),
  }),
  'Enervating Mist': passive({
    effects: [trig('leftField', run(({ d, card }) => { delete d.flags[`handLimit:${opp(card.ctrl)}`]; }))],
  }, { ops: [run(({ d, o }) => { d.flags[`handLimit:${o}`] = 5; }, 300)] }),
  'Eradicator Epidemic Virus': virus((_d, c, choice) => c.def.kind === (choice ? 'trap' : 'spell'), 2500, true),
  'Escape from the Dark Dimension': boundRevive({ side: 'self', zone: 'banished', kind: 'monster', attr: 'DARK' }, { banishOnLeave: true }),
  'Eternal Dread': trap(run(({ d, p }) => { for (const c of d.spellTraps(p).concat(d.spellTraps(opp(p)))) if (c.faceUp && c.def.name === 'Clock Tower Prison') addCtr(d, c, 2, 'clock'); }, 500), {
    cond: (d) => [...d.spellTraps(0), ...d.spellTraps(1)].some((c) => c.faceUp && c.def.name === 'Clock Tower Prison'),
  }),
  'Evil Blast': {
    effects: [act({ when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip', req: [{ f: OWN_FU }], ops: [run(async ({ d, p, card }) => {
      const m = await pick(d, p, 'Equip Evil Blast', d.find(OWN_FU, p), 'good');
      if (m) await trapEquip(d, card, m, { atk: 500 });
    }, 500)] }), trig('oppStandby', { op: 'damage', who: 'opp', n: 500 }, { cond: (d, c) => d.onField(c) && c.equipTo !== undefined })],
  },
  'Exchange of the Spirit': trap(run(async ({ d }) => {
    for (const s of [0, 1] as Side[]) {
      const P = d.players[s];
      const gy = [...P.gy], deck = [...P.deck];
      P.gy = []; P.deck = [];
      for (const c of deck) { c.zone = 'gy'; c.faceUp = true; c.mv++; P.gy.push(c); }
      for (const c of gy) { c.zone = 'deck'; c.faceUp = false; c.mv++; P.deck.push(c); }
      await d.shuffleDeck(s);
      d.log(`${d.name(s)}'s Graveyard and Deck are swapped.`);
    }
  }, (d, me) => (d.players[opp(me)].gy.length < 8 ? 1500 : -1)), { cost: [{ op: 'payLP', n: 1000 }], cond: (d, _c, p) => d.players[p].gy.length >= 15 }),
  'Exhausting Spell': trap(run(({ d }) => { for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) if (c.data.ctr?.spell) c.data.ctr.spell = 0; d.log('All Spell Counters are removed.'); }, (d, me) => d.fieldCards(opp(me)).reduce((s, c) => s + ctr(c), 0) * 200 - 100)),
  'Fatal Abacus': passive({ effects: [trig('anyToGY', run(({ d, link }) => { const ev = link.ev; if (ev.e === 'sent') return d.damage(ev.owner, 500); }), { cond: (_d, _c, _p, ev) => ev?.e === 'sent' && ev.from === 'mzone' && ev.card.def.kind === 'monster' })] }),
  'Feather Wind': trap({ op: 'negate' }, { on: ['activateST'], cond: (d, _c, p) => has(d, p, 'Elemental Hero Avian') }),
  'Fiend Comedian': trap(run(async ({ d, p, o }) => {
    if ((await d.call(p))) { for (const c of [...d.players[o].gy]) await d.banish(c, p); }
    else await d.mill(p, d.players[o].gy.length, p);
  }, (d, me) => d.players[opp(me)].gy.length * 50 - 300)),
  "Fiend's Hand Mirror": trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const old = ev.link.targets[0]?.[0];
    const eff = ev.link.eff;
    const cands = d.targetCands(eff, 0, ev.link.p, ev.link.card).filter((c) => c !== old);
    const n = await pick(d, p, 'Select the new target', cands, 'bad');
    if (n) { ev.link.targets[0] = [n]; ev.link.tmv[0] = [n.mv]; d.log(`The target becomes ${n.faceUp ? n.def.name : 'a face-down card'}.`); }
  }, 500), { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.card.def.kind === 'spell' && ev.link.targets.length === 1 && ev.link.targets[0].length === 1 && (ev.link.targets[0][0].zone === 'szone' || ev.link.targets[0][0].zone === 'fzone') }),
  'Final Attack Orders': passive({
    lock: { pos: () => true },
    onSummon: async (d, _s, c) => { if (c.faceUp && c.pos === 'def') await d.changePos(c, 'atk'); },
  }, { ops: [run(async ({ d }) => { for (const c of both(d)) if (c.faceUp && c.pos === 'def') await d.changePos(c, 'atk'); }, 200)] }),
  'Fine': trap({ op: 'discard', who: 'self', n: 2 }, { ai: -1, req: [{ f: { side: 'self', zone: 'hand' }, n: 2 }] }),
  'Fire Darts': trap(run(async ({ d, o }) => { const n = (await d.die()) + (await d.die()) + (await d.die()); await d.damage(o, n * 100); }, 1000), { cond: (d, c, p) => d.players[p].hand.filter((x) => x !== c).length === 0 }),
  'Firewall': passive({
    upkeep: 500,
    effects: [{ type: 'quick', from: ['szone'], label: 'Banish a Pyro: negate the direct attack', ops: [{ op: 'negateAttack' }],
      cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), race: ['Pyro'] } } }],
      when: (_d, ev, p) => isAttackOn(ev, p) && !ev.target, ai: (d, me, _c, ev) => threat(d, me, ev) }],
  }),
  'Flashbang': trap(run(({ d }) => { d.battleEnded = true; d.skipM2 = true; d.log('It becomes the End Phase.'); }, 500), { when: (_d, ev, p) => ev.e === 'damage' && ev.battle && !!ev.direct && ev.player === p }),
  'Foolish Revival': trap(run(async ({ d, o, card, t }) => { const c = t[0]; if (c && c.zone === 'gy' && d.canSpecial(o, c)) await d.specialSummon(c, o, 'def', 'special', false, card); }, -1), { targets: [{ f: GY_M('opp') }] }),
  'Forced Back': trap(run(async ({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'summoning') return;
    ev.negated = true;
    d.log('The Summon is negated.');
    for (const c of ev.cards) if (d.onField(c)) await d.toHand(c);
  }, 900), { when: (_d, ev, p) => ev.e === 'summoning' && ev.player !== p && (ev.how === 'normal' || ev.how === 'flip') && !ev.negated }),
  'Forced Ceasefire': trap(run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (_d, _s, _p, c) => c.def.kind === 'trap' } }), 200), { cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  'Formation Union': trap(run(async ({ d, p }) => {
    const free = d.find(OWN_FU, p).filter((c) => c.def.ability === 'union');
    const eq = d.spellTraps(p).filter((c) => c.def.ability === 'union' && c.equipTo !== undefined);
    const i = free.length && eq.length ? await d.option(p, 'Formation Union', ['Equip a Union monster', 'Unequip a Union monster']) : free.length ? 0 : 1;
    if (i === 0) {
      const u = await pick(d, p, 'Select a Union monster', free, 'good');
      const eff = u?.def.effects?.[0];
      const f = eff?.targets?.[0]?.f;
      const t = u && f ? await pick(d, p, 'Equip it to', d.find(f, p, u), 'good') : undefined;
      if (u && t && u.def.equip !== undefined) await d.equipCard(u, t, u.def.equip, p);
      else if (u && t) await d.equipCard(u, t, { sub: true }, p);
    } else {
      const u = await pick(d, p, 'Unequip a Union monster', eq, 'good');
      if (u) { u.equipTo = undefined; u.eq = undefined; await d.specialSummon(u, p, 'atk'); }
    }
  }, 300), { cond: (d, _c, p) => d.find(OWN_FU, p).some((c) => c.def.ability === 'union') || d.spellTraps(p).some((c) => c.def.ability === 'union' && c.equipTo !== undefined) }),
  'Fossil Excavation': boundRevive({ ...GY_M('self'), race: ['Dinosaur'] }, { negate: true, cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  'Froggy Forcefield': trap(destroyAll({ ...OPP_M, pos: 'atk' }), { when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && ev.target.def.name.includes('Frog') && ev.target.def.name !== 'Frog the Jam' }),
  'Frozen Soul': trap(run(({ d, o }) => d.addTemp({ until: d.turn + (d.tp === o ? 2 : 1), tag: 'noBP', p: o }), 600), { cond: (d, _c, p) => d.players[opp(p)].lp - d.players[p].lp >= 2000 }),
  "Fruits of Kozaky's Studies": trap(run(async ({ d, p }) => {
    const deck = d.players[p].deck;
    const top = deck.splice(-Math.min(3, deck.length));
    const order = await d.select(p, 'Choose the new top card first', top, top.length, top.length, 'good', undefined, undefined, true, true);
    deck.push(...order.reverse());
  }, 50)),
  'Fuh-Rin-Ka-Zan': trap(run(async ({ d, p, o }) => {
    const i = await d.option(p, 'Fuh-Rin-Ka-Zan', ['Destroy all opponent monsters', 'Destroy all opponent Spells/Traps', 'Discard 2 random cards', 'Draw 2 cards'], d.monsters(o).length ? 0 : 3);
    if (i === 0) for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
    else if (i === 1) for (const c of d.spellTraps(o)) await d.destroy(c, 'effect', undefined, p);
    else if (i === 2) for (let k = 0; k < 2; k++) { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }
    else await d.draw(p, 2);
  }, 2000), { cond: (d) => (['WIND', 'WATER', 'FIRE', 'EARTH'] as const).every((a) => both(d).some((c) => c.faceUp && d.attrOf(c) === a)) }),
  'Full Salvo': trap(run(async ({ d, p, o, card }) => {
    const hand = d.players[p].hand.filter((c) => c !== card);
    for (const c of hand) await d.move(c, 'gy', { by: p });
    await d.damage(o, 200 * hand.length);
  }, (d, me) => d.players[me].hand.length * 200 - d.players[me].hand.length * 150)),
  'Fusion Guard': trap([{ op: 'negate' }, run(async ({ d, p }) => { const c = randomOf(d, d.players[p].extra); if (c) await d.move(c, 'gy', { by: p }); })], {
    when: (_d, ev) => ev.e === 'chain' && ev.link.eff.ops.some((o) => o.op === 'damage' || o.op === 'damageAtk'), req: [{ f: { side: 'self', zone: 'extra' } }],
  }),
  'Gem Flash Energy': passive({ effects: [trig('standby', run(({ d, o }) => d.damage(o, 300 * [...d.spellTraps(0), ...d.spellTraps(1)].filter((c) => c.faceUp && (c.def.stype === 'continuous' && c.def.kind === 'spell' || c.data.asSpell)).length)), { cond: (d, c) => d.onField(c) })] }),
  'Gemini Trap Hole': trap(destroyAll(OPP_M), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.card.def.ability === 'gemini' && !!ev.card.last.gemini }),
  'Generation Shift': trap(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c) return;
    const name = c.def.name;
    if (await d.destroy(c, 'effect', undefined, p)) { const x = d.find(DECK({ name }), p)[0]; if (x) { await d.toHand(x); await d.shuffleDeck(p); } }
  }, 100), { targets: [{ f: OWN_FU }] }),
  'Gift Card': trap({ op: 'heal', who: 'opp', n: 3000 }, { ai: -1 }),
  'Gladiator Lash': trap(run(async ({ d, o }) => { const c = await pick(d, o, 'Discard 1 card', d.players[o].hand, 'cost'); if (c) await d.discard(o, [c], opp(o)); }, 500), {
    when: (_d, ev, p) => ev.e === 'summon' && ev.player === p && ev.how === 'special' && ev.cards.some((c) => c.def.name.includes('Gladiator Beast')),
  }),
  'Glorious Illusion': (() => {
    const b = boundRevive({ ...GY_M('self'), set: 'Lightsworn' }, { pos: 'atk' });
    b.effects!.push(trig('endPhase', { op: 'mill', who: 'self', n: 2 }, { cond: (d, c) => d.onField(c) && d.tp === c.ctrl }));
    return b;
  })(),
  'Goblin Out of the Frying Pan': trap(run(async ({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    ev.link.negated = true;
    ev.link.activationNegated = true;
    if (d.onField(ev.link.card)) await d.toHand(ev.link.card);
  }, 800), { on: ['activateSpell'], cost: [{ op: 'payLP', n: 500 }] }),
  'Good Goblin Housekeeping': trap(run(async ({ d, p }) => {
    await d.draw(p, d.players[p].gy.filter((c) => c.def.name === 'Good Goblin Housekeeping').length + 1);
    const c = await pick(d, p, 'Return a card to the bottom of your Deck', d.players[p].hand, 'cost');
    if (c) await d.move(c, 'deck', { bottom: true });
  }, 400)),
  "Gorgon's Eye": trap(run(({ d }) => d.addTemp({ until: d.turn, negate: (_d, c) => c.zone === 'mzone' && c.pos === 'def' }), 200)),
  'Grave Lure': trap(run(async ({ d, p, o }) => {
    const top = d.players[o].deck[d.players[o].deck.length - 1];
    if (!top) return;
    await d.reveal(p, [top], 'Grave Lure');
    top.mark.lured = true;
    await d.shuffleDeck(o);
    d.addTemp({ until: 1e9, p: o, draw: async (dd, s, cards) => { for (const c of cards) if (c.mark.lured && s === o) { delete c.mark.lured; await dd.move(c, 'gy', { by: p }); } } });
  }, 100)),
  'Greed': passive({
    effects: [
      trig('anyDraw', run(({ link, card }) => { const ev = link.ev; if (ev.e === 'draw') card.data[`greed${ev.player}`] = (card.data[`greed${ev.player}`] ?? 0) + ev.n; }), { cond: (_d, _c, _p, ev) => ev?.e === 'draw' && !ev.dp }),
      trig('endPhase', run(async ({ d, card }) => { for (const s of [0, 1] as Side[]) { const n = card.data[`greed${s}`] ?? 0; card.data[`greed${s}`] = 0; await d.damage(s, 500 * n, card); } }), { cond: (d, c) => d.onField(c) && ((c.data.greed0 ?? 0) > 0 || (c.data.greed1 ?? 0) > 0) }),
    ],
  }),
  'Hallowed Life Barrier': trap(run(({ d, p }) => d.addTemp({ until: d.turn, p, tag: 'noBattleDmg', lock: { noDamage: (_d, _s, s) => s === p } }), (d, me, _c, ev) => threat(d, me, ev) / 2 + 200), { cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  "Hard-sellin' Goblin": passive({
    effects: [trig('anyBattleDamage', run(async ({ d, p, o }) => { const c = await pick(d, p, "Return a card in your opponent's Spell & Trap Zone", d.players[o].s.filter((x): x is Card => !!x), 'bad'); if (c) await d.toHand(c); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && ev.src?.ctrl === c.ctrl })],
  }),
  "Hard-sellin' Zombie": passive({
    effects: [trig('anyBattleDamage', run(async ({ d, p, o }) => { const c = await pick(d, p, "Return a card from your opponent's Graveyard", d.players[o].gy, 'bad'); if (c) await d.move(c, 'deck', { bottom: true }); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && ev.src?.ctrl === c.ctrl })],
  }),
  'Hate Buster': trap(run(async ({ d, p, o, link }) => {
    const ev = attackOf(link.ev);
    if (!ev || !ev.target) return;
    const n = ev.attacker.def.atk ?? 0;
    await d.destroy(ev.attacker, 'effect', undefined, p);
    await d.destroy(ev.target, 'effect', undefined, p);
    await d.damage(o, n);
  }, (d, me, _c, ev) => threat(d, me, ev) + (ev.e === 'attack' ? ev.attacker.def.atk ?? 0 : 0)), { when: (d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && d.raceOf(ev.target) === 'Fiend' }),
  'Heavy Slump': trap(run(async ({ d, o }) => { for (const c of [...d.players[o].hand]) await d.move(c, 'deck'); await d.shuffleDeck(o); await d.draw(o, 2); }, 1500), { cond: (d, _c, p) => d.players[opp(p)].hand.length >= 8 }),
  'Hero Barrier': trap({ op: 'negateAttack' }, { on: ['oppAttack'], cond: (d, _c, p) => d.find({ ...OWN_FU, set: 'Elemental Hero' }, p).length > 0, ai: (d, me, _c, ev) => threat(d, me, ev) }),
  'Hero Blast': trap(run(async ({ d, p, o, t }) => {
    const h = t[0];
    if (!h || h.zone !== 'gy') return;
    await d.toHand(h);
    const c = await pick(d, p, 'Destroy a monster', d.find({ ...OPP_FU, fn: (dd, x) => dd.atk(x) <= (h.def.atk ?? 0) }, p), 'bad');
    if (c) await d.destroy(c, 'effect', undefined, p);
    void o;
  }, 800), { targets: [{ f: { ...GY_M('self'), set: 'Elemental Hero', mtype: ['normal'] }, good: true }] }),
  'Hero Counterattack': trap(run(async ({ d, p, o, card }) => {
    const c = randomOf(d, d.players[p].hand);
    if (!c) return;
    await d.reveal(o, [c], 'Hero Counterattack');
    if (!c.def.name.includes('Elemental Hero') || c.def.kind !== 'monster') return;
    const x = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad');
    if (x) await d.destroy(x, 'effect', undefined, p);
    if (d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card);
  }, 500), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.card.def.name.includes('Elemental Hero') }),
  'Hero Medal': {
    effects: [act({ ops: [] }), trig('destroyed', run(async ({ d, p, card }) => { await d.move(card, 'deck'); await d.shuffleDeck(p); await d.draw(p, 1); }), { from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false && c.mark.destroyedBy === opp(c.owner) && c.mark.destroyedHow === 'effect' })],
  },
  'Hero Ring': trap(run(async ({ d, p, card }) => {
    const m = await pick(d, p, 'Equip Hero Ring', d.find({ ...FU, race: ['Warrior'], maxAtk: 1500 }, p), 'good');
    if (m) await trapEquip(d, card, m, {});
  }, 400), { req: [{ f: { ...FU, race: ['Warrior'], maxAtk: 1500 } }] }),
  'Hero Signal': trap(ssFrom(['hand', 'deck'], { set: 'Elemental Hero', maxLv: 4 }), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.from === 'mzone' }),
  'Hero Spirit': trap(run(({ d, p, link }) => {
    const ev = attackOf(link.ev);
    if (!ev) return;
    const a = ev.attacker;
    d.addTemp({ until: d.turn, p, lock: { battleDmg: (_d, _s, att, _t, n, to) => (att === a && to === p ? 0 : n) } });
  }, (d, me, _c, ev) => threat(d, me, ev) / 2), { on: ['oppAttack'], cond: (d, _c, p) => d.players[p].gy.some((c) => c.def.name.includes('Elemental Hero') && c.mark.destroyedHow === 'battle' && c.mark.destroyedTurn === d.turn) }),
  "Hero's Rule 2": trap({ op: 'negate' }, { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.targets.flat().some((c) => c.zone === 'gy') }),
  'Hidden Book of Spell': trap({ op: 'toDeck', s: { t: 'target' } }, { cond: (d, _c, p) => d.tp === p, targets: [{ f: { side: 'self', zone: 'gy', kind: 'spell' }, n: 2, good: true }] }),
  'Hidden Soldiers': trap(ssFrom(['hand'], { attr: 'DARK', maxLv: 4 }), { on: ['oppNormalFlip'] }),
  'Huge Revolution': trap(run(async ({ d, p, o }) => {
    for (const c of [...d.players[o].hand]) await d.move(c, 'gy', { by: p });
    for (const c of d.fieldCards(o)) await d.destroy(c, 'effect', undefined, p);
  }, 3000), { cond: (d, _c, p) => d.tp === p && (d.phase === 'M1' || d.phase === 'M2') && ['People Running About', 'Oppressed People', 'United Resistance'].every((n) => has(d, p, n)) }),
  'Human-Wave Tactics': passive({
    effects: [trig('endPhase', run(async ({ d, p, card }) => {
      const n = d.players[p].gy.filter((c) => c.def.mtype === 'normal' && (c.def.lv ?? 0) <= 2 && c.mark.destroyedHow === 'battle' && c.mark.destroyedTurn === d.turn).length;
      for (let i = 0; i < n; i++) if (!(await ssPick(d, p, d.find(DECK({ kind: 'monster', mtype: ['normal'], maxLv: 2 }), p), 'Special Summon a Normal Monster', undefined, false, card))) break;
      await d.shuffleDeck(p);
    }), { cond: (d, c) => d.onField(c) && d.players[c.ctrl].gy.some((x) => x.def.mtype === 'normal' && (x.def.lv ?? 0) <= 2 && x.mark.destroyedHow === 'battle' && x.mark.destroyedTurn === d.turn) })],
  }),
  'Hunting Instinct': trap(ssFrom(['hand'], { race: ['Dinosaur'] }), { when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip' }),
  'Hysteric Party': passive({
    effects: [trig('leftField', run(async ({ d, card }) => { for (const uid of card.last.party ?? []) { const m = d.byUid(uid); if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); } }))],
  }, {
    cost: [{ op: 'discard', who: 'self', n: 1 }],
    req: [{ f: { ...GY_M('self'), name: 'Harpie Lady' } }],
    ops: [run(async ({ d, p, card }) => {
      card.data.party = [];
      for (const c of d.find({ ...GY_M('self'), name: 'Harpie Lady' }, p)) { if (!d.canSpecial(p, c)) break; if (await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card)) card.data.party.push(c.uid); }
    }, 1200)],
  }),
  'Icarus Attack': trap(run(async ({ d, p }) => { for (const c of await d.select(p, 'Destroy 2 cards', [...d.fieldCards(0), ...d.fieldCards(1)], 2, 2, 'bad')) await d.destroy(c, 'effect', undefined, p); }, 1200), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Winged Beast'] } } }], req: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'] }, n: 3 }],
  }),
  'Interdimensional Matter Transporter': trap(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    const owner = c.owner, pos = c.pos;
    await d.banish(c, p);
    const mv = c.mv;
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (c.mv === mv && c.zone === 'banished' && d.canSpecial(owner, c)) { c.properly = true; await d.specialSummon(c, owner, pos); } } });
  }, (d, me, _c, ev) => threat(d, me, ev)), { targets: [{ f: OWN_FU, good: true }] }),
  'Interdimensional Warp': trap(run(async ({ d, p, o, link }) => {
    const a = link.targets[0]?.[0], b = link.targets[1]?.[0];
    if (!a || !b || a.zone !== 'mzone' || b.zone !== 'mzone') return;
    const [sa, sb] = [a.slot, b.slot];
    d.players[p].m[sa] = b; d.players[o].m[sb] = a;
    a.ctrl = o; a.slot = sb; b.ctrl = p; b.slot = sa;
    d.log(`${a.def.name} and ${b.def.name} switch control.`);
    await d.emit({ t: 'move', card: a, from: 'mzone', to: 'mzone' });
    await d.emit({ t: 'move', card: b, from: 'mzone', to: 'mzone' });
  }, (d, me) => Math.max(-1, ...d.find(OPP_FU, me).filter((c) => ctr(c, 'A') > 0).map((c) => d.atk(c))) - 600), {
    targets: [{ f: OWN_M, good: true }, { f: { ...OPP_FU, fn: (_d, c) => ctr(c, 'A') > 0 } }],
  }),
};

void destroyAtk; void placeA; void quick; void pickSeen; void M; void ST; void scoreWipe; void union; void castCopy; void destroyAtEnd;
