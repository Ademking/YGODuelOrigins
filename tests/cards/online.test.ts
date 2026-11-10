// Mechanics added for the YGO Online card pool, each checked through a representative card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Card, type Duel } from '../../src/engine/duel';
import { setup, pickNamed } from '../helpers';
import { addCtr, ctr } from '../../src/data/effects/lib';

async function attack(d: Duel, att: Card, tgt: Card | null) { d.tp = att.ctrl; d.phase = 'BP'; await (d as any).attack(att, tgt); await d.settle(); }
const endTurn = async (d: Duel, tp: 0 | 1) => { d.tp = tp; d.phase = 'EP'; await (d as any).endPhase(); };
const act = async (d: Duel, p: 0 | 1, pred: (a: any) => boolean) => {
  d.tp = p;
  const a = d.mainActions(p, false).find(pred);
  assert.ok(a, 'action available');
  await (d as any).perform(a);
  await d.settle();
};

test('Cup of Ace emits the actual toss before drawing', async () => {
  for (const [roll, heads] of [[0.1, true], [0.9, false]] as const) {
    const t = setup({ hand: ['Cup of Ace'] }, {}, () => roll);
    const events: boolean[][] = [];
    t.d.onEvent = async (event) => {
      if (event.t === 'coinToss') {
        events.push(event.results);
        assert.equal(t.P1.hand.length, 0);
      }
    };
    await t.act(t.find(0, 'Cup of Ace'));
    assert.deepEqual(events, [[heads]]);
    assert.equal(t.P0.hand.length, heads ? 2 : 0);
    assert.equal(t.P1.hand.length, heads ? 0 : 2);
  }
});

test('Union: Armor Breaker equips to a Warrior, protects it, and unequips', async () => {
  const t = setup({ m: ['Armor Breaker', 'Command Knight'] }, { m: ['Blue-Eyes White Dragon'] });
  const ab = t.find(0, 'Armor Breaker'), ck = t.find(0, 'Command Knight');
  t.answer(0, pickNamed('Command Knight'));
  await t.act(ab, 0);
  assert.equal(ab.zone, 'szone');
  assert.equal(t.d.equippedTo(ab), ck);
  await t.d.destroy(ck, 'effect');
  assert.equal(ck.zone, 'mzone', 'the Union is destroyed instead');
  assert.equal(ab.zone, 'gy');
});

test('Gemini: Chthonian Emperor Dragon is a Normal Monster until Normal Summoned again', async () => {
  const t = setup({ m: ['Chthonian Emperor Dragon'] });
  const c = t.find(0, 'Chthonian Emperor Dragon');
  c.summonedTurn = 3;
  assert.equal(t.d.hasRule(c, 'doubleAttack'), false);
  await act(t.d, 0, (a) => a.a === 'gemini' && a.card === c);
  assert.equal(t.d.hasRule(c, 'doubleAttack'), true);
  assert.equal(t.P0.normalDone, true);
});

test('Spirit: Yata-Garasu returns to the hand in the End Phase and cannot be Special Summoned', async () => {
  const t = setup({ hand: ['Yata-Garasu'] });
  await act(t.d, 0, (a) => a.a === 'summon' && a.card.def.name === 'Yata-Garasu');
  const y = t.find(0, 'Yata-Garasu');
  assert.equal(y.zone, 'mzone');
  await endTurn(t.d, 0);
  assert.equal(y.zone, 'hand');
  assert.equal(t.d.canSpecial(0, y), false);
});

test('Spell Counters: Royal Magical Library counts Spells and draws with 3', async () => {
  const t = setup({ m: ['Royal Magical Library'], hand: ['Pot of Greed', 'Pot of Greed', 'Pot of Greed'] });
  for (let i = 0; i < 3; i++) await t.act(t.P0.hand.find((c) => c.def.name === 'Pot of Greed')!);
  const lib = t.find(0, 'Royal Magical Library');
  assert.equal(lib.data.ctr.spell, 3);
  const before = t.P0.hand.length;
  await t.act(lib);
  assert.equal(t.P0.hand.length, before + 1);
  assert.equal(lib.data.ctr.spell, 0);
});

