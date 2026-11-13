import assert from 'node:assert/strict';
import test from 'node:test';
import { AIController } from '../../src/engine/ai';
import { pickNamed, respondWith, setup } from '../helpers';

test('Needle Worm mills when Banisher of the Light banishes it in battle', async () => {
  const { d, P0, find } = setup({ m: ['Spear Dragon', 'Banisher of the Light'] }, {
    m: [{ name: 'Needle Worm', faceUp: false, pos: 'def' }],
  });
  const deckSize = P0.deck.length;
  const worm = find(1, 'Needle Worm');
  await d['attack'](find(0, 'Spear Dragon'), worm);
  await d.settle();
  assert.equal(worm.zone, 'banished');
  assert.equal(P0.deck.length, deckSize - 5);
});

test('Spear Dragon deals piercing damage through set Neo-Spacians', async () => {
  for (const name of ['Neo-Spacian Grand Mole', 'Neo-Spacian Glow Moss']) {
    const { d, P1, find } = setup({ m: ['Spear Dragon'] }, { m: [{ name, faceUp: false, pos: 'def' }] });
    const target = find(1, name);
    const expected = d.atk(find(0, 'Spear Dragon')) - (target.def.def ?? 0);
    await d['attack'](find(0, 'Spear Dragon'), target);
    await d.settle();
    assert.equal(P1.lp, 8000 - expected);
    assert.equal(target.zone, 'gy');
  }
});

test('Crass Clown triggers when Flip Summoned into Attack Position', async () => {
  const t = setup({ m: [{ name: 'Crass Clown', faceUp: false, pos: 'def' }] }, { m: ['Battle Ox'] });
  await t.d['perform']({ a: 'flip', card: t.find(0, 'Crass Clown') });
  await t.d.settle();
  assert.equal(t.find(1, 'Battle Ox').zone, 'hand');
});

test('Spellbinding Circle stops Panther Warrior after its Tribute has been paid', async () => {
  const t = setup({ m: ['Panther Warrior', 'Battle Ox'] }, { s: ['Spellbinding Circle'] });
  t.answer(1, respondWith('Spellbinding Circle'));
  await t.d['attack'](t.find(0, 'Panther Warrior'), null);
  assert.equal(t.find(0, 'Battle Ox').zone, 'gy');
  assert.equal(t.P1.lp, 8000);
});

test('Level Limit and Stumbling respect Horus LV6 spell immunity', async () => {
  for (const name of ['Level Limit - Area B', 'Stumbling']) {
    const t = setup({ hand: [name, 'Battle Ox'] }, { m: ['Horus the Black Flame Dragon LV6'] });
    const horus = t.find(1, 'Horus the Black Flame Dragon LV6');
    await t.act(t.find(0, name));
    await t.d['announceSummon']([horus], 1, 'special');
    assert.equal(horus.pos, 'atk');
  }
});

test('Monster Gate excavates past envoy monsters and Ritual Monsters', async () => {
  const t = setup({
    m: ['Battle Ox'], hand: ['Monster Gate'],
    deck: ['La Jinn the Mystical Genie of the Lamp', 'Black Luster Soldier', 'Black Luster Soldier - Envoy of the Beginning', 'Chaos Emperor Dragon - Envoy of the End'],
  });
  await t.act(t.find(0, 'Monster Gate'));
  assert.equal(t.find(0, 'La Jinn the Mystical Genie of the Lamp').zone, 'mzone');
  for (const name of ['Black Luster Soldier', 'Black Luster Soldier - Envoy of the Beginning', 'Chaos Emperor Dragon - Envoy of the End']) {
    assert.equal(t.find(0, name).zone, 'gy');
  }
});

test('Ojamagic can be Set and resolves only after being sent to the Graveyard', async () => {
  const t = setup({ hand: ['Ojamagic'], deck: ['Ojama Black', 'Ojama Green', 'Ojama Yellow'] });
  const card = t.find(0, 'Ojamagic');
  assert.equal(t.canAct(card), false);
  assert.ok(t.d.mainActions(0, false).some((a) => a.a === 'sset' && a.card === card));
  await t.d.discard(0, [card], 0);
  await t.d.settle();
  assert.equal(t.P0.hand.length, 3);
});

test('Kycoo only offers monsters in the opposing Graveyard', async () => {
  const t = setup({ m: ['Kycoo the Ghost Destroyer'] }, { gy: ['Battle Ox', 'Pot of Greed', 'Mirror Force'] });
  t.answer(0, pickNamed('Battle Ox', 'Pot of Greed', 'Mirror Force'));
  await t.d['attack'](t.find(0, 'Kycoo the Ghost Destroyer'), null);
  await t.d.settle();
  assert.deepEqual(t.P1.banished.map((c) => c.def.name), ['Battle Ox']);
});

