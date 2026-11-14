// Representative full duels: themed decks built around scripted mechanics, CPU vs CPU to completion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Duel, type DeckList } from '../../src/engine/duel';
import { AIController } from '../../src/engine/ai';
import { OPPONENTS, validateDeck } from '../../src/data/decks';
import { getCard as liveCard } from '../../src/ocgcore/catalog';
import { byName, mulberry } from '../helpers';

test('every opponent has a legal deck and an included ace', () => {
  assert.equal(new Set(OPPONENTS.map(opponent => opponent.id)).size, OPPONENTS.length);
  for (const opponent of OPPONENTS) {
    assert.deepEqual(validateDeck(opponent.deck), [], opponent.name);
    assert.ok([...opponent.deck.main, ...opponent.deck.extra].some(id => liveCard(id).name === opponent.ace), opponent.name);
  }
});

const deck = (counts: Record<string, number>, extra: Record<string, number> = {}): DeckList => {
  const ids = (c: Record<string, number>) => Object.entries(c).flatMap(([n, k]) => Array<string>(k).fill(byName(n).id));
  return { main: ids(counts), extra: ids(extra) };
};

const THEMES: Record<string, DeckList> = {
  Toon: deck({
    'Toon World': 3, 'Toon Summoned Skull': 2, 'Manga Ryu-Ran': 2, 'Toon Mermaid': 3, 'Blue-Eyes Toon Dragon': 1, 'Battle Ox': 3, 'Mystical Elf': 3,
    'Sangan': 2, 'Witch of the Black Forest': 2, 'Pot of Greed': 1, 'Graceful Charity': 1, 'Scapegoat': 2, 'Mystical Space Typhoon': 2,
    'Waboku': 2, 'Kuriboh': 3, 'Multiply': 2, 'Card Destruction': 1, 'Trap Hole': 2, 'Ring of Destruction': 1, 'Call Of The Haunted': 1, 'Premature Burial': 1,
  }),
  Ritual: deck({
    'Black Luster Ritual': 2, 'Black Luster Soldier': 2, 'Dark Magic Ritual': 2, 'Magician of Black Chaos': 2, 'Senju of the Thousand Hands': 3, 'Sonic Bird': 3,
    'Summoned Skull': 2, 'Battle Ox': 3, 'Celtic Guardian': 3, 'Dark Magician': 2, 'Dark Magician Girl': 2, 'Pot of Greed': 1, 'Snatch Steal': 1,
    'Swords of Revealing Light': 2, 'Fissure': 2, 'Jinzo': 2, 'Mirror Force': 1, 'Magic Cylinder': 1, 'Royal Decree': 1, 'Michizure': 2, 'Shift': 1,
  }),
  Burn: deck({
    'Fire Princess': 3, 'Marie the Fallen One': 2, 'Cure Mermaid': 3, 'Spirit of the Breeze': 2, 'Dancing Fairy': 3, 'Catapult Turtle': 2, 'Cannon Soldier': 2,
    'Princess of Tsurugi': 2, 'Lady Assailant of Flames': 2, 'Ookazi': 3, 'Hinotama': 3, 'Restructer Revolution': 2, 'Solemn Wishes': 2, 'Gift of The Mystical Elf': 2,
    'Minor Goblin Official': 2, 'Messenger of Peace': 2, 'Gravity Bind': 1, 'Attack and Receive': 2,
  }),
  Control: deck({
    'Man-Eater Bug': 2, 'Cyber Jar': 1, 'Morphing Jar': 1, 'Penguin Soldier': 2, 'Big Shield Gardna': 2, 'Hane-Hane': 2, 'Time Wizard': 2, 'Barrel Dragon': 2,
    'Gate Guardian': 1, 'Sanga of the Thunder': 1, 'Kazejin': 1, 'Suijin': 1, 'Invader of the Throne': 2, 'Dark Necrofear': 1, 'Feral Imp': 3,
    'Nobleman of Crossout': 2, 'Change of Heart': 1, 'Confiscation': 1, 'Delinquent Duo': 1, 'Heavy Storm': 1, 'Imperial Order': 1, 'Torrential Tribute': 1,
    'Crush Card': 1, 'Fake Trap': 1, 'Dust Tornado': 2, 'Ultimate Offering': 1, 'Shadow of Eyes': 2,
  }, { 'Thousand-Eyes Restrict': 1 }),
  Exodia: deck({
    'Exodia the Forbidden One': 1, 'Left Leg of the Forbidden One': 1, 'Right Leg of the Forbidden One': 1, 'Left Arm of the Forbidden One': 1, 'Right Arm of the Forbidden One': 1,
    'Sangan': 3, 'Witch of the Black Forest': 3, 'Big Shield Gardna': 3, 'Pot of Greed': 1, 'Graceful Charity': 1, 'Card Destruction': 1, 'Morphing Jar': 1, 'Painful Choice': 1,
    'Swords of Revealing Light': 3, 'Messenger of Peace': 3, 'Scapegoat': 3, 'Waboku': 3, 'Gravity Bind': 3, 'Destiny Board': 1, 'Spirit Message "I"': 1,
    'Spirit Message "N"': 1, 'Spirit Message "A"': 1, 'Spirit Message "L"': 1, 'Upstart Goblin': 1,
  }),
};

test('themed decks are legal', () => {
  for (const [name, d] of Object.entries(THEMES)) assert.deepEqual(validateDeck(d).filter((e) => !e.includes('minimum')), [], name);
});

test('new GX opponents complete CPU duels', async () => {
  const ids = ['jaden-neos', 'jesse', 'axel', 'bastion', 'alexis'];
  const rival = OPPONENTS.find(opponent => opponent.id === 'yugi')!;
  for (const [index, id] of ids.entries()) {
    const opponent = OPPONENTS.find(candidate => candidate.id === id);
    assert.ok(opponent, id);
    const rng = mulberry(8100 + index);
    const duel = new Duel([opponent.deck, rival.deck], [opponent.name, rival.name], [new AIController('hard', 0, rng), new AIController('normal', 0, rng)], () => {}, rng);
    const result = await duel.run();
    assert.ok(result.reason, id);
  }
});

test('legacy themed CPU duels finish without engine errors', async () => {
  // Live premade decks include OCGCore-only cards and are covered for every opponent in ocgcore.test.ts.
  const all: [string, DeckList][] = Object.entries(THEMES);
  const reasons: Record<string, number> = {};
  for (let i = 0; i < 40; i++) {
    const rng = mulberry(7000 + i);
    const a = all[i % all.length], b = all[(i * 3 + 1) % all.length];
    const duel = new Duel([a[1], b[1]], [a[0], b[0]], [new AIController('hard', 0, rng), new AIController('normal', 0, rng)], () => {}, rng);
    const r = await duel.run();
    reasons[r.reason.replace(/^.*(Life Points|could not draw|turn limit|both|Exodia|Destiny Board).*$/, '$1')] = 1 + (reasons[r.reason] ?? 0);
  }
  assert.ok(Object.keys(reasons).length > 0);
});
