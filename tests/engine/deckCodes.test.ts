// Deck import and export in other simulators' formats (src/data/deckCodes.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import { STARTERS } from '../../src/data/decks';
import { CARDS } from '../../src/ocgcore/catalog';
import { cardForPasscode, parseDeck, shareLink, toYdk, toYdke } from '../../src/data/deckCodes';
import { cardImagePasscode } from '../../src/data/cardImages';

const id = (name: string) => CARDS.find((card) => card.name === name)!.id;
const sorted = (ids: string[]) => [...ids].sort();

test('a ydke:// code made by another tool imports, alternate artworks included', () => {
  // built with Python's struct.pack('<I', …): Pot of Greed x2, Dark Magician, Dark Magician's alternate art, 12345
  const imported = parseDeck('ydke://SnBJA0pwSQOu9MwCnIU0AjkwAAA=!!!')!;
  assert.deepEqual(imported.deck.main, [id('Pot of Greed'), id('Pot of Greed'), id('Dark Magician'), id('Dark Magician')]);
  assert.deepEqual(imported.missing, ['12345']);
});

test('every starter deck survives a round trip through ydke, YDK and a share link', () => {
  for (const [name, deck] of Object.entries(STARTERS)) {
    for (const text of [toYdke(deck), toYdk(deck, name), shareLink(deck, 'https://duelorigins.online')]) {
      const back = parseDeck(text)!;
      assert.deepEqual(sorted(back.deck.main), sorted(deck.main), name);
      assert.deepEqual(sorted(back.deck.extra), sorted(deck.extra), name);
      assert.deepEqual(back.missing, [], name);
    }
    assert.equal(parseDeck(toYdk(deck, name))!.name, name);
  }
});

test('a .ydk file from another simulator: comments, side deck and Fusions listed in the main deck', () => {
  const ydk = ['#created by Player', '#main', '46986414', '55144522  -- Pot of Greed', '', cardImagePasscode(id('Dark Paladin'))!,
    '#extra', '!side', '83764718'].join('\r\n');
  const imported = parseDeck(ydk)!;
  assert.deepEqual(imported.deck.main, [id('Dark Magician'), id('Pot of Greed')]);
  assert.deepEqual(imported.deck.extra, [id('Dark Paladin')], 'a Fusion goes to the Fusion Deck');
  assert.equal(imported.name, undefined, 'no deck name on a plain "#created by" line');
});

test('text with no deck is not a deck', () => {
  assert.equal(parseDeck('hello'), null);
  assert.equal(parseDeck('ydke://!!!')!.deck.main.length, 0);
  assert.equal(parseDeck('ydke://@@@!!!'), null);
  assert.equal(cardForPasscode('0'), undefined);
});