test('Ancient Gear Castle counts both players normal summons and sets, but not special summons', async () => {
  const t = setup({ s: [{ name: 'Ancient Gear Castle', faceUp: true }], hand: ['Battle Ox'] }, { hand: ['Celtic Guardian', 'Sangan'] });
  const castle = t.find(0, 'Ancient Gear Castle');
  await act(t.d, 0, action => action.a === 'summon' && action.card.def.name === 'Battle Ox');
  assert.equal(ctr(castle, 'gear'), 1);
  await act(t.d, 1, action => action.a === 'mset' && action.card.def.name === 'Celtic Guardian');
  assert.equal(ctr(castle, 'gear'), 2);
  await t.d.specialSummon(t.find(1, 'Sangan'), 1, 'atk');
  assert.equal(ctr(castle, 'gear'), 2);
});

test('Ancient Gear Castle can be tributed for an Ancient Gear summon with enough counters', async () => {
  const t = setup({ s: [{ name: 'Ancient Gear Castle', faceUp: true }], hand: ['Ancient Gear Golem', 'Dark Magician'] });
  const castle = t.find(0, 'Ancient Gear Castle');
  addCtr(t.d, castle, 1, 'gear');
  assert.equal(t.d.mainActions(0, false).some(action => action.a === 'summon' && action.substitute === castle), false);
  addCtr(t.d, castle, 1, 'gear');
  const actions = t.d.mainActions(0, false);
  assert.ok(actions.some(action => action.a === 'summon' && action.card.def.name === 'Ancient Gear Golem' && action.substitute === castle));
  assert.equal(actions.some(action => action.a === 'summon' && action.card.def.name === 'Dark Magician' && action.substitute === castle), false);
  assert.equal(actions.some(action => action.a === 'mset' && action.substitute === castle), false);
  await act(t.d, 0, action => action.a === 'summon' && action.card.def.name === 'Ancient Gear Golem' && action.substitute === castle);
  assert.equal(castle.zone, 'gy');
  assert.equal(ctr(castle, 'gear'), 0);
  assert.equal(t.find(0, 'Ancient Gear Golem').zone, 'mzone');
});

test('counters clear when a card turns face-down or leaves the field', async () => {
  const t = setup({ m: ['Royal Magical Library'] });
  const card = t.find(0, 'Royal Magical Library');
  addCtr(t.d, card, 2);
  await t.d.setFaceDown(card);
  assert.equal(ctr(card), 0);
  assert.equal(addCtr(t.d, card), 0);
  await t.d.changePos(card, 'reveal');
  addCtr(t.d, card, 1);
  await t.d.move(card, 'gy');
  assert.equal(ctr(card), 0);
});

test('Mausoleum of the Emperor: pay LP instead of Tributes', async () => {
  const t = setup({ hand: ['Blue-Eyes White Dragon'], f: 'Mausoleum of the Emperor' });
  await act(t.d, 0, (a) => a.a === 'summon' && a.lp === 2000);
  assert.equal(t.find(0, 'Blue-Eyes White Dragon').zone, 'mzone');
  assert.equal(t.P0.lp, 6000);
});

test('Double Tribute: Double Coston counts as 2 Tributes for a DARK monster', async () => {
  const t = setup({ m: ['Double Coston'], hand: ['Dark Magician'] });
  await act(t.d, 0, (a) => a.a === 'summon' && a.card.def.name === 'Dark Magician');
  assert.equal(t.find(0, 'Dark Magician').zone, 'mzone');
  assert.equal(t.find(0, 'Double Coston').zone, 'gy');
});

