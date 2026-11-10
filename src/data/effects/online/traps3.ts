// YGO Online Traps, part 3 (Introduction to Gallantry … Rock Bombardment).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  act, addCtr, attackOf, both, boundRevive, ctr, declareName, destroyAll, destroyAtEnd, grantRule, has, isAttackOn,
  opp, passive, pick, pickSeen, quick, randomOf, removeA, removeCtr, run, scoreWipe, spell, ssFrom, ssPick, threat, tokenDef, tokens,
  trapMonster, trig, atEndPhase, isAlien, ign,
} from './olib';

const trap = spell;
const spellCtrTotal = (d: Duel, p: Side) => d.fieldCards(p).reduce((s, c) => s + ctr(c), 0);
const paySpellCtr = (n: number) => run(({ d, p }) => { let k = n; for (const c of d.fieldCards(p)) { if (!k) break; k -= removeCtr(d, c, k); } }, 0, (d, p) => spellCtrTotal(d, p) >= n);
const gbToDeck = run(async ({ d, p }) => { const c = await pick(d, p, 'Return a Gladiator Beast to the Deck', d.find({ side: 'self', zone: 'hand', kind: 'monster', set: 'Gladiator Beast' }, p), 'cost'); if (c) { await d.move(c, 'deck'); await d.shuffleDeck(p); } }, 0, (d, p) => d.find({ side: 'self', zone: 'hand', kind: 'monster', set: 'Gladiator Beast' }, p).length > 0);
const kinds = ['monster', 'spell', 'trap'] as const;
const KIND_NAMES = ['Monster', 'Spell', 'Trap'];

