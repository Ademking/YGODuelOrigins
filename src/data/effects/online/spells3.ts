// YGO Online Spells, part 3 (Guard Penalty … Reinforcement of the Army).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OPP_ST, OWN_FU, OWN_M, ST,
  act, addCtr, addFrom, atEndPhase, both, canFuse, condSpell, crystalInST, ctr, destroyAll, destroyAtEnd, fuse,
  grantRule, has, hasSet, ign, opp, passive, pick, pickSeen, quick, randomOf, removeCtr, ritual, run, scoreWipe,
  search, spell, ssFrom, ssPick, tokenDef, tokens, trig, isAlien, killEquippedOnLeave,
} from './olib';

const LV = / LV(\d+)$/;
const lvBase = (name: string) => name.replace(LV, '');
const lvNum = (name: string) => Number(name.match(LV)?.[1] ?? 0);
const isLV = (c: Card) => LV.test(c.def.name);
const neosFusion = (c: Card) => c.def.mtype === 'fusion' && /"Elemental Hero Neos"/.test(c.def.text);
const fusionFrom = (o: Parameters<typeof fuse>[3], ai = 1500): Def => spell(run(async ({ d, p, card }) => { await fuse(d, p, card, o); }, ai, (d, p, card) => canFuse(d, p, card, o)));
const fieldOrGY = (d: Duel) => (s: Side) => [...d.monsters(s), ...d.players[s].gy];
const monk = ['Chu-Ske the Mouse Fighter', 'Monk Fighter', 'Master Monk'];
const normalSummonable = (c: Card) => c.def.kind === 'monster' && (c.def.mtype === 'normal' || c.def.mtype === 'effect') && !c.def.noNormal && !c.token;

/** Excavate the top of the Deck until a Normal-Summonable monster; returns [monster, others]. */
function excavate(d: Duel, p: Side): [Card | undefined, Card[]] {
  const deck = d.players[p].deck;
  const others: Card[] = [];
  for (let i = deck.length - 1; i >= 0; i--) { const c = deck[i]; if (normalSummonable(c)) return [c, others]; others.push(c); }
  return [undefined, others];
}

