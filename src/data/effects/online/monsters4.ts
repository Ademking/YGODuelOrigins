// YGO Online monsters, part 4 (Dark Master - Zorc … Electric Virus).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, banishVictims, both, ctr, declareAttr, destroyAll, flip, has, ign, isAttackOn, lvUp, markKill,
  merge, opp, pick, pickSeen, quick, randomOf, removeCtr, run, search, spellCounterGain, ssFrom, ssPick, threat, tokenDef, tokens, trig,
  union, won, atEndPhase, castCopy,
} from './olib';

const onDmg = (fn: Parameters<typeof run>[0], optional = true) => trig('battleDamage', run(fn), { optional, cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl });
const nextStandby = (d: Duel, p: Side, fn: () => Promise<unknown> | unknown) => d.schedule({ at: 'SP', side: p, turn: undefined, fn });
const archfiendDie = (hits: number[], pred: (d: Duel, self: Card, t: Card) => boolean): Def['onTargeted'] => async (d, self, link) => {
  if (link.p === self.ctrl) return;
  const t = link.targets.flat().find((c) => pred(d, self, c));
  if (!t) return;
  const card = link.card;
  const n = (await d.die());
  if (hits.includes(n)) { link.negated = true; if (link.isCard && d.onField(card)) await d.destroy(card, 'effect', undefined, self.ctrl); }
};
const dd = (d: Duel, s: Side) => d.players[s];
const destroyNoCalc = (pred: (d: Duel, self: Card, t: Card) => boolean): Def['preBattle'] => async (d, self, other) => {
  if (d.battle?.att !== self || !other || !pred(d, self, other)) return false;
  if (!other.faceUp) { other.faceUp = true; await d.emit({ t: 'flip', card: other }); }
  if (!pred(d, self, other)) return false;
  await d.destroy(other, 'effect', undefined, self.ctrl);
  return true;
};

