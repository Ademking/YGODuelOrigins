// YGO Online monsters, part 3 (Chthonian Emperor Dragon … Dark Magician of Chaos).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, banishVictims, both, cloudian, crystalBeast, crystalInST, ctr, cyberdark, destroyAll, flip, has, ign,
  isAttackOn, lvUp, markKill, merge, opp, pick, placeA, placeAsSpell, quick, randomOf, removeCtr, run, search, spirit, ssFrom, ssPick,
  threat, tokenDef, tokens, trig, tributed, won, probe, probeTarget,
} from './olib';

const removeFog = (d: Duel, p: Side, n: number, onlyThis?: Card) => {
  let k = n;
  for (const c of onlyThis ? [onlyThis] : both(d)) { if (!k) break; k -= removeCtr(d, c, k, 'fog'); }
  return k === 0;
};
const fogTotal = (d: Duel) => both(d).reduce((s, c) => s + ctr(c, 'fog'), 0);
const dlBanish: Def['postBattle'] = async (d, self, o, r) => { if (o && won(self, r)) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } };
const comboTwice: Def = {
  onResolve: (d, src, link) => { if (d.phase === 'M1' && d.tp === src.ctrl && link.num >= 2) src.data.combo = d.turn; },
  extraAttacks: (d, c) => (c.data.combo === d.turn ? 1 : 0),
};

