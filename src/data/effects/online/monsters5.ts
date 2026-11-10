// YGO Online monsters, part 5 (Element Doom … Fiber Jar).
import {
  type Attr, type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addFrom, banishProc, banishVictims, both, contact, destroyAll, flip, has, ign, merge, neosReturn, noSTOnAttack, opp, pick,
  randomOf, run, search, spirit, ssFrom, ssPick, tokenDef, tokens, trig, won, atEndPhase, isAttackOn,
} from './olib';

const onField = (d: Duel, a: Attr) => both(d).some((c) => c.faceUp && d.attrOf(c) === a);
/** Element monsters: FIRE +500, EARTH negate destroyed effect monsters, WATER fixed control, WIND attack again. */
const element = (attrs: Attr[]): Def => ({
  statFn: attrs.includes('FIRE') ? (d) => (onField(d, 'FIRE') ? { atk: 500 } : undefined) : undefined,
  fixedCtrl: attrs.includes('WATER') ? true : undefined,
  postBattle: (d, self, o, r) => {
    if (!o || !won(self, r)) return;
    if (attrs.includes('EARTH') && onField(d, 'EARTH') && o.def.mtype === 'effect') { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); }
    if (attrs.includes('WIND') && onField(d, 'WIND') && r.att === self && self.data.again !== d.turn) { self.data.again = d.turn; self.data.extraAtk = d.turn; }
  },
});
const HERO = /Elemental Hero|Destiny Hero|Evil Hero/;
const neos = (mats: string[], extra: Def = {}): Def => merge(contact(['Elemental Hero Neos', ...mats]), { effects: [neosReturn] }, extra);
const burnVictim = (stat: (c: Card) => number): Def => ({ effects: [trig('destroysByBattle', run(({ d, o, link }) => { const x = link.trig?.other; if (x && x.zone === 'gy') return d.damage(o, stat(x)); }))] });
const charmerProc = (charmer: string, attr: Attr): Def => ({
  ssProc: {
    from: ['hand', 'deck'],
    cond: (d, p) => d.find({ ...OWN_FU, name: charmer }, p).length > 0 && d.find({ ...OWN_FU, attr }, p).some((c) => c.def.name !== charmer),
    cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, name: charmer } } }, { op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, attr } } }],
  },
  ruleIf: { pierce: (_d, c) => c.data.how === 'special' },
});
const forbidden = ['Exodia the Forbidden One', 'Right Arm of the Forbidden One', 'Left Arm of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Leg of the Forbidden One'];
const fromHandOrDeckByOpp = (c: Card) => (c.mark.from === 'hand' || c.mark.from === 'deck') && c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner;

