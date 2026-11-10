// YGO Online monsters, part 1 (3-Hump Lacooda … B.E.S. Covered Core).
import {
  type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, arcanaFlip, banishProc, both, contact, ctr, destroyAll, flip, giveToHand, grantRule, has, heads, ign, isAlien, isAttackOn,
  lvUp, markKill, merge, noSTOnAttack, opp, pick, pickSeen, placeA, quick, randomOf, removeA, removeCtr, run, search, spirit, ssFrom,
  ssPick, tails, threat, tokenDef, tokens, trig, tributed, union, won, umi,
} from './olib';

const amazon = (c: Card) => c.def.name.includes('Amazoness') || c.def.name === 'Amazon Archer';
const foeOf = (d: Duel, c: Card) => (d.battle ? (d.battle.att === c ? d.battle.tgt : d.battle.tgt === c ? d.battle.att : null) : null);
const toTopFromDeck = (f: (c: Card) => boolean, label: string) => flip(run(async ({ d, p }) => {
  const c = await pick(d, p, label, d.players[p].deck.filter(f), 'good');
  if (!c) return;
  if (d.active('Necrovalley') && (await d.confirm(p, `Add ${c.def.name} to your hand instead?`))) { await d.toHand(c); await d.shuffleDeck(p); return; }
  await d.shuffleDeck(p);
  const deck = d.players[p].deck;
  deck.splice(deck.indexOf(c), 1);
  deck.push(c);
  d.log(`${d.name(p)} places a card on top of the Deck.`);
}, 300));
/** Allure Queen: equip 1 opponent monster (Level ≤ max); it is destroyed instead of this card in battle. */
const allure = (max: number, next?: string, from?: string): Def => {
  const eqd = (d: Duel, c: Card) => d.equipsOf(c).find((e) => e.uid === c.data.allure);
  return {
    battleSub: (d, c) => eqd(d, c),
    effects: [
      ign(run(async ({ d, p, card, t }) => { const m = t[0]; if (m && m.zone === 'mzone' && (await d.equipCard(m, card, {}, p))) card.data.allure = m.uid; }, (d, me) => Math.max(-1, ...d.monsters(opp(me)).map((c) => (c.def.atk ?? 0)))), {
        opt: true, label: 'Equip an opponent\'s monster', targets: [{ f: { ...OPP_M, fn: (dd, c) => (c.faceUp ? dd.lvOf(c) : c.def.lv ?? 0) <= max } }],
        cond: (d, c) => !eqd(d, c) && (!from || c.data.ssBy === from) && (d.phase === 'M1' || d.phase === 'M2'),
      }),
      ...(next ? [trig('standby', run(async ({ d, p, card }) => {
        if (card.zone !== 'mzone') return;
        await d.move(card, 'gy', { why: 'cost' });
        await ssPick(d, p, d.find({ side: 'self', zone: ['hand', 'deck'], name: next }, p), `Special Summon ${next}`, undefined, true, card);
      }, 1200), { optional: true, cond: (d, c) => c.zone === 'mzone' && !!eqd(d, c) && d.find({ side: 'self', zone: ['hand', 'deck'], name: next }, c.ctrl).length > 0 })] : []),
    ],
  };
};

