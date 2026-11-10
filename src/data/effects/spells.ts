// Spell Cards of the Joey the Passion catalog not covered by the original cardEffects.ts table.
import {
  type Card, type Def, type Duel, type Side,
  ATTRS, DECK, FU, GY_M, M, OPP_FU, OPP_M, OPP_ST, OWN_FU, OWN_M,
  act, bestRevive, destroyAll, destroyT, giveToHand, ign, opp, passive, pick, pickSeen, probe, probeTarget,
  randomOf, ritual, run, scoreWipe, search, spell, T, threat, trig, tributeFor, typeEquip, typeWipe, yes,
} from './lib';

const fieldToTop = (cost = 0): Def['effects'] => [trig('fieldToGY', run(async ({ d, p, card }) => {
  if (card.zone !== 'gy') return;
  if (cost) {
    if (d.players[p].lp <= cost || !(await yes(d, p, `Pay ${cost} LP to place ${card.def.name} on top of your Deck?`, card))) return;
    await d.changeLP(p, -cost, true);
  }
  await d.move(card, 'deck');
  d.log(`${card.def.name} is placed on top of the Deck.`);
}))];
/** Equip-card counter that grows at each Standby Phase of the equipped monster's controller. */
const standbyTicks = trig(['standby', 'oppStandby'], run(({ card }) => { card.data.n = (card.data.n ?? 0) + 1; }), { cond: (d, c) => d.equippedTo(c)?.ctrl === d.tp });
const oppPower = (d: Duel, me: Side) => Math.max(0, ...d.monsters(opp(me)).filter((c) => c.faceUp && c.pos === 'atk').map((c) => d.atk(c)));
const myWall = (d: Duel, me: Side) => Math.max(0, ...d.monsters(me).map((c) => (!c.faceUp ? 1200 : c.pos === 'atk' ? d.atk(c) : d.defv(c))));
const lockValue = (d: Duel, me: Side) => (oppPower(d, me) > myWall(d, me) ? 900 : 200);
const handOf = (d: Duel, s: Side) => d.players[s].hand;
const RITUALS: Record<string, string> = {
  'Beastly Mirror Ritual': "Fiend's Mirror", 'Black Illusion Ritual': 'Relinquished', 'Commencement Dance': 'Performance of Sword',
  'Dark Magic Ritual': 'Magician of Black Chaos', 'Black Luster Ritual': 'Black Luster Soldier', 'Turtle Oath': 'Crab Turtle',
  'Curse of the Masked Beast': 'The Masked Beast', 'Garma Sword Oath': 'Garma Sword', 'Javelin Beetle Pact': 'Javelin Beetle',
  'Revival of Dokurorider': 'Dokurorider', 'Zera Ritual': 'Zera The Mant', 'Resurrection of Chakra': 'Chakra',
  'Hamburger Recipe': 'Hungry Burger', "Fortress Whale's Oath": 'Fortress Whale', 'War-Lion Ritual': 'Super War-Lion', "Novox's Prayer": 'Skull Guardian',
};
const LETTERS = ['Spirit Message "I"', 'Spirit Message "N"', 'Spirit Message "A"', 'Spirit Message "L"'];

