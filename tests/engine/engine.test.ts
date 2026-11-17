// Engine mechanics shared by many cards: chains, timing windows, costs, locks, delayed tasks, tokens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, respondWith, pickNamed } from '../helpers';
import { prepareDebugDuel } from '../../src/engine/debug';
import { byName } from '../helpers';
import { actionIndicator } from '../../src/ui/actionIndicator';
import { RPS_CHOICES, rpsResult } from '../../src/engine/rockPaperScissors';
import { evolveColor } from '../../src/ui/evolveEffect';

test('placement effect colors distinguish revealed types without exposing set cards', () => {
  const monster = byName('Battle Ox');
  const spell = byName('Pot of Greed');
  const trap = byName('Mirror Force');
  assert.notEqual(evolveColor(monster, true), evolveColor(spell, true));
  assert.notEqual(evolveColor(spell, true), evolveColor(trap, true));
  assert.equal(evolveColor(monster, false), evolveColor(spell, false));
  assert.equal(evolveColor(spell, false), evolveColor(trap, false));
  const colors = ['normal', 'effect', 'fusion', 'ritual'].map((mtype) => evolveColor({ ...monster, mtype: mtype as typeof monster.mtype }, true));
  assert.equal(new Set(colors).size, 4);
});

test('rock-paper-scissors resolves each matchup', () => {
  for (const choice of RPS_CHOICES) assert.equal(rpsResult(choice, choice), 'tie');
  for (const [winner, loser] of [['Rock', 'Scissors'], ['Paper', 'Rock'], ['Scissors', 'Paper']] as const) {
    assert.equal(rpsResult(winner, loser), 'win');
    assert.equal(rpsResult(loser, winner), 'lose');
  }
});

test('chosen first player starts the duel', async () => {
  for (const first of [0, 1] as const) {
    const t = setup();
    t.d.turn = 0;
    const stop = new Error('first turn');
    let actual: number | undefined;
    t.d.onEvent = (event) => { if (event.t === 'turn') { actual = event.player; throw stop; } };
    await assert.rejects(t.d.run(false, first), stop);
    assert.equal(actual, first);
  }
});

test('both players open with five cards and the first player draws a sixth', async () => {
  for (const first of [0, 1] as const) {
    const t = setup();
    t.d.turn = 0;
    const stop = new Error('standby phase');
    let opening: number[] = [];
    t.d.onEvent = (event) => {
      if (event.t === 'phase' && event.phase === 'DP') opening = t.d.players.map((player) => player.hand.length);
      if (event.t === 'phase' && event.phase === 'SP') throw stop;
    };
    await assert.rejects(t.d.run(false, first), stop);
    assert.deepEqual(opening, [5, 5]);
    assert.equal(t.d.players[first].hand.length, 6);
    assert.equal(t.d.players[first === 0 ? 1 : 0].hand.length, 5);
  }
});

test('action indicators distinguish activation from set-only cards', () => {
  const t = setup({ hand: ['Magic Cylinder', 'Pot of Greed', 'Battle Ox'] });
  const actions = t.d.mainActions(0, false);
  const forCard = (name: string) => actions.filter((action) => 'card' in action && action.card.def.name === name);
  assert.equal(actionIndicator(forCard('Magic Cylinder')), 'set');
  assert.equal(actionIndicator(forCard('Pot of Greed')), 'activate');
  assert.equal(actionIndicator(forCard('Battle Ox')), null);
  assert.equal(actionIndicator([]), null);
});

test('debug setup starts a playable turn with the specified cards', async () => {
  const t = setup();
  const id = (name: string) => byName(name).id;
  prepareDebugDuel(t.d, {
    hand: [id('Axe of Despair')], monsters: [id('Battle Ox')],
    traps: [id('Reinforcements'), id('Reinforcements')],
    opponentMonsters: [id('Feral Imp')], extra: [id('Flame Swordsman')],
  });
  const stop = new Error('reached main phase');
  t.ctl[0].ask = async (prompt) => { if (prompt.t === 'main') throw stop; return null; };
  await assert.rejects(t.d.run(true), stop);
  assert.equal(t.d.turn, 2);
  assert.equal(t.d.tp, 0);
  assert.equal(t.d.phase, 'M1');
  assert.equal(t.P1.hand.length, 5);
  assert.equal(t.P0.extra[0].def.name, 'Flame Swordsman');
  assert.equal(t.d.mainActions(0, false).filter((action) => action.a === 'act' && action.card.def.name === 'Reinforcements').length, 2);
  assert.ok(t.d.mainActions(0, false).some((action) => action.a === 'phase' && action.to === 'BP'));
});

