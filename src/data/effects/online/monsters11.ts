// YGO Online monsters, part 11 (Servant of Catabolism … The Earth - Hex-Sealed Fusion).
import {
  type Attr, type Card, type Def, type Duel, type Side,
  DECK, FU, GY_M, M, OPP_FU, OPP_M, OWN_FU, OWN_M, ST,
  addCtr, attackOf, banishProc, both, canFuse, ctr, destroyAll, flip, fuse, has, ign, isAttackOn, lvUp, merge, opp, pick, quick,
  randomOf, removeCtr, run, search, spellCounterGain, spirit, ssFrom, ssPick, threat, tokenDef, tokens, trig, tributed, union, won, atEndPhase,
} from './olib';

const P = (d: Duel, s: Side) => d.players[s];
const setSelf = ign(run(async ({ d, card }) => { card.pos = 'def'; await d.setFaceDown(card); }, -1), { opt: true, label: 'Flip face-down', cond: (d, c) => c.faceUp && c.data.sumTurn !== d.turn });
const archfiend = (upkeep: number, hits: number[]): Def => ({
  upkeep,
  onTargeted: async (d, self, link) => { if (link.p === self.ctrl || !hits.includes((await d.die()))) return; link.negated = true; if (link.isCard && d.onField(link.card)) await d.destroy(link.card, 'effect', undefined, self.ctrl); },
});
const wipeNon = (attr: string): Def => ({ effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of both(d).filter((x) => !x.faceUp || d.attrOf(x) !== attr)) await d.destroy(c, 'effect', undefined, p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] });
const lordTrib = (race: string): Def => ({ noSpecial: true, tributes: () => 3, tribFilter: (_d, t) => t.def.race === race });
const skilled = (target: string): Def => merge(spellCounterGain(3), { effects: [ign(ssFrom(['hand', 'deck', 'gy'], { name: target }), { label: `Tribute: Special Summon ${target}`, cost: [{ op: 'tribute', s: { t: 'this' } }], cond: (_d, c) => ctr(c) >= 3 })] });
const hexSealed = (attr: Attr): Def => ({
  fusionSub: true,
  effects: [ign(run(async ({ d, p, card }) => { await fuse(d, p, card, { f: (f) => f.def.attr === attr, pool: (s) => d.monsters(s), dest: 'gy' }); }, 1500, (d, p, card) => canFuse(d, p, card, { f: (f) => f.def.attr === attr, pool: (s) => d.monsters(s) })), { label: `Tribute materials: Special Summon a ${attr} Fusion Monster` })],
});
const swordsman = (next: string | undefined, extra: Def = {}): Def => merge(extra, next ? { effects: [lvUp(next, 'standby', (d, c) => c.data.sumTurn !== d.turn && c.data.flipTurn !== d.turn)] } : {});

