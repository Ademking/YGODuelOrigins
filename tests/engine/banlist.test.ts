// The banlist (data/banlist.ts) applies online, so every starter deck must follow it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTERS, validateDeck } from '../../src/data/decks';
import { legalize } from '../../src/data/premadeDecks';
import { CARDS, copyLimit } from '../../src/ocgcore/catalog';
import { validDeck } from '../../src/multiplayer/protocol';

const id = (name: string) => CARDS.find((card) => card.name === name)!.id;

test('every starter deck follows the banlist', () => {
  for (const [name, deck] of Object.entries(STARTERS)) assert.deepEqual(validateDeck(deck), [], name);
});

test('legalize swaps copies over the limit for similar legal cards and keeps the deck size', () => {
  const deck = [...Array(3).fill(id('Mystical Space Typhoon')), id('Monster Reborn'), ...Array(36).fill(id('Dark Magician')).slice(0, 3)];
  const legal = legalize(deck);
  assert.equal(legal.length, deck.length);
  const count = (card: string) => legal.filter((x) => x === id(card)).length;
  assert.equal(count('Mystical Space Typhoon'), 1);
  assert.equal(count('Monster Reborn'), 0);
  assert.equal(count('Premature Burial'), 1);
  assert.equal(count('Dust Tornado'), 2);
  for (const card of new Set(legal)) assert.ok(legal.filter((x) => x === card).length <= copyLimit(CARDS.find((c) => c.id === card)!));
});

test('online, a deck that breaks the banlist is refused', () => {
  const legal = STARTERS['Yugi Muto'];
  assert.equal(validDeck(legal), true);
  const banned = { ...legal, main: [...legal.main.slice(1), id('Monster Reborn')] };
  assert.equal(validDeck(banned), false);
  assert.equal(validDeck(banned, false), true, 'well formed apart from the banlist');
});
