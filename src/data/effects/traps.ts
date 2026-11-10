// Trap Cards of the Joey the Passion catalog not covered by the original cardEffects.ts table.
import {
  type Card, type Def, type Duel, type Ev, type Link, type Side,
  ATTRS, FU, GY_M, M, OPP_FU, OPP_M, OPP_ST, OWN_FU, OWN_M, RACES, ST,
  act, bestRevive, countFU, destroyAll, destroyT, giveToHand, isAttackOn, linkOf, mostCommon, oppActivates, oppLink, opp,
  passive, pick, randomOf, run, scoreWipe, spell, T, threat, trig, umi, yes,
} from './lib';

const LETTERS = ['Spirit Message "I"', 'Spirit Message "N"', 'Spirit Message "A"', 'Spirit Message "L"'];
const linkTarget = run(({ card, t }) => { if (t[0]) { card.data.tgt = t[0].uid; card.data.tgtMv = t[0].mv; } }, 300);
const linkGone = (d: Duel, c: Card) => {
  if (c.data.tgt === undefined) return false;
  const t = d.byUid(c.data.tgt);
  return !t || t.mv !== c.data.tgtMv || t.zone !== 'mzone';
};
const all = (d: Duel) => [...d.monsters(0), ...d.monsters(1)];
/** Does an opponent's chain link destroy one of p's Trap Cards? */
function destroysTraps(d: Duel, l: Link, p: Side) {
  return l.eff.ops.some((o) => o.op === 'destroy' && (
    (o.s.t === 'target' && l.targets.flat().some((c) => c.ctrl === p && c.def.kind === 'trap')) ||
    (o.s.t === 'all' && d.find(o.s.f, l.p, l.card).some((c) => c.ctrl === p && c.def.kind === 'trap'))));
}
const onePlayerSpell = (l: Link) => l.eff.ops.length > 0 && l.eff.ops.every((o) => 'who' in o && o.who !== 'both');
const sentBy = (kind: 'spell' | 'trap') => (_d: Duel, ev: Ev, p: Side) =>
  ev.e === 'sent' && ev.owner === p && ev.card.def.kind === kind && ev.why === 'effect' && ev.by === opp(p);