test('equipping emits a UI event only after a successful equip', async () => {
  const t = setup({ m: ['Battle Ox'], hand: ['Axe of Despair'] });
  const equip = t.find(0, 'Axe of Despair');
  const monster = t.find(0, 'Battle Ox');
  const events: string[] = [];
  t.d.onEvent = (event) => { if (event.t === 'equip') events.push(`${event.card.def.name}:${event.target.def.name}`); };
  assert.equal(await t.d.equipCard(equip, monster), true);
  assert.deepEqual(events, ['Axe of Despair:Battle Ox']);
  assert.equal(await t.d.equipCard(equip, equip), false);
  assert.equal(events.length, 1);
});

test('chain links resolve last-in first-out', async () => {
  const t = setup({ hand: ['Ookazi'], s: ['Jar of Greed'] }, { s: ['Magic Jammer'], hand: ['Battle Ox', 'Feral Imp'] });
  const order: string[] = [];
  t.d.onEvent = (e) => { if (e.t === 'resolve') order.push(e.card.def.name); };
  t.answer(1, respondWith('Magic Jammer'));
  await t.act(t.find(0, 'Ookazi'));
  assert.deepEqual(order, ['Magic Jammer', 'Ookazi']);
  assert.equal(t.P1.lp, 8000, 'Ookazi was negated');
});

test('a Spell Speed 1 card cannot be chained; a Counter Trap only answers Spell Speed 3 windows', async () => {
  const t = setup({ hand: ['Pot of Greed'], s: ['Reinforcements'] }, {});
  const pot = t.find(0, 'Pot of Greed');
  assert.equal(t.d.canActivate(pot, 0, 0, [{ e: 'open', main: true }, { e: 'chain', link: t.d.pseudoLink(pot, 1) }], 2), false);
  const u = setup({ s: ['Magic Jammer'] }, { hand: ['Battle Ox'] });
  assert.equal(u.d.canActivate(u.find(0, 'Magic Jammer'), 0, 0, [{ e: 'summoning', cards: [], player: 1, how: 'normal' }], 3), false);
});

test('a Trap cannot be activated the turn it is Set', async () => {
  const t = setup({ s: ['Jar of Greed'] }, {});
  const jar = t.find(0, 'Jar of Greed');
  jar.turnIn = t.d.turn;
  assert.equal(t.canAct(jar), false);
  jar.turnIn = 1;
  assert.ok(t.canAct(jar));
});

test('the same effect cannot appear twice in one chain', async () => {
  const t = setup({ s: [{ name: 'Skull Lair', faceUp: true }], gy: ['Battle Ox', 'Feral Imp', 'Mystical Elf', 'Celtic Guardian', 'Giant Rat'] }, { m: ['Battle Ox'] });
  const lair = t.find(0, 'Skull Lair');
  await t.d.activate(lair, 1, 0, { e: 'open', main: true });
  assert.equal(t.d.canActivate(lair, 1, 0, [{ e: 'open', main: true }], 2), false);
});

test('costs are paid on activation even if the effect is later negated', async () => {
  const t = setup({ s: ['Seven Tools of the Bandit', 'Jar of Greed'] }, { s: ['Magic Jammer'] });
  const tools = t.find(0, 'Seven Tools of the Bandit');
  const jar = t.find(0, 'Jar of Greed');
  await t.d.activate(jar, 0, 0, { e: 'open', main: true });
  await t.d.activate(tools, 0, 0, { e: 'open', main: true });
  assert.equal(t.P0.lp, 7000);
});

