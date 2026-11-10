import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraDeckActions } from '../../src/ui/pileActions';
import { setup } from '../helpers';

test('XY-Dragon Cannon is selectable in the Extra Deck and banishes its materials', async () => {
  const duel = setup({
    m: ['Luster Dragon #2', 'Y-Dragon Head', 'Spear Dragon', 'X-Head Cannon', 'Battle Ox'],
    extra: ['XY-Dragon Cannon', 'XYZ-Dragon Cannon'],
  });
  const xy = duel.find(0, 'XY-Dragon Cannon');
  const xyz = duel.find(0, 'XYZ-Dragon Cannon');
  const prompt = { t: 'main' as const, actions: duel.d.mainActions(0, false), phase: duel.d.phase };
  const actions = extraDeckActions(xy, 0, prompt);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].a, 'ss');
  assert.deepEqual(extraDeckActions(xyz, 0, prompt), []);
  assert.deepEqual(extraDeckActions(xy, 1, prompt), []);
  assert.deepEqual(extraDeckActions(xy, 0, null), []);

  await (duel.d as any).perform(actions[0]);
  await duel.d.settle();
  assert.equal(xy.zone, 'mzone');
  assert.equal(duel.find(0, 'X-Head Cannon').zone, 'banished');
  assert.equal(duel.find(0, 'Y-Dragon Head').zone, 'banished');
  assert.equal(duel.d.monsters(0).length, 4);
});

test('an Extra Deck monster cannot be selected without its materials', () => {
  const duel = setup({ m: ['X-Head Cannon'], extra: ['XY-Dragon Cannon'] });
  const xy = duel.find(0, 'XY-Dragon Cannon');
  const prompt = { t: 'main' as const, actions: duel.d.mainActions(0, false), phase: duel.d.phase };
  assert.deepEqual(extraDeckActions(xy, 0, prompt), []);
});
