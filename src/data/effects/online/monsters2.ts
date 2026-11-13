// YGO Online monsters, part 2 (B.E.S. Crystal Core … Chrysalis Pinny).
import {
  type Card, type Def, type Duel, type Side,
  CHRYSALIS, DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, banishProc, both, ctr, destroyAll, flip, grantRule, has, ign, isAttackOn, merge, opp, pick, quick,
  randomOf, removeCtr, run, search, spellCounterGain, ssFrom, ssPick, threat, tokenDef, tokens, trig, union, won, umi, tributed,
} from './olib';

/** B.E.S. monsters: counters on Normal Summon, indestructible by battle, lose a counter after each battle (destroyed if none). */
const bes = (n: number, coin = false, extra: Def = {}): Def => merge({
  rules: ['battleImmune'],
  effects: [trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, n, 'core'); }))],
  postBattle: async (d, self) => {
    if (self.zone !== 'mzone') return;
    if (coin && (await d.call(self.ctrl))) return;
    if (!removeCtr(d, self, 1, 'core')) await d.destroy(self, 'effect', undefined, self.ctrl);
  },
}, extra);
const statue = (attr: 'DARK' | 'EARTH' | 'LIGHT' | 'FIRE' | 'WIND' | 'WATER'): Def => ({ lock: { summon: (_d, _s, _p, c, how) => how !== 'normal' && how !== 'flip' && c.def.attr !== attr } });
const chrysalis = (name: string): Def => ({
  effects: [ign(ssFrom(['hand', 'deck'], { name: CHRYSALIS[name] }), { label: `Tribute: Special Summon ${CHRYSALIS[name]}`, cost: [{ op: 'tribute', s: { t: 'this' } }], cond: (d) => d.active('Neo Space'), req: [{ f: { side: 'self', zone: ['hand', 'deck'], name: CHRYSALIS[name] } }] })],
});
const lightDark = (): Def => ({
  noNormal: true,
  ssProc: {
    cond: (d, p) => d.find({ ...GY_M('self'), attr: 'LIGHT' }, p).length > 0 && d.find({ ...GY_M('self'), attr: 'DARK' }, p).length > 0,
    cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'LIGHT' } } }, { op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK' } } }],
  },
});
const oneOf = (d: Duel, p: Side, text: string, cs: Card[]) => pick(d, p, text, cs, 'cost');

