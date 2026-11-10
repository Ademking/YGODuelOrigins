// YGO Online Traps, part 1 (A Feint Plan … Dark Mirror Force).
import {
  type Card, type Def, type Duel, type Side,
  CHRYSALIS, DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  act, addCtr, attackOf, both, crystalInST, ctr, declareName, destroyAll, destroyAtEnd, grantRule, has, isAttackOn, isAlien,
  opp, passive, pick, pickSeen, placeAsSpell, quick, randomOf, removeA, removeCtr, run, scoreWipe, setTrapBack, spell, ssFrom,
  ssPick, threat, tokenDef, tokens, trapEquip, trapMonster, trig, killEquippedOnLeave,
} from './olib';

const trap = spell;
const atkOn = (d: Duel, ev: Parameters<typeof isAttackOn>[0], p: Side) => isAttackOn(ev, p);
const chainHealer = (fn: (x: { d: Duel; p: Side; o: Side }) => Promise<unknown> | unknown, ai: number): Def => trap(run(async ({ d, p, o, card, link }) => {
  await fn({ d, p, o });
  if (link.num >= 4 && d.onField(card)) { await d.toHand(card); }
  else if (link.num >= 2 && d.onField(card)) { await d.move(card, 'deck'); await d.shuffleDeck(card.owner); }
}, ai));
const equipTarget = (link: { ev: import('../../../engine/duel').Ev }) => (link.ev.e === 'attack' ? link.ev.target : null);

