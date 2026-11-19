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

test('the YGO Duel Origins - Custom GX v1.0 list', () => {
  const limit = (name: string) => copyLimit(CARDS.find((card) => card.name.toLowerCase() === name.toLowerCase())!);
  const expect: Record<string, number> = {
    'Dark Hole': 0, 'Card of Safe Return': 0, 'Mind Crush': 0, 'Destiny HERO - Disk Commander': 0, 'Monster Reborn': 0, 'Ring of Destruction': 0,
    'Black Luster Soldier - Envoy of the Beginning': 1, 'Cyber Jar': 1, 'Pot of Greed': 1, 'Crush Card': 1, 'Future Fusion': 1, 'Royal Decree': 1,
    'Last Turn': 2, 'Book of Moon': 2, 'Magician of Faith': 2, 'Jinzo': 2, 'Nobleman of Crossout': 2,
    // marked 3, or unmarked in the list
    'Cyber-Stein': 3, 'Metamorphosis': 3, 'Thousand-Eyes Restrict': 3, 'Scapegoat': 3, 'Apprentice Magician': 3, 'Green Gadget': 3,
  };
  for (const [name, count] of Object.entries(expect)) assert.equal(limit(name), count, name);
});

test('a starter saved under the GOAT list and never edited follows the current list', async () => {
  const { PREVIOUS_PREMADE } = await import('../../src/data/premadeDecks');
  for (const [name, deck] of Object.entries(STARTERS)) {
    // every earlier version of this starter is upgraded to the current one, which is legal
    for (const previous of PREVIOUS_PREMADE.filter((opponent) => opponent.name === name)) assert.ok(previous.deck.main.length, name);
    assert.deepEqual(validateDeck(deck), [], name);
  }
});