test('summon priority offers ignition first and lets the opponent respond when passed', async () => {
  const t = setup({ m: ['Cannon Soldier'] }, { s: ['Trap Hole'], m: ['Battle Ox'] });
  const monster = t.find(0, 'Cannon Soldier');
  const order: string[] = [];
  t.answer(0, (p) => {
    if (p.t !== 'chain') return;
    order.push('ignition');
    assert.ok(p.actions.some((a) => a.a === 'act' && a.card === monster));
    return null;
  });
  t.answer(1, (p) => {
    if (p.t !== 'chain') return;
    order.push('trap');
    return respondWith('Trap Hole')(p, t.d, 1);
  });
  await t.d['announceSummon']([monster], 0, 'normal');
  await t.d.settle();
  assert.deepEqual(order, ['ignition', 'trap']);
  assert.equal(monster.zone, 'gy');
});

test('CPU prefers its own Neos and attacks set defenders without reading their stats', async () => {
  const t = setup({ m: ['Elemental Hero Neos', 'Battle Ox'] }, {
    m: ['Elemental Hero Neos', { name: 'Blue-Eyes White Dragon', faceUp: false, pos: 'def' }],
  });
  const ai = new AIController('hard', 0, () => 0.5);
  const near = t.find(0, 'Elemental Hero Neos');
  const far = t.find(1, 'Elemental Hero Neos');
  assert.deepEqual(await ai.ask({ t: 'select', text: '', cards: [far, near], min: 1, max: 1, purpose: 'good' }, t.d, 0), [near]);
  const target = t.find(1, 'Blue-Eyes White Dragon');
  assert.ok(ai.scoreAttack(t.d, 0, t.find(0, 'Battle Ox'), target) > 0);
});

test('The Seal of Orichalcos boosts monsters and survives the first destruction attempt each turn', async () => {
  const t = setup({ hand: ['The Seal of Orichalcos'], m: ['Battle Ox', 'Spear Dragon'] }, { m: ['Blue-Eyes White Dragon'] });
  const seal = t.find(0, 'The Seal of Orichalcos');
  const ox = t.find(0, 'Battle Ox');
  const dragon = t.find(1, 'Blue-Eyes White Dragon');
  await t.act(seal);
  assert.equal(t.d.atk(ox), 2200);
  assert.ok(!t.d.attackTargets(dragon).includes(ox));
  assert.equal(await t.d.destroy(seal, 'effect'), false);
  assert.equal(await t.d.destroy(seal, 'effect'), true);
  await t.d.toHand(seal);
  assert.equal(t.canAct(seal), false);
});

test('Destiny Hero Malicious activates from the Graveyard and summons a copy', async () => {
  const t = setup({ gy: ['Destiny Hero - Malicious'], deck: ['Destiny Hero - Malicious'] });
  const malicious = t.P0.gy[0];
  assert.ok(t.d.mainActions(0, false).some((a) => a.a === 'act' && a.card === malicious));
  await t.act(malicious);
  assert.equal(malicious.zone, 'banished');
  assert.equal(t.d.monsters(0)[0]?.def.name, 'Destiny Hero - Malicious');
});

test('Overdragon can attack directly once or attack monsters up to its material count', async () => {
  const name = 'Chimeratech Overdragon';
  const direct = setup({ m: [name] });
  const dragon = direct.find(0, name);
  dragon.mark.matCount = 3;
  direct.d.phase = 'BP';
  assert.deepEqual(direct.d.attackTargets(dragon), [null]);
  await direct.d['attack'](dragon, null);
  assert.equal(direct.d.canAttack(dragon), false);
  const lateMonster = direct.P1.deck.pop()!;
  direct.d.placeMonster(lateMonster, 1, true, 'def');
  assert.deepEqual(direct.d.attackTargets(dragon), []);

  const monsters = setup({ m: [name] }, { m: [{ name: 'Spirit Reaper', pos: 'def' }] });
  const attacker = monsters.find(0, name);
  const reaper = monsters.find(1, 'Spirit Reaper');
  attacker.mark.matCount = 2;
  monsters.d.phase = 'BP';
  await monsters.d['attack'](attacker, reaper);
  assert.equal(monsters.d.canAttack(attacker), true);
  assert.deepEqual(monsters.d.attackTargets(attacker), [reaper]);
  await monsters.d['attack'](attacker, reaper);
  assert.equal(monsters.d.canAttack(attacker), false);
  await monsters.d.move(reaper, 'gy');
  assert.deepEqual(monsters.d.attackTargets(attacker), []);
});
