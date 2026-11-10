// YGO Online monsters, part 12 (The End of Anubis … Vennominon the King of Poisonous Snakes).
import {
  type Attr, type Card, type Def, type Duel, type Side,
  ATTRS, DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, both, canFuse, ctr, declareAttr, declareRace, destroyAll, flip, fuse, has, ign, isAttackOn, lvUp, merge, noSTOnAttack,
  opp, pick, quick, randomOf, removeCtr, run, search, spirit, ssFrom, ssPick, threat, toon, tokenDef, tokens, trig, union, won, atEndPhase, umi,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
const samurai = (c: Card, d: Duel) => d.find({ ...OWN_FU, set: 'Six Samurai' }, c.ctrl).some((x) => x !== c && x.def.name !== c.def.name);
const samuraiSub: Def = { battleSub: (d, c) => d.find({ ...OWN_FU, set: 'Six Samurai' }, c.ctrl).find((x) => x !== c) };
const wipeNon = (attr: string): Def => ({ effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of both(d).filter((x) => !x.faceUp || d.attrOf(x) !== attr)) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] });
const lordTrib = (race: string): Def => ({ noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === race });
const needles: Def = { postBattle: async (d, self, o, r) => { if (o && r.tgt === self && self.pos === 'def' && d.defv(self) > d.atk(o) && o.zone === 'mzone') await d.destroy(o, 'effect', undefined, self.ctrl); } };
const insectLv = (next: string | undefined, from: string | undefined, down: number, both_ = false): Def => ({
  auraFn: from ? (_d, src, c) => (src.data.ssBy === from && c.ctrl !== src.ctrl ? (both_ ? { atk: -down, def: -down } : { atk: -down }) : undefined) : undefined,
  effects: next ? [lvUp(next, 'standby', (d, c) => c.data.sumTurn !== d.turn && c.data.flipTurn !== d.turn)] : [],
});
const vampire = (revive: boolean): Def => ({
  effects: [
    trig('battleDamage', run(async ({ d, p, o }) => {
      const kinds = ['monster', 'spell', 'trap'] as const;
      const i = await d.option(p, 'Declare a card type', ['Monster', 'Spell', 'Trap']);
      const c = await pick(d, o, `Send a ${kinds[i]} from your Deck to the Graveyard`, P(d, o).deck.filter((x) => x.def.kind === kinds[i]), 'cost');
      if (c) { await d.move(c, 'gy', { by: p }); await d.shuffleDeck(o); }
    }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl }),
    ...(revive ? [trig('destroyed', run(({ d, card }) => { const p = card.owner, mv = card.mv; d.schedule({ at: 'SP', side: p, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); } }); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.destroyedHow === 'effect' && c.mark.destroyedBy !== c.owner })] : []),
  ],
});
const snake = (): Def => ({
  statFn: (d, c) => ({ atk: 500 * P(d, c.ctrl).gy.filter((x) => x.def.kind === 'monster' && x.def.race === 'Reptile').length }),
  effects: [trig('battleDestroyed', run(async ({ d, p, card }) => {
    const r = await pick(d, p, 'Banish another Reptile', P(d, p).gy.filter((x) => x !== card && x.def.kind === 'monster' && x.def.race === 'Reptile'), 'cost');
    if (!r) return;
    await d.banish(r, p);
    if (card.zone === 'gy' && d.canSpecial(p, card)) { card.properly = true; await d.specialSummon(card, p, await d.askPos(p, card)); }
  }), { optional: true, from: ['gy'], cond: (d, c) => c.zone === 'gy' && P(d, c.owner).gy.some((x) => x !== c && x.def.race === 'Reptile' && x.def.kind === 'monster') })],
});
const hexSealed = (attr: Attr): Def => ({
  fusionSub: true,
  effects: [ign(run(async ({ d, p, card }) => { await fuse(d, p, card, { f: (f) => f.def.attr === attr, pool: (s) => d.monsters(s), dest: 'gy' }); }, 1500, (d, p, card) => canFuse(d, p, card, { f: (f) => f.def.attr === attr, pool: (s) => d.monsters(s) })), { label: `Tribute materials: Special Summon a ${attr} Fusion Monster` })],
});
const toonExtra = (x: Def): Def => merge(toon(), x);