export const MONSTERS_11: Record<string, Def> = {
  'Servant of Catabolism': { rules: ['direct'] },
  'Shadow Delver': { effects: [ign(run(({ d, t }) => { const c = t[0]; if (c) c.data.tempRules = { ...(c.data.tempRules ?? {}), direct: d.turn }; }, 500), { opt: true, label: 'A Level 4 or lower DARK monster attacks directly', targets: [{ f: { ...OWN_FU, attr: 'DARK', maxLv: 4 }, good: true }] })] },
  'Shadow Tamer': { effects: [flip({ op: 'control', s: { t: 'target' } }, { targets: [{ f: { ...OPP_FU, race: ['Fiend'] } }] })] },
  'Shadowknight Archfiend': merge(archfiend(900, [3]), { battleDmg: (_d, self, _o, n, to) => (to !== self.ctrl ? Math.floor(n / 2) : n) }),
  'Shadowpriestess of Ohm': { effects: [ign({ op: 'damage', who: 'opp', n: 800 }, { label: 'Tribute a DARK monster: 800 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_FU, attr: 'DARK' } } }] })] },
  'Shadowslayer': { ruleIf: { direct: (d, c) => d.monsters(opp(c.ctrl)).length > 0 && d.monsters(opp(c.ctrl)).every((m) => m.pos === 'def') } },
  "Shien's Footsoldier": { effects: [trig('battleDestroyed', ssFrom(['deck'], { set: 'Six Samurai', maxLv: 3 }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Shinato, King of a Higher Plane': { postBattle: async (d, self, o, r) => { if (o && won(self, r) && o.mark.lastPos === 'def' && o.zone === 'gy') await d.damage(opp(self.ctrl), o.def.atk ?? 0); } },
  'Silent Abyss': wipeNon('WATER'),
  'Silent Insect': {
    effects: [trig(['normalSummoned', 'flipSummoned'], { op: 'pos', s: { t: 'this' }, to: 'def' })],
    negateFn: (_d, _s, c) => (c.zone === 'szone' || c.zone === 'fzone') && c.def.stype === 'continuous',
  },
  'Silent Magician LV4': {
    statFn: (_d, c) => ({ atk: 500 * ctr(c) }),
    effects: [
      trig('anyDraw', run(({ d, card }) => { addCtr(d, card, 1, 'spell', 5); }), { cond: (_d, c, _p, ev) => ev?.e === 'draw' && ev.player !== c.ctrl && c.zone === 'mzone' }),
      lvUp('Silent Magician LV8', 'standby', (_d, c) => ctr(c) >= 5),
    ],
  },
  'Silent Magician LV8': { noNormal: true, immune: (d, self, src) => src.def.kind === 'spell' && d.holder(src) !== self.ctrl },
  'Silent Swordsman LV3': swordsman('Silent Swordsman LV5', { onTargeted: (d, self, link) => { if (link.isCard && link.card.def.kind === 'spell' && link.p !== self.ctrl) link.negated = true; } }),
  'Silent Swordsman LV5': {
    immune: (d, self, src) => src.def.kind === 'spell' && d.holder(src) !== self.ctrl,
    effects: [
      trig('battleDamage', run(({ d, card }) => { card.data.directTurn = d.turn; }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl }),
      lvUp('Silent Swordsman LV7', 'standby', (d, c) => c.data.directTurn !== undefined && c.data.directTurn < d.turn),
    ],
  },
  'Silent Swordsman LV7': { noNormal: true, negateFn: (_d, _s, c) => c.def.kind === 'spell' },
  'Sillva, Warlord of Dark World': {
    effects: [trig('effDiscarded', run(async ({ d, p, o, card }) => {
      if (card.zone === 'gy' && d.canSpecial(p, card)) await d.specialSummon(card, p, await d.askPos(p, card));
      if (card.mark.sentBy !== undefined && card.mark.sentBy !== p) for (const c of await d.select(o, 'Return 2 cards from your hand to the bottom of your Deck', P(d, o).hand, Math.min(2, P(d, o).hand.length), 2, 'cost')) await d.move(c, 'deck', { bottom: true });
    }), { from: ['gy'] })],
  },
  'Silpheed': merge(banishProc(1, { attr: 'WIND' }), { effects: [trig('battleDestroyed', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] }),
  'Simorgh, Bird of Ancestry': {
    effects: [trig('normalSummoned', run(async ({ d, p }) => { for (const c of await d.select(p, 'Return up to 2 cards to the hand', d.fieldCards(opp(p)), 0, 2, 'bad')) await d.toHand(c); }), { cond: (d, c) => (c.mark.tribCount ?? 0) > 0 && tributed(c).length > 0 })],
  },
  'Simorgh, Bird of Divinity': {
    noSpecial: true, tribFilter: (d, t) => d.attrOf(t) === 'WIND' || t.def.attr === 'WIND',
    effects: [trig('endPhase', run(async ({ d }) => { for (const s of [0, 1] as Side[]) await d.damage(s, Math.max(0, 1000 - 500 * d.spellTraps(s).length)); }))],
  },
  'Skilled Dark Magician': skilled('Dark Magician'),
  'Skilled White Magician': skilled('Buster Blader'),
  'Skreech': { effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of await d.select(p, 'Send 2 WATER monsters to the Graveyard', d.find(DECK({ kind: 'monster', attr: 'WATER' }), p), 2, 2, 'cost')) await d.move(c, 'gy', { by: p }); await d.shuffleDeck(p); }), { from: ['gy'] })] },
  'Skull Archfiend of Lightning': archfiend(500, [1, 3, 6]),
  'Skull Knight #2': { effects: [trig('toGY', ssFrom(['deck'], { name: 'Skull Knight #2' }), { from: ['gy'], cond: (d, c) => c.mark.lastWhy === 'tribute' && d.monsters(c.owner).some((m) => m.data.sumTurn === d.turn && m.def.race === 'Fiend' && (m.mark.tribs ?? []).includes(c.def.name)) })] },
  'Skull-Mark Ladybug': { effects: [trig('toGY', { op: 'heal', who: 'self', n: 1000 }, { from: ['gy'] })] },
  'Sky Scourge Enrise': {
    noNormal: true,
    ssProc: {
      cond: (d, p) => d.find({ ...GY_M('self'), attr: 'LIGHT', race: ['Fairy'] }, p).length >= 3 && d.find({ ...GY_M('self'), attr: 'DARK', race: ['Fiend'] }, p).length >= 1,
      cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'LIGHT', race: ['Fairy'] }, n: 3 } }, { op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK', race: ['Fiend'] } } }],
    },
    effects: [ign([{ op: 'banish', s: { t: 'target' } }, { op: 'noAttackSelf' }], { opt: true, label: 'Banish a face-up monster', targets: [{ f: FU }] })],
  },
  'Sky Scourge Invicil': {
    noSpecial: true,
    negateFn: (d, src, c) => { const t = tributed(src); const lf = t.some((n) => { const x = d.allCards().find((y) => y.def.name === n); return x && x.def.attr === 'LIGHT' && x.def.race === 'Fairy'; }); const df = t.some((n) => { const x = d.allCards().find((y) => y.def.name === n); return x && x.def.attr === 'DARK' && x.def.race === 'Fiend'; }); return (lf && c.def.kind === 'spell') || (df && c.def.kind === 'trap'); },
  },
  'Sky Scourge Norleras': {
    noNormal: true,
    ssProc: {
      cond: (d, p) => d.find({ ...GY_M('self'), attr: 'LIGHT', race: ['Fairy'] }, p).length >= 1 && d.find({ ...GY_M('self'), attr: 'DARK', race: ['Fiend'] }, p).length >= 3,
      cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'LIGHT', race: ['Fairy'] } } }, { op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK', race: ['Fiend'] }, n: 3 } }],
    },
    effects: [ign(run(async ({ d, p }) => { for (const s of [0, 1] as Side[]) for (const c of [...d.fieldCards(s), ...P(d, s).hand]) await d.move(c, 'gy', { by: p }); await d.draw(p, 1); }, (d, me) => (d.fieldCards(opp(me)).length + P(d, opp(me)).hand.length) * 500 - (d.fieldCards(me).length + P(d, me).hand.length) * 400), { label: 'Pay 1000 LP: send everything to the Graveyard', cost: [{ op: 'payLP', n: 1000 }] })],
  },
  'Snipe Hunter': { effects: [ign(run(async ({ d, p, t }) => { const n = (await d.die()); if (n !== 1 && n !== 6 && t[0]) await d.destroy(t[0], 'effect', undefined, p); }, 500), { label: 'Discard: roll to destroy a card', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: { side: 'any', zone: ['mzone', 'szone', 'fzone'], notThis: true } }] })] },
  'Solar Flare Dragon': {
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, race: ['Pyro'], notThis: true }, src.ctrl, src).length > 0 },
    effects: [trig('endPhase', { op: 'damage', who: 'opp', n: 500 }, { cond: (d, c) => d.tp === c.ctrl })],
  },
  'Sonic Jammer': { effects: [flip(run(({ d, o }) => d.addTemp({ until: d.turn + 1, lock: { activate: (_d, _s, q, c) => q === o && c.def.kind === 'spell' } }), 400))] },
  'Sonic Shooter': {
    ruleIf: { direct: (d, c) => d.players[opp(c.ctrl)].s.every((x) => !x) },
    battleDmg: (_d, self, other, n, to) => (!other && to !== self.ctrl ? self.def.atk ?? n : n),
  },
  'Sorcerer of Dark Magic': {
    noNormal: true,
    ssProc: { cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, race: ['Spellcaster'], minLv: 6 }, n: 2 } }], req: [{ f: { ...OWN_FU, race: ['Spellcaster'], minLv: 6 }, n: 2 }] },
    effects: [quick({ op: 'negate' }, { label: 'Negate a Trap', on: ['activateTrap'], ai: 900 })],
  },
  'Soul-Absorbing Bone Tower': {
    lock: { target: (d, src, a, t) => !!src && t === src && a.ctrl !== src.ctrl && d.find({ ...OWN_FU, race: ['Zombie'], notThis: true }, src.ctrl, src).length > 0 },
    onSummon: async (d, src, c, how) => { if (how !== 'normal' && how !== 'flip' && d.raceOf(c) === 'Zombie') await d.mill(opp(src.ctrl), 2, src.ctrl); },
  },
  'Spear Dragon': { rules: ['pierce'], postBattle: async (d, self, _o, r) => { if (r.att === self && self.zone === 'mzone') await d.changePos(self, 'def'); } },
  'Spell Canceller': { negateFn: (_d, _s, c) => c.def.kind === 'spell', lock: { activate: (_d, _s, _p, c) => c.def.kind === 'spell' } },
  'Spell Striker': {
    rules: ['direct'],
    ssProc: { cost: [{ op: 'banish', s: { t: 'choose', f: { side: 'self', zone: 'gy', kind: 'spell' } } }], req: [{ f: { side: 'self', zone: 'gy', kind: 'spell' } }] },
    battleDmg: (_d, self, _o, n, to) => (to === self.ctrl ? 0 : n),
  },
  'Sphinx Teleia': {
    ssProc: { cond: (d, p) => d.active('Pyramid of Light', p), cost: [{ op: 'payLP', n: 500 }] },
    attackCond: (d, c) => c.data.sumTurn !== d.turn,
    postBattle: async (d, self, o, r) => { if (o && won(self, r) && o.mark.lastPos === 'def') await d.damage(opp(self.ctrl), Math.floor((o.def.def ?? 0) / 2)); },
  },
  'Spirit Caller': { effects: [flip(ssFrom(['gy'], { mtype: ['normal'], maxLv: 3 }), { optional: true })] },
  'Spirit of the Pharaoh': {
    noNormal: true,
    effects: [trig('specialSummoned', run(async ({ d, p }) => { for (let i = 0; i < 4; i++) if (!(await ssPick(d, p, d.find({ ...GY_M('self'), race: ['Zombie'], mtype: ['normal'], maxLv: 2 }, p), 'Special Summon a Zombie'))) break; }), { optional: true })],
  },
  'Spirit of the Pot of Greed': { onResolve: async (d, src, link) => { if (src.pos === 'atk' && link.isCard && link.card.def.name === 'Pot of Greed' && (await d.confirm(link.p, 'Draw 1 more card?', src))) await d.draw(link.p, 1); } },
  'Spirit of the Six Samurai': merge(union({ set: 'Six Samurai' }, 500, 500), {
    effects: [trig('anyToGY', { op: 'draw', who: 'self', n: 1 }, { cond: (d, c, _p, ev) => c.zone === 'szone' && ev?.e === 'sent' && ev.why === 'battle' && ev.ctrl !== c.ctrl && !!d.battle && [d.battle.att, d.battle.tgt].includes(d.equippedTo(c) ?? null) })],
  }),
  'Spirit Reaper': {
    rules: ['battleImmune'],
    onTargeted: async (d, self) => { await d.destroy(self, 'effect'); },
    effects: [trig('battleDamage', run(async ({ d, p, o }) => { const c = randomOf(d, P(d, o).hand); if (c) await d.discard(o, [c], p); }), { cond: (_d, c, _p, ev) => ev?.e === 'damage' && !!ev.direct && ev.player !== c.ctrl })],
  },
  'Spirit Ryu': { effects: [quick({ op: 'stat', s: { t: 'this' }, atk: 1000, def: 1000 }, { label: 'Discard a Dragon: +1000 ATK/DEF', cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', race: ['Dragon'] } } }], when: (d, ev, p, card) => ev.e === 'attack' && d.tp === p && (ev.attacker === card || ev.target === card), ai: 700 })] },
  'Splendid Venus': {
    auraFn: (d, _src, c) => (d.raceOf(c) !== 'Fairy' ? { atk: -500, def: -500 } : undefined),
  },
  'Stealth Bird': { effects: [setSelf, trig('flipSummoned', { op: 'damage', who: 'opp', n: 1000 })] },
  'Stealthroid': { postBattle: (d, self, _o, r) => { if (r.att !== self) return; const p = self.ctrl; d.schedule({ at: 'BPend', turn: d.turn, fn: async () => { if (!d.find({ ...OWN_FU, fn: (_d, c) => c.def.name.includes('roid') && c !== self }, p).length) return; const c = await pick(d, p, 'Destroy a Spell or Trap Card', d.find(ST, p), 'bad'); if (c) await d.destroy(c, 'effect', undefined, p); } }); } },
  'Steam Gyroid': {},
  'Steamroid': { statFn: (d, c) => (d.battle?.att === c && d.battle.tgt ? { atk: 500 } : d.battle?.tgt === c ? { atk: -500 } : undefined) },
  'Stone Statue of the Aztecs': { battleDmg: (d, self, other, n, to) => (other && d.battle?.tgt === self && to === other.ctrl ? n * 2 : n) },
  'Storm Shooter': {
    effects: [ign(run(async ({ d, p, o, card }) => {
      const P_ = P(d, p);
      const adj = [card.slot - 1, card.slot + 1].filter((i) => i >= 0 && i < 5 && !P_.m[i]);
      const col = [P(d, o).m[4 - card.slot], P(d, o).s[4 - card.slot]].filter((x): x is Card => !!x);
      const i = col.length && adj.length ? await d.option(p, 'Storm Shooter', ['Move to an adjacent zone', 'Return a card in this column'], 1) : col.length ? 1 : 0;
      if (i === 0 && adj.length) { P_.m[card.slot] = null; P_.m[adj[0]] = card; card.slot = adj[0]; await d.emit({ t: 'move', card, from: 'mzone', to: 'mzone' }); }
      else { const c = await pick(d, p, 'Return a card to the hand', col, 'bad'); if (c) await d.toHand(c); }
    }, 300), { opt: true, label: 'Move, or bounce a card in this column' })],
  },
  'Storming Wynn': { effects: [ign({ op: 'summon', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WIND' } }, bind: true }, { opt: true, label: 'Tribute a WIND monster: Special Summon a WIND monster', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, attr: 'WIND', notThis: true } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'monster', attr: 'WIND' } }] })] },
  'Stray Asmodian': { effects: [trig('battleDestroyed', { op: 'heal', who: 'both', n: 800 }, { from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Strike Ninja': {
    effects: [quick(run(async ({ d, p, card }) => {
      if (card.zone !== 'mzone') return;
      const pos = card.pos;
      await d.banish(card, p);
      const mv = card.mv;
      d.schedule({ at: 'EP', turn: d.turn, fn: async () => { if (card.mv === mv && card.zone === 'banished' && d.canSpecial(p, card)) await d.specialSummon(card, p, pos); } });
    }, (d, me, _c, ev) => threat(d, me, ev)), { opt: true, label: 'Banish 2 DARK monsters: banish this card until the End Phase', cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK' }, n: 2 } }], req: [{ f: { ...GY_M('self'), attr: 'DARK' }, n: 2 }] })],
  },
  'Submarineroid': {
    rules: ['direct'],
    battleDmg: (_d, self, other, n, to) => (!other && to !== self.ctrl ? self.def.atk ?? n : n),
    postBattle: async (d, self) => { if (self.zone === 'mzone' && self.pos === 'atk' && (await d.confirm(self.ctrl, 'Change Submarineroid to Defense Position?', self))) await d.changePos(self, 'def'); },
  },
  'Substitoad': {
    lock: { indestructible: (_d, src, c, by) => !!src && by === 'battle' && c.ctrl === src.ctrl && c.def.name.includes('Frog') && c.def.name !== 'Frog the Jam' },
    effects: [ign(ssFrom(['deck'], { fn: (_d, c) => c.def.name.includes('Frog') && c.def.name !== 'Frog the Jam' }), { label: 'Tribute a monster: Special Summon a Frog', cost: [{ op: 'tribute', s: { t: 'choose', f: OWN_M } }] })],
  },
  'Summon Priest': {
    rules: ['noTribute'],
    effects: [
      trig(['normalSummoned', 'flipSummoned'], { op: 'pos', s: { t: 'this' }, to: 'def' }),
      ign(run(async ({ d, p, card }) => { const c = await ssPick(d, p, d.find(DECK({ kind: 'monster', minLv: 4, maxLv: 4 }), p), 'Special Summon a Level 4 monster', undefined, false, card); if (c) c.noAttackTurn = d.turn; }, 800), {
        opt: true, label: 'Discard a Spell: Special Summon a Level 4 monster', cond: (d) => d.phase === 'M1' || d.phase === 'M2',
        cost: [{ op: 'toGY', s: { t: 'choose', f: { side: 'self', zone: 'hand', kind: 'spell' } } }], req: [{ f: { side: 'self', zone: 'hand', kind: 'spell' } }],
      }),
    ],
  },
  'Super Conductor Tyranno': { effects: [ign([{ op: 'damage', who: 'opp', n: 1000 }, { op: 'noAttackSelf' }], { opt: true, label: 'Tribute a monster: 1000 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: { ...OWN_M, notThis: true } } }] })] },
  'Super Robolady': {
    statFn: (d, c) => (d.battle?.att === c && !d.battle.tgt ? { atk: 1000 } : undefined),
    effects: [ign(run(async ({ d, p, card }) => { await d.move(card, 'extra'); const r = P(d, p).extra.find((x) => x.def.name === 'Super Roboyarou'); if (r && d.canSpecial(p, r)) await d.specialSummon(r, p, await d.askPos(p, r)); }, 200), { label: 'Return: Special Summon Super Roboyarou', cond: (d, c) => c.data.sumTurn !== d.turn && P(d, c.ctrl).extra.some((x) => x.def.name === 'Super Roboyarou') })],
  },
  'Super Roboyarou': {
    statFn: (d, c) => (d.battle && d.battle.tgt && (d.battle.att === c || d.battle.tgt === c) ? { atk: 1000 } : undefined),
    effects: [ign(run(async ({ d, p, card }) => { await d.move(card, 'extra'); const r = P(d, p).extra.find((x) => x.def.name === 'Super Robolady'); if (r && d.canSpecial(p, r)) await d.specialSummon(r, p, await d.askPos(p, r)); }, 200), { label: 'Return: Special Summon Super Robolady', cond: (d, c) => c.data.sumTurn !== d.turn && P(d, c.ctrl).extra.some((x) => x.def.name === 'Super Robolady') })],
  },
  'Super Vehicroid - Stealth Union': {
    rules: ['pierce'],
    ruleIf: { attackAll: (d, c) => d.equipsOf(c).some((e) => e.uid === c.data.su) },
    statFn: (d, c) => (d.battle?.att === c ? { atk: -Math.floor(d.base(c, 'atk') / 2) } : undefined),
    effects: [ign(run(async ({ d, p, card, t }) => { const m = t[0]; if (m && (await d.equipCard(m, card, {}, p))) card.data.su = m.uid; }, 600), { opt: true, label: 'Equip a non-Machine monster you control', targets: [{ f: { ...OWN_FU, notThis: true, fn: (dd, c) => dd.raceOf(c) !== 'Machine' } }] })],
  },
  'Super Vehicroid Jumbo Drill': { rules: ['pierce'] },
  'Super-Electromagnetic Voltech Dragon': {
    statFn: (_d, c) => (tributed(c).includes('Batteryman AA') ? { atk: 1000 } : undefined),
    ruleIf: { pierce: (_d, c) => tributed(c).includes('Batteryman C') },
    onTargeted: (_d, self, link) => { if (tributed(self).includes('Batteryman D') && link.isCard && link.card.def.kind !== 'monster' && link.targets.flat().length === 1) link.negated = true; },
  },
  'Superancient Deepsea King Coelacanth': {
    effects: [ign(run(async ({ d, p, card }) => {
      for (const c of d.find(DECK({ kind: 'monster', race: ['Fish'], maxLv: 4 }), p)) {
        if (!d.canSpecial(p, c)) break;
        if (await d.specialSummon(c, p, await d.askPos(p, c), 'special', false, card)) { c.noAttackTurn = 1e9; const mv = c.mv; d.addTemp({ until: 1e9, negate: (_d, x) => x === c && x.mv === mv }); }
      }
      await d.shuffleDeck(p);
    }, 1000), { opt: true, label: 'Discard: Special Summon Fish', cost: [{ op: 'discard', who: 'self', n: 1 }], req: [{ f: DECK({ kind: 'monster', race: ['Fish'], maxLv: 4 }) }] })],
  },
  'Susa Soldier': spirit(),
  'Swarm of Locusts': { effects: [setSelf, trig('flipSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: { side: 'opp', st: true, zone: ['szone', 'fzone'] } }] })] },
  'Swarm of Scarabs': { effects: [setSelf, trig('flipSummoned', { op: 'destroy', s: { t: 'target' } }, { targets: [{ f: OPP_M }] })] },
  'Swift Birdman Joe': { effects: [trig('normalSummoned', { op: 'toHand', s: { t: 'all', f: { side: 'any', st: true, zone: ['szone', 'fzone'] } } }, { cond: (d, c) => tributed(c).some((n) => d.allCards().some((x) => x.def.name === n && x.def.attr === 'WIND')) })] },
  'Swift Gaia the Fierce Knight': { tributes: (d, p) => (P(d, p).hand.length === 1 ? 0 : 2) },
  'T.A.D.P.O.L.E.': { effects: [trig('battleDestroyed', run(async ({ d, p }) => { for (const c of await d.select(p, 'Add T.A.D.P.O.L.E.s to your hand', d.find(DECK({ name: 'T.A.D.P.O.L.E.' }), p), 0, 3, 'good')) await d.toHand(c); await d.shuffleDeck(p); }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Tactical Espionage Expert': { effects: [trig('normalSummoned', run(({ d }) => d.addTemp({ until: d.turn, lock: { activate: (dd, _s, _p, c) => c.def.kind === 'trap' && dd.windows.some((w) => w.e === 'summon') } })))] },
  'Tenkabito Shien': { immune: (_d, _s, src) => src.def.kind === 'trap' },
  'Terrorking Archfiend': merge(archfiend(800, [2, 5]), {
    summonCond: (d, p) => d.find({ ...OWN_FU, set: 'Archfiend' }, p).length > 0,
    postBattle: (d, self, o, r) => { if (o && won(self, r)) { const mv = o.mv; d.addTemp({ until: d.turn, negate: (_d, x) => x === o && x.mv === mv }); } },
  }),
  'Test Ape': { effects: [trig('battleDestroyed', ssFrom(['deck'], { set: 'Gladiator Beast', maxLv: 4 }), { optional: true, from: ['gy'], cond: (_d, c) => c.zone === 'gy' })] },
  'Test Tiger': {
    ssProc: { cond: (d, p) => d.find({ ...OWN_FU, set: 'Gladiator Beast' }, p).length > 0 },
    effects: [ign(run(async ({ d, p, card }) => {
      const g = await pick(d, p, 'Return a Gladiator Beast to the Deck', d.find({ ...OWN_FU, set: 'Gladiator Beast' }, p), 'cost');
      if (!g) return;
      await d.move(g, 'deck');
      await ssPick(d, p, d.find(DECK({ kind: 'monster', set: 'Gladiator Beast' }), p).filter((c) => c !== g), 'Special Summon a Gladiator Beast', undefined, false, { ...card, def: { ...card.def, name: 'Gladiator Beast (Test Tiger)' } } as Card);
      await d.shuffleDeck(p);
    }, 900), { label: 'Tribute: tag out a Gladiator Beast', cost: [{ op: 'tribute', s: { t: 'this' } }], req: [{ f: { ...OWN_FU, set: 'Gladiator Beast' } }] })],
  },
  'Testament of the Arcane Lords': lordTrib('Spellcaster'),
  'Tethys the Light Divine': {
    effects: [trig('anyDraw', run(async ({ d, p }) => { const c = P(d, p).hand[P(d, p).hand.length - 1]; if (!c) return; await d.reveal(opp(p), [c], 'Tethys'); await d.draw(p, 1); }), {
      optional: true, cond: (d, c, _p, ev) => ev?.e === 'draw' && ev.player === c.ctrl && P(d, c.ctrl).hand[P(d, c.ctrl).hand.length - 1]?.def.race === 'Fairy' && P(d, c.ctrl).hand[P(d, c.ctrl).hand.length - 1]?.def.kind === 'monster',
    })],
  },
  'Teva': { effects: [trig('normalSummoned', run(({ d, o }) => { d.addTemp({ until: d.turn + 1, lock: { attack: (_d, _s, a) => a.ctrl === o } }); }), { cond: (_d, c) => (c.mark.tribCount ?? 0) > 0 })] },
  'The Agent of Creation - Venus': { effects: [ign(ssFrom(['hand', 'deck'], { name: 'Mystical Shine Ball' }), { label: 'Pay 500 LP: Special Summon Mystical Shine Ball', cost: [{ op: 'payLP', n: 500 }], req: [{ f: { side: 'self', zone: ['hand', 'deck'], name: 'Mystical Shine Ball' } }] })] },
  'The Agent of Force - Mars': {
    immune: (_d, _s, src) => src.def.kind === 'spell',
    statFn: (d, c) => { const diff = P(d, c.ctrl).lp - P(d, opp(c.ctrl)).lp; return d.active('The Sanctuary in the Sky', c.ctrl) && diff > 0 ? { atk: diff, def: diff } : undefined; },
  },
  'The Agent of Judgment - Saturn': {
    effects: [ign(run(async ({ d, p, o }) => { const diff = P(d, p).lp - P(d, o).lp; if (diff > 0) await d.damage(o, diff); d.addTemp({ until: d.turn, tag: 'noBP', p }); }, (d, me) => P(d, me).lp - P(d, opp(me)).lp - 1000), {
      label: 'Tribute: inflict the LP difference', cost: [{ op: 'tribute', s: { t: 'this' } }], cond: (d, c) => d.active('The Sanctuary in the Sky', c.ctrl) && P(d, c.ctrl).lp > P(d, opp(c.ctrl)).lp,
    })],
  },
  'The Agent of Wisdom - Mercury': {
    effects: [trig('endPhase', run(({ d, p }) => d.schedule({ at: 'SP', side: p, fn: () => d.draw(p, 1) })), { cond: (d, c) => d.tp !== c.ctrl && P(d, c.ctrl).hand.length === 0 })],
  },
  'The Big Saturn': {
    effects: [
      ign({ op: 'stat', s: { t: 'this' }, atk: 1000 }, { opt: true, label: 'Discard and pay 1000 LP: +1000 ATK', cost: [{ op: 'discard', who: 'self', n: 1 }, { op: 'payLP', n: 1000 }], cond: (d) => d.phase === 'M1' || d.phase === 'M2' }),
      trig('destroyed', run(async ({ d, card }) => { const n = card.def.atk ?? 2800; await d.damage(0, n, card); await d.damage(1, n, card); }), { from: ['gy'], cond: (_d, c) => c.zone === 'gy' && c.mark.destroyedHow === 'effect' && c.mark.destroyedBy !== c.owner }),
    ],
  },
  'The Calculator': { statFn: (d, c) => ({ atk: 300 * d.monsters(c.ctrl).filter((m) => m.faceUp).reduce((s, m) => s + d.lvOf(m), 0) - d.base(c, 'atk') }) },
  'The Creator': {
    effects: [ign(run(async ({ d, p, card, t }) => { const g = t[0]; if (g && g.zone === 'gy' && d.canSpecial(p, g)) await d.specialSummon(g, p, await d.askPos(p, g), 'special', false, card); }, 900), { opt: true, label: 'Discard: Special Summon a monster from your Graveyard', cost: [{ op: 'discard', who: 'self', n: 1 }], targets: [{ f: GY_M('self'), good: true }] })],
  },
  'The Creator Incarnate': { effects: [ign(ssFrom(['hand'], { name: 'The Creator' }), { label: 'Tribute: Special Summon The Creator', cost: [{ op: 'tribute', s: { t: 'this' } }], req: [{ f: { side: 'self', zone: 'hand', name: 'The Creator' } }] })] },
  'The Dark - Hex-Sealed Fusion': hexSealed('DARK'),
  'The Dark Creator': {
    noNormal: true,
    ssProc: { cond: (d, p) => d.monsters(p).length === 0 && P(d, p).gy.filter((c) => c.def.kind === 'monster' && c.def.attr === 'DARK').length >= 5 },
    effects: [ign(ssFrom(['gy'], { attr: 'DARK' }), { opt: true, label: 'Banish a DARK monster: Special Summon a DARK monster', cost: [{ op: 'banish', s: { t: 'choose', f: { ...GY_M('self'), attr: 'DARK' } } }], req: [{ f: { ...GY_M('self'), attr: 'DARK' }, n: 2 }] })],
  },
  'The Earth - Hex-Sealed Fusion': hexSealed('EARTH'),
};

// Simorgh, Bird of Ancestry: WIND monsters need 1 less Tribute while it is face-up.
MONSTERS_11['Simorgh, Bird of Ancestry'].effects![0].cond = (d, c) => (c.mark.tribCount ?? 0) > 0 && tributed(c).every((n) => d.allCards().some((x) => x.def.name === n && x.def.attr === 'WIND'));
// Raptinus: Gemini monsters on the field are awakened.
MONSTERS_11['Superalloy Beast Raptinus'] = {
  mats: [{ fn: (c) => c.def.ability === 'gemini', text: '1 Gemini Monster' }, { fn: (c) => c.def.ability === 'gemini', text: '1 Gemini Monster' }],
  onSummon: (_d, _src, c) => { if (c.def.ability === 'gemini') c.data.gemini = true; },
  onResolve: (d) => { for (const m of both(d)) if (m.def.ability === 'gemini' && m.faceUp) m.data.gemini = true; },
};
void attackOf; void isAttackOn; void has; void destroyAll; void search; void atEndPhase; void removeCtr; void tokens; void tokenDef; void OPP_M; void OWN_M; void M; void quick;