export const TRAPS_3: Record<string, Def> = {
  'Introduction to Gallantry': trap(run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }, 500), { cond: (d, _c, p) => d.players[opp(p)].hand.length >= 5 }),
  'Judgment of Anubis': trap([{ op: 'negate' }, run(async ({ d, p, o }) => {
    const c = await pick(d, p, 'You can destroy a face-up monster', d.find(OPP_FU, p), 'bad', true);
    if (c) { const a = d.atk(c); if (await d.destroy(c, 'effect', undefined, p)) await d.damage(o, a); }
  })], {
    cost: [{ op: 'discard', who: 'self', n: 1 }],
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'spell' && ev.link.eff.ops.some((o) => o.op === 'destroy' && 's' in o && ((o.s.t === 'all' || o.s.t === 'choose') && !!o.s.f.st || o.s.t === 'target' && !!ev.link.eff.targets?.some((t) => t.f.st))),
  }),
  'Judgment of Pharaoh': trap(run(async ({ d, p, o }) => {
    const yu = d.players[p].gy.some((c) => c.def.name === 'Yu-Jo Friendship'), un = d.players[p].gy.some((c) => c.def.name === 'Unity');
    const i = yu && un ? await d.option(p, 'Judgment of Pharaoh', ['No summons for your opponent', "Negate your opponent's Spells and Traps"]) : yu ? 0 : 1;
    if (i === 0) d.addTemp({ until: d.turn, lock: { summon: (_d, _s, q) => q === o, set: (_d, _s, q, c) => q === o && c.def.kind === 'monster', activate: (_d, _s, q, c) => q === o && c.def.kind === 'monster' } });
    else d.addTemp({ until: d.turn, negate: (_d, c) => c.ctrl === o && c.def.kind !== 'monster' && (c.zone === 'szone' || c.zone === 'fzone'), lock: { activate: (_d, _s, q, c) => q === o && c.def.kind !== 'monster', set: (_d, _s, q, c) => q === o && c.def.kind !== 'monster' } });
  }, 800), { cost: [{ op: 'payHalf' }], cond: (d, _c, p) => d.players[p].gy.some((c) => c.def.name === 'Yu-Jo Friendship' || c.def.name === 'Unity') }),
  'Judgment of the Desert': passive({
    lock: { pos: (_d, src, c) => !!src && c.data.flipTurn !== undefined && c.data.flipTurn >= (src.data.since ?? 0) },
  }, { ops: [run(({ d, card }) => { card.data.since = d.turn; })] }),
  'Justi-Break': trap(destroyAll({ ...M, fn: (_d, c) => !(c.faceUp && c.pos === 'atk' && c.def.mtype === 'normal') }), {
    when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && ev.target.def.mtype === 'normal', ai: (d, me) => scoreWipe(d, me, (c) => !(c.faceUp && c.pos === 'atk' && c.def.mtype === 'normal')),
  }),
  'Karma Cut': trap(run(async ({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    const name = c.def.name;
    await d.banish(c, p);
    for (const g of d.players[o].gy.filter((x) => x.def.name === name)) await d.banish(g, p);
  }, 900), { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: OPP_FU }] }),
  'Kid Guard': trap([{ op: 'negateAttack' }, run(async ({ d, p }) => { const c = await pick(d, p, 'Add an Elemental Hero', d.find(DECK({ kind: 'monster', set: 'Elemental Hero' }), p), 'good'); if (c) { await d.toHand(c); await d.shuffleDeck(p); } })], {
    on: ['oppAttack'], cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Hero Kid' } } }], ai: (d, me, _c, ev) => threat(d, me, ev) + 300,
  }),
  "Kozaky's Self-Destruct Button": {
    effects: [act({ ops: [] }), trig('destroyed', run(({ d, card }) => { const by = card.mark.destroyedBy; if (by !== undefined) return d.damage(by, 1000, card); }), { from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false && c.mark.destroyedBy !== undefined })],
  },
  'Labyrinth of Nightmare': passive({ effects: [trig('endPhase', run(async ({ d }) => { for (const c of d.monsters(d.tp)) if (c.faceUp) await d.changePos(c, 'swap'); }), { cond: (d, c) => d.onField(c) })] }),
  'Last Resort': trap(run(async ({ d, p, o }) => {
    const f = d.find(DECK({ name: 'Ancient City - Rainbow Ruins' }), p)[0];
    const oppField = !!d.players[o].f?.faceUp;
    if (f) {
      await d.toHand(f);
      await d.shuffleDeck(p);
      d.deferred.push(async () => { const i = f.def.effects?.findIndex((e) => e.type === 'activate') ?? -1; if (f.zone === 'hand' && i >= 0) { await d.activate(f, i, p, { e: 'open' }); await d.chainLoop({ e: 'open' }, opp(p)); } });
    }
    if (oppField && (await d.confirm(o, 'Draw 1 card (Last Resort)?'))) await d.draw(o, 1);
  }, 300), { on: ['oppAttack'], req: [{ f: DECK({ name: 'Ancient City - Rainbow Ruins' }) }] }),
  'Last Turn': trap(run(async ({ d, p, o, card }) => {
    const mine = await pick(d, p, 'Select your monster', d.monsters(p), 'good');
    if (!mine) return;
    for (const c of [...d.fieldCards(p), ...d.fieldCards(o), ...d.players[p].hand, ...d.players[o].hand]) if (c !== mine && c !== card) await d.move(c, 'gy', { by: p });
    const foe = await ssPick(d, o, d.players[o].deck.filter((c) => c.def.kind === 'monster'), 'Special Summon a monster from your Deck', 'atk', true);
    if (foe && foe.zone === 'mzone' && mine.zone === 'mzone') {
      d.addTemp({ until: d.turn, tag: 'noBattleDmg' });
      d.addTemp({ until: d.turn, tag: 'noBattleDmg', p });
      d.addTemp({ until: d.turn, tag: 'noBattleDmg', p: o });
      const prev = d.phase; d.phase = 'BP';
      const tp = d.tp; d.tp = o;
      try { await (d as unknown as { damageStep(a: Card, t: Card | null): Promise<void> }).damageStep(foe, mine); } finally { d.tp = tp; d.phase = prev; }
    }
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => {
      const { DuelEnd } = await import('../../../engine/duel'); // lazy: the engine imports the card tables
      const all = both(d);
      if (all.length === 1 && all[0] === mine) throw new DuelEnd(p, 'Last Turn');
      if (all.length === 1 && all[0] === foe) throw new DuelEnd(o, 'Last Turn');
      throw new DuelEnd(-1, 'Last Turn');
    } });
  }, (d, me) => (d.players[me].lp <= 1000 && Math.max(0, ...d.monsters(me).map((c) => d.atk(c))) >= 3000 ? 3000 : -1)), { cond: (d, _c, p) => d.tp !== p && d.players[p].lp <= 1000, req: [{ f: OWN_M }] }),
  'Legacy of Yata-Garasu': trap(run(async ({ d, p, o }) => {
    const spirit = d.find(OPP_FU, p).some((c) => c.def.ability === 'spirit');
    await d.draw(p, spirit && (await d.option(p, 'Legacy of Yata-Garasu', ['Draw 1 card', 'Draw 2 cards'], 1)) ? 2 : 1);
    void o;
  }, 600)),
  'Level Conversion Lab': trap(run(async ({ d, p, o }) => {
    const c = await pick(d, p, 'Reveal a monster in your hand', d.players[p].hand.filter((x) => x.def.kind === 'monster'), 'good');
    if (!c) return;
    await d.reveal(o, [c], 'Level Conversion Lab');
    const n = (await d.die());
    if (n === 1) await d.move(c, 'gy', { by: p });
    else { const lv = n; d.addTemp({ until: d.turn, lv: (_d, x) => (x === c ? lv - (c.def.lv ?? 0) : 0) }); }
  }, 200), { req: [{ f: { side: 'self', zone: 'hand', kind: 'monster' } }] }),
  'Level Limit - Area A': passive({
    lock: { pos: (d, _s, c) => c.faceUp && d.lvOf(c) <= 3 && c.pos === 'atk' },
    onSummon: async (d, _s, c) => { if (c.faceUp && d.lvOf(c) <= 3 && c.pos === 'def') await d.changePos(c, 'atk'); },
  }, { ops: [run(async ({ d }) => { for (const c of both(d)) if (c.faceUp && d.lvOf(c) <= 3 && c.pos === 'def') await d.changePos(c, 'atk'); }, 200)] }),
  'Life Absorbing Machine': passive({ effects: [trig('standby', run(({ d, p }) => d.heal(p, Math.floor((d.flags[`paid:${p}:${d.turn - 2}`] ?? 0) / 2))), { cond: (d, c) => d.onField(c) && (d.flags[`paid:${c.ctrl}:${d.turn - 2}`] ?? 0) > 0 })] }),
  'Life Equalizer': trap(run(async ({ d }) => { for (const s of [0, 1] as Side[]) await d.changeLP(s, 3000 - d.players[s].lp); }, (d, me) => d.players[opp(me)].lp - d.players[me].lp), { cond: (d) => Math.abs(d.players[0].lp - d.players[1].lp) >= 8000 }),
  'Light of Judgment': trap(run(async ({ d, p, o }) => {
    const pool = [...d.fieldCards(o), ...d.players[o].hand];
    const c = await pickSeen(d, p, "Send 1 of your opponent's cards to the Graveyard", pool, 'bad');
    if (c) await d.move(c, 'gy', { by: p });
  }, 1000), {
    cond: (d) => d.active('The Sanctuary in the Sky'),
    cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'LIGHT' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'LIGHT' } }],
  }),
  'Light Spiral': passive({
    effects: [trig('anyToGY', run(async ({ d, p, o }) => { const top = d.players[o].deck[d.players[o].deck.length - 1]; if (top) await d.banish(top, p); }), {
      cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.from === 'deck' && ev.owner === c.ctrl && d.chain.some((l) => l.card.def.name.includes('Lightsworn')),
    })],
  }),
  'Light-Imprisoning Mirror': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Negate a LIGHT monster effect', ops: [run(({ link }) => { const ev = link.ev; if (ev.e === 'chain') ev.link.negated = true; })], ai: 600,
      when: (d, ev) => ev.e === 'chain' && !ev.link.isCard && ev.link.card.def.kind === 'monster' && d.attrOf(ev.link.card) === 'LIGHT' }],
  }),
  'Limit Reverse': (() => {
    const b = boundRevive({ ...GY_M('self'), maxAtk: 1000 }, { pos: 'atk' });
    const sd = b.selfDestructIf!;
    b.selfDestructIf = (d, c) => { if (sd(d, c)) return true; const m = d.byUid(c.data.sel); return !!m && m.zone === 'mzone' && m.pos === 'def'; };
    return b;
  })(),
  'Lone Wolf': passive({
    lock: {
      indestructible: (d, src, c, by) => !!src && by === 'battle' && c.ctrl === src.ctrl && d.monsters(src.ctrl).length === 1 && ['Chu-Ske the Mouse Fighter', 'Monk Fighter', 'Master Monk'].includes(c.def.name),
      unaffected: (d, src, c, by) => !!src && c.ctrl === src.ctrl && d.monsters(src.ctrl).length === 1 && by.def.kind === 'monster' && by.ctrl !== src.ctrl && ['Chu-Ske the Mouse Fighter', 'Monk Fighter', 'Master Monk'].includes(c.def.name),
    },
  }, { cond: (d, _c, p) => d.monsters(p).length === 1 && d.monsters(p).every((c) => c.faceUp && ['Chu-Ske the Mouse Fighter', 'Monk Fighter', 'Master Monk'].includes(c.def.name)) }),
  'Lucky Chance': passive({ onResolve: async (d, src, link) => { if (!link.isCard && link.card.def.kind === 'monster' && /coin/i.test(link.card.def.text) && (await d.call(src.ctrl))) await d.draw(src.ctrl, 1); } }),
  'Macro Cosmos': passive({ lock: { gyToBanish: true } }, { ops: [run(async ({ d, p, card }) => {
    const h = d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Helios - The Primordial Sun' }, p);
    if (h.length && (await d.confirm(p, 'Special Summon Helios - The Primordial Sun?'))) await ssPick(d, p, h, 'Special Summon Helios', undefined, false, card);
  }, 400)] }),
  'Magical Explosion': trap(run(({ d, p, o }) => d.damage(o, 200 * d.players[p].gy.filter((c) => c.def.kind === 'spell').length), (d, me) => 200 * d.players[me].gy.filter((c) => c.def.kind === 'spell').length), { cond: (d, c, p) => d.players[p].hand.filter((x) => x !== c).length === 0 }),
  "Magician's Circle": trap(run(async ({ d, p, o }) => {
    for (const s of [p, o]) await ssPick(d, s, d.find(DECK({ kind: 'monster', race: ['Spellcaster'], fn: (_d, c) => (c.def.atk ?? 0) <= 2000 }), s), 'Special Summon a Spellcaster', 'atk');
  }, 500), { when: (d, ev) => ev.e === 'attack' && d.raceOf(ev.attacker) === 'Spellcaster' }),
  'Malevolent Catastrophe': trap(destroyAll({ side: 'any', st: true, zone: ['szone', 'fzone'] }), { on: ['oppAttack'], ai: (d, me) => d.spellTraps(opp(me)).length * 600 - d.spellTraps(me).length * 500 }),
  'Malfunction': trap(run(async ({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    ev.link.negated = true;
    ev.link.activationNegated = true;
    const c = ev.link.card;
    if (d.onField(c)) { c.faceUp = false; c.turnIn = d.turn - 1; d.log(`${c.def.name} is returned face-down.`); await d.emit({ t: 'set', card: c }); }
  }, 700), { on: ['activateTrap'], cost: [{ op: 'payLP', n: 500 }] }),
  'Mass Hypnosis': passive({
    effects: [trig('endPhase', run(({ d, card }) => d.destroy(card, 'effect', undefined, card.ctrl)), { cond: (d, c) => d.onField(c) })],
  }, {
    cond: (d, _c, p) => d.find(OWN_FU, p).some(isAlien),
    ops: [run(async ({ d, p, card }) => {
      for (const c of await d.select(p, 'Take control of up to 3 monsters with A-Counters', d.find({ ...OPP_FU, fn: (_d, x) => ctr(x, 'A') > 0 }, p), 0, 3, 'bad')) await d.takeControl(c, p);
      void card;
    }, (d, me) => d.find(OPP_FU, me).filter((c) => ctr(c, 'A') > 0).length * 800)],
  }),
  'Metal Reflect Slime': { effects: [act({ ops: [run(async ({ d, p, card }) => { await trapMonster(d, card, p, { race: 'Aqua', attr: 'WATER', lv: 10, atk: 0, def: 3000, rules: ['cantAttack'] }, 'def'); }, (d, me, _c, ev) => threat(d, me, ev) + 300)] })] },
  'Meteorain': trap(run(({ d, p }) => d.addTemp({ until: d.turn, lock: { grants: (_d, _s, c, r) => r === 'pierce' && c.ctrl === p } }), 500), { cond: (d, _c, p) => d.tp === p }),
  'Micro Ray': trap(run(({ d, t }) => { const c = t[0]; if (c) d.addMod(c, 0, -d.defv(c)); }, 300), { targets: [{ f: FU }] }),
  'Mind Crush': trap(run(async ({ d, p, o }) => {
    const name = await declareName(d, p, 'Declare a card name', d.players[o].hand);
    const hit = d.players[o].hand.filter((c) => c.def.name === name);
    if (hit.length) await d.discard(o, hit, p);
    else { const c = randomOf(d, d.players[p].hand); if (c) await d.discard(p, [c], p); }
  }, 300), { req: [{ f: { side: 'opp', zone: 'hand' } }] }),
  'Mind Haxorz': trap(run(async ({ d, p, o }) => { await d.reveal(p, [...d.players[o].hand, ...d.fieldCards(o).filter((c) => !c.faceUp)], "Opponent's hand and Set cards"); }, 100), { cost: [{ op: 'payLP', n: 500 }] }),
  'Minefield Eruption': trap(run(async ({ d, p, o }) => {
    const golems = d.find({ ...OWN_FU, name: 'Mine Golem' }, p);
    await d.damage(o, 1000 * golems.length);
    for (const g of golems) await d.destroy(g, 'effect', undefined, p);
  }, 1000), { req: [{ f: { ...OWN_FU, name: 'Mine Golem' } }] }),
  'Miracle Kids': trap(run(({ d, p, t }) => { const c = t[0]; if (c) d.addMod(c, -400 * d.players[p].gy.filter((x) => x.def.name === 'Hero Kid').length, 0); }, 500), { targets: [{ f: OPP_FU }] }),
  'Miracle Restoring': trap(ssFrom(['gy'], { name: ['Dark Magician', 'Buster Blader'] }), { cost: [paySpellCtr(2)] }),
  'Miraculous Descent': boundRevive({ side: 'self', zone: 'banished', kind: 'monster', race: ['Fairy'] }),
  'Mirror Gate': trap(run(async ({ d, p, o, link }) => {
    const ev = attackOf(link.ev);
    if (!ev || !ev.target) return;
    const a = ev.attacker, t = ev.target;
    const [sa, st] = [a.slot, t.slot];
    d.players[o].m[sa] = t; d.players[p].m[st] = a;
    a.ctrl = p; a.slot = st; a.returnAt = d.turn; t.ctrl = o; t.slot = sa; t.returnAt = d.turn;
    d.log(`${a.def.name} and ${t.def.name} switch control.`);
    await d.emit({ t: 'move', card: a, from: 'mzone', to: 'mzone' });
    await d.emit({ t: 'move', card: t, from: 'mzone', to: 'mzone' });
    ev.attacker = t; ev.target = a;
  }, (d, me, _c, ev) => threat(d, me, ev)), { when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && ev.target.def.name.includes('Elemental Hero') }),
  'Mispolymerization': trap(run(async ({ d }) => { for (const c of both(d).filter((x) => x.faceUp && x.def.mtype === 'fusion')) await d.move(c, 'extra'); }, (d, me) => scoreWipe(d, me, (c) => c.def.mtype === 'fusion')), { when: (_d, ev) => ev.e === 'summon' && ev.how !== 'normal' && ev.how !== 'flip' && ev.cards.some((c) => c.def.mtype === 'fusion') }),
  'Narrow Pass': passive({ lock: { summon: (_d, src, p, c, how) => !!src && how === 'normal' && (src.data[`n${p}`] ?? 0) >= 2 && !!c } }, {
    cond: (d) => d.monsters(0).length <= 2 && d.monsters(1).length <= 2,
    ops: [run(({ card }) => { card.data.n0 = 0; card.data.n1 = 0; })],
  }),
  'Natural Disaster': passive({ effects: [trig('anyToGY', { op: 'damage', who: 'opp', n: 500 }, { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.ctrl !== c.ctrl && ev.card.mark.destroyedTurn === d.turn && d.chain.some((l) => l.card.def.name.includes('Cloudian')) })] }),
  'Needle Ceiling': trap(destroyAll(FU), { cond: (d) => both(d).length >= 4, ai: (d, me) => scoreWipe(d, me, (c) => c.faceUp) }),
  'Needle Wall': passive({
    effects: [trig('standby', run(async ({ d, p, o }) => {
      let n = 6;
      for (let k = 0; k < 10 && n === 6; k++) n = (await d.die());
      const c = d.players[o].m[n - 1];
      if (c) await d.destroy(c, 'effect', undefined, p);
    }), { cond: (d, c) => d.onField(c) })],
  }),
  'Next to be Lost': trap(run(async ({ d, p, t }) => { const c = t[0]; const x = c && d.find(DECK({ name: c.def.name }), p)[0]; if (x) { await d.move(x, 'gy', { by: p }); await d.shuffleDeck(p); } }, 100), { targets: [{ f: OWN_FU, good: true }] }),
  'Nightmare Wheel': passive({
    lock: { attack: (_d, src, a) => !!src && a.uid === src.data.sel, pos: (_d, src, c) => !!src && c.uid === src.data.sel },
    effects: [trig('standby', { op: 'damage', who: 'opp', n: 500 }, { cond: (d, c) => d.onField(c) })],
    selfDestructIf: (d, c) => c.data.sel !== undefined && !both(d).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  }, { targets: [{ f: OPP_M }], ops: [run(({ card, t }) => { if (t[0]) { card.data.sel = t[0].uid; card.data.selMv = t[0].mv; } }, 800)] }),
  'Ninjitsu Art of Decoy': passive({
    lock: { indestructible: (_d, src, c, by) => !!src && by === 'battle' && c.uid === src.data.sel },
  }, { targets: [{ f: { ...OWN_FU, set: 'Ninja' }, good: true }], ops: [run(({ card, t }) => { if (t[0]) card.data.sel = t[0].uid; }, 300)] }),
  'Ninjitsu Art of Transformation': (() => {
    const b: Def = passive({
      effects: [trig('leftField', run(async ({ d, card }) => { const m = card.last.sel !== undefined ? d.byUid(card.last.sel) : undefined; if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); }))],
    }, {
      cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Tribute a Ninja', d.find({ ...OWN_FU, set: 'Ninja' }, p).filter((x) => d.tributeOk(x)), 'cost'); if (c) { link.data.lv = d.lvOf(c); await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p) => d.find({ ...OWN_FU, set: 'Ninja' }, p).length > 0)],
      ops: [run(async ({ d, p, card, link }) => {
        const c = await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], kind: 'monster', race: ['Beast', 'Winged Beast', 'Insect'], maxLv: (link.data.lv ?? 0) + 3 }, p), 'Special Summon a monster', undefined, false, card);
        if (c) card.data.sel = c.uid;
      }, 800)],
    });
    return b;
  })(),
  'No Entry!!': trap({ op: 'pos', s: { t: 'all', f: { ...FU, pos: 'atk' } }, to: 'def' }, { ai: (d, me) => d.monsters(opp(me)).filter((c) => c.faceUp && c.pos === 'atk').length * 400 - d.monsters(me).filter((c) => c.faceUp && c.pos === 'atk').length * 300 }),
  'Non Aggression Area': trap(run(({ d, o }) => d.addTemp({ until: d.turn + 1, p: o, lock: { summon: (dd, _s, q) => q === o && dd.turn > dd.turn - 1 && dd.tp === o, set: (dd, _s, q, c) => q === o && dd.tp === o && c.def.kind === 'monster' } }), 400), {
    cond: (d, _c, p) => d.tp === p && d.phase === 'SP', cost: [{ op: 'discard', who: 'self', n: 1 }],
  }),
  'Non-Fusion Area': passive({ lock: { summon: (_d, _s, _p, _c, how) => how === 'fusion', activate: (_d, _s, _p, c) => !!c.def.effects?.some((e) => e.ops.some((o) => o.op === 'fusion')) } }),
  'Null and Void': trap(run(({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const src = ev.link;
    d.addTemp({ until: d.turn, tag: 'nullVoid', draw: async (dd, s, cards) => { if (!dd.chain.includes(src)) return; await dd.reveal(opp(s), cards, 'Null and Void'); await dd.discard(s, cards.filter((c) => c.zone === 'hand'), link.p); } });
  }, 600), { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'draw') }),
  'Nutrient Z': trap(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { battleDmg: (dd, _s, _a, _t, n, to) => { if (to === p && n >= 2000 && !dd.flags[`nutz:${dd.turn}`]) { dd.flags[`nutz:${dd.turn}`] = 1; dd.players[p].lp += 4000; dd.log(`${dd.name(p)} gains 4000 LP.`); } return n; } } }), (d, me, _c, ev) => (ev.e === 'attack' ? 300 : -1)), {
    when: (d, ev, p) => ev.e === 'attack' && ev.player !== p,
  }),
  'Offering to the Snake Deity': trap(run(async ({ d, p, o, t }) => {
    if (t[0] && (await d.destroy(t[0], 'effect', undefined, p))) for (const c of await d.select(p, 'Destroy 2 cards', d.fieldCards(o), Math.min(2, d.fieldCards(o).length), 2, 'bad')) await d.destroy(c, 'effect', undefined, p);
  }, 1000), { targets: [{ f: { ...OWN_FU, race: ['Reptile'] } }], req: [{ f: { side: 'opp' }, n: 2 }] }),
  'Ojama Trio': trap(run(({ d, o }) => tokens(d, o, 'Ojama Token', 3, 'def'), (d, me) => (d.freeCount(opp(me), 'm') >= 3 ? 500 : -1)), { cond: (d, _c, p) => d.freeCount(opp(p), 'm') >= 3 }),
  'Ominous Fortunetelling': passive({
    effects: [trig('standby', run(async ({ d, p, o }) => {
      const c = randomOf(d, d.players[o].hand);
      if (!c) return;
      const guess = await d.option(p, 'Call the card type', KIND_NAMES);
      await d.reveal(p, [c], 'Ominous Fortunetelling');
      if (c.def.kind === kinds[guess]) await d.damage(o, 700);
    }), { cond: (d, c) => d.onField(c) && d.players[opp(c.ctrl)].hand.length > 0 })],
  }),
  'Option Hunter': trap(run(({ d, p, link }) => { const ev = link.ev; if (ev.e === 'sent') return d.heal(p, ev.card.def.atk ?? 0); }, 500), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.from === 'mzone' }),
  'Orbital Bombardment': trap({ op: 'destroy', s: { t: 'target' } }, { cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, fn: (_d, c) => isAlien(c) } } }], targets: [{ f: ST }] }),
  'Ordeal of a Traveler': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Ordeal of a Traveler', ops: [run(async ({ d, p, o, link }) => {
      const ev = attackOf(link.ev);
      const c = randomOf(d, d.players[p].hand);
      if (!ev || !c) return;
      const guess = await d.option(o, 'Call the type of a random card in your opponent\'s hand', KIND_NAMES, Math.floor(d.rng() * 3));
      await d.reveal(o, [c], 'Ordeal of a Traveler');
      if (c.def.kind !== kinds[guess] && ev.attacker.zone === 'mzone') { await d.toHand(ev.attacker); d.attackNegated = true; }
    }, (d, me, _c, ev) => threat(d, me, ev) / 2)], when: (d, ev, p) => isAttackOn(ev, p) && d.players[p].hand.length > 0 }],
  }),
  'Order to Smash': trap(run(async ({ d, p, o, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone' || !d.tributeOk(c) || !(await d.confirm(p, 'Tribute it to destroy Spells/Traps?'))) return;
    await d.move(c, 'gy', { why: 'tribute' });
    for (const x of await d.select(p, 'Destroy 1 or 2 Spell/Trap Cards', d.spellTraps(o), 1, 2, 'bad')) await d.destroy(x, 'effect', undefined, p);
  }, 600), { targets: [{ f: { ...OWN_FU, mtype: ['normal'], maxLv: 2, fn: (_d, c) => !c.token }, good: true }], req: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }] }),
  'Over Limit': trap(run(async ({ d, p }) => {
    for (const s of [0, 1] as Side[]) for (const c of d.players[s].gy.filter((x) => x.def.mtype === 'normal' && (x.def.atk ?? 0) <= 1000 && x.mark.destroyedHow === 'battle' && x.mark.destroyedTurn === d.turn)) { if (!d.canSpecial(s, c)) break; await d.specialSummon(c, s, await d.askPos(s, c)); }
    void p;
  }, 300), { cost: [{ op: 'payLP', n: 500 }] }),
  'Parry': trap({ op: 'negate' }, { on: ['activateTrap'], cost: [gbToDeck] }),
  'Penalty Game!': trap(run(async ({ d, p, o }) => {
    if (await d.option(p, 'Penalty Game!', ['Skip their next draw', 'No Spells/Traps this turn'], d.tp === o ? 1 : 0)) d.addTemp({ until: d.turn, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind !== 'monster' } });
    else d.flag('skipDraw', o);
  }, 500), { cond: (d, _c, p) => d.players[opp(p)].hand.length === 4 }),
  "Pharaoh's Treasure": {
    effects: [act({ ops: [run(async ({ d, p, card }) => { card.data.keep = true; card.mark.treasure = true; await d.move(card, 'deck'); await d.shuffleDeck(p); }, 200)] }),
      trig('drawn', run(async ({ d, p, card }) => {
        delete card.mark.treasure;
        await d.move(card, 'gy', { by: p });
        const c = await pick(d, p, 'Add a card from your Graveyard', d.players[p].gy.filter((x) => x !== card), 'good');
        if (c) await d.toHand(c);
      }), { from: ['hand'], cond: (_d, c) => !!c.mark.treasure })],
  },
  'Phoenix Wing Wind Blast': trap(run(async ({ d, t }) => { const c = t[0]; if (c && d.onField(c)) { await d.move(c, 'deck'); d.log(`${c.def.name} is placed on top of the Deck.`); } }, 700), { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'opp' } }] }),
  'Physical Double': trap(run(async ({ d, p, t }) => {
    const m = t[0];
    if (!m) return;
    const [tok] = await tokens(d, p, { ...m.def, id: 'token_mirage', name: 'Mirage Token', effects: [], mtype: 'normal', lv: d.lvOf(m), race: d.raceOf(m), attr: d.attrOf(m), atk: d.atk(m), def: d.defv(m) }, 1, 'atk');
    if (tok) destroyAtEnd(d, tok, p);
  }, 400), { cond: (d, _c, p) => d.tp !== p, targets: [{ f: OPP_FU }] }),
  "Pikeru's Circle of Enchantment": trap(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { noDamage: (_d, _s, s, battle) => s === p && !battle } }), 300)),
  "Pikeru's Second Sight": trap(run(({ d, p, o }) => d.addTemp({ until: d.turn + (d.tp === o ? 2 : 1), draw: (dd, s, cards) => (s === o ? dd.reveal(p, cards, 'Drawn cards') : undefined) }), 100)),
  'Pineapple Blast': trap(run(async ({ d, p, o }) => {
    const n = d.monsters(o).length - d.monsters(p).length;
    if (n > 0) for (const c of await d.select(o, `Destroy ${n} of your monsters`, d.monsters(o), n, n, 'cost')) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => (d.monsters(opp(me)).length - d.monsters(me).length) * 900), { when: (d, ev, p) => ev.e === 'summon' && ev.player === p && ev.how === 'normal' && d.monsters(opp(p)).length > d.monsters(p).length }),
  'Pitch-Black Power Stone': passive({
    selfDestructIf: (_d, c) => c.data.ctr !== undefined && ctr(c) === 0,
    effects: [ign(run(async ({ d, p, card }) => {
      const t = await pick(d, p, 'Move a Spell Counter to', [...d.fieldCards(0), ...d.fieldCards(1)].filter((x) => x !== card && x.faceUp && /Spell Counter/.test(x.def.text)), 'good');
      if (t && removeCtr(d, card, 1)) addCtr(d, t, 1);
    }, 200), { label: 'Move a Spell Counter', opt: true, cond: (d, c) => ctr(c) > 0 && [...d.fieldCards(0), ...d.fieldCards(1)].some((x) => x !== c && x.faceUp && /Spell Counter/.test(x.def.text)) })],
  }, { ops: [run(({ d, card }) => { addCtr(d, card, 3); }, 300)] }),
  'Portable Battery Pack': (() => {
    const b: Def = passive({
      effects: [trig('leftField', run(async ({ d, card }) => { for (const u of card.last.pack ?? []) { const m = d.byUid(u); if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); } }))],
      selfDestructIf: (d, c) => !!c.data.pack && !(c.data.pack as number[]).some((u) => d.monsters(c.ctrl).some((m) => m.uid === u)),
    }, {
      targets: [{ f: { ...GY_M('self'), set: 'Batteryman' }, n: 2, good: true }],
      ops: [run(async ({ d, p, card, link }) => {
        card.data.pack = [];
        for (const m of (link.targets[0] ?? []).filter((x, k) => x.mv === link.tmv[0][k] && x.zone === 'gy')) if (await d.specialSummon(m, p, 'atk', 'special', false, card)) card.data.pack.push(m.uid);
      }, 900)],
    });
    return b;
  })(),
  'Prepare to Strike Back': passive({
    effects: [trig('anyAttack', run(async ({ d, card, link }) => {
      const ev = attackOf(link.ev);
      if (!ev || !ev.target) return;
      if ((await d.call(card.ctrl))) await d.changePos(ev.target, 'atk');
      else await d.damage(card.ctrl, Math.max(0, d.atk(ev.attacker) - d.defv(ev.target)));
    }), { cond: (_d, c, _p, ev) => ev?.e === 'attack' && ev.player !== c.ctrl && !!ev.target && ev.target.faceUp && ev.target.pos === 'def' })],
  }),
  'Pulling the Rug': trap([{ op: 'negate' }, run(async ({ d, p, link }) => { const ev = link.ev; if (ev.e === 'chain' && d.onField(ev.link.card)) await d.destroy(ev.link.card, 'effect', undefined, p); })], {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && !!ev.link.trig && ev.link.trig.ev.e === 'summon' && ev.link.trig.ev.how === 'normal' && ev.link.card.def.kind === 'monster',
  }),
  'Pyramid of Light': passive({
    effects: [trig('leftField', run(async ({ d, card }) => { for (const c of d.find({ ...OWN_M, name: ['Andro Sphinx', 'Sphinx Teleia'] }, card.owner)) if (await d.destroy(c, 'effect', undefined, card.owner) && c.zone === 'gy') await d.banish(c, card.owner); }))],
  }),
  'Pyro Clock of Destiny': trap(run(({ d }) => { d.turn++; d.log('The turn count moves forward by 1.'); }, 100)),
  'Radiant Mirror Force': trap(destroyAll({ ...OPP_M, pos: 'atk' }), { on: ['oppAttack'], cond: (d, _c, p) => d.find({ ...OPP_M, pos: 'atk' }, p).length >= 3, ai: (d, me) => scoreWipe(d, me, (c) => c.ctrl !== me && c.pos === 'atk') }),
  'Raging Cloudian': trap(run(async ({ d, p, card, link }) => {
    const ev = link.ev;
    const c = ev.e === 'sent' ? ev.card : undefined;
    if (c && c.zone === 'gy' && (await d.specialSummon(c, p, 'atk', 'special', false, card))) addCtr(d, c, 1, 'fog');
  }, 600), { when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.card.def.name.includes('Cloudian') && ev.why === 'effect' }),
  'Raigeki Break': trap({ op: 'destroy', s: { t: 'target' } }, { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }] }),
  'Rain Storm': trap(run(async ({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    const two = d.atk(c) >= 2000 && d.fieldCards(o).length >= 2 && (await d.option(p, 'Rain Storm', ['-1000 ATK: destroy 1 Spell/Trap', '-2000 ATK: destroy 2 cards'], 1));
    d.addMod(c, two ? -2000 : -1000, 0, -1);
    const pool = two ? d.fieldCards(o) : d.spellTraps(o);
    for (const x of await d.select(p, 'Destroy cards', pool, Math.min(two ? 2 : 1, pool.length), two ? 2 : 1, 'bad')) await d.destroy(x, 'effect', undefined, p);
  }, 600), { targets: [{ f: { ...OWN_FU, set: 'Cloudian', minAtk: 1000 }, good: true }] }),
  'Rainbow Gravity': trap(ssFrom(['deck', 'gy'], { name: ['Rainbow Dragon', 'Rainbow Dark Dragon'] }, { ignore: true }), {
    cond: (d, _c, p) => new Set([...d.fieldCards(p), ...d.players[p].gy].filter((c) => c.def.name.includes('Crystal Beast')).map((c) => c.def.name)).size >= 7,
  }),
  'Rainbow Life': trap(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { damageToHeal: (_d, _s, s) => s === p } }), 500), { cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  'Rainbow Path': trap([{ op: 'negateAttack' }, run(async ({ d, p }) => { const c = await pick(d, p, 'Add Rainbow Dragon', d.find(DECK({ name: ['Rainbow Dragon', 'Rainbow Dark Dragon'] }), p), 'good', true); if (c) { await d.toHand(c); await d.shuffleDeck(p); } })], {
    on: ['oppAttack'], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, set: 'Crystal Beast', fn: (_d, c) => c.def.kind === 'monster' } } }],
    req: [{ f: { side: 'self', zone: 'szone', faceUp: true, set: 'Crystal Beast', fn: (_d, c) => c.def.kind === 'monster' } }], ai: (d, me, _c, ev) => threat(d, me, ev),
  }),
  'Rare Metalmorph': passive({
    auraFn: (_d, src, c) => (c.uid === src.data.sel ? { atk: 500 } : undefined),
    effects: [{ type: 'quick', from: ['szone'], once: true, label: 'Negate a Spell targeting the monster', ops: [run(({ link }) => { const ev = link.ev; if (ev.e === 'chain') ev.link.negated = true; })], ai: 600,
      when: (_d, ev, _p, card) => ev.e === 'chain' && ev.link.card.def.kind === 'spell' && ev.link.targets.flat().some((c) => c.uid === card.data.sel) }],
    selfDestructIf: (d, c) => c.data.sel !== undefined && !d.monsters(c.ctrl).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  }, { targets: [{ f: { ...OWN_FU, race: ['Machine'] }, good: true }], ops: [run(({ card, t }) => { if (t[0]) { card.data.sel = t[0].uid; card.data.selMv = t[0].mv; } }, 500)] }),
  'Ray of Hope': trap({ op: 'toDeck', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), attr: 'LIGHT' }, n: 2, good: true }] }),
  'Ready for Intercepting': trap(run(async ({ d, t }) => { const c = t[0]; if (c && c.faceUp) { c.pos = 'def'; await d.setFaceDown(c); } }, 400), { targets: [{ f: { ...FU, race: ['Warrior', 'Spellcaster'] } }] }),
  'Really Eternal Rest': trap(run(async ({ d, p }) => { for (const c of both(d).filter((m) => d.equipsOf(m).length > 0)) await d.destroy(c, 'effect', undefined, p); }, (d, me) => scoreWipe(d, me, (c) => d.equipsOf(c).length > 0)), { req: [{ f: { ...M, fn: (d, c) => d.equipsOf(c).length > 0 } }] }),
  'Reckless Greed': trap(run(async ({ d, p }) => { await d.draw(p, 2); d.flag('skipDraw', p, 2); }, 200), { cond: (d, _c, p) => d.players[p].deck.length >= 2 }),
  'Release from Stone': boundRevive({ side: 'self', zone: 'banished', kind: 'monster', race: ['Rock'] }),
  'Relieve Monster': trap(run(async ({ d, p, card, t }) => {
    const c = t[0];
    if (!c) return;
    await d.toHand(c);
    await ssPick(d, p, d.players[p].hand.filter((x) => x !== c && x.def.kind === 'monster' && x.def.lv === 4), 'Special Summon a Level 4 monster', undefined, false, card);
  }, (d, me, _c, ev) => threat(d, me, ev) / 2), { on: ['oppAttack'], targets: [{ f: OWN_M, good: true }] }),
  'Remove Brainwashing': passive({ lock: { noControl: true } }, { ops: [run(async ({ d }) => { for (const c of both(d)) if (c.ctrl !== c.owner) await d.returnControl(c); }, (d, me) => d.monsters(opp(me)).filter((c) => c.owner === me).length * 900 - d.monsters(me).filter((c) => c.owner !== me).length * 900)] }),
  'Return from the Different Dimension': trap(run(async ({ d, p, card }) => {
    const ids: number[] = [];
    for (const c of d.players[p].banished.filter((x) => x.def.kind === 'monster' && d.revivable(x))) { if (!d.canSpecial(p, c)) break; if (await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card)) ids.push(c.uid); }
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { for (const u of ids) { const m = d.byUid(u); if (m && m.zone === 'mzone') await d.banish(m, p); } } });
  }, (d, me) => d.players[me].banished.filter((c) => c.def.kind === 'monster').reduce((s, c) => s + (c.def.atk ?? 0), 0) / 2 - d.players[me].lp / 4), { cost: [{ op: 'payHalf' }], req: [{ f: { side: 'self', zone: 'banished', kind: 'monster' } }] }),
  'Return of the Six Samurai': trap(run(async ({ d, p, card, t }) => { const c = t[0]; if (c && c.zone === 'gy' && (await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card))) destroyAtEnd(d, c, p); }, 500), { targets: [{ f: { ...GY_M('self'), set: 'Six Samurai' }, good: true }] }),
  'Return Soul': trap(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Return up to 3 monsters destroyed this turn to the Deck', [...d.players[0].gy, ...d.players[1].gy].filter((c) => c.def.kind === 'monster' && c.mark.destroyedTurn === d.turn), 0, 3, 'good');
    const owners = new Set<Side>();
    for (const c of cs) { owners.add(c.owner); await d.move(c, 'deck'); }
    for (const s of owners) await d.shuffleDeck(s);
  }, 100), { cond: (d) => d.phase === 'EP' }),
  'Reversal of Fate': trap(run(({ d, t }) => { const c = t[0]; if (c) { c.data.arcana = c.data.arcana === 'heads' ? 'tails' : 'heads'; d.log(`${c.def.name}'s coin result is reversed.`); } }, 300), { targets: [{ f: { ...OWN_FU, set: 'Arcana Force' }, good: true }] }),
  'Rise of the Snake Deity': trap(ssFrom(['hand', 'deck'], { name: 'Vennominaga the Deity of Poisonous Snakes' }, { ignore: true }), {
    when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.card.def.name === 'Vennominon the King of Poisonous Snakes' && ev.from === 'mzone',
  }),
  'Rising Energy': trap(run(({ d, t }) => { if (t[0]) d.addMod(t[0], 1500, 0); }, (d, me, _c, ev) => Math.max(300, threat(d, me, ev))), { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: FU, good: true }] }),
  'Rite of Spirit': trap({ op: 'summon', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), set: "Gravekeeper's" }, good: true }], ai: 700 }),
  'Ritual Sealing': trap({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { ...FU, mtype: ['ritual'] } }] }),
  'Rivalry of Warlords': passive({
    lock: { summon: (d, src, p, c) => !!src && d.monsters(p).some((m) => m.faceUp && d.raceOf(m) !== c.def.race) },
  }, { ops: [run(async ({ d, p, o }) => {
    for (const s of [p, o]) {
      const races = [...new Set(d.monsters(s).filter((m) => m.faceUp).map((m) => d.raceOf(m)))];
      if (races.length <= 1) continue;
      const keep = await d.select(s, 'Keep monsters of one Type', d.monsters(s).filter((m) => m.faceUp), 1, 1, 'good');
      const r = keep[0] && d.raceOf(keep[0]);
      for (const m of d.monsters(s)) if (m.faceUp && d.raceOf(m) !== r) await d.move(m, 'gy', { by: p });
    }
  }, 200)] }),
  "Robbin' Zombie": passive({ effects: [trig('anyBattleDamage', { op: 'mill', who: 'opp', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && ev.src?.ctrl === c.ctrl })] }),
  'Rock Bombardment': trap([run(async ({ d, p }) => { const c = await pick(d, p, 'Send a Rock monster to the Graveyard', d.find(DECK({ kind: 'monster', race: ['Rock'] }), p), 'cost'); if (c) { await d.move(c, 'gy', { by: p }); await d.shuffleDeck(p); } }), { op: 'damage', who: 'opp', n: 500 }], {
    req: [{ f: DECK({ kind: 'monster', race: ['Rock'] }) }],
  }),
};
void act; void grantRule; void has; void quick; void removeA; void tokenDef; void atEndPhase;