export const MONSTERS_4: Record<string, Def> = {
  'Dark Master - Zorc': {
    effects: [ign(run(async ({ d, p, o }) => {
      const n = (await d.die());
      if (n <= 2) for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
      else if (n <= 5) { const c = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }
      else for (const c of d.monsters(p)) await d.destroy(c, 'effect', undefined, p);
    }, (d, me) => (d.monsters(opp(me)).length ? 800 : -1)), { opt: true, label: 'Roll a die' })],
  },
  'Dark Mimic LV1': { effects: [flip({ op: 'draw', who: 'self', n: 1 }), lvUp('Dark Mimic LV3', 'standby')] },
  'Dark Mimic LV3': { effects: [trig('battleDestroyed', run(({ d, card }) => d.draw(card.owner, card.last.ssBy === 'Dark Mimic LV1' ? 2 : 1)), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Dark Nephthys': {
    effects: [ign(run(async ({ d, p, card }) => {
      for (const c of await d.select(p, 'Banish 2 DARK monsters', d.find({ ...GY_M('self'), attr: 'DARK' }, p), 2, 2, 'cost')) await d.banish(c, p);
      await d.move(card, 'gy', { by: p, why: 'effect' });
      const mv = card.mv;
      nextStandby(d, p, async () => { if (card.mv === mv && card.zone === 'gy' && d.canSpecial(p, card)) { card.properly = true; await d.specialSummon(card, p, await d.askPos(p, card)); } });
    }, 600), { from: ['hand'], label: 'Banish 2 DARK monsters: send to the Graveyard', req: [{ f: { ...GY_M('self'), attr: 'DARK' }, n: 3 }] }),
    trig('specialSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: ST }] })],
  },
  'Dark Paladin': {
    noNormal: true,
    statFn: (d) => ({ atk: 500 * [...both(d).filter((c) => c.faceUp), ...dd(d, 0).gy, ...dd(d, 1).gy].filter((c) => c.def.kind === 'monster' && (c.zone === 'mzone' ? d.raceOf(c) : c.def.race) === 'Dragon').length }),
    effects: [quick({ op: 'negate' }, { label: 'Discard: negate a Spell', cost: [{ op: 'discard', who: 'self', n: 1 }], on: ['activateSpell'], ai: 700 })],
  },
  'Dark Red Enchanter': merge(spellCounterGain(), {
    statFn: (_d, c) => ({ atk: 300 * ctr(c) }),
    effects: [
      trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, 2); })),
      ign(run(async ({ d, p, o, card }) => { removeCtr(d, card, 2); const c = randomOf(d, dd(d, o).hand); if (c) await d.discard(o, [c], p); }, 500), { opt: true, label: 'Remove 2 Spell Counters: random discard', cond: (d, c) => ctr(c) >= 2 && dd(d, opp(c.ctrl)).hand.length > 0 }),
    ],
  }),
  'Dark Ruler Ha Des': {
    afterBattle: (d, src, r) => {
      for (const [m, o, k] of [[r.att, r.tgt, r.killedT], [r.tgt, r.att, r.killedA]] as [Card | null, Card | null, boolean][]) {
        if (m && o && k && m.ctrl === src.ctrl && d.raceOf(m) === 'Fiend' && o.def.mtype === 'effect') { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); }
      }
    },
  },
  'Dark Scorpion - Chick the Yellow': {
    effects: [onDmg(async ({ d, p, o }) => {
      if ((await d.option(p, 'Chick the Yellow', ['Return 1 card to the hand', 'Look at the top card of the opponent\'s Deck'])) === 0) {
        const c = await pick(d, p, 'Return a card to the hand', [...d.fieldCards(0), ...d.fieldCards(1)], 'bad');
        if (c) await d.toHand(c);
      } else {
        const deck = dd(d, o).deck;
        const top = deck[deck.length - 1];
        if (!top) return;
        await d.reveal(p, [top], 'Top card');
        if (await d.option(p, 'Put it on', ['Top', 'Bottom'], 1)) { deck.pop(); deck.unshift(top); }
      }
    })],
  },
  'Dark Scorpion - Gorg the Strong': {
    effects: [onDmg(async ({ d, p, o }) => {
      if (d.monsters(o).length && (await d.option(p, 'Gorg the Strong', ['Return a monster to the top of the Deck', 'Mill 1 card'])) === 0) {
        const c = await pick(d, p, 'Return a monster to the top of the Deck', d.monsters(o), 'bad');
        if (c) await d.move(c, 'deck');
      } else await d.mill(o, 1, p);
    })],
  },
  'Dark Scorpion - Meanae the Thorn': {
    effects: [onDmg(async ({ d, p }) => {
      const f = (c: Card) => c.def.name.includes('Dark Scorpion') || c.def.name === 'Cliff the Trap Remover';
      const fromGY = dd(d, p).gy.some(f) && (!dd(d, p).deck.some(f) || (await d.option(p, 'Meanae the Thorn', ['From the Deck', 'From the Graveyard'])) === 1);
      const c = await pick(d, p, 'Add a Dark Scorpion card', (fromGY ? dd(d, p).gy : dd(d, p).deck).filter(f), 'good');
      if (c) { await d.toHand(c); if (!fromGY) await d.shuffleDeck(p); }
    })],
  },
  'Dark Scorpion Burglars': { effects: [onDmg(async ({ d, p, o }) => { const c = await pick(d, o, 'Send a Spell Card from your Deck to the Graveyard', d.find(DECK({ kind: 'spell' }), o), 'cost'); if (c) { await d.move(c, 'gy', { by: p }); await d.shuffleDeck(o); } }, false)] },
  'Dark Simorgh': {
    attrFn: (_d, src, c) => (c === src ? 'WIND' : undefined),
    ssProc: {
      from: ['hand', 'gy'],
      cond: (d, p, c) => { const pool = c.zone === 'gy' ? dd(d, p).hand : dd(d, p).gy; return pool.some((x) => x.def.kind === 'monster' && x.def.attr === 'WIND' && x !== c) && pool.some((x) => x.def.kind === 'monster' && x.def.attr === 'DARK' && x !== c); },
      cost: [run(async ({ d, p, card }) => {
        const pool = () => (card.zone === 'gy' ? dd(d, p).hand : dd(d, p).gy).filter((x) => x !== card && x.def.kind === 'monster');
        for (const a of ['WIND', 'DARK']) { const x = await pick(d, p, `Banish a ${a} monster`, pool().filter((y) => y.def.attr === a), 'cost'); if (x) await d.banish(x, p); }
      })],
    },
    lock: { set: (_d, src, p) => !!src && p !== src.ctrl },
  },
  'Dark Valkyria': {
    statFn: (_d, c) => ({ atk: 300 * ctr(c) }),
    effects: [
      ign(run(({ d, card }) => { addCtr(d, card, 1); }, 300), { label: 'Place a Spell Counter', once: true }),
      ign([run(({ d, card }) => { removeCtr(d, card, 1); }), { op: 'destroy', s: { t: 'target' } }], { label: 'Remove a Spell Counter: destroy a monster', targets: [{ f: M }], cond: (_d, c) => ctr(c) > 0 }),
    ],
  },
  'Darkbishop Archfiend': {
    upkeep: 500,
    effects: [quick(run(async ({ d, p, link }) => {
      const ev = link.ev;
      if (ev.e !== 'chain' || ![1, 3, 6].includes((await d.die()))) return;
      ev.link.negated = true;
      if (ev.link.isCard && d.onField(ev.link.card)) await d.destroy(ev.link.card, 'effect', undefined, p);
    }, 400), { label: 'Roll a die to protect an Archfiend', when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.targets.flat().some((c) => c.zone === 'mzone' && c.ctrl === p && c.def.name.includes('Archfiend')) })],
  },
  'Darkblaze Dragon': {
    statFn: (d, c) => (c.data.from === 'gy' && c.data.how === 'special' ? { atk: d.base(c, 'atk'), def: d.base(c, 'def') } : undefined),
    effects: [trig('destroysByBattle', run(({ d, o, link }) => { const x = link.trig?.other; if (x && x.zone === 'gy') return d.damage(o, x.def.atk ?? 0); }))],
  },
  'Darklord Zerato': {
    tributes: (d, p) => (new Set(dd(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.attr === 'DARK').map((c) => c.def.name)).size >= 4 ? 1 : 2),
    effects: [ign(run(async ({ d, p, o, card }) => { for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p); atEndPhase(d, card, (x) => d.destroy(x, 'effect', undefined, p)); }, (d, me) => d.monsters(opp(me)).reduce((s, c) => s + (c.def.atk ?? 0), 0) - 2800), {
      label: 'Send a DARK monster: destroy all opponent monsters', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'DARK' } }],
    })],
  },
  'Darknight Parshath': {
    statFn: (d, c) => ({ atk: 100 * dd(d, c.ctrl).gy.filter((x) => x.def.kind === 'monster' && x.def.attr === 'DARK').length }),
    effects: [trig('destroysByBattle', [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK' } } }, { op: 'draw', who: 'self', n: 1 }], { optional: true, cond: (d, c) => d.find({ ...GY_M('self'), attr: 'DARK' }, c.ctrl).length > 0 })],
  },
  'Dawnbreak Gardna': { statFn: (d, c) => ({ def: 2300 - d.base(c, 'def') }) },
  'Decayed Commander': {
    effects: [
      trig('normalSummoned', ssFrom(['hand'], { name: 'Zombie Tiger' }), { optional: true }),
      trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, dd(d, o).hand); if (c) await d.discard(o, [c], p); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl }),
    ],
  },
  'Decoy Dragon': {
    effects: [trig('attacked', run(async ({ d, p, card, link }) => {
      const c = await ssPick(d, p, d.find({ ...GY_M('self'), race: ['Dragon'], minLv: 7 }, p), 'Special Summon a Level 7+ Dragon', undefined, false, card);
      const ev = attackOf(link.ev);
      if (c && ev) { ev.target = c; d.log(`The attack target becomes ${c.def.name}.`); }
    }), { cond: (d, c) => d.find({ ...GY_M('self'), race: ['Dragon'], minLv: 7 }, c.ctrl).length > 0 })],
  },
  'Decoyroid': { lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.faceUp && t !== src && t.ctrl === src.ctrl } },
  'Deep Diver': {
    effects: [trig('battleDestroyed', run(({ d, card }) => {
      const p = card.owner;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => {
        const c = await pick(d, p, 'Place a monster on top of your Deck', dd(d, p).deck.filter((x) => x.def.kind === 'monster'), 'good');
        if (!c) return;
        await d.shuffleDeck(p);
        const deck = dd(d, p).deck; deck.splice(deck.indexOf(c), 1); deck.push(c);
      } });
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Deepsea Macrotrema': { effects: [trig('fieldToGY', run(({ d, card }) => { for (const c of d.find({ ...OWN_FU, attr: 'WATER' }, card.owner)) d.addMod(c, 500, 0); }), { from: ['gy'] })] },
  'Dekoichi the Battlechanted Locomotive': { effects: [flip(run(({ d, p }) => d.draw(p, 1 + d.find({ ...OWN_FU, name: 'Bokoichi the Freightening Car' }, p).length), 600))] },
  'Demise, King of Armageddon': { effects: [ign(destroyAll({ side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true }), { label: 'Pay 2000 LP: destroy all other cards', cost: [{ op: 'payLP', n: 2000 }], ai: (d, me) => d.fieldCards(opp(me)).length * 700 - (d.fieldCards(me).length - 1) * 700 - 1000 })] },
  'Des Dendle': merge(union({ name: 'Vampire Orchis' }), {
    effects: [trig('anyToGY', run(({ d, p }) => tokens(d, p, tokenDef('Wicked Plant Token', 'Plant', 'EARTH', 1, 800, 800), 1, 'atk')), {
      cond: (d, c, _p, ev) => c.zone === 'szone' && ev?.e === 'sent' && ev.why === 'battle' && ev.ctrl !== c.ctrl && !!d.battle && [d.battle.att, d.battle.tgt].includes(d.equippedTo(c) ?? null),
    })],
  }),
  'Des Feral Imp': { effects: [flip(run(async ({ d, p }) => { const c = await pick(d, p, 'Shuffle a card from your Graveyard into the Deck', dd(d, p).gy, 'good'); if (c) { await d.move(c, 'deck'); await d.shuffleDeck(p); } }, 300))] },
  'Des Frog': {
    effects: [trig('normalSummoned', run(async ({ d, p }) => {
      const n = dd(d, p).gy.filter((c) => c.def.name === 'T.A.D.P.O.L.E.').length;
      for (let i = 0; i < n; i++) if (!(await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Des Frog' }, p), 'Special Summon a Des Frog'))) break;
      await d.shuffleDeck(p);
    }), { optional: true, cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })],
  },
  'Des Kangaroo': { postBattle: async (d, self, o, r) => { if (o && r.tgt === self && self.pos === 'def' && d.atk(o) < d.defv(self) && o.zone === 'mzone') await d.destroy(o, 'effect', undefined, self.ctrl); } },
  'Des Koala': { effects: [flip(run(({ d, o }) => d.damage(o, 400 * dd(d, o).hand.length), 600))] },
  'Des Lacooda': {
    effects: [
      ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (_d, c) => c.faceUp }),
      trig('flipSummoned', { op: 'draw', who: 'self', n: 1 }),
    ],
  },
  'Des Mosquito': {
    statFn: (_d, c) => ({ atk: 500 * ctr(c, 'mosquito') }),
    effects: [trig(['normalSummoned', 'specialSummoned'], run(({ d, card }) => { addCtr(d, card, 2, 'mosquito'); }))],
    lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'battle' && removeCtr(d, src, 1, 'mosquito') > 0 },
  },
  'Des Volstgalph': {
    effects: [trig('destroysByBattle', { op: 'damage', who: 'opp', n: 500 }, { cond: (_d, _c) => true })],
    onResolve: (d, src, link) => { if (link.isCard && link.card.def.kind === 'spell' && (link.card.def.stype === 'normal' || link.card.def.stype === 'quick')) d.addMod(src, 200, 0); },
  },
  'Des Wombat': { lock: { noDamage: (_d, src, s, battle) => !!src && s === src.ctrl && !battle } },
  'Desert Twister': {
    noNormal: true,
    ssProc: {
      cond: (d, p) => d.find({ ...GY_M('self'), attr: 'EARTH' }, p).length > 0 && d.find({ ...GY_M('self'), attr: 'WIND' }, p).length >= 2,
      cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'EARTH' } } }, { op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'WIND' }, n: 2 } }],
    },
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Discard: destroy a Spell/Trap', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: ST }] })],
  },
  'Desertapir': { effects: [flip(run(async ({ d, t }) => { const c = t[0]; if (c && c.faceUp) { c.pos = 'def'; await d.setFaceDown(c); } }, 400), { targets: [{ f: { ...FU, notThis: true } }] })] },
  'Despair from the Dark': {
    effects: [trig('toGY', run(async ({ d, card }) => { if (card.zone === 'gy' && d.canSpecial(card.owner, card)) await d.specialSummon(card, card.owner, await d.askPos(card.owner, card)); }), {
      from: ['gy'], cond: (_d, c) => (c.mark.from === 'hand' || c.mark.from === 'deck') && c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner,
    })],
  },
  'Desrook Archfiend': {
    upkeep: 500,
    onTargeted: archfiendDie([3], (_d, self, t) => t === self),
    effects: [trig('anyToGY', run(async ({ d, p, card, link }) => {
      const ev = link.ev;
      if (ev.e !== 'sent') return;
      await d.move(card, 'gy', { by: p, why: 'cost' });
      if (ev.card.zone === 'gy' && d.canSpecial(p, ev.card)) await d.specialSummon(ev.card, p, await d.askPos(p, ev.card));
    }), { optional: true, from: ['hand'], cond: (d, c, _p, ev) => c.zone === 'hand' && ev?.e === 'sent' && ev.card.def.name === 'Terrorking Archfiend' && ev.ctrl === c.owner && ev.from === 'mzone' && ev.card.mark.destroyedTurn === d.turn })],
  },
  'Destiny End Dragoon': {
    effects: [
      ign(run(async ({ d, p, o, t }) => { const c = t[0]; if (c) { const a = d.atk(c); if (await d.destroy(c, 'effect', undefined, p)) await d.damage(o, a); } d.addTemp({ until: d.turn, tag: 'noBP', p }); }, (d, me) => (d.phase === 'M1' ? Math.max(-1, ...d.find(OPP_FU, me).map((c) => d.atk(c))) : -1)), { opt: true, label: 'Destroy a monster and inflict its ATK', targets: [{ f: OPP_M }], cond: (d) => d.phase === 'M1' }),
      trig('standby', run(async ({ d, p, card }) => { if (card.zone === 'gy' && d.canSpecial(p, card)) { card.properly = true; await d.specialSummon(card, p, await d.askPos(p, card)); } }), {
        optional: true, from: ['gy'], cost: [{ op: 'banish', s: { t: 'choose', f: { side: 'self', zone: 'gy', set: 'Destiny Hero' } } }], cond: (d, c) => c.zone === 'gy' && d.find({ side: 'self', zone: 'gy', set: 'Destiny Hero' }, c.owner).length > 0,
      }),
    ],
  },
  'Destiny Hero - Blade Master': {
    effects: [quick(run(({ d, p }) => { for (const c of d.find({ ...OWN_FU, set: 'Destiny Hero' }, p)) d.addMod(c, 800, 0); }, (d, me, _c, ev) => threat(d, me, ev)), {
      from: ['hand'], label: 'Discard: Destiny Heroes gain 800 ATK', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], cond: (d, _c, p) => d.phase === 'BP' && d.tp !== p,
    })],
  },
  'Destiny Hero - Captain Tenacious': {
    effects: [trig('anyToGY', run(({ d, p, link }) => {
      const ev = link.ev;
      if (ev.e !== 'sent') return;
      const c = ev.card, mv = c.mv;
      nextStandby(d, p, async () => { if (c.mv === mv && c.zone === 'gy' && d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c)); });
    }), { optional: true, opt: true, cond: (_d, card, _p, ev) => ev?.e === 'sent' && ev.why === 'battle' && ev.ctrl === card.ctrl && ev.card !== card && ev.card.def.name.includes('Destiny Hero') })],
  },
  'Destiny Hero - Dasher': {
    effects: [
      ign({ op: 'stat', s: { t: 'this' }, atk: 1000 }, { opt: true, label: 'Tribute a monster: +1000 ATK', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, notThis: true } } }] }),
      trig('anyDraw', run(async ({ d, p, card }) => {
        const c = dd(d, p).hand[dd(d, p).hand.length - 1];
        if (!c || c.def.kind !== 'monster' || !d.canSpecial(p, c)) return;
        card.mark.dasherUsed = true;
        await d.reveal(opp(p), [c], 'Destiny Hero - Dasher');
        await d.specialSummon(c, p, await d.askPos(p, c));
      }), { optional: true, from: ['gy'], cond: (d, c, _p, ev) => c.zone === 'gy' && !c.mark.dasherUsed && ev?.e === 'draw' && ev.dp && ev.player === c.owner && d.phase === 'DP' && dd(d, c.owner).hand[dd(d, c.owner).hand.length - 1]?.def.kind === 'monster' }),
    ],
    postBattle: (d, self, _o, r) => { if (r.att === self) d.schedule({ at: 'BPend', turn: d.turn, fn: () => (self.zone === 'mzone' ? d.changePos(self, 'def') : undefined) }); },
  },
  'Destiny Hero - Defender': { effects: [trig('oppStandby', { op: 'draw', who: 'opp', n: 1 }, { cond: (_d, c) => c.faceUp && c.pos === 'def' })] },
  'Destiny Hero - Departed': {
    effects: [
      trig('standby', run(async ({ d, o, card }) => { if (card.zone === 'gy' && d.canSpecial(o, card)) await d.specialSummon(card, o, 'atk'); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
      trig('battleDestroyed', { op: 'banish', s: { t: 'this' } }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
    ],
  },
  'Destiny Hero - Diamond Dude': {
    effects: [ign(run(async ({ d, p, card }) => {
      const top = dd(d, p).deck[dd(d, p).deck.length - 1];
      if (!top) return;
      await d.reveal(p, [top], 'Diamond Dude revealed the top card');
      await d.reveal(opp(p), [top], 'Diamond Dude revealed the top card');
      if (top.def.kind === 'spell' && top.def.stype === 'normal') {
        await d.move(top, 'gy', { by: p });
        card.data.diamond = { uid: top.uid, mv: top.mv, turn: d.turn };
      } else await d.move(top, 'deck', { bottom: true });
    }, 400), { opt: true, label: 'Reveal the top card of your Deck' }),
    ign(run(async ({ d, p, card }) => {
      const info = card.data.diamond;
      const sp = info ? d.byUid(info.uid) : undefined;
      card.data.diamond = undefined;
      if (sp && sp.zone === 'gy' && sp.mv === info.mv) await castCopy(d, p, sp, card);
    }, 500), { label: 'Use the Spell sent last turn', cond: (d, c) => !!c.data.diamond && c.data.diamond.turn < d.turn && (d.phase === 'M1' || d.phase === 'M2') })],
  },
  'Destiny Hero - Disk Commander': { effects: [trig('specialSummoned', { op: 'draw', who: 'self', n: 2 }, { cond: (_d, c) => c.data.from === 'gy' })] },
  'Destiny Hero - Dogma': {
    noNormal: true,
    ssProc: {
      cond: (d, p) => d.monsters(p).length >= 3 && d.monsters(p).some((c) => c.def.name.includes('Destiny Hero')),
      cost: [run(async ({ d, p }) => {
        const cs = await d.select(p, 'Tribute 3 monsters, including a Destiny Hero', d.monsters(p).filter((c) => d.tributeOk(c)), 3, 3, 'cost', (x) => x.length === 3 && x.some((c) => c.def.name.includes('Destiny Hero')));
        for (const c of cs) await d.move(c, 'gy', { why: 'tribute' });
      })],
    },
    effects: [trig('specialSummoned', run(({ d, p, o }) => { d.schedule({ at: 'SP', side: o, fn: () => d.changeLP(o, -Math.floor(dd(d, o).lp / 2)) }); void p; }))],
  },
  'Destiny Hero - Doom Lord': {
    effects: [ign(run(async ({ d, p, card, t }) => {
      const c = t[0];
      if (!c) return;
      card.noAttackTurn = d.turn;
      d.players[p].noAttackTurn = d.turn;
      const owner = c.ctrl, pos = c.pos;
      await d.banish(c, p);
      const mv = c.mv;
      d.schedule({ at: 'SP', turn: d.turn + (d.tp === p ? 4 : 3), fn: async () => { if (c.mv === mv && c.zone === 'banished' && d.canSpecial(owner, c)) { c.properly = true; await d.specialSummon(c, owner, pos); } } });
    }, 700), { opt: true, label: 'Banish a monster', targets: [{ f: OPP_M }], cond: (_d, c) => c.pos === 'atk' })],
  },
  'Destiny Hero - Double Dude': {
    noSpecial: true, rules: ['doubleAttack'],
    effects: [trig('destroyed', run(({ d, card }) => { const p = card.owner; nextStandby(d, p, () => tokens(d, p, tokenDef('Double Dude Token', 'Warrior', 'DARK', 4, 1000, 1000), 2, 'atk')); }), { optional: true, from: ['gy'] })],
  },
  'Destiny Hero - Dread Servant': {
    effects: [
      trig('normalSummoned', run(({ d }) => { for (const c of [...d.spellTraps(0), ...d.spellTraps(1)]) if (c.faceUp && c.def.name === 'Clock Tower Prison') addCtr(d, c, 1, 'clock'); })),
      trig('battleDestroyed', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy one of your Spell/Trap Cards', d.spellTraps(p), 'cost'); if (c) await d.destroy(c, 'effect', undefined, p); }), { optional: true, from: ['gy'], cond: (d, c) => d.spellTraps(c.owner).length > 0 }),
    ],
  },
  'Destiny Hero - Dreadmaster': {
    statFn: (d, c) => { const n = d.find({ ...OWN_FU, set: 'Destiny Hero', notThis: true }, c.ctrl, c).reduce((s, x) => s + (x.def.atk ?? 0), 0); return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
    effects: [trig('specialSummoned', run(async ({ d, p }) => {
      for (const c of d.monsters(p).filter((x) => !x.def.name.includes('Destiny Hero'))) await d.destroy(c, 'effect', undefined, p);
      for (let i = 0; i < 2; i++) if (!(await ssPick(d, p, d.find({ ...GY_M('self'), set: 'Destiny Hero' }, p), 'Special Summon a Destiny Hero'))) break;
      d.addTemp({ until: d.turn, p, tag: 'noBattleDmg', lock: { indestructible: (_d, _s, x) => x.ctrl === p && x.def.name.includes('Destiny Hero') } });
    }), { cond: (_d, c) => c.data.ssBy === 'Clock Tower Prison' })],
  },
  'Destiny Hero - Dunker': { effects: [ign({ op: 'damage', who: 'opp', n: 500 }, { label: 'Send a Destiny Hero: 500 damage', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', set: 'Destiny Hero' } } }], req: [{ f: { side: 'self', zone: 'hand', set: 'Destiny Hero' } }] })] },
  'Destiny Hero - Fear Monger': {
    effects: [trig('battleDestroyed', run(({ d, card }) => {
      const p = card.owner;
      nextStandby(d, p, () => ssPick(d, p, d.find({ ...GY_M('self'), set: 'Destiny Hero', fn: (_d, c) => c.def.name !== 'Destiny Hero - Fear Monger' }, p), 'Special Summon a Destiny Hero'));
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Destiny Hero - Malicious': { effects: [ign(ssFrom(['deck'], { name: 'Destiny Hero - Malicious' }), { from: ['gy'], label: 'Banish: Special Summon Malicious', cost: [{ op: 'banish', s: { t: 'this' } }], req: [{ f: DECK({ name: 'Destiny Hero - Malicious' }) }] })] },
  'Destiny Hero - Plasma': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M, n: 3 } }], req: [{ f: OWN_M, n: 3 }] },
    negateFn: (_d, src, c) => c.zone === 'mzone' && c.faceUp && c.ctrl !== src.ctrl && c.def.mtype === 'effect',
    statFn: (d, c) => { const e = d.equipsOf(c).find((x) => x.uid === c.data.plasma); return e ? { atk: Math.floor((e.def.atk ?? 0) / 2) } : undefined; },
    effects: [ign(run(async ({ d, p, card, t }) => { const m = t[0]; if (m && m.zone === 'mzone' && (await d.equipCard(m, card, {}, p))) card.data.plasma = m.uid; }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => c.def.atk ?? 0))), {
      opt: true, label: 'Equip an opponent\'s monster', targets: [{ f: OPP_M }], cond: (d, c) => !d.equipsOf(c).some((x) => x.uid === c.data.plasma),
    })],
  },
  'Destroyersaurus': { effects: [ign(search({ name: 'Jurassic World' }), { from: ['hand'], label: 'Discard: add Jurassic World', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: 'Jurassic World' }) }] })] },
  'Destruction Cyclone': { effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of both(d).filter((x) => !x.faceUp || d.attrOf(x) !== 'WIND')) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Diabolos, King of the Abyss': {
    noSpecial: true,
    tribFilter: (d, t) => d.attrOf(t) === 'DARK' || t.def.attr === 'DARK',
    effects: [trig('oppStandby', run(async ({ d, p, o }) => {
      const deck = dd(d, o).deck;
      const top = deck[deck.length - 1];
      if (!top) return;
      await d.reveal(p, [top], 'Top card');
      if (await d.option(p, 'Put it on', ['Top', 'Bottom'], 1)) { deck.pop(); deck.unshift(top); }
    }), { cond: (d, c) => dd(d, opp(c.ctrl)).deck.length > 0 })],
  },
  'Dice Jar': {
    effects: [flip(run(async ({ d, p, o }) => {
      for (let k = 0; k < 10; k++) {
        const a = (await d.die()), b = (await d.die());
        if (a === b) continue;
        const [loser, w] = a < b ? [p, b] : [o, a];
        await d.damage(loser, w === 6 ? 6000 : w * 500);
        return;
      }
    }, 300))],
  },
  'Different Dimension Dragon': {
    lock: { indestructible: (d, src, c, by) => {
      if (!src || c !== src) return false;
      if (by === 'battle') { const o = d.battle && (d.battle.att === src ? d.battle.tgt : d.battle.att); return !!o && d.atk(o) <= 1900; }
      const top = d.chain[d.chain.length - 1];
      return !!top && top.card.def.kind !== 'monster' && !top.targets.flat().includes(src);
    } },
  },
  'Dimension Jar': {
    effects: [flip(run(async ({ d, p, o }) => {
      for (const [s, t] of [[p, o], [o, p]] as [Side, Side][]) for (const c of await d.select(s, 'Banish up to 3 monsters from your opponent\'s Graveyard', dd(d, t).gy.filter((x) => x.def.kind === 'monster'), 0, 3, 'bad')) await d.banish(c, s);
    }, 200))],
  },
  'Dimensional Alchemist': {
    effects: [
      ign(run(async ({ d, p, card }) => { const top = dd(d, p).deck[dd(d, p).deck.length - 1]; if (top) { await d.banish(top, p); d.addMod(card, 500, 0); } }, 300), { opt: true, label: 'Banish the top card: +500 ATK' }),
      trig('destroyed', run(async ({ d, p }) => { const c = await pick(d, p, 'Return a banished monster to your hand', dd(d, p).banished.filter((x) => x.def.kind === 'monster'), 'good'); if (c) await d.toHand(c); }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
    ],
  },
  'Disc Fighter': { preBattle: destroyNoCalc((d, _s, t) => t.pos === 'def' && (t.def.def ?? 0) >= 2000 && d.defv(t) >= 2000) },
  'Disciple of the Forbidden Spell': {
    effects: [trig('summoned', run(async ({ d, p, card }) => {
      const n = dd(d, p).gy.filter((c) => c.def.name === 'Disciple of the Forbidden Spell').length;
      card.data.attrs = [];
      for (let i = 0; i < n; i++) card.data.attrs.push(await declareAttr(d, p, 'Declare an Attribute', d.monsters(opp(p))));
    }))],
    preBattle: destroyNoCalc((d, s, t) => (s.data.attrs ?? []).includes(d.attrOf(t))),
  },
  'Diskblade Rider': { effects: [ign(run(({ d, card }) => { d.addMod(card, 500, 0, d.turn + 1); }, 400), { opt: true, label: 'Banish a Normal Trap: +500 ATK', cost: [{ op: 'banish', s: { t: 'choose', f: { side: 'self', zone: 'gy', kind: 'trap', stype: 'normal' } } }], req: [{ f: { side: 'self', zone: 'gy', kind: 'trap', stype: 'normal' } }] })] },
  'Divine Dragon - Excelion': {
    statFn: (_d, c) => ((c.data.excelion ?? []).includes(0) ? { atk: 1000 } : undefined),
    effects: [
      trig('normalSummoned', run(async ({ d, p, card }) => {
        const n = Math.min(3, dd(d, p).gy.filter((c) => c.def.name === 'Divine Dragon - Excelion').length);
        const opts = ['Gain 1000 ATK', 'Attack again after destroying a monster', 'Burn the destroyed monster\'s ATK'];
        card.data.excelion = [];
        for (let i = 0; i < n; i++) { const left = [0, 1, 2].filter((k) => !card.data.excelion.includes(k)); card.data.excelion.push(left[await d.option(p, 'Divine Dragon - Excelion', left.map((k) => opts[k]))]); }
      }), { cond: (d, c) => dd(d, c.ctrl).gy.some((x) => x.def.name === 'Divine Dragon - Excelion') }),
      trig('destroysByBattle', run(({ d, o, link }) => { const x = link.trig?.other; if (x && x.zone === 'gy') return d.damage(o, x.def.atk ?? 0); }), { cond: (_d, c) => (c.data.excelion ?? []).includes(2) }),
    ],
    postBattle: (d, self, _o, r) => { if ((self.data.excelion ?? []).includes(1) && r.att === self && won(self, r) && self.data.exAgain !== d.turn) { self.data.exAgain = d.turn; self.data.extraAtk = d.turn; } },
  },
  'Divine Knight Ishzark': banishVictims,
  'Doitsu': union({ name: 'Soitsu' }, 2500),
  'Don Turtle': { effects: [trig(['normalSummoned', 'flipSummoned'], run(async ({ d, p }) => { for (const c of await d.select(p, 'Special Summon Don Turtles', dd(d, p).hand.filter((x) => x.def.name === 'Don Turtle'), 0, d.freeCount(p, 'm'), 'good')) await d.specialSummon(c, p, await d.askPos(p, c)); }), { optional: true, cond: (d, c) => dd(d, c.ctrl).hand.some((x) => x.def.name === 'Don Turtle') })] },
  'Don Zaloog': {
    effects: [onDmg(async ({ d, p, o }) => {
      if (dd(d, o).hand.length && (await d.option(p, 'Don Zaloog', ['Discard 1 random card', 'Mill 2 cards'])) === 0) { const c = randomOf(d, dd(d, o).hand); if (c) await d.discard(o, [c], p); }
      else await d.mill(o, 2, p);
    })],
  },
  'Doom Dozer': merge(banishProc(2, { race: ['Insect'] }), { effects: [trig('battleDamage', { op: 'mill', who: 'opp', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] }),
  'Doom Shaman': {
    effects: [
      ign(run(async ({ d, p, card }) => { const c = await ssPick(d, p, d.find({ side: 'any', zone: ['hand', 'gy'], kind: 'monster', race: ['Fiend'] }, p).filter((x) => x.zone === 'gy' || x.owner === p), 'Special Summon a Fiend', undefined, false, card); if (c) card.data.shaman = [...(card.data.shaman ?? []), c.uid]; }, 800), { opt: true, label: 'Special Summon a Fiend' }),
      trig('leftField', run(async ({ d, card }) => { for (const u of card.last.shaman ?? []) { const m = d.byUid(u); if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); } })),
    ],
  },
  'Doomcaliber Knight': {
    noSpecial: true,
    effects: [quick(run(async ({ d, p, link }) => { const ev = link.ev; if (ev.e === 'chain') { ev.link.negated = true; if (d.onField(ev.link.card)) await d.destroy(ev.link.card, 'effect', undefined, p); } }, 600), {
      label: 'Tribute: negate a monster effect', cost: [{ op: 'tribute', s: { t: 'this' } }], when: (_d, ev, _p, card) => ev.e === 'chain' && !ev.link.isCard && ev.link.card.def.kind === 'monster' && ev.link.card !== card,
    })],
  },
  'Doomsday Horror': {
    statFn: (d, c) => { const n = 300 * [...dd(d, 0).banished, ...dd(d, 1).banished].filter((x) => x.def.kind === 'monster' && x.def.attr === 'DARK').length; return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
    effects: [trig('destroyed', run(async ({ d }) => { for (const c of [...dd(d, 0).banished, ...dd(d, 1).banished].filter((x) => x.def.kind === 'monster' && x.def.attr === 'DARK')) await d.move(c, 'gy'); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Double Coston': { doubleTribute: (_d, t) => t.def.attr === 'DARK' },
  'Dragon Ice': {
    effects: [quick(run(async ({ d, p, card }) => { if ((card.zone === 'hand' || card.zone === 'gy') && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }, 900), {
      from: ['hand', 'gy'], label: 'Discard: Special Summon this card', cost: [run(async ({ d, p, card }) => { const c = await pick(d, p, 'Discard 1 card', dd(d, p).hand.filter((x) => x !== card), 'cost'); if (c) await d.discard(p, [c], null); }, 0, (d, p, card) => dd(d, p).hand.some((x) => x !== card))],
      when: (d, ev, p) => ev.e === 'summon' && ev.player !== p && ev.how !== 'normal' && ev.how !== 'flip' && !both(d).some((c) => c.faceUp && c.def.name === 'Dragon Ice'),
    })],
  },
  'Dragon Manipulator': { effects: [flip({ op: 'control', s: { t: 'target' } }, { targets: [{ f: { ...OPP_FU, race: ['Dragon'] } }] })] },
  'Dragon Master Knight': { noNormal: true, statFn: (d, c) => ({ atk: 500 * d.find({ ...OWN_FU, race: ['Dragon'], notThis: true }, c.ctrl, c).length }) },
  'Dragonic Knight': {
    effects: [quick(run(async ({ d, p, card, link }) => {
      const ev = link.ev;
      if (ev.e !== 'chain') return;
      for (const c of ev.link.targets.flat().filter((x) => x.ctrl === p && d.onField(x))) await d.move(c, 'gy', { by: p });
      if (card.zone === 'hand' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card));
    }, 1500), { from: ['hand'], label: 'Special Summon this card', when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && !ev.link.isCard && ev.link.card.def.kind === 'monster' && ev.link.eff.ops.some((o) => o.op === 'destroy') && ev.link.targets.flat().some((c) => c.ctrl === p) })],
  },
  'Dreadscythe Harvester': { effects: [ign({ op: 'stat', s: { t: 'this' }, atk: 500 }, { label: 'Tribute an Insect: +500 ATK', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Insect'], notThis: true } } }], ai: -1 })] },
  'Drillago': { ruleIf: { direct: (d, c) => { const o = d.fieldCards(opp(c.ctrl)); return o.length > 0 && o.every((x) => x.zone === 'mzone' && x.faceUp && d.atk(x) >= 1600); } } },
  'Drillroid': { preBattle: destroyNoCalc((_d, _s, t) => t.pos === 'def') },
  'DUCKER Mobile Cannon': { effects: [flip({ op: 'toHand', s: { t: 'target' } }, { targets: [{ f: { ...GY_M('self'), minLv: 4, maxLv: 4 }, good: true }] })] },
  'Dummy Golem': {
    effects: [flip(run(async ({ d, p, o, card }) => {
      const c = await pick(d, o, 'Select one of your monsters to switch', d.monsters(o), 'cost');
      if (!c || card.zone !== 'mzone') return;
      const [sa, sb] = [card.slot, c.slot];
      dd(d, p).m[sa] = c; dd(d, o).m[sb] = card;
      c.ctrl = p; c.slot = sa; card.ctrl = o; card.slot = sb;
      d.log(`${card.def.name} and ${c.def.name} switch control.`);
      await d.emit({ t: 'move', card, from: 'mzone', to: 'mzone' });
      await d.emit({ t: 'move', card: c, from: 'mzone', to: 'mzone' });
    }, 600))],
  },
  'Dweller in the Depths': { statFn: (d, c) => ({ atk: 300 * d.spellTraps(c.ctrl).filter((x) => x.faceUp && x.def.kind === 'spell' && x.def.stype === 'continuous').length }) },
  'Eagle Eye': { effects: [trig('normalSummoned', run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (dd2, _s, _p, c) => c.def.kind === 'trap' && dd2.windows.some((w) => w.e === 'summon') } })))] },
  'Earth Effigy': { doubleTribute: (_d, t) => t.def.attr === 'EARTH' && t.def.mtype === 'normal' },
  'Earth Giant Gaia Plate': merge(banishProc(2, { race: ['Rock'] }), {
    auraFn: (d, src, c) => (d.battle && c !== src && ((d.battle.att === src && d.battle.tgt === c) || (d.battle.tgt === src && d.battle.att === c)) ? { atk: -Math.floor(d.base(c, 'atk') / 2), def: -Math.floor(d.base(c, 'def') / 2) } : undefined),
    effects: [trig('standby', run(async ({ d, p, card }) => {
      const r = await pick(d, p, 'Banish a Rock monster (or send Gaia Plate to the Graveyard)', d.find({ ...GY_M('self'), race: ['Rock'] }, p), 'cost', true);
      if (r) await d.banish(r, p); else await d.move(card, 'gy', { by: p });
    }), { cond: (_d, c) => c.zone === 'mzone' && c.faceUp })],
  }),
  'Ebon Magician Curran': { effects: [trig('standby', run(({ d, o }) => d.damage(o, 300 * d.monsters(o).length)), { cond: (d, c) => c.zone === 'mzone' && c.faceUp && d.monsters(opp(c.ctrl)).length > 0 })] },
  'Electric Virus': { effects: [ign({ op: 'control', s: { t: 'target' } }, { from: ['hand'], label: 'Discard: take control of a Machine or Dragon', targets: [{ f: { ...OPP_FU, race: ['Machine', 'Dragon'] } }], cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })] })] },
};

void has; void isAttackOn; void markKill; void pickSeen; void OPP_M; void M;