export const SPELLS_3: Record<string, Def> = {
  'Guard Penalty': spell(run(({ d, p, t }) => {
    const c = t[0];
    if (!c) return;
    const mv = c.mv, wasDef = c.pos === 'def';
    d.schedule({ at: 'EP', turn: d.turn, fn: () => (c.mv === mv && c.pos === 'def' && !wasDef ? d.draw(p, 1) : undefined) });
  }, 100), { targets: [{ f: M }] }),
  'H - Heated Heart': spell(run(({ d, t }) => { const c = t[0]; if (c && c.zone === 'mzone') { d.addMod(c, 500, 0); grantRule(d, c, 'pierce'); } }, 600), { targets: [{ f: OWN_FU, good: true }] }),
  'Hammer Shot': spell(run(async ({ d, p }) => {
    const cands = both(d).filter((c) => c.faceUp && c.pos === 'atk');
    const top = Math.max(...cands.map((c) => d.atk(c)));
    const c = await pick(d, p, 'Destroy the highest ATK monster', cands.filter((x) => d.atk(x) === top), 'bad');
    if (c) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => { const cs = both(d).filter((c) => c.faceUp && c.pos === 'atk'); const top = Math.max(-1, ...cs.map((c) => d.atk(c))); return cs.some((c) => d.atk(c) === top && c.ctrl !== me) && !cs.some((c) => d.atk(c) === top && c.ctrl === me) ? top : -1; }),
  { req: [{ f: { ...FU, pos: 'atk' } }] }),
  'Hand Destruction': spell(run(async ({ d, p, o }) => {
    for (const s of [p, o]) { const cs = await d.select(s, 'Send 2 cards to the Graveyard', d.players[s].hand, Math.min(2, d.players[s].hand.length), Math.min(2, d.players[s].hand.length), 'cost'); for (const c of cs) await d.move(c, 'gy', { by: p }); }
    await d.draw(p, 2);
    await d.draw(o, 2);
  }, 100), { req: [{ f: { side: 'self', zone: 'hand', notThis: true }, n: 2 }, { f: { side: 'opp', zone: 'hand' }, n: 2 }] }),
  "Harpies' Hunting Ground": {
    aura: [{ f: { ...M, race: ['Winged Beast'] }, atk: 200, def: 200 }],
    onSummon: async (d, src, c, how) => {
      if (how === 'flip' || !['Harpie Lady', 'Harpie Lady Sisters'].includes(d.nameOf(c))) return;
      const t = await pick(d, c.ctrl, 'Destroy a Spell or Trap Card', d.find({ ...ST, notThis: false }, c.ctrl), 'bad');
      if (t) await d.destroy(t, 'effect', undefined, c.ctrl);
    },
  },
  'Heart of Clear Water': {
    equip: { f: { ...FU, maxAtk: 1299 }, rules: ['battleImmune'] },
    selfDestructIf: (d, c) => { const m = d.equippedTo(c); return !!m && d.atk(m) >= 1300; },
    lock: { indestructible: (d, src, c, by) => !!src && by === 'effect' && d.equippedTo(src) === c && !!d.chain.length && d.chain[d.chain.length - 1].targets.flat().includes(c) },
  },
  'Heart of the Underdog': passive({
    effects: [trig('anyDraw', run(async ({ d, p }) => {
      const c = d.players[p].hand[d.players[p].hand.length - 1];
      if (!c || c.def.kind !== 'monster' || c.def.mtype !== 'normal') return;
      await d.reveal(opp(p), [c], 'Heart of the Underdog');
      await d.draw(p, 1);
    }, 300), { optional: true, cond: (d, card, _p, ev) => ev?.e === 'draw' && ev.dp && ev.player === card.ctrl && d.phase === 'DP' && d.players[card.ctrl].hand[d.players[card.ctrl].hand.length - 1]?.def.mtype === 'normal' })],
  }),
  'HERO Flash!!': spell(run(async ({ d, p, card }) => {
    const c = await ssPick(d, p, d.find(DECK({ set: 'Elemental Hero', mtype: ['normal'] }), p), 'Special Summon an Elemental Hero Normal Monster', undefined, false, card);
    void c;
    for (const m of d.find({ ...OWN_FU, set: 'Elemental Hero', mtype: ['normal'] }, p)) grantRule(d, m, 'direct');
  }, 1500), {
    cost: [run(async ({ d, p }) => { for (const n of ['H - Heated Heart', 'E - Emergency Call', 'R - Righteous Justice', 'O - Oversoul']) { const c = d.players[p].gy.find((x) => x.def.name === n); if (c) await d.banish(c, p); } })],
    cond: (d, _c, p) => ['H - Heated Heart', 'E - Emergency Call', 'R - Righteous Justice', 'O - Oversoul'].every((n) => d.players[p].gy.some((x) => x.def.name === n)),
  }),
  'Hero Heart': spell(run(({ d, t }) => { const c = t[0]; if (c && c.zone === 'mzone') { d.addMod(c, -Math.ceil(d.atk(c) / 2), 0); c.data.extraAtk = d.turn; } }, (d) => (d.phase === 'M1' ? 300 : -1)), { targets: [{ f: { ...OWN_FU, set: 'Elemental Hero' }, good: true }] }),
  'Hero Mask': spell(run(async ({ d, p, t }) => {
    const m = t[0];
    const h = await pick(d, p, 'Send an Elemental Hero from your Deck to the Graveyard', d.find(DECK({ kind: 'monster', set: 'Elemental Hero' }), p), 'cost');
    if (!h) return;
    await d.move(h, 'gy', { by: p });
    await d.shuffleDeck(p);
    if (m && m.zone === 'mzone') { m.data.nameAs = { name: h.def.name, turn: d.turn }; d.log(`${m.def.name} is treated as "${h.def.name}".`); }
  }, 200), { targets: [{ f: OWN_FU, good: true }], req: [{ f: DECK({ kind: 'monster', set: 'Elemental Hero' }) }] }),
  "Hero's Bond": spell(ssFrom(['hand'], { set: 'Elemental Hero', maxLv: 4 }, { n: 2 }), {
    cond: (d, _c, p) => both(d).some((c) => c.faceUp && /Elemental Hero|Destiny Hero|Evil Hero/.test(c.def.name)) && d.freeCount(p, 'm') >= 2 && d.find({ side: 'self', zone: 'hand', set: 'Elemental Hero', maxLv: 4 }, p).length >= 2,
  }),
  'Hieroglyph Lithograph': spell(run(({ d, p }) => { d.flags[`handLimit:${p}`] = 7; d.log(`${d.name(p)}'s hand size limit becomes 7.`); }, -1), { cost: [{ op: 'payLP', n: 1000 }] }),
  'Impenetrable Formation': passive({
    auraFn: (d, src, c) => (c.uid === src.data.sel && d.monsters(src.ctrl).length >= 2 && d.monsters(src.ctrl).every((m) => m.pos === 'def') ? { def: 700 } : undefined),
    selfDestructIf: (d, c) => c.data.sel !== undefined && !d.monsters(0).concat(d.monsters(1)).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  }, { targets: [{ f: OWN_M, good: true }], ops: [run(({ card, t }) => { if (t[0]) { card.data.sel = t[0].uid; card.data.selMv = t[0].mv; } }, 200)] }),
  'Incandescent Ordeal': ritual('Legendary Flame Lord'),
  'Inferno Fire Blast': spell(run(async ({ d, p, o }) => {
    const c = await pick(d, p, 'Select Red-Eyes B. Dragon', d.find({ ...OWN_FU, name: 'Red-Eyes B. Dragon' }, p), 'good');
    if (!c) return;
    await d.damage(o, c.def.atk ?? 0);
    c.noAttackTurn = d.turn;
  }, 2000), { req: [{ f: { ...OWN_FU, name: 'Red-Eyes B. Dragon' } }] }),
  'Inferno Reckless Summon': spell(run(async ({ d, p, o, link }) => {
    const ev = link.ev;
    const m = ev.e === 'summon' ? ev.cards[0] : undefined;
    if (!m) return;
    for (const c of d.find({ side: 'self', zone: ['hand', 'deck', 'gy'], name: m.def.name }, p)) { if (!d.canSpecial(p, c)) break; await d.specialSummon(c, p, 'atk'); }
    await d.shuffleDeck(p);
    const x = await pick(d, o, 'Select one of your monsters', d.find(OWN_FU, o), 'good');
    if (x) { for (const c of d.find({ side: 'self', zone: ['hand', 'deck', 'gy'], name: x.def.name }, o)) { if (!d.canSpecial(o, c)) break; await d.specialSummon(c, o, 'atk'); } await d.shuffleDeck(o); }
  }, 1000), {
    when: (d, ev, p) => ev.e === 'summon' && ev.player === p && ev.how !== 'normal' && ev.how !== 'flip' && ev.cards.length === 1 && d.atk(ev.cards[0]) <= 1500 && d.find(OPP_FU, p).length > 0,
  }),
  'Inferno Tempest': spell(run(async ({ d, p }) => {
    for (const s of [0, 1] as Side[]) for (const c of [...d.players[s].deck, ...d.players[s].gy].filter((x) => x.def.kind === 'monster')) await d.banish(c, p);
    await d.shuffleDeck(0); await d.shuffleDeck(1);
  }, 500), { when: (_d, ev, p) => ev.e === 'damage' && ev.battle && ev.player === p && ev.n >= 3000 }),
  'Instant Fusion': spell(run(async ({ d, p, card }) => {
    d.flags[`instantFusion:${p}`] = d.turn;
    const f = await pick(d, p, 'Special Summon a Level 5 or lower Fusion Monster', d.players[p].extra.filter((c) => (c.def.lv ?? 0) <= 5 && d.canSpecial(p, c) && !c.def.text.includes('"Dark Fusion"')), 'good');
    if (!f || !(await d.specialSummon(f, p, await d.askPos(p, f), 'fusion', false, card))) return;
    f.noAttackTurn = d.turn;
    destroyAtEnd(d, f, p);
  }, 400), { cost: [{ op: 'payLP', n: 1000 }], cond: (d, _c, p) => d.flags[`instantFusion:${p}`] !== d.turn && d.players[p].extra.some((c) => (c.def.lv ?? 0) <= 5) && d.canSpecial(p) }),
  'Instant Neo Space': {
    equip: { f: { ...FU, fn: (_d, c) => neosFusion(c) } },
    effects: [trig('leftField', ssFrom(['hand', 'deck', 'gy'], { name: 'Elemental Hero Neos' }), { optional: true, cond: (_d, c) => c.last.eqTo !== undefined })],
  },
  'Jade Insect Whistle': spell(run(async ({ d, o }) => {
    const c = await pick(d, o, 'Place an Insect monster on top of your Deck', d.find(DECK({ kind: 'monster', race: ['Insect'] }), o), 'cost');
    await d.shuffleDeck(o);
    if (c) { const deck = d.players[o].deck; deck.splice(deck.indexOf(c), 1); deck.push(c); d.log('A card is placed on top of the Deck.'); }
  }, 100)),
  'Jar Robber': spell([{ op: 'negate', effectOnly: true }, { op: 'draw', who: 'self', n: 1 }], { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.card.def.name === 'Pot of Greed' }),
  'Jurassic World': { aura: [{ f: { ...M, race: ['Dinosaur'] }, atk: 300, def: 300 }] },
  'Kaiser Colosseum': passive({
    lock: { summon: (d, src, p) => !!src && p !== src.ctrl && d.monsters(src.ctrl).length > 0 && d.monsters(p).length >= d.monsters(src.ctrl).length },
  }),
  'Kaminote Blow': condSpell((d, p) => d.find({ ...OWN_FU, name: monk }, p).length > 0, run(({ d, p }) => d.addTemp({ until: d.turn, p, afterBattle: async (dd, r) => {
    for (const [mine, foe] of [[r.att, r.tgt], [r.tgt, r.att]] as [Card | null, Card | null][]) if (mine && foe && mine.ctrl === p && monk.includes(mine.def.name) && foe.zone === 'mzone') await dd.destroy(foe, 'effect', undefined, p);
  } }), 400)),
  'Kishido Spirit': passive({
    lock: { indestructible: (d, src, c, by) => !!src && by === 'battle' && c.ctrl === src.ctrl && !!d.battle && !!d.battle.tgt && d.battle.tgt.pos === 'atk' && d.atk(d.battle.att) === d.atk(d.battle.tgt) },
  }),
  "Knight's Title": spell(ssFrom(['hand', 'deck', 'gy'], { name: 'Dark Magician Knight' }, { ignore: true }), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Dark Magician' } } }], req: [{ f: { side: 'self', zone: ['hand', 'deck', 'gy'], name: 'Dark Magician Knight' } }],
  }),
  'Legendary Black Belt': {
    equip: { f: { ...FU, name: monk } },
    postBattle: async (d, self, o, r) => { if (o && o.zone === 'gy' && ((r.att === self && r.killedT) || (r.tgt === self && r.killedA))) await d.damage(opp(self.ctrl), o.def.def ?? 0); },
  },
  'Legendary Ebon Steed': { equip: { f: { ...FU, set: 'Six Samurai' }, atk: 200, def: 200, sub: true } },
  'Level Down!?': spell(run(async ({ d, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone') return;
    const owner = c.owner, base = lvBase(c.def.name), n = lvNum(c.def.name);
    await d.move(c, 'deck');
    await d.shuffleDeck(owner);
    await ssPick(d, owner, d.players[owner].gy.filter((x) => isLV(x) && lvBase(x.def.name) === base && lvNum(x.def.name) < n), 'Special Summon a lower LV monster', undefined, true);
  }, 300), { targets: [{ f: { ...FU, fn: (_d, c) => isLV(c) } }] }),
  'Level Limit - Area B': passive({
    lock: { pos: (d, _s, c) => c.faceUp && d.lvOf(c) >= 4 && c.pos === 'def' },
    onSummon: async (d, _src, c) => { if (c.faceUp && d.lvOf(c) >= 4 && c.pos === 'atk') await d.changePos(c, 'def'); },
  }, { ops: [run(async ({ d }) => { for (const c of both(d)) if (c.faceUp && d.lvOf(c) >= 4 && c.pos === 'atk') await d.changePos(c, 'def'); }, (d, me) => d.monsters(opp(me)).filter((c) => c.faceUp && (c.def.lv ?? 0) >= 4 && c.pos === 'atk').length * 400)] }),
  'Level Modulation': spell(run(async ({ d, p, o, card }) => {
    await d.draw(o, 2);
    const c = await ssPick(d, p, d.players[p].gy.filter(isLV), 'Special Summon an LV monster', undefined, true, card);
    if (!c) return;
    c.noAttackTurn = d.turn;
    const mv = c.mv;
    d.addTemp({ until: d.turn, negate: (_d, x) => x === c && x.mv === mv });
  }, 300), { req: [{ f: { side: 'self', zone: 'gy', fn: (_d, c) => isLV(c) } }] }),
  'Level Tuning': spell(run(({ d, p }) => { const ids = d.monsters(p).filter((c) => c.faceUp).map((c) => c.uid); d.addTemp({ until: d.turn, lv: (_d, c) => (ids.includes(c.uid) && c.zone === 'mzone' ? -1 : 0) }); }, -1), { req: [{ f: OWN_FU }] }),
  'Level Up!': spell(run(async ({ d, p, card, link }) => {
    const names = (link.data.names as string[]) ?? [];
    await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: names }, p), 'Special Summon the next LV monster', undefined, true, card);
  }, 1500), {
    cost: [run(async ({ d, p, link }) => {
      const c = await pick(d, p, 'Send an LV monster to the Graveyard', d.find({ ...OWN_FU, fn: (_d, x) => isLV(x) }, p), 'cost');
      if (!c) return;
      link.data.names = [...c.def.text.matchAll(/"([^"]+ LV\d+)"/g)].map((m) => m[1]).filter((n) => lvBase(n) === lvBase(c.def.name) && lvNum(n) > lvNum(c.def.name));
      await d.move(c, 'gy', { by: p, why: 'cost' });
    }, 0, (d, p) => d.find({ ...OWN_FU, fn: (_d, x) => isLV(x) }, p).some((c) => d.find({ side: 'self', zone: ['hand', 'deck'], name: [...c.def.text.matchAll(/"([^"]+ LV\d+)"/g)].map((m) => m[1]).filter((n) => lvNum(n) > lvNum(c.def.name)) }, p).length > 0))],
  }),
  'Light Barrier': passive({
    effects: [trig('standby', run(async ({ d, card }) => { card.data.lb = (await d.tossCoins(1))[0]; }), { cond: (d, c) => d.onField(c) })],
    afterBattle: async (d, src, r) => {
      if (src.data.lb === false) return;
      for (const [m, o, k] of [[r.att, r.tgt, r.killedT], [r.tgt, r.att, r.killedA]] as [Card | null, Card | null, boolean][]) if (m && o && k && m.ctrl === src.ctrl && m.def.name.includes('Arcana Force')) await d.heal(src.ctrl, o.def.atk ?? 0);
    },
  }, { ops: [run(({ card }) => { card.data.lb = true; })] }),
  'Light Laser': {
    equip: { f: { ...FU, attr: 'LIGHT', race: ['Warrior'] } },
    postBattle: async (d, self, o) => { if (o && o.zone === 'mzone') await d.banish(o, self.ctrl); },
  },
  'Light of Redemption': spell(run(async ({ d, p }) => { const c = await pick(d, p, 'Add a banished LIGHT monster', d.find({ side: 'self', zone: 'banished', kind: 'monster', attr: 'LIGHT' }, p), 'good'); if (c) await d.toHand(c); }, 500), {
    cost: [{ op: 'payLP', n: 800 }], req: [{ f: { side: 'self', zone: 'banished', kind: 'monster', attr: 'LIGHT' } }],
  }),
  'Lighten the Load': passive({
    effects: [ign(run(async ({ d, p }) => {
      const c = await pick(d, p, 'Shuffle a Level 7+ monster into your Deck', d.players[p].hand.filter((x) => x.def.kind === 'monster' && (x.def.lv ?? 0) >= 7), 'cost');
      if (!c) return;
      await d.move(c, 'deck');
      await d.shuffleDeck(p);
      await d.draw(p, 1);
    }, 200), { label: 'Shuffle a Level 7+ monster: draw 1', opt: true, req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', minLv: 7 } }] })],
  }),
  'Lightning Vortex': spell(destroyAll(OPP_FU), { cost: [{ op: 'discard', who: 'self', n: 1 }], ai: (d, me) => scoreWipe(d, me, (c) => c.ctrl !== me) - 600, req: [{ f: OPP_FU }] }),
  'Linear Accelerator Cannon': spell(run(async ({ d, p, o, link }) => {
    await d.damage(o, Math.floor((link.data.atk ?? 0) / 2));
    d.addTemp({ until: d.turn, p, lock: { activate: (_d, _s, q, c) => q === p && c.def.kind === 'spell' } });
  }, 800), { cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost'); if (c) { link.data.atk = c.def.atk ?? 0; await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p) => d.monsters(p).some((m) => d.tributeOk(m)))] }),
  'Lucky Cloud': spell(run(({ d, p }) => {
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => {
      const names = d.monsters(p).filter((c) => c.data.sumTurn === d.turn && c.def.name.includes('Cloudian')).map((c) => c.def.name);
      if (names.some((n) => names.filter((x) => x === n).length >= 2)) await d.draw(p, 2);
    } });
  }, 200)),
  'Lucky Iron Axe': {
    equip: { f: FU, atk: 500 },
    effects: [trig('destroyed', { op: 'draw', who: 'self', n: 1 }, { from: ['gy'], cond: (_d, c) => c.mark.destroyedBy !== undefined && c.mark.destroyedBy !== c.owner && c.mark.destroyedHow === 'effect' && c.mark.lastFaceUp })],
  },
  'Machine Duplication': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c) return;
    const cs = await d.select(p, `Special Summon up to 2 "${c.def.name}"`, d.find(DECK({ name: c.def.name }), p).filter((x) => d.canSpecial(p, x)), 0, Math.min(2, d.freeCount(p, 'm')), 'good');
    for (const x of cs) await d.specialSummon(x, p, await d.askPos(p, x));
    await d.shuffleDeck(p);
  }, 700), { targets: [{ f: { ...OWN_FU, race: ['Machine'], maxAtk: 500 }, good: true }] }),
  'Magic Formula': {
    equip: { f: { ...FU, name: ['Dark Magician', 'Dark Magician Girl'] }, atk: 700 },
    effects: [trig('fieldToGY', { op: 'heal', who: 'self', n: 1000 }, { from: ['gy'] })],
  },
  'Magic Reflector': spell(run(({ d, t }) => { if (t[0]) addCtr(d, t[0], 1, 'reflect'); }, 200), { targets: [{ f: { side: 'any', zone: ['szone', 'fzone'], faceUp: true, kind: 'spell', notThis: true }, good: true }] }),
  'Magical Blast': {
    effects: [
      act({ ops: [run(({ d, p, o }) => d.damage(o, 200 * d.find({ ...OWN_FU, race: ['Spellcaster'] }, p).length), 500)], req: [{ f: { ...OWN_FU, race: ['Spellcaster'] } }] }),
      trig('standby', run(() => {}), { from: ['gy'], cond: () => false }),
    ],
  },
  'Magical Dimension': spell(run(async ({ d, p, card }) => {
    const t = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost');
    if (!t) return;
    await d.move(t, 'gy', { why: 'tribute' });
    if (!(await ssPick(d, p, d.players[p].hand.filter((c) => c.def.race === 'Spellcaster'), 'Special Summon a Spellcaster', undefined, false, card))) return;
    const x = await pick(d, p, 'You can destroy 1 monster', both(d), 'bad', true);
    if (x) await d.destroy(x, 'effect', undefined, p);
  }, 1200), { cond: (d, _c, p) => d.find({ ...OWN_FU, race: ['Spellcaster'] }, p).length > 0 && d.players[p].hand.some((c) => c.def.kind === 'monster' && c.def.race === 'Spellcaster') }),
  'Magical Mallet': spell(run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'Return any number of cards to the Deck', d.players[p].hand.filter((c) => c !== card), 0, 60, 'cost');
    for (const c of cs) await d.move(c, 'deck');
    await d.shuffleDeck(p);
    if (cs.length) await d.draw(p, cs.length);
  }, 100)),
  'Magical Stone Excavation': spell({ op: 'toHand', s: { t: 'target' } }, { cost: [{ op: 'discard', who: 'self', n: 2 }], targets: [{ f: { side: 'self', zone: 'gy', kind: 'spell' }, good: true }] }),
  'Magicians Unite': spell(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Select a Spellcaster', d.find({ ...OWN_FU, race: ['Spellcaster'], pos: 'atk' }, p), 'good');
    if (!c) return;
    d.addMod(c, 3000 - d.atk(c), 0);
    d.addTemp({ until: d.turn, p, lock: { attack: (dd, _s, a) => a.ctrl === p && a !== c && dd.raceOf(a) === 'Spellcaster' } });
  }, 900), { req: [{ f: { ...OWN_FU, race: ['Spellcaster'], pos: 'atk' }, n: 2 }] }),
  'Magnet Circle LV2': spell(ssFrom(['hand'], { race: ['Machine'], maxLv: 2 })),
  'Malice Dispersion': spell(destroyAll({ side: 'any', zone: 'szone', faceUp: true, kind: 'trap', stype: 'continuous' }), { cost: [{ op: 'discard', who: 'self', n: 1 }], ai: (d, me) => d.spellTraps(opp(me)).filter((c) => c.faceUp && c.def.stype === 'continuous' && c.def.kind === 'trap').length * 800 - 500 }),
  'Marshmallon Glasses': passive({
    lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && faceUpMarsh(d, src.ctrl) && (!t || d.nameOf(t) !== 'Marshmallon') },
  }),
  'Mass Driver': passive({ effects: [ign({ op: 'damage', who: 'opp', n: 400 }, { label: 'Tribute 1 monster: 400 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }], ai: -1 })] }),
  'Mausoleum of the Emperor': { lock: { tributeLP: (_d, _s, _p, _c, need) => 1000 * need } },
  'Mega Ton Magical Cannon': spell(run(async ({ d, p, o, card }) => {
    let need = 10;
    for (const c of d.fieldCards(p)) { if (!need) break; need -= removeCtr(d, c, need); }
    for (const c of d.fieldCards(o)) await d.destroy(c, 'effect', undefined, p);
    void card;
  }, (d, me) => d.fieldCards(opp(me)).length * 700), { cond: (d, _c, p) => d.fieldCards(p).reduce((s, c) => s + ctr(c), 0) >= 10 }),
  'Metalsilver Armor': {
    equip: { f: FU },
    protect: (d, src, target, by) => target.zone === 'mzone' && target.ctrl === src.ctrl && d.equippedTo(src) !== target && d.holder(by) !== src.ctrl && !!d.equippedTo(src),
  },
  'Metamorphosis': spell(run(async ({ d, p, card, link }) => {
    const f = await pick(d, p, 'Special Summon a Fusion Monster', d.players[p].extra.filter((c) => c.def.lv === link.data.lv && d.canSpecial(p, c)), 'good');
    if (f) await d.specialSummon(f, p, await d.askPos(p, f), 'fusion', false, card);
  }, 1200), {
    cost: [run(async ({ d, p, link }) => {
      const c = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((m) => d.tributeOk(m) && d.players[p].extra.some((f) => f.def.lv === m.def.lv)), 'cost');
      if (c) { link.data.lv = c.def.lv; await d.move(c, 'gy', { why: 'tribute' }); }
    }, 0, (d, p) => d.monsters(p).some((m) => d.tributeOk(m) && d.players[p].extra.some((f) => f.def.lv === m.def.lv)))],
  }),
  'Meteor of Destruction': spell({ op: 'damage', who: 'opp', n: 1000 }, { cond: (d, _c, p) => d.players[opp(p)].lp > 3000 }),
  'Mind Control': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (c && (await d.takeControl(c, p))) { c.noAttackTurn = d.turn; const mv = c.mv; d.addTemp({ until: d.turn, lock: { tribute: (_d, _s, x) => x === c && x.mv === mv } }); }
  }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => (c.faceUp ? d.atk(c) : 800) - 600))), { targets: [{ f: OPP_M }] }),
  'Mind Wipe': spell(run(async ({ d, o }) => {
    const n = d.players[o].hand.length;
    for (const c of [...d.players[o].hand]) await d.move(c, 'deck');
    await d.shuffleDeck(o);
    await d.draw(o, n);
  }, 100), { cond: (d, _c, p) => d.players[opp(p)].hand.length <= 3 && d.players[opp(p)].hand.length > 0 }),
  'Miracle Fusion': fusionFrom({ f: (f) => f.def.name.includes('Elemental Hero'), pool: (s) => [] as Card[], dest: 'banished' }),
  'Miraculous Rebirth': spell(ssFrom(['gy'], {}, { side: 'any' }), {
    cond: (d, c) => d.chain.length >= 3 && !d.chain.some((l) => l.card.def.name === c.def.name), when: (_d, ev) => ev.e === 'chain',
  }),
  'Mirage of Nightmare': passive({
    effects: [
      trig('oppStandby', run(async ({ d, card }) => { const n = Math.max(0, 4 - d.players[card.ctrl].hand.length); card.data.mirage = n; if (n) await d.draw(card.ctrl, n); }), { cond: (d, c) => d.onField(c) }),
      trig('standby', run(async ({ d, p, card }) => {
        const n = card.data.mirage ?? 0;
        card.data.mirage = 0;
        for (let i = 0; i < n; i++) { const c = randomOf(d, d.players[p].hand); if (c) await d.discard(p, [c], p); }
      }), { cond: (d, c) => d.onField(c) && (c.data.mirage ?? 0) > 0 }),
    ],
  }),
  'Mirage Tube': spell({ op: 'damage', who: 'opp', n: 1000 }, { when: (_d, ev, p) => ev.e === 'attack' && ev.player !== p && !!ev.target && ev.target.faceUp && ev.target.ctrl === p }),
  'Misfortune': spell(run(async ({ d, p, o, t }) => {
    if (t[0]) await d.damage(o, Math.floor((t[0].def.atk ?? 0) / 2));
    d.players[p].noAttackTurn = d.turn;
  }, (d, me) => Math.max(-1, ...d.find(OPP_FU, me).map((c) => (c.def.atk ?? 0) / 2)) - (d.phase === 'M1' ? 600 : 0)), { targets: [{ f: OPP_FU }] }),
  'Mist Body': { equip: { f: FU, rules: ['battleImmune'] } },
  'Mokey Mokey Smackdown': passive({
    effects: [trig('anyToGY', run(({ d, card }) => {
      for (const m of d.find({ ...OWN_FU, name: 'Mokey Mokey' }, card.ctrl)) d.addMod(m, 3000 - d.atk(m), 0);
    }), { cond: (d, c, _p, ev) => ev?.e === 'sent' && ev.from === 'mzone' && ev.ctrl === c.ctrl && ev.card.def.race === 'Fairy' && ev.card.mark.destroyedTurn === d.turn && d.find({ ...OWN_FU, name: 'Mokey Mokey' }, c.ctrl).length > 0 })],
  }),
  'Monster Gate': spell(run(async ({ d, p, card }) => {
    const [m, others] = excavate(d, p);
    for (const c of others) await d.move(c, 'gy', { by: p, why: 'mill' });
    if (m && d.canSpecial(p, m)) await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card);
  }, 800), { cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }], cond: (d, _c, p) => d.players[p].deck.some(normalSummonable) }),
  'Monster Reincarnation': spell({ op: 'toHand', s: { t: 'target' } }, { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: GY_M('self'), good: true }] }),
  'Morale Boost': passive({
    onResolve: async (d, _src, link) => { if (link.card.def.stype === 'equip' && link.card.equipTo !== undefined) await d.heal(link.card.ctrl, 1000); },
    effects: [trig('anyToGY', run(({ d, link }) => { const ev = link.ev; if (ev.e === 'sent') return d.damage(ev.ctrl, 1000); }), { cond: (_d, _c, _p, ev) => ev?.e === 'sent' && ev.card.def.stype === 'equip' && ev.from === 'szone' && ev.card.mark.lastFaceUp })],
  }),
  'Multiplication of Ants': spell(run(({ d, p }) => tokens(d, p, tokenDef('Army Ant Token', 'Insect', 'EARTH', 4, 500, 1200, { rules: ['noTribute'] }), 2), 600), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Insect'] } } }], cond: (d, _c, p) => d.freeCount(p, 'm') >= 1,
  }),
  'Mustering of the Dark Scorpions': condSpell((d, p) => has(d, p, 'Don Zaloog'), run(async ({ d, p }) => {
    const used = new Set<string>();
    for (;;) {
      const c = await pick(d, p, 'Special Summon a Dark Scorpion', d.players[p].hand.filter((x) => (x.def.name.includes('Dark Scorpion') || x.def.name === 'Cliff the Trap Remover') && !used.has(x.def.name) && d.canSpecial(p, x)), 'good', true);
      if (!c) break;
      used.add(c.def.name);
      await d.specialSummon(c, p, await d.askPos(p, c));
    }
  }, 900)),
  'My Body as a Shield': spell({ op: 'negate' }, {
    cost: [{ op: 'payLP', n: 1500 }],
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.eff.ops.some((o) => o.op === 'destroy' && 's' in o && (o.s.t === 'target' || ('f' in o.s && (o.s.f.zone === 'mzone' || o.s.f.kind === 'monster')))),
  }),
  'Mystical Cards of Light': passive({
    effects: [trig('anyDraw', { op: 'draw', who: 'self', n: 1 }, { optional: true, opt: true, cond: (d, c, _p, ev) => ev?.e === 'draw' && ev.dp && ev.player === c.ctrl && d.phase === 'DP' && d.spellTraps(c.ctrl).filter((x) => x.faceUp && x.def.name === 'Mystical Cards of Light').length >= 2 })],
  }),
  'Mystical Wind Typhoon': spell({ op: 'destroy', s: { t: 'target' } }, {
    targets: [{ f: ST }], cond: (d, c) => d.chain.length >= 2 && !d.chain.some((l) => l.card.def.name === c.def.name), when: (_d, ev) => ev.e === 'chain',
  }),
  'Mystik Wok': spell(run(async ({ d, p, link }) => {
    const { atk = 0, def = 0 } = link.data;
    const i = await d.option(p, 'Gain LP equal to', [`ATK (${atk})`, `DEF (${def})`], def > atk ? 1 : 0);
    await d.heal(p, i ? def : atk);
  }, (d, me) => (d.players[me].lp < 2500 ? 500 : -1)), {
    cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost'); if (c) { link.data.atk = c.faceUp ? d.atk(c) : c.def.atk; link.data.def = c.faceUp ? d.defv(c) : c.def.def; await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p) => d.monsters(p).some((m) => d.tributeOk(m)))],
  }),
  'Necklace of Command': {
    equip: { f: OWN_FU },
    effects: [trig('fieldToGY', run(async ({ d, p, o }) => {
      const i = d.players[o].hand.length ? await d.option(p, 'Necklace of Command', ['Draw 1 card', "Discard 1 random card from your opponent's hand"]) : 0;
      if (i === 0) await d.draw(p, 1);
      else { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }
    }), { optional: true, from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.mark.destroyedHow === 'battle' && m.mark.destroyedTurn === d.turn && m.owner === c.owner; } })],
  },
  'Necrovalley': {
    aura: [{ f: { ...M, set: "Gravekeeper's" }, atk: 500, def: 500 }],
    lock: {
      banish: () => true,
      activate: (_d, _s, _p, c) => !c.def.name.includes("Gravekeeper's") && !!c.def.effects?.some((e) => (e.targets ?? []).some((t) => [t.f.zone].flat().includes('gy'))),
    },
  },
  'Neo Space': { aura: [{ f: { ...M, fn: (_d, c) => c.def.name === 'Elemental Hero Neos' || neosFusion(c) }, atk: 500 }] },
  'Neos Force': {
    equip: { f: { ...FU, name: 'Elemental Hero Neos' }, atk: 800 },
    postBattle: async (d, self, o, r) => { if (o && o.zone === 'gy' && ((r.att === self && r.killedT) || (r.tgt === self && r.killedA))) await d.damage(opp(self.ctrl), o.def.atk ?? 0); },
    effects: [trig('endPhase', run(async ({ d, card }) => { await d.move(card, 'deck'); await d.shuffleDeck(card.owner); }), { cond: (d, c) => d.onField(c) })],
  },
  'NEX': spell(run(async ({ d, p, card, link }) => {
    const name = link.data.name as string;
    await ssPick(d, p, d.players[p].extra.filter((c) => c.def.lv === 4 && (c.def.alias === name || c.def.name === name)), 'Special Summon from your Fusion Deck', undefined, true, card);
  }, 1200), {
    cost: [run(async ({ d, p, link }) => {
      const c = await pick(d, p, 'Send a Neo-Spacian to the Graveyard', d.find({ ...OWN_FU, set: 'Neo-Spacian' }, p).filter((x) => d.players[p].extra.some((e) => e.def.alias === x.def.name)), 'cost');
      if (c) { link.data.name = c.def.name; await d.move(c, 'gy', { by: p, why: 'cost' }); }
    }, 0, (d, p) => d.find({ ...OWN_FU, set: 'Neo-Spacian' }, p).some((x) => d.players[p].extra.some((e) => e.def.alias === x.def.name)))],
  }),
  'Nitro Unit': {
    equip: { f: OPP_FU },
    effects: [trig('fieldToGY', run(({ d, card }) => { const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined; if (m) return d.damage(m.owner, m.def.atk ?? 0, card); }), {
      from: ['gy'], cond: (d, c) => { const m = c.last.eqTo !== undefined ? d.byUid(c.last.eqTo) : undefined; return !!m && m.zone === 'gy' && m.mark.destroyedHow === 'battle' && m.mark.destroyedTurn === d.turn; },
    })],
  },
  'Non-Spellcasting Area': passive({ lock: { unaffected: (_d, src, c, by) => c.zone === 'mzone' && c.faceUp && c.def.mtype !== 'effect' && by.def.kind === 'spell' && by !== src } }),
  'O - Oversoul': spell({ op: 'summon', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), set: 'Elemental Hero', mtype: ['normal'] }, good: true }] }),
  'Ojama Delta Hurricane!!': condSpell((d, p) => ['Ojama Green', 'Ojama Yellow', 'Ojama Black'].every((n) => has(d, p, n)), destroyAll({ side: 'opp' }), { ai: (d, me) => d.fieldCards(opp(me)).length * 700 }),
  'Ojamagic': {
    effects: [act({ ops: [] }), trig('toGY', run(async ({ d, p }) => {
      for (const n of ['Ojama Green', 'Ojama Yellow', 'Ojama Black']) { const c = d.find(DECK({ name: n }), p)[0]; if (c) await d.toHand(c); }
      await d.shuffleDeck(p);
    }), { from: ['gy'], cond: (_d, c) => c.mark.from === 'hand' || c.mark.from === 'szone' })],
  },
  'Ojamuscle': spell(run(async ({ d, p, t }) => {
    const k = t[0];
    if (!k) return;
    let n = 0;
    for (const m of both(d).filter((c) => c.faceUp && c.def.name.includes('Ojama') && c !== k)) if (await d.destroy(m, 'effect', undefined, p)) n++;
    if (k.zone === 'mzone') d.addMod(k, 1000 * n, 0, -1);
  }, 600), { targets: [{ f: { ...FU, name: 'Ojama King' }, good: true }] }),
  'Opti-Camouflage Armor': { equip: { f: { ...FU, fn: (d, c) => d.lvOf(c) === 1 }, rules: ['direct'] } },
  'Order to Charge': spell(run(async ({ d, p, o, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'mzone' || !d.tributeOk(c)) return;
    await d.move(c, 'gy', { why: 'tribute' });
    const x = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad');
    if (x) await d.destroy(x, 'effect', undefined, p);
  }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => c.def.atk ?? 0)) - 800), { targets: [{ f: { ...OWN_FU, mtype: ['normal'], fn: (_d, c) => !c.token }, good: true }], req: [{ f: OPP_M }] }),
  'Otherworld - The "A" Zone': {
    auraFn: (d, src, c) => {
      const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null);
      return o && c.ctrl !== src.ctrl && o.ctrl === src.ctrl && isAlien(o) ? { atk: -300, def: -300 } : undefined;
    },
  },
  'Over Destiny': spell(run(async ({ d, p, card, t }) => {
    const g = t[0];
    if (!g) return;
    const c = await ssPick(d, p, d.find(DECK({ set: 'Destiny Hero', kind: 'monster', fn: (_d, x) => (x.def.lv ?? 0) <= Math.floor((g.def.lv ?? 0) / 2) }), p), 'Special Summon a Destiny Hero', undefined, true, card);
    if (c) destroyAtEnd(d, c, p);
  }, 600), { targets: [{ f: { ...GY_M('self'), set: 'Destiny Hero' }, good: true }] }),
  'Overload Fusion': fusionFrom({ f: (f) => f.def.attr === 'DARK' && f.def.race === 'Machine', pool: () => [] as Card[], dest: 'banished' }),
  'Overpowering Eye': spell(run(({ d, t }) => { if (t[0]) grantRule(d, t[0], 'direct'); }, (d) => (d.phase === 'M1' ? 500 : -1)), { targets: [{ f: { ...OWN_FU, race: ['Zombie'], maxAtk: 2000 }, good: true }] }),
  "Owner's Seal": spell(run(async ({ d }) => { for (const c of both(d)) if (c.ctrl !== c.owner) await d.returnControl(c); }, (d, me) => d.monsters(opp(me)).filter((c) => c.owner === me).length * 1000 - d.monsters(me).filter((c) => c.owner !== me).length * 1000)),
  'Pandemonium': {
    lock: { noUpkeep: (_d, _s, c) => c.def.name.includes('Archfiend') },
    effects: [trig('anyToGY', run(async ({ d, link }) => {
      const ev = link.ev;
      if (ev.e !== 'sent') return;
      const s = ev.ctrl;
      const c = await pick(d, s, 'Add an Archfiend monster', d.find(DECK({ kind: 'monster', set: 'Archfiend', fn: (_d, x) => (x.def.lv ?? 0) < (ev.card.def.lv ?? 0) }), s), 'good', true);
      if (c) { await d.toHand(c); await d.shuffleDeck(s); }
    }), { cond: (d, _c, _p, ev) => ev?.e === 'sent' && ev.from === 'mzone' && ev.why === 'effect' && ev.card.def.kind === 'monster' && ev.card.def.name.includes('Archfiend') && ev.card.mark.destroyedTurn === d.turn })],
  },
  'Phalanx Pike': { equip: { f: FU, fn: (d, _e, m) => ({ atk: 900 * [...d.players[0].gy, ...d.players[1].gy].filter((c) => c.def.name === d.nameOf(m)).length }) } },
  'Phantasmal Martyrs': spell(run(async ({ d, p, card }) => {
    for (const c of d.players[p].hand.filter((x) => x !== card)) await d.move(c, 'gy', { by: p, why: 'cost' });
    await tokens(d, p, tokenDef('Phantasmal Martyr Token', 'Fiend', 'DARK', 1, 0, 0), 3, 'atk');
  }, 500), { cond: (d, c, p) => d.players[p].hand.filter((x) => x !== c).length >= 2 && (has(d, p, 'Uria, Lord of Searing Flames') || has(d, p, 'Hamon, Lord of Striking Thunder')) && d.freeCount(p, 'm') >= 3 }),
  'Photon Generator Unit': spell(ssFrom(['hand', 'deck', 'gy'], { name: 'Cyber Laser Dragon' }, { ignore: true }), {
    cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Cyber Dragon' }, n: 2 } }],
    req: [{ f: { ...OWN_M, name: 'Cyber Dragon' }, n: 2 }, { f: { side: 'self', zone: ['hand', 'deck', 'gy'], name: 'Cyber Laser Dragon' } }],
  }),
  'Pigeonholing Books of Spell': spell(run(async ({ d, p }) => {
    const deck = d.players[p].deck;
    const top = deck.splice(-Math.min(3, deck.length));
    const order = await d.select(p, 'Choose the new top card first', top, top.length, top.length, 'good', undefined, undefined, true, true);
    deck.push(...order.reverse());
  }, 50)),
  'Poison Fangs': passive({
    effects: [trig('anyBattleDamage', { op: 'damage', who: 'opp', n: 500 }, { cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && !!ev.src && d.raceOf(ev.src) === 'Beast' })],
  }),
  'Poison of the Old Man': spell(run(async ({ d, p, o }) => { if (await d.option(p, 'Poison of the Old Man', ['Gain 1200 LP', 'Inflict 800 damage'], d.players[o].lp <= 800 ? 1 : 0)) await d.damage(o, 800); else await d.heal(p, 1200); }, 500)),
  'Pot of Avarice': spell([{ op: 'toDeck', s: { t: 'target' } }, { op: 'draw', who: 'self', n: 2 }], { targets: [{ f: GY_M('self'), n: 5, good: true }] }),
  'Pot of Generosity': spell(run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'Return 2 cards to the Deck', d.players[p].hand.filter((c) => c !== card), 2, 2, 'cost');
    for (const c of cs) await d.move(c, 'deck');
    await d.shuffleDeck(p);
  }, -1), { req: [{ f: { side: 'self', zone: 'hand', notThis: true }, n: 2 }] }),
  'Power Bond': spell(run(async ({ d, p, card }) => {
    const f = await fuse(d, p, card, { f: (x) => x.def.race === 'Machine' });
    if (!f || f.zone !== 'mzone') return;
    const atk = f.def.atk ?? 0;
    d.addMod(f, atk, 0, -1);
    d.schedule({ at: 'EP', turn: d.turn, fn: () => d.damage(p, atk) });
  }, 1800, (d, p, card) => canFuse(d, p, card, { f: (x) => x.def.race === 'Machine' }))),
  'Power Capsule': spell(run(async ({ d, p, o, t }) => {
    const v = t[0];
    if (!v) return;
    const i = await d.option(p, 'Power Capsule', ['Destroy 1 monster', 'Gain 400 ATK', 'Attack twice'], d.monsters(o).length ? 0 : 1);
    if (i === 0) { const c = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }
    else if (i === 1) d.addMod(v, 400, 0, -1);
    else v.data.extraAtk = d.turn;
  }, 600), { targets: [{ f: { ...OWN_FU, name: 'Victory Viper XX03' }, good: true }] }),
  'Precious Cards from Beyond': passive({ onSummon: async (d, src, c, how, p) => { if (how === 'normal' && p === src.ctrl && d.tributesNeeded(p, c) >= 2) await d.draw(p, 2); } }),
  'Primal Seed': spell(run(async ({ d, p }) => { for (const c of await d.select(p, 'Add 2 banished cards', d.players[p].banished, 2, 2, 'good')) await d.toHand(c); }, 900), {
    cond: (d, _c, p) => both(d).some((c) => ['Black Luster Soldier - Envoy of the Beginning', 'Chaos Emperor Dragon - Envoy of the End'].includes(c.def.name)) && d.players[p].banished.length >= 2,
  }),
  'Pyramid Energy': spell(run(async ({ d, p }) => {
    const i = await d.option(p, 'Pyramid Energy', ['+200 ATK', '+500 DEF']);
    for (const c of d.find(OWN_FU, p)) d.addMod(c, i ? 0 : 200, i ? 500 : 0);
  }, 300), { req: [{ f: OWN_FU }] }),
  'Question': spell(run(async ({ d, p, o, card }) => {
    const m = d.players[p].gy.find((c) => c.def.kind === 'monster');
    if (!m) return;
    if ((await d.call(o))) await d.banish(m, o);
    else if (d.canSpecial(p, m)) await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card);
  }, 400), { req: [{ f: GY_M('self') }] }),
  'Quick Charger': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), set: 'Batteryman', maxLv: 4 }, n: 2, good: true }] }),
  'R - Righteous Justice': spell(run(async ({ d, p }) => {
    const n = d.fieldCards(p).filter((c) => c.faceUp && c.def.name.includes('Elemental Hero')).length;
    for (const c of await d.select(p, `Destroy up to ${n} Spell/Trap Cards`, d.find(ST, p), Math.min(n, d.find(ST, p).length), n, 'bad')) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => Math.min(d.fieldCards(me).filter((c) => c.faceUp && c.def.name.includes('Elemental Hero')).length, d.spellTraps(opp(me)).length) * 600 - 200), {
    req: [{ f: { side: 'self', faceUp: true, zone: ['mzone', 'szone'], set: 'Elemental Hero' } }],
  }),
  'Rainbow Veil': { equip: { f: FU }, negateFn: (d, src, c) => { const m = d.equippedTo(src); return !!m && d.phase === 'BP' && !!d.battle && ((d.battle.att === m && d.battle.tgt === c) || (d.battle.tgt === m && d.battle.att === c)); } },
  'Rare Value': spell(run(async ({ d, p, o }) => {
    const c = await pick(d, o, 'Send 1 Crystal Beast card to the Graveyard', d.players[p].s.filter((x): x is Card => !!x && x.faceUp && x.def.name.includes('Crystal Beast')), 'bad');
    if (c) await d.move(c, 'gy', { by: o });
    await d.draw(p, 2);
  }, 700), { cond: (d, _c, p) => crystalInST(d, p) >= 2 }),
  'Raregold Armor': { equip: { f: FU }, lock: { target: (d, src, a, t) => !!src && !!d.equippedTo(src) && a.ctrl !== src.ctrl && d.equippedTo(src)!.ctrl === src.ctrl && t !== d.equippedTo(src) } },
  'Re-Fusion': {
    effects: [act({
      cost: [{ op: 'payLP', n: 800 }],
      targets: [{ f: { ...GY_M('self'), mtype: ['fusion'] }, good: true }],
      ops: [run(async ({ d, p, card, t }) => {
        const m = t[0];
        if (!m || m.zone !== 'gy' || !d.canSpecial(p, m)) return;
        m.properly = true;
        if (await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card)) await d.equipCard(card, m, {}, p);
      }, 1200)],
    }), trig('destroyed', run(async ({ d, card }) => { const m = card.last.eqTo !== undefined ? d.byUid(card.last.eqTo) : undefined; if (m && m.zone === 'mzone') await d.banish(m, card.owner); }))],
  },
  'Realm of Light': {
    auraFn: (_d, src, c) => (c.def.name.includes('Lightsworn') ? { atk: 100 * ctr(src, 'shine') } : undefined),
    lock: { indestructible: (d, src, c, by) => { if (!src || c !== src || by !== 'effect' || ctr(src, 'shine') < 2) return false; removeCtr(d, src, 2, 'shine'); return true; } },
    effects: [trig('anyToGY', run(({ d, card }) => { addCtr(d, card, 1, 'shine'); }), { cond: (_d, c, _p, ev) => ev?.e === 'sent' && ev.card.mark.from === 'deck' && ev.card.owner === c.ctrl })],
  },
  'Reasoning': spell(run(async ({ d, p, o, card }) => {
    const levels = Array.from({ length: 12 }, (_, i) => `Level ${i + 1}`);
    const lv = 1 + (await d.option(o, 'Declare a monster Level', levels, 3));
    const [m, others] = excavate(d, p);
    for (const c of others) await d.move(c, 'gy', { by: p, why: 'mill' });
    if (!m) return;
    if ((m.def.lv ?? 0) === lv || !d.canSpecial(p, m)) await d.move(m, 'gy', { by: p, why: 'mill' });
    else await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card);
  }, 500), { cond: (d, _c, p) => d.players[p].deck.some(normalSummonable) && d.canSpecial(p) }),
  'Recurring Nightmare': spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), attr: 'DARK', fn: (_d, c) => (c.def.def ?? 0) === 0 }, n: 2, good: true }] }),
  'Recycle': passive({
    effects: [trig('standby', run(async ({ d, p }) => {
      const c = await pick(d, p, 'Return a non-monster card to the bottom of your Deck', d.players[p].gy.filter((x) => x.def.kind !== 'monster'), 'good');
      if (c) await d.move(c, 'deck', { bottom: true });
    }), { optional: true, cost: [{ op: 'payLP', n: 300 }], cond: (d, c) => d.onField(c) && d.players[c.ctrl].gy.some((x) => x.def.kind !== 'monster') })],
  }),
  'Reinforcement of the Army': spell(search({ kind: 'monster', race: ['Warrior'], maxLv: 4 }), { req: [{ f: DECK({ kind: 'monster', race: ['Warrior'], maxLv: 4 }) }] }),
};

