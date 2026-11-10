// Effect Monsters (and Ritual / Fusion Monsters with effects) of the Joey the Passion catalog.
import {
  type Card, type Def, type Duel, type Op, type Side,
  DECK, FU, M, OPP_FU, OPP_M, OWN_FU, OWN_M,
  attrSwing, banishProc, battleFoe, countFU, curse, destroyAll, discardSelf, flip, ign, isAttackOn, noAttackLock,
  onSummonSearch, opp, pick, probe, probeTarget, quick, randomOf, run, scoreWipe, search, standbyHeal, toon, trig,
  tributeNamed, tributeOther, tributeSelf, tributeToAttack, tributeFor, umi, yes,
} from './lib';

const oppDmg = (_d: Duel, _c: Card, p: Side, ev?: { e: string; player?: Side }) => ev?.e === 'damage' && ev.player !== p;
const onField = (d: Duel, c: Card) => c.zone === 'mzone' && d.onField(c);

/** "A monster attacked by this card is destroyed at the End Phase of the Nth turn after the attack." */
const doom = (turns: number, when: 'attacker' | 'attacked', pred: (d: Duel, o: Card) => boolean = () => true): Def => ({
  postBattle: (d, self, o, r) => {
    if (!o || o.zone !== 'mzone' || !pred(d, o)) return;
    if (when === 'attacker' ? r.att !== self : r.tgt !== self) return;
    const mv = o.mv;
    d.schedule({ at: 'EP', turn: d.turn + turns, fn: async () => { if (o.mv === mv && o.zone === 'mzone') await d.destroy(o, 'effect', undefined, self.owner); } });
  },
});

/** Kazejin / Suijin / Sanga: once, the attacker's ATK becomes 0. */
const zeroAttacker: Def = {
  effects: [quick(run(({ d, link }) => {
    const ev = link.ev;
    if (ev.e === 'attack' && ev.attacker.zone === 'mzone' && ev.attacker.faceUp) { d.addMod(ev.attacker, -d.atk(ev.attacker), 0); d.log(`${ev.attacker.def.name}'s ATK becomes 0.`); }
  }), {
    once: true, label: "Reduce the attacker's ATK to 0",
    when: (_d, ev, p, card) => isAttackOn(ev, p) && ev.target === card,
    ai: (d, _me, c, ev) => (ev.e === 'attack' ? d.atk(ev.attacker) - d.atk(c) + 400 : -1),
  })],
};

/** Crimson Sentry / Lady Panther / The Forgiving Maiden. */
const maiden = (where: 'hand' | 'top' | 'bottom'): Def => ({
  effects: [ign(run(async ({ d, t }) => {
    const c = t[0];
    if (!c || c.zone !== 'gy') return;
    if (where === 'hand') await d.toHand(c);
    else { await d.move(c, 'deck', { bottom: where === 'bottom' }); d.log(`${c.def.name} is placed on the ${where} of the Deck.`); }
  }, 300), {
    label: 'Tribute: recover a monster destroyed in battle', cost: [tributeSelf],
    targets: [{ f: { side: 'self', zone: 'gy', kind: 'monster', fn: (d, c) => d.battleGY.includes(c) }, good: true }],
  })],
});

/** Absorb an opponent's monster as an Equip Card and copy its ATK/DEF (Relinquished, Thousand-Eyes Restrict). */
const absorber = (extra: Def = {}): Def => ({
  effects: [ign(run(async ({ d, card, t }) => {
    const m = t[0];
    if (!m || m.zone !== 'mzone' || !onField(d, card)) return;
    const zero = !m.faceUp;
    if (await d.equipCard(m, card, {}, card.ctrl)) { m.data.absorbZero = zero; card.data.absorb = m.uid; await d.emit({ t: 'stat', card }); }
  }, (d, me) => Math.max(0, ...d.monsters(opp(me)).map((m) => d.atk(m)))), {
    opt: true, label: 'Equip an opponent\'s monster', targets: [{ f: OPP_M }],
    cond: (d, c) => !d.equipsOf(c).some((e) => e.uid === c.data.absorb),
  })],
  ...extra,
});
const absorbed = (d: Duel, c: Card) => d.equipsOf(c).find((e) => e.uid === c.data.absorb);

async function sameNameFromDeck(d: Duel, p: Side, card: Card, faceDown: boolean) {
  const list = d.find({ side: 'self', zone: 'deck', name: card.def.name }, p).filter((c) => d.canSpecial(p, c));
  const n = Math.min(list.length, d.freeCount(p, 'm'));
  if (!n) return;
  const chosen = await d.select(p, `Special Summon "${card.def.name}" from your Deck?`, list, 0, n, 'good');
  for (const c of chosen) await d.specialSummon(c, p, faceDown ? 'def' : 'atk', 'special', faceDown);
  if (chosen.length) await d.shuffleDeck(p);
}

const reviveOne = async (d: Duel, s: Side, text: string) => {
  const c = await pick(d, s, text, d.players[s].gy.filter((m) => d.revivable(m) && d.canSpecial(s, m)), 'good');
  if (!c) return;
  const i = await d.option(s, `Summon ${c.def.name}`, ['Face-up Attack Position', 'Face-down Defense Position'], (c.def.atk ?? 0) >= (c.def.def ?? 0) ? 0 : 1);
  await d.specialSummon(c, s, 'atk', 'special', i === 1);
};

const MOTHS: [string, number][] = [['Larvae Moth', 2], ['Great Moth', 4], ['Perfectly Ultimate Great Moth', 6]];
const mothsReady = (d: Duel, c: Card, p: Side) => MOTHS.filter(([n, k]) => (c.data.standbys ?? 0) >= k && d.find({ side: 'self', zone: ['hand', 'deck'], name: n }, p).length > 0);
const MAGNETS = ['Alpha The Magnet Warrior', 'Beta The Magnet Warrior', 'Gamma The Magnet Warrior'];
const EXODIA = ['Left Leg of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Arm of the Forbidden One'];
const VANILLA_RITUALS = [
  'Black Luster Soldier', 'The Masked Beast', 'Crab Turtle', 'Garma Sword', 'Javelin Beetle', 'Super War-Lion', 'Dokurorider',
  'Zera The Mant', 'Performance of Sword', 'Chakra', "Fiend's Mirror", 'Hungry Burger', 'Magician of Black Chaos', 'Fortress Whale', 'Skull Guardian',
];
const selfMod = (fn: (d: Duel, c: Card) => number, both = false): Def => ({ statFn: (d, c) => { const n = fn(d, c); return both ? { atk: n, def: n } : { atk: n }; } });
const tribute2: Op = { op: 'tribute', s: { t: 'choose', f: OWN_M, n: 2 } };

