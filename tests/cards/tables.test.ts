// Table-driven checks for the plain-data card families: burn/heal, equips, field spells, wipes, rituals, recruiters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Card, Duel } from '../../src/engine/duel';
import type { Attr, Race } from '../../src/engine/types';
import { CARDS } from '../../src/data/cards';
import { setup } from '../helpers';

const normal = (f: { race?: Race; attr?: Attr; not?: { race?: Race; attr?: Attr } }) => CARDS.find((c) => c.kind === 'monster' && c.mtype === 'normal' && (c.def ?? 0) >= 1000 && (c.atk ?? 0) >= 500
  && (!f.race || c.race === f.race) && (!f.attr || c.attr === f.attr) && (!f.not?.race || c.race !== f.not.race) && (!f.not?.attr || c.attr !== f.not.attr))!.name;
async function attack(d: Duel, att: Card, tgt: Card | null) { d.tp = att.ctrl; d.phase = 'BP'; await (d as any).attack(att, tgt); await d.settle(); }

const LP: [string, number, number][] = [
  ['Tremendous Fire', -500, -1000], ["Goblin's Secret Remedy", 600, 0], ['Soul of the Pure', 800, 0], ['Blue Medicine', 400, 0],
  ['Dian Keto the Cure Master', 1000, 0], ['Final Flame', 0, -600], ['Sparks', 0, -200], ['Raimei', 0, -300], ['Mooyan Curry', 200, 0],
  ['Rain of Mercy', 1000, 1000], ['Hinotama', 0, -500], ['Ookazi', 0, -800], ['Red Medicine', 500, 0],
];
for (const [name, mine, theirs] of LP) {
  test(`${name}: LP ${mine >= 0 ? '+' : ''}${mine} / ${theirs >= 0 ? '+' : ''}${theirs}`, async () => {
    const t = setup({ hand: [name] }, {});
    await t.act(t.find(0, name));
    assert.deepEqual([t.P0.lp - 8000, t.P1.lp - 8000], [mine, theirs]);
  });
}

const EQUIPS: [string, string, number, number][] = [
  ["Elf's Light", normal({ attr: 'LIGHT' }), 400, -200], ['Invigoration', normal({ attr: 'EARTH' }), 400, -200],
  ['Sword of Dark Destruction', normal({ attr: 'DARK' }), 400, -200], ['Burning Spear', normal({ attr: 'FIRE' }), 400, -200],
  ['Gust Fan', normal({ attr: 'WIND' }), 400, -200], ['Steel Shell', normal({ attr: 'WATER' }), 400, -200], ['Salamandra', normal({ attr: 'FIRE' }), 700, 0],
  ['Insect Armor with Laser Cannon', normal({ race: 'Insect' }), 700, 0], ['Laser Cannon Armor', normal({ race: 'Insect' }), 300, 300],
  ['Machine Conversion Factory', normal({ race: 'Machine' }), 300, 300], ['Silver Bow and Arrow', normal({ race: 'Fairy' }), 300, 300],
  ['Raise Body Heat', normal({ race: 'Dinosaur' }), 300, 300], ['Electro-Whip', normal({ race: 'Thunder' }), 300, 300],
  ['Dragon Treasure', normal({ race: 'Dragon' }), 300, 300], ['Book of Secret Arts', normal({ race: 'Spellcaster' }), 300, 300],
  ['Follow Wind', normal({ race: 'Winged Beast' }), 300, 300], ['Power of Kaishin', normal({ race: 'Aqua' }), 300, 300],
  ['Vile Germs', normal({ race: 'Plant' }), 300, 300], ['Mystical Moon', normal({ race: 'Beast-Warrior' }), 300, 300],
  ['Violet Crystal', normal({ race: 'Zombie' }), 300, 300], ['Beast Fangs', normal({ race: 'Beast' }), 300, 300], ['Dark Energy', normal({ race: 'Fiend' }), 300, 300],
  ['Legendary Sword', normal({ race: 'Warrior' }), 300, 300], ['Bright Castle', normal({ attr: 'LIGHT' }), 700, 0], ['Cyber Shield', 'Harpie Lady', 500, 0],
  ['Cyclon Laser', 'Gradius', 300, 0], ['Mask of Brutality', 'Battle Ox', 1000, -1000], ['Black Pendant', 'Battle Ox', 500, 0],
  ['Malevolent Nuzzler', 'Battle Ox', 700, 0], ['Horn of Light', 'Battle Ox', 0, 800], ['Sword of Deep-Seated', 'Battle Ox', 500, 500],
  ['Axe of Despair', 'Battle Ox', 1000, 0], ['Stim-Pack', 'Battle Ox', 700, 0], ['Horn of the Unicorn', 'Battle Ox', 700, 700],
  ['Dragonic Attack', normal({ race: 'Warrior' }), 500, 500], ["Sword of Dragon's Soul", normal({ race: 'Warrior' }), 700, 0],
  ['Mage Power', 'Battle Ox', 500, 500], ['Fairy Meteor Crush', 'Battle Ox', 0, 0],
];
for (const [name, mon, atk, def] of EQUIPS) {
  test(`${name} on ${mon}: ${atk}/${def}`, async () => {
    const t = setup({ hand: [name], m: [mon] }, {});
    const m = t.find(0, mon);
    const a = t.d.atk(m), d = t.d.defv(m);
    await t.act(t.find(0, name));
    assert.equal(t.find(0, name).equipTo, m.uid);
    assert.deepEqual([t.d.atk(m) - a, t.d.defv(m) - d], [atk, Math.max(def, -d)]);
  });
}