function faceUpMarsh(d: Duel, s: Side) { return d.find({ side: 'self', zone: 'mzone', faceUp: true, name: 'Marshmallon' }, s).length > 0; }

// Fusion spells whose materials come from the field and Graveyard (pool filled lazily: the Duel is needed).
for (const [name, f] of [['Miracle Fusion', (c: Card) => c.def.name.includes('Elemental Hero')], ['Overload Fusion', (c: Card) => c.def.attr === 'DARK' && c.def.race === 'Machine']] as const) {
  const opts = (d: Duel) => ({ f, pool: (s: Side) => [...d.monsters(s), ...d.players[s].gy], dest: 'banished' as const });
  SPELLS_3[name] = spell(run(async ({ d, p, card }) => { await fuse(d, p, card, opts(d)); }, 1500, (d, p, card) => canFuse(d, p, card, opts(d))));
}
// Magical Blast: instead of the normal draw, add it from the Graveyard.
SPELLS_3['Magical Blast'].effects![1] = trig('anyDraw', run(async ({ d, p, card }) => {
  const drawn = d.players[p].hand[d.players[p].hand.length - 1];
  if (!drawn || card.zone !== 'gy') return;
  await d.move(drawn, 'deck');
  await d.toHand(card);
}), { optional: true, from: ['gy'], cond: (d, c, _p, ev) => c.zone === 'gy' && ev?.e === 'draw' && ev.dp && ev.player === c.owner && d.phase === 'DP' });
void fieldOrGY; void OPP_ST; void OWN_M; void addFrom; void hasSet; void ign; void quick; void pickSeen; void atEndPhase; void killEquippedOnLeave; void act; void ssFrom;
