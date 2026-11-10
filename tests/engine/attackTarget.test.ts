import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackTargetLabel } from '../../src/ui/attackTarget';
import { setup } from '../helpers';

test('attack target labels distinguish monsters without revealing face-down cards', () => {
  const t = setup({}, { m: ['Battle Ox', 'Battle Ox', { name: 'Sangan', faceUp: false }] });
  const targets = t.d.monsters(1);
  assert.equal(attackTargetLabel(targets[0]), 'Attack Battle Ox (Zone 1)');
  assert.equal(attackTargetLabel(targets[1]), 'Attack Battle Ox (Zone 2)');
  assert.equal(attackTargetLabel(targets[2]), 'Attack Face-down monster (Zone 3)');
  assert.equal(attackTargetLabel(null), 'Direct Attack');
});
