// YGO Online Spells, part 2 (Cunning of the Six Samurai … Gryphon's Feather Duster).
import {
  type Card, type Def, type Duel, type Filter, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OPP_ST, OWN_FU, OWN_M, ST,
  act, addCtr, addFrom, atEndPhase, both, canFuse, castCopy, condSpell, ctr, declareName, destroyAll, destroyAtEnd, fuse,
  grantRule, has, hasSet, ign, killEquippedOnLeave, opp, passive, pick, pickSeen, quick, randomOf, ritual, run, scoreWipe,
  search, spell, ssFrom, ssPick, tokenDef, tokens, trig, union, inSet,
} from './olib';

const notTokenNormal = (c: Card) => c.def.kind === 'monster' && c.def.mtype === 'normal' && !c.token;
/** Gladiator Beast Equip Spells return to the hand when the equipped monster is returned to the Deck. */
const gbReturn = trig('fieldToGY', { op: 'toHand', s: { t: 'this' } }, {
  from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.zone === 'deck' && c.zone === 'gy'; },
});
const GB = { ...FU, set: 'Gladiator Beast' };
const destroyOneST = async (d: Duel, p: Side) => { const c = await pick(d, p, 'Destroy a Spell or Trap Card', d.find(ST, p), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); };
const ritualOf = (names: string[] | ((c: Card) => boolean), exact = true): Def => spell({ op: 'ritual', name: Array.isArray(names) ? (c) => names.includes(c.def.name) : names, exact }, { ai: 1500 });
const bothBanished = (d: Duel, s: Side) => d.players[s].banished.filter((c) => c.def.kind === 'monster' && d.revivable(c));
const secondStandby = (d: Duel, p: Side, fn: () => Promise<unknown> | unknown) => d.schedule({ at: 'SP', turn: d.turn + (d.tp === p ? 4 : 3), fn });

