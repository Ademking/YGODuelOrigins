import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../../src/data/cards';
import { activeFieldMat, FIELD_MATS, fieldMatShader, type FieldMatName } from '../../src/ui/fieldMat';
import { setup } from '../helpers';

test('every playable Field Spell has a playmat shader', () => {
  const names = CARDS.filter((card) => card.kind === 'spell' && card.stype === 'field').map((card) => card.name).sort();
  assert.deepEqual(Object.keys(FIELD_MATS).sort(), names);
  for (const name of names as FieldMatName[]) {
    const shader = fieldMatShader(name, false);
    assert.ok(shader.includes('uniform float opacity;'));
    assert.ok(shader.includes('time * 0.22'));
    assert.ok(fieldMatShader(name, true).includes('time * 0.0'));
  }
});

test('playmat follows activation, replacement, and destruction', async () => {
  const t = setup({ hand: ['Forest', 'Yami'] });
  const current = () => activeFieldMat(t.d.players.map((player) => player.f));
  assert.equal(current(), null);
  await t.act(t.find(0, 'Forest'));
  assert.equal(current(), 'Forest');
  await t.act(t.find(0, 'Yami'));
  assert.equal(current(), 'Yami');
  await t.d.destroy(t.find(0, 'Yami'), 'effect');
  assert.equal(current(), null);
});

test('face-down and unsupported field cards do not change the playmat', () => {
  assert.equal(activeFieldMat([{ faceUp: false, def: { name: 'Forest' } }]), null);
  assert.equal(activeFieldMat([{ faceUp: true, def: { name: 'Unknown' } }]), null);
});