export const MONSTERS_12: Record<string, Def> = {
  'The End of Anubis': {
    lock: { activate: (_d, _s, _p, c) => (c.zone === 'gy') || !!c.def.effects?.some((e) => (e.targets ?? []).some((t) => [t.f.zone].flat().includes('gy'))) },
  },
  'The Hunter with 7 Weapons': {
    effects: [trig('normalSummoned', run(async ({ d, p, o, card }) => { card.data.race = await declareRace(d, p, 'Declare a Type', d.monsters(o)); }))],
    statFn: (d, c) => { const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null); return o && d.raceOf(o) === c.data.race ? { atk: 1000 } : undefined; },
  },
  'The Immortal Bushi': {
    effects: [trig('standby', run(async ({ d, p, card }) => { if (card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }), {
      optional: true, from: ['gy'], cond: (d, c) => c.zone === 'gy' && d.monsters(c.owner).length === 0 && P(d, c.owner).gy.every((x) => x.def.kind !== 'monster' || x.def.race === 'Warrior'),
    })],
  },
  'The Kick Man': { effects: [trig('specialSummoned', run(async ({ d, p, card }) => { const e = await pick(d, p, 'Equip an Equip Spell from your Graveyard', P(d, p).gy.filter((c) => c.def.stype === 'equip' && (!c.def.equip?.f || d.match(card, c.def.equip.f, p, c))), 'good'); if (e) await d.equipCard(e, card, undefined, p); }), { optional: true })] },
  'The Lady in Wight': {
    lock: {
      indestructible: (d, src, c, by) => !!src && by === 'battle' && c !== src && c.ctrl === src.ctrl && c.faceUp && d.raceOf(c) === 'Zombie' && d.lvOf(c) <= 3,
      unaffected: (d, src, c, by) => !!src && c !== src && c.zone === 'mzone' && c.ctrl === src.ctrl && c.faceUp && d.raceOf(c) === 'Zombie' && d.lvOf(c) <= 3 && by.def.kind !== 'monster',
    },
  },
  'The Light - Hex-Sealed Fusion': hexSealed('LIGHT'),
  'The Six Samurai - Irou': merge(samuraiSub, { preBattle: async (d, self, other) => { if (d.battle?.att !== self || !other || other.faceUp || other.pos !== 'def' || !samurai(self, d)) return false; await d.destroy(other, 'effect', undefined, self.ctrl); return true; } }),
  'The Six Samurai - Kamon': merge(samuraiSub, { effects: [ign([{ op: 'destroy', s: { t: 'target' } }, { op: 'noAttackSelf' }], { opt: true, label: 'Destroy a face-up Spell/Trap', targets: [{ f: { ...ST, faceUp: true } }], cond: (d, c) => samurai(c, d) })] }),
  'The Six Samurai - Nisashi': merge(samuraiSub, { ruleIf: { doubleAttack: (d, c) => samurai(c, d) } }),
  'The Six Samurai - Yaichi': merge(samuraiSub, { effects: [ign([{ op: 'destroy', s: { t: 'target' } }, { op: 'noAttackSelf' }], { opt: true, label: 'Destroy a Set Spell/Trap', targets: [{ f: { ...ST, faceUp: false } }], cond: (d, c) => samurai(c, d) })] }),
  'The Six Samurai - Yariza': merge(samuraiSub, { ruleIf: { direct: (d, c) => samurai(c, d) } }),
  'The Six Samurai - Zanji': merge(samuraiSub, { postBattle: async (d, self, o, r) => { if (o && r.att === self && o.zone === 'mzone' && samurai(self, d)) await d.destroy(o, 'effect', undefined, self.ctrl); } }),
  'The Thing in the Crater': { effects: [trig('destroyed', ssFrom(['hand'], { race: ['Pyro'] }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'The Tricky': { ssProc: { cost: [{ op: 'discard', who: 'self', n: 1 }], cond: (d, p, c) => P(d, p).hand.some((x) => x !== c) } },
  'The Trojan Horse': { doubleTribute: (_d, t) => t.def.attr === 'EARTH' },
  'The Unhappy Girl': {
    lock: {
      indestructible: (_d, src, c, by) => !!src && c === src && by === 'battle' && src.pos === 'atk',
      attack: (_d, src, a) => !!src && src.pos === 'atk' && (src.data.unhappy ?? []).includes(a.uid),
      pos: (_d, src, c) => !!src && src.pos === 'atk' && (src.data.unhappy ?? []).includes(c.uid),
    },
    postBattle: (_d, self, o) => { if (o) self.data.unhappy = [...(self.data.unhappy ?? []), o.uid]; },
  },
  'The Wicked Avatar': {
    noSpecial: true, tributes: () => 3,
    statFn: (d, c) => { const top = Math.max(0, ...both(d).filter((x) => x !== c && x.faceUp && x.def.name !== 'The Wicked Avatar').map((x) => d.atk(x))); return { atk: top + 100 - d.base(c, 'atk'), def: top + 100 - d.base(c, 'def') }; },
    effects: [trig('normalSummoned', run(({ d, o }) => d.addTemp({ until: d.turn + 4, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind !== 'monster' } })))],
  },
  'The Wicked Dreadroot': { noSpecial: true, tributes: () => 3, auraFn: (d, src, c) => (c !== src ? { atk: -Math.floor(d.base(c, 'atk') / 2), def: -Math.floor(d.base(c, 'def') / 2) } : undefined) },
  'The Wicked Eraser': {
    noSpecial: true, tributes: () => 3,
    statFn: (d, c) => { const n = 1000 * d.fieldCards(opp(c.ctrl)).length; return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
    effects: [
      trig('destroyed', run(async ({ d, p }) => { for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
      ign({ op: 'destroy', s: { t: 'this' } }, { label: 'Destroy this card', cond: (d) => d.phase === 'M1' || d.phase === 'M2', ai: (d, me) => d.fieldCards(opp(me)).length * 700 - d.fieldCards(me).length * 600 }),
    ],
  },
  'Theban Nightmare': { statFn: (d, c) => (P(d, c.ctrl).hand.length === 0 && P(d, c.ctrl).s.every((x) => !x) ? { atk: 1500 } : undefined) },
  'Theinen the Great Sphinx': {
    noNormal: true,
    effects: [
      quick(run(async ({ d, p, card }) => { if ((card.zone === 'hand' || card.zone === 'deck') && d.canSpecial(p, card)) { card.properly = true; await d.specialSummon(card, p, await d.askPos(p, card)); } }, 2000), {
        from: ['hand'], label: 'Pay 500 LP: Special Summon Theinen', cost: [{ op: 'payLP', n: 500 }],
        when: (d, ev, p) => ev.e === 'sent' && ev.ctrl === p && ['Andro Sphinx', 'Sphinx Teleia'].includes(ev.card.def.name) && P(d, p).gy.filter((c) => ['Andro Sphinx', 'Sphinx Teleia'].includes(c.def.name) && c.mark.destroyedTurn === d.turn).length >= 2,
      }),
      trig('specialSummoned', run(({ d, card }) => { d.addMod(card, 3000, 0); }), { optional: true, cost: [{ op: 'payLP', n: 500 }] }),
    ],
  },
  'Thestalos the Firestorm Monarch': {
    effects: [trig('normalSummoned', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (!c) return; await d.discard(o, [c], p); if (c.def.kind === 'monster') await d.damage(o, 100 * (c.def.lv ?? 0)); }), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })],
  },
  'Thousand Needles': needles,
  'Thousand-Eyes Jellyfish': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: "Ocean's Keeper" } } }], req: [{ f: { ...OWN_M, name: "Ocean's Keeper" } }] },
    reveals: (_d, src, s) => s !== src.ctrl,
  },
  'Throwstone Unit': { effects: [ign(run(async ({ d, p, card, t }) => { const c = t[0]; if (c && d.defv(c) <= d.atk(card)) await d.destroy(c, 'effect', undefined, p); }, 600), { label: 'Tribute a Warrior: destroy a monster', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Warrior'], notThis: true } } }], targets: [{ f: { ...FU, notThis: true, fn: (d, c, _p, src) => !!src && d.defv(c) <= d.atk(src) } }] })] },
  'Thunder King Rai-Oh': {
    lock: { noAdd: (_d, _s, c) => c.zone === 'deck' },
    effects: [quick({ op: 'negate' }, { label: 'Send to the GY: negate a Special Summon', cost: [{ op: 'toGY', s: { t: 'this' } }], when: (_d, ev, p) => ev.e === 'summoning' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip' && !ev.negated, ai: 900 })],
  },
  'Thunder Nyan Nyan': { selfDestructIf: (d, c) => d.monsters(c.ctrl).some((m) => m.faceUp && d.attrOf(m) !== 'LIGHT') },
  'Timeater': { effects: [trig('destroysByBattle', run(({ d, o }) => { d.addTemp({ until: d.turn + 1, tag: 'skipM1', p: o }); }))] },
  'Tongue Twister': { effects: [trig('fieldToGY', [{ op: 'draw', who: 'self', n: 2 }, { op: 'banish', s: { t: 'this' } }], { from: ['gy'], cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 && c.mark.how === 'normal' })] },
  'Toon Cannon Soldier': toonExtra({ effects: [ign({ op: 'damage', who: 'opp', n: 500 }, { label: 'Tribute a monster: 500 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }] })] }),
  'Toon Dark Magician Girl': toonExtra({ noNormal: true, ssProc: { cond: (d, p) => d.active('Toon World', p), cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }] }, statFn: (d) => ({ atk: 300 * [...P(d, 0).gy, ...P(d, 1).gy].filter((c) => ['Dark Magician', 'Magician of Black Chaos'].includes(c.def.name)).length }) }),
  'Toon Gemini Elf': toonExtra({ effects: [trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] }),
  'Toon Goblin Attack Force': toonExtra({ postBattle: (d, self, _o, r) => { if (r.att !== self) return; const mv = self.mv; d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (self.mv !== mv || self.zone !== 'mzone') return; await d.changePos(self, 'def'); d.addTemp({ until: d.turn + 2, lock: { pos: (_d, _s, c) => c === self && c.mv === mv } }); } }); } }),
  'Toon Masked Sorcerer': toonExtra({ effects: [trig('battleDamage', { op: 'draw', who: 'self', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] }),
  'Torpedo Fish': { immune: (d, _s, src) => umi(d) && src.def.kind === 'spell' },
  'Toy Magician': { effects: [trig('flipSummoned', run(async ({ d, p }) => { const n = both(d).filter((c) => c.faceUp && c.def.name === 'Toy Magician').length; for (const c of await d.select(p, `Destroy up to ${n} Spell/Trap Cards`, d.find(ST, p), 0, n, 'bad')) await d.destroy(c, 'effect', undefined, p); }))] },
  'Treeborn Frog': { effects: [trig('standby', run(async ({ d, p, card }) => { if (card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }), { optional: true, from: ['gy'], cond: (d, c) => c.zone === 'gy' && d.spellTraps(c.owner).length === 0 && !has(d, c.owner, 'Treeborn Frog') })] },
  'Tribe-Infecting Virus': { effects: [ign(run(async ({ d, p, o }) => { const r = await declareRace(d, p, 'Declare a Type', d.monsters(o).filter((c) => c.faceUp)); for (const c of both(d).filter((x) => x.faceUp && d.raceOf(x) === r)) await d.destroy(c, 'effect', undefined, p); }, 700), { label: 'Discard: destroy a Type', cost: [{ op: 'discard', who: 'self', n: 1 }] })] },
  'Troop Dragon': { effects: [trig('battleDestroyed', ssFrom(['deck'], { name: 'Troop Dragon' }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Truckroid': {
    statFn: (d, c) => ({ atk: d.equipsOf(c).filter((e) => (c.data.truck ?? []).includes(e.uid)).reduce((s, e) => s + (e.def.atk ?? 0), 0) }),
    effects: [trig('destroysByBattle', run(async ({ d, p, card, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy' && (await d.equipCard(o, card, {}, p))) card.data.truck = [...(card.data.truck ?? []), o.uid]; }))],
  },
  'Tsukuyomi': spirit(trig(['normalSummoned', 'flipSummoned'], run(async ({ d, t }) => { const c = t[0]; if (c && c.faceUp) { c.pos = 'def'; await d.setFaceDown(c); } }), { targets: [{ f: FU }] })),
  'Tualatin': {
    effects: [quick(run(async ({ d, p, o, card }) => {
      if (card.zone !== 'hand' || !d.canSpecial(p, card) || !(await d.specialSummon(card, p, await d.askPos(p, card)))) return;
      const a = await declareAttr(d, p, 'Choose an Attribute', d.monsters(o));
      for (const c of both(d).filter((x) => x.faceUp && d.attrOf(x) === a)) await d.destroy(c, 'effect', undefined, p);
      d.addTemp({ until: 1e9, lock: { summon: (_d, src, q, c) => q === o && c.def.attr === a && !!src } });
    }, 2000), { from: ['hand'], label: 'Special Summon Tualatin', when: (d, ev, p) => ev.e === 'sent' && ev.why === 'battle' && ev.ctrl === p && d.phase === 'BP' && d.tp !== p && d.monsters(p).length === 0 && P(d, p).gy.filter((c) => c.mark.destroyedHow === 'battle' && c.mark.destroyedTurn === d.turn).length >= 2 })],
  },
  'Twin-Headed Behemoth': {
    effects: [trig('fieldToGY', run(({ d, card }) => {
      card.mark.behemothUsed = true;
      const mv = card.mv, p = card.owner;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card) && (await d.specialSummon(card, p, await d.askPos(p, card)))) card.data.copy = { atk: 1000, def: 1000 }; } });
    }), { from: ['gy'], cond: (_d, c) => !c.mark.behemothUsed })],
  },
  'Twin-Headed Wolf': { postBattle: (d, self, o, r) => { if (o && won(self, r) && d.find({ ...OWN_FU, race: ['Fiend'], notThis: true }, self.ctrl, self).length && o.def.effects?.some((e) => e.type === 'flip')) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } } },
  'Twinheaded Beast': { rules: ['doubleAttack'] },
  'Two Thousand Needles': needles,
  'Tyranno Infinity': { statFn: (d, c) => ({ atk: 1000 * P(d, c.ctrl).banished.filter((x) => x.def.kind === 'monster' && x.def.race === 'Dinosaur').length - d.base(c, 'atk') }) },
  'Tyrant Dragon': {
    extraAttacks: (d, c) => (d.monsters(opp(c.ctrl)).length > 0 && c.attacks >= 1 ? 1 : 0),
    onTargeted: async (d, self, link) => { if (link.isCard && link.card.def.kind === 'trap') { link.negated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
  },
  'UFOroid': { effects: [trig('battleDestroyed', ssFrom(['deck'], { race: ['Machine'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }, { pos: 'atk' }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'UFOroid Fighter': {
    mats: [{ name: 'UFOroid' }, { race: 'Warrior' }],
    statFn: (d, c) => ({ atk: (c.mark.matAtk ?? 0) - d.base(c, 'atk'), def: (c.mark.matAtk ?? 0) - d.base(c, 'def') }),
  },
  'Ulevo': lordTrib('Winged Beast'),
  'Ultimate Ancient Gear Golem': {
    noNormal: true, rules: ['pierce'],
    mats: [{ name: 'Ancient Gear Golem' }, { set: 'Ancient Gear' }, { set: 'Ancient Gear' }],
    lock: noSTOnAttack(),
    effects: [trig('destroyed', ssFrom(['gy'], { name: 'Ancient Gear Golem' }, { ignore: true }), { optional: true, from: ['gy'] })],
  },
  'Ultimate Baseball Kid': {
    statFn: (d, c) => ({ atk: 1000 * both(d).filter((x) => x !== c && x.faceUp && d.attrOf(x) === 'FIRE').length }),
    effects: [ign({ op: 'damage', who: 'opp', n: 500 }, { label: 'Send a FIRE monster: 500 damage', cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_M, attr: 'FIRE', notThis: true } } }] })],
  },
  'Ultimate Insect LV1': merge(insectLv('Ultimate Insect LV3', undefined, 0), { immune: (_d, _s, src) => src.def.kind === 'spell' }),
  'Ultimate Insect LV3': insectLv('Ultimate Insect LV5', 'Ultimate Insect LV1', 300),
  'Ultimate Insect LV5': insectLv('Ultimate Insect LV7', 'Ultimate Insect LV3', 500),
  'Ultimate Insect LV7': insectLv(undefined, 'Ultimate Insect LV5', 700, true),
  'Ultimate Obedient Fiend': {
    attackCond: (d, c) => d.fieldCards(c.ctrl).length === 1 && P(d, c.ctrl).hand.length === 0,
    postBattle: (d, self, o, r) => { if (o && won(self, r)) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } },
  },
  'Ultimate Tyranno': { rules: ['attackAll'] },
  'Umbral Soul': wipeNon('DARK'),
  'Unifrog': {
    rules: ['direct'],
    effects: [trig('battleDamage', { op: 'destroy', s: { t: 'target' } }, { optional: true, targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }], cond: (d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl && d.find({ ...OWN_FU, fn: (_d, x) => x.def.name.includes('Frog') && !['Frog the Jam', 'Unifrog'].includes(x.def.name) }, c.ctrl).length > 0 })],
  },
  'Union Rider': {
    effects: [ign(run(async ({ d, p, card, t }) => { const u = t[0]; if (u && u.zone === 'mzone' && (await d.equipCard(u, card, { sub: true }, p))) { u.mark.unionTurn = 1e9; } }, 600), { label: "Equip an opponent's Union monster", targets: [{ f: { ...OPP_FU, ability: 'union' } }], cond: (d, c) => !d.equipsOf(c).some((e) => e.def.ability === 'union') })],
  },
  'Unshaven Angler': { doubleTribute: (_d, t) => t.def.attr === 'WATER' },
  'Uria, Lord of Searing Flames': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, kind: 'trap' }, n: 3 } }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, kind: 'trap' }, n: 3 }] },
    statFn: (d, c) => ({ atk: 1000 * P(d, c.ctrl).gy.filter((x) => x.def.kind === 'trap' && x.def.stype === 'continuous').length }),
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Destroy a Set Spell/Trap', targets: [{ f: { side: 'opp', zone: ['szone', 'fzone'], faceUp: false } }] })],
  },
  'Vampire Genesis': {
    noNormal: true,
    ssProc: { cost: [{ op: 'banish', s: { t: 'choose', f: { ...OWN_FU, name: 'Vampire Lord' } } }], req: [{ f: { ...OWN_FU, name: 'Vampire Lord' } }] },
    effects: [ign(run(async ({ d, p, card, link }) => { await ssPick(d, p, d.find({ ...GY_M('self'), race: ['Zombie'], fn: (_d, c) => (c.def.lv ?? 0) < (link.data.lv ?? 0) }, p), 'Special Summon a Zombie', undefined, false, card); }, 700), {
      opt: true, label: 'Discard a Zombie: Special Summon a lower Level Zombie',
      cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Discard a Zombie', P(d, p).hand.filter((x) => x.def.kind === 'monster' && x.def.race === 'Zombie'), 'cost'); if (c) { link.data.lv = c.def.lv ?? 0; await d.discard(p, [c], null); } }, 0, (d, p) => P(d, p).hand.some((x) => x.def.kind === 'monster' && x.def.race === 'Zombie'))],
    })],
  },
  'Vampire Lady': vampire(false),
  'Vampire Lord': vampire(true),
  'Vampire Orchis': { effects: [trig('normalSummoned', ssFrom(['hand'], { name: 'Des Dendle' }), { optional: true })] },
  "Vampire's Curse": {
    effects: [trig('battleDestroyed', run(({ d, card }) => {
      const p = card.owner, mv = card.mv;
      d.schedule({ at: 'SP', turn: d.turn + 1, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card) && (await d.specialSummon(card, p, await d.askPos(p, card)))) d.addMod(card, 500, 0, -1); } });
    }), { optional: true, from: ['gy'], cost: [{ op: 'payLP', n: 500 }], cond: (_d, c) => c.zone === 'gy' })],
  },
  "Van'Dalgyon the Dark Dragon Lord": {
    effects: [quick(run(async ({ d, p, o, card, link }) => {
      const ev = link.ev;
      if (card.zone !== 'hand' || ev.e !== 'chain' || !(await d.specialSummon(card, p, await d.askPos(p, card)))) return;
      const k = ev.link.card.def.kind;
      if (k === 'spell') await d.damage(o, 1500);
      else if (k === 'trap') { const c = await pick(d, p, 'Destroy a card', d.fieldCards(o), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }
      else await ssPick(d, p, P(d, p).gy.filter((c) => c.def.kind === 'monster'), 'Special Summon a monster');
    }, 2000), { from: ['hand'], label: "Special Summon Van'Dalgyon", when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && !!ev.link.negated })],
  },
  "Vanity's Fiend": { noSpecial: true, lock: { summon: (_d, _s, _p, _c, how) => how !== 'normal' && how !== 'flip' } },
  "Vanity's Ruler": { noSpecial: true, lock: { summon: (_d, src, p, _c, how) => !!src && p !== src.ctrl && how !== 'normal' && how !== 'flip' } },
  'Vengeful Shinobi': { effects: [trig('attacked', { op: 'draw', who: 'self', n: 1 }, { cond: (_d, c) => c.faceUp && c.pos === 'atk' })] },
  'Vennominaga the Deity of Poisonous Snakes': merge(snake(), {
    noNormal: true,
    immune: (_d, self, src) => src !== self,
    winCheck: (_d, c) => c.zone === 'mzone' && ctr(c, 'hypervenom') >= 3,
    effects: [trig('battleDamage', run(({ d, card }) => { addCtr(d, card, 1, 'hypervenom'); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  }),
  'Vennominon the King of Poisonous Snakes': snake(),
};

void ATTRS; void attackOf; void isAttackOn; void threat; void destroyAll; void search; void tokens; void tokenDef; void removeCtr; void atEndPhase; void banishProc; void OPP_M; void M; void union;
