// Every playable card with an effect is driven through its natural situations on a busy board
// (activation in each response window, summon, flip, battle, destruction). No engine exception may escape.
import fs from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuelEnd, opp, type Card, type Ev } from '../../src/engine/duel';
import { AIController } from '../../src/engine/ai';
import { CARDS, isExtraDeckCard } from '../../src/data/cards';
import { setup, mulberry, type SideSpec } from '../helpers';

const hasBehaviour = (c: (typeof CARDS)[number]) => !!(c.effects?.some((e) => e.ops.length || e.type !== 'activate') || c.statFn || c.auraFn || c.lock || c.negateFn
  || c.onSummon || c.preBattle || c.postBattle || c.battleDmg || c.equip || c.aura || c.rules || c.ruleIf || c.raceFn || c.attrFn || c.ssProc || c.winCheck
  || c.onResolve || c.onDamage || c.onMove || c.gyOnMove || c.afterBattle || c.lvFn || c.gyAuraFn);

const board = (): [SideSpec, SideSpec] => [{
  hand: ['Pot of Greed', 'Blue-Eyes White Dragon', 'Battle Ox', 'Mystical Space Typhoon', 'Dark Magician'],
  m: ['Summoned Skull', 'Harpie Lady', { name: 'Petit Moth' }, { name: 'Celtic Guardian', pos: 'def', faceUp: false }],
  s: ['Mirror Force', { name: 'Umi', faceUp: true }],
  gy: ['Dark Magician', 'Pot of Greed', 'Trap Hole', 'Blue-Eyes White Dragon', 'Battle Ox', 'Mystical Elf', 'Giant Rat', 'Feral Imp'],
  deck: ['Polymerization', 'Mystical Elf', 'Thunder Dragon', 'Dark Magician', 'Harpie Lady', 'Zoa', 'Labyrinth Wall', 'Petit Moth', 'Kuriboh'],
  extra: ['Flame Swordsman', 'Twin-Headed Thunder Dragon'],
  banished: ['Battle Ox', 'Mystical Elf', 'Feral Imp', 'Giant Rat', 'Celtic Guardian'],
}, {
  hand: ['Pot of Greed', 'Raigeki', 'Gaia The Fierce Knight', 'Spellbinding Circle', 'Monster Reborn', 'Kuriboh', 'Battle Ox'],
  m: ['Blue-Eyes White Dragon', 'Zoa', { name: 'Mystical Elf', pos: 'def' }, { name: 'Man-Eater Bug', pos: 'def', faceUp: false }],
  s: ['Trap Hole', { name: 'Swords of Revealing Light', faceUp: true }],
  gy: ['Summoned Skull', 'Raigeki', 'Red-Eyes B. Dragon', 'Feral Imp', 'Mirror Force'],
  extra: ['Gaia the Dragon Champion'],
}];

function windows(d: ReturnType<typeof setup>['d'], me: Card): Ev[] {
  const foe = d.monsters(1)[0];
  const mine = d.monsters(0)[0];
  const spell = d.mkCard(CARDS.find((c) => c.name === 'Raigeki')!, 1, 'hand');
  const link = { ...d.pseudoLink(spell, 1), isCard: true, eff: spell.def.effects![0], targets: [[mine]], tmv: [[mine.mv]] };
  return [
    { e: 'open', main: true, phase: 'M1' },
    { e: 'open', phase: 'SP' },
    { e: 'attack', attacker: foe, target: mine, player: 1 },
    { e: 'attack', attacker: foe, target: null, player: 1 },
    { e: 'summon', cards: [foe], player: 1, how: 'normal' },
    { e: 'summoning', cards: [foe], player: 1, how: 'normal' },
    { e: 'chain', link },
    { e: 'damage', player: 0, n: 1000, battle: true, src: foe, direct: true },
    { e: 'damage', player: 1, n: 1000, battle: true, src: mine, direct: true },
    { e: 'sent', card: mine, from: 'mzone', why: 'battle', by: 1, owner: 0, ctrl: 0 },
    { e: 'set', card: foe, player: 1 },
    { e: 'bounce', cards: [mine], player: 0 },
    { e: 'equip', card: me, target: foe },
    { e: 'draw', player: 1, n: 1, dp: false },
    { e: 'discard', player: 0, cards: [], by: null },
  ];
}

