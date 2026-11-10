// YGO Online monsters, part 13 (Venom Boa … Zombie Tiger).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, addFrom, attackOf, banishProc, both, contact, ctr, destroyAll, flip, has, ign, isAttackOn, merge, opp, pick, quick, randomOf,
  removeCtr, run, search, spirit, ssFrom, ssPick, threat, tokenDef, tokens, trig, tributed, union, won, atEndPhase,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
const venom = (n: number, noAttack: boolean): Def => ({ effects: [ign([run(({ d, t }) => { if (t[0]) addCtr(d, t[0], n, 'venom'); }, 300), ...(noAttack ? [{ op: 'noAttackSelf' as const }] : [])], { opt: true, label: `Place ${n} Venom Counter${n > 1 ? 's' : ''}`, targets: [{ f: OPP_FU }] })] });
const archfiend = (upkeep: number, hits: number[]): Def => ({
  upkeep,
  onTargeted: async (d, self, link) => { if (link.p === self.ctrl || !hits.includes((await d.die()))) return; link.negated = true; if (link.isCard && d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); },
});
const searchDiscard = (name: string): Def => ({ effects: [ign(search({ name }), { from: ['hand'], label: `Discard: add ${name}`, cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name }) }] })] });
const vehicle = (names: string[], extra: Def = {}): Def => merge(contact(names, 'banished'), { noSpecial: false }, extra);
const yubelCore = (): Def => ({
  rules: ['battleImmune'],
  battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n),
  preBattle: async (d, self, other) => { if (other && d.battle?.tgt === self && self.faceUp && self.pos === 'atk') await d.damage(opp(self.ctrl), d.atk(other), self); },
});