export const TRAPS: Record<string, Def> = {
  'Aqua Chorus': passive({ auraFn: (d, _s, t) => (countFU(d, (m) => m !== t && d.nameOf(m) === d.nameOf(t)) > 0 ? { atk: 500, def: 500 } : undefined) }),
  'Skull Dice': spell(run(async ({ d, o }) => { const n = (await d.die()) * 100; for (const m of d.monsters(o)) if (m.faceUp) d.addMod(m, -n, -n); }, (d, me, _c, ev) => threat(d, me, ev)), { req: [{ f: OPP_FU }] }),
  'Reverse Trap': spell(run(({ d }) => d.addTemp({ until: d.turn, tag: 'reverse' }), -1)),
  'Mask of Restrict': passive({ lock: { tribute: () => true } }, { ai: -1 }),
  'Windstorm of Etaqua': spell(run(async ({ d, o }) => { for (const m of d.monsters(o)) if (m.faceUp) await d.changePos(m, 'swap'); }, (d, me, _c, ev) => threat(d, me, ev)), { req: [{ f: OPP_FU }] }),
  'The Regulation of Tribe': passive({
    lock: { attack: (d, src, a) => !!src && !!src.data.race && d.raceOf(a) === src.data.race },
    effects: [trig('standby', run(async ({ d, p, card }) => {
      const c = await pick(d, p, 'The Regulation of Tribe: Tribute a monster to keep this card (or cancel to destroy it)', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost', true);
      if (c) { d.log(`${d.name(p)} tributes ${c.def.name}.`); await d.move(c, 'gy', { why: 'tribute' }); }
      else await d.destroy(card, 'effect');
    }), { cond: (d, c) => d.onField(c) })],
  }, {
    ops: [run(async ({ d, p, card }) => {
      card.data.race = RACES[await d.option(p, 'The Regulation of Tribe: declare a Type', RACES, mostCommon(RACES, d.monsters(opp(p)), (c) => d.raceOf(c)))];
      d.log(`${d.name(p)} declares ${card.data.race}.`);
    }, -1)],
  }),
  'Destiny Board': passive({
    winCheck: (d, c) => d.onField(c) && c.faceUp && LETTERS.every((n) => d.spellTraps(c.ctrl).some((x) => x.faceUp && x.def.name === n && x.data.board === c.uid)),
    effects: [
      trig('endPhase', run(async ({ d, p, card }) => {
        const next = LETTERS.find((n) => !d.spellTraps(p).some((x) => x.faceUp && x.def.name === n && x.data.board === card.uid));
        if (!next || d.freeSlot(p, 's') < 0) return;
        const c = d.find({ side: 'self', zone: ['hand', 'deck'], name: next }, p)[0];
        if (!c) return;
        const from = c.zone;
        d.placeST(c, p, true);
        c.data.board = card.uid;
        d.log(`${next} is placed on the field.`);
        await d.emit({ t: 'move', card: c, from, to: 'szone' });
        if (from === 'deck') await d.shuffleDeck(p);
      }), { cond: (d, c, p) => d.tp !== p && d.onField(c) }),
      trig('leftField', run(async ({ d, card }) => {
        for (const x of d.spellTraps(card.owner).filter((x) => x.data.board === card.uid)) await d.move(x, 'gy', { why: 'rule' });
      })),
    ],
  }, { ai: 500 }),
  'Major Riot': spell(run(async ({ d }) => {
    const n = [0, 0];
    for (const s of [0, 1] as Side[]) for (const m of [...d.monsters(s)]) { if (!m.token) n[m.owner]++; await d.move(m, 'hand'); }
    for (const s of [d.tp, opp(d.tp)]) {
      if (!n[s]) continue;
      const cands = d.players[s].hand.filter((c) => c.def.kind === 'monster' && !c.def.noNormal && (c.def.mtype === 'normal' || c.def.mtype === 'effect'));
      const cs = await d.select(s, `Major Riot: Special Summon up to ${n[s]} monsters in face-down Defense Position`, cands, 0, Math.min(n[s], 5), 'good');
      for (const c of cs) await d.specialSummon(c, s, 'def', 'special', true);
    }
  }, 100), { when: (_d, ev, p) => ev.e === 'bounce' && ev.player === p }),
  'Solemn Wishes': passive({ effects: [trig('anyDraw', { op: 'heal', who: 'self', n: 500 }, { cond: (_d, _c, p, ev) => ev?.e === 'draw' && ev.player === p })] }),
  'Destruction Punch': spell(run(({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'attack') return;
    const a = ev.attacker, mv = a.mv;
    (ev.after ??= []).push(async () => { if (a.mv === mv && a.zone === 'mzone') await d.destroy(a, 'effect', undefined, link.p); });
  }, (d, me, _c, ev) => (ev.e === 'attack' ? d.atk(ev.attacker) + 200 : -1)), {
    when: (d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.ctrl === p && ev.target.pos === 'def' && d.atk(ev.attacker) < (ev.target.faceUp ? d.defv(ev.target) : ev.target.def.def ?? 0),
  }),
  'Armored Glass': spell(run(({ d }) => d.addTemp({ until: d.turn, negate: (_d, c) => c.def.stype === 'equip' || !!c.eq }), (d, me, _c, ev) => (ev.e === 'equip' && ev.target.ctrl !== me ? 400 : -1)), { when: (_d, ev) => ev.e === 'equip' }),
  'Gamble': spell(run(async ({ d, p }) => {
    if ((await d.call(p))) { const n = 5 - d.players[p].hand.length; if (n > 0) await d.draw(p, Math.min(n, d.players[p].deck.length)); }
    else { d.flag('skipTurn', p); d.log(`${d.name(p)} will skip their next turn.`); }
  }, 300), { cond: (d, _c, p) => d.players[opp(p)].hand.length >= 6 && d.players[p].hand.length <= 2 }),
  'Forced Requisition': passive({
    effects: [trig('anyDiscard', run(async ({ d, p, o, link }) => {
      const ev = link.ev;
      if (ev.e !== 'discard') return;
      const n = Math.min(ev.cards.length, d.players[o].hand.length);
      const cs = await d.select(o, `Forced Requisition: discard ${n} card${n > 1 ? 's' : ''}`, d.players[o].hand, n, n, 'cost');
      await d.discard(o, cs, p);
    }), { cond: (d, _c, p, ev) => ev?.e === 'discard' && ev.player === p && d.players[opp(p)].hand.length > 0 })],
  }, { when: (_d, ev, p) => ev.e === 'discard' && ev.player === p }),
  'Metal Detector': spell(run(({ d }) => d.addTemp({ until: d.turn, negate: (_d, c) => c.def.kind === 'trap' && c.def.stype === 'continuous' }), 400), {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'trap' && ev.link.card.def.stype === 'continuous',
  }),
  'Mirror Wall': passive({
    upkeep: 2000,
    effects: [trig('anyAttack', run(({ d, link }) => {
      const a = link.trig?.other;
      if (a && a.zone === 'mzone' && a.faceUp) { const half = Math.floor(d.atk(a) / 2); d.addMod(a, -half, 0, d.turn, 'attack'); d.log(`${a.def.name}'s ATK is halved for this attack.`); }
    }), { cond: (_d, _c, p, ev) => ev?.e === 'attack' && ev.player !== p })],
  }, { ai: (d, me) => (Math.max(0, ...d.monsters(opp(me)).map((c) => d.atk(c))) > 1500 ? 800 : -1) }),
  'Kunai with Chain': spell(run(async ({ d, p, o, link }) => {
    const atkM = d.monsters(o).filter((m) => m.faceUp && m.pos === 'atk');
    const mine = d.monsters(p).filter((m) => m.faceUp);
    const labels = [...(atkM.length ? ["Change an opponent's monster to Defense Position"] : []), ...(mine.length ? ['One of your monsters gains 500 ATK'] : [])];
    if (!labels.length) return;
    const i = await d.option(p, 'Kunai with Chain', labels, 0);
    if (labels[i].startsWith('Change')) {
      const ev = link.ev;
      const m = ev.e === 'attack' && atkM.includes(ev.attacker) ? ev.attacker : await pick(d, p, 'Kunai with Chain: change to Defense Position', atkM, 'bad');
      if (m) await d.changePos(m, 'def');
    } else {
      const m = await pick(d, p, 'Kunai with Chain: choose a monster to gain 500 ATK', mine, 'good');
      if (m) d.addMod(m, 500, 0);
    }
  }, (d, me, _c, ev) => threat(d, me, ev)), { cond: (d, _c, p) => d.monsters(opp(p)).some((m) => m.faceUp && m.pos === 'atk') || d.monsters(p).some((m) => m.faceUp) }),
  'Gryphon Wing': spell([{ op: 'negate', effectOnly: true }, destroyAll({ side: 'opp', st: true, zone: ['szone', 'fzone'] })], { when: oppActivates("Harpie's Feather Duster"), ai: 2000 }),
  'Crush Card': spell(run(async ({ d, p, o }) => {
    const kill = (c: Card) => c.def.kind === 'monster' && (c.zone === 'mzone' && c.faceUp ? d.atk(c) : c.def.atk ?? 0) >= 1500;
    for (const c of d.monsters(o).filter(kill)) await d.destroy(c, 'effect', undefined, p);
    await d.reveal(p, d.players[o].hand, "Your opponent's hand");
    for (const c of d.players[o].hand.filter(kill)) { d.log(`${c.def.name} is destroyed by Crush Card.`); await d.move(c, 'gy'); }
    d.addTemp({ until: d.turn + 6, draw: async (dd, s, cards) => {
      if (s !== o) return;
      await dd.reveal(p, cards, 'Cards drawn by your opponent');
      for (const c of cards.filter(kill)) { dd.log(`${c.def.name} is destroyed by Crush Card.`); await dd.move(c, 'gy'); }
    } });
  }, (d, me) => scoreWipe(d, me, (c) => c.ctrl !== me && d.atk(c) >= 1500) + 600), { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, attr: 'DARK', maxAtk: 1000 } } }] }),
  'Shift': spell(run(async ({ d, p, link }) => {
    const ev = link.ev;
    const mine = (c: Card) => c.zone === 'mzone' && c.ctrl === p;
    if (ev.e === 'attack' && ev.target && mine(ev.target)) {
      const old = ev.target;
      const c = await pick(d, p, 'Shift: choose the new attack target', d.monsters(p).filter((m) => m !== old), 'cost');
      if (c) { ev.target = c; d.log(`The attack target becomes ${c.faceUp ? c.def.name : 'a face-down monster'}.`); }
      return;
    }
    const l = linkOf(ev);
    if (!l) return;
    for (let i = 0; i < l.targets.length; i++) {
      if (l.targets[i].length !== 1 || !mine(l.targets[i][0])) continue;
      const old = l.targets[i][0];
      const f = l.eff.targets?.[i]?.f;
      const c = await pick(d, p, 'Shift: choose the new target', d.monsters(p).filter((m) => m !== old && (!f || d.match(m, f, l.p, l.card))), 'cost');
      if (c) { l.targets[i] = [c]; l.tmv[i] = [c.mv]; d.log(`The target becomes ${c.faceUp ? c.def.name : 'a face-down monster'}.`); }
    }
  }, 0), {
    when: (d, ev, p) => d.monsters(p).length > 1 && ((isAttackOn(ev, p) && !!ev.target && ev.target.ctrl === p)
      || (ev.e === 'chain' && ev.link.p !== p && ev.link.targets.some((ts) => ts.length === 1 && ts[0].zone === 'mzone' && ts[0].ctrl === p))),
  }),
  "Robbin' Goblin": passive({
    effects: [trig('anyBattleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }), {
      cond: (_d, _c, p, ev) => ev?.e === 'damage' && ev.player !== p && ev.src?.ctrl === p,
    })],
  }),
  'Royal Decree': passive({ negateFn: (_d, src, c) => c.def.kind === 'trap' && c !== src }),
  'Royal Command': passive({ negateFn: (_d, _s, c) => !!c.def.effects?.some((e) => e.type === 'flip') }),
  'Imperial Order': passive({ upkeep: 700, negateFn: (_d, _s, c) => c.def.kind === 'spell' }),
  'Eatgaboon': { effects: [act({ on: ['oppNormalFlip'], onF: { maxAtk: 500, faceUp: true }, ops: [{ op: 'destroy', s: { t: 'event' } }] })] },
  'House of Adhesive Tape': { effects: [act({ on: ['oppNormalFlip'], onF: { maxDef: 500, faceUp: true }, ops: [{ op: 'destroy', s: { t: 'event' } }] })] },
  'Gift of The Mystical Elf': spell(run(({ d, p }) => d.heal(p, 300 * all(d).length), (d) => 300 * all(d).length * 0.3)),
  'Light of Intervention': passive({ lock: { faceUpSet: true } }, { ai: (d, me) => (d.monsters(opp(me)).some((c) => !c.faceUp) ? 200 : 50) }),
  'Mystical Refpanel': spell(run(({ d, link }) => {
    const l = linkOf(link.ev);
    if (l) { l.p = opp(l.p); d.log('The Spell Card\'s effect is transferred to the other player.'); }
  }, 600), { when: (_d, ev, p) => { const l = oppLink(ev, p); return !!l && l.isCard && l.card.def.kind === 'spell' && onePlayerSpell(l); } }),
  'World Suppression': spell(run(({ d, link }) => {
    const l = linkOf(link.ev);
    if (l) { const c = l.card; d.addTemp({ until: d.turn, negate: (_d, x) => x === c }); d.log(`${c.def.name} is negated this turn.`); }
  }, 300), { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.stype === 'field' }),
  'Ceasefire': spell(run(async ({ d, o, card }) => {
    for (const m of all(d)) if (!m.faceUp) await d.changePos(m, 'reveal', false);
    await d.damage(o, 500 * all(d).filter((m) => m.def.mtype === 'effect').length, card);
  }, (d) => 500 * all(d).filter((m) => m.def.mtype === 'effect').length * 0.6)),
  'Jam Defender': passive({
    effects: [trig('anyAttack', run(async ({ d, p, link }) => {
      const ev = link.ev;
      if (ev.e !== 'attack') return;
      const jam = d.monsters(p).find((m) => m.faceUp && m.def.name === 'Revival Jam');
      if (jam && ev.target !== jam && (await yes(d, p, 'Jam Defender: change the attack target to Revival Jam?'))) { ev.target = jam; d.log('The attack is redirected to Revival Jam.'); }
    }), { cond: (d, _c, p, ev) => ev?.e === 'attack' && ev.player !== p && !!ev.target && d.monsters(p).some((m) => m.faceUp && m.def.name === 'Revival Jam' && m !== ev.target) })],
  }),
  'Fake Trap': spell(run(({ d, p, link }) => {
    const l = linkOf(link.ev);
    if (!l) return;
    l.data.spare = d.spellTraps(p).filter((c) => c.def.kind === 'trap' && c !== link.card).map((c) => c.uid);
    d.log('Fake Trap takes the hit for your Trap Cards.');
  }, 700), { when: (d, ev, p) => { const l = oppLink(ev, p); return !!l && destroysTraps(d, l, p); } }),
  'Graverobber': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'gy') return;
    await giveToHand(d, c, p);
    c.mark.actDmg = 2000;
    d.log(`${d.name(p)} takes ${c.def.name} from the opponent's Graveyard.`);
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (c.zone === 'hand' && c.mark.origOwner !== undefined) { delete c.mark.actDmg; await d.move(c, 'gy'); } } });
  }, (d, me) => (d.players[me].lp > 3000 ? 400 : -1)), { targets: [{ f: { side: 'opp', zone: 'gy', kind: 'spell' }, good: true }] }),
  "Graverobber's Retribution": passive({
    effects: [trig('standby', run(({ d, o, card }) => d.damage(o, 100 * d.players[o].banished.filter((c) => c.def.kind === 'monster').length, card)), { cond: (d, c) => d.onField(c) })],
  }),
  'Numinous Healer': spell(run(({ d, p }) => d.heal(p, 1000 + 500 * d.players[p].gy.filter((c) => c.def.name === 'Numinous Healer').length), 500), { when: (_d, ev, p) => ev.e === 'damage' && ev.player === p }),
  'Attack and Receive': spell(run(({ d, p, o, card }) => d.damage(o, 700 + 300 * d.players[p].gy.filter((c) => c.def.name === 'Attack and Receive').length, card), 600), {
    when: (_d, ev, p) => ev.e === 'damage' && ev.player === p,
  }),
  'Two-Pronged Attack': spell(run(async (x) => { for (const c of [...T(x, 0), ...T(x, 1)]) await x.d.destroy(c, 'effect', undefined, x.p); }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => (c.def.atk ?? 0) - 1500))), {
    targets: [{ f: OWN_M, n: 2 }, { f: OPP_M }],
  }),
  "The Emperor's Holiday": passive({ negateFn: (_d, _s, c) => c.def.stype === 'equip' || !!c.eq }),
  'Michizure': spell(destroyT, { targets: [{ f: M }], when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.card.def.kind === 'monster' && ev.from === 'mzone' }),
  'Anti Raigeki': spell([{ op: 'negate', effectOnly: true }, destroyAll(OPP_M)], { when: oppActivates('Raigeki'), ai: 3000 }),
  'White Hole': spell(run(({ d, p, link }) => { const l = linkOf(link.ev); if (l) l.data.spare = d.monsters(p).map((c) => c.uid); }, 2000), { when: oppActivates('Dark Hole') }),
  'Call of the Grave': spell({ op: 'negate', effectOnly: true }, { when: oppActivates('Monster Reborn'), ai: 1500 }),
  'Call of the Dark': passive({
    lock: { activate: (_d, _s, _p, c) => c.def.name === 'Monster Reborn' },
    onSummon: async (d, _src, c) => { if (c.data.ssBy === 'Monster Reborn') await d.move(c, 'gy'); },
  }, { ops: [run(async ({ d }) => { for (const m of all(d)) if (m.data.ssBy === 'Monster Reborn') await d.move(m, 'gy'); }, 100)] }),
  'Magic Drain': spell(run(async ({ d, p, o, link }) => {
    const sp = d.players[o].hand.filter((c) => c.def.kind === 'spell');
    if (sp.length && (await d.confirm(o, 'Magic Drain: discard a Spell Card to keep your Spell activation?'))) {
      const c = await pick(d, o, 'Discard a Spell Card', sp, 'cost');
      if (c) { await d.discard(o, [c], p); return; }
    }
    await d.runOp({ op: 'negate' }, link, false);
  }, 500), { when: (_d, ev, p) => { const l = oppLink(ev, p); return !!l && l.isCard && l.card.def.kind === 'spell'; } }),
  'Magical Hats': spell(run(async ({ d, p }) => {
    const mon = await pick(d, p, 'Magical Hats: choose one of your monsters', d.monsters(p), 'good');
    const st = d.players[p].deck.filter((c) => c.def.kind !== 'monster');
    if (!mon || st.length < 2 || d.freeCount(p, 'm') < 2) return;
    const two = await d.select(p, 'Magical Hats: choose 2 non-Monster Cards from your Deck', st, 2, 2, 'cost', undefined, undefined, true);
    if (mon.faceUp) await d.setFaceDown(mon);
    mon.pos = 'def';
    for (const c of two) if (d.placeMonster(c, p, false, 'def')) c.data.hat = true;
    await d.shuffleDeck(p);
    const cards = [mon, ...two].filter((c) => c.zone === 'mzone');
    const slots = cards.map((c) => c.slot);
    for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(d.rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
    for (const c of cards) d.players[p].m[c.slot] = null;
    cards.forEach((c, i) => { d.players[p].m[slots[i]] = c; c.slot = slots[i]; });
    await d.emit({ t: 'move', card: mon, from: 'mzone', to: 'mzone' });
    d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { for (const c of two) if (c.zone === 'mzone' && c.data.hat) await d.move(c, 'gy', { why: 'rule' }); } });
  }, (d, me, _c, ev) => threat(d, me, ev)), { when: (d, ev, p) => d.phase === 'BP' && d.tp !== p && ev.e === 'attack', cond: (d, _c, p) => d.monsters(p).length > 0 && d.freeCount(p, 'm') >= 2 }),
  'Magic-Arm Shield': spell(run(({ d, link, t }) => {
    const ev = link.ev;
    if (ev.e === 'attack' && t[0] && t[0].zone === 'mzone') { ev.target = t[0]; d.log(`${t[0].def.name} becomes the attack target.`); }
  }, (d, me, _c, ev) => threat(d, me, ev)), { when: (_d, ev, p) => isAttackOn(ev, p), targets: [{ f: { ...OPP_FU, fn: (d, c) => c !== d.curAttack?.attacker } }] }),
  'Lightforce Sword': spell(run(async ({ d, o }) => {
    const c = randomOf(d, d.players[o].hand);
    if (!c) return;
    await d.move(c, 'banished');
    c.faceUp = false;
    c.mark.lightforce = true;
    d.log("A random card from your opponent's hand is removed from play face-down.");
    const first = d.tp === o ? d.turn + 2 : d.turn + 1;
    d.schedule({ at: 'SP', turn: first + 6, fn: async () => { if (c.zone === 'banished' && c.mark.lightforce) { delete c.mark.lightforce; await d.toHand(c); } } });
  }, 500), { cond: (d, _c, p) => d.players[opp(p)].hand.length > 0 }),
  'Widespread Ruin': spell(run(async ({ d, p, o }) => {
    const atkM = d.monsters(o).filter((m) => m.faceUp && m.pos === 'atk');
    if (!atkM.length) return;
    const top = Math.max(...atkM.map((m) => d.atk(m)));
    const c = await pick(d, p, 'Widespread Ruin: destroy the highest-ATK Attack Position monster', atkM.filter((m) => d.atk(m) === top), 'bad');
    if (c) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).filter((m) => m.faceUp && m.pos === 'atk').map((m) => d.atk(m)))), { on: ['oppAttack'] }),
  'Mask of Weakness': spell(run(({ d, link }) => { const ev = link.ev; if (ev.e === 'attack' && ev.attacker.zone === 'mzone') d.addMod(ev.attacker, -700, 0); }, (d, me, _c, ev) => {
    if (ev.e !== 'attack' || !ev.target || !ev.target.faceUp) return -1;
    const a = d.atk(ev.attacker) - 700, mine = ev.target.pos === 'atk' ? d.atk(ev.target) : d.defv(ev.target);
    return a <= mine ? threat(d, me, ev) + 300 : -1;
  }), { on: ['oppAttack'] }),
  'Castle Walls': spell({ op: 'stat', s: { t: 'target' }, def: 500 }, { targets: [{ f: FU, good: true }], ai: (d, me, _c, ev) => (ev.e === 'attack' && ev.target?.pos === 'def' && ev.target.ctrl === me ? threat(d, me, ev) : -1) }),
  'Deal of Phantom': spell(run(({ d, p, t }) => { if (t[0]) d.addMod(t[0], 100 * d.players[p].gy.filter((c) => c.def.kind === 'monster').length, 0); }, (d, me, _c, ev) => threat(d, me, ev)), { targets: [{ f: FU, good: true }] }),
  'Enchanted Javelin': spell(run(({ d, p, link }) => { const ev = link.ev; if (ev.e === 'attack') return d.heal(p, d.atk(ev.attacker)); }, (d, _me, _c, ev) => (ev.e === 'attack' ? d.atk(ev.attacker) * 0.4 : -1)), { on: ['oppAttack'] }),
  'Backup Soldier': spell({ op: 'toHand', s: { t: 'choose', f: { side: 'self', zone: 'gy', kind: 'monster', mtype: ['normal'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }, n: 3, upTo: true } }, {
    req: [{ f: GY_M('self'), n: 5 }, { f: { side: 'self', zone: 'gy', kind: 'monster', mtype: ['normal'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 } }], ai: 700,
  }),
  'Skull Invitation': passive({
    effects: [trig('anyToGY', run(({ d, card, link }) => { const c = link.trig?.other; if (c) return d.damage(c.owner, 300, card); }), { cond: (d, c) => d.onField(c) })],
  }, { ai: (d, me) => (d.players[me].lp > d.players[opp(me)].lp ? 300 : -1) }),
  'Skull Lair': passive({
    effects: [{
      type: 'quick', label: 'Banish cards: destroy a monster of that Level',
      targets: [{ f: { ...FU, fn: (d, c, p) => (c.def.lv ?? 0) > 0 && (c.def.lv ?? 0) <= d.players[p].gy.filter((x) => !d.banishLocked(p, x)).length } }],
      cost: [run(async ({ d, p, t }) => {
        const n = t[0]?.def.lv ?? 0;
        const cs = await d.select(p, `Skull Lair: banish ${n} card${n > 1 ? 's' : ''} from your Graveyard`, d.players[p].gy.filter((c) => !d.banishLocked(p, c)), n, n, 'cost');
        for (const c of cs) await d.banish(c, p);
      })],
      ops: [run(async ({ d, p, t }) => { const m = t[0]; if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, p); }, 500)],
    }],
  }),
  'Shadow Spell': passive({
    selfDestructIf: linkGone,
    auraFn: (_d, src, t) => (t.uid === src.data.tgt ? { atk: -700 } : undefined),
    lock: { pos: (_d, src, c) => !!src && c.uid === src.data.tgt },
  }, { targets: [{ f: OPP_FU }], ops: [linkTarget] }),
  'Spellbinding Circle': passive({
    selfDestructIf: (d, c) => linkGone(d, c) && d.byUid(c.data.tgt)?.mark.lastWhy !== 'tribute',
    lock: { attack: (_d, src, a) => !!src && a.uid === src.data.tgt, pos: (_d, src, c) => !!src && c.uid === src.data.tgt },
  }, { targets: [{ f: OPP_M }], ops: [linkTarget] }),
  "Fairy's Hand Mirror": spell(run(async ({ d, p, link }) => {
    const l = linkOf(link.ev);
    if (!l) return;
    const i = l.targets.findIndex((ts) => ts.length === 1 && ts[0].zone === 'mzone');
    if (i < 0) return;
    const old = l.targets[i][0];
    const f = l.eff.targets?.[i]?.f;
    const c = await pick(d, p, "Fairy's Hand Mirror: choose the new target", all(d).filter((m) => m !== old && (!f || d.match(m, f, l.p, l.card)) && d.targetable(m, l.card)), 'bad');
    if (c) { l.targets[i] = [c]; l.tmv[i] = [c.mv]; d.log(`The Spell Card now targets ${c.faceUp ? c.def.name : 'a face-down monster'}.`); }
  }, 300), { when: (_d, ev, p) => { const l = oppLink(ev, p); return !!l && l.isCard && l.card.def.kind === 'spell' && l.targets.some((ts) => ts.length === 1 && ts[0].zone === 'mzone'); } }),
  'Riryoku Field': spell({ op: 'negate' }, {
    when: (_d, ev, p) => { const l = oppLink(ev, p); const ts = l?.targets.flat() ?? []; return !!l && l.isCard && l.card.def.kind === 'spell' && ts.length === 1 && ts[0].zone === 'mzone'; },
    ai: 800,
  }),
  'Horn of Heaven': { effects: [act({ on: ['summoning'], cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }], ops: [{ op: 'negate' }] })] },
  'Time Machine': spell(run(async ({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'sent' || ev.card.zone !== 'gy' || !d.revivable(ev.card)) return;
    await d.specialSummon(ev.card, ev.ctrl, ev.card.mark.lastPos ?? 'atk', 'special');
  }, (d, me, _c, ev) => (ev.e === 'sent' && ev.ctrl === me ? (ev.card.def.atk ?? 0) : -1)), { when: (_d, ev) => ev.e === 'sent' && ev.why === 'battle' && ev.card.def.kind === 'monster' }),
  'Time Seal': spell(run(({ d, o }) => d.flag('skipDraw', o), 500)),
  'Snake Fang': spell({ op: 'stat', s: { t: 'target' }, def: -500 }, { targets: [{ f: FU }] }),
  'Gust': spell(destroyT, { targets: [{ f: ST }], when: sentBy('spell') }),
  'Driving Snow': spell(destroyT, { targets: [{ f: ST }], when: sentBy('trap') }),
  'Dragon Capture Jar': passive({
    lock: { pos: (d, _s, c) => d.raceOf(c) === 'Dragon' },
    onSummon: async (d, _src, c) => { if (c.faceUp && d.raceOf(c) === 'Dragon' && c.pos === 'atk') await d.changePos(c, 'def'); },
  }, { ops: [run(async ({ d }) => { for (const m of all(d)) if (m.faceUp && d.raceOf(m) === 'Dragon' && m.pos === 'atk') await d.changePos(m, 'def'); }, (d, me) => 400 * countFU(d, (c) => d.raceOf(c) === 'Dragon', opp(me)) - 400 * countFU(d, (c) => d.raceOf(c) === 'Dragon', me))] }),
  'Tornado Wall': passive({
    lock: { noDamage: (d, src, s) => !!src && s === src.ctrl && umi(d) },
    selfDestructIf: (d) => !umi(d),
  }, { cond: (d) => umi(d), ai: 600 }),
  'Minor Goblin Official': passive({
    effects: [trig('oppStandby', run(({ d, o, card }) => d.damage(o, 500, card)), { cond: (d, c) => d.onField(c) })],
  }, { cond: (d, _c, p) => d.players[opp(p)].lp <= 3000, ai: 800 }),
  'DNA Surgery': passive({ raceFn: (_d, src) => src.data.race }, {
    ops: [run(async ({ d, p, card }) => {
      card.data.race = RACES[await d.option(p, 'DNA Surgery: declare a Type', RACES, mostCommon(RACES, d.monsters(p), (c) => c.def.race))];
      d.log(`All face-up monsters become ${card.data.race}-Type.`);
    }, -1)],
  }),
  'Respect Play': passive({ reveals: (d, _src, s) => d.tp === s }),
  'The Eye of Truth': passive({
    reveals: (_d, src, s) => s !== src.ctrl,
    effects: [trig('oppStandby', run(({ d, o }) => d.heal(o, 1000)), { cond: (d, c, p) => d.onField(c) && d.players[opp(p)].hand.some((x) => x.def.kind === 'spell') })],
  }),
  'Ultimate Offering': passive({ lock: { extraSummon: (_d, src, p) => (src && p === src.ctrl ? 5 : 0) } }, { ai: (d, me) => (d.players[me].hand.filter((c) => c.def.kind === 'monster').length > 1 ? 400 : -1) }),
  'Infinite Dismissal': passive({
    onSummon: (d, src, c, how) => {
      if ((how !== 'normal' && how !== 'flip') || (c.def.lv ?? 0) > 3) return;
      const mv = c.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (c.mv === mv && c.zone === 'mzone') await d.destroy(c, 'effect', undefined, src.ctrl); } });
    },
  }),
  'Goblin Fan': passive({ onSummon: async (d, src, c, how) => { if (how === 'flip' && (c.def.lv ?? 0) <= 2) await d.destroy(c, 'effect', undefined, src.ctrl); } }),
  'Fairy Box': passive({
    upkeep: 500,
    effects: [trig('anyAttack', run(async ({ d, p, link }) => {
      const a = link.trig?.other;
      if (a && a.zone === 'mzone' && a.faceUp && (await d.call(p))) { d.addMod(a, -d.atk(a), 0, d.turn, 'bp'); d.log(`${a.def.name}'s ATK becomes 0 during this Battle Phase.`); }
    }), { cond: (_d, _c, p, ev) => ev?.e === 'attack' && ev.player !== p })],
  }),
  'Blind Destruction': passive({
    effects: [trig('standby', run(async ({ d, p }) => {
      const n = (await d.die());
      for (const m of all(d)) { const lv = m.def.lv ?? 0; if (n === 6 ? m.faceUp && lv >= 6 : lv === n) await d.destroy(m, 'effect', undefined, p); }
    }), { cond: (d, c) => d.onField(c) })],
  }),
  'Type Zero Magic Crusher': passive({
    effects: [trig('anyDiscard', run(({ d, o, card, link }) => { const ev = link.ev; if (ev.e === 'discard') return d.damage(o, 500 * ev.cards.filter((c) => c.def.kind === 'spell').length, card); }), {
      cond: (_d, _c, p, ev) => ev?.e === 'discard' && ev.player === p && ev.cards.some((x) => x.def.kind === 'spell'),
    })],
  }),
  'Magic Thorn': passive({
    effects: [trig('anyDiscard', run(({ d, o, card, link }) => { const ev = link.ev; if (ev.e === 'discard') return d.damage(o, 500 * ev.cards.length, card); }), {
      cond: (_d, _c, p, ev) => ev?.e === 'discard' && ev.player !== p && ev.by !== null,
    })],
  }),
  'Appropriate': passive({
    effects: [trig('anyDraw', { op: 'draw', who: 'self', n: 2 }, { cond: (_d, _c, p, ev) => ev?.e === 'draw' && ev.player !== p && !ev.dp })],
  }, { when: (_d, ev, p) => ev.e === 'draw' && ev.player !== p && !ev.dp }),
  'Call Of The Haunted': passive({ selfDestructIf: linkGone }, {
    targets: [{ f: { ...GY_M('self'), fn: (d, c) => d.revivable(c) }, good: true }],
    cond: (d, _c, p) => d.canSpecial(p),
    ops: [run(async ({ d, p, card, t, link }) => {
      const m = t[0];
      if (!d.onField(card) || !card.faceUp || card.mv !== link.mvAtAct || !m || m.zone !== 'gy') return;
      if (await d.specialSummon(m, p, 'atk', 'special', false, card)) {
        if (!d.onField(card) || !card.faceUp || card.mv !== link.mvAtAct) {
          if (d.monsters(m.ctrl).includes(m)) await d.destroy(m, 'effect');
          return;
        }
        card.boundTo = m.uid;
        card.data.tgt = m.uid;
        card.data.tgtMv = m.mv;
      }
    }, (d, me) => bestRevive(d, me))],
  }),
  'Acid Trap Hole': spell(run(async ({ d, p, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone' || m.faceUp) return;
    await d.changePos(m, 'reveal', false);
    d.log(`The face-down monster is ${m.def.name}.`);
    if (d.defv(m) <= 2000) await d.destroy(m, 'effect', undefined, p);
    else await d.setFaceDown(m);
  }, 600), { targets: [{ f: { ...M, faceUp: false, pos: 'def' } }] }),
  'Ring of Destruction': spell(run(async ({ d, p, o, t, card }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone' || !m.faceUp) return;
    const a = d.atk(m);
    if (await d.destroy(m, 'effect', undefined, p)) { await d.damage(p, a, card); await d.damage(o, a, card); }
  }, (d, me) => (d.players[opp(me)].lp <= Math.max(0, ...d.monsters(opp(me)).filter((c) => c.faceUp).map((c) => d.atk(c))) && d.players[me].lp > d.players[opp(me)].lp ? 9000 : 300)), {
    targets: [{ f: FU }],
  }),
  "Solomon's Lawbook": spell(run(({ d, p }) => d.flag('skipSP', p), -1)),
  'Dark Spirit of the Silent': spell(run(async ({ d, link, t }) => {
    const ev = link.ev;
    const n = t[0];
    if (ev.e !== 'attack' || !n || n.zone !== 'mzone') return;
    d.log(`${ev.attacker.def.name}'s attack is negated; ${n.def.name} attacks instead.`);
    if (n.pos === 'def') await d.changePos(n, 'atk');
    ev.attacker = n;
  }, (d, me, _c, ev) => threat(d, me, ev)), { on: ['oppAttack'], targets: [{ f: { ...OPP_FU, fn: (d, c) => c !== d.curAttack?.attacker } }] }),
  'Earthshaker': spell(run(async ({ d, p, o }) => {
    const theirs = d.monsters(o).filter((m) => m.faceUp), mine = d.monsters(p).filter((m) => m.faceUp);
    const score = (a: string) => theirs.filter((m) => d.attrOf(m) === a).length - mine.filter((m) => d.attrOf(m) === a).length;
    const best = [...ATTRS].sort((a, b) => score(b) - score(a));
    const a = ATTRS[await d.option(p, 'Earthshaker: choose the first Attribute', ATTRS, ATTRS.indexOf(best[0]))];
    const rest = ATTRS.filter((x) => x !== a);
    const b = rest[await d.option(p, 'Earthshaker: choose the second Attribute', rest, rest.indexOf(best.find((x) => x !== a)!))];
    const two = [a, b];
    const lose = (x: string) => theirs.filter((m) => d.attrOf(m) === x).length;
    const chosen = two[await d.option(o, 'Earthshaker: choose the Attribute to destroy', two, lose(a) <= lose(b) ? 0 : 1)];
    d.log(`${d.name(o)} chooses ${chosen}.`);
    for (const m of all(d)) if (m.faceUp && d.attrOf(m) === chosen) await d.destroy(m, 'effect', undefined, p);
  }, 300), { req: [{ f: FU }] }),
  'Collected Power': spell(run(async ({ d, p, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone') return;
    const eqs = [0, 1].flatMap((s) => d.players[s].s).filter((e): e is Card => !!e && e.faceUp && e.equipTo !== undefined && e.equipTo !== m.uid);
    for (const e of eqs) {
      const f = d.eqSpec(e)?.f;
      if (!f || d.match(m, f, e.ctrl, e)) { e.equipTo = m.uid; d.log(`${e.def.name} is moved to ${m.def.name}.`); }
      else await d.destroy(e, 'effect', undefined, p);
    }
    await d.emit({ t: 'stat', card: m });
  }, 200), { targets: [{ f: FU, good: true }] }),
  'Shadow of Eyes': spell(run(async ({ d, link }) => {
    const ev = link.ev;
    if (ev.e === 'set' && ev.card.zone === 'mzone' && !ev.card.faceUp) await d.changePos(ev.card, 'atk', false);
  }, 400), { when: (_d, ev, p) => ev.e === 'set' && ev.player !== p }),
  'Chain Destruction': spell(run(async ({ d, link }) => {
    const ev = link.ev;
    if (ev.e !== 'summon') return;
    const name = ev.cards[0].def.name, s = ev.player;
    for (const x of [...d.players[s].hand, ...d.players[s].deck].filter((x) => x.def.name === name)) { d.log(`${x.def.name} is destroyed.`); await d.move(x, 'gy'); }
    await d.shuffleDeck(s);
  }, (_d, me, _c, ev) => (ev.e === 'summon' && ev.player !== me ? 300 : -1)), { when: (d, ev) => ev.e === 'summon' && ev.cards.some((c) => c.faceUp && c.zone === 'mzone' && d.atk(c) <= 2000) }),
  'Dust Tornado': spell([destroyT, run(async ({ d, p }) => {
    const c = await pick(d, p, 'Dust Tornado: Set a Spell or Trap Card from your hand?', d.players[p].hand.filter((x) => x.def.kind !== 'monster' && x.def.stype !== 'field'), 'good', true);
    if (c && d.freeSlot(p, 's') >= 0) await d.setST(c, p);
  })], { targets: [{ f: OPP_ST }] }),
  'Metalmorph': {
    equip: { f: FU, atk: 300, def: 300, fn: (d, _eq, t) => (d.battle?.att === t && d.battle.tgt ? { atk: Math.floor(d.atk(d.battle.tgt) / 2) } : undefined) },
    effects: [
      act({ targets: [{ f: FU, good: true }], ops: [{ op: 'equip' }] }),
      {
        type: 'ignition', from: ['szone'], label: 'Tribute the equipped monster: summon its Metal form',
        cond: (d, c, p) => {
          const t = d.equippedTo(c);
          const into = t?.def.name === 'Zoa' ? 'Metalzoa' : t?.def.name === 'Red-Eyes B. Dragon' ? 'Red-Eyes Black Metal Dragon' : '';
          return !!t && !!into && t.ctrl === p && d.tributeOk(t) && d.find({ side: 'self', zone: 'deck', name: into }, p).length > 0;
        },
        ops: [run(async ({ d, p, card }) => {
          const t = d.equippedTo(card);
          if (!t) return;
          const into = t.def.name === 'Zoa' ? 'Metalzoa' : 'Red-Eyes Black Metal Dragon';
          const c = d.find({ side: 'self', zone: 'deck', name: into }, p)[0];
          if (!c) return;
          d.log(`${d.name(p)} tributes ${t.def.name}.`);
          await d.move(t, 'gy', { why: 'tribute' });
          if (await d.specialSummon(c, p, await d.askPos(p, c))) c.properly = true;
          await d.shuffleDeck(p);
        }, 2000)],
      },
    ],
  },
  'Just Desserts': spell(run(({ d, o, card }) => d.damage(o, 500 * d.monsters(o).length, card), (d, me) => 300 * d.monsters(opp(me)).length), { req: [{ f: OPP_M }] }),
  'Mystic Probe': spell(run(({ d }) => d.addTemp({ until: d.turn, negate: (_d, c) => c.def.kind === 'spell' && c.def.stype === 'continuous' }), 400), {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'spell' && ev.link.card.def.stype === 'continuous',
  }),
  'Waboku': spell(run(({ d, p }) => d.addTemp({ until: d.turn, p, tag: 'noBattleDmg' }), (d, me, _c, ev) => (ev.e === 'attack' && ev.player !== me ? Math.min(threat(d, me, ev), d.atk(ev.attacker)) : -1))),
};
