import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIController } from '../../src/engine/ai';
import { setup } from '../helpers';

test('CPU finds a valid tribute combination instead of an invalid greedy prefix', async () => {
  const t = setup({ m: ['Kuriboh', 'Celtic Guardian', 'Battle Ox'] });
  const cpu = new AIController('hard', 0);
  const target = t.find(0, 'Celtic Guardian');
  const selected = await cpu.ask({ t: 'select', text: 'Select a tribute', cards: t.d.monsters(0), min: 1, max: 2, purpose: 'cost', validate: cards => cards.length === 1 && cards[0] === target }, t.d, 0);
  assert.deepEqual(selected, [target]);
});

test('CPU prioritizes lethal damage and keeps Exodia pieces as costs', async () => {
  const t = setup({ m: ['Battle Ox'], hand: ['Left Arm of the Forbidden One', 'Celtic Guardian'] }, { m: ['Dark Magician'], lp: 1000 });
  const cpu = new AIController('hard', 0);
  assert.ok(cpu.scoreAttack(t.d, 0, t.find(0, 'Battle Ox'), null) > 10000);
  const selected = await cpu.ask({ t: 'select', text: 'Discard a card', cards: t.P0.hand, min: 1, max: 1, purpose: 'cost' }, t.d, 0);
  assert.equal(selected[0].def.name, 'Celtic Guardian');
});

test('CPU considers tribute summoning a stronger monster', async () => {
  const t = setup({ m: ['Battle Ox', 'Celtic Guardian'], hand: ['Blue-Eyes White Dragon'] });
  const cpu = new AIController('hard', 0);
  const actions = t.d.mainActions(0, false);
  const choice = await cpu.ask({ t: 'main', actions, phase: 'M1' }, t.d, 0);
  assert.equal(choice.a, 'summon');
  assert.equal(choice.card.def.name, 'Blue-Eyes White Dragon');
});

test('CPU can use Neos contact fusion from the Fusion Deck', async () => {
  const t = setup({ m: ['Elemental Hero Neos', 'Neo-Spacian Aqua Dolphin'], extra: ['Elemental Hero Aqua Neos'] });
  const cpu = new AIController('hard', 0);
  const actions = t.d.mainActions(0, false);
  const choice = await cpu.ask({ t: 'main', actions, phase: 'M1' }, t.d, 0);
  assert.equal(choice.a, 'ss');
  assert.equal(choice.card.def.name, 'Elemental Hero Aqua Neos');
  await (t.d as any).perform(choice);
  await t.d.settle();
  assert.equal(t.find(0, 'Elemental Hero Aqua Neos').zone, 'mzone');
  assert.equal(t.find(0, 'Elemental Hero Neos').zone, 'deck');
  assert.equal(t.find(0, 'Neo-Spacian Aqua Dolphin').zone, 'deck');
});