export const MONSTERS_3: Record<string, Def> = {
  'Chthonian Emperor Dragon': { rules: ['doubleAttack'] },
  'Chthonian Soldier': { battleDmg: (d, self, other, n, to) => { if (to === self.ctrl && other && d.battle?.att === other && d.atk(other) > d.atk(self)) d.deferred.push(() => d.damage(opp(to), n, self, true)); return n; } },
  'Cliff the Trap Remover': {
    effects: [trig('battleDamage', run(async ({ d, p, o }) => {
      const sts = d.find(ST, p);
      if (sts.length && (await d.option(p, 'Cliff the Trap Remover', ['Destroy 1 Spell/Trap', 'Mill 2 cards'])) === 0) { const c = await pick(d, p, 'Destroy a Spell or Trap Card', sts, 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }
      else await d.mill(o, 2, p);
    }), { optional: true, cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Cloudian - Acid Cloud': merge(cloudian(), { effects: [ign([run(({ d, card }) => { removeCtr(d, card, 2, 'fog'); }), { op: 'destroy', s: { t: 'target' } }], { label: 'Remove 2 Fog Counters: destroy a Spell/Trap', targets: [{ f: ST }], cond: (_d, c) => ctr(c, 'fog') >= 2 })] }),
  'Cloudian - Altus': merge(cloudian(), { effects: [ign(run(async ({ d, p, o }) => { removeFog(d, p, 3); const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }, 600), { label: 'Remove 3 Fog Counters: random discard', cond: (d, c) => fogTotal(d) >= 3 && d.players[opp(c.ctrl)].hand.length > 0 })] }),
  'Cloudian - Cirrostratus': merge(cloudian(), { effects: [ign([run(({ d, card }) => { removeCtr(d, card, 2, 'fog'); }), { op: 'destroy', s: { t: 'target' } }], { label: 'Remove 2 Fog Counters: destroy a monster', targets: [{ f: M }], cond: (_d, c) => ctr(c, 'fog') >= 2 })] }),
  'Cloudian - Eye of the Typhoon': merge(cloudian(false), { effects: [trig('attacks', run(async ({ d }) => { for (const c of both(d).filter((x) => x.faceUp && !x.def.name.includes('Cloudian'))) await d.changePos(c, 'swap'); }))] }),
  'Cloudian - Ghost Fog': {
    noSpecial: true,
    battleDmg: () => 0,
    effects: [trig('battleDestroyed', run(async ({ d, p, link }) => { const o = link.trig?.other; if (!o) return; for (let i = 0; i < (o.def.lv ?? 0); i++) { const c = await pick(d, p, 'Place a Fog Counter', both(d).filter((x) => x.faceUp), 'good'); if (!c) break; addCtr(d, c, 1, 'fog'); } }), { from: ['gy'] })],
  },
  'Cloudian - Nimbusman': merge(cloudian(false), {
    altTributes: [2, 3, 4, 5], tribFilter: (d, t) => d.attrOf(t) === 'WATER' || t.def.attr === 'WATER',
    statFn: (d) => ({ atk: 500 * fogTotal(d) }),
    effects: [trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, card.mark.tribCount ?? 0, 'fog'); }), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })],
  }),
  'Cloudian - Poison Cloud': { effects: [trig('battleDestroyed', run(async ({ d, p, o, link }) => { const x = link.trig?.other; if (x && x.zone === 'mzone') await d.destroy(x, 'effect', undefined, p); await d.damage(o, 800); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && !!c.mark.lastFaceUp })] },
  'Cloudian - Sheep Cloud': { effects: [trig('battleDestroyed', run(({ d, p }) => tokens(d, p, 'Cloudian Token', 2, 'def')), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Cloudian - Storm Dragon': merge(cloudian(false), banishProc(1, { set: 'Cloudian' }), { effects: [ign(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 1, 'fog'); }, 200), { opt: true, label: 'Place a Fog Counter', targets: [{ f: M }] })] }),
  'Cloudian - Turbulence': merge(cloudian(), { effects: [ign([run(({ d, card }) => { removeCtr(d, card, 1, 'fog'); }), ssFrom(['deck', 'gy'], { name: 'Cloudian - Smoke Ball' }, { side: 'any' })], { label: 'Remove a Fog Counter: Special Summon Smoke Ball', cond: (_d, c) => ctr(c, 'fog') >= 1 })] }),
  'Coach Goblin': {
    effects: [trig('endPhase', run(async ({ d, p }) => { const c = await pick(d, p, 'Return a Normal Monster to the bottom of your Deck', d.players[p].hand.filter((x) => x.def.kind === 'monster' && x.def.mtype === 'normal'), 'cost'); if (c) { await d.move(c, 'deck', { bottom: true }); await d.draw(p, 1); } }), {
      optional: true, opt: true, cond: (d, c) => d.tp === c.ctrl && d.players[c.ctrl].hand.some((x) => x.def.kind === 'monster' && x.def.mtype === 'normal'),
    })],
  },
  'Cobra Jar': {
    effects: [flip(run(({ d, p }) => tokens(d, p, tokenDef('Poisonous Snake Token', 'Reptile', 'EARTH', 3, 1200, 1200, {
      effects: [trig('battleDestroyed', { op: 'damage', who: 'opp', n: 500 })],
    }), 1, 'atk')))],
  },
  'Cobraman Sakuzy': {
    effects: [
      ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (d, c) => c.faceUp && (d.phase === 'M1' || d.phase === 'M2') }),
      flip(run(async ({ d, p, o }) => { const set = d.spellTraps(o).filter((c) => !c.faceUp); if (set.length) await d.reveal(p, set, 'Set Spell and Trap Cards'); })),
    ],
  },
  'Cold Enchanter': {
    statFn: (d) => ({ atk: 300 * both(d).reduce((s, c) => s + ctr(c, 'ice'), 0) }),
    effects: [ign(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 1, 'ice'); }, 300), { label: 'Discard: place an Ice Counter', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: FU }] })],
  },
  'Combo Fighter': comboTwice,
  'Combo Master': comboTwice,
  'Command Knight': {
    aura: [{ f: { side: 'self', zone: 'mzone', race: ['Warrior'] }, atk: 400 }],
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.monsters(src.ctrl).length > 1 },
  },
  'Commander Covington': {
    effects: [ign(run(async ({ d, p, card }) => {
      for (const n of ['Machiners Soldier', 'Machiners Sniper', 'Machiners Defender']) { const c = d.find({ ...OWN_FU, name: n }, p)[0]; if (c) await d.move(c, 'gy', { by: p, why: 'cost' }); }
      await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Machiners Force' }, p), 'Special Summon Machiners Force', undefined, true, card);
    }, 1500), { label: 'Send the Machiners: Special Summon Machiners Force', req: ['Machiners Soldier', 'Machiners Sniper', 'Machiners Defender'].map((n) => ({ f: { ...OWN_FU, name: n } })) })],
  },
  "Cosmic Horror Gangi'el": {
    tributes: (d, p) => (d.monsters(p).some((m) => m.owner !== p) ? 1 : 2),
    effects: [ign(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 1, 'A'); }, 300), { opt: true, label: 'Place an A-Counter', targets: [{ f: OPP_FU }] })],
  },
  'Cranium Fish': {
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: "Ocean's Keeper" } } }], req: [{ f: { ...OWN_M, name: "Ocean's Keeper" } }] },
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard a WATER monster: destroy a face-down card', targets: [{ f: { side: 'any', zone: ['mzone', 'szone'], faceUp: false } }], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WATER' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WATER' } }] })],
  },
  'Creeping Doom Manta': { effects: [trig('normalSummoned', run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (dd, _s, _p, c) => c.def.kind === 'trap' && dd.windows.some((w) => w.e === 'summon') } })))] },
  'Crimson Ninja': { effects: [flip(probe('trap'), { targets: [{ f: probeTarget('trap') }] })] },
  'Criosphinx': {
    onMove: async (d, _src, c, from, to) => {
      if (from !== 'mzone' || to !== 'hand' || c.def.kind !== 'monster') return;
      const x = await pick(d, c.owner, 'Send a card from your hand to the Graveyard', d.players[c.owner].hand.filter((h) => h !== c), 'cost');
      if (x) await d.move(x, 'gy', { by: opp(c.owner) });
    },
  },
  'Cross Porter': {
    effects: [
      ign(ssFrom(['hand'], { set: 'Neo-Spacian' }), { label: 'Send a monster: Special Summon a Neo-Spacian', cost: [{ op: 'toGY', s: { t: 'choose', f: OWN_M } }], req: [{ f: { side: 'self', zone: 'hand', set: 'Neo-Spacian', kind: 'monster' } }] }),
      trig('toGY', search({ kind: 'monster', set: 'Neo-Spacian' }), { optional: true, from: ['gy'] }),
    ],
  },
  'Crystal Beast Amber Mammoth': merge(crystalBeast(), {
    effects: [quick(run(({ d, card, link }) => { const ev = attackOf(link.ev); if (ev) { ev.target = card; d.log(`The attack target becomes ${card.def.name}.`); } }, (d, me, _c, ev) => threat(d, me, ev) / 2), {
      label: 'Become the attack target', when: (_d, ev, p, card) => isAttackOn(ev, p) && !!ev.target && ev.target !== card && ev.target.faceUp && ev.target.def.name.includes('Crystal Beast'),
    })],
  }),
  'Crystal Beast Amethyst Cat': merge(crystalBeast(), { rules: ['direct'], battleDmg: (d, self, other, n, to) => (!other && to !== self.ctrl && d.monsters(to).length > 0 ? Math.floor(n / 2) : n) }),
  'Crystal Beast Cobalt Eagle': merge(crystalBeast(), { effects: [ign(run(async ({ d, t }) => { const c = t[0]; if (c && d.onField(c)) { await d.move(c, 'deck'); d.log(`${c.def.name} is placed on top of the Deck.`); } }, 100), { opt: true, label: 'Return a Crystal Beast to the top of the Deck', targets: [{ f: { side: 'self', faceUp: true, zone: ['mzone', 'szone'], set: 'Crystal Beast' }, good: true }] })] }),
  'Crystal Beast Emerald Tortoise': merge(crystalBeast(), { effects: [ign({ op: 'pos', s: { t: 'target' }, to: 'def' }, { opt: true, label: 'Change a monster that attacked to Defense Position', targets: [{ f: { ...OWN_FU, pos: 'atk', fn: (_d, c) => c.attacks > 0 }, good: true }] })] }),
  'Crystal Beast Ruby Carbuncle': merge(crystalBeast(), {
    effects: [trig('specialSummoned', run(async ({ d, p }) => {
      for (const c of d.players[p].s.filter((x): x is Card => !!x && x.faceUp && x.def.kind === 'monster' && x.def.name.includes('Crystal Beast'))) { if (!d.canSpecial(p, c)) break; c.data.asSpell = false; await d.specialSummon(c, p, await d.askPos(p, c)); }
    }), { optional: true, cond: (d, c) => crystalInST(d, c.ctrl) > 0 })],
  }),
  'Crystal Beast Sapphire Pegasus': merge(crystalBeast(), {
    effects: [trig('summoned', run(async ({ d, p }) => {
      const c = await pick(d, p, 'Place a Crystal Beast in your Spell & Trap Zone', d.find({ side: 'self', zone: ['hand', 'deck', 'gy'], kind: 'monster', set: 'Crystal Beast' }, p), 'good');
      if (c) { const fromDeck = c.zone === 'deck'; await placeAsSpell(d, c, p); if (fromDeck) await d.shuffleDeck(p); }
    }), { optional: true, cond: (d, c) => d.freeSlot(c.ctrl, 's') >= 0 })],
  }),
  'Crystal Beast Topaz Tiger': merge(crystalBeast(), { statFn: (d, c) => (d.battle?.att === c && d.battle.tgt ? { atk: 400 } : undefined) }),
  'Crystal Seer': {
    effects: [flip(run(async ({ d, p }) => {
      const top = d.players[p].deck.slice(-2);
      const c = await pick(d, p, 'Add 1 card to your hand', top, 'good');
      if (!c) return;
      await d.toHand(c);
      for (const x of top.filter((t) => t !== c)) await d.move(x, 'deck', { bottom: true });
    }, 300))],
  },
  'Cyber Archfiend': {
    effects: [
      trig('anyDraw', { op: 'draw', who: 'self', n: 1 }, { cond: (d, c, _p, ev) => ev?.e === 'draw' && ev.dp && d.phase === 'DP' && ev.player === c.ctrl && d.players[c.ctrl].hand.length === 1 }),
      trig('endPhase', { op: 'destroy', s: { t: 'this' } }, { cond: (d, c) => d.tp === c.ctrl && d.players[c.ctrl].hand.length > 0 }),
    ],
  },
  'Cyber Barrier Dragon': {
    noNormal: true,
    effects: [quick({ op: 'negateAttack' }, { opt: true, label: 'Negate an attack', when: (_d, ev, p, card) => isAttackOn(ev, p) && card.pos === 'atk', ai: (d, me, _c, ev) => threat(d, me, ev) })],
  },
  'Cyber Blader': {
    rules: [],
    ruleIf: { battleImmune: (d, c) => d.monsters(opp(c.ctrl)).length === 1 },
    statFn: (d, c) => (d.monsters(opp(c.ctrl)).length === 2 ? { atk: d.base(c, 'atk') } : undefined),
    negateFn: (d, src, c) => d.monsters(opp(src.ctrl)).length === 3 && d.holder(c) !== src.ctrl && (c.def.kind !== 'monster' || c.def.mtype === 'effect'),
  },
  'Cyber Dinosaur': {
    effects: [quick(run(async ({ d, p, card }) => { if (card.zone === 'hand' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }, 1200), {
      from: ['hand'], label: 'Special Summon this card', when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip' && ev.cards.some((c) => c.data.from === 'hand'),
    })],
  },
  'Cyber Dragon': { ssProc: { cond: (d, p) => d.monsters(opp(p)).length > 0 && d.monsters(p).length === 0 } },
  'Cyber End Dragon': { rules: ['pierce'] },
  'Cyber Esper': {
    effects: [trig('anyDraw', run(async ({ d, p, link }) => { const ev = link.ev; if (ev.e === 'draw') await d.reveal(p, d.players[ev.player].hand.slice(-ev.n), 'Drawn cards'); }), { cond: (_d, c, _p, ev) => ev?.e === 'draw' && ev.player !== c.ctrl && c.pos === 'atk' })],
  },
  'Cyber Gymnast': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Discard: destroy an Attack Position monster', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { ...OPP_FU, pos: 'atk' } }] })] },
  'Cyber Kirin': { effects: [quick(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { noDamage: (_d, _s, s, battle) => s === p && !battle } }), 300), { label: 'Tribute: no effect damage this turn', cost: [{ op: 'tribute', s: { t: 'this' } }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'damage') })] },
  'Cyber Laser Dragon': { noNormal: true, effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Destroy a monster', targets: [{ f: { ...FU, fn: (d, c, _p, src) => !!src && (d.atk(c) >= d.atk(src) || d.defv(c) >= d.atk(src)) } }] })] },
  'Cyber Ogre': {
    effects: [quick(run(({ d, p, link }) => {
      const ev = attackOf(link.ev);
      const ogre = ev && [ev.attacker, ev.target].find((m) => m && m.ctrl === p && m.def.name === 'Cyber Ogre');
      if (!ogre) return;
      d.attackNegated = true;
      d.addMod(ogre, 2000, 0, -1);
      ogre.data.ogreBoost = true;
    }, (d, me, _c, ev) => threat(d, me, ev)), { from: ['hand'], label: 'Discard: negate the battle', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], when: (_d, ev, p) => ev.e === 'attack' && [ev.attacker, ev.target].some((m) => m && m.ctrl === p && m.faceUp && m.def.name === 'Cyber Ogre') })],
  },
  'Cyber Ogre 2': { statFn: (d, c) => (d.battle?.att === c && d.battle.tgt ? { atk: Math.floor(d.atk(d.battle.tgt) / 2) } : undefined) },
  'Cyber Ouroboros': { effects: [trig('banished', run(async ({ d, p }) => { const c = await pick(d, p, 'Send a card from your hand to the Graveyard', d.players[p].hand, 'cost'); if (c) { await d.move(c, 'gy', { by: p, why: 'cost' }); await d.draw(p, 1); } }), { optional: true, from: ['banished'], cond: (d, c) => d.players[c.owner].hand.length > 0 })] },
  'Cyber Phoenix': {
    effects: [trig('battleDestroyed', { op: 'draw', who: 'self', n: 1 }, { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' && !!c.mark.lastFaceUp })],
    protect: (d, src, target, by) => src.pos === 'atk' && target.ctrl === src.ctrl && target.zone === 'mzone' && d.raceOf(target) === 'Machine' && by.def.kind !== 'monster',
  },
  'Cyber Prima': { effects: [trig('normalSummoned', destroyAll({ side: 'any', zone: ['szone', 'fzone'], faceUp: true, kind: 'spell' }), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })] },
  'Cyber Raider': {
    effects: [trig('summoned', run(async ({ d, p, card }) => {
      const eqs = [...d.spellTraps(0), ...d.spellTraps(1)].filter((c) => c.equipTo !== undefined);
      const e = await pick(d, p, 'Select an Equip Card', eqs, 'bad');
      if (!e) return;
      if (e.ctrl === p || (await d.option(p, 'Cyber Raider', ['Destroy it', 'Equip it to Cyber Raider'], 1)) === 0) await d.destroy(e, 'effect', undefined, p);
      else await d.equipCard(e, card, undefined, e.ctrl);
    }), { cond: (d) => [...d.spellTraps(0), ...d.spellTraps(1)].some((c) => c.equipTo !== undefined) })],
  },
  'Cyber Tutu': { ruleIf: { direct: (d, c) => d.monsters(opp(c.ctrl)).length > 0 && d.monsters(opp(c.ctrl)).every((m) => (m.faceUp ? d.atk(m) : m.def.atk ?? 0) > d.atk(c)) } },
  'Cyber Twin Dragon': { rules: ['doubleAttack'] },
  'Cyber Valley': {
    effects: [
      quick([{ op: 'banish', s: { t: 'this' } }, { op: 'draw', who: 'self', n: 1 }, { op: 'negateAttack', endBattle: true }], { label: 'Banish: draw 1 and end the Battle Phase', when: (_d, ev, p, card) => isAttackOn(ev, p) && ev.target === card, ai: 800 }),
      ign([{ op: 'banish', s: { t: 'this' } }, { op: 'banish', s: { t: 'target' } }, { op: 'draw', who: 'self', n: 2 }], { label: 'Banish with a monster: draw 2', targets: [{ f: { ...OWN_FU, notThis: true }, good: true }], ai: 400 }),
      ign([{ op: 'banish', s: { t: 'this' } }, run(async ({ d, p }) => {
        const h = await pick(d, p, 'Banish a card from your hand', d.players[p].hand, 'cost');
        if (h) await d.banish(h, p);
        const g = await pick(d, p, 'Place a card from your Graveyard on top of your Deck', d.players[p].gy, 'good');
        if (g) await d.move(g, 'deck');
      })], { label: 'Banish with a hand card: recycle a card', req: [{ f: { side: 'self', zone: 'hand' } }, { f: { side: 'self', zone: 'gy' } }], ai: 100 }),
    ],
  },
  'Cyberdark Dragon': merge(cyberdark(12, ['specialSummoned']), { statFn: (d, c) => { const e = d.equipsOf(c).find((x) => x.uid === c.data.cdEq); return { atk: (e ? e.def.atk ?? 0 : 0) + 100 * d.players[c.ctrl].gy.filter((x) => x.def.kind === 'monster').length }; } }),
  'Cyberdark Edge': merge(cyberdark(3, ['normalSummoned']), { rules: ['direct'], battleDmg: (d, self, other, n, to) => (!other && to !== self.ctrl && d.monsters(to).length > 0 ? Math.floor(n / 2) : n) }),
  'Cyberdark Horn': merge(cyberdark(3, ['normalSummoned']), { rules: ['pierce'] }),
  'Cyberdark Keel': merge(cyberdark(3, ['normalSummoned']), { effects: [trig('destroysByBattle', { op: 'damage', who: 'opp', n: 300 })] }),
  'Cybernetic Cyclopean': { statFn: (d, c) => (d.players[c.ctrl].hand.length === 0 ? { atk: 1000 } : undefined) },
  'Cybernetic Magician': { effects: [ign(run(({ d, t }) => { const c = t[0]; if (c) d.addMod(c, 2000 - d.atk(c), 0); }, 300), { label: 'Discard: a monster\'s ATK becomes 2000', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: FU }] })] },
  'Cú Chulainn the Awakened': {
    effects: [ign(run(async ({ d, p, card }) => {
      const c = await pick(d, p, 'Banish a Normal Monster', d.find({ ...GY_M('self'), mtype: ['normal'] }, p), 'cost');
      if (!c) return;
      await d.banish(c, p);
      d.addMod(card, c.def.atk ?? 0, 0, d.turn + 1);
    }, 700), { opt: true, label: 'Banish a Normal Monster: gain its ATK', req: [{ f: { ...GY_M('self'), mtype: ['normal'] } }] })],
  },
  'D.3.S. Frog': { statFn: (d, c) => ({ atk: 500 * d.players[c.ctrl].gy.filter((x) => x.def.name === 'Treeborn Frog').length }) },
  'D.D. Assailant': { effects: [trig('battleDestroyed', run(async ({ d, p, card, link }) => { const o = link.trig?.other; if (o && d.onField(o)) await d.banish(o, p); if (card.zone === 'gy') await d.banish(card, p); }), { from: ['gy'] })] },
  'D.D. Crazy Beast': banishVictims,
  'D.D. Crow': { effects: [quick({ op: 'banish', s: { t: 'target' } }, { from: ['hand'], label: 'Discard: banish a card from the opponent\'s Graveyard', targets: [{ f: { side: 'opp', zone: 'gy' } }], cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], ai: 200 })] },
  'D.D. Guide': {
    effects: [
      trig('normalSummoned', run(({ d, o, card }) => d.takeControl(card, o, true))),
      trig('endPhase', run(async ({ d, card }) => { const s = card.ctrl; const c = await pick(d, opp(s), 'Banish a card from that Graveyard', d.players[s].gy, 'bad'); if (c) await d.banish(c, opp(s)); }), { cond: (d, c) => d.players[c.ctrl].gy.length > 0 }),
    ],
  },
  'D.D. Scout Plane': {
    effects: [trig('banished', run(({ d, card }) => {
      const mv = card.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'banished' && d.canSpecial(card.owner, card)) await d.specialSummon(card, card.owner, 'atk'); } });
    }), { from: ['banished'] })],
  },
  'D.D. Survivor': {
    effects: [trig('banished', run(({ d, card }) => {
      const mv = card.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'banished' && d.canSpecial(card.owner, card)) await d.specialSummon(card, card.owner, await d.askPos(card.owner, card)); } });
    }), { from: ['banished'], cond: (_d, c) => c.mark.from === 'mzone' && !!c.mark.lastFaceUp })],
  },
  'D.D. Warrior Lady': {
    postBattle: async (d, self, o) => {
      if (!o || o.ctrl === self.ctrl || !(await d.confirm(self.ctrl, 'Banish the opponent\'s monster and D.D. Warrior Lady?', self))) return;
      if (d.onField(o) || o.zone === 'gy') await d.banish(o, self.ctrl);
      if (d.onField(self) || self.zone === 'gy') await d.banish(self, self.ctrl);
    },
  },
  'D.D.M. - Different Dimension Master': {
    effects: [ign(ssFrom(['banished']), { opt: true, label: 'Discard a Spell: Special Summon a banished monster', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'spell' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'spell' } }, { f: { side: 'self', zone: 'banished', kind: 'monster' } }] })],
  },
  'Dandylion': { effects: [trig('toGY', run(({ d, p }) => tokens(d, p, tokenDef('Fluffy Token', 'Plant', 'WIND', 1, 0, 0), 2, 'def')), { from: ['gy'] })] },
  'Dark Armed Dragon': {
    noNormal: true,
    ssProc: { cond: (d, p) => d.players[p].gy.filter((c) => c.def.kind === 'monster' && c.def.attr === 'DARK').length === 3 },
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Banish a DARK monster: destroy a card', targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }], cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK' } } }], req: [{ f: { ...GY_M('self'), attr: 'DARK' } }] })],
  },
  'Dark Balter the Terrible': {
    postBattle: dlBanish,
    effects: [quick({ op: 'negate', effectOnly: true }, { label: 'Pay 1000 LP: negate a Normal Spell', cost: [{ op: 'payLP', n: 1000 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'spell' && ev.link.card.def.stype === 'normal', ai: 600 })],
  },
  'Dark Blade the Dragon Knight': {
    effects: [trig('battleDamage', run(async ({ d, p, o }) => { for (const c of await d.select(p, 'Banish up to 3 monsters', d.players[o].gy.filter((x) => x.def.kind === 'monster'), 0, 3, 'bad')) await d.banish(c, p); }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && d.players[opp(c.ctrl)].gy.some((x) => x.def.kind === 'monster') })],
  },
  'Dark Cat with White Tail': {
    effects: [flip(run(async ({ d, p, o }) => {
      const theirs = await d.select(p, 'Return 2 opponent monsters', d.monsters(o), Math.min(2, d.monsters(o).length), 2, 'bad');
      const mine = await pick(d, p, 'Return 1 of your monsters', d.monsters(p), 'cost');
      for (const c of [...theirs, ...(mine ? [mine] : [])]) await d.toHand(c);
    }, 800))],
  },
  'Dark Catapulter': {
    effects: [
      trig('standby', run(({ d, card }) => { addCtr(d, card, 1, 'cat'); }), { cond: (_d, c) => c.zone === 'mzone' && c.pos === 'def' }),
      ign(run(async ({ d, p, card }) => {
        const n = ctr(card, 'cat');
        const gy = await d.select(p, `Banish ${n} cards from your Graveyard`, d.players[p].gy, n, n, 'cost');
        for (const c of gy) await d.banish(c, p);
        for (const c of await d.select(p, `Destroy up to ${gy.length} Spell/Trap Cards`, d.find(ST, p), 0, gy.length, 'bad')) await d.destroy(c, 'effect', undefined, p);
        removeCtr(d, card, n, 'cat');
      }, 600), { label: 'Banish cards: destroy Spells/Traps', cond: (d, c) => ctr(c, 'cat') > 0 && d.players[c.ctrl].gy.length >= ctr(c, 'cat') }),
    ],
  },
  'Dark Crusader': { effects: [ign({ op: 'stat', s: { t: 'this' }, atk: 400, perm: true }, { label: 'Send a DARK monster: +400 ATK', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK' } }], ai: -1 })] },
  'Dark Driceratops': { rules: ['pierce'] },
  'Dark Dust Spirit': spirit(trig(['normalSummoned', 'flipSummoned'], destroyAll({ ...FU, notThis: true }))),
  'Dark Effigy': {},
  'Dark Eradicator Warlock': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Dark Magician' } } }], req: [{ f: { ...OWN_M, name: 'Dark Magician' } }] },
    onResolve: async (d, src, link) => { if (link.isCard && link.card.def.kind === 'spell' && link.card.def.stype === 'normal') await d.damage(opp(src.ctrl), 1000, src); },
  },
  'Dark Flare Knight': {
    battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n),
    effects: [trig('battleDestroyed', ssFrom(['hand', 'deck'], { name: 'Mirage Knight' }, { ignore: true }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Dark Grepher': {
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK', minLv: 5 } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK', minLv: 5 } }] },
    effects: [ign({ op: 'toGY', s: { t: 'choose', f: DECK({ kind: 'monster', attr: 'DARK' }) } }, { opt: true, label: 'Discard a DARK monster: send a DARK monster from the Deck', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK' } }, { f: DECK({ kind: 'monster', attr: 'DARK' }) }] })],
  },
  'Dark Horus': {
    effects: [quick(ssFrom(['gy'], { attr: 'DARK', minLv: 4, maxLv: 4 }), { opt: true, label: 'Special Summon a Level 4 DARK monster', when: (d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'spell' && (d.phase === 'M1' || d.phase === 'M2'), req: [{ f: { ...GY_M('self'), attr: 'DARK', minLv: 4, maxLv: 4 } }] })],
  },
  'Dark Jeroid': { effects: [trig('summoned', run(({ d, card, t }) => { if (t[0]) { card.data.jeroid = t[0].uid; d.addMod(t[0], -800, 0, -1); } }), { targets: [{ f: FU }] })] },
  'Dark Lucius LV4': merge(markKill, { postBattle: dlBanish, effects: [trig('standby', run(async ({ d, p, card }) => { await d.move(card, 'gy', { why: 'cost' }); await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Dark Lucius LV6' }, p), 'Special Summon Dark Lucius LV6', undefined, true, card); }), { optional: true, cond: (d, c) => c.zone === 'mzone' && c.data.killTurn !== undefined && c.data.killTurn < d.turn })] }),
  'Dark Lucius LV6': merge(markKill, {
    postBattle: async (d, self, o, r) => { if (self.data.ssBy === 'Dark Lucius LV4' && o && won(self, r)) { await dlBanish!(d, self, o, r); self.data.killTurn = d.turn; } },
    effects: [lvUp('Dark Lucius LV8', 'standby', (d, c) => c.data.killTurn !== undefined && c.data.killTurn < d.turn)],
  }),
  'Dark Lucius LV8': { postBattle: async (d, self, o, r) => { if (self.data.ssBy === 'Dark Lucius LV6' && o && won(self, r) && o.zone === 'gy') await d.banish(o, self.ctrl); } },
  'Dark Magician Knight': { noNormal: true, effects: [trig('specialSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }] })] },
  'Dark Magician of Chaos': merge(banishVictims, {
    effects: [
      trig(['normalSummoned', 'specialSummoned'], { op: 'toHand', s: { t: 'target' } }, { optional: true, targets: [{ f: { side: 'self', zone: 'gy', kind: 'spell' }, good: true }] }),
      trig('leftField', run(async ({ d, card }) => { if (card.zone !== 'banished') await d.banish(card, card.owner); }), { from: ['gy', 'hand', 'deck', 'extra'], cond: (_d, c) => !!c.mark.lastFaceUp }),
    ],
  }),
};
void OWN_M; void has; void tributed; void search;
