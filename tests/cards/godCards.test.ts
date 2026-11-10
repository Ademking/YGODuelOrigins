import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cardImagePasscode } from '../../src/data/cardImages';
import { setup, pickNamed, respondWith } from '../helpers';

const names = ['Slifer the Sky Dragon', 'The Winged Dragon of Ra', 'Obelisk the Tormentor'];

test('God Cards require three Tributes, cannot be Set, and their Normal Summons cannot be negated', async () => {
  for (const [index, name] of names.entries()) {
    const t = setup({ hand: [name], m: ['Battle Ox', 'Sangan', 'Mystic Tomato'] }, { s: ['Solemn Judgment'] });
    const card = t.find(0, name);
    assert.equal(cardImagePasscode(card.def.id), ['10000020', '10000010', '10000000'][index]);
    const actions = t.d.mainActions(0, false);
    assert.equal(actions.some((action) => action.a === 'mset' && action.card === card), false);
    const action = actions.find((candidate) => candidate.a === 'summon' && candidate.card === card);
    assert.ok(action && action.tributes === 3);
    t.answer(1, respondWith('Solemn Judgment'));
    await (t.d as any).perform(action);
    await t.d.settle();
    assert.equal(card.zone, 'mzone', name);
    assert.equal(t.find(1, 'Solemn Judgment').zone, 'szone');
  }
});

test('Slifer gains stats from the hand and weakens or destroys newly summoned attack monsters', async () => {
  const t = setup({ m: ['Slifer the Sky Dragon'], hand: ['Sangan', 'Battle Ox'] }, { hand: ['Battle Ox', 'Blue-Eyes White Dragon'] });
  const slifer = t.find(0, 'Slifer the Sky Dragon');
  assert.equal(t.d.atk(slifer), 2000);
  const weak = t.find(1, 'Battle Ox');
  await t.d.specialSummon(weak, 1, 'atk');
  await t.d.settle();
  assert.equal(weak.zone, 'gy');
  const strong = t.find(1, 'Blue-Eyes White Dragon');
  await t.d.specialSummon(strong, 1, 'atk');
  await t.d.settle();
  assert.equal(t.d.atk(strong), 1000);
  await t.d.move(t.find(0, 'Sangan'), 'gy');
  assert.equal(t.d.atk(slifer), 1000);
});

test('Slifer’s summon-triggered effect can be answered in a chain', async () => {
  const t = setup({ m: ['Slifer the Sky Dragon'] }, { hand: ['Battle Ox', 'Sangan'], s: ['Divine Wrath'] });
  const monster = t.find(1, 'Battle Ox');
  t.answer(1, respondWith('Divine Wrath'));
  await t.d.specialSummon(monster, 1, 'atk');
  await t.d.settle();
  assert.equal(monster.zone, 'mzone');
  assert.equal(t.d.atk(monster), 1700);
  assert.equal(t.find(1, 'Divine Wrath').zone, 'gy');
});

test('Ra pays life points on Normal Summon and can destroy a target for 1000 LP', async () => {
  const t = setup({ hand: ['The Winged Dragon of Ra'], m: ['Battle Ox', 'Sangan', 'Mystic Tomato'] }, { m: ['Battle Ox'] });
  const ra = t.find(0, 'The Winged Dragon of Ra');
  const summon = t.d.mainActions(0, false).find((candidate) => candidate.a === 'summon' && candidate.card === ra);
  assert.ok(summon);
  await (t.d as any).perform(summon);
  await t.d.settle();
  assert.equal(t.P0.lp, 100);
  assert.equal(t.d.atk(ra), 7900);
  t.P0.lp = 2500;
  t.answer(0, pickNamed('Battle Ox'));
  await t.act(ra, 1);
  assert.equal(t.P0.lp, 1500);
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
});

test('Obelisk cannot be targeted and can Tribute two monsters to destroy opposing monsters', async () => {
  const t = setup({ m: ['Obelisk the Tormentor', 'Battle Ox', 'Sangan'] }, { m: ['Battle Ox'], hand: ['Fissure'] });
  const obelisk = t.find(0, 'Obelisk the Tormentor');
  assert.equal(t.d.targetable(obelisk, t.find(1, 'Fissure')), false);
  t.answer(0, pickNamed('Battle Ox', 'Sangan'));
  await t.act(obelisk, 1);
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
  assert.equal(obelisk.noAttackTurn, t.d.turn);
});

test('Special Summoned Slifer and Obelisk are sent to the Graveyard in the End Phase', async () => {
  for (const name of [names[0], names[2]]) {
    const t = setup({ gy: [name] });
    const card = t.find(0, name);
    assert.equal(await t.d.specialSummon(card, 0, 'atk'), true);
    await (t.d as any).endPhase();
    assert.equal(card.zone, 'gy', name);
  }
  const t = setup({ gy: [names[1]] });
  assert.equal(await t.d.specialSummon(t.find(0, names[1]), 0, 'atk'), false);
});
