import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { soundFiles } from '../../src/ui/sfx';

test('assets/sfx holds exactly the sounds the game plays', () => {
  const used = [...new Set(Object.values(soundFiles))].map((name) => `${name}.wav`).sort();
  assert.deepEqual(readdirSync('assets/sfx').sort(), used);
});
