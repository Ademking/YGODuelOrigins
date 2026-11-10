// YGO Online monsters, part 10 (Phantom Skyblaster … Serpentine Princess).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, both, crystalInST, ctr, destroyAll, flip, has, ign, isAttackOn, merge, opp, pick, quick, randomOf,
  removeCtr, run, search, spellCounterGain, ssFrom, ssPick, threat, tokenDef, tokens, trig, union, won, atEndPhase,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
const setSelf = ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (d, c) => c.faceUp && c.data.sumTurn !== d.turn });
const battleKill = (pred: (d: Duel, o: Card) => boolean): Def => ({ postBattle: async (d, self, o) => { if (o && o.zone === 'mzone' && o.ctrl !== self.ctrl && pred(d, o)) await d.destroy(o, 'effect', undefined, self.ctrl); } });
const wipeNon = (attr: string): Def => ({ effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of both(d).filter((x) => !x.faceUp || d.attrOf(x) !== attr)) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] });
const monarch = (fn: Parameters<typeof run>[0]): Def => ({ effects: [trig('normalSummoned', run(fn), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })] });
const destroyDown = (pred: (d: Duel, self: Card) => boolean = () => true): Def['preBattle'] => async (d, self, other) => {
  if (d.battle?.att !== self || !other || other.faceUp || other.pos !== 'def' || !pred(d, self)) return false;
  await d.destroy(other, 'effect', undefined, self.ctrl);
  return true;
};
const victimGY = (fn: (d: Duel, p: Side, o: Card) => unknown) => trig('destroysByBattle', run(async ({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy') await fn(d, p, o); }));
const dwDiscard = (fn: Parameters<typeof run>[0], byOpp = false) => trig('effDiscarded', run(fn), { from: ['gy'], cond: (_d, c) => !byOpp || (c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner) });

export const MONSTERS_10: Record<string, Def> = {
  'Phantom Skyblaster': {
    effects: [
      trig(['normalSummoned', 'flipSummoned'], run(async ({ d, p }) => { const n = Math.min(d.monsters(p).length, d.freeCount(p, 'm')); await tokens(d, p, tokenDef('Skyblaster Token', 'Fiend', 'DARK', 4, 500, 500), n, 'def'); }), { optional: true }),
      trig('standby', run(async ({ d, p, o }) => {
        const sky = d.monsters(p).filter((c) => c.faceUp && d.nameOf(c).includes('Skyblaster'));
        await d.damage(o, 300 * sky.length);
        for (const c of sky) c.noAttackTurn = d.turn;
      }), { optional: true, cond: (_d, c) => c.zone === 'mzone' && c.faceUp }),
    ],
  },
  'Pinch Hopper': { effects: [trig('fieldToGY', ssFrom(['hand'], { race: ['Insect'] }), { optional: true, from: ['gy'] })] },
  'Piranha Army': { battleDmg: (_d, self, other, n, to) => (!other && to !== self.ctrl ? n * 2 : n) },
  'Pitch-Black Warwolf': { lock: { activate: (d, src, p, c) => !!src && p !== src.ctrl && c.def.kind === 'trap' && d.phase === 'BP' } },
  'Pitch-Dark Dragon': union({ name: 'Dark Blade' }, 400, 400, { rules: ['pierce'] }),
  'Pixie Knight': { effects: [trig('battleDestroyed', run(async ({ d, p, o }) => { const c = await pick(d, o, 'Place a Spell from your opponent\'s Graveyard on top of their Deck', P(d, p).gy.filter((x) => x.def.kind === 'spell'), 'bad'); if (c) await d.move(c, 'deck'); }), { from: ['gy'], cond: (d, c) => P(d, c.owner).gy.some((x) => x.def.kind === 'spell') })] },
  'Plague Wolf': { effects: [ign(run(({ d, p, card }) => { d.addMod(card, d.base(card, 'atk') * 2 - d.atk(card), 0); atEndPhase(d, card, (x) => d.destroy(x, 'effect', undefined, p)); }, (d) => (d.phase === 'M1' ? 300 : -1)), { opt: true, label: 'Double the ATK (destroyed at the End Phase)' })] },
  'Poison Draw Frog': { effects: [trig('fieldToGY', { op: 'draw', who: 'self', n: 1 }, { optional: true, from: ['gy'], cond: (_d, c) => !!c.mark.lastFaceUp })] },
  'Poison Mummy': { effects: [flip({ op: 'damage', who: 'opp', n: 500 })] },
  'Possessed Dark Soul': { effects: [ign(run(async ({ d, p }) => { for (const c of d.find({ ...OPP_FU, maxLv: 3 }, p)) await d.takeControl(c, p, true); }, (d, me) => d.find({ ...OPP_FU, maxLv: 3 }, me).length * 800 - 600), { label: 'Tribute: take control of Level 3 or lower monsters', cost: [{ op: 'tribute', s: { t: 'this' } }] })] },
  'Prickle Fairy': {
    lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.ctrl === src.ctrl && t.faceUp && d.raceOf(t) === 'Insect' },
    postBattle: async (d, self, o) => { if (o && o.zone === 'mzone' && o.pos === 'atk') await d.changePos(o, 'def'); },
  },
  'Prime Material Dragon': {
    lock: { damageToHeal: () => true },
    effects: [quick({ op: 'negate' }, { label: 'Discard: negate a destruction effect', cost: [{ op: 'discard', who: 'self', n: 1 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'destroy'), ai: 700 })],
  },
  'Princess Curran': { noNormal: true, effects: [trig('standby', run(({ d, o }) => d.damage(o, 600 * d.monsters(o).length)), { cond: (d, c) => c.zone === 'mzone' && d.monsters(opp(c.ctrl)).length > 0 })] },
  'Princess Pikeru': { noNormal: true, effects: [trig('standby', run(({ d, p }) => d.heal(p, 800 * d.monsters(p).length)), { cond: (_d, c) => c.zone === 'mzone' })] },
  'Prometheus, King of the Shadows': { effects: [trig('normalSummoned', run(async ({ d, p, card }) => { const cs = await d.select(p, 'Banish DARK monsters', d.find({ ...GY_M('self'), attr: 'DARK' }, p), 0, 60, 'cost'); for (const c of cs) await d.banish(c, p); d.addMod(card, 400 * cs.length, 0); }), { optional: true, cond: (d, c) => d.find({ ...GY_M('self'), attr: 'DARK' }, c.ctrl).length > 0 })] },
  'Protective Soul Ailin': union({ name: 'Indomitable Fighter Lei Lei' }),
  'Protector of the Sanctuary': { lock: {} },
  'Proto-Cyber Dragon': { alias: 'Cyber Dragon' },
  'Puppet King': {
    effects: [quick(run(async ({ d, p, card }) => { if (card.zone === 'hand' && (await d.specialSummon(card, p, await d.askPos(p, card)))) { const mv = card.mv; d.schedule({ at: 'EP', turn: d.turn + (d.tp === p ? 2 : 1), fn: async () => { if (card.mv === mv && card.zone === 'mzone') await d.destroy(card, 'effect', undefined, p); } }); } }, 1500), {
      from: ['hand'], label: 'Special Summon Puppet King', when: (d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'toHand' && 's' in o && o.s.t === 'choose' && [o.s.f.zone].flat().includes('deck')),
    })],
  },
  'Puppet Master': {
    effects: [trig('normalSummoned', run(async ({ d, p, card }) => {
      for (let i = 0; i < 2; i++) { const c = await ssPick(d, p, d.find({ ...GY_M('self'), race: ['Fiend'] }, p), 'Special Summon a Fiend', undefined, false, card); if (c) c.noAttackTurn = d.turn; }
    }), { optional: true, cost: [{ op: 'payLP', n: 2000 }], cond: (d, c) => (c.mark.tribCount ?? 0) > 0 && d.find({ ...GY_M('self'), race: ['Fiend'] }, c.ctrl).length >= 2 })],
  },
  'Puppet Plant': { effects: [ign({ op: 'control', s: { t: 'target' } }, { from: ['hand'], label: 'Discard: take control of a Warrior or Spellcaster', targets: [{ f: { ...OPP_FU, race: ['Warrior', 'Spellcaster'] } }], cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })] })] },
  'Pyramid Turtle': { effects: [trig('battleDestroyed', ssFrom(['deck'], { race: ['Zombie'], fn: (_d, c) => (c.def.def ?? 0) <= 2000 }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Queen of Fate - Eternia': { noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === 'Fairy' },
  "Queen's Bodyguard": { lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.ctrl === src.ctrl && t.def.name.includes('Allure Queen') } },
  'Radiant Jeral': { effects: [trig('toGY', { op: 'heal', who: 'self', n: 1000 }, { from: ['gy'], cond: (d, c) => c.mark.lastWhy !== 'battle' && d.active('The Sanctuary in the Sky') })] },
  'Radiant Spirit': wipeNon('LIGHT'),
  'Rafflesia Seduction': { effects: [flip({ op: 'control', s: { t: 'target' } }, { targets: [{ f: OPP_FU }] })] },
  'Raging Earth': wipeNon('EARTH'),
  'Raging Eria': { effects: [ign({ op: 'summon', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WATER' } }, bind: true }, { opt: true, label: 'Tribute a WATER monster: Special Summon a WATER monster', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'WATER', notThis: true } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WATER' } }] })] },
  'Raging Flame Sprite': { rules: ['direct'], effects: [trig('battleDamage', { op: 'stat', s: { t: 'this' }, atk: 1000, perm: true }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl })] },
  'Rainbow Dark Dragon': {
    noNormal: true,
    ssProc: { cond: (d, p) => new Set(P(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.attr === 'DARK').map((c) => c.def.name)).size >= 7, cost: [run(async ({ d, p }) => { const seen = new Set<string>(); for (const c of P(d, p).gy.filter((x) => x.def.kind === 'monster' && x.def.attr === 'DARK')) { if (seen.has(c.def.name) || seen.size >= 7) continue; seen.add(c.def.name); await d.banish(c, p); } })] },
    effects: [ign(run(async ({ d, p, card }) => { const cs = [...d.find({ ...OWN_M, attr: 'DARK', notThis: true }, p, card), ...d.find({ ...GY_M('self'), attr: 'DARK' }, p)]; for (const c of cs) await d.banish(c, p); d.addMod(card, 500 * cs.length, 0, -1); }, 800), { label: 'Banish DARK monsters: gain ATK' })],
  },
  'Rainbow Dragon': {
    noNormal: true,
    ssProc: { cond: (d, p) => new Set([...d.fieldCards(p), ...P(d, p).gy].filter((c) => c.def.name.includes('Crystal Beast')).map((c) => c.def.name)).size >= 7 },
    effects: [
      quick(run(async ({ d, p, card }) => { const cs = d.find({ ...OWN_FU, set: 'Crystal Beast' }, p); for (const c of cs) await d.move(c, 'gy', { by: p, why: 'cost' }); d.addMod(card, 1000 * cs.length, 0, -1); }, 900), { label: 'Send Crystal Beasts: gain ATK', cond: (d, c) => c.data.sumTurn !== d.turn && d.find({ ...OWN_FU, set: 'Crystal Beast' }, c.ctrl).length > 0 }),
      ign(run(async ({ d, p, card }) => {
        for (const c of d.find({ ...GY_M('self'), set: 'Crystal Beast' }, p)) await d.banish(c, p);
        for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) if (c !== card) await d.move(c, 'deck');
        await d.shuffleDeck(0); await d.shuffleDeck(1);
      }, (d, me) => d.fieldCards(opp(me)).length * 700 - (d.fieldCards(me).length - 1) * 600), { label: 'Banish Crystal Beasts: shuffle all cards on the field', cond: (d, c) => c.data.sumTurn !== d.turn && d.find({ ...GY_M('self'), set: 'Crystal Beast' }, c.ctrl).length > 0 }),
    ],
  },
  'Rainbow Neos': {
    noNormal: true,
    mats: [{ name: 'Elemental Hero Neos' }, { fn: (c) => c.def.name === 'Rainbow Dragon' || c.def.name === 'Rainbow Dark Dragon', text: '"Rainbow Dragon" or "Rainbow Dark Dragon"' }],
    effects: [ign(run(async ({ d, p, o, card }) => {
      const opts = ['Send a monster: shuffle all opponent monsters', 'Send a Spell/Trap: shuffle all opponent Spells/Traps', 'Mill 1: shuffle the opponent\'s Graveyard'];
      const i = await d.option(p, 'Rainbow Neos', opts, d.monsters(o).length ? 0 : 2);
      if (i === 0) { const c = await pick(d, p, 'Send a monster you control', d.monsters(p).filter((x) => x !== card), 'cost'); if (!c) return; await d.move(c, 'gy', { by: p }); for (const x of d.monsters(o)) await d.move(x, 'deck'); }
      else if (i === 1) { const c = await pick(d, p, 'Send a Spell/Trap you control', d.spellTraps(p), 'cost'); if (!c) return; await d.move(c, 'gy', { by: p }); for (const x of d.spellTraps(o)) await d.move(x, 'deck'); }
      else { await d.mill(p, 1, p); for (const x of [...P(d, o).gy]) await d.move(x, 'deck'); }
      await d.shuffleDeck(o);
    }, 1500), { opt: true, label: 'Rainbow Neos effect' })],
  },
  'Raiza the Storm Monarch': monarch(async ({ d, p }) => { const c = await pick(d, p, 'Return a card to the top of the Deck', [...d.fieldCards(0), ...d.fieldCards(1)], 'bad'); if (c) await d.move(c, 'deck'); }),
  'Rallis the Star Bird': {
    statFn: (d, c) => { const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null); return o ? { atk: 200 * (o.def.lv ?? 0) } : undefined; },
    postBattle: async (d, self, _o, r) => {
      if (r.att !== self || self.zone !== 'mzone') return;
      const p = self.ctrl;
      await d.banish(self, p);
      const mv = self.mv;
      d.schedule({ at: 'DP', side: p, fn: async () => { if (self.mv === mv && self.zone === 'banished' && d.canSpecial(p, self)) await d.specialSummon(self, p, 'atk'); } });
    },
  },
  'Rampaging Rhynos': {
    effects: [ign(run(async ({ d, p, card }) => {
      const to = [card.slot - 1, card.slot + 1].find((i) => i >= 0 && i < 5 && !P(d, p).m[i]);
      if (to === undefined) return;
      P(d, p).m[card.slot] = null; P(d, p).m[to] = card; card.slot = to;
      await d.emit({ t: 'move', card, from: 'mzone', to: 'mzone' });
    }, -1), { opt: true, label: 'Move to an adjacent zone', cond: (d, c) => [c.slot - 1, c.slot + 1].some((i) => i >= 0 && i < 5 && !P(d, c.ctrl).m[i]) })],
    statFn: (d, c) => (d.battle?.att === c && d.battle.tgt && d.battle.tgt.slot === 4 - c.slot ? { atk: 500 } : undefined),
  },
  'Rancer Dragonute': { rules: ['pierce'] },
  'Rapid-Fire Magician': { onResolve: async (d, src, link) => { if (link.isCard && link.p === src.ctrl && link.card.def.kind === 'spell' && link.card.def.stype === 'normal') await d.damage(opp(src.ctrl), 400, src); } },
  'Rare Metal Dragon': { noNormal: true },
  'Raviel, Lord of Phantasms': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Fiend'] }, n: 3 } }], req: [{ f: { ...OWN_M, race: ['Fiend'] }, n: 3 }] },
    onSummon: async (d, src, _c, how, p) => { if (p !== src.ctrl && how === 'normal') await tokens(d, src.ctrl, tokenDef('Phantasm Token', 'Fiend', 'DARK', 1, 1000, 1000, { rules: ['cantAttack'] }), 1, 'def'); },
    effects: [ign(run(({ d, card, link }) => { d.addMod(card, link.data.atk ?? 0, 0); }, 500), {
      opt: true, label: 'Tribute a monster: gain its ATK',
      cost: [run(async ({ d, p, card, link }) => { const c = await pick(d, p, 'Tribute 1 monster', d.monsters(p).filter((x) => x !== card && d.tributeOk(x)), 'cost'); if (c) { link.data.atk = c.def.atk ?? 0; await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p, card) => d.monsters(p).some((x) => x !== card && d.tributeOk(x)))],
    })],
  },
  'Razor Lizard': { preBattle: destroyDown((d, self) => d.find({ ...OWN_FU, race: ['Reptile'], notThis: true }, self.ctrl, self).length > 0) },
  'Reaper on the Nightmare': {
    rules: ['battleImmune', 'direct'],
    onTargeted: async (d, self) => { await d.destroy(self, 'effect'); },
    effects: [trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl })],
  },
  'Reborn Zombie': { lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'battle' && src.pos === 'atk' && P(d, src.ctrl).hand.length === 0 } },
  'Red Gadget': { effects: [trig(['normalSummoned', 'specialSummoned'], search({ name: 'Yellow Gadget' }), { optional: true })] },
  'Red-Eyes B. Chick': { effects: [ign(ssFrom(['hand'], { name: 'Red-Eyes B. Dragon' }), { label: 'Send to the GY: Special Summon Red-Eyes', cost: [{ op: 'toGY', s: { t: 'this' } }], req: [{ f: { side: 'self', zone: 'hand', name: 'Red-Eyes B. Dragon' } }] })] },
  'Red-Eyes Darkness Dragon': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Red-Eyes B. Dragon' } } }], req: [{ f: { ...OWN_M, name: 'Red-Eyes B. Dragon' } }] },
    statFn: (d, c) => ({ atk: 300 * P(d, c.ctrl).gy.filter((x) => x.def.kind === 'monster' && x.def.race === 'Dragon').length }),
  },
  'Red-Eyes Darkness Metal Dragon': {
    ssProc: { cost: [{ op: 'banish', s: { t: 'choose', f: { ...OWN_FU, race: ['Dragon'] } } }], req: [{ f: { ...OWN_FU, race: ['Dragon'] } }] },
    effects: [ign(ssFrom(['hand', 'gy'], { race: ['Dragon'], fn: (_d, c) => c.def.name !== 'Red-Eyes Darkness Metal Dragon' }), { opt: true, label: 'Special Summon a Dragon' })],
  },
  'Reflect Bounder': {
    preBattle: async (d, self, other) => { if (other && d.battle?.tgt === self && self.faceUp && self.pos === 'atk') await d.damage(opp(self.ctrl), d.atk(other), self); },
    postBattle: async (d, self, o, r) => { if (o && r.tgt === self && self.zone === 'mzone') await d.destroy(self, 'effect', undefined, self.ctrl); },
  },
  'Regenerating Mummy': { effects: [trig('toGY', { op: 'toHand', s: { t: 'this' } }, { from: ['gy'], cond: (_d, c) => c.mark.from === 'hand' && c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner })] },
  'Regenerating Rose': { effects: [trig('battleDestroyed', run(({ d, p }) => tokens(d, p, tokenDef('Regenerating Rose Token', 'Plant', 'DARK', 3, 1200, 1200), 2, 'atk')), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Reign-Beaux, Overlord of Dark World': {
    effects: [dwDiscard(async ({ d, p, o, card }) => {
      if (card.zone !== 'gy' || !d.canSpecial(p, card) || !(await d.specialSummon(card, p, await d.askPos(p, card)))) return;
      if ((await d.option(p, 'Reign-Beaux', ['Destroy all opponent monsters', 'Destroy all opponent Spells/Traps'], d.monsters(o).length ? 0 : 1)) === 0) for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
      else for (const c of d.spellTraps(o)) await d.destroy(c, 'effect', undefined, p);
    }, true)],
  },
  'Rescue Cat': {
    effects: [ign(run(async ({ d, p, card }) => {
      await d.move(card, 'gy', { by: p, why: 'cost' });
      for (let i = 0; i < 2; i++) { const c = await ssPick(d, p, d.find(DECK({ kind: 'monster', race: ['Beast'], maxLv: 3 }), p), 'Special Summon a Beast'); if (c) atEndPhase(d, c, (x) => d.destroy(x, 'effect', undefined, p)); }
    }, 600), { label: 'Send to the GY: Special Summon 2 Beasts', cond: (d, c) => c.faceUp && d.find(DECK({ kind: 'monster', race: ['Beast'], maxLv: 3 }), c.ctrl).length > 0 })],
  },
  'Rescueroid': { effects: [trig('anyToGY', run(async ({ link, d }) => { const ev = link.ev; if (ev.e === 'sent' && ev.card.zone === 'gy') await d.toHand(ev.card); }), { optional: true, cond: (_d, c, _p, ev) => ev?.e === 'sent' && ev.why === 'battle' && ev.ctrl === c.ctrl && ev.card.def.name.includes('roid') })] },
  'Reshef the Dark Being': { effects: [ign({ op: 'control', s: { t: 'target' } }, { opt: true, label: 'Discard a Spell: take control of a monster', targets: [{ f: OPP_M }], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'spell' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'spell' } }] })] },
  'Return Zombie': { effects: [trig('standby', { op: 'toHand', s: { t: 'this' } }, { optional: true, from: ['gy'], cost: [{ op: 'payLP', n: 500 }], cond: (d, c) => c.zone === 'gy' && P(d, c.owner).hand.length === 0 })] },
  'Ritual Raven': {},
  'Roc from the Valley of Haze': { effects: [trig('toGY', run(async ({ d, card }) => { await d.move(card, 'deck'); await d.shuffleDeck(card.owner); }), { from: ['gy'], cond: (_d, c) => c.mark.from === 'hand' })] },
  'Rocket Jumper': { ruleIf: { direct: (d, c) => { const o = d.fieldCards(opp(c.ctrl)); return o.length > 0 && o.every((x) => x.zone === 'mzone' && x.pos === 'def'); } } },
  'Roulette Barrel': {
    effects: [ign(run(async ({ d, p }) => {
      const a = (await d.die()), b = (await d.die());
      const n = [a, b][await d.option(p, 'Select a result', [`${a}`, `${b}`], d.monsters(opp(p)).some((m) => m.faceUp && d.lvOf(m) === b) ? 1 : 0)];
      const c = await pick(d, p, `Destroy a Level ${n} monster`, both(d).filter((m) => m.faceUp && d.lvOf(m) === n), 'bad');
      if (c) await d.destroy(c, 'effect', undefined, p);
    }, 300), { opt: true, label: 'Roll 2 dice', cond: (d) => d.phase === 'M1' || d.phase === 'M2' })],
  },
  'Royal Firestorm Guards': { effects: [trig('normalSummoned', [{ op: 'toDeck', s: { t: 'target' } }, { op: 'draw', who: 'self', n: 2 }], { targets: [{ f: { ...GY_M('self'), race: ['Pyro'] }, n: 4, good: true }] })] },
  'Royal Keeper': { effects: [setSelf, flip({ op: 'stat', s: { t: 'this' }, atk: 300, def: 300 })] },
  'Royal Knight': { effects: [victimGY((d, p, o) => d.heal(p, o.def.def ?? 0))] },
  'Royal Magical Library': merge(spellCounterGain(3), { effects: [ign([run(({ d, card }) => { removeCtr(d, card, 3); }), { op: 'draw', who: 'self', n: 1 }], { label: 'Remove 3 Spell Counters: draw 1', cond: (_d, c) => ctr(c) >= 3 })] }),
  'Ruin, Queen of Oblivion': { postBattle: (d, self, _o, r) => { if (won(self, r) && r.att === self && self.data.again !== d.turn) { self.data.again = d.turn; self.data.extraAtk = d.turn; } } },
  'Ryko, Lightsworn Hunter': { effects: [flip([{ op: 'destroy', s: { t: 'target' } }, { op: 'mill', who: 'self', n: 3 }], { targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }] })] },
  'Ryu Kokki': battleKill((d, o) => ['Warrior', 'Spellcaster'].includes(d.raceOf(o) ?? '')),
  'Ryu Senshi': {
    onTargeted: async (d, self, link) => { if (link.isCard && link.card.def.kind === 'spell') { link.negated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
    effects: [quick({ op: 'negate', effectOnly: true }, { label: 'Pay 1000 LP: negate a Normal Trap', cost: [{ op: 'payLP', n: 1000 }], when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.isCard && ev.link.card.def.kind === 'trap' && ev.link.card.def.stype === 'normal', ai: 800 })],
  },
  'Ryu-Kishin Clown': { effects: [trig('summoned', { op: 'pos', s: { t: 'target' }, to: 'swap' }, { targets: [{ f: FU }] })] },
  'Saber Beetle': { rules: ['pierce'] },
  'Sacred Crane': { effects: [trig('specialSummoned', { op: 'draw', who: 'self', n: 1 })] },
  'Sacred Phoenix of Nephthys': {
    effects: [trig('destroyed', run(({ d, card }) => {
      const p = card.owner, mv = card.mv;
      d.schedule({ at: 'SP', side: p, fn: async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card) && (await d.specialSummon(card, p, await d.askPos(p, card)))) for (const c of [...d.spellTraps(0), ...d.spellTraps(1)]) await d.destroy(c, 'effect', undefined, p); } });
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.destroyedHow === 'effect' })],
  },
  'Sage of Silence': { effects: [trig('destroysByBattle', run(({ d, o }) => d.addTemp({ until: d.turn + 1, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind === 'spell' } })))] },
  'Sage of Stillness': { effects: [trig('destroysByBattle', run(({ d, o }) => d.addTemp({ until: d.turn + 1, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind === 'trap' } })))] },
  'Samsara Kaiser': { effects: [trig('toGY', { op: 'toHand', s: { t: 'this' } }, { from: ['gy'], cond: (_d, c) => c.mark.lastWhy === 'tribute' })] },
  'Samsara Lotus': {
    effects: [
      trig('standby', run(({ d, card }) => d.damage(card.ctrl, 1000, card)), { cond: (_d, c) => c.zone === 'mzone' && c.faceUp }),
    ],
  },
  'Sand Gambler': {
    effects: [ign(run(async ({ d, p, o }) => {
      const r = await d.tossCoins(3);
      if (r.every(Boolean)) for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
      else if (r.every((x) => !x)) for (const c of d.monsters(p)) await d.destroy(c, 'effect', undefined, p);
    }, 200), { opt: true, label: 'Toss 3 coins', cond: (d) => d.phase === 'M1' || d.phase === 'M2' })],
  },
  'Sand Moth': {
    effects: [trig('destroyed', run(async ({ d, card }) => { if (card.zone === 'gy' && d.canSpecial(card.owner, card) && (await d.specialSummon(card, card.owner, await d.askPos(card.owner, card)))) card.data.swapUntil = 1e9; }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.lastFaceUp === false && c.mark.lastPos === 'def' && c.mark.destroyedHow === 'effect' })],
  },
  'Sanwitch': {},
  'Sasuke Samurai': { preBattle: destroyDown() },
  'Sasuke Samurai #2': { effects: [ign(run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (_d, _s, _p, c) => c.def.kind !== 'monster' } }), 300), { opt: true, label: 'Pay 800 LP: no Spells/Traps this turn', cost: [{ op: 'payLP', n: 800 }], cond: (d) => d.phase === 'M1' || d.phase === 'M2' })] },
  'Sasuke Samurai #3': { effects: [trig('battleDamage', run(({ d, o }) => d.draw(o, Math.max(0, 7 - P(d, o).hand.length))), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] },
  'Sasuke Samurai #4': { preBattle: async (d, self, other) => { if (!other || other.ctrl === self.ctrl || !(await d.call(self.ctrl))) return false; await d.destroy(other, 'effect', undefined, self.ctrl); return true; } },
  'Satellite Cannon': {
    lock: { indestructible: (d, src, c, by) => { if (!src || c !== src || by !== 'battle' || !d.battle) return false; const o = d.battle.att === src ? d.battle.tgt : d.battle.att; return !!o && d.lvOf(o) <= 7; } },
    effects: [trig('endPhase', { op: 'stat', s: { t: 'this' }, atk: 1000, perm: true }, { cond: (d, c) => d.tp === c.ctrl })],
    postBattle: (d, self, _o, r) => { if (r.att === self && self.zone === 'mzone') self.mods = self.mods.filter((m) => m.turn !== -1); },
  },
  'Saurobeast Brachion': {
    tributes: () => 1, tribFilter: (_d, t) => t.def.race === 'Dinosaur',
    effects: [setSelf, trig('flipSummoned', run(async ({ d, card }) => { for (const c of both(d).filter((x) => x !== card && x.faceUp)) { c.pos = 'def'; await d.setFaceDown(c); } }), { optional: true })],
    battleDmg: (d, self, other, n, to) => (other && d.battle?.tgt === self && to === other.ctrl ? n * 2 : n),
  },
  'Scarr, Scout of Dark World': { effects: [trig('battleDestroyed', search({ kind: 'monster', set: 'Dark World', maxLv: 4 }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Sea Koala': { effects: [ign(run(({ d, t }) => { const c = t[0]; if (c) d.addMod(c, -d.atk(c), 0); }, 600), { opt: true, label: "Reduce a monster's ATK to 0", targets: [{ f: OPP_FU }], cond: (d, c) => d.find({ ...OWN_FU, race: ['Beast'], notThis: true }, c.ctrl, c).length > 0 })] },
  'Searchlightman': { effects: [flip(run(({ d, o }) => d.addTemp({ until: d.turn, lock: { set: (_d, _s, q) => q === o } }), 200))] },
  'Second Goblin': union({ name: 'Giant Orc' }),
  'Seismic Crasher': {
    effects: [ign({ op: 'damage', who: 'opp', n: 500 }, {
      label: 'Send a Continuous card: 500 damage', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, stype: 'continuous' } } }],
      cond: (d, c) => (c.data.crash?.turn === d.turn ? c.data.crash.n : 0) < 2, req: [{ f: { side: 'self', zone: 'szone', faceUp: true, stype: 'continuous' } }],
    })],
    onResolve: (d, src, link) => { if (link.card === src) src.data.crash = { turn: d.turn, n: (src.data.crash?.turn === d.turn ? src.data.crash.n : 0) + 1 }; },
  },
  'Serpentine Princess': { onMove: async (d, src, c, from, to) => { if (c === src && from === 'mzone' && to === 'deck') { await ssPick(d, c.owner, d.find(DECK({ kind: 'monster', maxLv: 3 }), c.owner), 'Special Summon a Level 3 or lower monster'); await d.shuffleDeck(c.owner); } } },
};

// Samsara Lotus: in your End Phase, if you control no Spells/Traps, you can Special Summon it from the Graveyard.
MONSTERS_10['Samsara Lotus'].effects!.push(trig('toGY', run(({ d, card }) => {
  const p = card.owner, mv = card.mv;
  const again = (): void => d.schedule({ at: 'EP', side: p, fn: async () => {
    if (card.mv !== mv || card.zone !== 'gy') return;
    if (d.spellTraps(p).length === 0 && d.canSpecial(p, card) && (await d.confirm(p, 'Special Summon Samsara Lotus?', card))) await d.specialSummon(card, p, 'atk');
    else again();
  } });
  again();
}), { from: ['gy'] }));
// Protector of the Sanctuary: the opponent cannot draw except in the Draw Phase.
MONSTERS_10['Protector of the Sanctuary'] = { lock: { activate: (_d, src, p, c) => !!src && p !== src.ctrl && !!c.def.effects?.some((e) => e.ops.some((o) => o.op === 'draw' && o.who !== 'opp')) } };
void crystalInST; void attackOf; void addCtr; void isAttackOn; void threat; void banishProc; void destroyAll; void has; void OWN_M; void ST; void M;
