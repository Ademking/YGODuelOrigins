import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byName, setup, pickNamed, respondWith, sayNo } from '../helpers';

test('Shien can replace battle or effect destruction with a chosen Six Samurai', async () => {
  for (const reason of ['battle', 'effect'] as const) {
    const duel = setup({ m: ['Great Shogun Shien', 'The Six Samurai - Zanji', 'The Six Samurai - Yaichi'] });
    const shien = duel.find(0, 'Great Shogun Shien');
    duel.answer(0, pickNamed('The Six Samurai - Yaichi'));
    await duel.d.destroy(shien, reason);
    assert.equal(shien.zone, 'mzone');
    assert.equal(duel.find(0, 'The Six Samurai - Yaichi').zone, 'gy');
    assert.equal(duel.find(0, 'The Six Samurai - Zanji').zone, 'mzone');
  }
});

test('Shien can decline the replacement or has no replacement while face-down', async () => {
  for (const faceUp of [true, false]) {
    const duel = setup({ m: [{ name: 'Great Shogun Shien', faceUp }, 'The Six Samurai - Zanji'] });
    duel.answer(0, sayNo);
    const shien = duel.find(0, 'Great Shogun Shien');
    await duel.d.destroy(shien, 'effect');
    assert.equal(shien.zone, 'gy');
    assert.equal(duel.find(0, 'The Six Samurai - Zanji').zone, 'mzone');
  }
});

test('Shien prevents a second Spell or Trap activation in the same chain', async () => {
  const duel = setup({ m: ['Great Shogun Shien'] }, { hand: ['Book of Moon', 'Scapegoat'] });
  duel.d.tp = 1;
  const first = duel.find(1, 'Book of Moon');
  const second = duel.find(1, 'Scapegoat');
  const open = { e: 'open', main: true, phase: duel.d.phase } as const;
  assert.equal(duel.d.canActivate(first, 0, 1, [open], 1), true);
  await duel.d.activate(first, 0, 1, open);
  assert.equal(duel.d.canActivate(second, 0, 1, [{ e: 'chain', link: duel.d.chain[0] }], 2), false);
});

test('a negated activation does not count against Shien’s limit', async () => {
  const duel = setup({ m: ['Great Shogun Shien'], s: ['Dark Bribe'] }, { hand: ['Pot of Greed', 'Scapegoat'] });
  duel.d.tp = 1;
  duel.answer(0, respondWith('Dark Bribe'));
  await duel.act(duel.find(1, 'Pot of Greed'), 0, 1);
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), true);
});

test('a Spell whose effect is negated still counts as an activation', async () => {
  const duel = setup({ m: ['Great Shogun Shien'] }, { hand: ['Pot of Greed', 'Scapegoat'] });
  duel.d.tp = 1;
  const spell = duel.find(1, 'Pot of Greed');
  const open = { e: 'open', main: true, phase: duel.d.phase } as const;
  await duel.d.activate(spell, 0, 1, open);
  duel.d.addTemp({ until: duel.d.turn, negate: (_duel, card) => card === spell });
  await duel.d.chainLoop(open, 0);
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), false);
});

test('Blue-Eyes Shining Dragon negates a targeted effect without negating its activation', async () => {
  const duel = setup({ m: ['Great Shogun Shien', 'Blue-Eyes Shining Dragon'] }, { hand: ['Book of Moon', 'Scapegoat'] });
  duel.d.tp = 1;
  duel.answer(1, pickNamed('Blue-Eyes Shining Dragon'));
  await duel.act(duel.find(1, 'Book of Moon'), 0, 1);
  assert.equal(duel.find(0, 'Blue-Eyes Shining Dragon').faceUp, true);
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), false);
});

test('Jar Robber negates Pot of Greed’s effect without negating its activation', async () => {
  const duel = setup({ m: ['Great Shogun Shien'], s: ['Jar Robber'] }, { hand: ['Pot of Greed', 'Scapegoat'] });
  duel.d.tp = 1;
  duel.answer(0, respondWith('Jar Robber'));
  const before = duel.P1.hand.length;
  await duel.act(duel.find(1, 'Pot of Greed'), 0, 1);
  assert.equal(duel.P1.hand.length, before - 1);
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), false);
  assert.equal(duel.find(1, 'Pot of Greed').mark.destroyedTurn, undefined);
});

test('Goblin Out of the Frying Pan negates an activation and allows another', async () => {
  const duel = setup({ m: ['Great Shogun Shien'], s: ['Goblin Out of the Frying Pan'] }, { hand: ['Pot of Greed', 'Scapegoat'] });
  duel.d.tp = 1;
  duel.answer(0, respondWith('Goblin Out of the Frying Pan'));
  await duel.act(duel.find(1, 'Pot of Greed'), 0, 1);
  assert.equal(duel.find(1, 'Pot of Greed').zone, 'hand');
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), true);
});

test('Shien does not prevent effects of already face-up Spell Cards', async () => {
  const duel = setup({ m: ['Great Shogun Shien'] }, { hand: ['Pot of Greed'], s: [{ name: 'Card Shuffle', faceUp: true }] });
  duel.d.tp = 1;
  await duel.act(duel.find(1, 'Pot of Greed'), 0, 1);
  assert.equal(duel.canAct(duel.find(1, 'Card Shuffle'), 1), true);
});

test('Shien counts activations made before it enters the field and resets next turn', async () => {
  const duel = setup({}, { hand: ['Pot of Greed', 'Scapegoat'] });
  duel.d.tp = 1;
  await duel.act(duel.find(1, 'Pot of Greed'), 0, 1);
  const shien = duel.d.mkCard(byName('Great Shogun Shien'), 0, 'hand');
  duel.P0.hand.push(shien);
  duel.d.placeMonster(shien, 0, true, 'atk');
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), false);
  duel.d.turn++;
  assert.equal(duel.canAct(duel.find(1, 'Scapegoat'), 1), true);
});