test('targets that left the field are skipped at resolution', async () => {
  const t = setup({ hand: ['Mystical Space Typhoon'] }, { s: ['Mirror Force', 'Giant Trunade'] });
  t.answer(0, pickNamed('Mirror Force'));
  t.answer(1, respondWith('Giant Trunade'));
  // Giant Trunade is a Normal Spell, so it cannot respond: Mirror Force is destroyed normally
  await t.act(t.find(0, 'Mystical Space Typhoon'));
  assert.equal(t.find(1, 'Mirror Force').zone, 'gy');
});

test('scheduled tasks run at the named phase of the named turn only', async () => {
  const t = setup({}, {});
  let ran = 0;
  t.d.schedule({ at: 'EP', turn: t.d.turn + 1, fn: () => { ran++; } });
  t.d.phase = 'EP';
  await (t.d as any).endPhase();
  assert.equal(ran, 0);
  t.d.turn++;
  t.d.tp = 1;
  await (t.d as any).endPhase();
  assert.equal(ran, 1);
});

test('turn-limited rule changes expire', async () => {
  const t = setup({ hand: ['Battle Ox'] }, {});
  t.d.addTemp({ until: t.d.turn, p: 0, tag: 'noSummon' });
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'summon'));
  t.d.turn++;
  assert.ok(t.d.mainActions(0, false).some((a) => a.a === 'summon'));
});

test('tokens leave the game instead of going anywhere', async () => {
  const t = setup({}, {});
  const tok = await t.d.summonToken(0, 'Sheep Token', 'def');
  assert.ok(tok && tok.zone === 'mzone');
  await t.d.move(tok!, 'hand');
  assert.equal(t.P0.hand.length, 0);
  assert.equal(t.d.byUid(tok!.uid), undefined);
});

test('Special Summon locks apply to effects as well as procedures', async () => {
  const t = setup({ m: ['Jowgen the Spiritualist'], hand: ['Monster Reborn'], gy: ['Blue-Eyes White Dragon'] }, {});
  assert.equal(t.canAct(t.find(0, 'Monster Reborn')), false);
});

test('Last Warrior from Another Planet stops all summons', async () => {
  const t = setup({ m: ['The Last Warrior from Another Planet'], hand: ['Battle Ox'] }, {});
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'summon'));
  assert.ok(t.d.mainActions(0, false).some((a) => a.a === 'mset'), 'Setting is not a Summon');
});

test('negated face-up cards lose their continuous effects', async () => {
  const t = setup({ s: [{ name: 'Messenger of Peace', faceUp: true }] }, { m: ['Blue-Eyes White Dragon'], s: [{ name: 'Imperial Order', faceUp: true }] });
  t.d.tp = 1; t.d.phase = 'BP';
  assert.ok(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), 'Imperial Order negates Messenger of Peace');
});

test('an equipped monster leaving the field destroys its Equip Card', async () => {
  const t = setup({ hand: ['Legendary Sword'], m: ['Celtic Guardian'] }, {});
  await t.act(t.find(0, 'Legendary Sword'));
  assert.equal(t.d.atk(t.find(0, 'Celtic Guardian')), 1700);
  await t.d.destroy(t.find(0, 'Celtic Guardian'), 'effect');
  await t.d.cleanup();
  assert.equal(t.find(0, 'Legendary Sword').zone, 'gy');
});

test('Gearfried the Iron Knight shakes off Equip Cards', async () => {
  const t = setup({ hand: ['Legendary Sword'], m: ['Gearfried the Iron Knight'] }, {});
  await t.act(t.find(0, 'Legendary Sword'));
  assert.equal(t.find(0, 'Legendary Sword').zone, 'gy');
  assert.equal(t.d.atk(t.find(0, 'Gearfried the Iron Knight')), 1800);
});

test('response windows open for damage, Graveyard and Set events', async () => {
  const t = setup({ hand: ['Ookazi'] }, { s: ['Numinous Healer'] });
  t.answer(1, respondWith('Numinous Healer'));
  await t.act(t.find(0, 'Ookazi'));
  assert.ok(t.ctl[1].seen.some((p) => p.t === 'chain' && p.ev.e === 'damage'));
});