export const MONSTERS_1: Record<string, Def> = {
  '3-Hump Lacooda': { effects: [ign([{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: '3-Hump Lacooda' }, n: 2 } }, { op: 'draw', who: 'self', n: 3 }], { label: 'Tribute 2 Lacoodas: draw 3', req: [{ f: { ...OWN_FU, name: '3-Hump Lacooda' }, n: 3 }] })] },
  '8-Claws Scorpion': {
    effects: [ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (_d, c) => c.faceUp })],
    preBattle: (d, self, other) => { if (d.battle?.att === self && other && !other.faceUp && other.pos === 'def') d.addMod(self, 2400 - d.atk(self), 0, d.turn, 'attack'); },
  },
  'A Cat of Ill Omen': { effects: [toTopFromDeck((c) => c.def.kind === 'trap', 'Place a Trap Card on top of your Deck')] },
  'A Man with Wdjat': {
    effects: [trig(['normalSummoned', 'standby'], run(async ({ d, p, o }) => {
      const c = await pick(d, p, 'Look at a Set card', d.fieldCards(o).filter((x) => !x.faceUp && x.zone !== 'mzone'), 'good');
      if (c) await d.reveal(p, [c], 'Set card');
    }), { cond: (d, c) => d.fieldCards(opp(c.ctrl)).some((x) => !x.faceUp && x.zone !== 'mzone') })],
  },
  'A-Team: Trap Disposal Unit': { effects: [quick({ op: 'negate' }, { label: 'Tribute: negate a Trap', cost: [{ op: 'tribute', s: { t: 'this' } }], on: ['activateTrap'], ai: 800 })] },
  'Abaki': { effects: [trig('battleDestroyed', { op: 'damage', who: 'both', n: 500 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Abare Ushioni': { effects: [ign(run(async ({ d, p, o }) => { await d.damage((await d.call(p)) ? o : p, 1000); }, 0), { opt: true, label: 'Call a coin toss' })] },
  'Absorbing Kid from the Sky': { effects: [trig('destroysByBattle', run(({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy') return d.heal(p, 300 * (o.def.lv ?? 0)); }), { cond: (_d, _c, _p) => true })] },
  'Abyss Soldier': { effects: [ign({ op: 'toHand', s: { t: 'target' } }, { opt: true, label: 'Discard a WATER monster: bounce a card', targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }], cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WATER' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WATER' } }] })] },
  'Abyssal Kingshark': {
    lock: {
      indestructible: (d, src, c, by) => {
        if (!src || c !== src || by !== 'effect' || src.data.kingshark === d.turn) return false;
        const top = d.chain[d.chain.length - 1];
        if (top && top.targets.flat().includes(src)) return false;
        src.data.kingshark = d.turn;
        return true;
      },
    },
  },
  'Adhesive Explosive': {
    preBattle: async (d, self, other) => {
      if (!other || d.battle?.tgt !== self || self.faceUp || self.pos !== 'def') return false;
      self.faceUp = true;
      if (!(await d.equipCard(self, other, {}, self.ctrl))) return false;
      const mv = other.mv, foe = other.ctrl;
      d.schedule({ at: 'SP', side: foe, fn: async () => { if (other.mv === mv && other.zone === 'mzone') await d.destroy(other, 'effect', undefined, self.owner); } });
      return true;
    },
  },
  'Agido': {
    effects: [trig('battleDestroyed', run(async ({ d, p }) => {
      const n = (await d.die());
      await ssPick(d, p, d.find({ ...GY_M('self'), race: ['Fairy'], fn: (_d, c) => (n === 6 ? (c.def.lv ?? 0) >= 6 : c.def.lv === n) }, p), 'Special Summon a Fairy');
    }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })],
  },
  'Airknight Parshath': { rules: ['pierce'], effects: [trig('battleDamage', { op: 'draw', who: 'self', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] },
  'Alien Grey': {
    effects: [flip(run(({ d, p }) => placeA(d, p, 1)), { req: [{ f: OPP_FU }] }), trig('battleDestroyed', { op: 'draw', who: 'self', n: 1 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && !!c.mark.flipped })],
  },
  'Alien Hunter': { postBattle: (d, self, o, r) => { if (o && won(self, r) && (o.last.ctr?.A ?? o.data.ctr?.A ?? 0) > 0 && self.data.hunter !== d.turn) { self.data.hunter = d.turn; self.data.extraAtk = d.turn; } } },
  'Alien Hypno': {
    effects: [
      ign(run(async ({ d, p, card, t }) => { if (t[0]) await d.takeControl(t[0], p, true, card); }, (d, me) => Math.max(-1, ...d.find(OPP_FU, me).filter((c) => ctr(c, 'A') > 0).map((c) => d.atk(c)))), { label: 'Take control of a monster with an A-Counter', targets: [{ f: { ...OPP_FU, fn: (_d, c) => ctr(c, 'A') > 0 } }] }),
      trig('endPhase', run(async ({ d, p, card }) => { for (const m of d.monsters(p).filter((x) => x.data.heldBy === card.uid)) { removeA(d, m, 1); if (ctr(m, 'A') === 0) await d.destroy(m, 'effect', undefined, p); } }), { cond: (d, c) => d.tp === c.ctrl }),
    ],
  },
  'Alien Infiltrator': {
    effects: [ign(run(async ({ d, p, card }) => {
      const P = d.players[p];
      const to = [card.slot - 1, card.slot + 1].find((i) => i >= 0 && i < 5 && !P.m[i]);
      if (to === undefined) return;
      P.m[card.slot] = null; P.m[to] = card; card.slot = to;
      await d.emit({ t: 'move', card, from: 'mzone', to: 'mzone' });
    }, -1), { opt: true, label: 'Move to an adjacent zone', cond: (d, c) => [c.slot - 1, c.slot + 1].some((i) => i >= 0 && i < 5 && !d.players[c.ctrl].m[i]) })],
    ruleIf: { direct: (d, c) => !d.players[opp(c.ctrl)].m[4 - c.slot] && !d.players[opp(c.ctrl)].s[4 - c.slot] },
  },
  'Alien Mars': { negateFn: (_d, _s, c) => c.zone === 'mzone' && c.def.mtype === 'effect' && c.def.name !== 'Alien Mars' && ctr(c, 'A') > 0 },
  'Alien Mother': {
    postBattle: (d, self, o, r) => {
      if (!o || !won(self, r) || (o.last.ctr?.A ?? 0) <= 0) return;
      const p = self.ctrl, mv = o.mv;
      d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (o.mv === mv && o.zone === 'gy' && d.canSpecial(p, o) && (await d.specialSummon(o, p, 'atk', 'special', false, self))) { self.data.brood = [...(self.data.brood ?? []), o.uid]; } } });
    },
    effects: [trig('leftField', run(async ({ d, card }) => { for (const u of card.last.brood ?? []) { const m = d.byUid(u); if (m && m.zone === 'mzone') await d.destroy(m, 'effect', undefined, card.owner); } }))],
  },
  'Alien Psychic': {
    effects: [trig(['normalSummoned', 'flipSummoned'], { op: 'pos', s: { t: 'this' }, to: 'def' })],
    lock: { attack: (_d, _s, a) => ctr(a, 'A') > 0 },
  },
  'Alien Skull': {
    effects: [{ type: 'ignition', from: ['hand'], label: "Tribute an opponent's Level 3 or lower monster", ai: 800,
      cond: (d, c, p) => !d.players[p].normalDone && d.find({ ...OPP_FU, maxLv: 3 }, p).some((x) => d.tributeOk(x)) && d.freeSlot(opp(p), 'm') >= -1,
      ops: [run(async ({ d, p, o, card }) => {
        const t = await pick(d, p, "Tribute an opponent's monster", d.find({ ...OPP_FU, maxLv: 3 }, p).filter((x) => d.tributeOk(x)), 'cost');
        if (!t) return;
        await d.move(t, 'gy', { why: 'tribute' });
        if (await d.specialSummon(card, o, await d.askPos(p, card), 'special', false, card)) addCtr(d, card, 1, 'A');
        d.players[p].normalDone = true;
      })] }],
  },
  'Alien Telepath': {
    effects: [ign(run(async ({ d, p, t }) => {
      const a = await pick(d, p, 'Remove an A-Counter', d.find({ ...OPP_FU, fn: (_d, c) => ctr(c, 'A') > 0 }, p), 'bad');
      if (a && removeA(d, a, 1) && t[0]) await d.destroy(t[0], 'effect', undefined, p);
    }, 600), { opt: true, label: 'Remove an A-Counter: destroy a Spell/Trap', targets: [{ f: ST }], req: [{ f: { ...OPP_FU, fn: (_d, c) => ctr(c, 'A') > 0 } }] })],
  },
  'Alien Warrior': { effects: [trig('battleDestroyed', run(({ d, link }) => { const o = link.trig?.other; if (o && o.zone === 'mzone') addCtr(d, o, 2, 'A'); }), { from: ['gy'] })] },
  'Alkana Knight Joker': {
    effects: [quick(run(async ({ d, p, link }) => {
      const ev = link.ev;
      if (ev.e !== 'chain') return;
      const kind = ev.link.card.def.kind;
      const c = await pick(d, p, `Discard a ${kind} card`, d.players[p].hand.filter((x) => x.def.kind === kind), 'cost');
      if (!c) return;
      await d.discard(p, [c], null);
      ev.link.negated = true;
    }, 900), { opt: true, label: 'Discard: negate an effect targeting this card', when: (d, ev, p, card) => ev.e === 'chain' && ev.link.targets.flat().includes(card) && d.players[p].hand.some((x) => x.def.kind === ev.link.card.def.kind) })],
  },
  'Allure Queen LV3': allure(3, 'Allure Queen LV5'),
  'Allure Queen LV5': allure(5, 'Allure Queen LV7', 'Allure Queen LV3'),
  'Allure Queen LV7': allure(12, undefined, 'Allure Queen LV5'),
  'Amazoness Blowpiper': { effects: [trig('standby', run(async ({ d, p }) => { const c = await pick(d, p, 'Select a monster to lose 500 ATK', d.find(OPP_FU, p), 'bad'); if (c) d.addMod(c, -500, 0); }), { cond: (d, c) => d.find(OPP_FU, c.ctrl).length > 0 })] },
  'Amazoness Chain Master': {
    effects: [trig('battleDestroyed', run(async ({ d, p, o }) => {
      if (d.players[p].lp <= 1500 || !(await d.confirm(p, 'Pay 1500 LP to take a monster from your opponent\'s hand?'))) return;
      await d.changeLP(p, -1500, true);
      const c = await pickSeen(d, p, "Take a Monster Card from your opponent's hand", d.players[o].hand.filter((x) => x.def.kind === 'monster'), 'good');
      if (c) await giveToHand(d, c, p);
    }), { from: ['gy'], cond: (d, c) => c.zone === 'gy' && d.players[opp(c.owner)].hand.length > 0 })],
  },
  'Amazoness Fighter': { battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n) },
  'Amazoness Paladin': { statFn: (d, c) => ({ atk: 100 * d.find({ ...OWN_FU, fn: (_d, x) => amazon(x) }, c.ctrl).length }) },
  'Amazoness Swords Woman': { battleDmg: (d, self, _o, n, to) => { if (to !== self.ctrl) return n; d.deferred.push(() => d.damage(opp(to), n, self, true)); return 0; } },
  'Amazoness Tiger': {
    summonCond: (d, p) => !has(d, p, 'Amazoness Tiger'),
    statFn: (d, c) => ({ atk: 400 * d.find({ ...OWN_FU, fn: (_d, x) => amazon(x) }, c.ctrl).length }),
    lock: { target: (_d, src, a, t) => !!src && a.ctrl !== src.ctrl && !!t && t !== src && t.ctrl === src.ctrl && amazon(t) },
  },
  'Ambulance Rescueroid': {
    noNormal: true,
    effects: [trig('anyToGY', run(async ({ d, p, link }) => { const ev = link.ev; if (ev.e === 'sent' && ev.card.zone === 'gy' && d.canSpecial(p, ev.card)) await d.specialSummon(ev.card, p, 'def'); }, 600), {
      optional: true, opt: true, cond: (_d, c, _p, ev) => ev?.e === 'sent' && ev.why === 'battle' && ev.ctrl === c.ctrl && ev.from === 'mzone',
    })],
  },
  'Ambulanceroid': {
    onMove: async (d, src, c, from, to) => {
      if (from !== 'gy' || to !== 'hand' || !c.def.name.includes('roid') || c.owner !== src.ctrl || !d.canSpecial(src.ctrl, c)) return;
      if (await d.confirm(src.ctrl, `Special Summon ${c.def.name}?`, c)) await d.specialSummon(c, src.ctrl, await d.askPos(src.ctrl, c));
    },
  },
  'Amphibious Bugroth MK-3': { ruleIf: { direct: (d) => umi(d) } },
  'An Owl of Luck': { effects: [toTopFromDeck((c) => c.def.stype === 'field', 'Place a Field Spell on top of your Deck')] },
  'Ancient Gear': { ssProc: { cond: (d, p) => has(d, p, 'Ancient Gear') } },
  'Ancient Gear Beast': {
    noSpecial: true,
    lock: noSTOnAttack(),
    postBattle: (d, self, o, r) => { if (o && won(self, r)) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } },
  },
  'Ancient Gear Cannon': {
    effects: [ign([{ op: 'damage', who: 'opp', n: 500 }, run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (dd, _s, _p, c) => dd.phase === 'BP' && c.def.kind === 'trap' } }))], { label: 'Tribute: 500 damage', cost: [{ op: 'tribute', s: { t: 'this' } }], ai: (d, me) => (d.players[opp(me)].lp <= 500 ? 5000 : -1) })],
  },
  'Ancient Gear Engineer': {
    lock: noSTOnAttack(),
    postBattle: async (d, self, _o, r) => { if (r.att === self) { const c = await pick(d, self.ctrl, 'Destroy a Spell or Trap Card', d.find({ side: 'opp', st: true, zone: ['szone', 'fzone'] }, self.ctrl), 'bad'); if (c) await d.destroy(c, 'effect', undefined, self.ctrl); } },
    onTargeted: async (d, self, link) => { if (link.isCard && link.card.def.kind === 'trap' && !d.negated(self)) { link.negated = true; if (d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); } },
  },
  'Ancient Gear Gadjiltron Chimera': {
    statFn: (_d, c) => (tributed(c).includes('Green Gadget') ? { atk: 300 } : undefined),
    effects: [
      trig('battleDamage', { op: 'damage', who: 'opp', n: 500 }, { cond: (_d, c, _p, ev) => tributed(c).includes('Red Gadget') && ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl }),
      trig('destroysByBattle', { op: 'damage', who: 'opp', n: 700 }, { cond: (_d, c) => tributed(c).includes('Yellow Gadget') }),
    ],
  },
  'Ancient Gear Gadjiltron Dragon': {
    lock: noSTOnAttack(),
    ruleIf: { pierce: (_d, c) => tributed(c).includes('Green Gadget') },
    effects: [
      trig('battleDamage', { op: 'damage', who: 'opp', n: 400 }, { cond: (_d, c, _p, ev) => tributed(c).includes('Red Gadget') && ev?.e === 'damage' && ev.player !== c.ctrl }),
      trig('destroysByBattle', { op: 'damage', who: 'opp', n: 600 }, { cond: (_d, c) => tributed(c).includes('Yellow Gadget') }),
    ],
  },
  'Ancient Gear Golem': { noSpecial: true, rules: ['pierce'], lock: noSTOnAttack() },
  'Ancient Gear Knight': { lock: noSTOnAttack() },
  'Ancient Gear Soldier': { lock: noSTOnAttack() },
  'Andro Sphinx': {
    ssProc: { cond: (d, p) => d.active('Pyramid of Light', p), cost: [{ op: 'payLP', n: 500 }] },
    attackCond: (d, c) => c.data.sumTurn !== d.turn,
    postBattle: async (d, self, o, r) => { if (o && won(self, r) && o.mark.lastPos === 'def') await d.damage(opp(self.ctrl), Math.floor((o.def.atk ?? 0) / 2)); },
  },
  'Angel O7': { lock: { activate: (d, src, _p, c) => !!src && src.data.how === 'normal' && src.mark.tribTurn === src.data.sumTurn && c.def.kind === 'monster' && c.def.mtype === 'effect' && c !== src } },
  'Anteatereatingant': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', st: true, zone: ['szone', 'fzone'] }, n: 2 } }], req: [{ f: { side: 'self', st: true, zone: ['szone', 'fzone'] }, n: 2 }] },
    effects: [ign([{ op: 'destroy', s: { t: 'target' } }, { op: 'noAttackSelf' }], { label: 'Destroy a Spell/Trap', targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }] })],
  },
  'Anti-Aircraft Flower': { effects: [ign({ op: 'damage', who: 'opp', n: 800 }, { label: 'Tribute an Insect: 800 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Insect'] } } }] })] },
  'Apprentice Magician': {
    effects: [
      trig('summoned', run(async ({ d, p }) => { const c = await pick(d, p, 'Place a Spell Counter', [...d.fieldCards(0), ...d.fieldCards(1)].filter((x) => x.faceUp && /Spell Counter/.test(x.def.text)), 'good'); if (c) addCtr(d, c, 1); }), { cond: (d) => [...d.fieldCards(0), ...d.fieldCards(1)].some((x) => x.faceUp && /Spell Counter/.test(x.def.text)) }),
      trig('battleDestroyed', run(async ({ d, p }) => { const c = await pick(d, p, 'Special Summon a Spellcaster face-down', d.find(DECK({ kind: 'monster', race: ['Spellcaster'], maxLv: 2 }), p).filter((x) => d.canSpecial(p, x)), 'good'); if (c) { await d.specialSummon(c, p, 'def', 'special', true); await d.shuffleDeck(p); } }), { optional: true, from: ['gy'] }),
    ],
  },
  'Aquarian Alessa': { effects: [trig('destroysByBattle', run(async ({ d, p, o }) => { const c = randomOf(d, d.players[o].hand); if (c) await d.discard(o, [c], p); }), { cond: (_d, _c) => true })] },
  'Arcana Force 0 - The Fool': {
    rules: ['battleImmune'],
    lock: { pos: (_d, src, c) => c === src },
    effects: [arcanaFlip],
    onTargeted: async (d, self, link) => {
      const mine = link.p === self.ctrl;
      if ((heads(self) && mine) || (tails(self) && !mine)) { link.negated = true; if (link.isCard && d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); }
    },
  },
  'Arcana Force EX - The Dark Ruler': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: OWN_M, n: 3 } }], req: [{ f: OWN_M, n: 3 }] },
    ruleIf: { doubleAttack: (_d, c) => heads(c) },
    effects: [arcanaFlip, trig('destroyed', run(async ({ d, p }) => { for (const c of [...d.fieldCards(0), ...d.fieldCards(1)]) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.last.arcana === 'tails' })],
  },
  'Arcana Force Ex - The Light Ruler': {
    noNormal: true,
    ssProc: { cost: [{ op: 'toGY', s: { t: 'choose', f: OWN_M, n: 3 } }], req: [{ f: OWN_M, n: 3 }] },
    effects: [arcanaFlip, trig('destroysByBattle', run(async ({ d, p }) => { const c = await pick(d, p, 'Add a card from your Graveyard', d.players[p].gy, 'good'); if (c) await d.toHand(c); }), { optional: true, cond: (_d, c) => heads(c) })],
    onTargeted: async (d, self, link) => { if (!tails(self)) return; link.negated = true; link.activationNegated = true; if (link.isCard && d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); d.addMod(self, -1000, 0, -1); },
  },
  'Arcana Force I - The Magician': {
    effects: [arcanaFlip],
    onResolve: async (d, src, link) => {
      if (!link.isCard || link.card.def.kind !== 'spell') return;
      if (heads(src)) d.addMod(src, Math.max(0, d.base(src, 'atk') * 2 - d.atk(src)), 0);
      else if (tails(src)) await d.heal(opp(src.ctrl), 500);
    },
  },
  'Arcana Force III - The Empress': {
    effects: [arcanaFlip],
    onSummon: async (d, src, c, how, p) => {
      if (p === src.ctrl || how !== 'normal') return;
      if (heads(src)) await ssPick(d, src.ctrl, d.players[src.ctrl].hand.filter((x) => x.def.name.includes('Arcana Force')), 'Special Summon an Arcana Force monster');
      else if (tails(src)) { const x = await pick(d, src.ctrl, 'Send a card from your hand to the Graveyard', d.players[src.ctrl].hand, 'cost'); if (x) await d.move(x, 'gy', { by: src.ctrl }); }
      void c;
    },
  },
  'Arcana Force IV - The Emperor': { effects: [arcanaFlip], auraFn: (_d, src, c) => (c.ctrl === src.ctrl && c.def.name.includes('Arcana Force') ? (heads(src) ? { atk: 500 } : tails(src) ? { atk: -500 } : undefined) : undefined) },
  'Arcana Force VI - The Lovers': {
    effects: [arcanaFlip],
    lock: { summon: (_d, src, p, c, how) => !!src && tails(src) && p === src.ctrl && how === 'normal' && c.def.name.includes('Arcana Force') && (c.def.lv ?? 0) >= 5 },
  },
  'Arcana Force VII - The Chariot': {
    effects: [
      arcanaFlip,
      trig('summoned', run(async ({ d, card }) => { if (tails(card)) await d.takeControl(card, opp(card.ctrl), true); }), { cond: () => true }),
      trig('destroysByBattle', run(async ({ d, p, link }) => { const o = link.trig?.other; if (o && o.zone === 'gy' && d.canSpecial(p, o)) await d.specialSummon(o, p, await d.askPos(p, o)); }), { optional: true, cond: (_d, c) => heads(c) }),
    ],
  },
  'Arcana Force XIV - Temperance': {
    effects: [arcanaFlip, quick(run(({ d, p }) => d.addTemp({ until: d.turn, tag: 'noBattleDmg', p }), (d, me, _c, ev) => threat(d, me, ev)), { from: ['hand'], label: 'Discard: no battle damage', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], when: (_d, ev, p) => ev.e === 'attack' && ev.player !== p })],
    lock: { battleDmg: (_d, src, _a, _t, n, to) => (!src ? n : heads(src) && to === src.ctrl ? Math.floor(n / 2) : tails(src) && to !== src.ctrl ? Math.floor(n / 2) : n) },
  },
  'Arcana Force XVIII - The Moon': {
    effects: [
      arcanaFlip,
      trig('standby', run(({ d, p }) => tokens(d, p, tokenDef('Moon Token', 'Fairy', 'LIGHT', 1, 0, 0), 1, 'def')), { optional: true, cond: (d, c) => heads(c) && d.canSpecial(c.ctrl) }),
      trig('endPhase', run(async ({ d, p }) => { const c = await pick(d, p, 'Give control of a monster', d.monsters(p), 'cost'); if (c) await d.takeControl(c, opp(p), true); }), { cond: (d, c) => tails(c) && d.tp === c.ctrl }),
    ],
  },
  'Arcana Force XXI - The World': {
    effects: [
      arcanaFlip,
      trig('endPhase', run(async ({ d, p, o }) => { for (const c of await d.select(p, 'Send 2 monsters to the Graveyard', d.monsters(p), 2, 2, 'cost')) await d.move(c, 'gy', { by: p, why: 'cost' }); d.flag('skipTurn', o); }), { optional: true, cond: (d, c) => heads(c) && d.tp === c.ctrl && d.monsters(c.ctrl).length >= 2 }),
      trig('oppStandby', run(async ({ d, o }) => { const c = d.players[o].gy[d.players[o].gy.length - 1]; if (c) await d.toHand(c); }), { cond: (d, c) => tails(c) && d.players[opp(c.ctrl)].gy.length > 0 }),
    ],
  },
  'Arcane Archer of the Forest': {
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, race: ['Plant'] }, src.ctrl).length > 0 },
    effects: [ign({ op: 'destroy', s: { t: 'target' } }, { label: 'Tribute a Plant: destroy a Spell/Trap', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Plant'] } } }], targets: [{ f: ST }] })],
  },
  'Archfiend General': {
    selfDestructIf: (d) => ![0, 1].some((s) => d.players[s as Side].f?.def.name === 'Pandemonium' && d.players[s as Side].f!.faceUp),
    effects: [ign(search({ name: 'Pandemonium' }), { from: ['hand'], label: 'Discard: add Pandemonium', cost: [run(async ({ d, p, card }) => { await d.discard(p, [card], null); })], req: [{ f: DECK({ name: 'Pandemonium' }) }] })],
  },
  'Archlord Zerato': {
    noNormal: true,
    ssProc: { cond: (d) => d.active('The Sanctuary in the Sky'), cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Warrior of Zera' } } }], req: [{ f: { ...OWN_FU, name: 'Warrior of Zera' } }] },
    effects: [ign(destroyAll(OPP_M), { label: 'Discard a LIGHT monster: destroy all opponent monsters', cond: (d, c) => d.active('The Sanctuary in the Sky', c.ctrl), cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'LIGHT' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'LIGHT' } }] })],
  },
  'Armageddon Knight': { effects: [trig('summoned', { op: 'toGY', s: { t: 'choose', f: DECK({ kind: 'monster', attr: 'DARK' }) } }, { optional: true })] },
  'Armament of the Lethal Lords': { noSpecial: true, tributes: () => 3, tribFilter: (d, t) => d.raceOf(t) === 'Warrior' || t.def.race === 'Warrior' },
  'Armed Dragon LV10': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, name: 'Armed Dragon LV7' } } }], req: [{ f: { ...OWN_FU, name: 'Armed Dragon LV7' } }] },
    effects: [ign(destroyAll(OPP_FU), { label: 'Discard: destroy all face-up opponent monsters', cost: [{ op: 'discard', who: 'self', n: 1 }] })],
  },
  'Armed Dragon LV3': { effects: [lvUp('Armed Dragon LV5', 'standby')] },
  'Armed Dragon LV5': merge(markKill, {
    effects: [
      ign(run(async ({ d, p, t, link }) => { const c = t[0]; if (c && d.atk(c) <= (link.data.atk ?? 0)) await d.destroy(c, 'effect', undefined, p); }, 900), {
        label: 'Send a monster: destroy a monster', targets: [{ f: OPP_FU }],
        cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Send a Monster Card from your hand', d.players[p].hand.filter((x) => x.def.kind === 'monster'), 'cost'); if (c) { link.data.atk = c.def.atk ?? 0; await d.move(c, 'gy', { by: p, why: 'cost' }); } }, 0, (d, p) => d.players[p].hand.some((x) => x.def.kind === 'monster'))],
      }),
      lvUp('Armed Dragon LV7', 'endBattle'),
    ],
  }),
  'Armed Dragon LV7': {
    noNormal: true,
    effects: [ign(run(async ({ d, p, link }) => { for (const c of d.find(OPP_FU, p).filter((x) => d.atk(x) <= (link.data.atk ?? 0))) await d.destroy(c, 'effect', undefined, p); }, 1500), {
      label: 'Send a monster: destroy monsters',
      cost: [run(async ({ d, p, link }) => { const c = await pick(d, p, 'Send a Monster Card from your hand', d.players[p].hand.filter((x) => x.def.kind === 'monster'), 'cost'); if (c) { link.data.atk = c.def.atk ?? 0; await d.move(c, 'gy', { by: p, why: 'cost' }); } }, 0, (d, p) => d.players[p].hand.some((x) => x.def.kind === 'monster'))],
    })],
  },
  'Armed Samurai - Ben Kei': { extraAttacks: (d, c) => d.equipsOf(c).length },
  'Armityle the Chaos Phantom': merge(contact(['Uria, Lord of Searing Flames', 'Hamon, Lord of Striking Thunder', 'Raviel, Lord of Phantasms'], 'banished'), {
    rules: ['battleImmune'],
    statFn: (d, c) => (d.tp === c.ctrl ? { atk: 10000 } : undefined),
  }),
  'Armor Breaker': merge(union({ race: ['Warrior'] }), {
    effects: [trig('anyBattleDamage', run(async ({ d, p }) => { const c = await pick(d, p, 'Destroy 1 card', [...d.fieldCards(0), ...d.fieldCards(1)], 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); }), {
      cond: (d, c, _p, ev) => c.zone === 'szone' && ev?.e === 'damage' && ev.player !== c.ctrl && !!ev.src && d.equippedTo(c) === ev.src,
    })],
  }),
  'Armor Exe': {
    attackCond: (d, c) => c.data.sumTurn !== d.turn,
    effects: [trig(['standby', 'oppStandby'], run(async ({ d, p, card }) => {
      const holders = d.fieldCards(p).filter((c) => ctr(c) > 0);
      const h = await pick(d, p, 'Remove a Spell Counter (or Armor Exe is destroyed)', holders, 'cost', true);
      if (h) removeCtr(d, h, 1); else await d.destroy(card, 'effect', undefined, p);
    }), { cond: (d, c) => c.zone === 'mzone' && c.faceUp })],
  },
  'Armored Cybern': merge(union({ fn: (_d, c) => c.def.name === 'Cyber Dragon' || (c.def.mtype === 'fusion' && c.def.text.includes('"Cyber Dragon"')) }), {
    effects: [ign(run(async ({ d, p, card, t }) => { const m = d.equippedTo(card); if (m) d.addMod(m, -1000, 0, -1); if (t[0]) await d.destroy(t[0], 'effect', undefined, p); }, 800), {
      from: ['szone'], opt: true, label: 'Equipped -1000 ATK: destroy a monster', targets: [{ f: FU }], cond: (d, c) => { const m = d.equippedTo(c); return !!m && d.atk(m) >= 1000; },
    })],
  }),
  'Armoroid Gaidengo': {
    tributes: () => 1, tribFilter: (_d, t) => t.def.name.includes('roid'),
    effects: [trig('normalSummoned', run(async ({ d, p }) => { for (const c of d.find({ side: 'any', st: true, zone: ['szone', 'fzone'] }, p)) await d.banish(c, p); }))],
  },
  'Arsenal Bug': { statFn: (d, c) => (d.find({ ...OWN_FU, race: ['Insect'], notThis: true }, c.ctrl, c).length ? undefined : { atk: 1000 - d.base(c, 'atk'), def: 1000 - d.base(c, 'def') }) },
  'Arsenal Summoner': {
    effects: [flip(search({ fn: (_d, c) => c.def.name.includes('Guardian') && !['Celtic Guardian', 'Winged Dragon, Guardian of the Fortress #1', 'Winged Dragon, Guardian of the Fortress #2', 'Guardian of the Labyrinth', 'The Reliable Guardian'].includes(c.def.name) }))],
  },
  'Asura Priest': merge(spirit(), { rules: ['attackAll'] }),
  'Aswan Apparition': { effects: [trig('battleDamage', run(async ({ d, p }) => { const c = await pick(d, p, 'Return a Trap to the top of your Deck', d.players[p].gy.filter((x) => x.def.kind === 'trap'), 'good'); if (c) await d.move(c, 'deck'); }), { optional: true, cond: (d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl && d.players[c.ctrl].gy.some((x) => x.def.kind === 'trap') })] },
  'Athena': {
    onSummon: async (d, src, c) => { if (d.raceOf(c) === 'Fairy' || c.def.race === 'Fairy') await d.damage(opp(src.ctrl), 600, src); },
    effects: [ign(ssFrom(['gy'], { race: ['Fairy'], fn: (_d, c) => c.def.name !== 'Athena' }), {
      opt: true, label: 'Send a Fairy: Special Summon a Fairy', cost: [{ op: 'toGY', s: { t: 'choose', f: { ...OWN_FU, race: ['Fairy'], fn: (_d, c) => c.def.name !== 'Athena' } } }],
      req: [{ f: { ...OWN_FU, race: ['Fairy'], fn: (_d, c) => c.def.name !== 'Athena' } }, { f: { ...GY_M('self'), race: ['Fairy'] } }],
    })],
  },
  'Atomic Firefly': { effects: [trig('battleDestroyed', run(({ d, link }) => { const o = link.trig?.other; if (o) return d.damage(o.ctrl, 1000); }), { from: ['gy'] })] },
  'Aussa the Earth Charmer': { effects: [flip(run(async ({ d, p, card, t }) => { if (t[0]) await d.takeControl(t[0], p, true, card); }, 1000), { targets: [{ f: { ...OPP_FU, attr: 'EARTH' } }] })] },
  'Avalanching Aussa': {
    effects: [ign({ op: 'summon', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'EARTH' } }, bind: true }, {
      opt: true, label: 'Tribute an EARTH monster: Special Summon an EARTH monster',
      cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'EARTH', notThis: true } } }],
      req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'EARTH' } }],
    })],
  },
  'Avatar of The Pot': { effects: [ign({ op: 'draw', who: 'self', n: 3 }, { label: 'Send Pot of Greed: draw 3', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', name: 'Pot of Greed' } } }], req: [{ f: { side: 'self', zone: 'hand', name: 'Pot of Greed' } }] })] },
  'Axe Dragonute': { postBattle: async (d, self, _o, r) => { if (r.att === self && self.zone === 'mzone') await d.changePos(self, 'def'); } },
  'Aztekipede, the Worm Warrior': merge(banishProc(1, { race: ['Insect'] }), { effects: [trig('battleDamage', { op: 'mill', who: 'opp', n: 1 }, { cond: (_d, c, _p, ev) => ev?.e === 'damage' && ev.player !== c.ctrl })] }),
  'B.E.S. Covered Core': {
    rules: ['battleImmune'],
    effects: [trig('normalSummoned', run(({ d, card }) => { addCtr(d, card, 2, 'core'); }))],
    postBattle: async (d, self) => {
      if (self.zone !== 'mzone') return;
      if (!ctr(self, 'core')) { await d.destroy(self, 'effect', undefined, self.ctrl); return; }
      if (!(await d.call(self.ctrl))) removeCtr(d, self, 1, 'core');
    },
  },
};
void FU; void M; void OPP_FU; void foeOf; void isAlien; void isAttackOn; void grantRule; void destroyAll;