export const MONSTERS_2: Record<string, Def> = {
  'B.E.S. Crystal Core': bes(3, false, { effects: [ign({ op: 'pos', s: { t: 'target' }, to: 'def' }, { opt: true, label: 'Change a monster to Defense Position', targets: [{ f: { ...OPP_FU, pos: 'atk' } }] })] }),
  'B.E.S. Tetran': bes(3, false, { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { opt: true, label: 'Remove a counter: destroy a Spell/Trap', targets: [{ f: ST }], cost: [run(({ d, card }) => { removeCtr(d, card, 1, 'core'); }, 0, (_d, _p, c) => ctr(c, 'core') > 0)] })] }),
  'Babycerasaurus': { effects: [trig('destroyed', ssFrom(['deck'], { race: ['Dinosaur'], maxLv: 4 }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.destroyedHow === 'effect' })] },
  'Balloon Lizard': {
    effects: [
      trig('standby', run(({ d, card }) => { addCtr(d, card, 1, 'balloon'); }), { cond: (_d, c) => c.zone === 'mzone' && c.faceUp }),
      trig('destroyed', run(({ d, card }) => { const by = card.mark.destroyedBy; const n = card.last.ctr?.balloon ?? 0; if (by !== undefined && n) return d.damage(by, 400 * n, card); }), { from: ['gy'], cond: (_d, c) => (c.last.ctr?.balloon ?? 0) > 0 }),
    ],
  },
  'Banisher of the Radiance': { lock: { gyToBanish: true } },
  'Barrier Statue of the Abyss': statue('DARK'),
  'Barrier Statue of the Drought': statue('EARTH'),
  'Barrier Statue of the Heavens': statue('LIGHT'),
  'Barrier Statue of the Inferno': statue('FIRE'),
  'Barrier Statue of the Stormwinds': statue('WIND'),
  'Barrier Statue of the Torrent': statue('WATER'),
  'Batteryman AA': {
    statFn: (d, c) => {
      const aa = d.find({ ...OWN_FU, name: 'Batteryman AA' }, c.ctrl);
      if (aa.every((x) => x.pos === 'atk')) return { atk: 1000 * aa.length };
      if (aa.every((x) => x.pos === 'def')) return { def: 1000 * aa.length };
      return undefined;
    },
  },
  'Batteryman C': {
    auraFn: (d, src, c) => {
      if (c.ctrl !== src.ctrl || d.raceOf(c) !== 'Machine') return undefined;
      const cs = d.find({ ...OWN_FU, name: 'Batteryman C' }, src.ctrl);
      if (cs[0] !== src) return undefined;
      if (cs.every((x) => x.pos === 'atk')) return { atk: 500 * cs.length };
      if (cs.every((x) => x.pos === 'def')) return { def: 500 * cs.length };
      return undefined;
    },
  },
  'Batteryman Charger': {
    statFn: (d, c) => { const n = 300 * d.find({ ...OWN_FU, race: ['Thunder'] }, c.ctrl).length; return { atk: n, def: n }; },
    effects: [trig('normalSummoned', ssFrom(['hand', 'deck'], { set: 'Batteryman', fn: (_d, c) => c.def.name !== 'Batteryman Charger' }), { optional: true })],
  },
  'Batteryman D': { lock: { target: (d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t.ctrl === src.ctrl && t.faceUp && d.raceOf(t) === 'Thunder' && t.def.name !== 'Batteryman D' } },
  'Batteryman Industrial Strength': merge(banishProc(2, { set: 'Batteryman' }), {
    effects: [ign(run(async ({ d, p }) => {
      const m = await pick(d, p, 'Destroy a monster', both(d), 'bad');
      const s = await pick(d, p, 'Destroy a Spell or Trap Card', d.find(ST, p), 'bad');
      if (m) await d.destroy(m, 'effect', undefined, p);
      if (s) await d.destroy(s, 'effect', undefined, p);
    }, 1200), { opt: true, label: 'Banish a Thunder: destroy a monster and a Spell/Trap', cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), race: ['Thunder'] } } }], req: [{ f: M }, { f: ST }] })],
  }),
  'Batteryman Micro-Cell': {
    effects: [flip(ssFrom(['deck'], { set: 'Batteryman', maxLv: 4, fn: (_d, c) => c.def.name !== 'Batteryman Micro-Cell' })), trig('battleDestroyed', { op: 'draw', who: 'self', n: 1 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && !!c.mark.flipped })],
  },
  'Beast King Barbaros': {
    altTributes: [0, 3],
    statFn: (d, c) => (c.mark.tribCount === 0 && c.data.how === 'normal' ? { atk: 1900 - d.base(c, 'atk') } : undefined),
    effects: [trig('normalSummoned', destroyAll({ side: 'opp' }), { cond: (_d, c) => c.mark.tribCount === 3 })],
  },
  'Beast Machine King Barbaros Ür': {
    ssProc: {
      cond: (d, p) => d.find({ side: 'self', zone: ['hand', 'mzone', 'gy'], kind: 'monster', race: ['Machine'] }, p).length > 0 && d.find({ side: 'self', zone: ['hand', 'mzone', 'gy'], kind: 'monster', race: ['Beast-Warrior'] }, p).some((c) => c.def.name !== 'Beast Machine King Barbaros Ür'),
      cost: [
        { op: 'banish', s: { t: 'choose', f: { side: 'self', zone: ['hand', 'mzone', 'gy'], kind: 'monster', race: ['Machine'] } } },
        { op: 'banish', s: { t: 'choose', f: { side: 'self', zone: ['hand', 'mzone', 'gy'], kind: 'monster', race: ['Beast-Warrior'], notThis: true } } },
      ],
    },
    battleDmg: (_d, self, _o, n, to) => (to !== self.ctrl ? 0 : n),
  },
  'Beelze Frog': { statFn: (d, c) => ({ atk: 300 * d.players[c.ctrl].gy.filter((x) => x.def.name === 'T.A.D.P.O.L.E.').length }) },
  'Behemoth the King of All Animals': {
    altTributes: [1],
    statFn: (d, c) => (c.mark.tribCount === 1 && c.data.how === 'normal' ? { atk: 2000 - d.base(c, 'atk') } : undefined),
    effects: [trig('normalSummoned', run(async ({ d, p, card }) => {
      const n = card.mark.tribCount ?? 0;
      for (const c of await d.select(p, `Return up to ${n} Beast monsters to your hand`, d.find({ ...GY_M('self'), race: ['Beast'] }, p), 0, n, 'good')) await d.toHand(c);
    }), { optional: true, cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })],
  },
  'Beiige, Vanguard of Dark World': { effects: [trig('effDiscarded', run(async ({ d, p, card }) => { if (card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }), { from: ['gy'] })] },
  'Belial - Marquis of Darkness': {
    lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t !== src && t.ctrl === src.ctrl },
    protect: (d, src, target, by) => target.ctrl === src.ctrl && target !== src && target.zone === 'mzone' && by.def.kind !== 'monster' && d.holder(by) !== src.ctrl,
  },
  'Berserk Dragon': {
    noNormal: true, rules: ['attackAll'],
    effects: [trig('endPhase', { op: 'stat', s: { t: 'this' }, atk: -500, perm: true }, { cond: (d, c) => d.tp === c.ctrl })],
  },
  'Berserk Gorilla': {
    selfDestructIf: (_d, c) => c.zone === 'mzone' && c.faceUp && c.pos === 'def',
  },
  'Big Core': bes(3),
  'Big-Tusked Mammoth': { lock: { attack: (d, src, a) => !!src && a.ctrl !== src.ctrl && a.data.sumTurn === d.turn } },
  'Birdface': { effects: [trig('battleDestroyed', search({ name: 'Harpie Lady' }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Bitelon': { rules: ['pierce'] },
  'Black Luster Soldier - Envoy of the Beginning': merge(lightDark(), {
    effects: [ign([{ op: 'banish', s: { t: 'target' } }, { op: 'noAttackSelf' }], { label: 'Banish a monster', opt: true, targets: [{ f: M }], cond: (d, c) => d.tp === c.ctrl && c.attacks === 0 })],
    postBattle: (d, self, _o, r) => { if (won(self, r) && r.att === self && self.data.blsTurn !== d.turn && self.opt[0] !== d.turn) { self.data.blsTurn = d.turn; self.data.extraAtk = d.turn; } },
  }),
  'Black Ptera': { effects: [trig('fieldToGY', { op: 'toHand', s: { t: 'this' } }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.lastWhy !== 'battle' })] },
  'Black Stego': { effects: [trig('attacked', { op: 'pos', s: { t: 'this' }, to: 'def' }, { cond: (_d, c) => c.faceUp && c.pos === 'atk' })] },
  'Black Tyranno': { ruleIf: { direct: (d, c) => d.fieldCards(opp(c.ctrl)).every((x) => x.zone === 'mzone' && x.pos === 'def') } },
  'Black Veloci': {
    statFn: (d, c) => (d.battle?.att === c && d.battle.tgt ? { atk: 400 } : d.battle?.tgt === c ? { atk: -400 } : undefined),
  },
  'Blade Knight': {
    statFn: (d, c) => (d.players[c.ctrl].hand.length <= 1 ? { atk: 400 } : undefined),
    postBattle: (d, self, o, r) => { if (o && won(self, r) && d.monsters(self.ctrl).length === 1 && o.def.effects?.some((e) => e.type === 'flip')) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } },
  },
  'Blade Rabbit': { effects: [trig('toDef', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  'Blast Asmodian': { onResolve: async (d, src, link) => { if (link.isCard && link.card.def.kind !== 'monster' && link.num >= 2) await d.damage(opp(src.ctrl), 500, src); } },
  'Blast Magician': merge(spellCounterGain(), {
    effects: [ign(run(async ({ d, p, card }) => {
      const n = ctr(card);
      const t = await pick(d, p, 'Destroy a face-up monster', d.find({ ...FU, fn: (dd, c) => dd.atk(c) <= 700 * n }, p), 'bad');
      if (!t) return;
      const need = Math.ceil(d.atk(t) / 700) || 1;
      removeCtr(d, card, need);
      await d.destroy(t, 'effect', undefined, p);
    }, 800), { label: 'Remove Spell Counters: destroy a monster', cond: (d, c) => ctr(c) > 0 && d.find({ ...FU, fn: (dd, x) => dd.atk(x) <= 700 * ctr(c) }, c.ctrl).length > 0 })],
  }),
  'Blazewing Butterfly': {
    effects: [ign(run(async ({ d, p, card }) => {
      const c = await pick(d, p, 'Special Summon a Gemini monster', d.find({ ...GY_M('self'), ability: 'gemini', fn: (_d, x) => x.def.name !== 'Blazewing Butterfly' }, p).filter((x) => d.canSpecial(p, x)), 'good');
      if (c && (await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card))) c.data.gemini = true;
    }, 800), { label: 'Tribute: Special Summon a Gemini', cost: [{ op: 'tribute', s: { t: 'this' } }], req: [{ f: { ...GY_M('self'), ability: 'gemini' } }] })],
  },
  'Blazing Hiita': {
    effects: [ign({ op: 'summon', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'FIRE' } }, bind: true }, {
      opt: true, label: 'Tribute a FIRE monster: Special Summon a FIRE monster',
      cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'FIRE', notThis: true } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'FIRE' } }],
    })],
  },
  'Blindly Loyal Goblin': { fixedCtrl: true },
  'Blizzard Dragon': {
    effects: [ign(run(({ d, t }) => {
      const c = t[0];
      if (!c) return;
      const mv = c.mv, until = d.turn + 1;
      d.addTemp({ until, lock: { attack: (_d, _s, a) => a === c && a.mv === mv, pos: (_d, _s, x) => x === c && x.mv === mv } });
    }, 500), { opt: true, label: 'Freeze a monster', targets: [{ f: OPP_M }] })],
  },
  'Blockman': {
    effects: [ign(run(async ({ d, p, card }) => {
      const n = Math.max(1, Math.ceil((d.turn - card.turnIn + 1) / 2));
      await tokens(d, p, tokenDef('Block Token', 'Rock', 'EARTH', 4, 1000, 1500, { rules: ['cantAttack'] }), n, 'def');
    }, (d, me) => (d.freeCount(me, 'm') >= 1 ? 400 : -1)), { label: 'Tribute: Special Summon Block Tokens', cost: [{ op: 'tribute', s: { t: 'this' } }] })],
  },
  'Blood Sucker': { effects: [trig('battleDamage', { op: 'mill', who: 'opp', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] },
  'Blowback Dragon': { effects: [ign(run(async ({ d, p, o }) => { const r = await d.tossCoins(3); if (r.filter(Boolean).length >= 2) { const c = await pick(d, p, 'Destroy a card', d.fieldCards(o), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); } }, 600), { opt: true, label: 'Toss 3 coins', req: [{ f: { side: 'opp' } }] })] },
  'Blue Thunder T-45': { effects: [trig('destroysByBattle', run(({ d, p }) => tokens(d, p, tokenDef('Thunder Option Token', 'Machine', 'LIGHT', 4, 1500, 1500, { rules: ['noTribute'] }), 1, 'atk')))] },
  'Blue-Eyes Shining Dragon': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Blue-Eyes Ultimate Dragon' } } }], req: [{ f: { ...OWN_FU, name: 'Blue-Eyes Ultimate Dragon' } }] },
    statFn: (d, c) => ({ atk: 300 * d.players[c.ctrl].gy.filter((x) => x.def.kind === 'monster' && x.def.race === 'Dragon').length }),
    onTargeted: async (d, self, link) => { if (link.p !== self.ctrl && (await d.confirm(self.ctrl, `Negate the effect of ${link.card.def.name}?`, self))) link.negated = true; },
  },
  'Boot-Up Soldier - Dread Dynamo': { statFn: (d, c) => (d.find({ ...OWN_FU, set: 'Gadget' }, c.ctrl).length ? { atk: 2000 } : undefined) },
  'Botanical Lion': { fixedCtrl: true, statFn: (d, c) => ({ atk: 300 * d.find({ ...OWN_FU, race: ['Plant'] }, c.ctrl).length }) },
  'Bountiful Artemis': { onResolve: async (d, src, link) => { if (link.isCard && link.card.def.kind === 'trap' && link.card.def.stype === 'counter') await d.draw(src.ctrl, 1); } },
  'Bowganian': { effects: [trig('standby', { op: 'damage', who: 'opp', n: 600 }, { cond: (_d, c) => c.zone === 'mzone' && c.faceUp })] },
  'Brain Crusher': {
    postBattle: (d, self, o, r) => {
      if (!o || !won(self, r) || self.data.crusher === d.turn) return;
      self.data.crusher = d.turn;
      const p = self.ctrl, mv = o.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (o.mv === mv && o.zone === 'gy' && d.canSpecial(p, o) && (await d.confirm(p, `Special Summon ${o.def.name}?`, o))) await d.specialSummon(o, p, await d.askPos(p, o)); } });
    },
  },
  'Brain Jacker': {
    effects: [
      flip(run(async ({ d, p, card, t }) => {
        const m = t[0];
        if (!m || m.zone !== 'mzone' || card.zone !== 'mzone') return;
        if (await d.equipCard(card, m, {}, p)) await d.takeControl(m, p, true, card);
      }, 1200), { targets: [{ f: OPP_M }] }),
      trig('oppStandby', run(({ d, card }) => d.heal(opp(card.ctrl), 500)), { cond: (d, c) => c.zone === 'szone' && !!d.equippedTo(c) }),
    ],
  },
  'Breaker the Magical Warrior': {
    statFn: (_d, c) => ({ atk: 300 * ctr(c) }),
    effects: [
      trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, 1, 'spell', 1); })),
      ign([run(({ d, card }) => { removeCtr(d, card, 1); }), { op: 'destroy', s: { t: 'target' } }], { label: 'Remove a Spell Counter: destroy a Spell/Trap', targets: [{ f: ST }], cond: (_d, c) => ctr(c) > 0 }),
    ],
  },
  'Broww, Huntsman of Dark World': { effects: [trig('effDiscarded', run(async ({ d, p, card }) => { await d.draw(p, card.mark.sentBy !== undefined && card.mark.sentBy !== p ? 2 : 1); }), { from: ['gy'] })] },
  'Brron, Mad King of Dark World': { effects: [trig('battleDamage', run(async ({ d, p }) => { const c = await pick(d, p, 'Discard 1 card', d.players[p].hand, 'cost'); if (c) await d.discard(p, [c], p); }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && d.players[c.ctrl].hand.length > 0 })] },
  'Burning Algae': { effects: [trig('toGY', { op: 'heal', who: 'opp', n: 1000 }, { from: ['gy'] })] },
  'Burning Beast': merge(union({ name: 'Freezing Beast' }), {
    effects: [trig('anyBattleDamage', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy a face-up Spell or Trap Card', d.find({ ...ST, faceUp: true }, p), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), {
      cond: (d, c, _p, ev) => c.zone === 'szone' && ev?.e === 'damage' && ev.player !== c.ctrl && !!ev.src && d.equippedTo(c) === ev.src,
    })],
  }),
  'Byser Shock': { effects: [trig('summoned', run(async ({ d }) => { for (const c of [...d.fieldCards(0), ...d.fieldCards(1)].filter((x) => !x.faceUp)) await d.toHand(c); }))] },
  'Caius the Shadow Monarch': {
    effects: [trig('normalSummoned', run(async ({ d, p, o, t }) => {
      const c = t[0];
      if (!c || !d.onField(c)) return;
      const dark = c.def.kind === 'monster' && d.attrOf(c) === 'DARK';
      await d.banish(c, p);
      if (dark) await d.damage(o, 1000);
    }), { cond: (_d, c) => c.mark.tribTurn === c.data.sumTurn && (c.mark.tribCount ?? 0) > 0, targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }] })],
  },
  'Cannon Soldier MK-2': { effects: [ign({ op: 'damage', who: 'opp', n: 1500 }, { label: 'Tribute 2 monsters: 1500 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M, n: 2 } }], req: [{ f: OWN_M, n: 2 }], ai: (d, me) => (d.players[opp(me)].lp <= 1500 ? 5000 : -1) })] },
  'Cannonball Spear Shellfish': { immune: (d, _self, src) => umi(d) && src.def.kind === 'spell' },
  'Card Blocker': {
    effects: [
      trig('summoned', { op: 'pos', s: { t: 'this' }, to: 'def' }),
      quick(run(({ d, card, link }) => { const ev = link.ev; if (ev.e === 'attack') { ev.target = card; d.log(`The attack target becomes ${card.def.name}.`); } }, (d, me, _c, ev) => threat(d, me, ev) / 2), {
        label: 'Become the attack target', when: (_d, ev, p, card) => isAttackOn(ev, p) && !!ev.target && ev.target !== card && ev.target.faceUp,
      }),
      trig('attacked', run(async ({ d, p, card }) => {
        const n = await d.option(p, 'Send cards from the top of your Deck', ['0', '1', '2', '3'], 2);
        await d.mill(p, n, p);
        d.addMod(card, 0, 500 * n);
      }), { optional: true }),
    ],
  },
  'Card Ejector': { effects: [ign({ op: 'banish', s: { t: 'target' } }, { opt: true, label: 'Banish a card from the opponent\'s Graveyard', targets: [{ f: { side: 'opp', zone: 'gy' } }] })] },
  'Card Trooper': {
    effects: [
      ign(run(async ({ d, p, card }) => { const n = 1 + (await d.option(p, 'Send cards from the top of your Deck', ['1', '2', '3'], 2)); await d.mill(p, n, p); d.addMod(card, 500 * n, 0); }, 500), { opt: true, label: 'Mill up to 3: +500 ATK each' }),
      trig('destroyed', { op: 'draw', who: 'self', n: 1 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' }),
    ],
  },
  'Carrierroid': {
    effects: [quick({ op: 'negate' }, {
      label: 'Discard: negate', cost: [{ op: 'discard', who: 'self', n: 1 }],
      when: (_d, ev, p) => ev.e === 'chain' && ev.link.p !== p && ev.link.eff.ops.some((o) => o.op === 'destroy') && ev.link.targets.flat().some((c) => c.ctrl === p && (c.zone === 'szone' || c.zone === 'fzone')),
    })],
  },
  'Castle Gate': {
    rules: ['battleImmune'],
    effects: [ign(run(({ d, o, link }) => d.damage(o, link.data.atk ?? 0), 900), {
      opt: true, label: 'Tribute a Level 5 or lower monster: inflict damage', cond: (_d, c) => c.pos === 'atk',
      cost: [run(async ({ d, p, card, link }) => { const c = await oneOf(d, p, 'Tribute a Level 5 or lower monster', d.monsters(p).filter((x) => x !== card && d.tributeOk(x) && d.lvOf(x) <= 5)); if (c) { link.data.atk = c.def.atk ?? 0; await d.move(c, 'gy', { why: 'tribute' }); } }, 0, (d, p, card) => d.monsters(p).some((x) => x !== card && d.tributeOk(x) && d.lvOf(x) <= 5))],
    })],
  },
  "Cat's Ear Tribe": { auraFn: (d, src, c) => (d.battle && d.tp !== src.ctrl && c.ctrl !== src.ctrl && ((d.battle.att === c && d.battle.tgt === src) || (d.battle.tgt === c && d.battle.att === src)) ? { atk: 200 - d.base(c, 'atk') } : undefined) },
  'Catnipped Kitty': {
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, race: ['Beast'], notThis: true }, src.ctrl, src).length > 0 },
    effects: [ign(run(({ d, t }) => { const c = t[0]; if (c) d.addMod(c, 0, -d.defv(c)); }, 300), { opt: true, label: 'Make a monster\'s DEF 0', targets: [{ f: OPP_FU }] })],
  },
  'Cave Dragon': {
    summonCond: (d, p) => d.monsters(p).length === 0,
    attackCond: (d, c) => d.find({ ...OWN_FU, race: ['Dragon'], notThis: true }, c.ctrl, c).length > 0,
  },
  'Celestia, Lightsworn Angel': {
    effects: [trig('normalSummoned', run(async ({ d, p, o }) => {
      await d.mill(p, 4, p);
      for (const c of await d.select(p, 'Destroy up to 2 cards', d.fieldCards(o), 1, 2, 'bad')) await d.destroy(c, 'effect', undefined, p);
    }), { optional: true, cond: (d, c) => tributed(c).some((n) => n.includes('Lightsworn')) && d.players[c.ctrl].deck.length >= 4 && d.fieldCards(opp(c.ctrl)).length > 0 })],
  },
  'Chain Thrasher': { extraAttacks: (d, c) => d.players[c.ctrl].gy.filter((x) => x.def.name === 'Chain Thrasher').length },
  'Chainsaw Insect': { postBattle: async (d, self) => { await d.draw(opp(self.ctrl), 1); } },
  'Chaos Command Magician': { onTargeted: (d, self, link) => { if (link.card.def.kind === 'monster' && link.targets.flat().length === 1) link.negated = true; } },
  'Chaos Emperor Dragon - Envoy of the End': merge(lightDark(), {
    effects: [ign(run(async ({ d, p, o, card }) => {
      const all = [p, o].flatMap((s) => [...d.players[s].hand, ...d.fieldCards(s)]).filter((c) => c !== card);
      for (const c of all) await d.move(c, 'gy', { by: p });
      const n = all.length;
      await d.move(card, 'gy', { by: p });
      await d.damage(o, 300 * n);
    }, (d, me) => (d.fieldCards(opp(me)).length + d.players[opp(me)].hand.length) * 400 - (d.fieldCards(me).length + d.players[me].hand.length) * 300), { label: 'Pay 1000 LP: send all cards to the Graveyard', cost: [{ op: 'payLP', n: 1000 }] })],
  }),
  'Chaos Necromancer': { statFn: (d, c) => ({ atk: 300 * d.players[c.ctrl].gy.filter((x) => x.def.kind === 'monster').length - d.base(c, 'atk') }) },
  'Chaos Sorcerer': merge(lightDark(), { effects: [ign([{ op: 'banish', s: { t: 'target' } }, { op: 'noAttackSelf' }], { label: 'Banish a face-up monster', opt: true, targets: [{ f: FU }], cond: (d, c) => c.attacks === 0 && (d.phase === 'M1' || d.phase === 'M2') })] }),
  'Chaosrider Gustaph': {
    effects: [ign(run(async ({ d, p, card }) => {
      const cs = await d.select(p, 'Banish up to 2 Spell Cards from your Graveyard', d.players[p].gy.filter((c) => c.def.kind === 'spell'), 1, 2, 'cost');
      for (const c of cs) await d.banish(c, p);
      d.addMod(card, 300 * cs.length, 0, d.turn + 1);
    }, 400), { opt: true, label: 'Banish Spells: gain ATK', req: [{ f: { side: 'self', zone: 'gy', kind: 'spell' } }] })],
  },
  'Charm of Shabti': {
    effects: [quick(run(({ d, p }) => d.addTemp({ until: d.turn, p, lock: { battleDmg: (_d, _s, a, t, n, to) => (to === p && [a, t].some((m) => m && m.ctrl === p && m.def.name.includes("Gravekeeper's")) ? 0 : n) } }), 300), {
      from: ['hand'], label: 'Discard: no battle damage involving Gravekeeper\'s', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })],
    })],
  },
  'Chimaera, the Master of Beasts': { noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === 'Beast' },
  'Chimeratech Fortress Dragon': {
    noNormal: true,
    ssProc: {
      from: ['extra'],
      cond: (d, p) => both(d).some((c) => c.def.name === 'Cyber Dragon') && both(d).some((c) => c.def.race === 'Machine' && c.def.name !== 'Cyber Dragon'),
      cost: [run(async ({ d, p, card }) => {
        const cd = await pick(d, p, 'Send "Cyber Dragon"', both(d).filter((c) => c.def.name === 'Cyber Dragon'), 'cost');
        if (!cd) return;
        const more = await d.select(p, 'Send 1 or more Machine-Type monsters', both(d).filter((c) => c !== cd && c.faceUp && d.raceOf(c) === 'Machine'), 1, 9, 'cost');
        card.mark.matCount = 1 + more.length;
        for (const c of [cd, ...more]) await d.move(c, 'gy', { why: 'fusion', by: p });
      })],
    },
    statFn: (d, c) => ({ atk: 1000 * (c.mark.matCount ?? 0) - d.base(c, 'atk') }),
  },
  'Chimeratech Overdragon': {
    mats: [{ name: 'Cyber Dragon' }, { race: 'Machine', more: true, text: '1 or more Machine-Type monsters' }],
    rules: ['monsterMultiAttack'],
    statFn: (d, c) => ({ atk: 800 * (c.mark.matCount ?? 0) - d.base(c, 'atk'), def: 800 * (c.mark.matCount ?? 0) - d.base(c, 'def') }),
    extraAttacks: (_d, c) => Math.max(0, (c.mark.matCount ?? 1) - 1),
    effects: [trig('specialSummoned', run(async ({ d, p, card }) => { for (const c of d.fieldCards(p).filter((x) => x !== card)) await d.move(c, 'gy', { by: p }); }), { cond: (_d, c) => c.data.how === 'fusion' })],
  },
  'Chiron the Mage': {
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, {
      opt: true, label: 'Discard a Spell: destroy a Spell/Trap', targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }],
      cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'spell' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'spell' } }],
    })],
  },
  'Chopman the Desperate Outlaw': {
    effects: [trig('flipSummoned', run(async ({ d, p, card }) => {
      const e = await pick(d, p, 'Equip an Equip Spell from your Graveyard', d.players[p].gy.filter((c) => c.def.stype === 'equip' && (!c.def.equip?.f || d.match(card, c.def.equip.f, p, c))), 'good');
      if (e) await d.equipCard(e, card, undefined, p);
    }), { optional: true })],
  },
  'Chrysalis Chicky': chrysalis('Chrysalis Chicky'),
  'Chrysalis Dolphin': chrysalis('Chrysalis Dolphin'),
  'Chrysalis Larva': chrysalis('Chrysalis Larva'),
  'Chrysalis Mole': chrysalis('Chrysalis Mole'),
  'Chrysalis Pantail': chrysalis('Chrysalis Pantail'),
  'Chrysalis Pinny': chrysalis('Chrysalis Pinny'),
};
void DECK; void OWN_M; void grantRule; void has; void randomOf;
