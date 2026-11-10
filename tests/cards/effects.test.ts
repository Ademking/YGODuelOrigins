// Individual card effects: what they do, what they target, what they cost, and when they may be used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuelEnd, type Card, type Duel } from '../../src/engine/duel';
import { setup, pickNamed, respondWith, chooseOption, sayNo } from '../helpers';

const names = (cs: Card[]) => cs.map((c) => c.def.name).sort();
async function attack(d: Duel, att: Card, tgt: Card | null) {
  d.tp = att.ctrl;
  d.phase = 'BP';
  await (d as any).attack(att, tgt);
  await d.settle();
}
const endTurn = async (d: Duel, tp: 0 | 1) => { d.tp = tp; d.phase = 'EP'; await (d as any).endPhase(); };
const standby = async (d: Duel, tp: 0 | 1) => { d.turn++; d.tp = tp; d.phase = 'SP'; await (d as any).standby(); };

test('two copies of Reinforcements can activate in the same phase', async () => {
  const t = setup({ m: ['Battle Ox'], s: ['Reinforcements', 'Reinforcements'] });
  const [first, second] = t.P0.s.filter((card): card is Card => card !== null);
  const monster = t.find(0, 'Battle Ox');
  assert.ok(t.canAct(first));
  assert.ok(t.canAct(second));
  await t.act(first);
  assert.ok(t.d.mainActions(0, false).some((action) => action.a === 'act' && action.card === second));
  await t.act(second);
  assert.equal(t.d.atk(monster), 2700);
  assert.equal(t.P0.gy.filter((card) => card.def.name === 'Reinforcements').length, 2);
});

// ---------------------------------------------------------------- searchers & graveyard triggers
test('Sangan: sent from the field to the Graveyard, add a monster with 1500 or less ATK', async () => {
  const t = setup({ m: ['Sangan'], deck: ['Mystical Elf', 'Blue-Eyes White Dragon'] });
  await t.d.destroy(t.find(0, 'Sangan'), 'effect', undefined, 1);
  await t.d.settle();
  assert.ok(names(t.P0.hand).includes('Mystical Elf'));
  assert.ok(!names(t.P0.hand).includes('Blue-Eyes White Dragon'));
});

test('Witch of the Black Forest searches by DEF 1500 or less', async () => {
  const t = setup({ m: ['Witch of the Black Forest'], deck: ['Blue-Eyes White Dragon', 'Mystical Elf', 'Feral Imp'] });
  await t.d.destroy(t.find(0, 'Witch of the Black Forest'), 'effect');
  await t.d.settle();
  assert.deepEqual(names(t.P0.hand), ['Feral Imp'], 'only Feral Imp (1400 DEF) qualifies');
});

test('Cockroach Knight returns to the top of the Deck', async () => {
  const t = setup({ m: ['Cockroach Knight'] });
  await t.d.destroy(t.find(0, 'Cockroach Knight'), 'effect');
  await t.d.settle();
  assert.equal(t.P0.deck[t.P0.deck.length - 1].def.name, 'Cockroach Knight');
});

test('Sinister Serpent returns from the Graveyard to the hand in its Standby Phase', async () => {
  const t = setup({ gy: ['Sinister Serpent'] });
  await standby(t.d, 0);
  assert.ok(names(t.P0.hand).includes('Sinister Serpent'));
});

test('Marie the Fallen One heals from the Graveyard each Standby Phase', async () => {
  const t = setup({ gy: ['Marie the Fallen One'] });
  await standby(t.d, 0);
  assert.equal(t.P0.lp, 8200);
});

test('Minar inflicts 1000 when discarded by the opponent', async () => {
  const t = setup({}, { hand: ['Minar'] });
  await t.d.discard(1, [t.find(1, 'Minar')], 0);
  await t.d.settle();
  assert.equal(t.P0.lp, 7000);
});