test('Type / Attribute equips refuse the wrong monster', () => {
  const t = setup({ hand: ['Legendary Sword', "Elf's Light", 'Cyber Shield'], m: [normal({ not: { race: 'Warrior', attr: 'LIGHT' } })] }, {});
  for (const n of ['Legendary Sword', "Elf's Light", 'Cyber Shield']) assert.equal(t.canAct(t.find(0, n)), false, n);
});

const FIELDS: [string, string, number, number][] = [
  ['Umiiruka', normal({ attr: 'WATER' }), 500, -400], ['Gaia Power', normal({ attr: 'EARTH' }), 500, -400], ['Luminous Spark', normal({ attr: 'LIGHT' }), 500, -400],
  ['Mystic Plasma Zone', normal({ attr: 'DARK' }), 500, -400], ['Rising Air Current', normal({ attr: 'WIND' }), 500, -400], ['Molten Destruction', normal({ attr: 'FIRE' }), 500, -400],
  ['Wasteland', normal({ race: 'Zombie' }), 200, 200], ['Sogen', normal({ race: 'Warrior' }), 200, 200], ['Mountain', normal({ race: 'Dragon' }), 200, 200],
  ['Yami', normal({ race: 'Fiend' }), 200, 200], ['Yami', normal({ race: 'Fairy' }), -200, -200], ['Forest', normal({ race: 'Insect' }), 200, 200],
  ['Umi', normal({ race: 'Fish' }), 200, 200], ['Umi', normal({ race: 'Machine' }), -200, -200],
];
for (const [name, mon, atk, def] of FIELDS) {
  test(`${name} affects ${mon}: ${atk}/${def}`, async () => {
    const t = setup({ hand: [name], m: [mon] }, {});
    const m = t.find(0, mon);
    const a = t.d.atk(m), d = t.d.defv(m);
    await t.act(t.find(0, name));
    assert.equal(t.find(0, name).zone, 'fzone');
    assert.deepEqual([t.d.atk(m) - a, t.d.defv(m) - d], [atk, def]);
  });
}

test('Chorus of Sanctuary: Defense Position monsters +500 DEF', async () => {
  const t = setup({ hand: ['Chorus of Sanctuary'], m: [{ name: 'Battle Ox', pos: 'def' }, 'Mystical Elf'] }, {});
  await t.act(t.find(0, 'Chorus of Sanctuary'));
  assert.equal(t.d.defv(t.find(0, 'Battle Ox')), 1500);
  assert.equal(t.d.defv(t.find(0, 'Mystical Elf')), 2000);
});

const WIPES: [string, Race][] = [['Eternal Draught', 'Fish'], ['Breath of Light', 'Rock'], ['Stain Storm', 'Machine'], ['Eradicating Aerosol', 'Insect'], ['Last Day of Witch', 'Spellcaster'], ['Exile of the Wicked', 'Fiend'], ['Warrior Elimination', 'Warrior']];
for (const [name, race] of WIPES) {
  test(`${name} destroys face-up ${race} monsters only`, async () => {
    const hit = normal({ race }), miss = normal({ not: { race } });
    const t = setup({ hand: [name], m: [miss] }, { m: [hit, { name: hit, pos: 'def', faceUp: false }] });
    await t.act(t.find(0, name));
    assert.equal(t.d.monsters(1).length, 1, 'the face-down one survives');
    assert.equal(t.find(0, miss).zone, 'mzone');
  });
}

const SWING: [string, Attr, Attr][] = [['Star Boy', 'WATER', 'FIRE'], ['Bladefly', 'WIND', 'EARTH'], ["Witch's Apprentice", 'DARK', 'LIGHT'], ['Milus Radiant', 'EARTH', 'WIND'], ['Little Chimera', 'FIRE', 'WATER'], ['Hoshiningen', 'LIGHT', 'DARK']];
for (const [name, up, down] of SWING) {
  test(`${name}: ${up} +500, ${down} -400`, () => {
    const a = normal({ attr: up }), b = normal({ attr: down });
    const t = setup({ m: [name, a] }, { m: [b] });
    assert.equal(t.d.atk(t.find(0, a)), (CARDS.find((c) => c.name === a)!.atk ?? 0) + 500);
    assert.equal(t.d.atk(t.find(1, b)), Math.max(0, (CARDS.find((c) => c.name === b)!.atk ?? 0) - 400));
  });
}

for (const name of ['Jinzo #7', 'Rainbow Flower', 'Leghul', 'Mystic Lamp', 'Ooguchi']) {
  test(`${name} attacks directly`, async () => {
    const t = setup({ m: [name] }, { m: ['Blue-Eyes White Dragon'] });
    const c = t.find(0, name);
    await attack(t.d, c, null);
    assert.equal(t.P1.lp, 8000 - (c.def.atk ?? 0));
  });
}