export const MONSTERS_5: Record<string, Def> = {
  'Element Doom': element(['EARTH', 'WIND']),
  'Element Dragon': element(['FIRE', 'WIND']),
  'Element Magician': element(['WATER', 'WIND']),
  'Element Saurus': element(['FIRE', 'EARTH']),
  'Element Soldier': element(['WATER', 'EARTH']),
  'Element Valkyrie': element(['FIRE', 'WATER']),
  'Elemental Hero Air Neos': neos(['Neo-Spacian Air Hummingbird'], { statFn: (d, c) => { const diff = d.players[opp(c.ctrl)].lp - d.players[c.ctrl].lp; return diff > 0 ? { atk: diff } : undefined; } }),
  'Elemental Hero Aqua Neos': neos(['Neo-Spacian Aqua Dolphin'], { effects: [ign(run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.move(c, 'gy', { by: p }); }, 600), { opt: true, label: 'Discard: destroy a random card in the opponent\'s hand', cost: [{ op: 'discard', who: 'self', n: 1 }], cond: (d, c) => d.players[opp(c.ctrl)].hand.length > 0 })] }),
  'Elemental Hero Bladedge': { rules: ['pierce'] },
  'Elemental Hero Bubbleman': {
    ssProc: { cond: (d, p, c) => d.players[p].hand.length === 1 && d.players[p].hand[0] === c },
    effects: [trig('summoned', { op: 'draw', who: 'self', n: 2 }, { optional: true, cond: (d, c) => d.fieldCards(c.ctrl).every((x) => x === c) && d.players[c.ctrl].hand.length === 0 })],
  },
  'Elemental Hero Captain Gold': {
    selfDestructIf: (d) => !d.active('Skyscraper'),
    effects: [ign(search({ name: 'Skyscraper' }), { from: ['hand'], label: 'Discard: add Skyscraper', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: 'Skyscraper' }) }] })],
  },
  'Elemental Hero Chaos Neos': neos(['Neo-Spacian Dark Panther', 'Neo-Spacian Glow Moss'], {
    effects: [
      ign(run(async ({ d, p, o }) => {
        const n = (await d.tossCoins(3)).filter(Boolean).length;
        if (n === 3) for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
        else if (n === 2) { const ids = d.monsters(o).filter((c) => c.faceUp).map((c) => c.uid); d.addTemp({ until: d.turn, negate: (_d, c) => ids.includes(c.uid) }); }
        else if (n === 1) for (const c of d.monsters(p)) await d.toHand(c);
      }, 600), { opt: true, label: 'Toss 3 coins' }),
      trig('endPhase', run(async ({ d }) => { for (const c of both(d).filter((x) => x.faceUp)) { c.pos = 'def'; await d.setFaceDown(c); } }), { cond: (d, c) => c.zone === 'mzone' && d.tp === c.ctrl }),
    ],
  }),
  'Elemental Hero Dark Neos': neos(['Neo-Spacian Dark Panther'], {
    negateFn: (_d, src, c) => c.uid === src.data.dark && c.mv === src.data.darkMv,
    effects: [ign(run(({ card, t }) => { if (t[0]) { card.data.dark = t[0].uid; card.data.darkMv = t[0].mv; } }, 500), { label: 'Negate an Effect Monster', targets: [{ f: { ...FU, mtype: ['effect'], notThis: true } }], cond: (d, c) => !both(d).some((m) => m.uid === c.data.dark && m.mv === c.data.darkMv) })],
  }),
  'Elemental Hero Darkbright': {
    noNormal: true, rules: ['pierce'],
    postBattle: async (d, self, _o, r) => { if (r.att === self && self.zone === 'mzone') await d.changePos(self, 'def'); },
    effects: [trig('destroyed', { op: 'destroy', s: { t: 'target' } }, { from: ['gy'], targets: [{ f: OPP_M }] })],
  },
  'Elemental Hero Electrum': {
    noNormal: true,
    statFn: (d, c) => ({ atk: 300 * d.monsters(opp(c.ctrl)).filter((m) => m.faceUp && (['WIND', 'WATER', 'FIRE', 'EARTH', 'LIGHT'] as Attr[]).includes(d.attrOf(m)!)).length }),
    effects: [trig('specialSummoned', run(async ({ d }) => { const owners = new Set<Side>(); for (const s of [0, 1] as Side[]) for (const c of [...d.players[s].banished]) { owners.add(c.owner); await d.move(c, 'deck'); } for (const s of owners) await d.shuffleDeck(s); }), { cond: (_d, c) => c.data.how === 'fusion' })],
  },
  'Elemental Hero Flame Wingman': merge({ noNormal: true }, burnVictim((x) => x.def.atk ?? 0)),
  'Elemental Hero Flare Neos': neos(['Neo-Spacian Flare Scarab'], { statFn: (d) => ({ atk: 400 * [...d.spellTraps(0), ...d.spellTraps(1)].length }) }),
  'Elemental Hero Glow Neos': neos(['Neo-Spacian Glow Moss'], {
    effects: [ign(run(async ({ d, p, card, t }) => {
      const c = t[0];
      if (!c) return;
      const kind = c.def.kind;
      if (!(await d.destroy(c, 'effect', undefined, p))) return;
      if (kind === 'monster') card.noAttackTurn = d.turn;
      else if (kind === 'spell') { card.data.tempRules = { ...(card.data.tempRules ?? {}), direct: d.turn }; }
      else await d.changePos(card, 'def');
    }, 700), { opt: true, label: 'Destroy a face-up card', targets: [{ f: { side: 'opp', faceUp: true } }], cond: (d) => d.phase === 'M1' })],
  }),
  'Elemental Hero Grand Neos': neos(['Neo-Spacian Grand Mole'], { effects: [ign({ op: 'toHand', s: { t: 'target' } }, { opt: true, label: 'Return a monster to the hand', targets: [{ f: OPP_M }] })] }),
  'Elemental Hero Heat': { statFn: (d, c) => ({ atk: 200 * d.find({ ...OWN_FU, set: 'Elemental Hero' }, c.ctrl).length }) },
  'Elemental Hero Inferno': { noNormal: true, statFn: (d, c) => { const o = d.battle && (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null); return o && d.attrOf(o) === 'WATER' ? { atk: 1000 } : undefined; } },
  'Elemental Hero Knospe': {
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, set: 'Elemental Hero', notThis: true }, src.ctrl, src).length > 0 },
    ruleIf: { direct: (d, c) => d.find({ ...OWN_FU, set: 'Elemental Hero', notThis: true }, c.ctrl, c).length > 0 },
    effects: [trig('battleDamage', { op: 'stat', s: { t: 'this' }, atk: 100, def: -100, perm: true }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Elemental Hero Lady Heat': { effects: [trig('endPhase', run(({ d, p, o }) => d.damage(o, 200 * d.find({ ...OWN_FU, set: 'Elemental Hero' }, p).length)), { cond: (d, c) => d.tp === c.ctrl })] },
  'Elemental Hero Magma Neos': merge(contact(['Elemental Hero Neos', 'Neo-Spacian Flare Scarab', 'Neo-Spacian Grand Mole']), {
    statFn: (d) => ({ atk: 400 * [...d.fieldCards(0), ...d.fieldCards(1)].length }),
    effects: [trig('endPhase', run(async ({ d, card }) => {
      if (card.zone !== 'mzone') return;
      if (d.active('Neo Space') && !(await d.confirm(card.ctrl, `Return ${card.def.name} to the Fusion Deck?`, card, false))) return;
      await d.move(card, 'extra');
      for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) await d.toHand(c);
    }))],
  }),
  'Elemental Hero Marine Neos': merge(contact(['Elemental Hero Neos', 'Neo-Spacian Marine Dolphin']), { effects: [ign(run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.move(c, 'gy', { by: p }); }, 600), { opt: true, label: 'Destroy a random card in the opponent\'s hand', cond: (d, c) => d.players[opp(c.ctrl)].hand.length > 0 })] }),
  'Elemental Hero Mariner': { noNormal: true, ruleIf: { direct: (d, c) => d.players[c.ctrl].s.some((x) => !!x && !x.faceUp) } },
  'Elemental Hero Mudballman': { noNormal: true },
  'Elemental Hero Necroid Shaman': {
    noNormal: true,
    effects: [trig('specialSummoned', run(async ({ d, p, o }) => {
      const c = await pick(d, p, 'Destroy a monster', d.monsters(o), 'bad');
      if (c) await d.destroy(c, 'effect', undefined, p);
      await ssPick(d, o, d.players[o].gy.filter((x) => x.def.kind === 'monster' && d.canSpecial(o, x)).sort((a, b) => (a.def.atk ?? 0) - (b.def.atk ?? 0)), 'Special Summon a monster for your opponent');
    }), { cond: (d, c) => c.data.how === 'fusion' && d.monsters(opp(c.ctrl)).length > 0 })],
  },
  'Elemental Hero Necroshade': {
    effects: [ign(run(({ d, p, card }) => { card.mark.necroUsed = true; d.addTemp({ until: d.turn, p, lock: { noTributes: (_d, _s, q, c) => q === p && c.def.name.includes('Elemental Hero') } }); }, (d, me) => (d.players[me].hand.some((c) => (c.def.lv ?? 0) >= 5 && c.def.name.includes('Elemental Hero')) && !d.players[me].normalDone ? 900 : -1)), {
      from: ['gy'], label: 'Normal Summon an Elemental Hero without Tributes', cond: (d, c) => !c.mark.necroUsed && !d.players[c.owner].normalDone,
    })],
  },
  'Elemental Hero Neo Bubbleman': {
    noNormal: true, alias: 'Elemental Hero Bubbleman',
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, name: 'Elemental Hero Bubbleman' } } }, { op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', name: 'Metamorphosis' } } }], req: [{ f: { ...OWN_FU, name: 'Elemental Hero Bubbleman' } }, { f: { side: 'self', zone: 'hand', name: 'Metamorphosis' } }] },
    postBattle: async (d, self, o) => { if (o && o.zone === 'mzone' && o.ctrl !== self.ctrl) await d.destroy(o, 'effect', undefined, self.ctrl); },
  },
  'Elemental Hero Neos Alius': { statFn: (_d, c) => { c.data.nameAs = { name: 'Elemental Hero Neos', turn: _d.turn }; return undefined; } },
  'Elemental Hero Ocean': {
    effects: [trig('standby', run(async ({ d, p }) => { const c = await pick(d, p, 'Return a HERO monster to the hand', d.find({ side: 'self', zone: ['mzone', 'gy'], kind: 'monster', fn: (_d, x) => HERO.test(x.def.name) }, p), 'good'); if (c) await d.toHand(c); }), {
      optional: true, cond: (d, c) => d.find({ side: 'self', zone: ['mzone', 'gy'], kind: 'monster', fn: (_d, x) => HERO.test(x.def.name) }, c.ctrl).length > 0,
    })],
  },
  'Elemental Hero Phoenix Enforcer': { noNormal: true, rules: ['battleImmune'] },
  'Elemental Hero Plasma Vice': { noNormal: true, rules: ['pierce'], effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard: destroy an Attack Position monster', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { ...OPP_M, pos: 'atk' } }] })] },
  'Elemental Hero Poison Rose': {
    noNormal: true,
    lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && t !== src },
    effects: [trig('battleDamage', { op: 'stat', s: { t: 'this' }, atk: 200, def: -200, perm: true }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Elemental Hero Prisma': {
    effects: [ign(run(async ({ d, p, card }) => {
      const f = await pick(d, p, 'Reveal a Fusion Monster', d.players[p].extra.filter((x) => (x.def.mats ?? []).some((m) => d.players[p].deck.some((c) => d.matMatches(m, c)))), 'good');
      if (!f) return;
      await d.reveal(opp(p), [f], 'Elemental Hero Prisma');
      const m = await pick(d, p, 'Send a Fusion Material from your Deck', d.players[p].deck.filter((c) => (f.def.mats ?? []).some((x) => d.matMatches(x, c))), 'cost');
      if (!m) return;
      await d.move(m, 'gy', { by: p });
      await d.shuffleDeck(p);
      card.data.nameAs = { name: m.def.name, turn: d.turn };
    }, 300), { opt: true, label: 'Reveal a Fusion Monster: send a material' })],
  },
  'Elemental Hero Rampart Blaster': {
    noNormal: true,
    rules: ['attackFromDef'],
    ruleIf: { direct: (_d, c) => c.pos === 'def' },
    statFn: (d, c) => (d.battle?.att === c && !d.battle.tgt && c.pos === 'def' ? { atk: -Math.floor(d.base(c, 'atk') / 2) } : undefined),
  },
  'Elemental Hero Shining Flare Wingman': merge({ noNormal: true, statFn: (d: Duel, c: Card) => ({ atk: 300 * d.players[c.ctrl].gy.filter((x) => x.def.name.includes('Elemental Hero')).length }) }, burnVictim((x) => x.def.atk ?? 0)),
  'Elemental Hero Shining Phoenix Enforcer': { noNormal: true, rules: ['battleImmune'], statFn: (d, c) => ({ atk: 300 * d.players[c.ctrl].gy.filter((x) => x.def.name.includes('Elemental Hero')).length }) },
  'Elemental Hero Steam Healer': { noNormal: true, effects: [trig('destroysByBattle', run(({ d, p, link }) => { const x = link.trig?.other; if (x && x.zone === 'gy') return d.heal(p, x.def.atk ?? 0); }))] },
  'Elemental Hero Storm Neos': merge(contact(['Elemental Hero Neos', 'Neo-Spacian Air Hummingbird', 'Neo-Spacian Aqua Dolphin']), {
    effects: [
      ign(destroyAll({ side: 'any', st: true, zone: ['szone', 'fzone'] }), { opt: true, label: 'Destroy all Spells and Traps', ai: (d, me) => d.spellTraps(opp(me)).length * 600 - d.spellTraps(me).length * 500 }),
      trig('endPhase', run(async ({ d, card }) => {
        if (card.zone !== 'mzone') return;
        if (d.active('Neo Space') && !(await d.confirm(card.ctrl, `Return ${card.def.name} to the Fusion Deck?`, card, false))) return;
        await d.move(card, 'extra');
        for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) await d.move(c, 'deck');
        await d.shuffleDeck(0); await d.shuffleDeck(1);
      })),
    ],
  }),
  'Elemental Hero Stratos': {
    effects: [trig(['normalSummoned', 'specialSummoned'], run(async ({ d, p, card }) => {
      const n = d.find({ ...OWN_FU, fn: (_d, c) => HERO.test(c.def.name) && c !== card }, p).length;
      const deckHeroes = d.find(DECK({ kind: 'monster', fn: (_d, c) => HERO.test(c.def.name) }), p);
      const i = n && d.find(ST, p).length ? await d.option(p, 'Elemental Hero Stratos', ['Destroy Spells/Traps', 'Add a HERO from your Deck'], deckHeroes.length ? 1 : 0) : 1;
      if (i === 0) for (const c of await d.select(p, `Destroy up to ${n} Spell/Trap Cards`, d.find(ST, p), 1, n, 'bad')) await d.destroy(c, 'effect', undefined, p);
      else { const c = await pick(d, p, 'Add a HERO monster', deckHeroes, 'good'); if (c) { await d.toHand(c); await d.shuffleDeck(p); } }
    }), { optional: true })],
  },
  'Elemental Hero Tempest': {
    noNormal: true,
    lock: { indestructible: (_d, src, c, by) => !!src && by === 'battle' && (src.data.tempest ?? []).includes(c.uid) },
    effects: [ign(run(({ card, t }) => { if (t[0]) card.data.tempest = [...(card.data.tempest ?? []), t[0].uid]; }, 300), {
      label: 'Send a card: protect a monster', targets: [{ f: OWN_FU, good: true }], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: ['mzone', 'szone', 'fzone'], notThis: true } } }],
    })],
  },
  'Elemental Hero Terra Firma': {
    noNormal: true,
    effects: [ign(run(({ d, card, link }) => { d.addMod(card, link.data.atk ?? 0, 0); }, 500), {
      label: 'Tribute an Elemental Hero: gain its ATK',
      cost: [run(async ({ d, p, card, link }) => { const c = await pick(d, p, 'Tribute an Elemental Hero', d.find({ ...OWN_FU, set: 'Elemental Hero', notThis: true }, p, card).filter((x) => d.tributeOk(x)), 'cost'); if (c) { link.data.atk = d.atk(c); await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p, card) => d.find({ ...OWN_FU, set: 'Elemental Hero', notThis: true }, p, card).length > 0)],
    })],
  },
  'Elemental Hero Thunder Giant': { noNormal: true, effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Discard: destroy a monster', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { ...FU, fn: (d, c, _p, src) => !!src && (c.def.atk ?? 0) < d.atk(src) } }] })] },
  'Elemental Hero Voltic': { effects: [trig('battleDamage', ssFrom(['banished'], { set: 'Elemental Hero' }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && d.find({ side: 'self', zone: 'banished', set: 'Elemental Hero', kind: 'monster' }, c.ctrl).length > 0 })] },
  'Elemental Hero Wild Wingman': { noNormal: true, effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard: destroy a Spell/Trap', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: ST }] })] },
  'Elemental Hero Wildedge': { noNormal: true, rules: ['attackAll'] },
  'Elemental Hero Wildheart': { immune: (_d, _s, src) => src.def.kind === 'trap' },
  'Elemental Hero Woodsman': { effects: [trig('standby', addFrom(['deck', 'gy'], { name: 'Polymerization' }), { optional: true, opt: true, cond: (d, c) => d.find({ side: 'self', zone: ['deck', 'gy'], name: 'Polymerization' }, c.ctrl).length > 0 })] },
  'Elemental Mistress Doriado': { attrFn: () => undefined },
  'Elephant Statue of Blessing': { effects: [trig('toGY', { op: 'heal', who: 'self', n: 2000 }, { from: ['gy'], cond: (_d, c) => c.mark.from === 'hand' && c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner })] },
  'Elephant Statue of Disaster': { effects: [trig('toGY', { op: 'damage', who: 'opp', n: 2000 }, { from: ['gy'], cond: (_d, c) => c.mark.from === 'hand' && c.mark.sentBy !== undefined && c.mark.sentBy !== c.owner })] },
  'Emes the Infinity': { effects: [trig('destroysByBattle', { op: 'stat', s: { t: 'this' }, atk: 700, perm: true })] },
  'Emissary of the Afterlife': {
    effects: [trig('fieldToGY', run(async ({ d, p, o }) => {
      for (const s of [p, o]) { const c = await pick(d, s, 'Add a Level 3 or lower Normal Monster', d.find(DECK({ kind: 'monster', mtype: ['normal'], maxLv: 3 }), s), 'good'); if (c) { await d.reveal(opp(s), [c], 'Emissary of the Afterlife'); await d.toHand(c); await d.shuffleDeck(s); } }
    }), { from: ['gy'] })],
  },
  'Emissary of the Oasis': {
    lock: {
      target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, mtype: ['normal'], maxLv: 3 }, src.ctrl).length > 0,
      battleDmg: (d, src, att, tgt, n, to) => (!!src && to === src.ctrl && [att, tgt].some((m) => m && m.ctrl === src.ctrl && m.def.mtype === 'normal' && d.lvOf(m) <= 3) ? 0 : n),
    },
  },
  'Emperor of Lightning': { noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === 'Thunder' },
  'Emperor Setem': {
    onSummon: async (d, src, c, how, p) => {
      if (p !== src.ctrl || how !== 'normal' || !(c.mark.tribCount > 0)) return;
      for (const s of [0, 1] as Side[]) { const g = await pick(d, s, 'Return a card from your Graveyard to the top of your Deck', d.players[s].gy, 'good', true); if (g) await d.move(g, 'deck'); }
    },
  },
  'Enishi, Shien\'s Chancellor': merge(banishProc(2, { set: 'Six Samurai' }), { effects: [ign([{ op: 'destroy', s: { t: 'target' } }, { op: 'noAttackSelf' }], { opt: true, label: 'Destroy a face-up monster', targets: [{ f: FU }] })] }),
  'Enraged Battle Ox': { lock: { grants: (d, src, c, r) => !!src && r === 'pierce' && c.ctrl === src.ctrl && ['Beast', 'Beast-Warrior', 'Winged Beast'].includes(d.raceOf(c) ?? '') } },
  'Enraged Muka Muka': { statFn: (d, c) => { const n = 400 * d.players[c.ctrl].hand.length; return { atk: n, def: n }; } },
  'Eria the Water Charmer': { effects: [flip(run(async ({ d, p, card, t }) => { if (t[0]) await d.takeControl(t[0], p, true, card); }, 1000), { targets: [{ f: { ...OPP_FU, attr: 'WATER' } }] })] },
  'Etoile Cyber': { statFn: (d, c) => (d.battle?.att === c && !d.battle.tgt ? { atk: 500 } : undefined) },
  'Evil Dragon Ananta': {
    noNormal: true,
    ssProc: {
      cond: (d, p) => d.find({ side: 'self', zone: ['mzone', 'gy'], kind: 'monster', race: ['Reptile'] }, p).length > 0,
      cost: [run(async ({ d, p, card }) => { const cs = d.find({ side: 'self', zone: ['mzone', 'gy'], kind: 'monster', race: ['Reptile'] }, p).filter((c) => c !== card); card.mark.ananta = cs.length; for (const c of cs) await d.banish(c, p); })],
    },
    statFn: (d, c) => { const n = 600 * (c.mark.ananta ?? 0); return { atk: n - d.base(c, 'atk'), def: n - d.base(c, 'def') }; },
    effects: [trig('endPhase', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy 1 card', [...d.fieldCards(0), ...d.fieldCards(1)], 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), { cond: (d, c) => d.tp === c.ctrl })],
  },
  'Evil Hero Dark Gaia': {
    mats: [{ race: 'Fiend' }, { race: 'Rock' }],
    statFn: (d, c) => ({ atk: (c.mark.matAtk ?? 0) - d.base(c, 'atk') }),
    effects: [trig('attacks', run(async ({ d, o }) => { for (const c of d.monsters(o).filter((x) => x.pos === 'def')) await d.changePos(c, 'atk', false); }), { optional: true })],
  },
  'Evil Hero Infernal Gainer': {
    effects: [ign(run(async ({ d, p, card, t }) => {
      if (t[0]) { const m = t[0]; m.data.extraAtk = d.turn; }
      await d.banish(card, p);
      const mv = card.mv;
      d.schedule({ at: 'SP', turn: d.turn + (d.tp === p ? 4 : 3), fn: async () => { if (card.mv === mv && card.zone === 'banished' && d.canSpecial(p, card)) await d.specialSummon(card, p, 'atk'); } });
    }, 500), { label: 'Banish: a Fiend attacks twice', targets: [{ f: { ...OWN_FU, race: ['Fiend'], notThis: true }, good: true }], cond: (d) => d.phase === 'M1' })],
  },
  'Evil Hero Infernal Prodigy': {
    ssProc: { cond: (d, p) => d.monsters(p).length === 0 },
    effects: [trig('toGY', run(({ d, card }) => { const p = card.owner; d.schedule({ at: 'EP', turn: d.turn, fn: () => d.draw(p, 1) }); }), {
      from: ['gy'], cond: (d, c) => c.mark.lastWhy === 'tribute' && d.monsters(c.owner).some((m) => m.data.sumTurn === d.turn && HERO.test(m.def.name) && (m.mark.tribs ?? []).includes(c.def.name)),
    })],
  },
  'Evil Hero Infernal Sniper': {
    effects: [trig('standby', { op: 'damage', who: 'opp', n: 1000 }, { cond: (_d, c) => c.faceUp && c.pos === 'def' })],
    lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'effect' && !!d.chain[d.chain.length - 1] && d.chain[d.chain.length - 1].card.def.kind === 'spell' },
  },
  'Evil Hero Inferno Wing': merge({ rules: ['pierce'] } as Def, burnVictim((x) => Math.max(x.def.atk ?? 0, x.def.def ?? 0))),
  'Evil Hero Lightning Golem': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Destroy a monster', targets: [{ f: M }] })] },
  'Evil Hero Malicious Edge': { tributes: (d, p) => (d.monsters(opp(p)).length ? 1 : 2), rules: ['pierce'] },
  'Evil Hero Malicious Fiend': {
    mats: [{ name: 'Evil Hero Malicious Edge' }, { race: 'Fiend', fn: (c) => (c.def.lv ?? 0) >= 6, text: '1 Level 6 or higher Fiend-Type monster' }],
    lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && t !== src },
  },
  'Evil Hero Wild Cyclone': {
    lock: noSTOnAttack(),
    effects: [trig('battleDamage', destroyAll({ side: 'opp', zone: ['szone', 'fzone'], faceUp: false }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })],
  },
  'Exarion Universe': {
    effects: [ign(run(({ d, card }) => { d.addMod(card, -400, 0); card.data.tempRules = { ...(card.data.tempRules ?? {}), pierce: d.turn }; }, 200), { label: '-400 ATK: piercing damage', phase: ['BP'], opt: true })],
  },
  'Exiled Force': { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Tribute: destroy a monster', cost: [{ op: 'tribute', s: { t: 'this' } }], targets: [{ f: { ...M, notThis: true } }] })] },
  'Exodia Necross': {
    noNormal: true,
    rules: ['battleImmune'],
    lock: { indestructible: (d, src, c, by) => !!src && c === src && by === 'effect' && !!d.chain[d.chain.length - 1] && d.chain[d.chain.length - 1].card.def.kind !== 'monster' },
    selfDestructIf: (d, c) => !forbidden.every((n) => d.players[c.ctrl].gy.some((x) => x.def.name === n)),
    effects: [trig('standby', { op: 'stat', s: { t: 'this' }, atk: 500, perm: true }, { cond: (_d, c) => c.zone === 'mzone' && c.faceUp })],
  },
  'Exodius the Ultimate Forbidden Lord': {
    noNormal: true,
    ssProc: { cond: (d, p) => d.players[p].gy.some((c) => c.def.kind === 'monster'), cost: [run(async ({ d, p }) => { for (const c of d.players[p].gy.filter((x) => x.def.kind === 'monster')) await d.move(c, 'deck'); await d.shuffleDeck(p); })] },
    statFn: (d, c) => ({ atk: 1000 * d.players[c.ctrl].gy.filter((x) => x.def.kind === 'monster' && x.def.mtype === 'normal').length - d.base(c, 'atk') }),
    winCheck: (d, c) => forbidden.every((n) => d.players[c.owner].gy.some((x) => x.def.name === n && x.mark.exodius)),
    effects: [
      trig('attacks', run(async ({ d, p }) => { const c = await pick(d, p, 'Send a monster from your hand or Deck to the Graveyard', d.find({ side: 'self', zone: ['hand', 'deck'], kind: 'monster' }, p), 'cost'); if (c) { c.mark.exodius = true; await d.move(c, 'gy', { by: p }); } })),
      trig('leftField', run(async ({ d, card }) => { if (card.zone !== 'banished') await d.banish(card, card.owner); }), { from: ['gy', 'hand', 'deck', 'extra'] }),
    ],
  },
  'Exploder Dragon': {
    battleDmg: (d, self, _o, n) => (d.battle?.att === self ? 0 : n),
    effects: [trig('battleDestroyed', run(async ({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'mzone') await d.destroy(o, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Expressroid': { effects: [trig('summoned', run(async ({ d, p }) => { for (const c of await d.select(p, 'Add up to 2 "roid" monsters', d.find({ ...GY_M('self'), fn: (_d, x) => x.def.name.includes('roid') && x.def.name !== 'Expressroid' }, p), 0, 2, 'good')) await d.toHand(c); }), { optional: true })] },
  'Exxod, Master of The Guard': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, fn: (_d, c) => /sphinx/i.test(c.def.name) } } }], req: [{ f: { ...OWN_M, fn: (_d, c) => /sphinx/i.test(c.def.name) } }] },
    onSummon: async (d, src, c, how) => { if (how === 'flip' && d.attrOf(c) === 'EARTH') await d.damage(opp(src.ctrl), 1000, src); },
  },
  'F.G.D.': {
    noNormal: true,
    mats: [{ race: 'Dragon' }, { race: 'Dragon' }, { race: 'Dragon' }, { race: 'Dragon' }, { race: 'Dragon' }],
    battleDmg: (d, self, other, n, to) => (to === self.ctrl && other && ['EARTH', 'WATER', 'FIRE', 'WIND', 'DARK'].includes(d.attrOf(other) ?? '') ? 0 : n),
  },
  'Familiar Knight': { effects: [trig('battleDestroyed', run(async ({ d, p, o }) => { for (const s of [p, o]) await ssPick(d, s, d.players[s].hand.filter((c) => c.def.kind === 'monster' && c.def.lv === 4), 'Special Summon a Level 4 monster'); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Familiar-Possessed - Aussa': charmerProc('Aussa the Earth Charmer', 'EARTH'),
  'Familiar-Possessed - Eria': charmerProc('Eria the Water Charmer', 'WATER'),
  'Familiar-Possessed - Hiita': charmerProc('Hiita the Fire Charmer', 'FIRE'),
  'Familiar-Possessed - Wynn': charmerProc('Wynn the Wind Charmer', 'WIND'),
  'Fear from the Dark': { effects: [trig('toGY', run(async ({ d, card }) => { if (card.zone === 'gy' && d.canSpecial(card.owner, card)) await d.specialSummon(card, card.owner, await d.askPos(card.owner, card)); }), { from: ['gy'], cond: (_d, c) => fromHandOrDeckByOpp(c) })] },
  'Felgrand Dragon': {
    noNormal: true,
    statFn: (_d, c) => ({ atk: c.data.felgrand ?? 0 }),
    effects: [trig('specialSummoned', run(async ({ d, p, card }) => { const g = await pick(d, p, 'Select a monster in your Graveyard', d.players[p].gy.filter((c) => c.def.kind === 'monster'), 'good'); if (g) card.data.felgrand = 200 * (g.def.lv ?? 0); }), { cond: (d, c) => d.players[c.ctrl].gy.some((x) => x.def.kind === 'monster') })],
  },
  'Fenrir': merge(banishProc(2, { attr: 'WATER' }), { effects: [trig('destroysByBattle', run(({ d, o }) => { d.flag('skipDraw', o); d.log(`${d.name(o)} will skip their next Draw Phase.`); }))] }),
  'Fiber Jar': {
    effects: [flip(run(async ({ d }) => {
      for (const s of [0, 1] as Side[]) {
        for (const c of [...d.fieldCards(s), ...d.players[s].hand, ...d.players[s].gy]) await d.move(c, 'deck');
      }
      for (const s of [0, 1] as Side[]) { await d.shuffleDeck(s); await d.draw(s, Math.min(5, d.players[s].deck.length)); }
    }, (d, me) => (d.fieldCards(opp(me)).length + d.players[opp(me)].hand.length) * 300 - (d.fieldCards(me).length + d.players[me].hand.length) * 300))],
  },
};

// Doriado counts as every Attribute: modelled by the filters that check Attribute (it is treated as LIGHT here).
MONSTERS_5['Elemental Mistress Doriado'] = {};
void tokens; void tokenDef; void spirit; void atEndPhase; void isAttackOn; void has; void banishVictims; void OWN_M; void GY_M;