export const SPELLS_2: Record<string, Def> = {
  'Cunning of the Six Samurai': spell(ssFrom(['gy'], { set: 'Six Samurai' }, { side: 'any' }), {
    cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, set: 'Six Samurai' } } }],
    req: [{ f: { ...OWN_FU, set: 'Six Samurai' } }, { f: { side: 'any', zone: 'gy', set: 'Six Samurai' } }],
  }),
  'Cup of Ace': spell(run(async ({ d, p, o }) => { await d.draw((await d.tossCoins(1))[0] ? p : o, 2); }, 200)),
  'Cyberdark Impact!': spell(run(async ({ d, p, card }) => {
    for (const n of ['Cyberdark Horn', 'Cyberdark Edge', 'Cyberdark Keel']) {
      const c = await pick(d, p, `Return "${n}" to the Deck`, d.find({ side: 'self', zone: ['mzone', 'hand', 'gy'], name: n }, p), 'cost');
      if (c) await d.move(c, 'deck');
    }
    await d.shuffleDeck(p);
    const f = d.find({ side: 'self', zone: 'extra', name: 'Cyberdark Dragon' }, p)[0];
    if (f && d.canSpecial(p, f)) await d.specialSummon(f, p, await d.askPos(p, f), 'fusion', false, card);
  }, 2000), { req: [...['Cyberdark Horn', 'Cyberdark Edge', 'Cyberdark Keel'].map((n): { f: Filter } => ({ f: { side: 'self', zone: ['mzone', 'hand', 'gy'], name: n } })), { f: { side: 'self', zone: 'extra', name: 'Cyberdark Dragon' } }] }),
  'Cybernetic Zone': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    await d.banish(c, p);
    const mv = c.mv;
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => {
      if (c.mv !== mv || c.zone !== 'banished' || !d.canSpecial(p, c)) return;
      c.properly = true;
      if (!(await d.specialSummon(c, p, 'atk'))) return;
      d.addMod(c, c.def.atk ?? 0, 0, -1);
      const mv2 = c.mv;
      d.schedule({ at: 'SP', side: p, fn: async () => { if (c.mv === mv2 && c.zone === 'mzone') await d.destroy(c, 'effect', undefined, p); } });
    } });
  }, 100), { targets: [{ f: { ...OWN_FU, race: ['Machine'], mtype: ['fusion'] }, good: true }] }),
  'Cyclone Blade': {
    equip: { f: { ...FU, set: 'Destiny Hero' } },
    postBattle: async (d, self, _o, r) => { if (r.att === self) await destroyOneST(d, self.ctrl); },
  },
  'Cyclone Boomerang': {
    equip: { f: { ...FU, name: 'Elemental Hero Wildheart' }, atk: 500 },
    effects: [trig('fieldToGY', run(async ({ d, p, o }) => {
      let n = 0;
      for (const c of d.find({ side: 'any', st: true, zone: ['szone', 'fzone'] }, p)) if (await d.destroy(c, 'effect', undefined, p)) n++;
      await d.damage(o, 100 * n);
    }), { from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.zone === 'gy' && m.mark.destroyedHow === 'effect' && m.mark.destroyedTurn === d.turn; } })],
  },
  'D - Formation': passive({
    effects: [trig('anyToGY', run(({ d, card }) => { addCtr(d, card, 1, 'D'); }), {
      cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.card.def.name.includes('Destiny Hero') && ev.from === 'mzone' && ev.ctrl === c.ctrl && ev.card.mark.destroyedTurn === d.turn && ev.card.mark.lastFaceUp,
    })],
    onSummon: async (d, src, c, how, p) => {
      if (p !== src.ctrl || ctr(src, 'D') < 2 || (d.phase !== 'M1' && d.phase !== 'M2') || how === 'flip') return;
      const same = d.find({ side: 'self', zone: ['deck', 'gy'], name: c.def.name }, p);
      if (!same.length || !(await d.confirm(p, `Send D - Formation to the Graveyard to add copies of ${c.def.name}?`, src))) return;
      await d.move(src, 'gy', { why: 'cost' });
      for (const x of await d.select(p, `Add up to 2 "${c.def.name}"`, same, 1, 2, 'good')) await d.toHand(x);
      await d.shuffleDeck(p);
    },
  }),
  'D - Spirit': spell(ssFrom(['hand'], { set: 'Destiny Hero', maxLv: 4 }), { cond: (d, _c, p) => !hasSet(d, p, 'Destiny Hero') }),
  'D.D. Borderline': passive({ lock: { noBP: (d, src) => !!src && !d.players[src.ctrl].gy.some((c) => c.def.kind === 'spell') } }),
  'D.D. Designator': spell(run(async ({ d, p, o }) => {
    const name = await declareName(d, p, 'Declare a card name', d.players[o].hand);
    await d.reveal(p, d.players[o].hand, "Opponent's hand");
    const hit = d.players[o].hand.find((c) => c.def.name === name);
    if (hit) await d.banish(hit, p);
    else { const c = randomOf(d, d.players[p].hand); if (c) await d.banish(c, p); }
  }, 300), { req: [{ f: { side: 'opp', zone: 'hand' } }] }),
  'D.D.R. - Different Dimension Reincarnation': {
    effects: [act({
      cost: [{ op: 'discard', who: 'self', n: 1 }],
      targets: [{ f: { side: 'self', zone: 'banished', kind: 'monster' }, good: true }],
      ops: [run(async ({ d, p, card, t }) => {
        const m = t[0];
        if (!m || m.zone !== 'banished' || !d.canSpecial(p, m)) return;
        if (await d.specialSummon(m, p, 'atk', 'special', false, card)) { await d.equipCard(card, m, {}, p); }
      }, (d, me) => Math.max(-1, ...d.players[me].banished.filter((c) => d.revivable(c)).map((c) => (c.def.atk ?? 0) - 500)))],
    }), killEquippedOnLeave],
  },
  'Dangerous Machine Type-6': passive({
    effects: [trig('standby', run(async ({ d, p, o, card }) => {
      switch ((await d.die())) {
        case 1: { const c = await pick(d, p, 'Discard 1 card', d.players[p].hand, 'cost'); if (c) await d.discard(p, [c], p); break; }
        case 2: { const c = await pick(d, o, 'Discard 1 card', d.players[o].hand, 'cost'); if (c) await d.discard(o, [c], p); break; }
        case 3: await d.draw(p, 1); break;
        case 4: await d.draw(o, 1); break;
        case 5: { const c = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); break; }
        default: await d.destroy(card, 'effect', undefined, p);
      }
    }), { cond: (d, c) => d.onField(c) })],
  }),
  'Dark Calling': spell(run(async ({ d, p, card }) => {
    await fuse(d, p, card, { f: (f) => f.def.text.includes('"Dark Fusion"'), pool: (s) => [...d.players[s].hand, ...d.players[s].gy], dest: 'banished' });
  }, 1500, (d, p, card) => canFuse(d, p, card, { f: (f) => f.def.text.includes('"Dark Fusion"'), pool: (s) => [...d.players[s].hand, ...d.players[s].gy] }))),
  'Dark City': {
    effects: [trig('anyAttack', run(({ d, link }) => {
      const a = link.trig?.other;
      const ev = link.ev;
      if (!a || a.zone !== 'mzone' || ev.e !== 'attack' || !ev.target) return;
      if (d.atk(a) < d.atk(ev.target)) { d.addMod(a, 1000, 0, d.turn, 'attack'); d.log(`${a.def.name} gains 1000 ATK.`); }
    }), { cond: (d, _c, _p, ev) => ev?.e === 'attack' && !!ev.target && ev.target.faceUp && ev.attacker.def.name.includes('Destiny Hero') })],
  },
  'Dark Core': spell({ op: 'banish', s: { t: 'target' } }, { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: FU }] }),
  'Dark Designator': spell(run(async ({ d, p, o }) => {
    const name = await declareName(d, p, 'Declare a Monster Card name', [], (c) => c.def.kind === 'monster' && c.owner === o);
    const c = d.players[o].deck.find((x) => x.def.name === name);
    if (c) { await d.toHand(c); await d.shuffleDeck(o); }
  }, -1)),
  'Dark Eruption': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), attr: 'DARK', fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }, good: true }] }),
  'Dark Factory of Mass Production': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), mtype: ['normal'] }, n: 2, good: true }] }),
  'Dark Fusion': spell(run(async ({ d, p, card }) => {
    const f = await fuse(d, p, card, { f: (x) => x.def.race === 'Fiend' });
    if (f) f.data.untargetable = d.turn;
  }, 1500, (d, p, card) => canFuse(d, p, card, { f: (x) => x.def.race === 'Fiend' }))),
  'Dark Magic Attack': condSpell((d, p) => has(d, p, 'Dark Magician'), destroyAll(OPP_ST), { ai: (d, me) => d.spellTraps(opp(me)).length * 600 - 300 }),
  'Dark Room of Nightmare': passive({
    onDamage: async (d, src, s, _n, from, battle) => { if (!battle && s !== src.ctrl && from?.def.name !== 'Dark Room of Nightmare') await d.damage(s, 300, src); },
  }),
  'Dark Snake Syndrome': passive({ effects: [trig('standby', run(async ({ d, p, o, card }) => { const n = 200 * 2 ** Math.max(0, (card.data.standbys ?? 1) - 1); await d.damage(p, n, card); await d.damage(o, n, card); }), { cond: (d, c) => d.onField(c) })] }),
  'Dark World Dealings': spell(run(async ({ d, p, o }) => {
    await d.draw(p, 1);
    await d.draw(o, 1);
    for (const s of [p, o]) { const c = await pick(d, s, 'Discard 1 card', d.players[s].hand, 'cost'); if (c) await d.discard(s, [c], p); }
  }, 300), { cond: (d, _c, p) => d.players[p].deck.length > 0 && d.players[opp(p)].deck.length > 0 }),
  'Dark World Grimoire': passive({
    effects: [trig('anyToGY', run(async ({ d, p, link }) => { const c = link.trig?.other; if (c && c.zone === 'gy' && d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c)); }, 500), {
      optional: true, opt: true, cond: (d, card, _p, ev) => ev?.e === 'sent' && ev.from === 'hand' && ev.why === 'rule' && d.phase === 'EP' && d.tp === card.ctrl && ev.owner === card.ctrl && ev.card.def.kind === 'monster',
    })],
  }),
  'Dark World Lightning': spell([{ op: 'destroy', s: { t: 'target' } }, run(async ({ d, p }) => { const c = await pick(d, p, 'Discard 1 card', d.players[p].hand, 'cost'); if (c) await d.discard(p, [c], p); })], {
    targets: [{ f: { side: 'any', zone: ['mzone', 'szone'], faceUp: false, notThis: true } }],
  }),
  'Deck Lockdown': passive({
    lock: { noAdd: () => true, summon: (_d, _s, _p, c, how) => how === 'special' && c.zone === 'deck' },
    effects: [trig('standby', run(({ d, card }) => d.destroy(card, 'effect', undefined, card.ctrl)), { cond: (d, c) => d.onField(c) && (c.data.standbys ?? 0) >= 2 })],
  }),
  'Dedication through Light and Darkness': spell(ssFrom(['hand', 'gy', 'deck'], { name: 'Dark Magician of Chaos' }, { ignore: true }), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Dark Magician' } } }],
    req: [{ f: { side: 'self', zone: ['hand', 'gy', 'deck'], name: 'Dark Magician of Chaos' } }],
  }),
  'Degenerate Circuit': passive({
    lock: { bounceToBanish: true },
    effects: [trig('standby', run(({ d, p }) => d.changeLP(p, -500, true)), { cond: (d, c) => d.onField(c) })],
  }),
  'Delta Attacker': spell(run(({ d, p }) => {
    for (const m of d.monsters(p)) if (m.faceUp && notTokenNormal(m) && d.monsters(p).filter((x) => x.faceUp && x.def.name === m.def.name).length >= 3) grantRule(d, m, 'direct');
  }, 1200), { cond: (d, _c, p) => d.monsters(p).some((m) => notTokenNormal(m) && m.faceUp && d.monsters(p).filter((x) => x.faceUp && x.def.name === m.def.name && !x.token).length >= 3) }),
  'Demise of the Land': spell(run(async ({ d, p }) => {
    const f = await pick(d, p, 'Activate a Field Spell from your Deck', d.find(DECK({ stype: 'field' }), p), 'good');
    if (!f) return;
    await d.toHand(f);
    await d.shuffleDeck(p);
    d.deferred.push(async () => {
      const i = f.def.effects?.findIndex((e) => e.type === 'activate') ?? -1;
      if (f.zone === 'hand' && i >= 0) { await d.activate(f, i, p, { e: 'open' }); await d.chainLoop({ e: 'open' }, opp(p)); }
    });
  }, 400), { when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip', req: [{ f: DECK({ stype: 'field' }) }] }),
  'Demotion': { equip: { f: FU }, lvFn: (d, src, c) => (d.equippedTo(src) === c ? -2 : 0) },
  'Des Croaking': condSpell((d, p) => d.find({ ...OWN_FU, name: 'Des Frog' }, p).length >= 3, destroyAll({ side: 'opp' }), { ai: (d, me) => d.fieldCards(opp(me)).length * 700 }),
  'Destiny Draw': spell({ op: 'draw', who: 'self', n: 2 }, {
    cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', set: 'Destiny Hero' } } }], req: [{ f: { side: 'self', zone: 'hand', set: 'Destiny Hero' } }],
  }),
  'Diamond-Dust Cyclone': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    const n = Math.floor(ctr(c, 'fog') / 4);
    if (await d.destroy(c, 'effect', undefined, p)) await d.draw(p, n);
  }, 800), { targets: [{ f: { ...FU, fn: (_d, c) => ctr(c, 'fog') >= 4 } }] }),
  'Different Dimension Capsule': spell(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Banish a card from your Deck face-down', d.players[p].deck, 'good');
    if (!c) return;
    await d.banish(c, p);
    c.faceUp = false;
    await d.shuffleDeck(p);
    const mv = c.mv;
    secondStandby(d, p, async () => { if (c.mv === mv && c.zone === 'banished') await d.toHand(c); });
  }, 300)),
  'Different Dimension Gate': passive({
    effects: [trig('destroyed', run(async ({ d, card }) => {
      for (const uid of card.last.gate ?? []) {
        const m = d.byUid(uid);
        if (m && m.zone === 'banished' && d.canSpecial(m.owner, m)) { m.properly = true; await d.specialSummon(m, m.owner, m.mark.lastPos ?? 'atk'); }
      }
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  }, {
    req: [{ f: OWN_M }, { f: OPP_M }],
    ops: [run(async ({ d, p, o, card }) => {
      const a = await pick(d, p, 'Banish one of your monsters', d.monsters(p), 'cost');
      const b = await pick(d, p, "Banish one of your opponent's monsters", d.monsters(o), 'bad');
      card.data.gate = [];
      for (const m of [a, b]) if (m) { await d.banish(m, p); card.data.gate.push(m.uid); }
    }, 400)],
  }),
  'Diffusion Wave-Motion': spell(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Select a Level 7+ Spellcaster', d.find({ ...OWN_FU, race: ['Spellcaster'], minLv: 7 }, p), 'good');
    if (!c) return;
    c.data.attackAll = d.turn;
    d.addTemp({ until: d.turn, p, lock: { attack: (_d, _s, a) => a.ctrl === p && a !== c } });
  }, (d, me) => (d.monsters(opp(me)).length >= 2 && d.phase === 'M1' ? 900 : -1)), { cost: [{ op: 'payLP', n: 1000 }], req: [{ f: { ...OWN_FU, race: ['Spellcaster'], minLv: 7 } }] }),
  'Dimension Distortion': spell(ssFrom(['banished']), { cond: (d, _c, p) => d.players[p].gy.length === 0 }),
  'Dimension Explosion': spell(run(async ({ d, p, o, t }) => {
    const f = t[0];
    if (!f || f.zone !== 'mzone') return;
    await d.move(f, 'extra');
    for (const s of [p, o]) {
      const cs = await d.select(s, 'Special Summon up to 2 banished monsters', bothBanished(d, s).filter((c) => d.canSpecial(s, c)), 0, Math.min(2, d.freeCount(s, 'm')), 'good');
      for (const c of cs) await d.specialSummon(c, s, await d.askPos(s, c));
    }
  }, 400), { targets: [{ f: { ...OWN_FU, mtype: ['fusion'] }, good: true }] }),
  'Dimension Fusion': spell(run(async ({ d, p, o }) => {
    for (const s of [p, o]) for (const c of bothBanished(d, s)) { if (!d.canSpecial(s, c)) break; await d.specialSummon(c, s, await d.askPos(s, c)); }
  }, (d, me) => bothBanished(d, me).length * 800 - bothBanished(d, opp(me)).length * 800 - 1000), { cost: [{ op: 'payLP', n: 2000 }] }),
  'Dimensional Fissure': passive({ lock: { gyToBanish: (_d, _s, c) => c.def.kind === 'monster' } }),
  'Divine Sword - Phoenix Blade': {
    equip: { f: { ...FU, race: ['Warrior'] }, atk: 300 },
    effects: [ign({ op: 'toHand', s: { t: 'this' } }, {
      from: ['gy'], label: 'Banish 2 Warriors: return to hand',
      cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), race: ['Warrior'] }, n: 2 } }],
      req: [{ f: { ...GY_M('self'), race: ['Warrior'] }, n: 2 }],
    })],
  },
  "Doriado's Blessing": ritual('Elemental Mistress Doriado'),
  'Double Attack': spell(run(async ({ d, p, link }) => {
    const lv = link.data.lv ?? 0;
    const c = await pick(d, p, 'Select a monster that can attack twice', d.monsters(p).filter((m) => m.faceUp && d.lvOf(m) < lv), 'good');
    if (c) { c.data.extraAtk = d.turn; d.log(`${c.def.name} can attack twice this turn.`); }
  }, (d) => (d.phase === 'M1' ? 500 : -1)), {
    cost: [run(async ({ d, p, card, link }) => {
      const c = await pick(d, p, 'Discard a Monster Card', d.players[p].hand.filter((x) => x !== card && x.def.kind === 'monster'), 'cost');
      if (c) { link.data.lv = c.def.lv ?? 0; await d.discard(p, [c], null); }
    }, 0, (d, p, card) => d.players[p].hand.some((x) => x !== card && x.def.kind === 'monster' && d.monsters(p).some((m) => m.faceUp && d.lvOf(m) < (x.def.lv ?? 0))))],
  }),
  'Double Snare': spell({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { side: 'any', faceUp: true, zone: ['mzone', 'szone'], fn: (_d, c) => /negate|cannot be activated/i.test(c.def.text) && /Trap/.test(c.def.text) && c.def.kind !== 'trap' || c.def.name === 'Royal Decree' || c.def.name === 'Jinzo' } }] }),
  'Double Spell': spell(run(async ({ d, p, card }) => {
    const c = await pick(d, p, "Select a Spell in your opponent's Graveyard", d.players[opp(p)].gy.filter((x) => x.def.kind === 'spell' && x.def.stype !== 'field' && x.def.stype !== 'continuous' && x.def.stype !== 'equip'), 'good');
    if (c) await castCopy(d, p, c, card);
  }, 600), {
    cost: [run(async ({ d, p, card }) => { const c = await pick(d, p, 'Discard a Spell Card', d.players[p].hand.filter((x) => x !== card && x.def.kind === 'spell'), 'cost'); if (c) await d.discard(p, [c], null); }, 0, (d, p, card) => d.players[p].hand.some((x) => x !== card && x.def.kind === 'spell'))],
    req: [{ f: { side: 'opp', zone: 'gy', kind: 'spell' } }],
  }),
  'Double Summon': spell(run(({ d, p }) => { d.players[p].bonusSummons++; d.flags[`ds:${p}`] = d.turn; d.log(`${d.name(p)} can Normal Summon 1 additional time this turn.`); }, (d, me) => (d.players[me].hand.filter((c) => c.def.kind === 'monster').length >= 2 ? 300 : -1)), {
    cond: (d, _c, p) => d.flags[`ds:${p}`] !== d.turn,
  }),
  'Dragged Down into the Grave': spell(run(async ({ d, p, o }) => {
    const a = await pickSeen(d, p, "Discard a card from your opponent's hand", d.players[o].hand, 'bad');
    const b = await pickSeen(d, o, "Discard a card from your opponent's hand", d.players[p].hand, 'bad');
    if (a) await d.discard(o, [a], p);
    if (b) await d.discard(p, [b], p);
    await d.draw(p, 1);
    await d.draw(o, 1);
  }, 200), { req: [{ f: { side: 'opp', zone: 'hand' } }] }),
  "Dragon's Gunfire": condSpell((d, p) => d.find({ ...OWN_FU, race: ['Dragon'] }, p).length > 0, run(async ({ d, p, o }) => {
    const weak = d.find({ ...FU, fn: (dd, c) => dd.defv(c) <= 800 }, p);
    const i = weak.length ? await d.option(p, "Dragon's Gunfire", ['Inflict 800 damage', 'Destroy a monster with 800 or less DEF'], weak.some((c) => c.ctrl === o && (c.def.atk ?? 0) > 1000) ? 1 : 0) : 0;
    if (i === 0) await d.damage(o, 800);
    else { const c = await pick(d, p, 'Destroy a monster', weak, 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }
  }, 800)),
  "Dragon's Mirror": spell(run(async ({ d, p, card }) => {
    await fuse(d, p, card, { f: (f) => f.def.race === 'Dragon', pool: (s) => [...d.monsters(s), ...d.players[s].gy], dest: 'banished' });
  }, 1500, (d, p, card) => canFuse(d, p, card, { f: (f) => f.def.race === 'Dragon', pool: (s) => [...d.monsters(s), ...d.players[s].gy] }))),
  'Dust Barrier': passive({
    lock: { unaffected: (d, src, c, by) => !!src && c.zone === 'mzone' && c.faceUp && c.def.mtype === 'normal' && by.def.kind === 'spell' && d.holder(by) !== c.ctrl },
    effects: [trig('standby', run(({ d, card }) => d.destroy(card, 'effect', undefined, card.ctrl)), { cond: (d, c) => d.onField(c) && (c.data.standbys ?? 0) >= 2 })],
  }),
  'E - Emergency Call': spell(search({ kind: 'monster', set: 'Elemental Hero' }), { req: [{ f: DECK({ kind: 'monster', set: 'Elemental Hero' }) }] }),
  'Earth Chant': ritualOf((c) => c.def.attr === 'EARTH'),
  'Earthquake': spell({ op: 'pos', s: { t: 'all', f: { ...FU, pos: 'atk' } }, to: 'def' }, { ai: (d, me) => d.monsters(opp(me)).filter((c) => c.faceUp && c.pos === 'atk').length * 400 - d.monsters(me).filter((c) => c.faceUp && c.pos === 'atk').length * 300 }),
  'Ectoplasmer': passive({
    effects: [trig('endPhase', run(async ({ d }) => {
      const tp = d.tp;
      const c = await pick(d, tp, 'Ectoplasmer: Tribute a face-up monster', d.find({ ...OWN_FU }, tp).filter((m) => d.tributeOk(m)), 'cost');
      if (!c) return;
      const n = Math.floor((c.def.atk ?? 0) / 2);
      await d.move(c, 'gy', { why: 'tribute' });
      await d.damage(opp(tp), n);
    }), { cond: (d, c) => d.onField(c) })],
  }),
  'Emblem of Dragon Destroyer': spell(addFrom(['deck', 'gy'], { name: 'Buster Blader' })),
  'Emblem of the Awakening': ritual('Cú Chulainn the Awakened'),
  'Emergency Provisions': spell(run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'Send Spell/Trap Cards to the Graveyard', d.spellTraps(p).filter((c) => c !== card), 1, 10, 'cost');
    for (const c of cs) await d.move(c, 'gy', { by: p });
    await d.heal(p, 1000 * cs.length);
  }, (d, me) => (d.players[me].lp < 2000 ? 600 : -1)), { req: [{ f: { side: 'self', st: true, zone: ['szone', 'fzone'], notThis: true } }] }),
  'Enchanting Fitting Room': spell(run(async ({ d, p, card }) => {
    const top = d.players[p].deck.slice(-4).reverse();
    await d.reveal(p, top, 'Enchanting Fitting Room');
    for (const c of top) if (c.def.kind === 'monster' && c.def.mtype === 'normal' && (c.def.lv ?? 0) <= 3 && d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card);
    await d.shuffleDeck(p);
  }, 400), { cost: [{ op: 'payLP', n: 800 }] }),
  'End of the World': ritualOf(['Ruin, Queen of Oblivion', 'Demise, King of Armageddon']),
  'Enemy Controller': spell(run(async ({ d, p, o }) => {
    const canSteal = d.monsters(p).some((m) => d.tributeOk(m)) && d.find(OPP_FU, p).length > 0;
    const i = canSteal ? await d.option(p, 'Enemy Controller', ['Change Battle Position', 'Tribute 1 monster: take control'], d.monsters(o).some((m) => (m.def.atk ?? 0) >= 2000) ? 1 : 0) : 0;
    if (i === 0) { const c = await pick(d, p, 'Change the Battle Position of a monster', d.find(OPP_FU, p).filter((x) => d.targetable(x, d.chain[d.chain.length - 1]?.card ?? x)), 'bad'); if (c) await d.changePos(c, 'swap'); return; }
    const t = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost');
    if (t) await d.move(t, 'gy', { why: 'tribute' });
    const c = await pick(d, p, 'Take control of a monster', d.find(OPP_FU, p), 'bad');
    if (c) await d.takeControl(c, p);
  }, (d, me) => Math.max(200, ...d.find(OPP_FU, me).map((c) => d.atk(c) - 1500))), { req: [{ f: OPP_FU }] }),
  'Fairy of the Spring': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'gy') return;
    await d.toHand(c);
    const mv = c.mv;
    d.addTemp({ until: d.turn, p, lock: { activate: (_d, _s, _q, x) => x === c && x.mv === mv } });
  }, 400), { targets: [{ f: { side: 'self', zone: 'gy', stype: 'equip' }, good: true }] }),
  'Fake Hero': spell(run(async ({ d, p, card }) => {
    const c = await ssPick(d, p, d.find({ side: 'self', zone: 'hand', set: 'Elemental Hero' }, p), 'Special Summon an Elemental Hero', undefined, false, card);
    if (!c) return;
    c.noAttackTurn = d.turn;
    atEndPhase(d, c, (x) => d.toHand(x));
  }, 300), { req: [{ f: { side: 'self', zone: 'hand', set: 'Elemental Hero', kind: 'monster' } }] }),
  'Falling Down': {
    equip: { f: OPP_FU },
    selfDestructIf: (d, c) => !d.fieldCards(c.ctrl).some((x) => x.faceUp && x !== c && x.def.name.includes('Archfiend')),
    effects: [
      act({ targets: [{ f: OPP_FU }], ops: [{ op: 'equip' }, run(async ({ d, p, card, t }) => { if (t[0] && d.equippedTo(card) === t[0]) await d.takeControl(t[0], p, true, card); }, (d, me) => Math.max(-1, ...d.find(OPP_FU, me).map((c) => d.atk(c))))], cond: (d, _c, p) => d.fieldCards(p).some((x) => x.faceUp && x.def.name.includes('Archfiend')) }),
      trig('oppStandby', run(({ d, card }) => d.damage(card.ctrl, 800, card)), { cond: (d, c) => d.onField(c) }),
    ],
  },
  'Feather Shot': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    c.data.attackN = { turn: d.turn, n: d.monsters(p).length };
    c.data.noDirectTurn = d.turn;
    d.addTemp({ until: d.turn, p, lock: { attack: (_d, _s, a) => a.ctrl === p && a !== c } });
  }, (d, me) => (d.monsters(me).length >= 2 && d.phase === 'M1' ? 600 : -1)), { targets: [{ f: { ...OWN_FU, name: 'Elemental Hero Avian' }, good: true }] }),
  'Fengsheng Mirror': spell(run(async ({ d, p, o }) => {
    await d.reveal(p, d.players[o].hand, "Opponent's hand");
    const c = await pickSeen(d, p, 'Discard a Spirit monster', d.players[o].hand.filter((x) => x.def.ability === 'spirit'), 'bad');
    if (c) await d.discard(o, [c], p);
  }, 100), { req: [{ f: { side: 'opp', zone: 'hand' } }] }),
  'Field Barrier': passive({
    lock: {
      indestructible: (_d, _s, c, by) => by === 'effect' && c.def.stype === 'field' && c.zone === 'fzone',
      activate: (_d, _s, _p, c) => c.def.stype === 'field' && c.zone === 'hand',
    },
  }, { cond: (d, _c, p) => !has(d, p, 'Field Barrier') }),
  "Fiend's Sanctuary": spell(run(async ({ d, p }) => {
    await tokens(d, p, tokenDef('Metal Fiend Token', 'Fiend', 'DARK', 1, 0, 0, {
      rules: ['cantAttack'], upkeep: 1000,
      battleDmg: (dd, self, _o, n, to) => { if (to === self.ctrl) { dd.deferred.push(() => dd.damage(opp(self.ctrl), n, self, true)); return 0; } return n; },
    }), 1, 'atk');
  }, 300), { cond: (d, _c, p) => d.canSpecial(p) }),
  'Fifth Hope': spell(run(async ({ d, p, link }) => {
    const cs = link.targets[0]?.filter((c, k) => c.mv === link.tmv[0][k] && c.zone === 'gy') ?? [];
    for (const c of cs) await d.move(c, 'deck');
    await d.shuffleDeck(p);
    await d.draw(p, link.data.alone ? 3 : 2);
  }, 900), {
    targets: [{ f: { side: 'self', zone: 'gy', set: 'Elemental Hero' }, n: 5, good: true }],
    cost: [run(({ d, p, card, link }) => { link.data.alone = d.players[p].hand.length === 0 && d.fieldCards(p).every((c) => c === card); })],
  }),
  'Final Countdown': spell(run(({ d, card }) => { card.mark.countdown = d.turn; d.log('Final Countdown: 20 turns.'); }, (d, me) => (d.players[me].lp > 4000 ? 300 : -1)), { cost: [{ op: 'payLP', n: 2000 }] }),
  'Final Ritual of the Ancients': ritual('Reshef the Dark Being'),
  'Fires of Doomsday': spell(run(async ({ d, p }) => {
    await tokens(d, p, tokenDef('Doomsday Token', 'Fiend', 'DARK', 1, 0, 0), 2, 'def');
    d.addTemp({ until: d.turn, p, lock: { summon: (_d, _s, q) => q === p } });
  }, (d, me) => (d.players[me].hand.some((c) => (c.def.lv ?? 0) >= 7) ? 900 : 100)), { cond: (d, _c, p) => d.freeCount(p, 'm') >= 2 && d.canSpecial(p) }),
  'Flash of the Forbidden Spell': spell(destroyAll(OPP_M), { cond: (d, _c, p) => d.monsters(opp(p)).length === 5 }),
  'Flint': {
    equip: { f: FU, atk: -300, rules: ['cantAttack'] },
    lock: { pos: (d, src, c) => !!src && d.equippedTo(src) === c },
    effects: [trig('fieldToGY', run(async ({ d, p, card }) => {
      const m = await pick(d, p, 'Equip Flint to a monster', d.find(FU, p), 'bad');
      if (m) await d.equipCard(card, m, undefined, p);
    }), { from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.zone === 'gy' && m.mark.destroyedTurn === d.turn && d.find(FU, c.owner).length > 0; } })],
  },
  'Flint Missile': spell(run(async ({ d, p, card, t }) => {
    if (t[0]) await d.destroy(t[0], 'effect', undefined, p);
    if (d.onField(card) && (await d.confirm(p, 'Return Flint Missile to the Deck?', card))) { await d.move(card, 'deck'); await d.shuffleDeck(p); }
  }, 900), { targets: [{ f: { ...M, fn: (d, c) => d.equipsOf(c).some((e) => e.def.name === 'Flint') } }] }),
  'Fog Control': spell(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 3, 'fog'); }, 300), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, set: 'Cloudian' } } }], targets: [{ f: FU }], req: [{ f: { ...OWN_FU, set: 'Cloudian' } }],
  }),
  'Foolish Burial': spell({ op: 'toGY', s: { t: 'choose', f: DECK({ kind: 'monster' }) } }, { ai: 200, req: [{ f: DECK({ kind: 'monster' }) }] }),
  'Frontline Base': passive({ effects: [ign(ssFrom(['hand'], { ability: 'union', maxLv: 4 }), { label: 'Special Summon a Union monster', opt: true })] }),
  'Fuhma Shuriken': {
    equip: { f: { ...FU, set: 'Ninja' }, atk: 700 },
    effects: [trig('fieldToGY', { op: 'damage', who: 'opp', n: 700 }, { from: ['gy'] })],
  },
  'Fulfillment of the Contract': {
    effects: [act({
      cost: [{ op: 'payLP', n: 800 }],
      targets: [{ f: { ...GY_M('self'), mtype: ['ritual'] }, good: true }],
      ops: [run(async ({ d, p, card, t }) => {
        const m = t[0];
        if (!m || m.zone !== 'gy' || !d.canSpecial(p, m)) return;
        m.properly = true;
        if (await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card)) await d.equipCard(card, m, {}, p);
      }, 1200)],
    }), trig('destroyed', run(async ({ d, card }) => { const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined; if (m && m.zone === 'mzone') await d.banish(m, card.owner); }))],
  },
  'Fusion Recovery': spell(run(async ({ d, p }) => {
    const poly = await pick(d, p, 'Add Polymerization', d.find({ side: 'self', zone: 'gy', name: 'Polymerization' }, p), 'good');
    const mat = await pick(d, p, 'Add a Fusion Material Monster', d.players[p].gy.filter((c) => c.mark.fusionMatFor !== undefined && c.def.kind === 'monster'), 'good');
    if (poly) await d.toHand(poly);
    if (mat) await d.toHand(mat);
  }, 700), { req: [{ f: { side: 'self', zone: 'gy', name: 'Polymerization' } }, { f: { side: 'self', zone: 'gy', fn: (_d, c) => c.mark.fusionMatFor !== undefined } }] }),
  'Fusion Sword Murasame Blade': {
    equip: { f: { ...FU, race: ['Warrior'] }, atk: 800 },
    lock: { indestructible: (_d, src, c, by) => c === src && by === 'effect' },
  },
  'Fusion Weapon': { equip: { f: { ...FU, mtype: ['fusion'], maxLv: 6 }, atk: 1500, def: 1500 } },
  'Future Fusion': passive({
    effects: [trig('leftField', run(async ({ d, card }) => { const m = card.last.ff !== undefined ? d.byUid(card.last.ff) : undefined; if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); }))],
    selfDestructIf: (d, c) => { const m = c.data.ff !== undefined ? d.byUid(c.data.ff) : undefined; return c.data.ffDone && (!m || m.zone !== 'mzone'); },
  }, {
    ops: [run(async ({ d, p, card }) => {
      await fuse(d, p, card, {
        pool: (s) => d.players[s].deck, dest: 'gy',
        later: (f) => {
          card.data.ffName = f.def.name;
          const mv = card.mv;
          secondStandby(d, p, async () => {
            if (card.mv !== mv || !d.onField(card)) return;
            const x = d.players[p].extra.find((e) => e.def.name === card.data.ffName);
            if (x && d.canSpecial(p, x) && (await d.specialSummon(x, p, await d.askPos(p, x), 'fusion', false, card))) { card.data.ff = x.uid; card.data.ffDone = true; }
          });
        },
      });
    }, 1200, (d, p, card) => canFuse(d, p, card, { pool: (s) => d.players[s].deck }))],
  }),
  'Gateway to Dark World': spell(run(async ({ d, p, card }) => {
    await ssPick(d, p, d.find({ ...GY_M('self'), set: 'Dark World' }, p), 'Special Summon a Dark World monster', undefined, false, card);
    d.addTemp({ until: d.turn, p, lock: { summon: (_d, _s, q) => q === p } });
  }, 600), { req: [{ f: { ...GY_M('self'), set: 'Dark World' } }] }),
  'Gather Your Mind': spell(run(async ({ d, p }) => {
    d.flags[`gym:${p}`] = d.turn;
    const c = d.find(DECK({ name: 'Gather Your Mind' }), p)[0];
    if (c) { await d.toHand(c); await d.shuffleDeck(p); }
  }, 200), { cond: (d, _c, p) => d.flags[`gym:${p}`] !== d.turn }),
  'Gift of the Martyr': spell(run(async ({ d, p, link }) => {
    const c = await pick(d, p, 'Select a monster to gain ATK', d.find(OWN_FU, p), 'good');
    if (c) d.addMod(c, link.data.atk ?? 0, 0);
  }, (d) => (d.phase === 'M1' ? 300 : -1)), {
    cost: [run(async ({ d, p, link }) => {
      const c = await pick(d, p, 'Send a monster to the Graveyard', d.monsters(p), 'cost');
      if (c) { link.data.atk = c.faceUp ? d.atk(c) : c.def.atk ?? 0; await d.move(c, 'gy', { by: p, why: 'cost' }); }
    }, 0, (d, p) => d.monsters(p).length >= 2)],
  }),
  "Gladiator Beast's Battle Archfiend Shield": { equip: { f: GB, sub: true }, effects: [gbReturn] },
  "Gladiator Beast's Battle Gladius": { equip: { f: GB, atk: 300 }, effects: [gbReturn] },
  "Gladiator Beast's Battle Halberd": {
    equip: { f: GB },
    postBattle: async (d, self, _o, r) => { if (r.att === self) await destroyOneST(d, self.ctrl); },
    effects: [gbReturn],
  },
  "Gladiator Beast's Battle Manica": { equip: { f: GB, rules: ['battleImmune'] }, effects: [gbReturn] },
  "Gladiator Beast's Respite": spell([run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'Return 2 Gladiator Beast cards to the Deck', d.players[p].hand.filter((c) => c !== card && c.def.name.includes('Gladiator Beast')), 2, 2, 'cost');
    for (const c of cs) await d.move(c, 'deck');
    await d.shuffleDeck(p);
  }), { op: 'draw', who: 'self', n: 3 }], { req: [{ f: { side: 'self', zone: 'hand', set: 'Gladiator Beast', notThis: true }, n: 2 }] }),
  'Gladiator Proving Ground': spell(search({ kind: 'monster', set: 'Gladiator Beast', maxLv: 4 }), { req: [{ f: DECK({ kind: 'monster', set: 'Gladiator Beast', maxLv: 4 }) }] }),
  "Gladiator's Return": spell([{ op: 'toDeck', s: { t: 'target' } }, { op: 'draw', who: 'self', n: 1 }], { targets: [{ f: { ...GY_M('self'), set: 'Gladiator Beast' }, n: 3, good: true }] }),
  'Goblin Thief': spell([{ op: 'damage', who: 'opp', n: 500 }, { op: 'heal', who: 'self', n: 500 }]),
  'Gold Sarcophagus': spell(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Banish a card from your Deck', d.players[p].deck, 'good');
    if (!c) return;
    await d.banish(c, p);
    await d.shuffleDeck(p);
    const mv = c.mv;
    secondStandby(d, p, async () => { if (c.mv === mv && c.zone === 'banished') await d.toHand(c); });
  }, 300)),
  'Golden Bamboo Sword': condSpell((d, p) => d.spellTraps(p).some((c) => c.faceUp && c.def.stype === 'equip' && c.def.name.includes('Bamboo Sword')), { op: 'draw', who: 'self', n: 2 }),
  'Grand Convergence': condSpell((d, p) => has(d, p, 'Macro Cosmos'), [{ op: 'damage', who: 'opp', n: 300 }, destroyAll(M)], { ai: (d, me) => scoreWipe(d, me, () => true) + 300 }),
  'Gravity Axe - Grarl': { equip: { f: FU, atk: 500 }, lock: { pos: (d, src, c) => !!src && d.onField(src) && c.ctrl !== src.ctrl } },
  "Gryphon's Feather Duster": spell(run(async ({ d, p, card }) => {
    let n = 0;
    for (const c of d.spellTraps(p)) if (c !== card && (await d.destroy(c, 'effect', undefined, p))) n++;
    await d.heal(p, 500 * n);
  }, (d, me) => (d.players[me].lp < 3000 ? d.spellTraps(me).length * 200 : -1))),
};

/** Final Countdown win condition lives on the card in any zone. */
SPELLS_2['Final Countdown'].winCheck = (d, c) => c.mark.countdown !== undefined && d.turn >= c.mark.countdown + 20;
void union; void inSet; void both; void destroyAtEnd; void quick; void ign;