export const TRAPS_1: Record<string, Def> = {
  'A Feint Plan': trap(run(({ d }) => d.addTemp({ until: d.turn, lock: { target: (_d, _s, _a, t) => !!t && !t.faceUp } }), 300)),
  'A Hero Emerges': trap(run(async ({ d, p, card }) => {
    const c = randomOf(d, d.players[p].hand);
    if (!c) return;
    await d.reveal(opp(p), [c], 'A Hero Emerges');
    if (c.def.kind === 'monster' && d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card);
    else await d.move(c, 'gy', { by: p });
  }, (d, me, _c, ev) => threat(d, me, ev) / 2), { on: ['oppAttack'], req: [{ f: { side: 'self', zone: 'hand' } }] }),
  'A Rival Appears!': trap(run(async ({ d, p, card, t }) => {
    const x = t[0];
    if (!x) return;
    await ssPick(d, p, d.players[p].hand.filter((c) => c.def.kind === 'monster' && (c.def.lv ?? 0) === d.lvOf(x)), 'Special Summon a monster with the same Level', undefined, false, card);
  }, 800), { targets: [{ f: OPP_FU }] }),
  'Absolute End': trap(run(({ d, o }) => d.addTemp({ until: d.turn, lock: { forceDirect: (_d, _s, a) => a.ctrl === o } }), -1), { cond: (d, _c, p) => d.tp !== p }),
  'Accumulated Fortune': trap({ op: 'draw', who: 'self', n: 2 }, { cond: (d, c) => d.chain.length >= 3 && !d.chain.some((l) => l.card.def.name === c.def.name), when: (_d, ev) => ev.e === 'chain' }),
  'Adhesion Trap Hole': trap(run(({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'summon') return;
    for (const c of ev.cards) if (c.zone === 'mzone' && c.faceUp) d.addMod(c, -Math.floor(d.base(c, 'atk') / 2), 0, -1);
  }, (d, me, _c, ev) => (ev.e === 'summon' ? ev.cards.reduce((s, c) => s + (c.def.atk ?? 0) / 2, 0) - 400 : -1)), { on: ['oppSummon'] }),
  'Aegis of Gaia': passive({
    effects: [trig('leftField', run(({ d, card }) => d.changeLP(card.owner, -3000)), { cond: (_d, c) => !!c.mark.lastFaceUp })],
  }, { ops: [{ op: 'heal', who: 'self', n: 3000 }] }),
  'Alchemy Cycle': trap(run(({ d, p }) => {
    const ids: number[] = [];
    for (const c of d.find(OWN_FU, p)) { d.addMod(c, -d.base(c, 'atk'), 0); ids.push(c.uid); }
    d.addTemp({ until: d.turn, p, sent: async (dd, c, ctrl) => { if (ctrl === p && ids.includes(c.uid) && c.mark.destroyedHow === 'battle') await dd.draw(p, 1); } });
  }, -1), { req: [{ f: OWN_FU }] }),
  'All-Out Attacks': passive({ onSummon: async (d, _src, c, how) => { if (how !== 'normal' && how !== 'flip' && c.zone === 'mzone') { if (c.pos !== 'atk' || !c.faceUp) await d.changePos(c, 'atk', false); } } }),
  'Altar for Tribute': trap(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Send a monster to the Graveyard', d.monsters(p), 'cost');
    if (!c) return;
    const n = c.def.atk ?? 0;
    await d.move(c, 'gy', { by: p });
    await d.heal(p, n);
  }, (d, me) => (d.players[me].lp < 2000 ? 400 : -1)), { req: [{ f: OWN_M }] }),
  'Amazoness Archers': trap(run(async ({ d, o }) => {
    for (const c of d.monsters(o)) { if (!c.faceUp || c.pos !== 'atk') await d.changePos(c, 'atk', false); d.addMod(c, -500, 0, -1); }
  }, (d, me, _c, ev) => threat(d, me, ev) + 300), { on: ['oppAttack'], cond: (d, _c, p) => d.find({ ...OWN_FU, fn: (_d, c) => c.def.name.includes('Amazoness') || c.def.name === 'Amazon Archer' }, p).length > 0 }),
  'Ambush Fangs': trap([{ op: 'negateAttack', endBattle: true }, run(({ d, link }) => { const ev = link.ev; if (ev.e === 'attack') addCtr(d, ev.attacker, 1, 'venom'); })], {
    when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && ev.target.def.name.startsWith('Venom'), ai: (d, me, _c, ev) => threat(d, me, ev) + 400,
  }),
  'An Unfortunate Report': trap(run(({ d, o }) => d.flag('extraBP', o), -1)),
  'Anti-Fusion Device': trap({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { ...FU, mtype: ['fusion'] } }] }),
  'Anti-Spell': trap({ op: 'negate' }, {
    on: ['activateSpell'],
    cost: [run(({ d, p }) => { let n = 2; for (const c of d.fieldCards(p)) { if (!n) break; n -= removeCtr(d, c, n); } }, 0, (d, p) => d.fieldCards(p).reduce((s, c) => s + ctr(c), 0) >= 2)],
  }),
  'Arcana Call': trap(run(async ({ d, p, t }) => {
    const sel = t[0];
    const c = await pick(d, p, 'Banish an Arcana Force monster', d.find({ side: 'any', zone: 'gy', set: 'Arcana Force' }, p), 'good');
    if (!sel || !c) return;
    await d.banish(c, p);
    sel.data.arcanaAs = { def: c.def, turn: d.turn };
  }, 200), { targets: [{ f: { ...OWN_FU, set: 'Arcana Force' }, good: true }], req: [{ f: { side: 'any', zone: 'gy', set: 'Arcana Force' } }] }),
  "Archfiend's Roar": trap(run(async ({ d, p, card }) => {
    const c = await ssPick(d, p, d.find({ ...GY_M('self'), set: 'Archfiend' }, p), 'Special Summon an Archfiend', undefined, false, card);
    if (!c) return;
    const mv = c.mv;
    d.addTemp({ until: 1e9, lock: { tribute: (_d, _s, x) => x === c && x.mv === mv } });
    destroyAtEnd(d, c, p);
  }, 600), { cost: [{ op: 'payLP', n: 500 }], req: [{ f: { ...GY_M('self'), set: 'Archfiend' } }] }),
  'Armor Break': trap({ op: 'negate' }, { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.stype === 'equip' }),
  'Arsenal Robber': trap(run(async ({ d, o }) => {
    const c = await pick(d, o, 'Send an Equip Spell from your Deck to the Graveyard', d.find(DECK({ stype: 'equip' }), o), 'cost');
    if (c) { await d.move(c, 'gy', { by: opp(o) }); await d.shuffleDeck(o); }
  }, 100)),
  'Assault on GHQ': trap([{ op: 'destroy', s: { t: 'target' } }, { op: 'mill', who: 'opp', n: 2 }], { targets: [{ f: OWN_M }], ai: -1 }),
  'Astral Barrier': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Make the attack a direct attack', ops: [run(({ d, link }) => { const ev = attackOf(link.ev); if (ev) { ev.target = null; d.log('The attack becomes a direct attack.'); } })],
      when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target, ai: (d, me, _c, ev) => (ev.e === 'attack' && ev.target && d.players[me].lp > d.atk(ev.attacker) * 2 ? threat(d, me, ev) : -1) }],
  }),
  'Attack Reflector Unit': trap(ssFrom(['hand', 'deck'], { name: 'Cyber Barrier Dragon' }, { ignore: true }), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Cyber Dragon' } } }],
    req: [{ f: { ...OWN_M, name: 'Cyber Dragon' } }, { f: { side: 'self', zone: ['hand', 'deck'], name: 'Cyber Barrier Dragon' } }],
  }),
  'Backfire': passive({
    effects: [trig('anyToGY', { op: 'damage', who: 'opp', n: 500 }, { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.from === 'mzone' && ev.ctrl === c.ctrl && ev.card.def.attr === 'FIRE' && ev.card.mark.destroyedTurn === d.turn })],
  }),
  'Backs to the Wall': trap(run(async ({ d, p, card }) => {
    await d.changeLP(p, 100 - d.players[p].lp, true);
    const used = new Set(d.monsters(p).map((c) => c.def.name));
    for (;;) {
      const cands = d.find({ ...GY_M('self'), set: 'Six Samurai' }, p).filter((c) => !used.has(c.def.name) && d.canSpecial(p, c) && d.revivable(c));
      const c = await pick(d, p, 'Special Summon a Six Samurai', cands, 'good');
      if (!c) break;
      used.add(c.def.name);
      await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card);
    }
  }, (d, me) => (d.players[me].lp <= 1000 ? 1500 : -1)), { req: [{ f: { ...GY_M('self'), set: 'Six Samurai' } }] }),
  'Bad Reaction to Simochi': passive({ lock: { healToDamage: (_d, src, s) => !!src && s !== src.ctrl } }),
  'Bark of Dark Ruler': trap(run(async ({ d, p, o }) => {
    const b = d.battle;
    const foe = b && (b.att.ctrl === o ? b.att : b.tgt?.ctrl === o ? b.tgt : null);
    if (!foe) return;
    const max = Math.min(Math.floor((d.players[p].lp - 1) / 100), Math.ceil(Math.max(d.atk(foe), d.defv(foe)) / 100));
    const opts = Array.from({ length: Math.max(1, max) }, (_, i) => `${(i + 1) * 100}`);
    const n = (1 + (await d.option(p, 'Pay LP (multiples of 100)', opts, opts.length - 1))) * 100;
    await d.changeLP(p, -n, true);
    d.addMod(foe, -n, -n);
  }, 600), { when: (d, ev, p) => !!d.battle && [d.battle.att, d.battle.tgt].some((m) => m && m.ctrl === p && d.raceOf(m) === 'Fiend') && ev.e === 'attack' }),
  'Barrel Behind the Door': trap(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { redirect: (dd, _s, s) => s === p && dd.chain.length > 0 } }), 900), {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => (o.op === 'damage' && (o.who === 'opp' || o.who === 'both')) || o.op === 'damageAtk'),
  }),
  'Battle-Scarred': passive({
    effects: [
      trig('standby', run(({ d, card }) => { const m = card.data.sel !== undefined ? d.byUid(card.data.sel) : undefined; if (m?.def.upkeep && m.zone === 'mzone') return d.changeLP(opp(card.ctrl), -m.def.upkeep, true); }), { cond: (d, c) => d.onField(c) }),
      trig('leftField', run(async ({ d, card }) => { const m = card.last.sel !== undefined ? d.byUid(card.last.sel) : undefined; if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); })),
    ],
    selfDestructIf: (d, c) => c.data.sel !== undefined && !d.monsters(c.ctrl).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  }, { targets: [{ f: { ...OWN_FU, set: 'Archfiend' }, good: true }], ops: [run(({ card, t }) => { if (t[0]) { card.data.sel = t[0].uid; card.data.selMv = t[0].mv; } })] }),
  'Beast Soul Swap': trap(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    const lv = c.def.lv, owner = c.owner;
    await d.toHand(c);
    await ssPick(d, owner, d.players[owner].hand.filter((x) => x.def.kind === 'monster' && x.def.race === 'Beast' && x.def.lv === lv && x !== c), 'Special Summon a Beast');
    void p;
  }, 200), { targets: [{ f: { ...OWN_FU, race: ['Beast'] }, good: true }] }),
  'Beckoning Light': trap(run(async ({ d, p, card }) => {
    const hand = d.players[p].hand.filter((c) => c !== card);
    const n = hand.length;
    if (n) await d.discard(p, hand, p);
    for (const c of await d.select(p, `Add ${n} LIGHT monsters to your hand`, d.find({ ...GY_M('self'), attr: 'LIGHT' }, p), Math.min(n, d.find({ ...GY_M('self'), attr: 'LIGHT' }, p).length), n, 'good')) await d.toHand(c);
  }, (d, me) => (d.find({ ...GY_M('self'), attr: 'LIGHT' }, me).length >= d.players[me].hand.length ? 300 : -1))),
  'Begone, Knave!': passive({ effects: [trig('anyBattleDamage', run(async ({ d, link }) => { const ev = link.ev; if (ev.e === 'damage' && ev.src && ev.src.zone === 'mzone') await d.toHand(ev.src); }), { cond: (_d, _c, _p, ev) => ev?.e === 'damage' && !!ev.src })] }),
  'Big Burn': trap(run(async ({ d, p }) => { for (const s of [0, 1] as Side[]) for (const c of d.players[s].gy.filter((x) => x.def.kind === 'monster')) await d.banish(c, p); }, 600), {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.targets.flat().some((c) => c.zone === 'gy' && c.def.kind === 'monster'),
  }),
  'Birthright': passive({
    effects: [trig('leftField', run(async ({ d, card }) => { const m = card.last.sel !== undefined ? d.byUid(card.last.sel) : undefined; if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); }))],
    selfDestructIf: (d, c) => c.data.sel !== undefined && !d.monsters(c.ctrl).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  }, {
    targets: [{ f: { ...GY_M('self'), mtype: ['normal'] }, good: true }],
    ops: [run(async ({ d, p, card, t }) => { const m = t[0]; if (m && m.zone === 'gy' && (await d.specialSummon(m, p, 'atk', 'special', false, card))) { card.data.sel = m.uid; card.data.selMv = m.mv; } }, 800)],
  }),
  'Black Horn of Heaven': trap({ op: 'negate' }, { when: (_d, ev, p) => ev.e === 'summoning' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip' && ev.cards.length === 1 }),
  'Blast Held by a Tribute': trap([destroyAll({ ...OPP_FU, pos: 'atk' }), { op: 'damage', who: 'opp', n: 1000 }], {
    on: ['oppAttack'], cond: (_d, _c, _p, ev) => !!ev && ev.e === 'attack' && ev.attacker.data.how === 'normal' && d0Tribute(ev.attacker),
  }),
  'Blast with Chain': {
    effects: [act({ req: [{ f: OWN_FU }], ops: [run(async ({ d, p, card }) => {
      const m = await pick(d, p, 'Equip Blast with Chain', d.find(OWN_FU, p), 'good');
      if (m) await trapEquip(d, card, m, { atk: 500 });
    }, 300)] }), trig('destroyed', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy 1 card', [...d.fieldCards(0), ...d.fieldCards(1)], 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), {
      from: ['gy'], cond: (_d, c) => c.last.eqTo !== undefined && c.mark.destroyedHow === 'effect',
    })],
  },
  'Blasting Fuse': trap(run(async ({ d, p, card }) => {
    const i = card.slot, j = 4 - i;
    for (const c of [d.players[p].m[i], d.players[opp(p)].m[j], d.players[opp(p)].s[j]]) if (c) await d.destroy(c, 'effect', undefined, p);
    await d.destroy(card, 'effect', undefined, p);
  }, 800), { cond: (d, c, p) => c.zone === 'szone' && !!d.players[p].m[c.slot] && !!d.players[opp(p)].m[4 - c.slot] && !!d.players[opp(p)].s[4 - c.slot] }),
  'Blasting the Ruins': trap({ op: 'damage', who: 'opp', n: 3000 }, { cond: (d, _c, p) => d.players[p].gy.length >= 30 }),
  'Bottomless Shifting Sand': passive({
    effects: [
      trig('endPhase', run(async ({ d, card }) => {
        const cs = both(d).filter((c) => c.faceUp);
        const top = Math.max(...cs.map((c) => d.atk(c)));
        for (const c of cs.filter((x) => d.atk(x) === top)) await d.destroy(c, 'effect', undefined, card.ctrl);
      }), { cond: (d, c) => d.onField(c) && d.tp !== c.ctrl && both(d).some((m) => m.faceUp) }),
      trig('standby', run(({ d, card }) => d.destroy(card, 'effect', undefined, card.ctrl)), { cond: (d, c) => d.onField(c) && d.players[c.ctrl].hand.length <= 4 }),
    ],
  }),
  'Bottomless Trap Hole': trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    if (ev.e !== 'summon') return;
    for (const c of ev.cards) if (c.zone === 'mzone' && c.faceUp && d.atk(c) >= 1500 && (await d.destroy(c, 'effect', undefined, p)) && (c.zone as string) === 'gy') await d.banish(c, p);
  }, (d, me, _c, ev) => (ev.e === 'summon' ? ev.cards.reduce((s, c) => s + (c.def.atk ?? 0), 0) : -1)), { on: ['oppSummon'], onF: { faceUp: true, minAtk: 1500 } }),
  'Brainwashing Beam': passive({
    effects: [trig('endPhase', run(({ d, card }) => { const m = card.data.sel !== undefined ? d.byUid(card.data.sel) : undefined; if (m) removeA(d, m, 1); }), { cond: (d, c) => d.onField(c) && d.tp === c.ctrl })],
    selfDestructIf: (d, c) => { if (c.data.sel === undefined) return false; const m = d.byUid(c.data.sel); return !m || m.zone !== 'mzone' || m.mv !== c.data.selMv || ctr(m, 'A') === 0; },
  }, {
    targets: [{ f: { ...OPP_FU, fn: (_d, c) => ctr(c, 'A') > 0 } }],
    ops: [run(async ({ d, p, card, t }) => { const m = t[0]; if (m && (await d.takeControl(m, p, false, card))) { card.data.sel = m.uid; card.data.selMv = m.mv; } }, (d, me) => Math.max(-1, ...d.find(OPP_FU, me).filter((c) => ctr(c, 'A') > 0).map((c) => d.atk(c))))],
  }),
  'Breakthrough!': trap(run(({ d, p, t }) => {
    const c = t[0];
    if (!c) return;
    d.addTemp({ until: d.turn, p, afterBattle: (dd, r) => {
      if (!((r.att === c && r.killedT) || (r.tgt === c && r.killedA))) return;
      for (const m of dd.monsters(p)) if (m.faceUp && (m.def.name.includes('Six Samurai') || m.def.name === 'Great Shogun Shien')) grantRule(dd, m, 'direct');
    } });
  }, 300), { targets: [{ f: { ...OWN_FU, set: 'Six Samurai' }, good: true }] }),
  'Brutal Potion': {
    ...trap(run(async ({ d, p, card }) => {
      const m = await pick(d, p, 'Equip Brutal Potion', d.find(OWN_FU, p), 'good');
      if (m) await trapEquip(d, card, m, {});
    }, 200), { req: [{ f: OWN_FU }] }),
    onDamage: (d, src, s, _n, from, battle) => {
      const m = d.equippedTo(src);
      if (!m || battle || s === src.ctrl || !from || d.holder(from) !== src.ctrl || src.data.brutalTurn === d.turn) return;
      src.data.brutalTurn = d.turn;
      d.addMod(m, 1000, 0);
    },
  },
  'Bubble Crash': trap(run(async ({ d, p }) => {
    for (const s of [0, 1] as Side[]) {
      const all = [...d.players[s].hand, ...d.fieldCards(s)];
      const n = all.length - 5;
      if (n <= 0) continue;
      for (const c of await d.select(s, `Send ${n} cards to the Graveyard`, all, n, n, 'cost')) await d.move(c, 'gy', { by: p });
    }
  }, (d, me) => d.players[opp(me)].hand.length + d.fieldCards(opp(me)).length - Math.max(5, d.players[me].hand.length + d.fieldCards(me).length)), {
    cond: (d) => ([0, 1] as Side[]).some((s) => d.players[s].hand.length + d.fieldCards(s).length >= 6),
  }),
  'Burst Breath': trap(run(async ({ d, p, link }) => {
    const n = link.data.atk ?? 0;
    for (const c of both(d).filter((x) => x.faceUp && d.defv(x) <= n)) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => scoreWipe(d, me, () => true) - 1000), {
    cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Tribute a Dragon', d.find({ ...OWN_M, race: ['Dragon'] }, p).filter((x) => d.tributeOk(x)), 'cost'); if (c) { link.data.atk = c.faceUp ? d.atk(c) : c.def.atk; await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p) => d.find({ ...OWN_M, race: ['Dragon'] }, p).some((x) => d.tributeOk(x)))],
  }),
  'By Order of the Emperor': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Negate a Normal Summon effect', ops: [run(async ({ d, link }) => { const ev = link.ev; if (ev.e === 'chain') { ev.link.negated = true; await d.draw(ev.link.p, 1); } })],
      when: (_d, ev) => ev.e === 'chain' && !!ev.link.trig && ev.link.trig.ev.e === 'summon' && ev.link.trig.ev.how === 'normal' && ev.link.card.def.kind === 'monster', ai: (_d, me, _c, ev) => (ev.e === 'chain' && ev.link.p !== me ? 400 : -1) }],
  }),
  'Byroad Sacrifice': trap(ssFrom(['hand'], { name: 'Cyber Ogre' }), { when: (d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.from === 'mzone' }),
  'Call of the Earthbound': trap(run(async ({ d, p, link }) => {
    const ev = attackOf(link.ev);
    if (!ev) return;
    const t = await pick(d, p, 'Select the attack target', d.attackTargets(ev.attacker).filter((x): x is Card => !!x), 'good');
    if (t) { ev.target = t; d.log(`The attack target becomes ${t.faceUp ? t.def.name : 'a face-down monster'}.`); }
  }, (d, me, _c, ev) => (ev.e === 'attack' && d.monsters(me).length > 1 ? threat(d, me, ev) / 2 : -1)), { on: ['oppAttack'] }),
  'Cell Explosion Virus': trap(destroyAll({ ...OPP_M, pos: 'atk' }), { on: ['oppAttack'], cond: (_d, _c, _p, ev) => ev?.e === 'attack' && ctr(ev.attacker, 'A') > 0 }),
  'Cemetary Bomb': trap(run(({ d, o }) => d.damage(o, 100 * d.players[o].gy.length), (d, me) => 100 * d.players[opp(me)].gy.length)),
  'Chain Burst': passive({ onResolve: async (d, _s, link) => { if (link.isCard && link.card.def.kind === 'trap' && link.card.def.name !== 'Chain Burst') await d.damage(link.p, 1000); } }),
  'Chain Detonation': chainHealer(({ d, o }) => d.damage(o, 500), 500),
  'Chain Disappearance': trap(run(async ({ d, p, o, link }) => {
    const ev = link.ev;
    const m = ev.e === 'summon' ? ev.cards.find((c) => c.zone === 'mzone' && d.atk(c) <= 1000) : undefined;
    if (!m) return;
    const name = m.def.name, owner = m.ctrl;
    await d.banish(m, p);
    for (const c of [...d.players[owner].hand, ...d.players[owner].deck].filter((x) => x.def.name === name)) await d.banish(c, p);
    await d.shuffleDeck(owner);
    void o;
  }, 600), { on: ['oppSummon'], onF: { faceUp: true, maxAtk: 1000 } }),
  'Chain Healing': chainHealer(({ d, p }) => d.heal(p, 500), 300),
  'Chain Material': trap(run(({ d, p }) => {
    d.players[p].noAttackTurn = d.turn;
    d.addTemp({ until: d.turn, p, tag: 'chainMaterial' });
  }, -1)),
  'Change of Hero - Reflector Ray': trap(run(({ d, o, link }) => { const ev = link.ev; if (ev.e === 'sent') return d.damage(o, 300 * (ev.card.def.lv ?? 0)); }, 900), {
    when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.card.def.mtype === 'fusion' && ev.card.def.name.includes('Elemental Hero'),
  }),
  'Chaos Burst': trap([{ op: 'destroy', s: { t: 'event' } }, { op: 'damage', who: 'opp', n: 1000 }], { on: ['oppAttack'], cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }], ai: (d, me, _c, ev) => threat(d, me, ev) + 600 }),
  'Chthonian Blast': trap(run(async ({ d, p }) => {
    const cs = both(d).filter((c) => c.faceUp);
    const low = Math.min(...cs.map((c) => d.atk(c)));
    const c = await pick(d, p, 'Destroy the lowest ATK monster', cs.filter((x) => d.atk(x) === low), 'bad');
    if (!c) return;
    const n = Math.floor(d.atk(c) / 2);
    if (await d.destroy(c, 'effect', undefined, p)) { await d.damage(0, n); await d.damage(1, n); }
  }, 300), { when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.from === 'mzone' && ev.card.mark.lastFaceUp && ev.card.def.kind === 'monster' && (ev.why === 'battle' || ev.why === 'effect'), req: [{ f: FU }] }),
  'Chthonian Polymer': trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    const f = ev.e === 'summon' ? ev.cards[0] : undefined;
    if (f && f.zone === 'mzone') await d.takeControl(f, p, true);
  }, 2000), { when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how === 'fusion', cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }] }),
  'Clay Charge': trap(run(async ({ d, p, o, link }) => {
    const ev = attackOf(link.ev);
    if (!ev || !ev.target) return;
    await d.destroy(ev.attacker, 'effect', undefined, p);
    await d.destroy(ev.target, 'effect', undefined, p);
    await d.damage(o, 800);
  }, (d, me, _c, ev) => threat(d, me, ev) + 500), { when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.def.name === 'Elemental Hero Clayman' }),
  'Cloak and Dagger': passive({
    onSummon: async (d, src, c, _how, p) => { if (p !== src.ctrl && c.def.name === src.data.name && c.zone === 'mzone') { await d.banish(c, src.ctrl); if (d.onField(src)) await d.banish(src, src.ctrl); } },
  }, { ops: [run(async ({ d, p, o, card }) => { card.data.name = await declareName(d, p, 'Declare a Monster Card name', d.players[o].hand, (c) => c.def.kind === 'monster' && c.owner === o); })] }),
  'Cloning': trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    const m = ev.e === 'summon' ? ev.cards[0] : undefined;
    if (!m) return;
    const [tok] = await tokens(d, p, { ...m.def, id: 'token_clone', name: 'Clone Token', effects: [], token: true, mtype: 'normal' }, 1, 'atk');
    if (!tok) return;
    d.addTemp({ until: 1e9, sent: async (dd, c) => { if (c === m && tok.zone === 'mzone') await dd.destroy(tok, 'effect', undefined, p); } });
  }, (_d, _me, _c, ev) => (ev.e === 'summon' ? (ev.cards[0].def.atk ?? 0) - 500 : -1)), { on: ['oppNormalFlip'] }),
  'Cocoon Veil': trap(run(async ({ d, p, card, link }) => {
    d.addTemp({ until: d.turn, lock: { noDamage: (_d, _s, _x, battle) => !battle } });
    const name = link.data.neo as string | undefined;
    if (name) await ssPick(d, p, d.find({ side: 'any', zone: ['hand', 'deck', 'gy'], name }, p).filter((c) => c.zone === 'gy' || c.owner === p), `Special Summon ${name}`, undefined, false, card);
  }, 600), {
    cost: [run(async ({ d, p, link }) => {
      const c = await pick(d, p, 'Tribute a Chrysalis', d.find({ ...OWN_FU, set: 'Chrysalis' }, p).filter((x) => d.tributeOk(x)), 'cost');
      if (c) { link.data.neo = CHRYSALIS[c.def.name]; await d.move(c, 'gy', { why: 'tribute' }); }
    }, 0, (d, p) => d.find({ ...OWN_FU, set: 'Chrysalis' }, p).length > 0)],
  }),
  'Coffin Seller': passive({ effects: [trig('anyToGY', { op: 'damage', who: 'opp', n: 300 }, { cond: (_d, c, _p, ev) => ev?.e === 'sent' && ev.owner !== c.ctrl && ev.card.def.kind === 'monster' })] }),
  'Common Charity': trap(run(async ({ d, p }) => {
    await d.draw(p, 2);
    const c = await pick(d, p, 'Banish a Normal Monster from your hand', d.players[p].hand.filter((x) => x.def.kind === 'monster' && x.def.mtype === 'normal'), 'cost');
    if (c) await d.banish(c, p);
    else for (const h of [...d.players[p].hand]) await d.move(h, 'gy', { by: p });
  }, (d, me) => (d.players[me].hand.some((c) => c.def.mtype === 'normal' && c.def.kind === 'monster') ? 700 : -1), (d, p) => d.players[p].deck.length >= 2)),
  'Compulsory Evacuation Device': trap({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: M }] }),
  'Conscription': trap(run(async ({ d, p, o, card }) => {
    const top = d.players[o].deck[d.players[o].deck.length - 1];
    if (!top) return;
    await d.reveal(p, [top], 'Conscription');
    const ok = top.def.kind === 'monster' && (top.def.mtype === 'normal' || top.def.mtype === 'effect') && !top.def.noNormal;
    if (ok && d.canSpecial(p, top)) await d.specialSummon(top, p, await d.askPos(p, top), 'special', false, card);
    else await d.toHand(top);
  }, 400)),
  'Counter Counter': trap({ op: 'negate' }, { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.stype === 'counter' && ev.link.card.def.kind === 'trap' }),
  'Covering Fire': trap(run(async ({ d, p, link }) => {
    const ev = attackOf(link.ev);
    if (!ev || !ev.target || ev.target.zone !== 'mzone') return;
    const c = await pick(d, p, 'Select another monster', d.find(OWN_FU, p).filter((x) => x !== ev.target), 'good');
    if (c) d.addMod(ev.target, d.atk(c), 0, d.turn, 'attack');
  }, (d, me, _c, ev) => threat(d, me, ev)), { when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp, req: [{ f: OWN_FU, n: 2 }] }),
  'Crop Circles': trap(run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'Send monsters to the Graveyard', d.monsters(p), 1, 5, 'cost');
    const lv = cs.reduce((s, c) => s + d.lvOf(c), 0);
    for (const c of cs) await d.move(c, 'gy', { by: p });
    const a = await ssPick(d, p, d.find(DECK({ kind: 'monster', fn: (_d, x) => isAlien(x) && (x.def.lv ?? 0) === lv }), p), 'Special Summon an Alien', undefined, true, card);
    if (!a) await d.damage(p, 2000);
  }, 300), { req: [{ f: OWN_M }] }),
  'Cross Counter': trap(run(({ d, p, link }) => {
    const ev = attackOf(link.ev);
    if (!ev || !ev.target) return;
    const att = ev.attacker, tgt = ev.target;
    d.addTemp({ until: d.turn, p, lock: { battleDmg: (_d, _s, a, _t, n, to) => (a === att && to === att.ctrl ? n * 2 : n) },
      afterBattle: async (dd, r) => { if (r.att === att && r.tgt === tgt && att.zone === 'mzone') await dd.destroy(att, 'effect', undefined, p); } });
  }, (d, me, _c, ev) => (ev.e === 'attack' && ev.target && ev.target.pos === 'def' && d.defv(ev.target) > d.atk(ev.attacker) ? 900 : -1)), {
    when: (d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.pos === 'def' && (!ev.target.faceUp || d.defv(ev.target) > d.atk(ev.attacker)),
  }),
  'Cry Havoc!': passive({
    effects: [{ type: 'ignition', from: ['szone'], label: 'Banish a monster: Normal Summon a Normal Monster', ops: [run(async ({ d, p }) => {
      const c = await pick(d, p, 'Normal Summon a Normal Monster', d.players[p].hand.filter((x) => x.def.kind === 'monster' && x.def.mtype === 'normal' && d.tributesNeeded(p, x) === 0), 'good');
      if (c) { d.players[p].bonusSummons++; c.mark.cryHavoc = d.turn; }
    }, 400)], cost: [{ op: 'banish', s: { t: 'choose', f: GY_M('self') } }], req: [{ f: GY_M('self') }, { f: { side: 'self', zone: 'hand', kind: 'monster', mtype: ['normal'], maxLv: 4 } }] }],
  }),
  'Crystal Counter': trap(run(async ({ d, p, card }) => {
    for (const c of d.players[p].s.filter((x): x is Card => !!x && x !== card)) await d.move(c, 'gy', { by: p });
    for (const c of d.find({ ...GY_M('self'), set: 'Crystal Beast' }, p)) if (!(await placeAsSpell(d, c, p))) break;
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { for (const c of d.fieldCards(p).filter((x) => x.faceUp && x.def.name.includes('Crystal Beast'))) await d.destroy(c, 'effect', undefined, p); } });
  }, 300), { req: [{ f: { ...GY_M('self'), set: 'Crystal Beast' } }] }),
  'Crystal Pair': trap(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Place a Crystal Beast from your Deck', d.find(DECK({ kind: 'monster', set: 'Crystal Beast' }), p), 'good');
    if (c) { await placeAsSpell(d, c, p); await d.shuffleDeck(p); }
    d.addTemp({ until: d.turn, tag: 'noBattleDmg', p });
  }, 500), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.card.def.name.includes('Crystal Beast') }),
  'Crystal Raigeki': trap({ op: 'destroy', s: { t: 'target' } }, {
    cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, set: 'Crystal Beast', fn: (_d, c) => c.def.kind === 'monster' } } }],
    targets: [{ f: { side: 'opp' } }], cond: (d, _c, p) => crystalInST(d, p) > 0,
  }),
  'Curse of Aging': trap(run(({ d, o }) => { for (const c of d.monsters(o)) d.addMod(c, -500, -500); }, (d, me) => d.monsters(opp(me)).length * 400 - 300), { cost: [{ op: 'discard', who: 'self', n: 1 }], req: [{ f: OPP_FU }] }),
  'Curse of Anubis': trap(run(async ({ d }) => {
    for (const c of both(d).filter((x) => x.faceUp && x.def.mtype === 'effect')) {
      if (c.pos !== 'def') await d.changePos(c, 'def');
      d.addMod(c, 0, -d.base(c, 'def'));
      const mv = c.mv;
      d.addTemp({ until: d.turn, lock: { pos: (_d, _s, x) => x === c && x.mv === mv } });
    }
  }, (d, me) => d.monsters(opp(me)).filter((c) => c.faceUp && c.def.mtype === 'effect').length * 400)),
  'Curse of Darkness': passive({ onResolve: async (d, _s, link) => { if (link.isCard && link.card.def.kind === 'spell') await d.damage(link.p, 1000); } }),
  'Curse of Royal': trap({ op: 'negate' }, {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind !== 'monster' && ev.link.eff.ops.some((o) => o.op === 'destroy') && (ev.link.eff.targets ?? []).some((t) => !!t.f.st || [t.f.zone].flat().includes('szone')),
  }),
  'Cursed Seal of the Forbidden Spell': trap([{ op: 'negate' }, run(({ d, o, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const name = ev.link.card.def.name;
    d.addTemp({ until: 1e9, lock: { activate: (_d, _s, q, c) => q === o && c.def.name === name } });
  })], {
    on: ['activateSpell'],
    cost: [run(async ({ d, p, card }) => { const c = await pick(d, p, 'Discard a Spell Card', d.players[p].hand.filter((x) => x !== card && x.def.kind === 'spell'), 'cost'); if (c) await d.discard(p, [c], null); }, 0, (d, p, card) => d.players[p].hand.some((x) => x !== card && x.def.kind === 'spell'))],
  }),
  'Cyber Shadow Gardna': {
    effects: [act({
      cond: (d, _c, p) => d.tp !== p && (d.phase === 'M1' || d.phase === 'M2'),
      ops: [run(async ({ d, p, card }) => {
        await trapMonster(d, card, p, {
          race: 'Machine', attr: 'EARTH', lv: 4, atk: 0, def: 0,
          preBattle: (dd, self, other) => { if (other && dd.battle?.tgt === self) self.data.copy = { atk: dd.atk(other), def: dd.defv(other) }; },
          effects: [trig('endPhase', run(({ d: dd, card: c }) => setTrapBack(dd, c)), { cond: (dd, c) => dd.tp !== c.ctrl })],
        }, 'def');
      }, 600)],
    })],
  },
  'Cyber Summon Blaster': passive({ onSummon: async (d, src, c, how) => { if (how !== 'normal' && how !== 'flip' && d.raceOf(c) === 'Machine') await d.damage(opp(src.ctrl), 300, src); } }),
  'Cybernetic Hidden Technology': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Send a Cyber Dragon: destroy the attacker', ops: [{ op: 'destroy', s: { t: 'event' } }],
      cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, fn: (_d, c) => c.def.name === 'Cyber Dragon' || (c.def.mtype === 'fusion' && c.def.text.includes('"Cyber Dragon"')) } } }],
      when: (_d, ev, p) => isAttackOn(ev, p), ai: (d, me, _c, ev) => threat(d, me, ev) - 800 }],
  }),
  'D - Chain': {
    ...trap(run(async ({ d, p, card }) => {
      const m = await pick(d, p, 'Equip D - Chain to a Destiny Hero', d.find({ ...OWN_FU, set: 'Destiny Hero' }, p), 'good');
      if (m) await trapEquip(d, card, m, { atk: 500 });
    }, 500), { req: [{ f: { ...OWN_FU, set: 'Destiny Hero' } }] }),
    postBattle: async (d, self, o, r) => { if (o && o.zone === 'gy' && ((r.att === self && r.killedT) || (r.tgt === self && r.killedA))) await d.damage(opp(self.ctrl), 500); },
  },
  'D - Counter': trap({ op: 'destroy', s: { t: 'event' } }, { when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.def.name.includes('Destiny Hero'), ai: (d, me, _c, ev) => threat(d, me, ev) + 500 }),
  'D - Fortune': trap({ op: 'negateAttack', endBattle: true }, {
    when: (_d, ev, p) => isAttackOn(ev, p) && !ev.target, cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), set: 'Destiny Hero' } } }], ai: (d, me, _c, ev) => threat(d, me, ev),
  }),
  'D - Shield': trap(run(async ({ d, card, link }) => {
    const t = equipTarget(link);
    if (!t || t.zone !== 'mzone') return;
    await d.changePos(t, 'def');
    await trapEquip(d, card, t, { rules: ['battleImmune'] });
  }, (d, me, _c, ev) => threat(d, me, ev)), { when: (_d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && ev.target.pos === 'atk' && ev.target.def.name.includes('Destiny Hero') }),
  'D - Time': trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    const lv = ev.e === 'sent' ? ev.card.def.lv ?? 0 : 0;
    const c = await pick(d, p, 'Add a Destiny Hero', d.find(DECK({ kind: 'monster', set: 'Destiny Hero', fn: (_d, x) => (x.def.lv ?? 0) <= lv }), p), 'good');
    if (c) { await d.toHand(c); await d.shuffleDeck(p); }
  }, 500), { when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.from === 'mzone' && ev.card.def.name.includes('Elemental Hero') }),
  'D. Tribe': trap(run(({ d, p }) => d.addTemp({ until: d.turn, race: (_d, c) => (c.ctrl === p && c.zone === 'mzone' ? 'Dragon' : undefined) }), 100)),
  'D.D. Dynamite': trap(run(({ d, o }) => d.damage(o, 300 * d.players[o].banished.length), (d, me) => 300 * d.players[opp(me)].banished.length)),
  'D.D. Trap Hole': trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    if (ev.e !== 'set' || ev.card.zone !== 'mzone') return;
    if ((await d.destroy(ev.card, 'effect', undefined, p)) && (ev.card.zone as string) === 'gy') await d.banish(ev.card, p);
    const mine = await pick(d, p, 'Destroy and banish one of your monsters', d.monsters(p), 'cost');
    if (mine && (await d.destroy(mine, 'effect', undefined, p)) && mine.zone === 'gy') await d.banish(mine, p);
  }, 300), { when: (_d, ev, p) => ev.e === 'set' && ev.player !== p, req: [{ f: OWN_M }] }),
  'Damage = Reptile': passive({
    effects: [{ type: 'quick', from: ['szone'], opt: true, label: 'Special Summon a Reptile', ops: [run(async ({ d, p, link }) => {
      const ev = link.ev;
      const n = ev.e === 'damage' ? ev.n : 0;
      await ssPick(d, p, d.find(DECK({ kind: 'monster', race: ['Reptile'], fn: (_d, c) => (c.def.atk ?? 0) <= n }), p), 'Special Summon a Reptile');
    }, 700)], when: (d, ev, p) => ev.e === 'damage' && ev.battle && ev.player === p && !!ev.src && (d.raceOf(ev.src) === 'Reptile' || (!!d.battle && [d.battle.att, d.battle.tgt].some((m) => m && d.raceOf(m) === 'Reptile'))) }],
  }),
  'Damage Condenser': trap(run(async ({ d, p, card, link }) => {
    const ev = link.ev;
    const n = ev.e === 'damage' ? ev.n : 0;
    await ssPick(d, p, d.find(DECK({ kind: 'monster', fn: (_d, c) => (c.def.atk ?? 0) <= n }), p), 'Special Summon a monster', 'atk', false, card);
  }, 700), { when: (_d, ev, p) => ev.e === 'damage' && ev.battle && ev.player === p, cost: [{ op: 'discard', who: 'self', n: 1 }] }),
  'Damage Polarizer': trap([{ op: 'negate' }, { op: 'draw', who: 'both', n: 1 }], { when: (_d, ev) => ev.e === 'chain' && ev.link.eff.ops.some((o) => o.op === 'damage' || o.op === 'damageAtk') }),
  'Dark Bribe': trap([{ op: 'negate' }, { op: 'draw', who: 'opp', n: 1 }], { on: ['activateST'] }),
  'Dark Coffin': {
    effects: [act({ ops: [] }), trig('destroyed', run(async ({ d, o }) => {
      const i = d.players[o].hand.length && d.monsters(o).length ? await d.option(o, 'Dark Coffin', ['Discard 1 random card', 'Destroy 1 of your monsters']) : d.players[o].hand.length ? 0 : 1;
      if (i === 0) { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], opp(o)); }
      else { const c = await pick(d, o, 'Destroy one of your monsters', d.monsters(o), 'cost'); if (c) await d.destroy(c, 'effect', undefined, opp(o)); }
    }), { from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false })],
  },
  'Dark Cure': passive({ onSummon: async (d, src, c, _how, p) => { if (p !== src.ctrl && c.faceUp) await d.heal(p, Math.floor(d.atk(c) / 2)); } }),
  'Dark Deal': trap(run(({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const victim = ev.link.p === link.p ? opp(link.p) : link.p;
    ev.link.eff = { ...ev.link.eff, targets: [], ops: [run(async ({ d: dd }) => { const c = randomOf(dd, dd.players[victim].hand); if (c) await dd.discard(victim, [c], opp(victim)); })] };
    d.log("The Normal Spell's effect becomes \"discard 1 random card\".");
  }, 900), { cost: [{ op: 'payLP', n: 1000 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'spell' && ev.link.card.def.stype === 'normal' }),
  'Dark Illusion': trap({ op: 'negate' }, { when: (d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.targets.flat().some((c) => c.zone === 'mzone' && c.faceUp && d.attrOf(c) === 'DARK') }),
  'Dark Mirror Force': trap(run(async ({ d, p, o }) => { for (const c of d.find({ ...OPP_M, pos: 'def' }, p)) await d.banish(c, p); void o; }, (d, me) => d.monsters(opp(me)).filter((c) => c.pos === 'def').reduce((s, c) => s + (c.def.atk ?? 0) + 300, 0)), { on: ['oppAttack'] }),
};

function d0Tribute(c: Card) { return (c.def.lv ?? 0) >= 5; }
void ST; void quick; void pickSeen; void killEquippedOnLeave; void tokenDef; void act; void has;