test('Trap monster: Metal Reflect Slime becomes a 3000 DEF monster and is a Trap again in the Graveyard', async () => {
  const t = setup({ s: ['Metal Reflect Slime'] });
  const s = t.find(0, 'Metal Reflect Slime');
  await t.act(s);
  assert.equal(s.zone, 'mzone');
  assert.equal(t.d.defv(s), 3000);
  await t.d.destroy(s, 'effect');
  assert.equal(s.def.kind, 'trap');
});

test('Contact Fusion: Elemental Hero Air Neos returns its materials to the Deck', async () => {
  const t = setup({ m: ['Elemental Hero Neos', 'Neo-Spacian Air Hummingbird'], extra: ['Elemental Hero Air Neos'] });
  await act(t.d, 0, (a) => a.a === 'ss' && a.card.def.name === 'Elemental Hero Air Neos');
  assert.equal(t.find(0, 'Elemental Hero Air Neos').zone, 'mzone');
  assert.equal(t.find(0, 'Elemental Hero Neos').zone, 'deck');
  await endTurn(t.d, 0);
  assert.equal(t.find(0, 'Elemental Hero Air Neos').zone, 'extra');
});

test('Counter Trap: Dark Bribe negates a Spell and the opponent draws', async () => {
  const t = setup({ hand: ['Raigeki'] }, { s: ['Dark Bribe'], m: ['Battle Ox'] });
  t.answer(1, (p) => (p.t === 'chain' ? p.actions.find((a) => a.a === 'act' && a.card.def.name === 'Dark Bribe') : undefined));
  const before = t.P0.hand.length;
  await t.act(t.find(0, 'Raigeki'));
  assert.equal(t.find(1, 'Battle Ox').zone, 'mzone');
  assert.equal(t.P0.hand.length, before);
});

test('Crystal Beast: destroyed, it can be placed as a Continuous Spell', async () => {
  const t = setup({ m: ['Crystal Beast Ruby Carbuncle'] });
  const c = t.find(0, 'Crystal Beast Ruby Carbuncle');
  await t.d.destroy(c, 'effect');
  await t.d.settle();
  assert.equal(c.zone, 'szone');
  assert.equal(c.data.asSpell, true);
});

test('A-Counters: monsters lose 300 ATK per counter when battling an Alien', async () => {
  const t = setup({ m: ['Alien Warrior'] }, { m: ['Battle Ox'] });
  const ox = t.find(1, 'Battle Ox');
  ox.data.ctr = { A: 2 };
  t.d.battle = { att: t.find(0, 'Alien Warrior'), tgt: ox };
  assert.equal(t.d.atk(ox), 1700 - 600);
  t.d.battle = null;
  assert.equal(t.d.atk(ox), 1700);
});

test('Levels: Cost Down lowers the Tributes needed', async () => {
  const t = setup({ hand: ['Cost Down', 'Summoned Skull', 'Battle Ox'] });
  t.answer(0, pickNamed('Battle Ox'));
  await t.act(t.find(0, 'Cost Down'));
  assert.equal(t.d.tributesNeeded(0, t.find(0, 'Summoned Skull')), 0);
});

test('Gladiator Beast tag-out: Laquari returns to the Deck at the end of the Battle Phase', async () => {
  const t = setup({ m: ['Gladiator Beast Laquari'], deck: ['Gladiator Beast Bestiari'] }, {});
  const l = t.find(0, 'Gladiator Beast Laquari');
  await attack(t.d, l, null);
  await (t.d as any).runTasks('BPend');
  assert.equal(l.zone, 'deck');
  assert.equal(t.find(0, 'Gladiator Beast Bestiari').zone, 'mzone');
});

test('Necrovalley stops Graveyard banishing', async () => {
  const t = setup({ f: 'Necrovalley', gy: ['Battle Ox'] });
  const ox = t.find(0, 'Battle Ox');
  await t.d.banish(ox, 1);
  assert.equal(ox.zone, 'gy');
});
