import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { cardImagePasscode } from '../../src/data/cardImages';
import { TOKENS } from '../../src/data/cards';
import { tokenDef, tokens } from '../../src/data/effects/lib';
import { setup } from '../helpers';

test('Ojama Trio tokens resolve to their image passcode', async () => {
  const { d } = setup();
  const token = await d.summonToken(1, 'Ojama Token');
  assert.ok(token);
  assert.equal(cardImagePasscode(token.def.id), '14470846');
});

test('a Token made by an effect is the game\'s Token card, with its text and artwork', async () => {
  const { d } = setup();
  const [token] = await tokens(d, 0, tokenDef('Wicked Token', 'Fiend', 'DARK', 4, 1000, 1000), 1, 'atk');
  assert.ok(token);
  assert.equal(token.def.id, TOKENS['Wicked Token'].id);
  assert.ok(token.def.text.includes('Statue of the Wicked'));
  assert.equal(cardImagePasscode(token.def.id), '65810490');
  assert.equal(d.atk(token), 1000);
});

test('every Token named by a card effect is a Token card with artwork', () => {
  const dirs = ['src/data/effects', 'src/data/effects/online'];
  const files = dirs.flatMap((dir) => readdirSync(dir).filter((file) => file.endsWith('.ts')).map((file) => `${dir}/${file}`));
  const named = new Set(files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/(?:tokenDef\(|tokens\(d, [\w.()]+, |summonToken\([\w.()]+, |name: )'([^']* Token)'/g)].map((match) => match[1])));
  assert.ok(named.size >= 30);
  for (const name of named) {
    assert.ok(TOKENS[name], `${name} has no Token card`);
    assert.ok(cardImagePasscode(TOKENS[name].id), `${name} has no artwork`);
  }
});