export const MONSTERS_13: Record<string, Def> = {
  'Venom Boa': venom(2, true),
  'Venom Serpent': venom(1, false),
  'Venom Snake': venom(1, true),
  'Victory Dragon': { noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === 'Dragon' },
  'Victory Viper XX03': {
    effects: [trig('destroysByBattle', run(async ({ d, p, card }) => {
      const sts = d.find({ ...ST, faceUp: true }, p);
      const i = await d.option(p, 'Victory Viper XX03', ['Gain 400 ATK', 'Destroy a face-up Spell/Trap', 'Special Summon an Option Token'], sts.length ? 1 : 0);
      if (i === 0) d.addMod(card, 400, 0, -1);
      else if (i === 1) { const c = await pick(d, p, 'Destroy a face-up Spell or Trap Card', sts, 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }
      else await tokens(d, p, tokenDef('Option Token', 'Machine', 'LIGHT', 4, d.atk(card), d.defv(card)), 1, 'atk');
    }))],
  },
  'Vilepawn Archfiend': merge(archfiend(500, [3]), { lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t !== src && t.ctrl === src.ctrl && t.def.name.includes('Archfiend') } }),
  'Viser Des': {
    lock: { indestructible: (_d, src, c, by) => !!src && c === src && by === 'battle' && !src.data.viserDone },
    effects: [trig('standby', run(async ({ d, p, card }) => {
      card.data.viserDone = true;
      const c = await pick(d, p, 'Destroy a monster', d.monsters(opp(p)), 'bad', true);
      if (c) await d.destroy(c, 'effect', undefined, p);
    }), { optional: true, cond: (_d, c) => c.zone === 'mzone' && !c.data.viserDone && (c.data.standbys ?? 0) >= 3 })],
  },
  'Volcanic Blaster': {
    effects: [trig('battleDestroyed', run(async ({ d, p }) => {
      const c = await pick(d, p, 'Place a Volcanic monster on top of your Deck', d.find(DECK({ kind: 'monster', set: 'Volcanic' }), p), 'good');
      if (!c) return;
      await d.shuffleDeck(p);
      const deck = P(d, p).deck; deck.splice(deck.indexOf(c), 1); deck.push(c);
    }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Volcanic Counter': {
    effects: [trig('anyBattleDamage', run(() => {}), { cond: () => false })],
  },
  'Volcanic Doomfire': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'szone', faceUp: true, name: 'Tri-Blaze Accelerator' } } }], req: [{ f: { side: 'self', zone: 'szone', faceUp: true, name: 'Tri-Blaze Accelerator' } }] },
    lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && t !== src },
    effects: [trig('destroysByBattle', run(async ({ d, p, o }) => { let n = 0; for (const c of d.monsters(o)) if (await d.destroy(c, 'effect', undefined, p)) n++; await d.damage(o, 500 * n); }), { cond: (_d, _c) => true })],
  },
  'Volcanic Hammerer': { effects: [ign([run(({ d, p, o }) => d.damage(o, 200 * P(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.name.includes('Volcanic')).length), 400), { op: 'noAttackSelf' }], { opt: true, label: 'Inflict damage' })] },
  'Volcanic Queen': {
    noNormal: true,
    effects: [
      ign(run(async ({ d, p, o, card }) => {
        const t = await pick(d, p, "Tribute an opponent's monster", d.monsters(o).filter((x) => d.tributeOk(x)), 'cost');
        if (!t) return;
        await d.move(t, 'gy', { why: 'tribute' });
        await d.specialSummon(card, o, 'atk', 'special', false, card);
        P(d, p).normalDone = true;
      }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => c.def.atk ?? 0)) - 1500), { from: ['hand'], label: "Tribute an opponent's monster: give them Volcanic Queen", cond: (d, _c, p) => !P(d, p).normalDone && d.monsters(opp(p)).some((x) => d.tributeOk(x)) }),
      ign({ op: 'damage', who: 'opp', n: 1000 }, { opt: true, label: 'Send a card: 1000 damage', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: ['mzone', 'szone', 'fzone'], notThis: true } } }] }),
      trig('endPhase', run(async ({ d, p, card }) => {
        const t = await pick(d, p, 'Tribute 1 other monster (or take 1000 damage)', d.monsters(p).filter((x) => x !== card && d.tributeOk(x)), 'cost', true);
        if (t) await d.move(t, 'gy', { why: 'tribute' }); else await d.damage(p, 1000, card);
      }), { cond: (d, c) => d.tp === c.ctrl }),
    ],
  },
  'Volcanic Rocket': { effects: [trig('summoned', addFrom(['deck', 'gy'], { name: 'Blaze Accelerator' }), { optional: true, cond: (d, c) => d.find({ side: 'self', zone: ['deck', 'gy'], name: 'Blaze Accelerator' }, c.ctrl).length > 0 })] },
  'Volcanic Scattershot': {
    effects: [trig('toGY', run(async ({ d, p, o }) => {
      await d.damage(o, 500);
      const viaBlaze = d.chain.some((l) => l.card.def.name.includes('Blaze Accelerator'));
      const others = d.find({ side: 'self', zone: ['hand', 'deck'], name: 'Volcanic Scattershot' }, p);
      if (viaBlaze && others.length >= 2 && (await d.confirm(p, 'Send 2 Volcanic Scattershots to destroy all opponent monsters?'))) {
        for (const c of others.slice(0, 2)) await d.move(c, 'gy', { by: p });
        for (const c of d.monsters(o)) await d.destroy(c, 'effect', undefined, p);
      }
    }), { from: ['gy'] })],
  },
  'Volcanic Shell': { effects: [ign(search({ name: 'Volcanic Shell' }), { from: ['gy'], opt: true, label: 'Pay 500 LP: add a Volcanic Shell', cost: [{ op: 'payLP', n: 500 }], req: [{ f: DECK({ name: 'Volcanic Shell' }) }] })] },
  'Volcanic Slicer': { effects: [ign([{ op: 'damage', who: 'opp', n: 500 }, { op: 'noAttackSelf' }], { opt: true, label: 'Inflict 500 damage' })] },
  'Voltanis the Adjudicator': {
    effects: [quick(run(async ({ d, p, o, card }) => {
      const fairies = d.monsters(p).filter((c) => d.raceOf(c) === 'Fairy').length;
      for (const c of d.monsters(p)) await d.move(c, 'gy', { why: 'tribute' });
      if (card.zone !== 'hand' || !(await d.specialSummon(card, p, await d.askPos(p, card)))) return;
      for (const c of await d.select(p, `Destroy up to ${fairies} cards`, d.fieldCards(o), 0, fairies, 'bad')) await d.destroy(c, 'effect', undefined, p);
    }, 1500), { from: ['hand'], label: 'Tribute all monsters: Special Summon Voltanis', when: (d, ev, p) => ev.e === 'chain' && ev.link.p === p && ev.link.isCard && ev.link.card.def.kind === 'trap' && ev.link.card.def.stype === 'counter' && d.monsters(p).length > 0 })],
  },
  'Voltic Kong': { effects: [trig('battleDamage', run(({ d, p, o }) => d.mill(o, d.find({ ...OWN_FU, attr: 'LIGHT' }, p).length, p)), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] },
  'Vortex Trooper': {
    effects: [
      trig('normalSummoned', run(async ({ d, p }) => { const cs = await d.select(p, 'Shuffle 2 cards into your Deck', P(d, p).hand, 2, 2, 'cost'); for (const c of cs) await d.move(c, 'deck'); await d.shuffleDeck(p); await d.draw(p, 2); }), { optional: true, cond: (d, c) => P(d, c.ctrl).hand.length >= 2 }),
      trig('destroyed', { op: 'draw', who: 'self', n: 1 }, { from: ['gy', 'banished', 'hand', 'deck', 'extra'] }),
    ],
  },
  'VW-Tiger Catapult': vehicle(['V-Tiger Jet', 'W-Wing Catapult'], { effects: [ign(run(async ({ d, t }) => { if (t[0]) await d.changePos(t[0], 'swap', false); }, 400), { label: 'Discard: change a monster\'s battle position', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: OPP_M }] })] }),
  'VWXYZ-Dragon Catapult Cannon': vehicle(['VW-Tiger Catapult', 'XYZ-Dragon Cannon'], {
    effects: [
      ign({ op: 'banish', s: { t: 'target' } }, { opt: true, label: 'Banish a card', targets: [{ f: { side: 'opp' } }] }),
      trig('attacks', run(async ({ d, link }) => { const ev = attackOf(link.ev); if (ev?.target) await d.changePos(ev.target, 'swap', false); }), { optional: true, cond: (_d, _c, _p, ev) => ev?.e === 'attack' && !!ev.target }),
    ],
  }),
  'W-Wing Catapult': union({ name: 'V-Tiger Jet' }, 400, 400),
  'Wandering Mummy': {
    effects: [ign(run(async ({ d, p, card }) => {
      card.pos = 'def';
      await d.setFaceDown(card);
      const downs = d.monsters(p).filter((c) => !c.faceUp);
      const slots = downs.map((c) => c.slot);
      for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(d.rng() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
      downs.forEach((c, i) => { P(d, p).m[slots[i]] = c; c.slot = slots[i]; });
    }, -1), { opt: true, label: 'Flip face-down and shuffle', cond: (d, c) => c.faceUp && (d.phase === 'M1' || d.phase === 'M2') })],
  },
  'Warrior Lady of the Wasteland': { effects: [trig('battleDestroyed', ssFrom(['deck'], { attr: 'EARTH', race: ['Warrior'], fn: (_d, c) => (c.def.atk ?? 0) <= 1500 }, { pos: 'atk' }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Warrior of Atlantis': searchDiscard('A Legendary Ocean'),
  'Watapon': {
    onMove: async (d, src, c, from, to) => { void d; void src; void c; void from; void to; },
    effects: [trig('anyToGY', run(() => {}), { cond: () => false })],
  },
  'Water Dragon': {
    noNormal: true,
    auraFn: (d, _src, c) => (d.attrOf(c) === 'FIRE' || d.raceOf(c) === 'Pyro' ? { atk: -d.atk(c) } : undefined),
    effects: [trig('destroyed', run(async ({ d, p }) => {
      for (const [n, k] of [['Hydrogeddon', 2], ['Oxygeddon', 1]] as const) for (const c of P(d, p).gy.filter((x) => x.def.name === n).slice(0, k)) if (d.canSpecial(p, c)) await d.specialSummon(c, p, await d.askPos(p, c));
    }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Whirlwind Prodigy': { doubleTribute: (_d, t) => t.def.attr === 'WIND' },
  'Whirlwind Weasel': { effects: [flip(run(({ d, o }) => d.addTemp({ until: d.turn, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind !== 'monster' } }), 300))] },
  'White Magician Pikeru': { effects: [trig('standby', run(({ d, p }) => d.heal(p, 400 * d.monsters(p).length)), { cond: (_d, c) => c.zone === 'mzone' })] },
  'White Night Dragon': {
    onTargeted: async (d, self, link) => { if (link.isCard && link.card.def.kind !== 'monster') { link.negated = true; link.activationNegated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
    effects: [quick(run(({ d, card, link }) => { const ev = attackOf(link.ev); if (ev) { ev.target = card; d.log(`The attack target becomes ${card.def.name}.`); } }, (d, me, _c, ev) => threat(d, me, ev) / 2), {
      label: 'Send a Spell/Trap: become the attack target', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', st: true, zone: ['szone', 'fzone'] } } }],
      when: (_d, ev, p, card) => isAttackOn(ev, p) && !!ev.target && ev.target !== card && ev.target.faceUp,
    })],
  },
  'White Ninja': { effects: [flip({ op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { ...M, pos: 'def' } }] })] },
  'White-Horned Dragon': { effects: [trig(['normalSummoned', 'specialSummoned'], run(async ({ d, p, o, card }) => { const cs = await d.select(p, 'Banish up to 5 Spell Cards', P(d, o).gy.filter((c) => c.def.kind === 'spell'), 0, 5, 'bad'); for (const c of cs) await d.banish(c, p); d.addMod(card, 300 * cs.length, 0, -1); }))] },
  'Wind Effigy': { doubleTribute: (_d, t) => t.def.attr === 'WIND' && t.def.mtype === 'normal' },
  'Winged Kuriboh': { effects: [trig('fieldToGY', run(({ d, card }) => d.addTemp({ until: d.turn, tag: 'noBattleDmg', p: card.owner })), { from: ['gy'], cond: (_d, c) => c.mark.destroyedTurn !== undefined })] },
  'Winged Kuriboh LV10': {
    noNormal: true,
    effects: [quick(run(async ({ d, p, o }) => {
      const cs = d.find({ ...OPP_FU, pos: 'atk' }, p);
      const n = cs.reduce((s, c) => s + (c.def.atk ?? 0), 0);
      for (const c of cs) await d.destroy(c, 'effect', undefined, p);
      await d.damage(o, n);
    }, (d, me) => d.find({ ...OPP_FU, pos: 'atk' }, me).reduce((s, c) => s + (c.def.atk ?? 0), 0)), { label: 'Tribute: destroy all Attack Position monsters', cost: [{ op: 'tribute', s: { t: 'this' } }], cond: (d, c) => d.phase === 'BP' && d.tp !== c.ctrl })],
  },
  'Winged Minion': { effects: [ign(run(({ d, t }) => { if (t[0]) d.addMod(t[0], 700, 700, -1); }, 500), { label: 'Tribute: a Fiend gains 700 ATK/DEF', cost: [{ op: 'tribute', s: { t: 'this' } }], targets: [{ f: { ...FU, race: ['Fiend'], notThis: true }, good: true }] })] },
  'Winged Rhynos': { effects: [quick({ op: 'toHand', s: { t: 'this' } }, { label: 'Return to the hand', on: ['activateTrap'], ai: (d, me, _c, ev) => (ev.e === 'chain' ? 300 : -1) })] },
  'Winged Sage Falcos': { effects: [trig('destroysByBattle', run(async ({ d, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy') await d.move(o, 'deck'); }), { optional: true, cond: (_d, c) => true })] },
  'Witch Doctor of Chaos': { effects: [flip({ op: 'banish', s: { t: 'target' } }, { targets: [{ f: GY_M('any') }] })] },
  'Witch Doctor of Sparta': { onSummon: async (d, src, c, how) => { if (how === 'special' && c.data.from === 'deck') await d.damage(opp(src.ctrl), 500, src); } },
  'Woodland Sprite': { effects: [ign({ op: 'damage', who: 'opp', n: 500 }, { label: 'Send an Equip Card: 500 damage', cost: [run(async ({ d, p, card }) => { const e = await pick(d, p, 'Send an Equip Card', d.equipsOf(card), 'cost'); if (e) await d.move(e, 'gy', { by: p, why: 'cost' }); }, 0, (d, _p, card) => d.equipsOf(card).length > 0)] })] },
  'Wroughtweiler': {
    effects: [trig('battleDestroyed', run(async ({ d, p }) => {
      const h = await pick(d, p, 'Add an Elemental Hero card', P(d, p).gy.filter((c) => c.def.name.includes('Elemental Hero')), 'good');
      const poly = P(d, p).gy.find((c) => c.def.name === 'Polymerization');
      if (h) await d.toHand(h);
      if (poly) await d.toHand(poly);
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Wulf, Lightsworn Beast': { noNormal: true, effects: [trig('toGY', run(async ({ d, card }) => { if (card.zone === 'gy' && d.canSpecial(card.owner, card)) { card.properly = true; await d.specialSummon(card, card.owner, await d.askPos(card.owner, card)); } }), { from: ['gy'], cond: (_d, c) => c.mark.from === 'deck' })] },
  'Wynn the Wind Charmer': { effects: [flip(run(async ({ d, p, card, t }) => { if (t[0]) await d.takeControl(t[0], p, true, card); }, 1000), { targets: [{ f: { ...OPP_FU, attr: 'WIND' } }] })] },
  'XY-Dragon Cannon': vehicle(['X-Head Cannon', 'Y-Dragon Head'], { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard: destroy a face-up Spell/Trap', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'], faceUp: true } }] })] }),
  'XYZ-Dragon Cannon': vehicle(['X-Head Cannon', 'Y-Dragon Head', 'Z-Metal Tank'], { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard: destroy a card', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'opp' } }] })] }),
  'XZ-Tank Cannon': vehicle(['X-Head Cannon', 'Z-Metal Tank'], { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard: destroy a Set Spell/Trap', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'opp', zone: ['szone', 'fzone'], faceUp: false } }] })] }),
  'Y-Dragon Head': union({ name: 'X-Head Cannon' }, 400, 400),
  'Yamata Dragon': spirit(trig('battleDamage', run(({ d, p }) => d.draw(p, Math.max(0, 5 - P(d, p).hand.length))), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })),
  'Yata-Garasu': spirit(trig('battleDamage', run(({ d, o }) => { d.flag('skipDraw', o); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })),
  'Yellow Gadget': { effects: [trig(['normalSummoned', 'specialSummoned'], search({ name: 'Green Gadget' }), { optional: true })] },
  'Yomi Ship': { effects: [trig('battleDestroyed', run(async ({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'mzone') await d.destroy(o, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Yubel': merge(yubelCore(), {
    effects: [
      trig('endPhase', run(async ({ d, p, card }) => { const t = await pick(d, p, 'Tribute 1 monster (or Yubel is destroyed)', d.monsters(p).filter((x) => x !== card && d.tributeOk(x)), 'cost', true); if (t) await d.move(t, 'gy', { why: 'tribute' }); else { card.mark.selfDestroy = true; await d.destroy(card, 'effect', undefined, p); } }), { cond: (d, c) => d.tp === c.ctrl }),
      trig('destroyed', ssFrom(['hand', 'deck', 'gy'], { name: 'Yubel - Terror Incarnate' }, { ignore: true }), { optional: true, from: ['gy'], cond: (_d, c) => !c.mark.selfDestroy }),
    ],
  }),
  'Yubel - Terror Incarnate': merge(yubelCore(), {
    noNormal: true,
    effects: [
      trig('endPhase', run(async ({ d, p, card }) => { for (const c of both(d).filter((x) => x !== card)) await d.destroy(c, 'effect', undefined, p); }), { cond: (d, c) => d.tp === c.ctrl }),
      trig('leftField', ssFrom(['hand', 'deck', 'gy'], { name: 'Yubel - The Ultimate Nightmare' }, { ignore: true }), { optional: true, cond: (_d, c) => !!c.mark.lastFaceUp }),
    ],
  }),
  'Yubel - The Ultimate Nightmare': {
    noNormal: true, rules: ['battleImmune'],
    battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n),
    preBattle: async (d, self, other) => { if (other && self.faceUp && self.pos === 'atk') await d.damage(opp(self.ctrl), d.atk(other), self); },
    postBattle: async (d, self, o) => { if (o && o.zone === 'mzone' && self.pos === 'atk') await d.destroy(o, 'effect', undefined, self.ctrl); },
  },
  'YZ-Tank Dragon': vehicle(['Y-Dragon Head', 'Z-Metal Tank'], { effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Discard: destroy a face-down monster', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { ...OPP_M, faceUp: false } }] })] }),
  'Z-Metal Tank': union({ name: ['X-Head Cannon', 'Y-Dragon Head'] }, 600, 600),
  'Zaborg the Thunder Monarch': { effects: [trig('normalSummoned', { op: 'destroy', s: { t: 'target' } }, { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0, targets: [{ f: M }] })] },
  'Zeradias, Herald of Heaven': merge(searchDiscard('The Sanctuary in the Sky'), { selfDestructIf: (d) => !d.active('The Sanctuary in the Sky') }),
  'Zeta Reticulant': {
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, name: 'Eva Token' } } }], req: [{ f: { ...OWN_M, name: 'Eva Token' } }] },
  },
  'Zolga': { effects: [trig('toGY', { op: 'heal', who: 'self', n: 2000 }, { from: ['gy'], cond: (d, c) => c.mark.lastWhy === 'tribute' && d.monsters(c.owner).some((m) => m.data.sumTurn === d.turn && (m.mark.tribs ?? []).includes(c.def.name)) })] },
  'Zombie Master': { effects: [ign(ssFrom(['gy'], { race: ['Zombie'], maxLv: 4 }, { side: 'any' }), { opt: true, label: 'Send a monster: Special Summon a Zombie', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster' } } }], req: [{ f: { side: 'any', zone: 'gy', kind: 'monster', race: ['Zombie'], maxLv: 4 } }] })] },
  'Zombie Tiger': merge(union({ name: 'Decayed Commander' }, 500, 500), {
    effects: [trig('anyToGY', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }), { cond: (d, c, _p, ev) => c.zone === 'szone' && ev?.e === 'sent' && ev.why === 'battle' && ev.ctrl !== c.ctrl && !!d.battle && [d.battle.att, d.battle.tgt].includes(d.equippedTo(c) ?? null) })],
  }),
};

// Volcanic Counter: from the Graveyard, when you take battle damage, banish it and inflict the same damage (with another FIRE monster in the Graveyard).
MONSTERS_13['Volcanic Counter'] = {
  effects: [quick(run(async ({ d, p, o, card, link }) => {
    const ev = link.ev;
    if (ev.e !== 'damage' || card.zone !== 'gy') return;
    await d.banish(card, p);
    if (P(d, p).gy.some((c) => c.def.kind === 'monster' && c.def.attr === 'FIRE' && c.def.name !== 'Volcanic Counter')) await d.damage(o, ev.n, card);
  }, 1200), { from: ['gy'], label: 'Banish: reflect the battle damage', when: (_d, ev, p) => ev.e === 'damage' && ev.battle && ev.player === p })],
};
// Watapon: Special Summon it when an effect adds it from the Deck to the hand.
MONSTERS_13['Watapon'] = {
  effects: [quick(run(async ({ d, p, card }) => { if (card.zone === 'hand' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card)); }, 400), {
    from: ['hand'], label: 'Special Summon Watapon', when: (d, ev, p) => ev.e === 'chain' && ev.link.p === p && d.players[p].hand.some((c) => c.def.name === 'Watapon' && c.mark.from === 'deck' && c.turnIn === d.turn),
  })],
};
// Zeta Reticulant: from the Graveyard, Eva Tokens when opponent monsters are banished.
MONSTERS_13['Zeta Reticulant'].gyOnMove = async (d, src, c, from, to) => {
  if (to === 'banished' && from === 'mzone' && c.def.kind === 'monster' && c.owner !== src.owner) await tokens(d, src.owner, tokenDef('Eva Token', 'Fiend', 'DARK', 2, 500, 500), 1, 'atk');
};
void tributed; void ctr; void removeCtr; void destroyAll; void banishProc; void has; void atEndPhase; void won; void OWN_FU; void quick;
