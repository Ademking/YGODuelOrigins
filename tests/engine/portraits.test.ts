import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { OPPONENTS } from '../../src/data/decks';
import { PORTRAIT_IDS, portraitKey, portraitPath } from '../../src/ui/portraits';

test('character portraits have local assets and cover the character opponents', () => {
  for (const id of PORTRAIT_IDS) assert.ok(existsSync(`assets${portraitPath(id)}`), id);
  for (const opponent of OPPONENTS) {
    assert.ok(portraitKey(opponent.id), opponent.id);
  }
  assert.equal(portraitKey('jaden-neos'), portraitKey('jaden'));
  assert.equal(portraitKey('gravekeeper'), null);
});
