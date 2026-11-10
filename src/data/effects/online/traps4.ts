// YGO Online Traps, part 4 (Roll Out! … Zoma the Spirit).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  act, addCtr, attackOf, both, boundRevive, castCopy, ctr, destroyAll, destroyAtEnd, grantRule, has, isAttackOn,
  opp, passive, pick, pickSeen, randomOf, removeCtr, run, scoreWipe, spell, ssFrom, ssPick, threat, tokenDef, tokens,
  trapMonster, trig, atEndPhase,
} from './olib';

const trap = spell;
const secondStandby = (n: number) => trig('standby', run(({ d, card }) => d.destroy(card, 'effect', undefined, card.ctrl)), { cond: (d, c) => d.onField(c) && (c.data.standbys ?? 0) >= n });
const imprison = (attr: 'DARK' | 'LIGHT'): Def => passive({
  effects: [{ type: 'quick', from: ['szone'], label: `Negate a ${attr} monster effect`, ops: [run(({ link }) => { const ev = link.ev; if (ev.e === 'chain') ev.link.negated = true; })], ai: 600,
    when: (d, ev) => ev.e === 'chain' && !ev.link.isCard && ev.link.card.def.kind === 'monster' && d.attrOf(ev.link.card) === attr }],
});
const counterOn = (pred: (l: import('../../../engine/duel').Link) => boolean, extra: Partial<import('../../../engine/types').Effect> = {}): Def =>
  trap({ op: 'negate' }, { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && pred(ev.link), ...extra });
const art = (attr: 'EARTH' | 'FIRE' | 'WATER' | 'WIND', ops: Parameters<typeof run>[0], ai: number): Def => trap(run(ops, ai), {
  cost: [run(async ({ d, p, link }) => {
    const c = await pick(d, p, `Tribute 1 ${attr} monster`, d.find({ ...OWN_M, attr }, p).filter((x) => d.tributeOk(x)), 'cost');
    if (c) { link.data.trib = c; link.data.atk = c.def.atk ?? 0; await d.move(c, 'gy', { why: 'tribute' }); }
  }, 0, (d, p) => d.find({ ...OWN_FU, attr }, p).some((x) => d.tributeOk(x)))],
});
const SARC = ['The First Sarcophagus', 'The Second Sarcophagus', 'The Third Sarcophagus'];

