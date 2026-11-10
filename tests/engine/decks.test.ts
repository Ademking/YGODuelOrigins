import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OPPONENTS, STARTERS, loadDecks, saveDecks, validateDeck } from '../../src/data/decks';
import { getCard } from '../../src/data/cards';
import { PREVIOUS_PREMADE } from '../../src/data/premadeDecks';

test('premade decks are distinct, legal, and match their opponents', () => {
  assert.equal(OPPONENTS.some(opponent => opponent.id === 'gravekeeper'), false);
  assert.equal(STARTERS['Gravekeeper'], undefined);
  assert.equal(Object.keys(STARTERS).length, OPPONENTS.length);
  assert.equal(new Set(OPPONENTS.map(opponent => JSON.stringify(opponent.deck))).size, OPPONENTS.length);
  assert.ok(new Set(OPPONENTS.map(opponent => opponent.deck.main.length)).size >= 4);
  for (const opponent of OPPONENTS) {
    assert.deepEqual(validateDeck(opponent.deck), [], opponent.name);
    assert.deepEqual(STARTERS[opponent.name], opponent.deck);
  }
  assert.equal(STARTERS['Seto Kaiba'].main.some(id => getCard(id).name === 'Baby Dragon'), false);
  assert.ok(STARTERS['Joey Wheeler'].main.some(id => getCard(id).name === 'Baby Dragon'));
  for (const name of ['Jaden Yuki', 'Jaden Yuki - Neo Space']) {
    const deck = STARTERS[name];
    assert.ok(deck.main.some(id => getCard(id).name === 'Elemental Hero Neos'), name);
    assert.ok(deck.main.some(id => getCard(id).name === 'Neo-Spacian Aqua Dolphin'), name);
    assert.ok(deck.extra.some(id => getCard(id).name === 'Elemental Hero Aqua Neos'), name);
  }
});

test('the removed Gravekeeper deck is deleted from saved decks', () => {
  const values = new Map<string, string>([
    ['arcana-duel.ygo.decks.premade-v2', JSON.stringify({ Gravekeeper: { main: [], extra: [] }, Custom: { main: [], extra: [] } })],
    ['arcana-duel.ygo.starters-seen.premade-v2', JSON.stringify(Object.keys(STARTERS))],
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
  try {
    const decks = loadDecks();
    assert.equal(decks['Gravekeeper'], undefined);
    assert.ok(decks['Custom']);
    assert.equal(JSON.parse(values.get('arcana-duel.ygo.decks.premade-v2')!)['Gravekeeper'], undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('an untouched previous Jaden deck upgrades to include Neos', () => {
  const old = PREVIOUS_PREMADE.filter(opponent => opponent.id === 'jaden').at(-1)!;
  const values = new Map<string, string>([
    ['arcana-duel.ygo.decks.premade-v2', JSON.stringify({ 'Jaden Yuki': old.deck })],
    ['arcana-duel.ygo.starters-seen.premade-v2', JSON.stringify(PREVIOUS_PREMADE.map(opponent => opponent.name))],
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
  try {
    assert.deepEqual(loadDecks()['Jaden Yuki'], STARTERS['Jaden Yuki']);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('only untouched previous premades are upgraded, while custom edits remain', () => {
  const oldYugi = PREVIOUS_PREMADE.find(opponent => opponent.id === 'yugi')!.deck;
  const oldKaiba = structuredClone(PREVIOUS_PREMADE.find(opponent => opponent.id === 'kaiba')!.deck);
  oldKaiba.main.pop();
  const values = new Map<string, string>([
    ['arcana-duel.ygo.decks.premade-v2', JSON.stringify({ 'Yugi Muto': oldYugi, 'Seto Kaiba': oldKaiba })],
    ['arcana-duel.ygo.starters-seen.premade-v2', JSON.stringify(PREVIOUS_PREMADE.map(opponent => opponent.name))],
  ]);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } } });
  try {
    const decks = loadDecks();
    assert.deepEqual(decks['Yugi Muto'], STARTERS['Yugi Muto']);
    assert.deepEqual(decks['Seto Kaiba'], oldKaiba);
    assert.deepEqual(decks['Chazz Princeton'], STARTERS['Chazz Princeton']);
    assert.equal(decks['Joey Wheeler'], undefined);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('premade reset leaves legacy saved decks intact and saves subsequent edits', () => {
  const values = new Map<string, string>([['arcana-duel.ygo.decks', '{"Old Deck":{"main":[],"extra":[]} }']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try {
    const decks = loadDecks();
    assert.ok(decks['Seto Kaiba']);
    assert.equal(decks['Old Deck'], undefined);
    delete decks['Seto Kaiba'];
    saveDecks(decks);
    assert.equal(loadDecks()['Seto Kaiba'], undefined);
    assert.ok(values.get('arcana-duel.ygo.decks')?.includes('Old Deck'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