// ---------------------------------------------------------------- battle
test('Kuriboh: discard from hand to take no battle damage', async () => {
  const t = setup({ hand: ['Kuriboh'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Kuriboh'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), null);
  assert.equal(t.P0.lp, 8000);
  assert.ok(t.P0.gy.some((c) => c.def.name === 'Kuriboh'));
});

test('Mirror Force destroys only Attack Position monsters of the attacker', async () => {
  const t = setup({ s: ['Mirror Force'] }, { m: ['Blue-Eyes White Dragon', 'Battle Ox', { name: 'Mystical Elf', pos: 'def' }] });
  t.answer(0, respondWith('Mirror Force'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), null);
  assert.deepEqual(names(t.d.monsters(1)), ['Mystical Elf']);
  assert.equal(t.P0.lp, 8000);
});

test('Waboku: no battle damage this turn', async () => {
  const t = setup({ s: ['Waboku'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Waboku'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), null);
  assert.equal(t.P0.lp, 8000);
});

test('Dimensional Warrior banishes itself and the monster it battles', async () => {
  const t = setup({ m: ['Dimensional Warrior'] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(0, 'Dimensional Warrior'), t.find(1, 'Blue-Eyes White Dragon'));
  assert.deepEqual(names(t.P0.banished), ['Dimensional Warrior']);
  assert.deepEqual(names(t.P1.banished), ['Blue-Eyes White Dragon']);
  assert.equal(t.P0.lp, 8000);
});

test('Mad Sword Beast inflicts piercing damage', async () => {
  const t = setup({ m: ['Mad Sword Beast'] }, { m: [{ name: 'Feral Imp', pos: 'def' }] });
  await attack(t.d, t.find(0, 'Mad Sword Beast'), t.find(1, 'Feral Imp'));
  assert.equal(t.P1.lp, 8000 - (1400 - 1400 + 0) - (1400 - 1400)); // Feral Imp DEF 1400: no excess
  const u = setup({ m: ['Mad Sword Beast'] }, { m: [{ name: 'Mystical Elf', pos: 'atk', faceUp: true }] });
  await u.d.changePos(u.find(1, 'Mystical Elf'), 'def');
  await attack(u.d, u.find(0, 'Mad Sword Beast'), u.find(1, 'Mystical Elf'));
  assert.equal(u.P1.lp, 8000, 'Mystical Elf DEF 2000 > 1400: no piercing');
});

test('Queen\'s Double may attack directly while the opponent has monsters', async () => {
  const t = setup({ m: ["Queen's Double"] }, { m: ['Blue-Eyes White Dragon'] });
  t.d.phase = 'BP';
  assert.ok(t.d.attackTargets(t.find(0, "Queen's Double")).includes(null));
  await attack(t.d, t.find(0, "Queen's Double"), null);
  assert.equal(t.P1.lp, 8000 - 350);
});

test('Zombyra the Dark cannot attack directly and loses 200 ATK per kill', async () => {
  const t = setup({ m: ['Zombyra the Dark'] }, { m: ['Battle Ox'] });
  const z = t.find(0, 'Zombyra the Dark');
  t.d.phase = 'BP';
  assert.ok(!t.d.attackTargets(z).includes(null));
  await attack(t.d, z, t.find(1, 'Battle Ox'));
  assert.equal(t.d.atk(z), 1900);
});

test('Dark Elf pays 1000 LP to attack; cannot attack with 1000 or less', async () => {
  const t = setup({ m: ['Dark Elf'] }, {});
  t.d.phase = 'BP';
  await attack(t.d, t.find(0, 'Dark Elf'), null);
  assert.equal(t.P0.lp, 7000);
  assert.equal(t.P1.lp, 6000);
  const u = setup({ m: ['Dark Elf'], lp: 1000 }, {});
  u.d.phase = 'BP';
  assert.equal(u.d.canAttack(u.find(0, 'Dark Elf')), false);
});

test('Panther Warrior must Tribute a monster to attack', async () => {
  const t = setup({ m: ['Panther Warrior'] }, {});
  t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(0, 'Panther Warrior')), false);
  const u = setup({ m: ['Panther Warrior', 'Battle Ox'] }, {});
  await attack(u.d, u.find(0, 'Panther Warrior'), null);
  assert.equal(u.P1.lp, 6000);
  assert.ok(u.P0.gy.some((c) => c.def.name === 'Battle Ox'));
});

test('Insect Queen gains 200 per Insect and leaves a token after destroying a monster', async () => {
  const t = setup({ m: ['Insect Queen', 'Petit Moth', 'Battle Ox'] }, { m: ['Feral Imp'] });
  const q = t.find(0, 'Insect Queen');
  assert.equal(t.d.atk(q), 2200 + 400);
  t.answer(0, pickNamed('Battle Ox'));
  await attack(t.d, q, t.find(1, 'Feral Imp'));
  await endTurn(t.d, 0);
  assert.ok(t.d.monsters(0).some((c) => c.def.name === 'Insect Monster Token'));
});

test('Kinetic Soldier gains 2000 only while battling a Warrior', async () => {
  const t = setup({ m: ['Kinetic Soldier'] }, { m: ['Celtic Guardian'] });
  const k = t.find(0, 'Kinetic Soldier');
  assert.equal(t.d.atk(k), 1350);
  await attack(t.d, k, t.find(1, 'Celtic Guardian'));
  assert.equal(t.d.monsters(1).length, 0);
  assert.equal(t.P1.lp, 8000 - (3350 - 1400));
});

test('Blast Sphere equips the attacker and blows up at the next Standby Phase', async () => {
  const t = setup({ m: [{ name: 'Blast Sphere', pos: 'def', faceUp: false }] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Blast Sphere'));
  assert.equal(t.find(0, 'Blast Sphere').zone, 'szone');
  t.d.turn = 5;
  await standby(t.d, 1);
  assert.equal(t.d.monsters(1).length, 0);
  assert.equal(t.P1.lp, 5000);
});

test('Wall of Illusion returns the attacker to the hand', async () => {
  const t = setup({ m: [{ name: 'Wall of Illusion', pos: 'def' }] }, { m: ['Battle Ox'] });
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'Wall of Illusion'));
  assert.ok(t.P1.hand.some((c) => c.def.name === 'Battle Ox'));
});

test('Zone Eater destroys the monster it attacked at the End Phase five turns later', async () => {
  const t = setup({ m: ['Zone Eater'] }, { m: [{ name: 'Mystical Elf', pos: 'def' }] });
  await attack(t.d, t.find(0, 'Zone Eater'), t.find(1, 'Mystical Elf'));
  const elf = t.find(1, 'Mystical Elf');
  for (let i = 0; i < 4; i++) { t.d.turn++; await endTurn(t.d, (t.d.turn % 2) as 0 | 1); }
  assert.equal(elf.zone, 'mzone');
  t.d.turn++;
  await endTurn(t.d, 0);
  assert.equal(elf.zone, 'gy');
});

test('Suijin reduces the attacker to 0 ATK once', async () => {
  const t = setup({ m: ['Suijin'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Suijin'));
  const bewd = t.find(1, 'Blue-Eyes White Dragon');
  await attack(t.d, bewd, t.find(0, 'Suijin'));
  assert.equal(bewd.zone, 'gy');
  assert.equal(t.P1.lp, 8000 - 2500);
});

// ---------------------------------------------------------------- continuous effects & locks
test('Jinzo: Traps cannot be activated and face-up Traps are negated', async () => {
  const t = setup({ m: ['Jinzo'] }, { s: ['Mirror Force', { name: 'Gravity Bind', faceUp: true }] });
  const mf = t.find(1, 'Mirror Force');
  assert.equal(t.d.canActivate(mf, 0, 1, [{ e: 'attack', attacker: t.find(0, 'Jinzo'), target: null, player: 0 }], 2), false);
  t.d.phase = 'BP';
  assert.ok(t.d.canAttack(t.find(0, 'Jinzo')), 'Gravity Bind is negated');
});

test('Royal Decree negates other Traps but not itself', async () => {
  const t = setup({ s: [{ name: 'Royal Decree', faceUp: true }] }, { s: ['Trap Hole'] });
  assert.ok(t.d.negated(t.find(1, 'Trap Hole')));
  assert.ok(!t.d.negated(t.find(0, 'Royal Decree')));
});

test('Imperial Order stops Spell activation', async () => {
  const t = setup({ hand: ['Pot of Greed'] }, { s: [{ name: 'Imperial Order', faceUp: true }] });
  assert.equal(t.canAct(t.find(0, 'Pot of Greed')), false);
});

test('Swords of Revealing Light: flips monsters, blocks attacks, fades after 3 opponent turns', async () => {
  const t = setup({ hand: ['Swords of Revealing Light'] }, { m: ['Blue-Eyes White Dragon', { name: 'Mystical Elf', pos: 'def', faceUp: false }] });
  const sw = t.find(0, 'Swords of Revealing Light');
  await t.act(sw);
  assert.ok(t.find(1, 'Mystical Elf').faceUp);
  assert.equal(sw.zone, 'szone');
  assert.equal(sw.def.lifetime! - sw.counter, 3);
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
  await endTurn(t.d, 0);
  assert.equal(sw.def.lifetime! - sw.counter, 3);
  await endTurn(t.d, 1);
  assert.equal(sw.def.lifetime! - sw.counter, 2);
  await endTurn(t.d, 1);
  assert.equal(sw.def.lifetime! - sw.counter, 1);
  await endTurn(t.d, 1);
  assert.equal(sw.zone, 'gy');
});

test('Messenger of Peace: 1500+ ATK monsters cannot attack; upkeep 100', async () => {
  const t = setup({ s: [{ name: 'Messenger of Peace', faceUp: true }], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  t.d.tp = 1; t.d.phase = 'BP'; t.d.turn = 4;
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
  await standby(t.d, 0);
  assert.equal(t.P0.lp, 7900);
});

test('The Dark Door allows only one attack per Battle Phase', async () => {
  const t = setup({ s: [{ name: 'The Dark Door', faceUp: true }], m: ['Battle Ox', 'Mystical Elf'] }, {});
  await attack(t.d, t.find(0, 'Battle Ox'), null);
  assert.equal(t.d.canAttack(t.find(0, 'Mystical Elf')), false);
});

test('Toll: each attack costs 500 LP', async () => {
  const t = setup({ s: [{ name: 'Toll', faceUp: true }], m: ['Battle Ox'] }, {});
  await attack(t.d, t.find(0, 'Battle Ox'), null);
  assert.equal(t.P0.lp, 7500);
});

test('Infinite Cards removes the hand limit', async () => {
  const t = setup({ s: [{ name: 'Infinite Cards', faceUp: true }], hand: Array(8).fill('Battle Ox') }, {});
  await endTurn(t.d, 0);
  assert.equal(t.P0.hand.length, 8);
  const u = setup({ hand: Array(8).fill('Battle Ox') }, {});
  await endTurn(u.d, 0);
  assert.equal(u.P0.hand.length, 6);
});

test('Mask of Restrict forbids Tributes (Tribute Summons and Tribute costs)', async () => {
  const t = setup({ hand: ['Summoned Skull'], m: ['Battle Ox', 'Cannon Soldier'] }, { s: [{ name: 'Mask of Restrict', faceUp: true }] });
  const acts = t.d.mainActions(0, false);
  assert.ok(!acts.some((a) => a.a === 'summon' && a.card.def.name === 'Summoned Skull'));
  assert.equal(t.canAct(t.find(0, 'Cannon Soldier')), false);
});

test('Light of Intervention: a Set monster is placed face-up', async () => {
  const t = setup({ hand: ['Battle Ox'] }, { s: [{ name: 'Light of Intervention', faceUp: true }] });
  const set = t.d.mainActions(0, false).find((a) => a.a === 'mset')!;
  await (t.d as any).perform(set);
  assert.ok(t.find(0, 'Battle Ox').faceUp);
  assert.equal(t.find(0, 'Battle Ox').pos, 'def');
});

test('Gravity Bind stops Level 4+ monsters from attacking', async () => {
  const t = setup({ s: [{ name: 'Gravity Bind', faceUp: true }] }, { m: ['Battle Ox', 'Petit Moth'] });
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Battle Ox')), false);
  assert.ok(t.d.canAttack(t.find(1, 'Petit Moth')));
});

test('Lord of D. protects Dragons from targeting', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { m: ['Lord of D.', 'Blue-Eyes White Dragon'] });
  const coh = t.find(0, 'Change of Heart');
  const cands = t.d.targetCands(coh.def.effects![0], 0, 0, coh);
  assert.deepEqual(names(cands), ['Lord of D.']);
});

test('Deepsea Warrior is unaffected by Spells while Umi is face-up', async () => {
  const t = setup({ hand: ['Dark Hole'] }, { m: ['Deepsea Warrior', 'Battle Ox'], f: 'Umi' });
  await t.act(t.find(0, 'Dark Hole'));
  assert.deepEqual(names(t.d.monsters(1)), ['Deepsea Warrior']);
});

test('The Legendary Fisherman cannot be attacked while Umi is face-up', async () => {
  const t = setup({ m: ['Blue-Eyes White Dragon'] }, { m: ['The Legendary Fisherman', 'Battle Ox'], f: 'Umi' });
  t.d.phase = 'BP';
  assert.deepEqual(names(t.d.attackTargets(t.find(0, 'Blue-Eyes White Dragon')) as Card[]), ['Battle Ox']);
});

test('Hoshiningen: LIGHT +500, DARK -400', async () => {
  const t = setup({ m: ['Hoshiningen', 'Mystical Elf'] }, { m: ['Dark Magician'] });
  assert.equal(t.d.atk(t.find(0, 'Mystical Elf')), 1300);
  assert.equal(t.d.atk(t.find(1, 'Dark Magician')), 2100);
});

test('Dark Magician Girl gains 300 per Dark Magician in the Graveyards', async () => {
  const t = setup({ m: ['Dark Magician Girl'], gy: ['Dark Magician'] }, { gy: ['Dark Magician'] });
  assert.equal(t.d.atk(t.find(0, 'Dark Magician Girl')), 2600);
});

test('Machine King and Buster Blader count the field (and Graveyard)', async () => {
  const t = setup({ m: ['Machine King', 'Cannon Soldier', 'Buster Blader'] }, { m: ['Blue-Eyes White Dragon'], gy: ['Red-Eyes B. Dragon'] });
  assert.equal(t.d.atk(t.find(0, 'Machine King')), 2400);
  assert.equal(t.d.atk(t.find(0, 'Buster Blader')), 3600);
});

test('Megamorph doubles original ATK when your LP are lower, halves it when higher', async () => {
  const t = setup({ hand: ['Megamorph'], m: ['Battle Ox'], lp: 4000 }, {});
  t.answer(0, pickNamed('Battle Ox'));
  await t.act(t.find(0, 'Megamorph'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 3400);
  t.P0.lp = 9000;
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 850);
});

test('United We Stand: +800 for each face-up monster you control', async () => {
  const t = setup({ hand: ['United We Stand'], m: ['Battle Ox', 'Feral Imp'] }, {});
  t.answer(0, pickNamed('Battle Ox'));
  await t.act(t.find(0, 'United We Stand'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1700 + 1600);
});

test('Reverse Trap flips the sign of every modifier this turn', async () => {
  const t = setup({ m: ['Battle Ox'], s: ['Reverse Trap'] }, {});
  t.d.addMod(t.find(0, 'Battle Ox'), 500, 0);
  await t.act(t.find(0, 'Reverse Trap'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1200);
});

test('DNA Surgery changes every face-up monster\'s Type', async () => {
  const t = setup({ s: ['DNA Surgery'], hand: ['Warrior Elimination'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, chooseOption('Warrior'));
  await t.act(t.find(0, 'DNA Surgery'));
  await t.act(t.find(0, 'Warrior Elimination'));
  assert.equal(t.d.monsters(1).length, 0);
});

test('Thousand-Eyes Restrict absorbs a monster and stops other monsters attacking', async () => {
  const t = setup({ m: ['Thousand-Eyes Restrict', 'Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  const ter = t.find(0, 'Thousand-Eyes Restrict');
  ter.properly = true;
  await t.act(ter);
  assert.equal(t.d.atk(ter), 3000);
  t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(0, 'Battle Ox')), false);
  assert.ok(t.d.canAttack(ter));
});

test('Relinquished: the absorbed monster is destroyed in its place', async () => {
  const t = setup({ m: ['Relinquished'] }, { m: ['Battle Ox', 'Blue-Eyes White Dragon'] });
  const r = t.find(0, 'Relinquished');
  t.answer(0, pickNamed('Battle Ox'));
  await t.act(r);
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), r);
  assert.equal(r.zone, 'mzone');
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
  assert.equal(t.P0.lp, 8000 - 1300);
  assert.equal(t.P1.lp, 8000 - 1300, 'the damage is reflected');
});

// ---------------------------------------------------------------- tokens & control
test('Ojama Trio inflicts 300 damage per destroyed token to its controller', async () => {
  const t = setup({}, { s: ['Ojama Trio'] });
  await t.act(t.find(1, 'Ojama Trio'), undefined, 1);
  const tokens = t.d.monsters(0).filter((card) => card.def.name === 'Ojama Token');
  await t.d.destroy(tokens[0], 'effect', undefined, 1);
  await t.d.destroy(tokens[1], 'battle', undefined, 1);
  await t.d.settle();
  assert.equal(t.P0.lp, 7400);
  assert.equal(t.P1.lp, 8000);
  await t.d.move(tokens[2], 'gy', { why: 'tribute' });
  await t.d.settle();
  assert.equal(t.P0.lp, 7400);
});

test('a destroyed Ojama Token damages its controller, not its owner', async () => {
  const t = setup();
  const token = await t.d.summonToken(0, 'Ojama Token');
  assert.ok(token);
  await t.d.takeControl(token, 1, true);
  await t.d.destroy(token, 'effect', undefined, 0);
  await t.d.settle();
  assert.equal(t.P0.lp, 8000);
  assert.equal(t.P1.lp, 7700);
});

test('Ojama Trio tokens are excluded from Tribute Summons and effect costs', async () => {
  const t = setup({ hand: ['Summoned Skull'], m: ['Cannon Soldier'] }, { s: ['Ojama Trio'] });
  await t.act(t.find(1, 'Ojama Trio'), undefined, 1);
  const tokens = t.d.monsters(0).filter((card) => card.def.name === 'Ojama Token');
  assert.equal(tokens.length, 3);
  assert.ok(tokens.every((token) => !t.d.tributeOk(token)));
  assert.ok(tokens.every((token) => !t.d.tributePool(0).includes(token)));
  const summon = t.d.mainActions(0, false).find((action) => action.a === 'summon' && action.card.def.name === 'Summoned Skull');
  assert.ok(summon);
  assert.deepEqual(t.d.tributePool(0).map((card) => card.def.name), ['Cannon Soldier']);
  t.answer(0, pickNamed('Cannon Soldier'));
  await (t.d as any).perform(summon);
  assert.equal(t.find(0, 'Cannon Soldier').zone, 'gy');
  assert.equal(tokens.filter((token) => token.zone === 'mzone').length, 3);

  const other = setup({ m: ['Cannon Soldier'] }, { s: ['Ojama Trio'] });
  await other.act(other.find(1, 'Ojama Trio'), undefined, 1);
  const soldier = other.find(0, 'Cannon Soldier');
  await other.act(other.find(0, 'Cannon Soldier'));
  assert.equal(soldier.zone, 'gy');
  assert.equal(other.d.monsters(0).filter((card) => card.def.name === 'Ojama Token').length, 3);
  assert.equal(other.P1.lp, 7500);
});

test('Ojama Tokens cannot enable a Tribute Summon or Tribute Set', async () => {
  const t = setup({ hand: ['Summoned Skull'] }, { s: ['Ojama Trio'] });
  await t.act(t.find(1, 'Ojama Trio'), undefined, 1);
  const actions = t.d.mainActions(0, false);
  assert.equal(actions.some((action) => action.a === 'summon' && action.card.def.name === 'Summoned Skull'), false);
  assert.equal(actions.some((action) => action.a === 'mset' && action.card.def.name === 'Summoned Skull'), false);
});

test('Scapegoat: four Sheep Tokens that cannot be Tributed and vanish when destroyed', async () => {
  const t = setup({ hand: ['Scapegoat', 'Summoned Skull'] }, {});
  await t.act(t.find(0, 'Scapegoat'));
  const sheep = t.d.monsters(0).filter((c) => c.def.name === 'Sheep Token');
  assert.equal(sheep.length, 4);
  assert.equal(t.d.tributePool(0).length, 0);
  assert.ok(t.d.hasTemp('noSummon', 0));
  await t.d.destroy(sheep[0], 'effect');
  assert.equal(t.P0.gy.length, 1, 'only Scapegoat is in the Graveyard');
});

test('Snatch Steal: control lasts while equipped, the owner heals each Standby Phase', async () => {
  const t = setup({ hand: ['Snatch Steal'] }, { m: ['Blue-Eyes White Dragon'] });
  const bewd = t.find(1, 'Blue-Eyes White Dragon');
  await t.act(t.find(0, 'Snatch Steal'));
  assert.equal(bewd.ctrl, 0);
  await endTurn(t.d, 0);
  assert.equal(bewd.ctrl, 0, 'not returned at End Phase');
  await standby(t.d, 1);
  assert.equal(t.P1.lp, 9000);
  await t.d.destroy(t.find(0, 'Snatch Steal'), 'effect');
  await t.d.cleanup();
  assert.equal(bewd.ctrl, 1);
});

test('Change of Heart returns control at the End Phase', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Change of Heart'));
  const bewd = t.find(1, 'Blue-Eyes White Dragon');
  assert.equal(bewd.ctrl, 0);
  await endTurn(t.d, 0);
  assert.equal(bewd.ctrl, 1);
});

test('Premature Burial: pay 800, revive, and the monster dies with the card', async () => {
  const t = setup({ hand: ['Premature Burial'], gy: ['Blue-Eyes White Dragon'] }, {});
  await t.act(t.find(0, 'Premature Burial'));
  assert.equal(t.P0.lp, 7200);
  const bewd = t.find(0, 'Blue-Eyes White Dragon');
  assert.equal(bewd.zone, 'mzone');
  await t.d.destroy(t.find(0, 'Premature Burial'), 'effect');
  assert.equal(bewd.zone, 'gy');
});

test('Call Of The Haunted is destroyed with the monster it revived', async () => {
  const t = setup({ s: ['Call Of The Haunted'], gy: ['Blue-Eyes White Dragon'] }, {});
  await t.act(t.find(0, 'Call Of The Haunted'));
  const bewd = t.find(0, 'Blue-Eyes White Dragon');
  assert.equal(bewd.zone, 'mzone');
  await t.d.destroy(bewd, 'effect');
  await t.d.cleanup();
  assert.equal(t.find(0, 'Call Of The Haunted').zone, 'gy');
});

test('destroying Call Of The Haunted destroys the monster it revived', async () => {
  const t = setup({ s: ['Call Of The Haunted'], gy: ['Blue-Eyes White Dragon'] }, {});
  const trap = t.find(0, 'Call Of The Haunted');
  const monster = t.find(0, 'Blue-Eyes White Dragon');
  await t.act(trap);
  assert.equal(monster.zone, 'mzone');
  await t.d.destroy(trap, 'effect', undefined, 1);
  await t.d.settle();
  assert.equal(trap.zone, 'gy');
  assert.equal(monster.zone, 'gy');
});

test('Call Of The Haunted cannot revive a monster after it is destroyed in the chain', async () => {
  const t = setup({ s: ['Call Of The Haunted'], gy: ['Blue-Eyes White Dragon'] }, { s: ['Mystical Space Typhoon'] });
  const trap = t.find(0, 'Call Of The Haunted');
  const monster = t.find(0, 'Blue-Eyes White Dragon');
  t.answer(1, respondWith('Mystical Space Typhoon'), pickNamed('Call Of The Haunted'));
  await t.act(trap);
  assert.equal(trap.zone, 'gy');
  assert.equal(monster.zone, 'gy');
});

test('Parasite Paracide: flips into the opponent\'s Deck, summons itself when drawn', async () => {
  const t = setup({ m: [{ name: 'Parasite Paracide', pos: 'def', faceUp: false }] }, { m: ['Blue-Eyes White Dragon'] });
  const pp = t.find(0, 'Parasite Paracide');
  await t.d.changePos(pp, 'reveal');
  await t.d.settle();
  assert.equal(pp.zone, 'deck');
  assert.ok(t.P1.deck.includes(pp));
  t.P1.deck.splice(t.P1.deck.indexOf(pp), 1);
  t.P1.deck.push(pp);
  await t.d.draw(1, 1);
  await t.d.settle();
  assert.equal(pp.zone, 'mzone');
  assert.equal(pp.ctrl, 1);
  assert.equal(t.P1.lp, 7000);
  assert.equal(t.d.raceOf(t.find(1, 'Blue-Eyes White Dragon')), 'Insect');
});

// ---------------------------------------------------------------- summoning procedures
test('Gate Guardian is Special Summoned by Tributing Sanga, Kazejin and Suijin', async () => {
  const t = setup({ hand: ['Gate Guardian'], m: ['Sanga of the Thunder', 'Kazejin', 'Suijin'] }, {});
  const ss = t.d.mainActions(0, false).find((a) => a.a === 'ss' && a.card.def.name === 'Gate Guardian');
  assert.ok(ss);
  await (t.d as any).perform(ss);
  assert.deepEqual(names(t.d.monsters(0)), ['Gate Guardian']);
});

test('The Rock Spirit needs an EARTH monster in the Graveyard to banish', async () => {
  const t = setup({ hand: ['The Rock Spirit'] }, {});
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'ss'));
  const u = setup({ hand: ['The Rock Spirit'], gy: ['Battle Ox'] }, {});
  const ss = u.d.mainActions(0, false).find((a) => a.a === 'ss')!;
  await (u.d as any).perform(ss);
  assert.equal(u.find(0, 'The Rock Spirit').zone, 'mzone');
  assert.equal(u.P0.banished.length, 1);
});

test('Ritual Spells summon their Ritual Monster by Tributing enough Levels', async () => {
  const t = setup({ hand: ['Black Luster Ritual', 'Black Luster Soldier', 'Summoned Skull', 'Battle Ox'] }, {});
  t.answer(0, pickNamed('Summoned Skull', 'Battle Ox'));
  await t.act(t.find(0, 'Black Luster Ritual'));
  assert.equal(t.find(0, 'Black Luster Soldier').zone, 'mzone');
  assert.ok(t.find(0, 'Black Luster Soldier').properly);
});

test('Fusion cannot activate on a full field without a usable field material', () => {
  const t = setup({ hand: ['Polymerization', 'Flame Manipulator', 'Masaki the Legendary Swordsman'], m: ['Battle Ox', 'Sangan', 'Celtic Guardian', 'Mystical Elf', 'Kuriboh'], extra: ['Flame Swordsman'] });
  assert.equal(t.canAct(t.find(0, 'Polymerization')), false);
  assert.equal(t.P0.hand.length, 3);
  assert.equal(t.P0.gy.length, 0);
});

test('Fusion on a full field requires selecting a material that frees a zone', async () => {
  const t = setup({ hand: ['Polymerization', 'Flame Manipulator', 'Masaki the Legendary Swordsman'], m: ['Flame Manipulator', 'Battle Ox', 'Sangan', 'Celtic Guardian', 'Mystical Elf'], extra: ['Flame Swordsman'] });
  const fieldMaterial = t.P0.m.find(card => card?.def.name === 'Flame Manipulator')!;
  t.answer(0, prompt => {
    if (prompt.t !== 'select' || !prompt.text.startsWith('Select Fusion Material:')) return undefined;
    if (prompt.cards.includes(fieldMaterial)) {
      assert.deepEqual(prompt.cards, [fieldMaterial]);
      return [fieldMaterial];
    }
    return [prompt.cards[0]];
  });
  await t.act(t.find(0, 'Polymerization'));
  assert.equal(fieldMaterial.zone, 'gy');
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'mzone');
  assert.equal(t.P0.hand.filter(card => card.def.name === 'Flame Manipulator').length, 1);
});

test('opponent materials do not free a zone for a Fusion Summon', () => {
  const t = setup({ m: ['Battle Ox', 'Sangan', 'Celtic Guardian', 'Mystical Elf', 'Kuriboh'], extra: ['Flame Swordsman'] }, { m: ['Flame Manipulator', 'Masaki the Legendary Swordsman'] });
  assert.equal(t.d.fusionOptions(0, undefined, { pool: () => [...t.d.monsters(0), ...t.d.monsters(1)] }).length, 0);
});

test('Fusion substitute: Mystical Sheep #1 replaces one named material', async () => {
  const t = setup({ hand: ['Polymerization', 'Mystical Sheep #1', 'Masaki the Legendary Swordsman'], extra: ['Flame Swordsman'] }, {});
  await t.act(t.find(0, 'Polymerization'));
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'mzone');
});

test('Toon Dark Magician Girl requires Toon World and an eligible Tribute', async () => {
  const noWorld = setup({ hand: ['Toon Dark Magician Girl'], m: ['Battle Ox'] });
  assert.equal(noWorld.d.mainActions(0, false).some((action) => action.a === 'ss' && action.card.def.name === 'Toon Dark Magician Girl'), false);
  const noTribute = setup({ hand: ['Toon Dark Magician Girl'], s: [{ name: 'Toon World', faceUp: true }] });
  assert.equal(noTribute.d.mainActions(0, false).some((action) => action.a === 'ss' && action.card.def.name === 'Toon Dark Magician Girl'), false);

  const t = setup({ hand: ['Toon Dark Magician Girl'], m: ['Battle Ox', 'Cannon Soldier', 'Kuriboh', 'Sangan', 'Mystic Tomato'], s: [{ name: 'Toon World', faceUp: true }] });
  const action = t.d.mainActions(0, false).find((candidate) => candidate.a === 'ss' && candidate.card.def.name === 'Toon Dark Magician Girl');
  assert.ok(action);
  t.answer(0, pickNamed('Battle Ox'));
  await (t.d as any).perform(action);
  assert.equal(t.find(0, 'Battle Ox').zone, 'gy');
  assert.equal(t.find(0, 'Toon Dark Magician Girl').zone, 'mzone');
  assert.equal(t.d.monsters(0).length, 5);
});

test('Toons need Toon World, attack directly when the opponent has no Toon, and die with it', async () => {
  const t = setup({ hand: ['Toon Mermaid'] }, { m: ['Battle Ox'] });
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'summon'));
  const u = setup({ hand: ['Toon Mermaid'], s: [{ name: 'Toon World', faceUp: true }] }, { m: ['Battle Ox'] });
  const sum = u.d.mainActions(0, false).find((a) => a.a === 'summon')!;
  await (u.d as any).perform(sum);
  const tm = u.find(0, 'Toon Mermaid');
  u.d.phase = 'BP';
  assert.equal(u.d.canAttack(tm), false, 'not the turn it was summoned');
  u.d.turn++;
  await attack(u.d, tm, null);
  assert.equal(u.P1.lp, 8000 - 1400);
  assert.equal(u.P0.lp, 7500);
  await u.d.destroy(u.find(0, 'Toon World'), 'effect');
  await u.d.cleanup();
  assert.equal(tm.zone, 'gy');
});

test('Cocoon of Evolution: equip Petit Moth, then Great Moth after 4 Standby Phases', async () => {
  const t = setup({ m: ['Petit Moth', 'Cocoon of Evolution'], deck: ['Great Moth'] }, {});
  const cocoon = t.find(0, 'Cocoon of Evolution');
  await t.act(cocoon, 0);
  assert.equal(cocoon.zone, 'szone');
  assert.equal(t.d.defv(t.find(0, 'Petit Moth')), 2000);
  for (let i = 0; i < 4; i++) await standby(t.d, 0);
  t.d.phase = 'M1';
  await t.act(cocoon, 1);
  assert.equal(t.find(0, 'Great Moth').zone, 'mzone');
});

// ---------------------------------------------------------------- flips & coins
test('Cyber Jar destroys every monster and summons Level 4 or lower from the top 5', async () => {
  const t = setup({ m: [{ name: 'Cyber Jar', pos: 'def', faceUp: false }], deck: ['Feral Imp', 'Pot of Greed'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.d.changePos(t.find(0, 'Cyber Jar'), 'reveal');
  await t.d.settle();
  assert.ok(t.d.monsters(0).some((c) => c.def.name === 'Feral Imp'));
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Pot of Greed'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
});

test('Morphing Jar: both players discard their hands and draw 5', async () => {
  const t = setup({ m: [{ name: 'Morphing Jar', pos: 'def', faceUp: false }], hand: ['Pot of Greed'] }, { hand: ['Raigeki', 'Dark Hole'] });
  await t.d.changePos(t.find(0, 'Morphing Jar'), 'reveal');
  await t.d.settle();
  assert.equal(t.P0.hand.length, 5);
  assert.equal(t.P1.hand.length, 5);
  assert.ok(t.P1.gy.some((c) => c.def.name === 'Raigeki'));
});

test('Time Wizard: calling right destroys the opponent\'s monsters', async () => {
  const t = setup({ m: ['Time Wizard'] }, { m: ['Blue-Eyes White Dragon', 'Battle Ox'] }, () => 0.2);
  const events: boolean[][] = [];
  t.d.onEvent = async (event) => { if (event.t === 'coinToss') events.push(event.results); };
  await t.act(t.find(0, 'Time Wizard'));
  assert.deepEqual(events, [[true]]);
  assert.equal(t.d.monsters(1).length, 0);
  const u = setup({ m: ['Time Wizard', 'Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] }, () => 0.8);
  const wrongEvents: boolean[][] = [];
  u.d.onEvent = async (event) => { if (event.t === 'coinToss') wrongEvents.push(event.results); };
  await u.act(u.find(0, 'Time Wizard'));
  assert.deepEqual(wrongEvents, [[false]]);
  assert.equal(u.d.monsters(0).length, 0);
  assert.equal(u.P0.lp, 8000 - Math.floor((500 + 1700) / 2));
});

test('Barrel Dragon needs 2 of 3 heads', async () => {
  const t = setup({ m: ['Barrel Dragon'] }, { m: ['Blue-Eyes White Dragon'] }, () => 0.9);
  await t.act(t.find(0, 'Barrel Dragon'));
  assert.equal(t.d.monsters(1).length, 1);
  const u = setup({ m: ['Barrel Dragon'] }, { m: ['Blue-Eyes White Dragon'] }, () => 0.1);
  await u.act(u.find(0, 'Barrel Dragon'));
  assert.equal(u.d.monsters(1).length, 0);
});

test('Barrel Dragon reports all tosses and is usable once per turn', async () => {
  const rolls = [0.1, 0.9, 0.1];
  const t = setup({ m: ['Barrel Dragon'] }, { m: ['Blue-Eyes White Dragon', 'Battle Ox'] }, () => rolls.shift() ?? 0.1);
  const results: boolean[][] = [];
  t.d.onEvent = (event) => { if (event.t === 'coinToss') results.push(event.results); };
  const dragon = t.find(0, 'Barrel Dragon');
  assert.equal(t.canAct(dragon), true);
  await t.act(dragon);
  assert.deepEqual(results, [[true, false, true]]);
  assert.equal(t.d.monsters(1).length, 1);
  assert.equal(t.canAct(dragon), false);
  t.d.turn++;
  assert.equal(t.canAct(dragon), true);
});

// ---------------------------------------------------------------- hand, deck & graveyard spells
test('Card Destruction: discard hands and draw the same number', async () => {
  const t = setup({ hand: ['Card Destruction', 'Battle Ox', 'Feral Imp'] }, { hand: ['Raigeki', 'Dark Hole', 'Pot of Greed'] });
  await t.act(t.find(0, 'Card Destruction'));
  assert.equal(t.P0.hand.length, 2);
  assert.equal(t.P1.hand.length, 3);
  assert.equal(t.P1.gy.length, 3);
});

test('Painful Choice: the opponent picks which of 5 cards is added', async () => {
  const t = setup({ hand: ['Painful Choice'] }, {});
  await t.act(t.find(0, 'Painful Choice'));
  assert.equal(t.P0.hand.length, 1);
  assert.equal(t.P0.gy.length, 5);
});

test('Confiscation: pay 1000, look at the hand and discard a card', async () => {
  const t = setup({ hand: ['Confiscation'] }, { hand: ['Raigeki', 'Battle Ox'] });
  t.answer(0, pickNamed('Raigeki'));
  await t.act(t.find(0, 'Confiscation'));
  assert.equal(t.P0.lp, 7000);
  assert.deepEqual(names(t.P1.hand), ['Battle Ox']);
  assert.ok((t.ctl[0].seen.find((p) => p.t === 'select') as any).reveal);
});

test('Exchange: each player takes a card; it goes to its owner\'s Graveyard later', async () => {
  const t = setup({ hand: ['Exchange', 'Battle Ox'] }, { hand: ['Raigeki'], m: ['Feral Imp'] });
  await t.act(t.find(0, 'Exchange'));
  const raigeki = t.P0.hand.find((c) => c.def.name === 'Raigeki')!;
  assert.ok(raigeki);
  assert.ok(t.P1.hand.some((c) => c.def.name === 'Battle Ox'));
  await t.act(raigeki);
  assert.ok(t.P1.gy.includes(raigeki), "Raigeki goes to its owner's Graveyard");
});

test('Graverobber: use the opponent\'s Spell for 2000 LP', async () => {
  const t = setup({ s: ['Graverobber'] }, { gy: ['Pot of Greed'] });
  await t.act(t.find(0, 'Graverobber'));
  const pot = t.P0.hand.find((c) => c.def.name === 'Pot of Greed')!;
  await t.act(pot);
  assert.equal(t.P0.lp, 6000);
  assert.equal(t.P0.hand.length, 2);
  assert.ok(t.P1.gy.includes(pot));
});

test('Prohibition: the declared card cannot be activated', async () => {
  const t = setup({ s: ['Prohibition'] }, { hand: ['Raigeki'] });
  t.answer(0, pickNamed('Raigeki'));
  await t.act(t.find(0, 'Prohibition'));
  t.d.tp = 1;
  assert.equal(t.canAct(t.find(1, 'Raigeki'), 1), false);
});

test('Last Will: a monster leaving the field lets you summon 1500 ATK or less from the Deck', async () => {
  const t = setup({ hand: ['Last Will'], m: ['Battle Ox'], deck: ['Feral Imp'] }, {});
  await t.act(t.find(0, 'Last Will'));
  await t.d.destroy(t.find(0, 'Battle Ox'), 'effect');
  await t.d.settle();
  assert.equal(t.d.monsters(0).length, 1);
});

test('Monster Reborn cannot revive an improperly summoned Ritual Monster', async () => {
  const t = setup({ hand: ['Monster Reborn'], gy: ['Black Luster Soldier'] }, {});
  assert.equal(t.canAct(t.find(0, 'Monster Reborn')), false);
});

// ---------------------------------------------------------------- traps & response timings
test('Trap Hole responds to a Normal Summon but not a Special Summon', async () => {
  const t = setup({ s: ['Trap Hole'] }, { m: [] });
  const trap = t.find(0, 'Trap Hole');
  const ox = t.d.mkCard(t.find(0, 'Trap Hole').def, 1, 'hand');
  void ox;
  const bewd = t.d.mkCard((await import('../helpers')).byName('Blue-Eyes White Dragon'), 1, 'hand');
  t.P1.hand.push(bewd);
  t.d.placeMonster(bewd, 1, true, 'atk');
  assert.ok(t.d.canActivate(trap, 0, 0, [{ e: 'summon', cards: [bewd], player: 1, how: 'normal' }], 2));
  assert.ok(!t.d.canActivate(trap, 0, 0, [{ e: 'summon', cards: [bewd], player: 1, how: 'special' }], 2));
});

test('Eatgaboon: summoned monster with 500 or less ATK is destroyed', async () => {
  const t = setup({ s: ['Eatgaboon'] }, { hand: ['Petit Moth'] });
  t.answer(0, respondWith('Eatgaboon'));
  t.d.tp = 1;
  const sum = t.d.mainActions(1, false).find((a) => a.a === 'summon' && a.card.def.name === 'Petit Moth')!;
  await (t.d as any).perform(sum);
  await t.d.settle();
  assert.equal(t.find(1, 'Petit Moth').zone, 'gy');
});

test('Solemn Judgment negates a summon for half your LP', async () => {
  const t = setup({ s: ['Solemn Judgment'] }, { hand: ['Battle Ox'] });
  t.answer(0, respondWith('Solemn Judgment'));
  t.d.tp = 1;
  await (t.d as any).perform(t.d.mainActions(1, false).find((a) => a.a === 'summon')!);
  await t.d.settle();
  assert.equal(t.P0.lp, 4000);
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
});

test('Horn of Heaven needs a Tribute as cost', async () => {
  const t = setup({ s: ['Horn of Heaven'] }, { hand: ['Battle Ox'] });
  const horn = t.find(0, 'Horn of Heaven');
  const ev = { e: 'summoning' as const, cards: [], player: 1 as const, how: 'normal' as const };
  assert.equal(t.d.canActivate(horn, 0, 0, [ev], 3), false);
  const u = setup({ s: ['Horn of Heaven'], m: ['Feral Imp'] }, {});
  assert.ok(u.d.canActivate(u.find(0, 'Horn of Heaven'), 0, 0, [ev], 3));
});

test('Seven Tools of the Bandit cannot be paid with 1000 LP or less', async () => {
  const t = setup({ s: ['Seven Tools of the Bandit'], lp: 1000 }, {});
  const tools = t.find(0, 'Seven Tools of the Bandit');
  const trap = t.d.mkCard(tools.def, 1, 'hand');
  const ev = { e: 'chain' as const, link: { ...t.d.pseudoLink(trap, 1), isCard: true } };
  assert.equal(t.d.canActivate(tools, 0, 0, [{ e: 'open' }, ev], 2), false);
  t.P0.lp = 1001;
  assert.ok(t.d.canActivate(tools, 0, 0, [{ e: 'open' }, ev], 2));
});

test('Chain: Magic Jammer negates Pot of Greed; Seven Tools negates Magic Jammer', async () => {
  const t = setup({ hand: ['Pot of Greed'], s: ['Seven Tools of the Bandit'] }, { s: ['Magic Jammer'], hand: ['Battle Ox'] });
  t.answer(1, respondWith('Magic Jammer'));
  t.answer(0, respondWith('Seven Tools of the Bandit'));
  await t.act(t.find(0, 'Pot of Greed'));
  assert.equal(t.P0.hand.length, 2, 'Pot of Greed resolved');
  assert.equal(t.P0.lp, 7000);
  assert.ok(t.P1.gy.some((c) => c.def.name === 'Magic Jammer'));
  assert.ok(t.P1.gy.some((c) => c.def.name === 'Battle Ox'), 'discard cost paid');
});

test('Spiritualism cannot be negated', async () => {
  const t = setup({ hand: ['Spiritualism'] }, { s: ['Magic Jammer', { name: 'Gravity Bind', faceUp: true }], hand: ['Battle Ox'] });
  t.answer(1, respondWith('Magic Jammer'));
  t.answer(0, pickNamed('Gravity Bind'));
  await t.act(t.find(0, 'Spiritualism'));
  assert.ok(t.P1.hand.some((c) => c.def.name === 'Gravity Bind'));
});

test('White Hole saves your monsters from Dark Hole', async () => {
  const t = setup({ hand: ['Dark Hole'], m: ['Battle Ox'] }, { s: ['White Hole'], m: ['Blue-Eyes White Dragon'] });
  t.answer(1, respondWith('White Hole'));
  await t.act(t.find(0, 'Dark Hole'));
  assert.equal(t.find(0, 'Battle Ox').zone, 'gy');
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'mzone');
});

test('Anti Raigeki turns Raigeki back on its user', async () => {
  const t = setup({ hand: ['Raigeki'], m: ['Battle Ox'] }, { s: ['Anti Raigeki'], m: ['Blue-Eyes White Dragon'] });
  t.answer(1, respondWith('Anti Raigeki'));
  await t.act(t.find(0, 'Raigeki'));
  assert.equal(t.find(0, 'Battle Ox').zone, 'gy');
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'mzone');
});

test('Fake Trap is destroyed in place of your other Traps', async () => {
  const t = setup({ hand: ['Mystical Space Typhoon'] }, { s: ['Fake Trap', 'Mirror Force'] });
  t.answer(0, pickNamed('Mirror Force'));
  t.answer(1, respondWith('Fake Trap'));
  await t.act(t.find(0, 'Mystical Space Typhoon'));
  assert.equal(t.find(1, 'Mirror Force').zone, 'szone');
});

test('Mystical Refpanel reflects a burn Spell', async () => {
  const t = setup({ hand: ['Ookazi'] }, { s: ['Mystical Refpanel'] });
  t.answer(1, respondWith('Mystical Refpanel'));
  await t.act(t.find(0, 'Ookazi'));
  assert.equal(t.P0.lp, 7200);
  assert.equal(t.P1.lp, 8000);
});

test('Numinous Healer and Attack and Receive respond to damage', async () => {
  const t = setup({ hand: ['Ookazi'] }, { s: ['Numinous Healer', 'Attack and Receive'] });
  t.answer(1, respondWith('Numinous Healer'), respondWith('Attack and Receive'));
  await t.act(t.find(0, 'Ookazi'));
  assert.equal(t.P1.lp, 8000 - 800 + 1000);
  assert.equal(t.P0.lp, 7300);
});

test('Michizure: when your monster is destroyed, destroy a monster', async () => {
  const t = setup({ hand: ['Fissure'] }, { s: ['Michizure'], m: ['Feral Imp', 'Blue-Eyes White Dragon'] });
  const fissure = t.find(0, 'Fissure');
  t.d.addMod(t.find(1, 'Blue-Eyes White Dragon'), 0, 0);
  await t.act(fissure);
  assert.equal(t.find(1, 'Feral Imp').zone, 'gy');
});

test('Big Shield Gardna negates a single-target Spell while face-down', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { m: [{ name: 'Big Shield Gardna', pos: 'def', faceUp: false }] });
  await t.act(t.find(0, 'Change of Heart'));
  const g = t.find(1, 'Big Shield Gardna');
  assert.equal(g.ctrl, 1);
  assert.ok(g.faceUp);
});

test('Shadow of Eyes flips the opponent\'s Set monster to Attack Position', async () => {
  const t = setup({ s: ['Shadow of Eyes'] }, { hand: ['Mystical Elf'] });
  t.answer(0, respondWith('Shadow of Eyes'));
  t.d.tp = 1;
  await (t.d as any).perform(t.d.mainActions(1, false).find((a) => a.a === 'mset')!);
  await t.d.settle();
  const elf = t.find(1, 'Mystical Elf');
  assert.ok(elf.faceUp);
  assert.equal(elf.pos, 'atk');
});

test('Skull Invitation: 300 damage to the owner of every card sent to the Graveyard', async () => {
  const t = setup({ s: [{ name: 'Skull Invitation', faceUp: true }], hand: ['Raigeki'] }, { m: ['Battle Ox', 'Feral Imp'] });
  await t.act(t.find(0, 'Raigeki'));
  assert.equal(t.P1.lp, 7400);
  assert.equal(t.P0.lp, 7700, 'Raigeki itself goes to the Graveyard');
});

test('Destiny Board wins after the 4th Spirit Message', async () => {
  const t = setup({ s: [{ name: 'Destiny Board', faceUp: true }], deck: ['Spirit Message "I"', 'Spirit Message "N"', 'Spirit Message "A"', 'Spirit Message "L"'] }, {});
  await assert.rejects(async () => { for (let i = 0; i < 4; i++) { await endTurn(t.d, 1); await t.d.settle(); } }, (e) => e instanceof DuelEnd && e.winner === 0);
});

test('Exodia: holding all five pieces wins', async () => {
  const t = setup({ hand: ['Exodia the Forbidden One', 'Left Leg of the Forbidden One', 'Right Leg of the Forbidden One', 'Left Arm of the Forbidden One'], deck: ['Right Arm of the Forbidden One'] }, {});
  await assert.rejects(async () => { await t.d.draw(0, 1); await t.d.settle(); }, (e) => e instanceof DuelEnd && e.winner === 0);
});

test('Gilasaurus: treating it as a Special Summon keeps your Normal Summon', async () => {
  const t = setup({ hand: ['Gilasaurus', 'Battle Ox'] }, { gy: ['Blue-Eyes White Dragon'] });
  t.answer(1, pickNamed('Blue-Eyes White Dragon'));
  await (t.d as any).perform(t.d.mainActions(0, false).find((a) => a.a === 'summon' && a.card.def.name === 'Gilasaurus')!);
  await t.d.settle();
  assert.equal(t.P0.normalDone, false);
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'mzone');
});

test('Ultimate Offering: an extra Normal Summon for 500 LP', async () => {
  const t = setup({ hand: ['Battle Ox', 'Feral Imp'], s: [{ name: 'Ultimate Offering', faceUp: true }] }, {});
  await (t.d as any).perform(t.d.mainActions(0, false).find((a) => a.a === 'summon')!);
  const extra = t.d.mainActions(0, false).find((a) => a.a === 'summon');
  assert.ok(extra && extra.a === 'summon' && extra.extra);
  await (t.d as any).perform(extra);
  assert.equal(t.d.monsters(0).length, 2);
  assert.equal(t.P0.lp, 7500);
});

test('Cold Wave: only at the start of Main Phase 1, and it stops Spell/Trap use', async () => {
  const t = setup({ hand: ['Cold Wave', 'Pot of Greed'] }, {});
  await t.act(t.find(0, 'Cold Wave'));
  assert.equal(t.canAct(t.find(0, 'Pot of Greed')), false);
  const u = setup({ hand: ['Cold Wave'] }, {});
  u.d.m1Actions = 1;
  assert.equal(u.canAct(u.find(0, 'Cold Wave')), false);
});

test('Curse of Fiend can only be activated in your Standby Phase', async () => {
  const t = setup({ hand: ['Curse of Fiend'], m: ['Battle Ox'] }, {});
  assert.equal(t.canAct(t.find(0, 'Curse of Fiend')), false);
  t.d.phase = 'SP';
  await t.act(t.find(0, 'Curse of Fiend'), undefined, 0, { e: 'open', phase: 'SP' });
  assert.equal(t.find(0, 'Battle Ox').pos, 'def');
});

test('Kycoo the Ghost Destroyer stops the opponent banishing from Graveyards', async () => {
  const t = setup({ hand: ['The Rock Spirit'], gy: ['Battle Ox'] }, { m: ['Kycoo the Ghost Destroyer'] });
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'ss'));
});

test('Banisher of the Light removes cards that would go to the Graveyard', async () => {
  const t = setup({ hand: ['Pot of Greed'] }, { m: ['Banisher of the Light', 'Battle Ox'] });
  await t.d.destroy(t.find(1, 'Battle Ox'), 'effect', undefined, 0);
  assert.equal(t.find(1, 'Battle Ox').zone, 'banished');
  await t.act(t.find(0, 'Pot of Greed'));
  assert.equal(t.find(0, 'Pot of Greed').zone, 'banished', 'resolved Spells are banished too');
});

test('Fire Princess burns 500 whenever you gain LP', async () => {
  const t = setup({ m: ['Fire Princess'], hand: ['Red Medicine'] }, {});
  await t.act(t.find(0, 'Red Medicine'));
  assert.equal(t.P1.lp, 7500);
});

test('Solemn Wishes: +500 whenever you draw', async () => {
  const t = setup({ s: [{ name: 'Solemn Wishes', faceUp: true }], hand: ['Pot of Greed'] }, {});
  await t.act(t.find(0, 'Pot of Greed'));
  assert.equal(t.P0.lp, 8500);
});

test('Kotodama destroys a second monster with the same name', async () => {
  const t = setup({ m: ['Kotodama', 'Battle Ox'], hand: ['Battle Ox'] }, {});
  await (t.d as any).perform(t.d.mainActions(0, false).find((a) => a.a === 'summon')!);
  await t.d.settle();
  assert.equal(t.d.monsters(0).filter((c) => c.def.name === 'Battle Ox').length, 1);
});

test('Penguin Knight reshuffles the Graveyard into the Deck when milled', async () => {
  const t = setup({}, { deck: ['Penguin Knight'], gy: ['Raigeki'] });
  await t.d.mill(1, 1, 0);
  await t.d.settle();
  assert.equal(t.P1.gy.length, 0);
});

test('Ring of Destruction damages both players by the ATK of the destroyed monster', async () => {
  const t = setup({ s: ['Ring of Destruction'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Ring of Destruction'));
  assert.equal(t.P0.lp, 5000);
  assert.equal(t.P1.lp, 5000);
});

test('Mystic Box destroys an opponent\'s monster and gives one of yours away', async () => {
  const t = setup({ hand: ['Mystic Box'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Mystic Box'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
  assert.equal(t.find(0, 'Feral Imp').ctrl, 1);
});

test('Two-Pronged Attack targets 2 of yours and 1 of theirs', async () => {
  const t = setup({ s: ['Two-Pronged Attack'], m: ['Feral Imp', 'Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Two-Pronged Attack'));
  assert.equal(t.d.monsters(0).length + t.d.monsters(1).length, 0);
});

test('Shift redirects a Spell that targets your monster', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { s: ['Shift'], m: ['Blue-Eyes White Dragon', 'Feral Imp'] });
  t.answer(0, pickNamed('Blue-Eyes White Dragon'));
  t.answer(1, respondWith('Shift'));
  await t.act(t.find(0, 'Change of Heart'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').ctrl, 1);
  assert.equal(t.find(1, 'Feral Imp').ctrl, 0);
});

test('Optional triggers can be declined', async () => {
  const t = setup({ m: ['Giant Rat'], deck: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, sayNo);
  await attack(t.d, t.find(0, 'Giant Rat'), t.find(1, 'Blue-Eyes White Dragon'));
  assert.equal(t.d.monsters(0).length, 0);
});

test('Sword Hunter equips the monster it destroyed (+200 ATK)', async () => {
  const t = setup({ m: ['Sword Hunter'] }, { m: ['Battle Ox'] });
  const sh = t.find(0, 'Sword Hunter');
  await attack(t.d, sh, t.find(1, 'Battle Ox'));
  assert.equal(t.d.atk(sh), 2650);
  assert.equal(t.find(1, 'Battle Ox').zone, 'szone');
});


test('Just Desserts: 500 per opponent monster', async () => {
  const t = setup({ s: ['Just Desserts'] }, { m: ['Battle Ox', 'Feral Imp'] });
  await t.act(t.find(0, 'Just Desserts'));
  assert.equal(t.P1.lp, 7000);
});

test('Anti-Spell Fragrance: Spells must be Set and wait a turn', async () => {
  const t = setup({ hand: ['Pot of Greed'], s: ['Dark Hole'] }, { s: [{ name: 'Anti-Spell Fragrance', faceUp: true }], m: ['Battle Ox'] });
  assert.equal(t.canAct(t.find(0, 'Pot of Greed')), false);
  assert.ok(t.d.mainActions(0, false).some((a) => a.a === 'sset' && a.card.def.name === 'Pot of Greed'));
  const hole = t.find(0, 'Dark Hole');
  hole.turnIn = t.d.turn;
  assert.equal(t.canAct(hole), false, 'Set this turn');
  hole.turnIn = 1;
  assert.ok(t.canAct(hole), 'Set on an earlier turn');
});

test('Mystic Probe negates a Continuous Spell for the turn', async () => {
  const t = setup({ hand: ['Messenger of Peace'] }, { s: ['Mystic Probe'] });
  t.answer(1, respondWith('Mystic Probe'));
  await t.act(t.find(0, 'Messenger of Peace'));
  assert.ok(t.d.negated(t.find(0, 'Messenger of Peace')));
  t.d.turn++;
  assert.ok(!t.d.negated(t.find(0, 'Messenger of Peace')));
});

test('The Unfriendly Amazon needs a Tribute each Standby Phase or is destroyed', async () => {
  const t = setup({ m: ['The Unfriendly Amazon'] }, {});
  await standby(t.d, 0);
  assert.equal(t.find(0, 'The Unfriendly Amazon').zone, 'gy');
  const u = setup({ m: ['The Unfriendly Amazon', 'Feral Imp'] }, {});
  u.answer(0, pickNamed('Feral Imp'));
  await standby(u.d, 0);
  assert.equal(u.find(0, 'The Unfriendly Amazon').zone, 'mzone');
  assert.equal(u.find(0, 'Feral Imp').zone, 'gy');
});

test('Blast Juggler: Tribute in the Standby Phase to destroy 2 monsters with 1000 or less ATK', async () => {
  const t = setup({ m: ['Blast Juggler'] }, { m: ['Petit Moth', 'Kuriboh', 'Blue-Eyes White Dragon'] });
  t.answer(0, pickNamed('Petit Moth', 'Kuriboh'));
  await standby(t.d, 0);
  assert.deepEqual(names(t.d.monsters(1)), ['Blue-Eyes White Dragon']);
});

test('Fairy Guardian returns a Spell the opponent sent to your Graveyard this turn', async () => {
  const t = setup({ s: [{ name: 'Messenger of Peace', faceUp: true }], m: ['Fairy Guardian'] }, {});
  await t.d.destroy(t.find(0, 'Messenger of Peace'), 'effect', undefined, 1);
  await t.act(t.find(0, 'Fairy Guardian'));
  assert.equal(t.P0.deck[0].def.name, 'Messenger of Peace');
});

test('Fusion Monsters can be Fusion Material (Fusionist into Rare Fish)', async () => {
  const t = setup({ hand: ['Polymerization', 'Enchanting Mermaid'], m: ['Fusionist'], extra: ['Rare Fish'] }, {});
  const events: string[][] = [];
  t.d.onEvent = (event) => { if (event.t === 'fusion') events.push([event.card.def.name, ...event.materials.map((card) => card.def.name)]); };
  await t.act(t.find(0, 'Polymerization'));
  assert.equal(t.find(0, 'Rare Fish').zone, 'mzone');
  assert.deepEqual(events, [['Rare Fish', 'Fusionist', 'Enchanting Mermaid']]);
});

test('Fusion prompts for every material and asks position after the animation', async () => {
  const t = setup({ hand: ['Polymerization', 'Blue-Eyes White Dragon', 'Blue-Eyes White Dragon', 'Blue-Eyes White Dragon'], extra: ['Blue-Eyes Ultimate Dragon'] });
  const order: string[] = [];
  const choices: number[] = [];
  const ask = t.ctl[0].ask.bind(t.ctl[0]);
  t.ctl[0].ask = async (prompt, duel, side) => {
    if (prompt.t === 'select' && prompt.text.startsWith('Select Fusion Material:')) choices.push(prompt.cards.length);
    if (prompt.t === 'position') { order.push('position'); return 'def'; }
    return ask(prompt, duel, side);
  };
  t.d.onEvent = (event) => {
    if (event.t === 'fusion') { order.push('animation'); assert.equal(event.card.zone, 'extra'); }
  };
  await t.act(t.find(0, 'Polymerization'));
  assert.deepEqual(choices, [3, 2, 1]);
  assert.deepEqual(order, ['animation', 'position']);
  assert.equal(t.find(0, 'Blue-Eyes Ultimate Dragon').pos, 'def');
});