export const TRAPS_4: Record<string, Def> = {
  'Roll Out!': trap(run(async ({ d, p, t }) => {
    const u = t[0];
    if (!u || u.zone !== 'gy') return;
    const f = u.def.effects?.[0]?.targets?.[0]?.f ?? OWN_FU;
    const m = await pick(d, p, `Equip ${u.def.name} to`, d.find(f, p, u).filter((x) => x.ctrl === p), 'good');
    if (m) await d.equipCard(u, m, { ...(u.def.equip ?? {}), sub: true, own: true }, p);
  }, 600), { targets: [{ f: { ...GY_M('self'), ability: 'union' }, good: true }], req: [{ f: OWN_FU }] }),
  'Rope of Life': trap(run(async ({ d, p, card, link }) => {
    const ev = link.ev;
    const m = ev.e === 'sent' ? ev.card : undefined;
    if (m && m.zone === 'gy' && d.canSpecial(p, m) && (await d.specialSummon(m, p, await d.askPos(p, m), 'special', false, card))) d.addMod(m, 800, 0, -1);
  }, 900), {
    when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.from === 'mzone',
    cost: [run(async ({ d, p, card }) => { const h = d.players[p].hand.filter((c) => c !== card); if (h.length) await d.discard(p, h, null); }, 0, (d, p) => d.players[p].hand.length > 0)],
  }),
  'Royal Oppression': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Pay 800 LP: negate a Special Summon', cost: [{ op: 'payLP', n: 800 }], ops: [{ op: 'negate' }], ai: (_d, me, _c, ev) => (ev.e === 'summoning' && ev.player !== me ? 900 : -1),
      when: (_d, ev) => ev.e === 'summoning' && ev.how !== 'normal' && ev.how !== 'flip' && !ev.negated }],
  }),
  'Royal Surrender': counterOn((l) => l.isCard && l.card.def.kind === 'trap' && l.card.def.stype === 'continuous'),
  'Royal Writ of Taxation': trap(run(async ({ d, p, o }) => {
    const c = randomOf(d, d.players[o].hand);
    if (!c) return;
    await d.reveal(p, [c], 'Royal Writ of Taxation');
    const name = c.def.name;
    let used = false;
    d.addTemp({ until: d.turn + 1, summon: (_dd, x, how, s) => { if (s === o && how === 'normal' && x.def.name === name) used = true; } });
    const end = d.turn + 1;
    d.addTemp({ until: end, lock: {} });
    d.schedule({ at: 'EP', turn: end, fn: async () => { const acted = used || d.logLines.some((l) => l.includes(`activates ${name}`)); if (acted) await d.damage(p, 1000); else await d.damage(o, 1000); } });
  }, 300), { cond: (d, _c, p) => d.tp !== p && d.phase === 'SP', req: [{ f: { side: 'opp', zone: 'hand' } }] }),
  'Sakuretsu Armor': trap({ op: 'destroy', s: { t: 'event' } }, { on: ['oppAttack'], ai: (d, me, _c, ev) => threat(d, me, ev) + (ev.e === 'attack' ? ev.attacker.def.atk ?? 0 : 0) }),
  'Sanguine Swamp': passive({
    lock: { activate: (_d, _s, _p, c) => (c.zone === 'szone' || c.zone === 'fzone') && !c.faceUp },
    selfDestructIf: (d, c) => d.spellTraps(c.ctrl).some((x) => x !== c),
    effects: [secondStandby(2)],
  }),
  'Secret Barrel': trap(run(({ d, o }) => d.damage(o, 200 * (d.fieldCards(o).length + d.players[o].hand.length)), (d, me) => 200 * (d.fieldCards(opp(me)).length + d.players[opp(me)].hand.length))),
  'Secrets of the Gallant': trap(run(({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    d.addTemp({ until: d.turn, p, afterBattle: async (dd, r) => { const src = r.att.ctrl === p ? r.att : r.tgt; if (src === c && r.dmgTo === o && r.dmg > 0) for (let i = 0; i < 2; i++) { const x = randomOf(dd, dd.players[o].hand); if (x) await dd.discard(o, [x], p); } } });
  }, 300), { targets: [{ f: { ...OWN_FU, mtype: ['normal'] }, good: true }] }),
  'Security Orb': {
    effects: [act({ on: ['oppAttack'], ops: [{ op: 'pos', s: { t: 'event' }, to: 'swap' }], ai: (d, me, _c, ev) => threat(d, me, ev) }),
      trig('destroyed', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy a monster', both(d), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false && c.mark.destroyedBy === opp(c.owner) })],
  },
  'Seismic Shockwave': passive({
    lock: { stZone: (_d, src, s, slot) => !!src && s !== src.ctrl && (src.data.zones ?? []).includes(slot) },
    effects: [trig('standby', run(async ({ d, p, card }) => {
      await d.destroy(card, 'effect', undefined, p);
      const c = await pick(d, p, 'You can return a Dinosaur to your hand', d.find({ ...GY_M('self'), race: ['Dinosaur'] }, p), 'good', true);
      if (c) await d.toHand(c);
    }), { cond: (d, c) => d.onField(c) && (c.data.standbys ?? 0) >= 3 })],
  }, {
    when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.from === 'mzone' && ev.card.def.race === 'Dinosaur' && ev.card.mark.destroyedTurn !== undefined,
    ops: [run(({ d, o, card }) => { card.data.zones = [0, 1, 2, 3, 4].filter((i) => !d.players[o].s[i]).slice(0, 3); }, 300)],
  }),
  'Self-Destruct Button': trap(run(async ({ d }) => { const { DuelEnd } = await import('../../../engine/duel'); throw new DuelEnd(-1, 'Self-Destruct Button'); }, (d, me) => (d.players[opp(me)].lp - d.players[me].lp >= 7000 ? 100 : -1)), { cond: (d, _c, p) => d.players[opp(p)].lp - d.players[p].lp >= 7000 }),
  'Shadow-Imprisoning Mirror': imprison('DARK'),
  'Shattered Axe': passive({
    effects: [trig('standby', run(({ d, card }) => { const m = d.byUid(card.data.sel); if (m && m.zone === 'mzone') d.addMod(m, -500, 0, -1); }), { cond: (d, c) => d.onField(c) })],
    selfDestructIf: (d, c) => c.data.sel !== undefined && !both(d).some((m) => m.uid === c.data.sel && m.mv === c.data.selMv),
  }, { targets: [{ f: FU }], ops: [run(({ card, t }) => { if (t[0]) { card.data.sel = t[0].uid; card.data.selMv = t[0].mv; } }, 400)] }),
  'Shield Spear': trap({ op: 'stat', s: { t: 'target' }, atk: 400, def: 400 }, { targets: [{ f: FU, good: true }] }),
  'Simultaneous Loss': trap({ op: 'mill', who: 'both', n: 1 }, { ai: -1 }),
  'Sinister Seeds': trap(run(async ({ d, p, link }) => {
    const ev = link.ev;
    void ev;
    const n = Math.floor((d.flags[`lastBattleDmg:${p}`] ?? 0) / 500);
    await tokens(d, p, tokenDef('Sinister Seed Token', 'Plant', 'DARK', 1, 100, 100), n, 'def');
  }, 500), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.card.mark.lastPos === 'atk' && ev.card.mark.lastFaceUp }),
  'Sixth Sense': trap(run(async ({ d, p }) => {
    const nums = ['1', '2', '3', '4', '5', '6'];
    const a = 1 + (await d.option(p, 'Choose the first number', nums, 4));
    const b = 1 + (await d.option(p, 'Choose the second number', nums.filter((x) => Number(x) !== a), 4));
    const second = b >= a ? b + 1 : b;
    const n = (await d.die());
    if (n === a || n === second) await d.draw(p, Math.min(n, d.players[p].deck.length));
    else await d.mill(p, n, p);
  }, 300)),
  'Skill Drain': passive({ negateFn: (_d, _s, c) => c.zone === 'mzone' && c.faceUp && c.def.kind === 'monster' && c.def.mtype !== 'normal' }, { cost: [{ op: 'payLP', n: 1000 }] }),
  "Snake Deity's Command": counterOn((l) => l.isCard && l.card.def.kind === 'spell', {
    cost: [run(async ({ d, p, o }) => { const c = await pick(d, p, 'Reveal a Venom monster', d.players[p].hand.filter((x) => x.def.name.startsWith('Venom') && x.def.kind === 'monster'), 'cost'); if (c) await d.reveal(o, [c], "Snake Deity's Command"); }, 0, (d, p) => d.players[p].hand.some((x) => x.def.name.startsWith('Venom') && x.def.kind === 'monster'))],
  }),
  'Snake Whistle': trap(ssFrom(['deck'], { race: ['Reptile'], maxLv: 4 }), { when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.from === 'mzone' && ev.card.def.race === 'Reptile' && ev.card.mark.destroyedTurn !== undefined }),
  'Solar Ray': trap(run(({ d, p, o }) => d.damage(o, 600 * d.find({ ...OWN_FU, attr: 'LIGHT' }, p).length), (d, me) => 600 * d.find({ ...OWN_FU, attr: 'LIGHT' }, me).length), { req: [{ f: { ...OWN_FU, attr: 'LIGHT' } }] }),
  'Soul Demolition': passive({
    effects: [{ type: 'ignition', from: ['szone'], label: 'Pay 500 LP: banish from Graveyards', cost: [{ op: 'payLP', n: 500 }], cond: (d, c) => d.find({ ...OWN_FU, race: ['Fiend'] }, c.ctrl).length > 0, ai: 100,
      ops: [run(async ({ d, p, o }) => {
        for (const [s, t] of [[p, o], [o, p]] as [Side, Side][]) { const c = await pick(d, s, "Banish a monster from your opponent's Graveyard", d.players[t].gy.filter((x) => x.def.kind === 'monster'), 'bad'); if (c) await d.banish(c, s); }
      })] }],
  }),
  'Soul Resurrection': boundRevive({ ...GY_M('self'), mtype: ['normal'] }, { pos: 'def' }),
  'Soul Rope': trap(ssFrom(['deck'], { minLv: 4, maxLv: 4 }), { cost: [{ op: 'payLP', n: 1000 }], when: (_d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ev.from === 'mzone' && ev.card.mark.destroyedTurn !== undefined }),
  'Spatial Collapse': passive({
    lock: {
      summon: (d, _s, p) => d.fieldCards(p).length >= 5,
      set: (d, _s, p) => d.fieldCards(p).length >= 5,
      activate: (d, _s, p, c) => c.zone === 'hand' && d.fieldCards(p).length >= 5,
    },
  }, { cond: (d) => d.fieldCards(0).length <= 5 && d.fieldCards(1).length <= 5 }),
  'Spell Purification': trap(destroyAll({ side: 'any', zone: ['szone'], faceUp: true, kind: 'spell', stype: 'continuous' }), { cost: [{ op: 'discard', who: 'self', n: 1 }], ai: (d, me) => d.spellTraps(opp(me)).filter((c) => c.faceUp && c.def.stype === 'continuous' && c.def.kind === 'spell').length * 700 - 500 }),
  'Spell Reclamation': trap(run(({ d, p, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const sp = ev.link.card;
    d.addTemp({ until: 1e9, p, sent: async (dd, c) => { if (c === sp) await dd.toHand(c); } });
    d.addTemp({ until: d.turn, p, lock: {} });
    const mv = sp.mv;
    d.deferred.push(async () => { if (sp.zone === 'gy' && sp.mv !== mv) await d.toHand(sp); });
  }, 400), { cost: [{ op: 'discard', who: 'self', n: 1 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p === p && ev.link.isCard && ev.link.card.def.kind === 'spell' }),
  'Spell Shield Type-8': trap({ op: 'negate' }, {
    on: ['activateSpell'],
    cost: [run(async ({ d, p, card, link }) => {
      const ev = link.ev;
      const single = ev.e === 'chain' && ev.link.targets.flat().filter((c) => c.zone === 'mzone').length === 1;
      if (single) return;
      const c = await pick(d, p, 'Send a Spell Card from your hand to the Graveyard', d.players[p].hand.filter((x) => x !== card && x.def.kind === 'spell'), 'cost');
      if (c) await d.move(c, 'gy', { by: p, why: 'cost' });
    }, 0, (d, p, card) => d.players[p].hand.some((x) => x !== card && x.def.kind === 'spell') || d.chain.some((l) => l.targets.flat().filter((c) => c.zone === 'mzone').length === 1))],
  }),
  'Spell Vanishing': trap([{ op: 'negate' }, run(async ({ d, p, o, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const name = ev.link.card.def.name;
    await d.reveal(p, d.players[o].hand, "Opponent's hand");
    for (const c of [...d.players[o].hand, ...d.players[o].deck].filter((x) => x.def.name === name)) await d.move(c, 'gy', { by: p });
    await d.shuffleDeck(o);
  })], { on: ['activateSpell'], cost: [{ op: 'discard', who: 'self', n: 2 }] }),
  'Spell-Stopping Statute': counterOn((l) => l.isCard && l.card.def.kind === 'spell' && l.card.def.stype === 'continuous'),
  'Spirit Barrier': passive({ lock: { battleDmg: (d, src, _a, _t, n, to) => (!!src && to === src.ctrl && d.monsters(to).length > 0 ? 0 : n) } }),
  "Spirit's Invitation": passive({
    upkeep: 500,
    onMove: async (d, src, c, from, to) => {
      if (from !== 'mzone' || to !== 'hand' || c.def.ability !== 'spirit' || c.owner !== src.ctrl) return;
      const x = await pick(d, src.ctrl, "Return 1 of your opponent's monsters to the hand", d.monsters(opp(src.ctrl)), 'bad');
      if (x) await d.toHand(x);
    },
  }),
  'Spiritual Earth Art - Kurogane': art('EARTH', async ({ d, p, card, link }) => {
    await ssPick(d, p, d.find({ ...GY_M('self'), attr: 'EARTH', maxLv: 4 }, p).filter((c) => c !== link.data.trib), 'Special Summon an EARTH monster', undefined, false, card);
  }, 500),
  'Spiritual Fire Art - Kurenai': art('FIRE', ({ d, o, link }) => d.damage(o, link.data.atk ?? 0), 800),
  'Spiritual Water Art - Aoi': art('WATER', async ({ d, p, o }) => {
    const c = await pickSeen(d, p, "Send a card from your opponent's hand to the Graveyard", d.players[o].hand, 'bad');
    if (c) await d.move(c, 'gy', { by: p });
  }, 600),
  'Spiritual Wind Art - Miyabi': art('WIND', async ({ d, p, o }) => {
    const c = await pick(d, p, 'Place a card on the bottom of the Deck', d.fieldCards(o), 'bad');
    if (c) await d.move(c, 'deck', { bottom: true });
  }, 700),
  'Statue of the Wicked': {
    effects: [act({ ops: [] }), trig('destroyed', run(({ d, p }) => tokens(d, p, tokenDef('Wicked Token', 'Fiend', 'DARK', 4, 1000, 1000), 1, 'atk')), { from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false })],
  },
  'Staunch Defender': trap(run(({ d, p, o, t }) => {
    const c = t[0];
    if (!c) return;
    const mv = c.mv;
    d.addTemp({ until: d.turn, lock: { target: (_d, _s, a, tg) => a.ctrl === o && c.mv === mv && c.zone === 'mzone' && tg !== c } });
    void p;
  }, (d, me, _c, ev) => threat(d, me, ev) / 2), { on: ['oppAttack'], targets: [{ f: OWN_FU, good: true }] }),
  'Straight Flush': trap(destroyAll({ side: 'opp', zone: 'szone' }), { cond: (d, _c, p) => d.players[opp(p)].s.every(Boolean) }),
  'Strike Slash': trap(run(({ d, link }) => { const ev = attackOf(link.ev); if (ev && ev.attacker.zone === 'mzone') { d.addMod(ev.attacker, 700, 0); grantRule(d, ev.attacker, 'pierce'); } }, 600), { when: (_d, ev, p) => ev.e === 'attack' && ev.player === p }),
  'Stronghold the Moving Fortress': {
    effects: [act({ ops: [run(async ({ d, p, card }) => {
      await trapMonster(d, card, p, { race: 'Machine', attr: 'EARTH', lv: 4, atk: 0, def: 2000, statFn: (dd, c) => (['Green Gadget', 'Red Gadget', 'Yellow Gadget'].every((n) => has(dd, c.ctrl, n)) ? { atk: 3000 } : undefined) }, 'def');
    }, (d, me, _c, ev) => threat(d, me, ev) + 300)] })],
  },
  'Success Probability 0%': trap(run(async ({ d, p, o }) => { for (let i = 0; i < 2; i++) { const c = randomOf(d, d.players[o].extra); if (c) await d.move(c, 'gy', { by: p }); } }, (d, me) => Math.min(2, d.players[opp(me)].extra.length) * 400 - 1), { req: [{ f: { side: 'opp', zone: 'extra' } }] }),
  'Summon Limit': passive({
    onSummon: (d, src, _c, _how, p) => { src.data[`s${p}:${d.turn}`] = (src.data[`s${p}:${d.turn}`] ?? 0) + 1; },
    lock: { summon: (d, src, p) => !!src && (src.data[`s${p}:${d.turn}`] ?? 0) >= 2 },
  }),
  'Super Junior Confrontation': trap(run(async ({ d, p, o }) => {
    d.attackNegated = true;
    const a = d.find({ ...OPP_FU, pos: 'atk' }, p).sort((x, y) => d.atk(x) - d.atk(y))[0];
    const t = d.find({ ...OWN_FU, pos: 'def' }, p).sort((x, y) => d.defv(x) - d.defv(y))[0];
    if (a && t) { const tp = d.tp; d.tp = o; try { await (d as unknown as { damageStep(a: Card, t: Card | null): Promise<void> }).damageStep(a, t); } finally { d.tp = tp; } }
    d.battleEnded = true;
  }, (d, me, _c, ev) => threat(d, me, ev)), { on: ['oppAttack'], req: [{ f: { ...OWN_FU, pos: 'def' } }] }),
  'Supercharge': trap({ op: 'draw', who: 'self', n: 2 }, { on: ['oppAttack'], cond: (d, _c, p) => d.monsters(p).length > 0 && d.monsters(p).every((c) => c.faceUp && d.raceOf(c) === 'Machine' && c.def.name.includes('roid')) }),
  'Survival Instinct': trap(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Banish Dinosaur monsters', d.find({ ...GY_M('self'), race: ['Dinosaur'] }, p), 1, 60, 'cost');
    for (const c of cs) await d.banish(c, p);
    await d.heal(p, 400 * cs.length);
  }, (d, me) => (d.players[me].lp < 3000 ? 400 : -1)), { req: [{ f: { ...GY_M('self'), race: ['Dinosaur'] } }] }),
  'Swift Samurai Storm!': passive({
    afterBattle: (d, src, r) => {
      const mine = [r.att, r.tgt].find((m) => m && m.ctrl === src.ctrl && m.def.name.includes('Six Samurai'));
      if (!mine || src.data.storm === d.turn) return;
      src.data.storm = d.turn;
      for (const m of d.find({ ...OWN_FU, set: 'Six Samurai' }, src.ctrl)) d.addMod(m, 300, 0);
    },
  }),
  'Swiftstrike Armor': passive({
    effects: [trig('anyDraw', run(async ({ d, p }) => { const c = d.players[p].hand[d.players[p].hand.length - 1]; if (c && c.def.name.includes('Six Samurai') && d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c)); }), {
      optional: true, cond: (d, card, _p, ev) => ev?.e === 'draw' && ev.dp && ev.player === card.ctrl && d.phase === 'DP' && !!d.players[card.ctrl].hand[d.players[card.ctrl].hand.length - 1]?.def.name.includes('Six Samurai'),
    })],
  }),
  'Synthetic Seraphim': passive({
    onResolve: async (d, src, link) => { if (link.isCard && link.card.def.kind === 'trap' && link.card.def.stype === 'counter') await tokens(d, src.ctrl, tokenDef('Synthetic Seraphim Token', 'Fairy', 'LIGHT', 1, 300, 300), 1, 'def'); },
  }),
  'Talisman of Spell Sealing': passive({
    negateFn: (_d, _s, c) => c.def.kind === 'spell',
    lock: { activate: (_d, _s, _p, c) => c.def.kind === 'spell' },
    selfDestructIf: (d, c) => !has(d, c.ctrl, 'Sealmaster Meisei'),
  }, { cond: (d, _c, p) => has(d, p, 'Sealmaster Meisei') }),
  'Taunt': trap(run(({ d, o, t }) => {
    const c = t[0];
    if (!c) return;
    const mv = c.mv;
    d.addTemp({ until: d.turn, lock: { target: (_d, _s, a, tg) => a.ctrl === o && c.mv === mv && c.zone === 'mzone' && tg !== c } });
  }, 300), { cond: (d, _c, p) => d.tp !== p && d.phase === 'M1', targets: [{ f: OWN_M, good: true }] }),
  'Terra Firma Gravity': trap(run(({ d, o }) => {
    const tf = both(d).find((c) => c.faceUp && c.def.name === 'Elemental Hero Terra Firma' && c.ctrl !== o);
    if (!tf) return;
    d.addTemp({ until: d.turn, lock: { target: (dd, _s, a, tg) => a.ctrl === o && dd.lvOf(a) <= 4 && tf.zone === 'mzone' && tg !== tf } });
  }, 400), { cond: (d, _c, p) => d.tp !== p && d.phase === 'BP' && has(d, p, 'Elemental Hero Terra Firma') }),
  'Terrible Deal': trap(run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }, 500), { on: ['activateSpell'], cost: [{ op: 'payLP', n: 1000 }] }),
  "The Dragon's Bead": passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Negate a Trap targeting a Dragon', cost: [{ op: 'discard', who: 'self', n: 1 }], ops: [{ op: 'negate', effectOnly: true, destroy: true }], ai: 600,
      when: (d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.card.def.kind === 'trap' && ev.link.targets.flat().length === 1 && ev.link.targets.flat().some((c) => c.zone === 'mzone' && c.faceUp && d.raceOf(c) === 'Dragon') }],
  }),
  'The First Sarcophagus': passive({
    effects: [
      trig('endPhase', run(async ({ d, p }) => {
        const next = SARC.find((n) => !d.spellTraps(p).some((c) => c.faceUp && c.def.name === n));
        const c = next && d.find({ side: 'self', zone: ['hand', 'deck'], name: next }, p)[0];
        if (!c || d.freeSlot(p, 's') < 0) return;
        const fromDeck = c.zone === 'deck';
        d.placeST(c, p, true);
        d.log(`${c.def.name} is placed on the field.`);
        await d.emit({ t: 'move', card: c, from: fromDeck ? 'deck' : 'hand', to: 'szone' });
        if (fromDeck) d.shuffle(p);
      }), { cond: (d, c) => d.onField(c) && d.tp !== c.ctrl }),
      { type: 'ignition', from: ['szone'], label: 'Send the Sarcophagi: Special Summon Spirit of the Pharaoh', ai: 2500,
        cond: (d, c) => SARC.every((n) => d.spellTraps(c.ctrl).some((x) => x.faceUp && x.def.name === n)),
        ops: [run(async ({ d, p, card }) => {
          for (const x of d.spellTraps(p).filter((s) => s.faceUp && SARC.includes(s.def.name))) await d.move(x, 'gy', { by: p, why: 'cost' });
          await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Spirit of the Pharaoh' }, p), 'Special Summon Spirit of the Pharaoh', undefined, true, card);
        })] },
    ],
    onMove: async (d, src, c, from) => { if (from === 'szone' && SARC.includes(c.def.name) && c.owner === src.ctrl) for (const x of d.spellTraps(src.ctrl).filter((s) => s.faceUp && SARC.includes(s.def.name))) await d.move(x, 'gy', { by: src.ctrl }); },
  }),
  'The Forces of Darkness': trap({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), set: 'Dark World' }, n: 2, good: true }] }),
  'The Gift of Greed': trap({ op: 'draw', who: 'opp', n: 2 }, { ai: -1 }),
  'The Grave of Enkindling': trap(run(async ({ d, p, o }) => {
    for (const s of [p, o]) {
      const c = await ssPick(d, s, d.players[s].gy.filter((x) => x.def.kind === 'monster'), 'Special Summon a monster in Defense Position', 'def');
      if (c) { const mv = c.mv; d.addTemp({ until: 1e9, lock: { pos: (_d, _s, x) => x === c && x.mv === mv } }); }
    }
  }, 300), { when: (_d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && ev.from === 'mzone' }),
  'The League of Uniform Nomenclature': trap(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c) return;
    for (const x of d.find(DECK({ name: c.def.name }), p)) { if (!d.canSpecial(p, x)) break; await d.specialSummon(x, p, await d.askPos(p, x)); }
    await d.shuffleDeck(p);
  }, 800), { targets: [{ f: { ...OWN_FU, mtype: ['normal'], maxLv: 2 }, good: true }] }),
  'The Paths of Destiny': trap(run(async ({ d, p, o }) => { for (const s of [p, o]) { if ((await d.tossCoins(1))[0]) await d.heal(s, 2000); else await d.damage(s, 2000); } }, -1)),
  'The Selection': trap({ op: 'negate' }, {
    cost: [{ op: 'payLP', n: 1000 }],
    when: (d, ev, p) => ev.e === 'summoning' && ev.player !== p && !ev.negated && ev.cards.some((c) => both(d).some((m) => m !== c && m.faceUp && d.raceOf(m) === c.def.race)),
  }),
  'The Spell Absorbing Life': trap(run(async ({ d, p }) => {
    for (const c of both(d).filter((x) => !x.faceUp)) await d.changePos(c, 'reveal', false);
    await d.heal(p, 400 * both(d).filter((c) => c.faceUp && c.def.mtype === 'effect').length);
  }, 300)),
  'The Transmigration Prophecy': trap(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Shuffle 2 cards into the Deck', [...d.players[0].gy, ...d.players[1].gy], 2, 2, 'good');
    const owners = new Set<Side>();
    for (const c of cs) { owners.add(c.owner); await d.move(c, 'deck'); }
    for (const s of owners) await d.shuffleDeck(s);
  }, 100), { req: [{ f: { side: 'any', zone: 'gy' }, n: 2 }] }),
  'Threatening Roar': trap({ op: 'noAttacks' }, { ai: (d, me) => (d.tp !== me ? 600 : -1) }),
  'Thunder of Ruler': trap(run(({ d, o }) => d.addTemp({ until: d.turn, tag: 'noBP', p: o }), 600), { cond: (d, _c, p) => d.tp !== p && d.phase === 'SP' }),
  'Token Feastevil': trap(run(async ({ d, p, o }) => { let n = 0; for (const c of both(d).filter((x) => x.token)) if (await d.destroy(c, 'effect', undefined, p)) n++; await d.damage(o, 300 * n); }, (d, me) => both(d).filter((c) => c.token && c.ctrl !== me).length * 500), {
    when: (_d, ev) => ev.e === 'summon' && ev.cards.some((c) => !!c.token),
  }),
  'Toon Defense': passive({
    effects: [{ type: 'quick', from: ['szone'], label: 'Make the attack a direct attack', ops: [run(({ d, link }) => { const ev = attackOf(link.ev); if (ev) { ev.target = null; d.log('The attack becomes a direct attack.'); } })], ai: (d, me, _c, ev) => threat(d, me, ev),
      when: (d, ev, p) => isAttackOn(ev, p) && !!ev.target && ev.target.faceUp && d.lvOf(ev.target) <= 4 && /Toon|Manga Ryu-Ran/.test(ev.target.def.name) }],
  }),
  'Tour of Doom': passive({
    effects: [trig('oppStandby', run(async ({ d, p, o }) => {
      const noSum = (s: Side) => ({ summon: (_d: Duel, _s: Card | null, q: Side, _c: Card, how: string) => q === s && (how === 'normal' || how === 'flip') });
      if ((await d.tossCoins(1))[0]) d.addTemp({ until: d.turn, lock: noSum(o) });
      else d.addTemp({ until: d.turn + 1, lock: noSum(p) });
    }), { cond: (d, c) => d.onField(c) })],
  }),
  'Tower of Babel': passive({
    onResolve: async (d, src, link) => {
      if (!link.isCard || link.card.def.kind !== 'spell' || !d.onField(src)) return;
      addCtr(d, src, 1);
      if (ctr(src) >= 4) { await d.destroy(src, 'effect', undefined, src.ctrl); await d.damage(link.p, 3000, src); }
    },
  }),
  'Tragedy': trap(destroyAll({ ...OPP_M, pos: 'def' }), { cond: (d, _c, p) => d.monsters(opp(p)).some((c) => c.faceUp && c.pos === 'def' && c.posTurn === d.turn), ai: (d, me) => scoreWipe(d, me, (c) => c.ctrl !== me && c.pos === 'def') }),
  'Transmigration Break': passive({ lock: { gyToDeckBanish: true } }),
  'Trap Dustshoot': trap(run(async ({ d, p, o }) => {
    await d.reveal(p, d.players[o].hand, "Opponent's hand");
    const c = await pickSeen(d, p, 'Return a Monster Card to the Deck', d.players[o].hand.filter((x) => x.def.kind === 'monster'), 'bad');
    if (c) { await d.move(c, 'deck'); await d.shuffleDeck(o); }
  }, 600), { cond: (d, _c, p) => d.players[opp(p)].hand.length >= 4 }),
  'Trap Jammer': counterOn((l) => l.isCard && l.card.def.kind === 'trap', { cond: (d) => d.phase === 'BP' }),
  'Trap of Board Eraser': trap(run(async ({ d, p, o }) => {
    d.addTemp({ until: d.turn, p, lock: { noDamage: (dd, _s, s, battle) => !battle && s === p && dd.chain.length > 0 } });
    const c = await pick(d, o, 'Discard 1 card', d.players[o].hand, 'cost');
    if (c) await d.discard(o, [c], p);
  }, 800), { when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'damage' && (o.who === 'opp' || o.who === 'both')) }),
  'Trap of Darkness': trap(run(async ({ d, p, card }) => {
    const c = await pick(d, p, 'Select a Normal Trap in your Graveyard', d.players[p].gy.filter((x) => x.def.kind === 'trap' && x.def.stype === 'normal' && x.def.name !== 'Trap of Darkness'), 'good');
    if (!c) return;
    await d.banish(c, p);
    await castCopy(d, p, c, card);
  }, 500), { cost: [{ op: 'payLP', n: 1000 }], cond: (d, _c, p) => d.players[p].lp <= 3000 && d.players[p].gy.some((x) => x.def.kind === 'trap' && x.def.stype === 'normal') }),
  'Trap Reclamation': trap(run(({ d, p, link }) => {
    const ev = link.ev;
    if (ev.e !== 'chain') return;
    const tr = ev.link.card;
    d.addTemp({ until: 1e9, p, sent: async (dd, c) => { if (c === tr) await dd.toHand(c); } });
    const mv = tr.mv;
    d.deferred.push(async () => { if (tr.zone === 'gy' && tr.mv !== mv) await d.toHand(tr); });
  }, 400), { cost: [{ op: 'discard', who: 'self', n: 1 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p === p && ev.link.isCard && ev.link.card.def.kind === 'trap' }),
  'Treasure Map': trap([{ op: 'draw', who: 'self', n: 2 }, { op: 'discard', who: 'self', n: 1 }], {
    when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'toHand' && 's' in o && (o.s.t === 'target' || o.s.t === 'all')),
  }),
  'Triggered Summon': trap(run(async ({ d, p, o }) => { for (const s of [p, o]) await ssPick(d, s, d.players[s].hand.filter((c) => c.def.kind === 'monster' && (c.def.lv ?? 0) <= 4), 'Special Summon a Level 4 or lower monster'); }, 300), {
    when: (_d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip',
  }),
  'Trojan Blast': trap(run(async ({ d, p, o }) => {
    const c = d.monsters(o).find((m) => m.owner === p);
    if (!c) return;
    const a = d.atk(c);
    if (await d.destroy(c, 'effect', undefined, p)) await d.damage(o, a);
  }, 1500), { cond: (d, _c, p) => d.monsters(opp(p)).some((m) => m.owner === p) }),
  'Tutan Mask': counterOn((l) => l.isCard && l.card.def.kind !== 'monster' && l.targets.flat().length === 1 && l.targets.flat().some((c) => c.zone === 'mzone' && c.faceUp && c.def.race === 'Zombie')),
  'Updraft': trap(run(async ({ d, o }) => { let n = 0; for (const c of both(d)) n += removeCtr(d, c, ctr(c, 'fog'), 'fog'); await d.damage(o, 300 * n); }, (d) => both(d).reduce((s, c) => s + ctr(c, 'fog'), 0) * 300 - 200)),
  "Vanity's Call": trap(run(async ({ d, p, card }) => {
    for (const l of d.chain) if (l.card !== card) { l.negated = true; l.activationNegated = true; if (l.isCard && d.onField(l.card)) await d.destroy(l.card, 'effect', undefined, p); }
  }, 1000), { cost: [{ op: 'payHalf' }], cond: (d, c) => d.chain.length >= 3 && !d.chain.some((l) => l.card.def.name === c.def.name), when: (_d, ev) => ev.e === 'chain' }),
  'Venom Burn': trap(run(async ({ d, o, t }) => { const c = t[0]; if (c) { const n = removeCtr(d, c, ctr(c, 'venom'), 'venom'); await d.damage(o, 700 * n); } }, (d) => Math.max(-1, ...both(d).map((c) => ctr(c, 'venom') * 700))), { targets: [{ f: { ...M, fn: (_d, c) => ctr(c, 'venom') > 0 } }] }),
  'Virus Cannon': trap(run(async ({ d, p, o }) => {
    const cs = await d.select(p, 'Tribute any number of monsters', d.monsters(p).filter((c) => !c.token && d.tributeOk(c)), 1, 5, 'cost');
    for (const c of cs) await d.move(c, 'gy', { why: 'tribute' });
    for (let i = 0; i < cs.length; i++) { const c = await pick(d, o, 'Send a Spell Card from your Deck to the Graveyard', d.find(DECK({ kind: 'spell' }), o), 'cost'); if (c) await d.move(c, 'gy', { by: p }); }
    await d.shuffleDeck(o);
  }, -1), { req: [{ f: OWN_M }] }),
  'Volcanic Eruption': trap(destroyAll({ side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true }), { cond: (d, _c, p) => d.phase === 'EP' && d.tp === p && has(d, p, 'Jurassic World'), ai: (d, me) => d.fieldCards(opp(me)).length * 500 - d.fieldCards(me).length * 500 }),
  'Volcanic Recharge': trap(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Return up to 3 Volcanic monsters to the Deck', d.find({ ...GY_M('self'), set: 'Volcanic' }, p), 1, 3, 'good');
    for (const c of cs) await d.move(c, 'deck');
    await d.shuffleDeck(p);
  }, 100), { req: [{ f: { ...GY_M('self'), set: 'Volcanic' } }] }),
  'Wall of Revealing Light': passive({ lock: { attack: (d, src, a) => !!src && a.ctrl !== src.ctrl && d.atk(a) <= (src.data.paid ?? 0) } }, {
    ops: [run(async ({ d, p, card }) => {
      const max = Math.floor((d.players[p].lp - 1) / 1000);
      if (max < 1) return;
      const opts = Array.from({ length: max }, (_, i) => `${(i + 1) * 1000}`);
      const best = Math.max(0, ...d.monsters(opp(p)).map((c) => d.atk(c)));
      const n = (1 + (await d.option(p, 'Pay LP (multiples of 1000)', opts, Math.min(max - 1, Math.ceil(best / 1000) - 1)))) * 1000;
      await d.changeLP(p, -n, true);
      card.data.paid = n;
    }, (d, me) => (d.players[me].lp > 4000 ? 400 : -1))],
  }),
  'Weed Out': trap(destroyAll({ ...FU, pos: 'atk', minLv: 3, maxLv: 3 }), { cost: [{ op: 'payLP', n: 500 }], ai: (d, me) => scoreWipe(d, me, (c) => c.pos === 'atk' && d.lvOf(c) === 3) }),
  'Wonder Garage': {
    effects: [act({ ops: [] }), trig('destroyed', ssFrom(['hand'], { race: ['Machine'], maxLv: 4, fn: (_d, c) => c.def.name.includes('roid') }), { optional: true, from: ['gy'], cond: (_d, c) => c.mark.lastFaceUp === false })],
  },
  'Xing Zhen Hu': passive({
    lock: { activate: (_d, src, _p, c) => !!src && (src.data.sealed ?? []).includes(c.uid) && !c.faceUp },
  }, { targets: [{ f: { side: 'any', zone: ['szone', 'fzone'], faceUp: false, notThis: true }, n: 2 }], ops: [run(({ card, link }) => { card.data.sealed = (link.targets[0] ?? []).map((c) => c.uid); }, 600)] }),
  'Zero Gravity': trap({ op: 'pos', s: { t: 'all', f: FU }, to: 'swap' }, { ai: (d, me) => d.monsters(opp(me)).filter((c) => c.faceUp && c.pos === 'atk').length * 300 - d.monsters(me).filter((c) => c.faceUp && c.pos === 'atk').length * 300 }),
  'Zoma the Spirit': {
    effects: [act({ ops: [run(async ({ d, p, card }) => {
      await trapMonster(d, card, p, { race: 'Zombie', attr: 'DARK', lv: 4, atk: 1800, def: 500 }, 'def');
    }, (d, me, _c, ev) => threat(d, me, ev) + 400)] }),
    // The trigger lives on the printed Trap: the monster definition is gone once it leaves the field.
    trig('battleDestroyed', run(({ d, card, link }) => { const o = link.trig?.other; if (o) return d.damage(opp(card.owner), d.atk(o) || (o.def.atk ?? 0), card); }), { from: ['gy'], cond: (_d, c) => c.mark.lastWhy === 'battle' })],
  },
};
void ST; void OPP_M; void atEndPhase; void destroyAtEnd;