const RITUALS: [string, string][] = [
  ['Beastly Mirror Ritual', "Fiend's Mirror"], ['Black Illusion Ritual', 'Relinquished'], ['Commencement Dance', 'Performance of Sword'],
  ['Dark Magic Ritual', 'Magician of Black Chaos'], ['Turtle Oath', 'Crab Turtle'], ['Curse of the Masked Beast', 'The Masked Beast'], ['Garma Sword Oath', 'Garma Sword'],
  ['Javelin Beetle Pact', 'Javelin Beetle'], ['Revival of Dokurorider', 'Dokurorider'], ['Zera Ritual', 'Zera The Mant'], ['Resurrection of Chakra', 'Chakra'],
  ['Hamburger Recipe', 'Hungry Burger'], ["Fortress Whale's Oath", 'Fortress Whale'], ['War-Lion Ritual', 'Super War-Lion'], ["Novox's Prayer", 'Skull Guardian'],
];
test('Ritual reveal follows tributes and precedes position selection', async () => {
  const t = setup({ hand: ['Black Illusion Ritual', 'Relinquished', 'Blue-Eyes White Dragon'] }, {});
  const order: string[] = [];
  const ask = t.ctl[0].ask.bind(t.ctl[0]);
  t.ctl[0].ask = async (prompt, duel, side) => {
    if (prompt.t === 'position') { order.push('position'); return 'def'; }
    return ask(prompt, duel, side);
  };
  t.d.onEvent = (event) => {
    if (event.t === 'ritual') {
      order.push('ritual');
      assert.equal(event.card.def.name, 'Relinquished');
      assert.equal(event.card.zone, 'hand');
      assert.equal(t.find(0, 'Blue-Eyes White Dragon').zone, 'gy');
    }
  };
  await t.act(t.find(0, 'Black Illusion Ritual'));
  assert.deepEqual(order, ['ritual', 'position']);
  assert.equal(t.find(0, 'Relinquished').pos, 'def');
});
for (const [spell, mon] of RITUALS) {
  test(`${spell} Ritual Summons ${mon}`, async () => {
    const t = setup({ hand: [spell, mon, 'Blue-Eyes White Dragon'] }, {});
    assert.ok(!t.d.mainActions(0, false).some((a) => (a.a === 'summon' || a.a === 'mset') && a.card.def.name === mon), 'no Normal Summon');
    await t.act(t.find(0, spell));
    assert.equal(t.find(0, mon).zone, 'mzone');
    assert.equal(t.find(0, 'Blue-Eyes White Dragon').zone, 'gy');
  });
  test(`${spell} needs enough Levels`, () => {
    const t = setup({ hand: [spell, mon, 'Petit Moth'] }, {});
    assert.equal(t.canAct(t.find(0, spell)), (CARDS.find((c) => c.name === mon)!.lv ?? 0) <= 1);
  });
}

const RECRUITERS: [string, Attr, boolean][] = [['Mystic Tomato', 'DARK', false], ['Mother Grizzly', 'WATER', true], ['Shining Angel', 'LIGHT', true], ['Flying Kamakiri #1', 'WIND', true], ['UFO Turtle', 'FIRE', true], ['Giant Rat', 'EARTH', false]];
for (const [name, attr] of RECRUITERS) {
  test(`${name} recruits a ${attr} monster with 1500 or less ATK`, async () => {
    const pick = CARDS.find((c) => c.kind === 'monster' && c.mtype === 'normal' && c.attr === attr && (c.atk ?? 0) <= 1500 && c.name !== name)!.name;
    const big = CARDS.find((c) => c.kind === 'monster' && c.mtype === 'normal' && c.attr === attr && (c.atk ?? 0) > 1500)!.name;
    const t = setup({ m: [name], deck: [big, pick] }, { m: ['Blue-Eyes White Dragon'] });
    await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, name));
    assert.deepEqual(t.d.monsters(0).map((c) => c.def.name), [pick]);
  });
}

for (const sub of ['Goddess with the Third Eye', 'Beastking of the Swamps', 'Versago the Destroyer']) {
  test(`${sub} substitutes for one Fusion-Material Monster`, async () => {
    const t = setup({ hand: ['Polymerization', sub, 'Flame Manipulator'], extra: ['Flame Swordsman'] }, {});
    await t.act(t.find(0, 'Polymerization'));
    assert.equal(t.find(0, 'Flame Swordsman').zone, 'mzone');
  });
}

test('a Fusion substitute cannot replace both materials', () => {
  const t = setup({ hand: ['Polymerization', 'Mystical Sheep #1', 'Versago the Destroyer'], extra: ['Flame Swordsman'] }, {});
  assert.equal(t.canAct(t.find(0, 'Polymerization')), false);
});

test('Fusion Sage searches Polymerization', async () => {
  const t = setup({ hand: ['Fusion Sage'], deck: ['Polymerization'] }, {});
  await t.act(t.find(0, 'Fusion Sage'));
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Polymerization'));
});