export const ends: string[] = [];
export const resolved = new Set<string>();
async function exercise(name: string, seed: number) {
  const [b0, b1] = board();
  const def = CARDS.find((c) => c.name === name)!;
  const t = setup(b0, b1, mulberry(seed));
  const { d } = t;
  d.onEvent = (e) => { if (e.t === 'resolve' && !e.negated && e.card.def.name === name) resolved.add(name); };
  d.ctl = [new AIController('hard', 0, mulberry(seed + 1)), new AIController('hard', 0, mulberry(seed + 2))];
  const card = d.mkCard(def, 0, 'hand');
  d.players[0].hand.push(card);
  try {
    if (def.kind === 'monster') {
      if (isExtraDeckCard(def)) { d.players[0].hand.splice(d.players[0].hand.indexOf(card), 1); d.players[0].extra.push(card); card.zone = 'extra'; }
      // ignition from hand, special summon, flip, ignition on field, battle, destruction
      for (const ev of windows(d, card)) if (t.canAct(card, 0, ev)) { await t.act(card, undefined, 0, ev); break; }
      if (card.zone === 'hand' || card.zone === 'extra') { card.properly = true; await d.specialSummon(card, 0, 'atk'); await d.settle(); }
      if (card.zone === 'mzone') {
        for (const ev of windows(d, card).slice(0, 1)) if (t.canAct(card, 0, ev)) await t.act(card, undefined, 0, ev);
        if (card.zone === 'mzone') { await d.setFaceDown(card); await d.changePos(card, 'reveal'); await d.settle(); }
        if (card.zone === 'mzone') { await d.changePos(card, 'def'); await d.changePos(card, 'atk'); await d.settle(); }
        d.phase = 'BP';
        const target = d.monsters(1)[0] ?? null;
        if (card.zone === 'mzone' && card.faceUp && card.pos === 'atk') { await (d as any).attack(card, target); await d.settle(); }
        if (card.zone === 'mzone' && d.monsters(1)[0]) { d.tp = 1; await (d as any).attack(d.monsters(1)[0], card); await d.settle(); d.tp = 0; }
        d.phase = 'M2';
        if (d.onField(card)) { await d.destroy(card, 'effect', undefined, 1); await d.settle(); }
      }
    } else {
      if (def.kind === 'trap') { d.players[0].hand.splice(d.players[0].hand.indexOf(card), 1); card.zone = 'hand'; d.players[0].hand.push(card); d.placeST(card, 0, false); card.turnIn = 1; }
      for (const ev of windows(d, card)) {
        if (!d.onField(card) && card.zone !== 'hand') break;
        if (ev.e === 'open' && ev.phase === 'SP') d.phase = 'SP';
        if (t.canAct(card, 0, ev)) { await t.act(card, undefined, 0, ev); break; }
        d.phase = 'M1';
      }
      d.phase = 'M1';
      // continuous cards: run a few turns of standby / end phase / battle so their hooks fire
      if (d.onField(card)) {
        for (const tp of [1, 0] as const) {
          d.tp = tp;
          d.turn++;
          await (d as any).standby();
          d.phase = 'BP';
          const a = d.monsters(tp).find((m) => d.canAttack(m));
          if (a) await (d as any).attack(a, d.attackTargets(a)[0] ?? null);
          await d.settle();
          d.phase = 'EP';
          await (d as any).endPhase();
        }
        for (let k = 0; k < (card.def.effects?.length ?? 0); k++) if (d.canActivate(card, k, d.tp, [{ e: 'open', main: true }], 1)) { await d.activate(card, k, d.tp, { e: 'open', main: true }); await d.chainLoop({ e: 'open', main: true }, opp(d.tp)); }
        if (d.onField(card)) { await d.destroy(card, 'effect', undefined, 1); await d.settle(); }
      }
    }
  } catch (e) {
    if (e instanceof DuelEnd) { ends.push(`${name}: ${e.reason}`); return; } // reaching 0 LP / winning is a legal outcome
    throw new Error(`${name}: ${(e as Error).stack}\n${d.logLines.slice(-15).join('\n')}`);
  }
}

const targets = CARDS.filter(hasBehaviour).map((c) => c.name);
test(`smoke: ${targets.length} effect cards run through their situations without errors`, async () => {
  const errors: string[] = [];
  for (const [i, name] of targets.entries()) {
    for (const seed of [11, 29]) {
      try { await exercise(name, seed * 1000 + i); } catch (e) { errors.push((e as Error).message.split('\n').slice(0, 6).join('\n')); break; }
    }
  }
  fs.mkdirSync('coverage', { recursive: true });
  fs.writeFileSync('coverage/smoke.json', JSON.stringify([...resolved].sort(), null, 1));
  if (process.env.SMOKE_REPORT) console.log([`resolved ${resolved.size}/${targets.length}; duel ended early: ${ends.length}`, ...ends.slice(0, 20), `never resolved: ${targets.filter((n) => !resolved.has(n)).join(', ')}`].join('\n'));
  assert.deepEqual(errors, []);
});