export const MONSTERS: Record<string, Def> = {
  ...Object.fromEntries(VANILLA_RITUALS.map((n) => [n, {}])),
  ...Object.fromEntries(['Mystical Sheep #1', 'Goddess with the Third Eye', 'Beastking of the Swamps', 'Versago the Destroyer'].map((n) => [n, { fusionSub: true }])),
  ...Object.fromEntries(['Jinzo #7', "Queen's Double", 'Mystic Lamp', 'Rainbow Flower', 'Leghul', 'Ooguchi'].map((n) => [n, { rules: ['direct'] }])),
  ...Object.fromEntries(['Kazejin', 'Suijin', 'Sanga of the Thunder'].map((n) => [n, zeroAttacker])),
  ...Object.fromEntries(['Toon Summoned Skull', 'Manga Ryu-Ran', 'Toon Mermaid', 'Blue-Eyes Toon Dragon'].map((n) => [n, toon()])),
  ...Object.fromEntries(['Wall Shadow', 'Dark Sage', 'Harpie Lady Sisters', 'Metalzoa', 'Red-Eyes Black Metal Dragon', 'Larvae Moth', 'Great Moth', 'Perfectly Ultimate Great Moth'].map((n) => [n, { noNormal: true }])),

  'The Little Swordsman of Aile': { effects: [ign({ op: 'stat', s: { t: 'this' }, atk: 700 }, { label: 'Tribute a monster: +700 ATK', cost: [tributeOther], ai: -1 })] },
  'Bite Shoes': { effects: [flip({ op: 'pos', s: { t: 'target' }, to: 'swap' }, { targets: [{ f: FU }] })] },
  'Tainted Wisdom': { effects: [trig('toDef', run(({ d, p }) => d.shuffleDeck(p)))] },
  "Hiro's Shadow Scout": {
    effects: [flip(run(async ({ d, p, o }) => {
      const before = d.players[o].hand.length;
      await d.draw(o, Math.min(3, d.players[o].deck.length));
      const drawn = d.players[o].hand.slice(before);
      await d.reveal(p, drawn, "Cards drawn by Hiro's Shadow Scout");
      await d.discard(o, drawn.filter((c) => c.def.kind === 'spell'), p);
    }))],
  },
  'Amazon Archer': { effects: [ign({ op: 'damage', who: 'opp', n: 1200 }, { label: 'Tribute 2: 1200 damage', cost: [tribute2] })] },
  'Ameba': { effects: [trig('controlChanged', run(({ d, card }) => d.damage(card.ctrl, 2000, card)), { once: true, cond: (_d, c) => c.ctrl !== c.owner && c.faceUp })] },
  'Griggle': { effects: [trig('controlChanged', run(({ d, card }) => d.heal(card.owner, 3000)), { once: true, cond: (_d, c) => c.ctrl !== c.owner && c.faceUp })] },
  'Invitation to a Dark Sleep': {
    effects: [trig(['normalSummoned', 'flipSummoned'], run(({ card, t }) => { if (t[0]) card.data.lockUid = t[0].uid; }), { targets: [{ f: OPP_M }] })],
    lock: noAttackLock((_d, src, a) => a.uid === src.data.lockUid),
  },
  'Beast of Gilfer': {
    effects: [trig('toGY', run(async ({ d, card, t }) => { if (t[0] && card.zone === 'gy') await d.equipCard(card, t[0], { atk: -500 }); }), { optional: true, targets: [{ f: FU }] })],
  },
  'Swordsman from a Foreign Land': doom(5, 'attacker'),
  'Zone Eater': doom(5, 'attacker'),
  'Steel Scorpion': doom(4, 'attacked', (d, o) => d.raceOf(o) !== 'Machine'),
  'Dimensional Warrior': {
    preBattle: async (d, self, other) => {
      if (!other) return;
      await d.banish(self);
      await d.banish(other);
      return true;
    },
  },
  'The Last Warrior from Another Planet': {
    effects: [trig('specialSummoned', destroyAll({ side: 'self', zone: 'mzone', notThis: true }))],
    lock: { summon: () => true },
  },
  'Minar': { effects: [trig('discarded', { op: 'damage', who: 'opp', n: 1000 })] },
  'Electric Snake': { effects: [trig('discarded', { op: 'draw', who: 'self', n: 2 }, { optional: true })] },
  'The Rock Spirit': { ...banishProc(1, { attr: 'EARTH' }), statFn: (d, c) => (d.phase === 'BP' && d.tp !== c.ctrl ? { atk: 300 } : undefined) },
  'Spirit of Flames': { ...banishProc(1, { attr: 'FIRE' }), statFn: (d, c) => (d.phase === 'BP' && d.tp === c.ctrl ? { atk: 300 } : undefined) },
  'Garuda the Wind Spirit': {
    ...banishProc(1, { attr: 'WIND' }),
    effects: [trig('endPhase', { op: 'pos', s: { t: 'target' }, to: 'swap' }, { optional: true, targets: [{ f: OPP_FU }], cond: (d, c) => d.tp !== c.ctrl && onField(d, c) })],
  },
  'Aqua Spirit': {
    ...banishProc(1, { attr: 'WATER' }),
    effects: [trig('oppStandby', run(async ({ d, t }) => { const m = t[0]; if (m) { await d.changePos(m, 'swap'); m.posTurn = d.turn; } }), { optional: true, targets: [{ f: OPP_FU }], cond: (d, c) => onField(d, c) })],
  },
  'Soul of Purity and Light': {
    ...banishProc(2, { attr: 'LIGHT' }),
    auraFn: (d, src, t) => (d.phase === 'BP' && d.tp !== src.ctrl && t.ctrl !== src.ctrl ? { atk: -300 } : undefined),
  },
  'Dark Necrofear': {
    ...banishProc(3, { race: ['Fiend'] }),
    effects: [trig('destroyed', run(({ d, card }) => {
      const owner = card.owner;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => {
        if (card.zone !== 'gy') return;
        const t = await pick(d, owner, "Dark Necrofear: equip an opponent's monster", d.monsters(opp(owner)).filter((m) => m.faceUp), 'bad');
        if (t && (await d.equipCard(card, t, {}, owner))) await d.takeControl(t, owner, false, card);
      } });
    }), { cond: (_d, c) => c.mark.destroyedHow === 'battle' || (c.mark.destroyedBy !== undefined && c.mark.destroyedBy !== c.owner) })],
  },
  'Insect Queen': {
    attackCost: tributeToAttack,
    statFn: (d) => ({ atk: 200 * countFU(d, (c) => d.raceOf(c) === 'Insect') }),
    effects: [trig('destroysByBattle', run(({ d, p }) => d.schedule({ at: 'EP', turn: d.turn, fn: () => d.summonToken(p, 'Insect Monster Token', 'atk') })))],
  },
  'Weather Report': {
    effects: [flip(run(async ({ d, p, o }) => {
      let hit = false;
      for (const c of d.spellTraps(o).filter((x) => x.faceUp && x.def.name === 'Swords of Revealing Light')) if (await d.destroy(c, 'effect', undefined, p)) hit = true;
      if (hit) { d.flag('extraBP', p); d.log(`${d.name(p)} may conduct two Battle Phases.`); }
    }))],
  },
  'Invader of the Throne': {
    effects: [flip(run(async ({ d, p, o, card, t }) => {
      const m = t[0];
      if (!m || m.zone !== 'mzone' || !onField(d, card)) return;
      if (d.freeSlot(p, 'm') >= 0) { await d.takeControl(m, p, true); await d.takeControl(card, o, true); }
      else { await d.takeControl(card, o, true); await d.takeControl(m, p, true); }
    }), { targets: [{ f: OPP_M }], cond: (d) => d.phase !== 'BP' })],
  },
  'Catapult Turtle': {
    effects: [ign(run(({ d, o, card, link }) => d.damage(o, Math.floor((link.data.t?.atk ?? 0) / 2), card), 500), { label: 'Tribute: damage equal to half its ATK', cost: [tributeFor('t')] })],
  },
  'The Immortal of Thunder': {
    effects: [flip({ op: 'heal', who: 'self', n: 3000 }), trig('fieldToGY', run(({ d, card }) => d.changeLP(card.owner, -5000)), { cond: (_d, c) => !!c.last.flipped })],
  },
  'Masked Sorcerer': { effects: [trig('battleDamage', { op: 'draw', who: 'self', n: 1 }, { cond: oppDmg })] },
  'The Bistro Butcher': { effects: [trig('battleDamage', { op: 'draw', who: 'opp', n: 2 }, { cond: oppDmg })] },
  'White Magical Hat': { effects: [trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }), { cond: oppDmg })] },
  'Kycoo the Ghost Destroyer': {
    effects: [trig('battleDamage', run(async ({ d, p, o }) => {
      const cs = await d.select(p, "Kycoo: banish up to 2 cards from your opponent's Graveyard", d.players[o].gy, 0, 2, 'bad');
      for (const c of cs) await d.banish(c, p);
    }), { optional: true, cond: oppDmg })],
    lock: { banish: (_d, src, p) => !!src && p !== src.ctrl },
  },
  'Drill Bug': {
    effects: [trig('battleDamage', run(async ({ d, p }) => {
      const c = d.find(DECK({ name: 'Parasite Paracide' }), p)[0];
      if (!c) return;
      await d.shuffleDeck(p);
      const deck = d.players[p].deck;
      deck.splice(deck.indexOf(c), 1);
      deck.push(c);
      d.log('Parasite Paracide is placed on top of the Deck.');
    }), { optional: true, cond: (d, c, p, ev) => oppDmg(d, c, p, ev) && d.find(DECK({ name: 'Parasite Paracide' }), p).length > 0 })],
  },
  'Mechanical Spider': { postBattle: async (d, self, o, r) => { if (r.att === self && o && o.zone === 'mzone' && d.attrOf(o) === 'DARK') await d.destroy(o, 'effect', undefined, self.ctrl); } },
  'Karate Man': {
    effects: [ign(run(({ d, card }) => {
      d.addMod(card, d.base(card, 'atk'), 0);
      const mv = card.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'mzone') await d.destroy(card, 'effect'); } });
    }), { opt: true, label: 'Double original ATK (destroyed at End Phase)', ai: (d) => (d.phase === 'M1' ? 200 : -1) })],
  },
  'Machine King': selfMod((d) => 100 * countFU(d, (c) => d.raceOf(c) === 'Machine')),
  'Parasite Paracide': {
    effects: [
      flip(run(async ({ d, o, card }) => {
        if (!d.onField(card)) return;
        card.owner = o;
        await d.move(card, 'deck');
        await d.shuffleDeck(o);
        card.faceUp = true;
        card.mark.paracide = true;
        d.log(`Parasite Paracide is shuffled face-up into ${d.name(o)}'s Deck.`);
      })),
      trig('drawn', run(async ({ d, p, card }) => {
        delete card.mark.paracide;
        if (await d.specialSummon(card, p, 'def')) card.data.parasite = true;
        await d.damage(p, 1000, card);
      }), { cond: (_d, c) => !!c.mark.paracide }),
    ],
    raceFn: (_d, src, t) => (src.data.parasite && t.ctrl === src.ctrl ? 'Insect' : undefined),
  },
  'Goddess of Whim': {
    effects: [ign(run(async ({ d, p, card }) => { if ((await d.call(p))) d.addMod(card, d.atk(card), 0); else d.addMod(card, -Math.floor(d.atk(card) / 2), 0); }), { opt: true, label: 'Coin toss: double or halve ATK', ai: 100 })],
  },
  'Sinister Serpent': { effects: [trig('standby', { op: 'toHand', s: { t: 'this' } }, { optional: true, cond: (d, c) => c.zone === 'gy' && d.tp === c.owner })] },
  'Marie the Fallen One': { effects: [trig('standby', { op: 'heal', who: 'self', n: 200 }, { cond: (_d, c) => c.zone === 'gy' })] },
  'Sangan': { effects: [trig('fieldToGY', search({ kind: 'monster', maxAtk: 1500 }))] },
  'Witch of the Black Forest': { effects: [trig('fieldToGY', search({ kind: 'monster', maxDef: 1500 }))] },
  'Kuriboh': {
    effects: [quick(run(({ link, p }) => { const ev = link.ev; if (ev.e === 'attack') (ev.noDmg ??= []).push(p); }), {
      from: ['hand'], cost: [discardSelf], label: 'Discard: take no battle damage',
      when: (_d, ev, p) => isAttackOn(ev, p),
      ai: (d, _me, _c, ev) => {
        if (ev.e !== 'attack') return -1;
        const a = d.atk(ev.attacker), t = ev.target;
        const dmg = !t ? a : t.pos === 'atk' && t.faceUp ? a - d.atk(t) : 0;
        return dmg >= 1000 ? dmg : -1;
      },
    })],
  },
  'Crimson Sentry': maiden('bottom'),
  'Lady Panther': maiden('top'),
  'The Forgiving Maiden': maiden('hand'),
  'Gate Guardian': { noNormal: true, ssProc: { cost: [tributeNamed(['Sanga of the Thunder', 'Kazejin', 'Suijin'], ['mzone'])] } },
  'Valkyrion the Magna Warrior': {
    noNormal: true,
    ssProc: { cost: [tributeNamed(MAGNETS, ['hand', 'mzone'])] },
    effects: [ign(run(async ({ d, p }) => {
      for (const n of MAGNETS) { const c = d.find({ side: 'self', zone: 'gy', name: n }, p)[0]; if (c) await d.specialSummon(c, p, await d.askPos(p, c)); }
    }), { label: 'Tribute: Special Summon Alpha, Beta and Gamma', cost: [tributeSelf], cond: (d, _c, p) => MAGNETS.every((n) => d.find({ side: 'self', zone: 'gy', name: n }, p).length > 0) && d.freeCount(p, 'm') >= 2, ai: -1 })],
  },
  'Gale Dogra': {
    effects: [ign(run(async ({ d, p }) => { const c = await pick(d, p, 'Send a monster from your Fusion Deck to the Graveyard', d.players[p].extra, 'cost'); if (c) await d.move(c, 'gy'); }), {
      label: 'Pay 3000: send a Fusion Monster to the Graveyard', cost: [{ op: 'payLP', n: 3000 }], cond: (d, _c, p) => d.players[p].extra.length > 0, ai: -1,
    })],
  },
  'Wall of Illusion': { postBattle: async (d, self, o, r) => { if (r.tgt === self && o && o.zone === 'mzone') await d.toHand(o); } },
  'Dreamsprite': {
    effects: [trig('attacked', run(async ({ d, p, card, link }) => {
      const ev = link.ev;
      if (ev.e !== 'attack') return;
      const c = await pick(d, p, 'Dreamsprite: choose the new attack target', d.monsters(p).filter((m) => m !== card), 'cost');
      if (c) { ev.target = c; d.log(`The attack is redirected to ${c.faceUp ? c.def.name : 'a face-down monster'}.`); }
    }), { optional: true, cond: (d, _c, p) => d.monsters(p).length > 1 })],
  },
  'Ancient Lamp': {
    effects: [
      trig('attacked', run(async ({ d, p, link }) => {
        const ev = link.ev;
        if (ev.e !== 'attack') return;
        const c = await pick(d, p, 'Ancient Lamp: choose the new attack target', d.monsters(opp(p)).filter((m) => m !== ev.attacker), 'bad');
        if (c) { ev.target = c; d.log(`The attack is redirected to ${c.faceUp ? c.def.name : 'a face-down monster'}.`); }
      }), { optional: true, cond: (d, c, p) => !c.faceUp && c.pos === 'def' && d.monsters(opp(p)).length > 1 }),
      ign(run(async ({ d, p }) => { const c = d.find({ side: 'self', zone: 'hand', name: 'La Jinn the Mystical Genie of the Lamp' }, p)[0]; if (c) await d.specialSummon(c, p, await d.askPos(p, c)); }), {
        label: 'Special Summon La Jinn', ai: 1200,
        cond: (d, _c, p) => d.canSpecial(p) && d.find({ side: 'self', zone: 'hand', name: 'La Jinn the Mystical Genie of the Lamp' }, p).length > 0,
      }),
    ],
  },
  'The Stern Mystic': {
    effects: [flip(run(async ({ d, p, o }) => {
      await d.reveal(p, d.fieldCards(o).filter((c) => !c.faceUp), "Your opponent's face-down cards");
      await d.reveal(o, d.fieldCards(p).filter((c) => !c.faceUp), "Your opponent's face-down cards");
    }))],
  },
  'Summoner of Illusions': {
    effects: [flip(run(async ({ d, p, card }) => {
      const trib = await pick(d, p, 'Summoner of Illusions: Tribute a monster', d.monsters(p).filter((m) => m !== card && d.tributeOk(m)), 'cost');
      if (!trib) return;
      d.log(`${d.name(p)} tributes ${trib.def.name}.`);
      await d.move(trib, 'gy', { why: 'tribute' });
      const f = await pick(d, p, 'Special Summon a Fusion Monster', d.players[p].extra.filter((c) => d.canSpecial(p, c)), 'good');
      if (!f || !(await d.specialSummon(f, p, await d.askPos(p, f)))) return;
      const mv = f.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (f.mv === mv && f.zone === 'mzone') await d.destroy(f, 'effect'); } });
    }))],
  },
  'Reaper of the Cards': { effects: [flip(probe('trap'), { targets: [{ f: probeTarget('trap') }] })] },
  'Trap Master': { effects: [flip(probe('trap'), { targets: [{ f: probeTarget('trap') }] })] },
  'Armed Ninja': { effects: [flip(probe('spell'), { targets: [{ f: probeTarget('spell') }] })] },
  'Morphing Jar #2': {
    effects: [flip(run(async ({ d }) => {
      const counts = [0, 0];
      for (const s of [0, 1] as Side[]) for (const c of [...d.monsters(s)]) {
        if (!c.token && c.def.kind === 'monster' && c.def.mtype !== 'fusion') counts[c.owner]++;
        await d.move(c, 'deck');
      }
      for (const s of [0, 1] as Side[]) await d.shuffleDeck(s);
      for (const s of [d.tp, opp(d.tp)]) {
        let need = counts[s];
        const deck = d.players[s].deck;
        while (need > 0 && deck.length) {
          const c = deck[deck.length - 1];
          const ok = c.def.kind === 'monster' && (c.def.lv ?? 0) <= 4 && (c.def.mtype === 'normal' || c.def.mtype === 'effect');
          if (ok && (await d.specialSummon(c, s, 'def', 'special', true))) need--;
          else await d.move(c, 'gy');
        }
      }
    }))],
  },
  'Morphing Jar': {
    effects: [flip(run(async ({ d, p, o }) => {
      for (const s of [p, o]) await d.discard(s, [...d.players[s].hand], s === p ? null : p);
      for (const s of [p, o]) await d.draw(s, Math.min(5, d.players[s].deck.length));
    }))],
  },
  'Cyber Jar': {
    effects: [flip(run(async ({ d }) => {
      for (const c of [...d.monsters(0), ...d.monsters(1)]) await d.destroy(c, 'effect');
      for (const s of [d.tp, opp(d.tp)]) {
        const top = d.players[s].deck.slice(-5).reverse();
        await d.reveal(opp(s), top, 'Cards picked up for Cyber Jar');
        for (const c of top) {
          if (c.def.kind === 'monster' && (c.def.lv ?? 0) <= 4 && (c.def.mtype === 'normal' || c.def.mtype === 'effect') && d.canSpecial(s, c)) {
            const set = await d.option(s, `Special Summon ${c.def.name}`, ['Face-up Attack Position', 'Face-down Defense Position'], (c.def.atk ?? 0) >= (c.def.def ?? 0) ? 0 : 1);
            await d.specialSummon(c, s, 'atk', 'special', set === 1);
          } else await d.toHand(c);
        }
      }
    }))],
  },
  'Cockroach Knight': { effects: [trig('toGY', run(async ({ d, card }) => { if (card.zone === 'gy') { await d.move(card, 'deck'); d.log('Cockroach Knight returns to the top of the Deck.'); } }))] },
  'Kotodama': {
    onSummon: async (d, src, c) => {
      if (c === src || !c.faceUp) return;
      const same = [...d.monsters(0), ...d.monsters(1)].some((m) => m !== c && m.faceUp && d.nameOf(m) === d.nameOf(c));
      if (same) await d.destroy(c, 'effect', undefined, src.ctrl);
    },
  },
  'Goblin Attack Force': {
    effects: [trig('attacks', run(({ d, card }) => d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
      if (card.zone !== 'mzone') return;
      if (card.pos === 'atk') await d.changePos(card, 'def');
      card.posTurn = d.turn + 2;
    } })))],
  },
  'Kinetic Soldier': { statFn: (d, c) => { const f = battleFoe(d, c); return f && d.raceOf(f) === 'Warrior' ? { atk: 2000, def: 2000 } : undefined; } },
  'Insect Soldiers of the Sky': { statFn: (d, c) => (d.battle?.att === c && d.battle.tgt && d.attrOf(d.battle.tgt) === 'WIND' ? { atk: 1000 } : undefined) },
  'Dark Artist': { statFn: (d, c) => (d.battle?.tgt === c && d.attrOf(d.battle.att) === 'LIGHT' ? { def: -Math.floor((c.def.def ?? 0) / 2) } : undefined) },
  'Thousand-Eyes Restrict': absorber({ lock: { attack: (_d, src, a) => a !== src, pos: (_d, src, c) => c !== src } }),
  'Relinquished': absorber({
    battleSub: (d, c) => (d.battle?.tgt === c && d.battle.att.ctrl !== c.ctrl ? absorbed(d, c) : undefined),
    battleDmg: (d, self, _o, n, to) => { if (to === self.ctrl && absorbed(d, self)) self.data.reflect = (self.data.reflect ?? 0) + n; return n; },
    postBattle: async (d, self) => { const n = self.data.reflect; if (n) { self.data.reflect = 0; await d.damage(opp(self.ctrl), n, self); } },
  }),
  'Electromagnetic Bagworm': {
    effects: [
      flip(run(async ({ d, p, t }) => { const m = t[0]; if (m && (await d.takeControl(m, p)) && d.tp !== p) m.returnAt = d.turn + 1; }), { targets: [{ f: { ...OPP_FU, race: ['Machine'] } }] }),
      curse,
    ],
  },
  'Slate Warrior': { effects: [flip({ op: 'stat', s: { t: 'this' }, atk: 500, def: 500, perm: true }), curse] },
  'Rigras Leever': {
    effects: [
      flip(run(async ({ d, p, o }) => {
        for (const [a, b] of [[p, o], [o, p]] as [Side, Side][]) {
          const c = await pick(d, a, "Rigras Leever: choose a card in your opponent's hand to discard", d.players[b].hand, 'bad');
          if (c) await d.discard(b, [c], p);
        }
      })),
      curse,
    ],
  },
  'Thunder Dragon': {
    effects: [ign({ op: 'toHand', s: { t: 'choose', f: DECK({ name: 'Thunder Dragon' }), n: 2, upTo: true } }, { from: ['hand'], cost: [discardSelf], label: 'Discard: add up to 2 Thunder Dragon', ai: 500 })],
  },
  'Panther Warrior': { attackCost: tributeToAttack },
  '4-Starred Ladybug of Doom': { effects: [flip(destroyAll({ ...OPP_FU, minLv: 4, maxLv: 4 }))] },
  'The Wicked Worm Beast': { effects: [trig('endPhase', { op: 'toHand', s: { t: 'this' } }, { cond: (d, c) => d.tp === c.ctrl && c.zone === 'mzone' })] },
  'Giant Germ': { effects: [trig('battleDestroyed', [{ op: 'damage', who: 'opp', n: 500 }, run(({ d, p, card }) => sameNameFromDeck(d, p, card, false))])] },
  'Nimble Momonga': { effects: [trig('battleDestroyed', [{ op: 'heal', who: 'self', n: 1000 }, run(({ d, p, card }) => sameNameFromDeck(d, p, card, true))])] },
  'Shadow Ghoul': selfMod((d, c) => 100 * d.players[c.ctrl].gy.filter((x) => x.def.kind === 'monster').length),
  'Deepsea Warrior': { immune: (d, _s, src) => src.def.kind === 'spell' && umi(d) },
  'The Legendary Fisherman': {
    immune: (d, _s, src) => src.def.kind === 'spell' && umi(d),
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && umi(d) },
  },
  'Cocoon of Evolution': {
    effects: [
      ign(run(async ({ d, card, t }) => {
        const moth = t[0];
        if (!moth || moth.zone !== 'mzone') return;
        await d.equipCard(card, moth, { fn: (_d, eq, tg) => ({ atk: (eq.def.atk ?? 0) - (tg.def.atk ?? 0), def: (eq.def.def ?? 0) - (tg.def.def ?? 0) }) }, card.ctrl);
      }, 800), { from: ['hand', 'mzone'], label: 'Equip to Petit Moth', targets: [{ f: { ...OWN_FU, name: 'Petit Moth' }, good: true }] }),
      ign(run(async ({ d, p, card }) => {
        const moth = d.equippedTo(card);
        const ready = mothsReady(d, card, p);
        if (!moth || !ready.length) return;
        const i = await d.option(p, 'Which Moth emerges?', ready.map(([n]) => n), ready.length - 1);
        const c = d.find({ side: 'self', zone: ['hand', 'deck'], name: ready[i][0] }, p)[0];
        d.log(`${d.name(p)} tributes ${moth.def.name}.`);
        await d.move(moth, 'gy', { why: 'tribute' });
        const fromDeck = c.zone === 'deck';
        if (await d.specialSummon(c, p, await d.askPos(p, c))) c.properly = true;
        if (fromDeck) await d.shuffleDeck(p);
      }, 2500), { from: ['szone'], label: 'Tribute Petit Moth: summon an evolved Moth', cond: (d, c, p) => !!d.equippedTo(c) && mothsReady(d, c, p).length > 0 }),
    ],
  },
  'Jinzo': { negateFn: (_d, _s, c) => c.def.kind === 'trap', lock: { activate: (_d, _s, _p, c) => c.def.kind === 'trap' } },
  'Hoshiningen': attrSwing('LIGHT', 'DARK'),
  'Star Boy': attrSwing('WATER', 'FIRE'),
  "Witch's Apprentice": attrSwing('DARK', 'LIGHT'),
  'Milus Radiant': attrSwing('EARTH', 'WIND'),
  'Bladefly': attrSwing('WIND', 'EARTH'),
  'Little Chimera': attrSwing('FIRE', 'WATER'),
  'Skelengel': { effects: [flip({ op: 'draw', who: 'self', n: 1 }, { optional: true })] },
  'Blast Sphere': {
    preBattle: async (d, self, other) => {
      if (!other || d.battle?.tgt !== self || self.faceUp || other.ctrl === self.ctrl) return;
      if (!(await d.equipCard(self, other, {}, self.ctrl))) return;
      const mv = self.mv, victim = opp(self.ctrl);
      d.schedule({ at: 'SP', side: victim, fn: async () => {
        const t = d.equippedTo(self);
        if (self.mv !== mv || !t) return;
        const a = d.atk(t);
        await d.destroy(t, 'effect', undefined, self.ctrl);
        await d.destroy(self, 'effect');
        await d.damage(victim, a, self);
      } });
      return true;
    },
  },
  'Kiseitai': {
    preBattle: async (d, self, other) => {
      if (!other || d.battle?.tgt !== self || self.faceUp || other.ctrl === self.ctrl) return;
      return d.equipCard(self, other, {}, self.ctrl);
    },
    effects: [trig('oppStandby', run(({ d, card }) => { const t = d.equippedTo(card); if (t) return d.heal(card.ctrl, Math.floor(d.atk(t) / 2)); }), { cond: (d, c) => !!d.equippedTo(c) })],
  },
  'Total Defense Shogun': { summonPos: 'def', rules: ['attackFromDef'] },
  'Ceremonial Bell': { reveals: () => true },
  'Fairy Guardian': {
    effects: [ign(run(async ({ d, t }) => { const c = t[0]; if (c && c.zone === 'gy') { await d.move(c, 'deck', { bottom: true }); d.log(`${c.def.name} is placed on the bottom of the Deck.`); } }, 300), {
      label: 'Tribute: return a Spell your opponent sent to your Graveyard', cost: [tributeSelf],
      targets: [{ f: { side: 'self', zone: 'gy', kind: 'spell', fn: (d, c, p) => c.mark.sentTurn === d.turn && c.mark.sentBy === opp(p) }, good: true }],
    })],
  },
  'The Unfriendly Amazon': {
    effects: [trig('standby', run(async ({ d, p, card }) => {
      const c = await pick(d, p, 'The Unfriendly Amazon: Tribute another monster (or cancel to destroy it)', d.monsters(p).filter((m) => m !== card && d.tributeOk(m)), 'cost', true);
      if (c) { d.log(`${d.name(p)} tributes ${c.def.name}.`); await d.move(c, 'gy', { why: 'tribute' }); }
      else await d.destroy(card, 'effect');
    }), { cond: (d, c) => onField(d, c) })],
  },
  'Blast Juggler': {
    effects: [trig('standby', run(async ({ d, p, card }) => {
      if (!onField(d, card)) return;
      d.log(`${d.name(p)} tributes Blast Juggler.`);
      await d.move(card, 'gy', { why: 'tribute' });
      const cs = await d.select(p, 'Blast Juggler: destroy 2 face-up monsters with 1000 or less ATK', [...d.monsters(0), ...d.monsters(1)].filter((m) => m.faceUp && d.atk(m) <= 1000), 0, 2, 'bad');
      for (const c of cs) await d.destroy(c, 'effect', undefined, p);
    }), { optional: true, cond: (d, c) => onField(d, c) && [...d.monsters(0), ...d.monsters(1)].filter((m) => m !== c && m.faceUp && d.atk(m) <= 1000).length >= 2, ai: (d, me) => scoreWipe(d, me, (c) => d.atk(c) <= 1000) })],
  },
  'Banisher of the Light': { lock: { gyToBanish: true } },
  'Senju of the Thousand Hands': { effects: [onSummonSearch({ kind: 'monster', mtype: ['ritual'] })] },
  'Sonic Bird': { effects: [onSummonSearch({ kind: 'spell', stype: 'ritual' })] },
  'Berfomet': { effects: [onSummonSearch({ name: 'Gazelle the King of Mythical Beasts' })] },
  'Sword Hunter': {
    effects: [trig('destroysByBattle', run(async ({ d, card, link }) => {
      const v = link.trig?.other;
      if (v && v.zone === 'gy' && onField(d, card) && card.faceUp) await d.equipCard(v, card, { atk: 200 }, card.ctrl);
    }))],
  },
  'Spirit of the Breeze': { effects: [standbyHeal(1000, (_d, c) => c.pos === 'atk')] },
  'Dancing Fairy': { effects: [standbyHeal(1000, (_d, c) => c.pos === 'def')] },
  'Cure Mermaid': { effects: [standbyHeal(800)] },
  'Dark-Eyes Illusionist': {
    effects: [flip(run(({ card, t }) => { if (t[0]) card.data.lockUid = t[0].uid; }), { targets: [{ f: M }] })],
    lock: noAttackLock((_d, src, a) => a.uid === src.data.lockUid),
  },
  'Dark Elf': { attackCost: [{ op: 'payLP', n: 1000 }] },
  'Dark Zebra': {
    effects: [trig('standby', run(async ({ d, card }) => { if (card.pos === 'atk') await d.changePos(card, 'def'); card.posTurn = d.turn; }), { cond: (d, c, p) => onField(d, c) && d.fieldCards(p).length === 1 })],
  },
  'Zombyra the Dark': { rules: ['noDirect'], effects: [trig('destroysByBattle', { op: 'stat', s: { t: 'this' }, atk: -200, perm: true })] },
  'Spear Cretin': {
    effects: [trig('fieldToGY', run(async ({ d }) => {
      for (const s of [d.tp, opp(d.tp)]) await reviveOne(d, s, 'Spear Cretin: Special Summon a monster from your Graveyard');
    }), { cond: (_d, c) => !!c.last.flipped })],
  },
  'Big Eye': {
    effects: [flip(run(async ({ d, p }) => {
      const deck = d.players[p].deck;
      let left = deck.splice(-Math.min(5, deck.length)).reverse();
      const order: Card[] = [];
      while (left.length > 1) {
        const [c] = await d.select(p, `Big Eye: choose the card to place ${order.length ? 'next' : 'on top'}`, left, 1, 1, 'good', undefined, undefined, true);
        if (!c) break;
        order.push(c);
        left = left.filter((x) => x !== c);
      }
      order.push(...left);
      deck.push(...order.reverse());
    }))],
  },
  'Jigen Bakudan': {
    effects: [trig('standby', run(async ({ d, p, o, card }) => {
      if (card.zone !== 'mzone') return;
      d.log(`${d.name(p)} tributes Jigen Bakudan.`);
      await d.move(card, 'gy', { why: 'tribute' });
      let total = 0;
      for (const m of [...d.monsters(p)]) { const a = m.faceUp ? d.atk(m) : m.def.atk ?? 0; if (await d.destroy(m, 'effect', undefined, p)) total += a; }
      await d.damage(o, Math.floor(total / 2), card);
    }), { optional: true, cond: (d, c) => !!c.data.flipped && onField(d, c) })],
  },
  'Bazoo the Soul-Eater': {
    effects: [ign(run(async ({ d, p, card }) => {
      const cs = await d.select(p, 'Bazoo: banish up to 3 cards from your Graveyard', d.players[p].gy.filter((c) => !d.banishLocked(p, c)), 1, 3, 'cost');
      for (const c of cs) await d.banish(c, p);
      d.addMod(card, 300 * cs.length, 0, d.turn + 1);
    }), { opt: true, label: 'Banish up to 3: +300 ATK each', cond: (d, _c, p) => d.players[p].gy.length > 0, ai: (d) => (d.phase === 'M1' ? 300 : -1) })],
  },
  'Lava Battleguard': selfMod((d, c) => 500 * countFU(d, (m) => m.def.name === 'Swamp Battleguard', c.ctrl)),
  'Swamp Battleguard': selfMod((d, c) => 500 * countFU(d, (m) => m.def.name === 'Lava Battleguard', c.ctrl)),
  "Harpie's Pet Dragon": selfMod((d) => 300 * countFU(d, (m) => d.nameOf(m) === 'Harpie Lady'), true),
  'Cyber Harpie': { alias: 'Harpie Lady' },
  'The Unhappy Maiden': { effects: [trig('battleDestroyed', run(({ d }) => { d.battleEnded = true; d.log('The Battle Phase ends.'); }))] },
  'Patrol Robo': {
    effects: [trig('standby', run(async ({ d, p, o }) => {
      const c = await pick(d, p, 'Patrol Robo: look at a Set card', d.fieldCards(o).filter((x) => !x.faceUp), 'good');
      if (c) await d.reveal(p, [c], "Your opponent's Set card");
    }), { optional: true, cond: (d, c, p) => onField(d, c) && d.fieldCards(opp(p)).some((x) => !x.faceUp) })],
  },
  'Big Shield Gardna': {
    onTargeted: async (d, self, link) => {
      if (self.faceUp || link.card.def.kind !== 'spell' || link.targets.flat().length !== 1) return;
      link.negated = true;
      link.activationNegated = true;
      d.log('Big Shield Gardna negates the Spell Card and is turned face-up.');
      await d.changePos(self, 'def', false);
    },
    postBattle: async (d, self, _o, r) => { if (r.tgt === self && self.zone === 'mzone' && self.pos === 'def') await d.changePos(self, 'atk'); },
  },
  'Fire Princess': { effects: [trig('lpGain', { op: 'damage', who: 'opp', n: 500 })] },
  'Flash Assailant': selfMod((d, c) => -400 * d.players[c.ctrl].hand.length, true),
  'Muka Muka': selfMod((d, c) => 300 * d.players[c.ctrl].hand.length, true),
  'Fire Sorcerer': {
    effects: [flip(run(async ({ d, p, o, card }) => {
      const hand = [...d.players[p].hand];
      if (hand.length < 2) return;
      const a = randomOf(d, hand)!;
      const b = randomOf(d, hand.filter((c) => c !== a))!;
      for (const c of [a, b]) await d.banish(c);
      await d.damage(o, 800, card);
    }))],
  },
  'Red-Moon Baby': {
    effects: [trig('destroysByBattle', run(({ d, p, link }) => {
      const v = link.trig?.other;
      if (!v) return;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
        if (v.zone === 'gy' && d.revivable(v) && d.canSpecial(p, v) && (await yes(d, p, `Special Summon ${v.def.name} with Red-Moon Baby?`))) await d.specialSummon(v, p, await d.askPos(p, v));
      } });
    }))],
  },
  'Exodia the Forbidden One': { winCheck: (d, c) => c.zone === 'hand' && EXODIA.every((n) => d.players[c.owner].hand.some((x) => x.def.name === n)) },
  'Supply': { effects: [flip({ op: 'toHand', s: { t: 'choose', f: { side: 'self', zone: 'gy', kind: 'monster', fn: (_d, c) => c.mark.fusionMatTurn !== undefined }, n: 2 } })] },
  'Lady Assailant of Flames': {
    effects: [flip(run(async ({ d, p, o, card }) => {
      const deck = d.players[p].deck;
      if (deck.length < 3) return;
      for (let i = 0; i < 3; i++) await d.banish(deck[deck.length - 1]);
      await d.damage(o, 800, card);
    }))],
  },
  'Crass Clown': { effects: [trig('toAtk', { op: 'toHand', s: { t: 'choose', f: OPP_M } })] },
  'Dream Clown': { effects: [trig('toDef', { op: 'destroy', s: { t: 'choose', f: OPP_M } })] },
  'Maha Vailo': selfMod((d, c) => 500 * d.equipsOf(c).length),
  'Maryokutai': {
    effects: [quick({ op: 'negate' }, {
      label: 'Tribute: negate a Spell Card', cost: [tributeSelf],
      when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'spell',
      cond: (d, _c, p) => d.tp !== p,
    })],
  },
  'Nuvia the Wicked': { effects: [trig('normalSummoned', { op: 'destroy', s: { t: 'this' } })], statFn: (d, c) => ({ atk: -200 * d.monsters(opp(c.ctrl)).length }) },
  'Boar Soldier': { effects: [trig('normalSummoned', { op: 'destroy', s: { t: 'this' } })], statFn: (d, c) => (d.monsters(opp(c.ctrl)).length ? { atk: -1000 } : undefined) },
  'Mad Sword Beast': { rules: ['pierce'] },
  'Copycat': {
    effects: [trig('summoned', run(({ card, t }) => { const m = t[0]; if (m && card.zone === 'mzone') card.data.copy = { atk: m.def.atk ?? 0, def: m.def.def ?? 0 }; }), { targets: [{ f: OPP_FU }] })],
  },
  'Wodan the Resident of the Forest': selfMod((d) => 100 * countFU(d, (c) => d.raceOf(c) === 'Plant')),
  'Monster Eye': {
    effects: [ign({ op: 'toHand', s: { t: 'choose', f: { side: 'self', zone: 'gy', name: 'Polymerization' } } }, { label: 'Pay 1000: recover Polymerization', cost: [{ op: 'payLP', n: 1000 }], ai: 300 })],
  },
  'Yado Karu': {
    effects: [trig('toDef', run(async ({ d, p }) => {
      const cs = await d.select(p, 'Yado Karu: place cards from your hand on the bottom of your Deck', d.players[p].hand, 0, d.players[p].hand.length, 'cost');
      for (const c of cs) await d.move(c, 'deck', { bottom: true });
    }), { optional: true, cond: (d, _c, p) => d.players[p].hand.length > 0, ai: -1 })],
  },
  'Castle of Dark Illusions': {
    effects: [flip(run(({ card }) => { card.data.castle = true; card.data.standbys = 0; }))],
    auraFn: (d, src, t) => {
      if (!src.data.castle || d.raceOf(t) !== 'Zombie') return;
      const n = 200 * (1 + Math.min(4, src.data.standbys ?? 0));
      return { atk: n, def: n };
    },
  },
  'Pumpking the King of Ghosts': {
    statFn: (d, c) => {
      if (!d.active('Castle of Dark Illusions')) return;
      const n = 100 * (1 + Math.min(4, c.data.standbys ?? 0));
      return { atk: n, def: n };
    },
  },
  'Mask of Darkness': { effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { side: 'self', zone: 'gy', kind: 'trap' }, good: true }] })] },
  'Hourglass of Courage': {
    statFn: (d, c) => {
      if (c.data.sumTurn === undefined) return;
      const a = c.def.atk ?? 0, df = c.def.def ?? 0;
      return d.turn - c.data.sumTurn < 3 ? { atk: -Math.floor(a / 2), def: -Math.floor(df / 2) } : { atk: a, def: df };
    },
  },
  'Fairy King Truesdale': { aura: [{ f: { side: 'self', zone: 'mzone', race: ['Plant'] }, atk: 500, def: 500 }] },
  'Revival Jam': {
    effects: [trig('battleDestroyed', run(({ d, p, card }) => d.schedule({ at: 'SP', side: p, fn: async () => {
      if (card.zone !== 'gy' || d.players[p].lp <= 1000 || !d.canSpecial(p, card)) return;
      await d.changeLP(p, -1000, true);
      if (await d.specialSummon(card, p, 'def')) card.posTurn = d.turn;
    } })), { optional: true })],
  },
  'Barrel Dragon': {
    effects: [ign(run(async ({ d, p, o }) => {
      const heads = (await d.tossCoins(3)).filter(Boolean).length;
      if (heads < 2) return;
      const c = await pick(d, p, 'Barrel Dragon: destroy a monster', d.monsters(o), 'bad');
      if (c) await d.destroy(c, 'effect', undefined, p);
    }, 600), { opt: true, label: 'Toss 3 coins', cond: (d, _c, p) => d.monsters(opp(p)).length > 0 })],
  },
  'Lord of D.': { protect: (d, _s, t) => t.zone === 'mzone' && t.faceUp && d.raceOf(t) === 'Dragon' },
  'Rocket Warrior': {
    battleDmg: (d, self, _o, n, to) => (to === self.ctrl && d.tp === self.ctrl ? 0 : n),
    postBattle: (d, self, o, r) => { if (r.att === self && o && o.zone === 'mzone' && o.faceUp) d.addMod(o, -500, 0); },
  },
  'Dark Magician Girl': selfMod((d) => 300 * [...d.players[0].gy, ...d.players[1].gy].filter((c) => c.def.name === 'Dark Magician' || c.def.name === 'Magician of Black Chaos').length),
  'Buster Blader': selfMod((d, c) => {
    const o = opp(c.ctrl);
    return 500 * (countFU(d, (m) => d.raceOf(m) === 'Dragon', o) + d.players[o].gy.filter((m) => m.def.race === 'Dragon').length);
  }),
  'Penguin Soldier': { effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: M, n: 2, min: 0 }] })] },
  'Penguin Knight': {
    effects: [trig('milled', run(async ({ d, p }) => { for (const c of [...d.players[p].gy]) await d.move(c, 'deck'); await d.shuffleDeck(p); }))],
  },
  'Mysterious Puppeteer': { onSummon: (d, src, c, how) => ((how === 'normal' || how === 'flip') && c !== src ? d.heal(src.ctrl, 500) : undefined) },
  'Needle Ball': {
    effects: [flip(run(async ({ d, p, o, card }) => {
      if (d.players[p].lp > 2000 && (await d.confirm(p, 'Needle Ball: pay 2000 LP to inflict 1000 damage?', card, d.players[o].lp <= 1000))) {
        await d.changeLP(p, -2000, true);
        await d.damage(o, 1000, card);
      }
    }))],
  },
  'Needle Worm': { effects: [flip({ op: 'mill', who: 'opp', n: 5 })] },
  'Gilasaurus': {
    effects: [trig('normalSummoned', run(async ({ d, p, o }) => {
      d.players[p].normalDone = false;
      d.log('Gilasaurus is treated as a Special Summon.');
      const c = await pick(d, o, 'Gilasaurus: Special Summon a monster from your Graveyard?', d.players[o].gy.filter((m) => d.revivable(m) && d.canSpecial(o, m)), 'good', true);
      if (c) await d.specialSummon(c, o, await d.askPos(o, c));
    }), { optional: true, ai: (d, me) => (d.players[opp(me)].gy.some((m) => m.def.kind === 'monster') ? -1 : 200) })],
  },
  'Jowgen the Spiritualist': {
    effects: [ign(destroyAll({ ...M, fn: (_d, c) => ['special', 'fusion', 'ritual'].includes(c.data.how) }), {
      label: 'Random discard: destroy Special Summoned monsters',
      cost: [run(async ({ d, p, card }) => { const c = randomOf(d, d.players[p].hand.filter((x) => x !== card)); if (c) await d.discard(p, [c], null); }, 0, (d, p) => d.players[p].hand.length > 0)],
      ai: (d, me) => scoreWipe(d, me, (c) => ['special', 'fusion', 'ritual'].includes(c.data.how)) - 450,
    })],
    lock: { summon: (_d, _s, _p, _c, how) => how === 'special' || how === 'fusion' || how === 'ritual' },
  },
  'Jirai Gumo': { effects: [trig('attacks', run(async ({ d, p }) => { if (!(await d.call(p))) await d.changeLP(p, -Math.floor(d.players[p].lp / 2)); }))] },
  'Electric Lizard': { postBattle: (d, self, o, r) => { if (r.tgt === self && o && d.raceOf(o) !== 'Zombie') o.noAttackTurn = d.turn + 2; } },
  'Cyber-Stein': {
    effects: [ign(run(async ({ d, p }) => {
      const f = await pick(d, p, 'Cyber-Stein: Special Summon a Fusion Monster', d.players[p].extra.filter((c) => d.canSpecial(p, c)), 'good');
      if (f) await d.specialSummon(f, p, 'atk');
    }, (d, me) => (d.players[me].lp > 6000 ? 1500 : -1)), { label: 'Pay 5000: Special Summon a Fusion Monster', cost: [{ op: 'payLP', n: 5000 }], cond: (d, _c, p) => d.players[p].extra.length > 0 && d.canSpecial(p) })],
  },
  'Mushroom Man #2': {
    effects: [
      trig('standby', run(({ d, card }) => d.changeLP(card.ctrl, -300)), { cond: (d, c) => onField(d, c) }),
      trig('endPhase', run(async ({ d, p, o, card }) => {
        if (d.players[p].lp > 500 && (await d.confirm(p, 'Pay 500 LP to give control of Mushroom Man #2 to your opponent?', card))) {
          await d.changeLP(p, -500, true);
          await d.takeControl(card, o, true);
        }
      }), { cond: (d, c) => d.tp === c.ctrl && onField(d, c) && d.freeSlot(opp(c.ctrl), 'm') >= 0 }),
    ],
  },
  'The Fiend Megacyber': { tributes: (d, p) => (d.monsters(opp(p)).length - d.monsters(p).length >= 2 ? 0 : 1) },
  'Gearfried the Iron Knight': { rules: ['noEquip'] },
  'Hysteric Fairy': { effects: [ign({ op: 'heal', who: 'self', n: 1000 }, { label: 'Tribute 2: gain 1000 LP', cost: [tribute2], ai: -1 })] },
  'Bubonic Vermin': {
    effects: [flip(run(async ({ d, p, card }) => {
      const c = d.find(DECK({ name: 'Bubonic Vermin' }), p)[0];
      if (c && d.canSpecial(p, c) && (await yes(d, p, 'Special Summon another Bubonic Vermin from your Deck?', card))) { await d.specialSummon(c, p, 'def', 'special', true); await d.shuffleDeck(p); }
    }))],
  },
  'Bombardment Beetle': {
    effects: [flip(run(async ({ d, p, t }) => {
      const m = t[0];
      if (!m || m.zone !== 'mzone' || m.faceUp) return;
      d.log(`The face-down monster is ${m.def.name}.`);
      await d.reveal(p, [m], 'The flipped monster');
      if (m.def.mtype === 'effect') await d.destroy(m, 'effect', undefined, p);
    }), { targets: [{ f: { ...OPP_M, faceUp: false, pos: 'def' } }] })],
  },
  'Greenkappa': { effects: [flip({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { side: 'any', zone: ['szone', 'fzone'], faceUp: false }, n: 2 }] })] },
  'Tornado Bird': { effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { side: 'any', st: true, zone: ['szone', 'fzone'] }, n: 2 }] })] },
  'Princess of Tsurugi': { effects: [flip(run(({ d, o, card }) => d.damage(o, 500 * d.spellTraps(o).length, card)))] },
  'Dragon Piper': {
    effects: [flip(run(async ({ d, p }) => {
      for (const c of d.faceUpField().filter((x) => x.def.name === 'Dragon Capture Jar')) await d.destroy(c, 'effect', undefined, p);
      for (const m of [...d.monsters(0), ...d.monsters(1)]) if (m.faceUp && d.raceOf(m) === 'Dragon' && m.pos === 'def') await d.changePos(m, 'atk');
    }))],
  },
  'Dragon Seeker': { effects: [trig(['normalSummoned', 'flipSummoned'], { op: 'destroy', s: { t: 'choose', f: { ...FU, race: ['Dragon'] } } })] },
  'Time Wizard': {
    effects: [ign(run(async ({ d, p, o }) => {
      if ((await d.call(p))) {
        for (const m of [...d.monsters(o)]) await d.destroy(m, 'effect', undefined, p);
        const dm = d.monsters(p).find((m) => m.faceUp && m.def.name === 'Dark Magician' && d.tributeOk(m));
        const sage = d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Dark Sage' }, p)[0];
        if (dm && sage && (await yes(d, p, 'Tribute Dark Magician to summon Dark Sage?'))) {
          d.log(`${d.name(p)} tributes Dark Magician.`);
          await d.move(dm, 'gy', { why: 'tribute' });
          if (await d.specialSummon(sage, p, await d.askPos(p, sage))) {
            sage.properly = true;
            const sp = await pick(d, p, 'Dark Sage: add a Spell Card from your Deck to your hand', d.find(DECK({ kind: 'spell' }), p), 'good');
            if (sp) await d.toHand(sp);
          }
          await d.shuffleDeck(p);
        }
      } else {
        let total = 0;
        for (const m of [...d.monsters(p)]) { const a = m.faceUp ? d.atk(m) : m.def.atk ?? 0; if (await d.destroy(m, 'effect', undefined, p)) total += a; }
        await d.changeLP(p, -Math.floor(total / 2));
      }
    }, (d, me) => scoreWipe(d, me, (c) => c.ctrl !== me) * 0.5 - scoreWipe(d, me, (c) => c.ctrl === me) * -0.5), { opt: true, label: 'Time Magic (call a coin toss)', cond: (d, _c, p) => d.tp === p })],
  },
  "Alligator's Sword Dragon": {
    ruleIf: { direct: (d, c) => { const ms = d.monsters(opp(c.ctrl)); return ms.length > 0 && ms.every((m) => m.faceUp && ['EARTH', 'WATER', 'FIRE'].includes(d.attrOf(m) ?? '')); } },
  },
  'Chimera the Flying Mythical Beast': {
    effects: [trig('destroyed', run(async ({ d, p }) => {
      const c = await pick(d, p, 'Chimera: Special Summon Gazelle or Berfomet from your Graveyard', d.find({ side: 'self', zone: 'gy', name: ['Gazelle the King of Mythical Beasts', 'Berfomet'] }, p).filter((m) => d.canSpecial(p, m)), 'good', true);
      if (c) await d.specialSummon(c, p, await d.askPos(p, c));
    }), { optional: true })],
  },
};