export const SPELLS: Record<string, Def> = {
  ...Object.fromEntries(Object.entries(RITUALS).map(([s, m]) => [s, ritual(m)])),
  ...Object.fromEntries(LETTERS.map((n) => [n, {
    effects: [act({ ops: [], cond: () => false }), trig('leftField', run(async ({ d, card }) => {
      const b = d.byUid(card.last.board);
      if (!b || !d.onField(b)) return;
      for (const x of d.spellTraps(b.ctrl).filter((x) => x === b || x.data.board === b.uid)) await d.move(x, 'gy', { why: 'rule' });
    }), { cond: (_d, c) => c.last.board !== undefined })],
    selfDestructIf: (d: Duel, c: Card) => { if (c.data.board === undefined) return true; const b = d.byUid(c.data.board); return !b || !d.onField(b); },
  } as Def])),
  'Eternal Draught': typeWipe('Fish'),
  'Breath of Light': typeWipe('Rock'),
  'Stain Storm': typeWipe('Machine'),
  'Eradicating Aerosol': typeWipe('Insect'),
  'Last Day of Witch': typeWipe('Spellcaster'),

  "Nightmare's Steelcage": { stays: true, lifetime: 2, lock: { attack: () => true }, effects: [act({ ops: [], ai: lockValue })] },
  'Swords of Revealing Light': {
    stays: true, lifetime: 3,
    lock: { attack: (_d, src, a) => !!src && a.ctrl !== src.ctrl },
    effects: [act({ ops: [run(async ({ d, o }) => { for (const m of d.monsters(o)) if (!m.faceUp) await d.changePos(m, 'reveal'); }, (d, me) => lockValue(d, me) + 300)] })],
  },
  'The Shallow Grave': spell(run(async ({ d }) => {
    for (const s of [d.tp, opp(d.tp)]) {
      const c = await pick(d, s, 'The Shallow Grave: Special Summon a monster from your Graveyard', d.players[s].gy.filter((m) => d.revivable(m) && d.canSpecial(s, m)), 'good');
      if (c) await d.specialSummon(c, s, 'def', 'special', true);
    }
  }, (d, me) => bestRevive(d, me) - bestRevive(d, opp(me)))),
  'The Dark Door': passive({ lock: { attack: (d, _s, a) => d.attackCount[a.ctrl] >= 1 } }, { ai: (d, me) => (d.monsters(opp(me)).length > 1 ? 300 : -1) }),
  'Delinquent Duo': spell(run(async ({ d, p, o }) => {
    const r = randomOf(d, handOf(d, o));
    if (r) await d.discard(o, [r], p);
    const c = await pick(d, o, 'Delinquent Duo: discard a card from your hand', handOf(d, o), 'cost');
    if (c) await d.discard(o, [c], p);
  }, 700), { cost: [{ op: 'payLP', n: 1000 }], cond: (d, _c, p) => handOf(d, opp(p)).length > 0 }),
  'Share the Pain': spell({ op: 'tribute', s: { t: 'choose', f: OPP_M, by: 'opp' } }, { cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }], ai: -1 }),
  'Horn of the Unicorn': { equip: { f: FU, atk: 700, def: 700 }, effects: fieldToTop() },
  'Malevolent Nuzzler': { equip: { f: FU, atk: 700 }, effects: fieldToTop(500) },
  'Horn of Light': { equip: { f: FU, def: 800 }, effects: fieldToTop(500) },
  'Sword of Deep-Seated': {
    equip: { f: FU, atk: 500, def: 500 },
    effects: [trig('toGY', run(async ({ d, card }) => { if (card.zone === 'gy') { await d.move(card, 'deck'); d.log('Sword of Deep-Seated is placed on top of the Deck.'); } }))],
  },
  'Lightning Blade': {
    equip: { f: { ...FU, race: ['Warrior'] }, atk: 800 },
    auraFn: (d, src, t) => (d.equippedTo(src) && d.attrOf(t) === 'WATER' ? { atk: -500 } : undefined),
  },
  'Black Pendant': { equip: { f: FU, atk: 500 }, effects: [trig('fieldToGY', { op: 'damage', who: 'opp', n: 500 })] },
  'Axe of Despair': {
    equip: { f: FU, atk: 1000 },
    effects: [trig('fieldToGY', run(async ({ d, p, card }) => {
      const c = await pick(d, p, 'Axe of Despair: Tribute a monster to place it on top of your Deck', d.monsters(p).filter((m) => d.tributeOk(m)), 'cost', true);
      if (!c || card.zone !== 'gy') return;
      d.log(`${d.name(p)} tributes ${c.def.name}.`);
      await d.move(c, 'gy', { why: 'tribute' });
      await d.move(card, 'deck');
    }), { optional: true, cond: (d, _c, p) => d.monsters(p).some((m) => d.tributeOk(m)), ai: -1 })],
  },
  'Tailor of the Fickle': spell(run(async ({ d, p }) => {
    const eqs = [0, 1].flatMap((s) => d.players[s].s).filter((e): e is Card => !!e && e.faceUp && !!d.equippedTo(e));
    const eq = await pick(d, p, 'Tailor of the Fickle: choose an Equip Card', eqs, 'good');
    if (!eq) return;
    const f = d.eqSpec(eq)?.f ?? FU;
    const old = d.equippedTo(eq);
    const t = await pick(d, p, `Choose the new monster for ${eq.def.name}`, [...d.monsters(0), ...d.monsters(1)].filter((m) => m !== old && m.faceUp && d.match(m, f, eq.ctrl, eq) && d.affects(eq, m)), 'good');
    if (t) { eq.equipTo = t.uid; d.log(`${eq.def.name} is moved to ${t.def.name}.`); await d.emit({ t: 'stat', card: t }); }
  }, 150), { cond: (d) => [0, 1].some((s) => d.players[s as Side].s.some((e) => !!e && e.faceUp && !!d.equippedTo(e))) }),
  'Ekibyo Drakmord': {
    equip: { f: FU, rules: ['cantAttack'] },
    effects: [trig('endPhase', run(async ({ d, card }) => {
      const t = d.equippedTo(card);
      if (!t || d.tp !== t.ctrl) return;
      card.data.ends = (card.data.ends ?? 0) + 1;
      if (card.data.ends < 2) return;
      await d.destroy(t, 'effect', undefined, card.ctrl);
      if (d.onField(card) || card.zone === 'gy') await d.toHand(card);
    }), { cond: (d, c) => !!d.equippedTo(c) })],
  },
  'Exchange': spell(run(async ({ d, p, o }) => {
    const mine = await pickSeen(d, p, "Exchange: take a card from your opponent's hand", handOf(d, o), 'good');
    const theirs = await pickSeen(d, o, "Exchange: take a card from your opponent's hand", handOf(d, p), 'good');
    if (mine) await giveToHand(d, mine, p);
    if (theirs) await giveToHand(d, theirs, o);
  }, 100), { cond: (d, c, p) => handOf(d, p).filter((x) => x !== c).length > 0 && handOf(d, opp(p)).length > 0 }),
  'Chosen One': spell(run(async ({ d, p }) => {
    const hand = handOf(d, p);
    const m = await pick(d, p, 'Chosen One: choose a Monster Card', hand.filter((c) => c.def.kind === 'monster'), 'cost');
    const others = await d.select(p, 'Chosen One: choose 2 non-Monster Cards', hand.filter((c) => c.def.kind !== 'monster'), 2, 2, 'cost');
    if (!m || others.length < 2) return;
    const three = [m, ...others];
    const chosen = randomOf(d, three)!;
    d.log(`Your opponent picks ${chosen.def.name}.`);
    if (chosen === m && d.canSpecial(p, m)) {
      for (const c of others) await d.move(c, 'gy');
      await d.specialSummon(m, p, await d.askPos(p, m));
    } else for (const c of three) await d.move(c, 'gy');
  }, -1), { cond: (d, c, p) => { const h = handOf(d, p).filter((x) => x !== c); return h.some((x) => x.def.kind === 'monster') && h.filter((x) => x.def.kind !== 'monster').length >= 2; } }),
  'Confiscation': spell(run(async ({ d, p, o }) => {
    const c = await pickSeen(d, p, 'Confiscation: choose a card to discard', handOf(d, o), 'bad');
    if (c) await d.discard(o, [c], p);
  }, 800), { cost: [{ op: 'payLP', n: 1000 }], cond: (d, _c, p) => handOf(d, opp(p)).length > 0 }),
  'Bait Doll': spell(run(async ({ d, p, t, card }) => {
    const c = t[0];
    if (c && d.onField(c) && !c.faceUp) {
      if (c.def.kind === 'trap') {
        const owner = c.ctrl;
        const idx = c.def.effects?.findIndex((e) => e.type === 'activate') ?? -1;
        const eff = idx >= 0 ? c.def.effects![idx] : undefined;
        c.faceUp = true;
        d.log(`${c.def.name} is forced to activate.`);
        await d.emit({ t: 'flip', card: c });
        const timely = !!eff && !eff.on && !eff.when && !eff.phase && !d.negated(c) && (!eff.cond || eff.cond(d, c, owner)) && (eff.cost ?? []).every((o) => d.opFeasible(o, owner, c, true));
        if (timely && eff) {
          const l = d.pseudoLink(c, owner);
          Object.assign(l, { eff, idx, isCard: true });
          for (let i = 0; i < (eff.targets?.length ?? 0); i++) {
            const ts = eff.targets![i];
            const picked = await d.select(owner, `Select a target for ${c.def.name}`, d.targetCands(eff, i, owner, c), Math.min(ts.min ?? ts.n ?? 1, d.targetCands(eff, i, owner, c).length), ts.n ?? 1, d.targetPurpose(eff, i, c.def), undefined, 'target');
            l.targets.push(picked); l.tmv.push(picked.map((x) => x.mv));
          }
          for (const op of eff.cost ?? []) await d.runOp(op, l, true);
          for (const op of eff.ops) { await d.runOp(op, l, false); await d.cleanup(); }
          const stays = c.def.stype === 'continuous' || c.equipTo !== undefined;
          if (d.onField(c) && !stays) await d.move(c, 'gy', { why: 'rule' });
        } else {
          d.log('The timing is incorrect: it is negated and destroyed.');
          await d.destroy(c, 'effect', undefined, p);
        }
      } else {
        await d.reveal(p, [c], 'The Set card');
        d.log(`${c.def.name} is returned face-down.`);
      }
    }
    if (d.onField(card)) { await d.move(card, 'deck'); await d.shuffleDeck(card.owner); }
  }, 200), { targets: [{ f: { side: 'any', zone: 'szone', faceUp: false, notThis: true } }] }),
  'Vengeful Bog Spirit': passive({ lock: { attack: (d, _s, a) => a.data.sumTurn === d.turn } }),
  'Restructer Revolution': spell(run(({ d, o, card }) => d.damage(o, 200 * handOf(d, o).length, card), (d, me) => 200 * handOf(d, opp(me)).length * 0.6)),
  'Cold Wave': spell(run(({ d }) => d.addTemp({ until: d.turn + 1, lock: { activate: (_d, _s, _p, c) => c.def.kind !== 'monster', set: (_d, _s, _p, c) => c.def.kind !== 'monster' } }), 100), {
    cond: (d) => d.phase === 'M1' && d.m1Actions === 0,
  }),
  'Mystic Box': spell(run(async (x) => {
    const { d, p, o, t } = x;
    const mine = T(x, 1)[0];
    if (t[0]) await d.destroy(t[0], 'effect', undefined, p);
    if (mine && mine.zone === 'mzone') await d.takeControl(mine, o, true);
  }, 300), { targets: [{ f: OPP_M }, { f: OWN_M }] }),
  'Ground Collapse': passive({
    lock: { zone: (_d, src, s, slot) => !!src && ((src.data.zones ?? []) as [Side, number][]).some(([a, b]) => a === s && b === slot) },
  }, {
    cond: (d) => d.freeCount(0, 'm') + d.freeCount(1, 'm') >= 2,
    ops: [run(async ({ d, p, card }) => {
      const zones: [Side, number][] = [];
      for (const s of [p, opp(p)]) for (let i = 0; i < 5; i++) if (!d.players[s].m[i]) zones.push([s, i]);
      const chosen: [Side, number][] = [];
      for (let k = 0; k < 2 && zones.length; k++) {
        const pref = Math.max(0, zones.findIndex(([s]) => s !== p));
        const i = await d.option(p, 'Ground Collapse: choose an empty Monster Card Zone', zones.map(([s, z]) => `${s === p ? 'Your' : "Opponent's"} Monster Zone ${z + 1}`), pref);
        chosen.push(zones.splice(i, 1)[0]);
      }
      card.data.zones = chosen;
    }, 100)],
  }),
  'Paralyzing Potion': { equip: { f: { ...FU, fn: (d, c) => d.raceOf(c) !== 'Machine' }, rules: ['cantAttack'] } },
  'Curse of Fiend': spell(run(async ({ d }) => {
    for (const m of [...d.monsters(0), ...d.monsters(1)]) if (m.faceUp) { await d.changePos(m, 'swap'); m.posTurn = d.turn; }
  }, -1), { phase: ['SP'] }),
  'Bright Castle': { equip: { f: { ...FU, attr: 'LIGHT' }, atk: 700 } },
  'Ring of Magnetism': {
    equip: { f: OWN_FU, atk: -500, def: -500 },
    lock: { target: (d, src, a, t) => { const e = src ? d.equippedTo(src) : undefined; return !!e && a.ctrl !== e.ctrl && t !== e; } },
  },
  'Fissure': spell(run(async ({ d, p, o, card }) => {
    const fu = d.monsters(o).filter((m) => m.faceUp && d.affects(card, m));
    if (!fu.length) return;
    const low = Math.min(...fu.map((m) => d.atk(m)));
    const c = await pick(d, p, 'Fissure: destroy the monster with the lowest ATK', fu.filter((m) => d.atk(m) === low), 'bad');
    if (c) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => { const fu = d.monsters(opp(me)).filter((m) => m.faceUp); return fu.length ? Math.min(...fu.map((m) => d.atk(m))) + 300 : -1; }), { req: [{ f: OPP_FU }] }),
  'Stop Defense': spell({ op: 'pos', s: { t: 'target' }, to: 'atk' }, { targets: [{ f: { ...OPP_M, pos: 'def' } }] }),
  'Block Attack': spell({ op: 'pos', s: { t: 'target' }, to: 'def' }, { targets: [{ f: { ...OPP_FU, pos: 'atk' } }] }),
  'Eternal Rest': spell(destroyAll({ ...M, fn: (d, c) => d.equipsOf(c).length > 0 }), { ai: (d, me) => scoreWipe(d, me, (c) => d.equipsOf(c).length > 0) }),
  'Snatch Steal': {
    equip: { f: OPP_FU },
    effects: [
      act({ targets: [{ f: OPP_FU }], ops: [{ op: 'equip' }, run(async ({ d, p, card }) => { const t = d.equippedTo(card); if (t) await d.takeControl(t, p, false, card); }, 1500)] }),
      trig('oppStandby', run(({ d, o }) => d.heal(o, 1000)), { cond: (d, c) => !!d.equippedTo(c) }),
    ],
  },
  'Fusion Gate': passive({
    effects: [ign(run(({ d, p, card }) => d.doFusion(p, card, true), 1200), { label: 'Fusion Summon (banish materials)', cond: (d, _c, p) => d.fusionOptions(p).length > 0 })],
  }),
  'Shield & Sword': spell(run(({ d }) => { for (const m of [...d.monsters(0), ...d.monsters(1)]) if (m.faceUp) m.data.swap = d.turn; }, -1)),
  'The Inexperienced Spy': spell(run(async ({ d, p, o }) => {
    const c = await pick(d, p, "Choose a card in your opponent's hand to look at", handOf(d, o), 'good');
    if (c) await d.reveal(p, [c], "A card in your opponent's hand");
  }, 50), { cond: (d, _c, p) => handOf(d, opp(p)).length > 0 }),
  'The Forceful Sentry': spell(run(async ({ d, p, o }) => {
    const c = await pickSeen(d, p, 'The Forceful Sentry: return a card to the Deck', handOf(d, o), 'bad');
    if (c) { await d.move(c, 'deck'); d.log(`${c.def.name} is shuffled into the Deck.`); await d.shuffleDeck(o); }
  }, 700), { cond: (d, _c, p) => handOf(d, opp(p)).length > 0 }),
  'Riryoku': spell(run((x) => {
    const { d } = x;
    const a = T(x, 0)[0], b = T(x, 1)[0];
    if (!a || a.zone !== 'mzone') return;
    const half = Math.floor(d.atk(a) / 2);
    d.addMod(a, -half, 0);
    if (b && b.zone === 'mzone') d.addMod(b, half, 0);
    d.log(`${a.def.name} loses ${half} ATK${b ? ` and ${b.def.name} gains it` : ''}.`);
  }, (d) => (d.phase === 'M1' ? 300 : -1)), { targets: [{ f: FU }, { f: FU, good: true }] }),
  'Insect Imitation': spell(run(async ({ d, p, link }) => {
    const lv = (link.data.t?.lv ?? -1) + 1;
    const c = await pick(d, p, 'Insect Imitation: Special Summon an Insect', d.find(DECK({ kind: 'monster', race: ['Insect'], fn: (_d, m) => m.def.lv === lv }), p).filter((m) => d.canSpecial(p, m)), 'good');
    if (c) {
      const i = await d.option(p, `Summon ${c.def.name}`, ['Face-up Attack Position', 'Face-down Defense Position'], 0);
      await d.specialSummon(c, p, 'atk', 'special', i === 1);
    }
    await d.shuffleDeck(p);
  }, 300), { cost: [tributeFor('t')] }),
  'The Flute of Summoning Dragon': spell(run(async ({ d, p }) => {
    const ds = handOf(d, p).filter((c) => c.def.kind === 'monster' && c.def.race === 'Dragon' && d.canSpecial(p, c));
    const cs = await d.select(p, 'Special Summon up to 2 Dragons from your hand', ds, 1, Math.min(2, d.freeCount(p, 'm'), ds.length), 'good');
    for (const c of cs) await d.specialSummon(c, p, await d.askPos(p, c));
  }, 1500), { req: [{ f: { ...FU, name: 'Lord of D.' } }], cond: (d, _c, p) => d.canSpecial(p) && handOf(d, p).some((c) => c.def.kind === 'monster' && c.def.race === 'Dragon') }),
  "Harpie's Feather Duster": spell(destroyAll(OPP_ST), { ai: (d, me) => 600 * d.spellTraps(opp(me)).length - 100 }),
  'Gravedigger Ghoul': spell({ op: 'banish', s: { t: 'target' } }, { targets: [{ f: GY_M('opp'), n: 2, min: 1 }], ai: 50 }),
  "Gravekeeper's Servant": passive({
    effects: [trig('anyAttack', run(({ d, link }) => { const a = link.trig?.other; if (a) return d.mill(a.ctrl, 1, link.p); }), { cond: (_d, _c, p, ev) => ev?.e === 'attack' && ev.player !== p })],
  }),
  'Premature Burial': spell(run(async ({ d, p, card, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'gy' || !d.onField(card)) return;
    if (await d.specialSummon(m, p, 'atk', 'special', false, card)) { card.equipTo = m.uid; card.boundTo = m.uid; card.eq = {}; d.log(`Premature Burial is equipped to ${m.def.name}.`); }
  }, (d, me) => bestRevive(d, me) - 300), { cost: [{ op: 'payLP', n: 800 }], targets: [{ f: { ...GY_M('self'), fn: (d, c) => d.revivable(c) }, good: true }], cond: (d, _c, p) => d.canSpecial(p) }),
  'Mage Power': { equip: { f: FU, fn: (d, eq) => { const n = 500 * d.players[eq.ctrl].s.filter(Boolean).length; return { atk: n, def: n }; } } },
  'Mask of Dispel': passive({
    selfDestructIf: (d, c) => { if (c.data.tgt === undefined) return false; const t = d.byUid(c.data.tgt); return !t || t.mv !== c.data.tgtMv || !d.onField(t); },
    effects: [trig(['standby', 'oppStandby'], run(({ d, card }) => { const t = d.byUid(card.data.tgt); if (t) return d.damage(t.ctrl, 500, card); }), { cond: (d, c) => { const t = d.byUid(c.data.tgt); return !!t && d.onField(t) && t.ctrl === d.tp; } })],
  }, {
    targets: [{ f: { side: 'any', zone: ['szone', 'fzone'], kind: 'spell', faceUp: true, notThis: true } }],
    ops: [run(({ card, t }) => { if (t[0]) { card.data.tgt = t[0].uid; card.data.tgtMv = t[0].mv; } }, 300)],
  }),
  'Elegant Egotist': spell(run(async ({ d, p }) => {
    const c = await pick(d, p, 'Elegant Egotist: Special Summon', d.find({ side: 'self', zone: ['hand', 'deck'], name: ['Harpie Lady', 'Harpie Lady Sisters'] }, p).filter((m) => m.def.alias === undefined && d.canSpecial(p, m)), 'good');
    if (!c) return;
    const fromDeck = c.zone === 'deck';
    if (await d.specialSummon(c, p, await d.askPos(p, c))) c.properly = true;
    if (fromDeck) await d.shuffleDeck(p);
  }, 1500), { req: [{ f: { ...FU, name: 'Harpie Lady' } }], cond: (d, _c, p) => d.canSpecial(p) }),
  'Infinite Cards': passive({ lock: { handLimit: true } }),
  'Insect Barrier': passive({ lock: { attack: (d, src, a) => !!src && a.ctrl !== src.ctrl && d.raceOf(a) === 'Insect' } }),
  'Magical Labyrinth': {
    equip: { f: { ...FU, name: 'Labyrinth Wall' } },
    effects: [ign(run(async ({ d, p, card }) => {
      const wall = d.equippedTo(card);
      const ws = d.find({ side: 'self', zone: ['deck', 'hand'], name: 'Wall Shadow' }, p)[0];
      if (!wall || !ws) return;
      d.log(`${d.name(p)} tributes Labyrinth Wall.`);
      await d.move(wall, 'gy', { why: 'tribute' });
      const fromDeck = ws.zone === 'deck';
      if (await d.specialSummon(ws, p, await d.askPos(p, ws))) ws.properly = true;
      if (fromDeck) await d.shuffleDeck(p);
    }, 1500), { from: ['szone'], label: 'Tribute Labyrinth Wall: summon Wall Shadow', cond: (d, c, p) => { const w = d.equippedTo(c); return !!w && w.ctrl === p && d.tributeOk(w) && d.find({ side: 'self', zone: ['deck', 'hand'], name: 'Wall Shadow' }, p).length > 0; } })],
  },
  'Mooyan Curry': spell({ op: 'heal', who: 'self', n: 200 }),
  'Raimei': spell({ op: 'damage', who: 'opp', n: 300 }),
  'Burning Land': passive({ effects: [trig(['standby', 'oppStandby'], run(({ d, card }) => d.damage(d.tp, 500, card)), { cond: (d, c) => d.onField(c) })] }, { ops: [destroyAll({ side: 'any', zone: 'fzone' })], ai: -1 }),
  'Monster Recovery': spell(run(async ({ d, p, t }) => {
    const hand = [...handOf(d, p)];
    if (t[0] && t[0].zone === 'mzone') await d.move(t[0], 'deck');
    for (const c of hand) await d.move(c, 'deck');
    await d.shuffleDeck(p);
    await d.draw(p, Math.min(hand.length, d.players[p].deck.length));
  }, -1), { targets: [{ f: OWN_M }] }),
  'De-Fusion': spell(run(async ({ d, p, t }) => {
    const f = t[0];
    if (!f || f.zone !== 'mzone') return;
    await d.move(f, 'extra');
    d.log(`${f.def.name} returns to the Fusion Deck.`);
    const used: Card[] = [];
    for (const m of f.def.mats ?? []) {
      const c = d.players[p].gy.find((x) => !used.includes(x) && d.matMatches(m, x));
      if (!c) return;
      used.push(c);
    }
    if (d.freeCount(p, 'm') < used.length || !(await yes(d, p, 'De-Fusion: Special Summon the Fusion-Material Monsters?'))) return;
    for (const c of used) await d.specialSummon(c, p, await d.askPos(p, c));
  }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).filter((c) => c.def.mtype === 'fusion').map((c) => d.atk(c)))), { targets: [{ f: { ...M, mtype: ['fusion'] } }] }),
  'Fusion Sage': spell(search({ name: 'Polymerization' }), { ai: 400 }),
  'Darkness Approaches': spell(run(({ d, t }) => (t[0] ? d.setFaceDown(t[0]) : undefined), -1), { cost: [{ op: 'discard', who: 'self', n: 2 }], targets: [{ f: FU }] }),
  'Dark-Piercing Light': spell(run(async ({ d, o }) => { for (const m of d.monsters(o)) if (!m.faceUp) await d.changePos(m, 'reveal'); }, 200), { req: [{ f: { ...OPP_M, faceUp: false } }] }),
  'Last Will': spell(run(({ d, p }) => {
    let used = false;
    d.addTemp({ until: d.turn, p, tag: 'lastWill', sent: async (dd, c, ctrl) => {
      if (used || ctrl !== p || c.def.kind !== 'monster') return;
      const cands = dd.find(DECK({ kind: 'monster', maxAtk: 1500 }), p).filter((m) => dd.canSpecial(p, m));
      if (!cands.length || !(await yes(dd, p, 'Last Will: Special Summon a monster with 1500 or less ATK from your Deck?'))) return;
      used = true;
      const m = await pick(dd, p, 'Last Will: choose a monster', cands, 'good');
      if (m) { await dd.specialSummon(m, p, await dd.askPos(p, m)); await dd.shuffleDeck(p); }
    } });
  }, -1)),
  'The Cheerful Coffin': spell(run(async ({ d, p, card }) => {
    const cs = await d.select(p, 'The Cheerful Coffin: discard up to 3 Monster Cards', handOf(d, p).filter((c) => c.def.kind === 'monster' && c !== card), 0, 3, 'cost');
    await d.discard(p, cs, null);
  }, -1)),
  'Spirit Elimination': spell(run(({ d, p }) => d.addTemp({ until: d.turn, p, tag: 'spiritElim' }), -1)),
  'Dimensionhole': spell(run(async ({ d, p, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone') return;
    const slot = m.slot, pos = m.pos;
    await d.banish(m);
    d.addTemp({ until: d.turn + 1, lock: { zone: (_d, _s, side, i) => side === p && i === slot } });
    d.schedule({ at: 'SP', side: p, fn: async () => {
      if (m.zone !== 'banished' || !d.placeMonster(m, p, true, pos)) return;
      d.log(`${m.def.name} returns to the field.`);
      await d.emit({ t: 'move', card: m, from: 'banished', to: 'mzone' });
    } });
  }, -1), { targets: [{ f: OWN_M }] }),
  'Remove Trap': spell(destroyT, { targets: [{ f: { side: 'any', zone: 'szone', kind: 'trap', faceUp: true } }] }),
  'Scapegoat': spell(run(async ({ d, p }) => {
    for (let i = 0; i < 4; i++) await d.summonToken(p, 'Sheep Token', 'def');
    d.addTemp({ until: d.turn, p, tag: 'noSummon' });
  }, (d, me, _c, ev) => (threat(d, me, ev) > 0 || (d.monsters(me).length === 0 && d.monsters(opp(me)).length > 0 && d.tp !== me) ? 900 : -1)), {
    cond: (d, _c, p) => d.freeCount(p, 'm') >= 4 && !d.hasTemp('noSummon', p),
  }),
  'Multiply': spell(run(async ({ d, p }) => {
    const n = d.freeCount(p, 'm');
    for (let i = 0; i < n; i++) await d.summonToken(p, 'Kuriboh Token', 'def');
  }, (d, me, _c, ev) => (threat(d, me, ev) > 0 ? 800 : -1)), { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Kuriboh' } } }] }),
  'Jam Breeding Machine': passive({
    lock: { summon: (_d, src, p, c) => !!src && p === src.ctrl && c.def.name !== 'Slime Token' },
    effects: [trig('standby', run(({ d, p }) => d.summonToken(p, 'Slime Token', 'atk')), { cond: (d, c) => d.onField(c) })],
  }, { ai: 300 }),
  'Card of Safe Return': passive({
    onSummon: async (d, src, c, _how, p) => {
      if (p !== src.ctrl || c.data.from !== 'gy' || c.owner !== src.ctrl) return;
      if (await yes(d, p, 'Card of Safe Return: draw 1 card?', src)) await d.draw(p, 1);
    },
  }),
  'Toon World': passive({}, { cost: [{ op: 'payLP', n: 1000 }], ai: (d, me) => (d.players[me].hand.some((c) => c.def.summonCond) ? 600 : -1) }),
  'Graceful Dice': spell(run(async ({ d, p }) => { const n = (await d.die()) * 100; for (const m of d.monsters(p)) if (m.faceUp) d.addMod(m, n, n); }, (d) => (d.phase === 'BP' || d.phase === 'M1' ? 300 : -1)), { req: [{ f: OWN_FU }] }),
  'Limiter Removal': spell(run(({ d, p }) => {
    const ms = d.monsters(p).filter((m) => m.faceUp && d.raceOf(m) === 'Machine');
    const mvs = ms.map((m) => m.mv);
    for (const m of ms) d.addMod(m, d.atk(m), 0);
    d.schedule({ at: 'EP', turn: d.turn, fn: async () => { for (const [i, m] of ms.entries()) if (m.mv === mvs[i] && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, p); } });
  }, (d) => (d.phase === 'BP' ? 500 : -1)), { req: [{ f: { ...OWN_FU, race: ['Machine'] } }] }),
  'Painful Choice': spell(run(async ({ d, p, o }) => {
    const five = await d.select(p, 'Painful Choice: select 5 cards from your Deck', d.players[p].deck, 5, 5, 'good', undefined, undefined, true);
    await d.reveal(o, five, 'Painful Choice');
    const c = await pickSeen(d, o, 'Painful Choice: choose the card your opponent adds to their hand', five, 'cost');
    if (c) await d.toHand(c);
    for (const x of five) if (x !== c) await d.move(x, 'gy');
    await d.shuffleDeck(p);
  }, 400), { cond: (d, _c, p) => d.players[p].deck.length >= 5 }),
  'Mesmeric Control': spell(run(({ d, o }) => { const turn = d.turn + 1; d.addTemp({ until: turn, lock: { pos: (dd, _s, c) => c.ctrl === o && dd.turn === turn } }); }, 100)),
  'Prohibition': passive({
    lock: {
      activate: (_d, src, _p, c) => !!src && c.def.name === src.data.name && !c.mark.prohibOk,
      summon: (_d, src, _p, c) => !!src && c.def.name === src.data.name && !c.mark.prohibOk,
      set: (_d, src, _p, c) => !!src && c.def.name === src.data.name,
    },
  }, {
    ops: [run(async ({ d, p, card }) => {
      const seen = new Set<string>();
      const pool = d.allCards().filter((c) => !c.token && c !== card && !seen.has(c.def.name) && seen.add(c.def.name));
      const [c] = await d.select(p, 'Prohibition: declare a card name', pool, 1, 1, 'bad', undefined, undefined, true);
      if (!c) return;
      card.data.name = c.def.name;
      for (const x of [...d.fieldCards(0), ...d.fieldCards(1)]) if (x.def.name === c.def.name) x.mark.prohibOk = true;
      d.log(`${d.name(p)} declares "${c.def.name}".`);
    }, 300)],
  }),
  'Card Destruction': spell(run(async ({ d, p, o }) => {
    const n = [handOf(d, 0).length, handOf(d, 1).length];
    for (const s of [p, o]) await d.discard(s, [...handOf(d, s)], s === p ? null : p);
    for (const s of [p, o]) await d.draw(s, Math.min(n[s], d.players[s].deck.length));
  }, (d, me) => 300 * (handOf(d, opp(me)).length - handOf(d, me).length))),
  'Ancient Telescope': spell(run(({ d, p, o }) => d.reveal(p, d.players[o].deck.slice(-5).reverse(), "The top 5 cards of your opponent's Deck"), 20)),
  'Thousand Knives': spell(destroyT, { targets: [{ f: OPP_M }], req: [{ f: { ...OWN_FU, name: 'Dark Magician' } }] }),
  'Return of the Doomed': spell(run(({ d, p }) => d.schedule({ at: 'EP', turn: d.turn, fn: async () => {
    const c = await pick(d, p, 'Return of the Doomed: return a monster to your hand', d.battleGY.filter((m) => m.zone === 'gy' && m.owner === p), 'good');
    if (c) await d.toHand(c);
  } }), -1), { cost: [run(async ({ d, p, card }) => { const c = await pick(d, p, 'Discard a Monster Card', handOf(d, p).filter((x) => x.def.kind === 'monster' && x !== card), 'cost'); if (c) await d.discard(p, [c], null); }, 0, (d, p, card) => handOf(d, p).some((x) => x.def.kind === 'monster' && x !== card))] }),
  'Offerings to the Doomed': spell([destroyT, run(({ d, p }) => d.flag('skipDraw', p))], { targets: [{ f: FU }] }),
  'Tribute to The Doomed': spell(destroyT, { cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: M }] }),
  'Final Destiny': spell(run(async ({ d, p, card }) => {
    for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) if (c !== card) await d.destroy(c, 'effect', undefined, p);
  }, (d, me) => scoreWipe(d, me, () => true) - 1000), { cost: [{ op: 'discard', who: 'self', n: 5 }] }),
  'Makiu': spell(run(async ({ d, p, o, t }) => {
    const s = t[0];
    if (s && s.zone === 'mzone') { const a = d.atk(s); for (const m of [...d.monsters(o)]) if (d.defv(m) < a) await d.destroy(m, 'effect', undefined, p); }
    d.addTemp({ until: d.turn, p, tag: 'noBP' });
  }, 600), { targets: [{ f: { ...OWN_FU, fn: (d, c) => c.def.name === 'Summoned Skull' || d.raceOf(c) === 'Thunder' }, good: true }] }),
  'Dark Magic Curtain': spell(run(async ({ d, p }) => {
    const c = d.find(DECK({ name: 'Dark Magician' }), p)[0];
    if (c) { await d.specialSummon(c, p, await d.askPos(p, c)); await d.shuffleDeck(p); }
    d.addTemp({ until: d.turn, p, tag: 'noSummon' });
  }, 1400), { cost: [{ op: 'payHalf' }], cond: (d, _c, p) => d.canSpecial(p) && d.find(DECK({ name: 'Dark Magician' }), p).length > 0 }),
  'Seal of the Ancients': spell(run(({ d, p, o }) => d.reveal(p, d.fieldCards(o).filter((c) => !c.faceUp), "Your opponent's face-down cards"), 50), { cost: [{ op: 'payLP', n: 1000 }] }),
  'Miracle Dig': spell({ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'banished', kind: 'monster' }, n: 3 } }, { req: [{ f: { side: 'self', zone: 'banished', kind: 'monster' }, n: 5 }], ai: 100 }),
  'Soul Release': spell(run(async ({ d, p }) => {
    const cs = await d.select(p, 'Soul Release: banish up to 5 cards from the Graveyards', [...d.players[0].gy, ...d.players[1].gy].filter((c) => !d.banishLocked(p, c)), 1, 5, 'bad');
    for (const c of cs) await d.banish(c, p);
  }, 50), { cond: (d) => d.players[0].gy.length + d.players[1].gy.length > 0 }),
  'Soul Exchange': spell(run(({ d, p, t }) => {
    if (t[0]) d.addTemp({ until: d.turn, p, tag: 'soulExchange', data: t[0].uid });
    d.addTemp({ until: d.turn, p, tag: 'noBP' });
  }, (d, me) => (d.players[me].hand.some((c) => (c.def.lv ?? 0) >= 5) && !d.players[me].normalDone ? 500 : -1)), { targets: [{ f: OPP_M }] }),
  "Sword of Dragon's Soul": {
    equip: { f: { ...FU, race: ['Warrior'] }, atk: 700 },
    postBattle: (d, _self, o) => {
      if (!o || o.zone !== 'mzone' || d.raceOf(o) !== 'Dragon') return;
      const mv = o.mv;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (o.mv === mv && o.zone === 'mzone') await d.destroy(o, 'effect'); } });
    },
  },
  'Cyclon Laser': { equip: { f: { ...FU, name: 'Gradius' }, atk: 300, rules: ['pierce'] } },
  'Cyber Shield': { equip: { f: { ...FU, name: ['Harpie Lady', 'Harpie Lady Sisters'] }, atk: 500 } },
  'Dragonic Attack': { equip: { f: { ...FU, race: ['Warrior'] }, atk: 500, def: 500 }, raceFn: (_d, src, t) => (src.equipTo === t.uid ? 'Dragon' : undefined) },
  'Germ Infection': { equip: { f: { ...FU, fn: (d, c) => d.raceOf(c) !== 'Machine' }, fn: (_d, eq) => ({ atk: -300 * (eq.data.n ?? 0) }) }, effects: [standbyTicks] },
  'Stim-Pack': { equip: { f: FU, atk: 700, fn: (_d, eq) => ({ atk: -200 * (eq.data.n ?? 0) }) }, effects: [standbyTicks] },
  'Megamorph': {
    equip: { f: FU, fn: (d, eq, t) => {
      const me = d.players[eq.ctrl].lp, them = d.players[opp(eq.ctrl)].lp;
      const b = d.base(t, 'atk');
      return me < them ? { atk: b } : me > them ? { atk: -Math.floor(b / 2) } : undefined;
    } },
  },
  'United We Stand': { equip: { f: FU, fn: (d, eq) => { const n = 800 * d.monsters(eq.ctrl).filter((m) => m.faceUp).length; return { atk: n, def: n }; } } },
  '7 Completed': {
    equip: { f: { ...FU, race: ['Machine'] }, fn: (_d, eq) => (eq.data.def ? { def: 700 } : { atk: 700 }) },
    effects: [act({ targets: [{ f: { ...FU, race: ['Machine'] }, good: true }], ops: [run(async ({ d, p, card }) => { card.data.def = (await d.option(p, '7 Completed: increase which value?', ['ATK +700', 'DEF +700'], 0)) === 1; }), { op: 'equip' }] })],
  },
  'Scroll of Bewitchment': {
    equip: { f: FU },
    attrFn: (_d, src, t) => (src.equipTo === t.uid ? src.data.attr : undefined),
    effects: [act({ targets: [{ f: FU }], ops: [run(async ({ d, p, card }) => { card.data.attr = ATTRS[await d.option(p, 'Scroll of Bewitchment: choose an Attribute', ATTRS, 0)]; }, -1), { op: 'equip' }] })],
  },
  'Mask of Brutality': { equip: { f: FU, atk: 1000, def: -1000 }, upkeep: 1000 },
  'Mask of the Accursed': {
    equip: { f: FU, rules: ['cantAttack'] },
    effects: [trig('standby', run(({ d, card }) => { const t = d.equippedTo(card); if (t) return d.damage(t.ctrl, 500, card); }), { cond: (d, c) => !!d.equippedTo(c) })],
  },
  'Electro-Whip': typeEquip(['Thunder'], 300, 300),
  'Laser Cannon Armor': typeEquip(['Insect'], 300, 300),
  "Sebek's Blessing": spell(run(({ d, p, link }) => { const ev = link.ev; if (ev.e === 'damage') return d.heal(p, ev.n); }, (d, _me, _c, ev) => (ev.e === 'damage' ? ev.n * 0.5 : -1)), {
    when: (_d, ev, p) => ev.e === 'damage' && ev.battle && !!ev.direct && ev.player !== p && ev.src?.ctrl === p,
  }),
  'The Reliable Guardian': spell({ op: 'stat', s: { t: 'target' }, def: 700 }, { targets: [{ f: FU, good: true }] }),
  'Toll': passive({ lock: { tax: () => 500 } }),
  'Chain Energy': passive({ lock: { handCost: 500 } }),
  'Anti-Spell Fragrance': passive({ lock: { activate: (d, _s, _p, c) => c.def.kind === 'spell' && (c.zone === 'hand' || (!c.faceUp && c.turnIn >= d.turn)) } }),
  'Inspection': passive({
    effects: [trig('oppStandby', run(async ({ d, p, o }) => {
      const c = randomOf(d, handOf(d, o));
      if (!c || d.players[p].lp <= 500 || !(await yes(d, p, 'Inspection: pay 500 LP to look at a random card in your opponent\'s hand?'))) return;
      await d.changeLP(p, -500, true);
      await d.reveal(p, [c], "A card in your opponent's hand");
    }), { cond: (d, c, p) => d.onField(c) && handOf(d, opp(p)).length > 0 })],
  }),
  'Chorus of Sanctuary': passive({ aura: [{ f: { ...M, pos: 'def' }, def: 500 }] }),
  'De-Spell': spell(probe('spell'), { targets: [{ f: probeTarget('spell') }] }),
  'Nobleman of Crossout': spell(run(async ({ d, p, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone') return;
    const flipEff = !!m.def.effects?.some((e) => e.type === 'flip');
    const name = m.def.name;
    d.log(`The face-down monster is ${name}.`);
    if (await d.destroy(m, 'effect', undefined, p)) await d.banish(m, p);
    if (flipEff) for (const s of [0, 1] as Side[]) { for (const c of d.players[s].deck.filter((x) => x.def.name === name)) await d.banish(c); await d.shuffleDeck(s); }
  }, 800), { targets: [{ f: { ...M, faceUp: false } }] }),
  'Nobleman of Extermination': spell(run(async ({ d, p, t }) => {
    const c = t[0];
    if (!c || !d.onField(c)) return;
    const trap = c.def.kind === 'trap', name = c.def.name;
    d.log(`The face-down card is ${name}.`);
    if (await d.destroy(c, 'effect', undefined, p)) await d.banish(c, p);
    if (trap) for (const s of [0, 1] as Side[]) { for (const x of d.players[s].deck.filter((x) => x.def.name === name)) await d.banish(x); await d.shuffleDeck(s); }
  }, 700), { targets: [{ f: { side: 'any', zone: 'szone', faceUp: false, notThis: true } }] }),
  'Spiritualism': { noNegate: true, ...spell({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: OPP_ST }] }) },
};
