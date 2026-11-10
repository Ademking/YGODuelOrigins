// Second batch of per-card assertions (scripted cards).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Card, type Duel } from '../../src/engine/duel';
import { setup, pickNamed, respondWith, chooseOption } from '../helpers';

const names = (cs: Card[]) => cs.map((c) => c.def.name).sort();
async function attack(d: Duel, att: Card, tgt: Card | null) { d.tp = att.ctrl; d.phase = 'BP'; await (d as any).attack(att, tgt); await d.settle(); }
const standby = async (d: Duel, tp: 0 | 1) => { d.turn++; d.tp = tp; d.phase = 'SP'; await (d as any).standby(); };
const endTurn = async (d: Duel, tp: 0 | 1) => { d.tp = tp; d.phase = 'EP'; await (d as any).endPhase(); };
const flipUp = async (d: Duel, c: Card) => { await d.changePos(c, 'reveal'); await d.settle(); };
const fd = (name: string) => ({ name, pos: 'def' as const, faceUp: false });

test('Aqua Chorus: +500/+500 to monsters sharing a name', () => {
  const t = setup({ s: [{ name: 'Aqua Chorus', faceUp: true }], m: ['Battle Ox', 'Battle Ox', 'Feral Imp'] });
  assert.equal(t.d.atk(t.d.monsters(0)[0]), 2200);
  assert.equal(t.d.atk(t.find(0, 'Feral Imp')), 1300);
});

test('Skull Dice / Graceful Dice roll 1-6 hundreds', async () => {
  const t = setup({ s: ['Skull Dice'], hand: ['Graceful Dice'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] }, () => 0.5);
  await t.act(t.find(0, 'Skull Dice'));
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 2600);
  await t.act(t.find(0, 'Graceful Dice'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 2100);
});

test('dice events finish before their card effect applies', async () => {
  const t = setup({ hand: ['Graceful Dice'], m: ['Battle Ox'] }, {}, () => 0.5);
  let release!: () => void;
  let shown!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { shown = resolve; });
  const results: number[] = [];
  t.d.onEvent = async event => {
    if (event.t === 'diceRoll') { results.push(event.result); shown(); await waiting; }
  };
  const activation = t.act(t.find(0, 'Graceful Dice'));
  await started;
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1700);
  release();
  await activation;
  assert.deepEqual(results, [4]);
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 2100);
});

test('dice re-roll emits both outcomes in order', async () => {
  const rolls = [0, 0.99];
  const t = setup({}, {}, () => rolls.shift() ?? 0);
  const events: { result: number; rerolled: boolean }[] = [];
  t.d.flags.reroll = 1;
  t.d.onEvent = event => { if (event.t === 'diceRoll') events.push({ result: event.result, rerolled: event.rerolled }); };
  assert.equal(await t.d.die(), 6);
  assert.deepEqual(events, [{ result: 1, rerolled: true }, { result: 6, rerolled: false }]);
});

test("Hiro's Shadow Scout: opponent draws 3 and discards the Spells", async () => {
  const t = setup({ m: [fd("Hiro's Shadow Scout")] }, { deck: ['Battle Ox', 'Pot of Greed', 'Raigeki'] });
  await flipUp(t.d, t.find(0, "Hiro's Shadow Scout"));
  assert.deepEqual(names(t.P1.hand), ['Battle Ox']);
  assert.deepEqual(names(t.P1.gy), ['Pot of Greed', 'Raigeki']);
});

test("Nightmare's Steelcage: nobody can attack for 2 opponent turns", async () => {
  const t = setup({ hand: ["Nightmare's Steelcage"], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, "Nightmare's Steelcage"));
  t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(0, 'Battle Ox')), false);
  await endTurn(t.d, 1); await endTurn(t.d, 1);
  assert.equal(t.find(0, "Nightmare's Steelcage").zone, 'gy');
});

test('The Shallow Grave: each player revives a monster face-down', async () => {
  const t = setup({ hand: ['The Shallow Grave'], gy: ['Battle Ox'] }, { gy: ['Feral Imp'] });
  await t.act(t.find(0, 'The Shallow Grave'));
  assert.equal(t.find(0, 'Battle Ox').faceUp, false);
  assert.equal(t.find(1, 'Feral Imp').zone, 'mzone');
});

test('Ameba: 2000 damage to its new controller', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { m: ['Ameba'] });
  await t.act(t.find(0, 'Change of Heart'));
  assert.equal(t.P0.lp, 6000);
});

test('Invitation to a Dark Sleep: the chosen monster cannot attack', async () => {
  const t = setup({ hand: ['Invitation to a Dark Sleep'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  await (t.d as any).perform(t.d.mainActions(0, false).find((a) => a.a === 'summon' && a.card.def.name === 'Invitation to a Dark Sleep'));
  await t.d.settle();
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
});

test('Beast of Gilfer becomes an Equip (-500 ATK) when sent to the Graveyard', async () => {
  const t = setup({ m: ['Beast of Gilfer'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.d.destroy(t.find(0, 'Beast of Gilfer'), 'effect');
  await t.d.settle();
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 2500);
});

test('Windstorm of Etaqua switches the opponent\'s positions', async () => {
  const t = setup({ s: ['Windstorm of Etaqua'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Windstorm of Etaqua'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'def');
});

test('The Regulation of Tribe: the declared Type cannot attack', async () => {
  const t = setup({ s: ['The Regulation of Tribe'] }, { m: ['Blue-Eyes White Dragon', 'Battle Ox'] });
  t.answer(0, chooseOption('Dragon'));
  await t.act(t.find(0, 'The Regulation of Tribe'));
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
  assert.ok(t.d.canAttack(t.find(1, 'Battle Ox')));
});

test('Horn of the Unicorn returns to the top of the Deck', async () => {
  const t = setup({ hand: ['Horn of the Unicorn'], m: ['Battle Ox'] });
  await t.act(t.find(0, 'Horn of the Unicorn'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 2400);
  await t.d.destroy(t.find(0, 'Battle Ox'), 'effect');
  await t.d.cleanup(); await t.d.settle();
  assert.equal(t.P0.deck[t.P0.deck.length - 1].def.name, 'Horn of the Unicorn');
});

test('Lightning Blade: Warrior +800, WATER monsters -500', async () => {
  const t = setup({ hand: ['Lightning Blade'], m: ['Celtic Guardian'] }, { m: ['Mystic Lamp', 'Ooguchi'] });
  await t.act(t.find(0, 'Lightning Blade'));
  assert.equal(t.d.atk(t.find(0, 'Celtic Guardian')), 2200);
  assert.equal(t.d.atk(t.find(1, 'Ooguchi')), 0);
});

test('Weather Report destroys Swords of Revealing Light and grants a second Battle Phase', async () => {
  const t = setup({ m: [fd('Weather Report')] }, { s: [{ name: 'Swords of Revealing Light', faceUp: true }] });
  await flipUp(t.d, t.find(0, 'Weather Report'));
  assert.equal(t.find(1, 'Swords of Revealing Light').zone, 'gy');
  assert.equal(t.d.flags['extraBP:0'], 1);
});

test('Ekibyo Drakmord destroys the monster after 2 of its controller\'s turns and returns to hand', async () => {
  const t = setup({ hand: ['Ekibyo Drakmord'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Ekibyo Drakmord'));
  await endTurn(t.d, 1);
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'mzone');
  await endTurn(t.d, 1);
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Ekibyo Drakmord'));
});

test("Robbin' Goblin: random discard when your monster deals damage", async () => {
  const t = setup({ s: [{ name: "Robbin' Goblin", faceUp: true }], m: ['Battle Ox'] }, { hand: ['Raigeki'] });
  await attack(t.d, t.find(0, 'Battle Ox'), null);
  assert.equal(t.P1.hand.length, 0);
});

test('Royal Command negates Flip effects', async () => {
  const t = setup({ s: [{ name: 'Royal Command', faceUp: true }] }, { m: [fd('Man-Eater Bug')] , });
  await t.d.changePos(t.find(1, 'Man-Eater Bug'), 'reveal');
  await t.d.settle();
  assert.equal(t.d.pending.length, 0);
});

test('Destruction Punch destroys the attacker after damage', async () => {
  const t = setup({ s: ['Destruction Punch'], m: [{ name: 'Mystical Elf', pos: 'def' }] }, { m: ['Battle Ox'] });
  t.answer(0, respondWith('Destruction Punch'));
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'Mystical Elf'));
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
  assert.equal(t.P1.lp, 8000 - 300, 'damage calculated normally');
});

test('The Immortal of Thunder: +3000 on flip, -5000 when it leaves', async () => {
  const t = setup({ m: [fd('The Immortal of Thunder')] });
  await flipUp(t.d, t.find(0, 'The Immortal of Thunder'));
  assert.equal(t.P0.lp, 11000);
  await t.d.destroy(t.find(0, 'The Immortal of Thunder'), 'effect'); await t.d.settle();
  assert.equal(t.P0.lp, 6000);
});

test('Mechanical Spider destroys DARK monsters it attacks', async () => {
  const t = setup({ m: ['Mechanical Spider'] }, { m: [{ name: 'Dark Magician', pos: 'def' }] });
  await attack(t.d, t.find(0, 'Mechanical Spider'), t.find(1, 'Dark Magician'));
  assert.equal(t.find(1, 'Dark Magician').zone, 'gy');
});

test('Karate Man doubles its original ATK and is destroyed at the End Phase', async () => {
  const t = setup({ m: ['Karate Man'] });
  await t.act(t.find(0, 'Karate Man'));
  assert.equal(t.d.atk(t.find(0, 'Karate Man')), 2000);
  await endTurn(t.d, 0);
  assert.equal(t.find(0, 'Karate Man').zone, 'gy');
});

test('Gamble: call right and draw to 5', async () => {
  const t = setup({ s: ['Gamble'], hand: ['Battle Ox'] }, { hand: Array(6).fill('Battle Ox') }, () => 0.2);
  await t.act(t.find(0, 'Gamble'));
  assert.equal(t.P0.hand.length, 5);
});

test('Metal Detector negates Continuous Traps for the turn', async () => {
  const t = setup({ s: ['Gravity Bind'], m: [] }, { s: ['Metal Detector'] });
  t.answer(1, respondWith('Metal Detector'));
  await t.act(t.find(0, 'Gravity Bind'));
  assert.ok(t.d.negated(t.find(0, 'Gravity Bind')));
});

test('Mirror Wall halves an attacking monster\'s ATK', async () => {
  const t = setup({ s: [{ name: 'Mirror Wall', faceUp: true }], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  const bewd = t.find(1, 'Blue-Eyes White Dragon');
  await attack(t.d, bewd, t.find(0, 'Battle Ox'));
  assert.equal(bewd.zone, 'gy', '1500 < 1700');
});

test('Gryphon Wing turns Harpie\'s Feather Duster back', async () => {
  const t = setup({ hand: ["Harpie's Feather Duster"], s: ['Trap Hole'] }, { s: ['Gryphon Wing', 'Mirror Force'] });
  t.answer(1, respondWith('Gryphon Wing'));
  await t.act(t.find(0, "Harpie's Feather Duster"));
  assert.equal(t.find(1, 'Mirror Force').zone, 'szone');
  assert.equal(t.find(0, 'Trap Hole').zone, 'gy');
});

test('Soul Exchange lets you Tribute an opponent\'s monster and skips your Battle Phase', async () => {
  const t = setup({ hand: ['Soul Exchange', 'Summoned Skull'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Soul Exchange'));
  const sum = t.d.mainActions(0, false).find((a) => a.a === 'summon' && a.card.def.name === 'Summoned Skull');
  assert.ok(sum);
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'phase' && a.to === 'BP'));
  await (t.d as any).perform(sum);
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
});

test('Dark Magic Curtain: half LP for Dark Magician from the Deck', async () => {
  const t = setup({ hand: ['Dark Magic Curtain'], deck: ['Dark Magician'] });
  await t.act(t.find(0, 'Dark Magic Curtain'));
  assert.equal(t.P0.lp, 4000);
  assert.equal(t.find(0, 'Dark Magician').zone, 'mzone');
  assert.ok(t.d.hasTemp('noSummon', 0));
});

test('Dreamsprite redirects an attack to another of your monsters', async () => {
  const t = setup({ m: ['Dreamsprite', { name: 'Mystical Elf', pos: 'def' }] }, { m: ['Battle Ox'] });
  t.answer(0, pickNamed('Mystical Elf'));
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'Dreamsprite'));
  assert.equal(t.find(0, 'Dreamsprite').zone, 'mzone');
  assert.equal(t.P1.lp, 8000 - 300);
});

test('Scroll of Bewitchment changes the Attribute', async () => {
  const t = setup({ hand: ['Scroll of Bewitchment', 'Raigeki'], m: ['Battle Ox'] });
  t.answer(0, chooseOption('LIGHT'));
  await t.act(t.find(0, 'Scroll of Bewitchment'));
  assert.equal(t.d.attrOf(t.find(0, 'Battle Ox')), 'LIGHT');
});

test('Goblin Attack Force switches to Defense after attacking', async () => {
  const t = setup({ m: ['Goblin Attack Force'] });
  await attack(t.d, t.find(0, 'Goblin Attack Force'), null);
  await (t.d as any).runTasks('BPend');
  assert.equal(t.find(0, 'Goblin Attack Force').pos, 'def');
});

test('Germ Infection: -300 ATK each Standby Phase', async () => {
  const t = setup({ hand: ['Germ Infection'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Germ Infection'));
  await standby(t.d, 1); await standby(t.d, 1);
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 2400);
});

test('Final Destiny: discard 5 to destroy every other card on the field', async () => {
  const t = setup({ hand: ['Final Destiny', 'Battle Ox', 'Battle Ox', 'Battle Ox', 'Battle Ox', 'Battle Ox'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon'], s: ['Trap Hole'] });
  await t.act(t.find(0, 'Final Destiny'));
  assert.equal(t.d.fieldCards(0).length + t.d.fieldCards(1).length, 0);
});

test('Mesmeric Control: the opponent cannot change positions next turn', async () => {
  const t = setup({ hand: ['Mesmeric Control'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Mesmeric Control'));
  t.d.turn++; t.d.tp = 1;
  assert.ok(!t.d.mainActions(1, false).some((a) => a.a === 'pos'));
});

test('Electromagnetic Bagworm takes a Machine', async () => {
  const t = setup({ m: [fd('Electromagnetic Bagworm')] }, { m: ['Cannon Soldier'] });
  await flipUp(t.d, t.find(0, 'Electromagnetic Bagworm'));
  assert.equal(t.find(1, 'Cannon Soldier').ctrl, 0);
});

test('Valkyrion: Tribute the three Magnet Warriors from the hand', async () => {
  const t = setup({ hand: ['Valkyrion the Magna Warrior', 'Alpha The Magnet Warrior', 'Beta The Magnet Warrior', 'Gamma The Magnet Warrior'] });
  await (t.d as any).perform(t.d.mainActions(0, false).find((a) => a.a === 'ss'));
  assert.equal(t.find(0, 'Valkyrion the Magna Warrior').zone, 'mzone');
  assert.equal(t.P0.gy.length, 3);
});

test('Offerings to the Doomed destroys a monster and skips your next Draw Phase', async () => {
  const t = setup({ hand: ['Offerings to the Doomed'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Offerings to the Doomed'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
  assert.equal(t.d.flags['skipDraw:0'], 1);
});

test('The Forgiving Maiden returns a monster destroyed in battle this turn', async () => {
  const t = setup({ m: ['The Forgiving Maiden', 'Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Battle Ox'));
  t.d.tp = 0; t.d.phase = 'M2';
  await t.act(t.find(0, 'The Forgiving Maiden'));
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Battle Ox'));
});

test('The Wicked Worm Beast returns to the hand at your End Phase', async () => {
  const t = setup({ m: ['The Wicked Worm Beast'] });
  await endTurn(t.d, 0);
  assert.ok(t.P0.hand.some((c) => c.def.name === 'The Wicked Worm Beast'));
});

test('Giant Germ: 500 damage and more copies from the Deck', async () => {
  const t = setup({ m: ['Giant Germ'], deck: ['Giant Germ', 'Giant Germ'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, (p) => (p.t === 'select' ? p.cards : undefined));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Giant Germ'));
  assert.equal(t.P1.lp, 7500);
  assert.equal(t.d.monsters(0).length, 2);
});

test('Shadow Ghoul: +100 per monster in your Graveyard', () => {
  const t = setup({ m: ['Shadow Ghoul'], gy: ['Battle Ox', 'Feral Imp', 'Pot of Greed'] });
  assert.equal(t.d.atk(t.find(0, 'Shadow Ghoul')), 1800);
});

test('Ring of Magnetism forces attacks onto the equipped monster', async () => {
  const t = setup({ hand: ['Ring of Magnetism'], m: ['Battle Ox', 'Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, pickNamed('Feral Imp'));
  await t.act(t.find(0, 'Ring of Magnetism'));
  t.d.tp = 1; t.d.phase = 'BP';
  assert.deepEqual(names(t.d.attackTargets(t.find(1, 'Blue-Eyes White Dragon')) as Card[]), ['Feral Imp']);
});

test('The Eye of Truth reveals the opponent\'s hand', () => {
  const t = setup({ s: [{ name: 'The Eye of Truth', faceUp: true }] }, { hand: ['Raigeki'] });
  assert.ok(t.d.handRevealed(1));
  assert.ok(!t.d.handRevealed(0));
});

test('Jam Breeding Machine: a Slime Token each Standby Phase, no other summons', async () => {
  const t = setup({ s: [{ name: 'Jam Breeding Machine', faceUp: true }], hand: ['Battle Ox'] });
  await standby(t.d, 0);
  assert.ok(t.d.monsters(0).some((c) => c.def.name === 'Slime Token'));
  t.d.phase = 'M1';
  assert.ok(!t.d.mainActions(0, false).some((a) => a.a === 'summon'));
});

test('Card of Safe Return draws when a monster is revived from your Graveyard', async () => {
  const t = setup({ s: [{ name: 'Card of Safe Return', faceUp: true }], hand: ['Monster Reborn'], gy: ['Battle Ox'] });
  await t.act(t.find(0, 'Monster Reborn'));
  assert.equal(t.P0.hand.length, 1);
});

test('Kiseitai equips the attacker and heals half its ATK each opponent Standby', async () => {
  const t = setup({ m: [fd('Kiseitai')] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Kiseitai'));
  await standby(t.d, 1);
  assert.equal(t.P0.lp, 9500);
});

test("Sebek's Blessing heals the direct battle damage dealt", async () => {
  const t = setup({ hand: ["Sebek's Blessing"], m: ['Battle Ox'] });
  t.answer(0, respondWith("Sebek's Blessing"));
  await attack(t.d, t.find(0, 'Battle Ox'), null);
  assert.equal(t.P0.lp, 9700);
});

test('Type Zero Magic Crusher: 500 per Spell you discard', async () => {
  const t = setup({ s: [{ name: 'Type Zero Magic Crusher', faceUp: true }], hand: ['Pot of Greed', 'Raigeki'] });
  await t.d.discard(0, [...t.P0.hand], null); await t.d.settle();
  assert.equal(t.P1.lp, 7000);
});

test('Insect Soldiers of the Sky gain 1000 attacking WIND', async () => {
  const t = setup({ m: ['Insect Soldiers of the Sky'] }, { m: ['Harpie Lady'] });
  await attack(t.d, t.find(0, 'Insect Soldiers of the Sky'), t.find(1, 'Harpie Lady'));
  assert.equal(t.find(1, 'Harpie Lady').zone, 'gy');
});

test("Solomon's Lawbook skips your next Standby Phase", async () => {
  const t = setup({ s: ["Solomon's Lawbook"] });
  await t.act(t.find(0, "Solomon's Lawbook"));
  assert.equal(t.d.flags['skipSP:0'], 1);
});

test('Big Eye rearranges the top 5 cards', async () => {
  const t = setup({ m: [fd('Big Eye')], deck: ['Pot of Greed', 'Raigeki', 'Battle Ox'] });
  t.answer(0, pickNamed('Battle Ox'));
  await flipUp(t.d, t.find(0, 'Big Eye'));
  assert.equal(t.P0.deck[t.P0.deck.length - 1].def.name, 'Battle Ox');
});

test('Bazoo banishes up to 3 for +300 each', async () => {
  const t = setup({ m: ['Bazoo the Soul-Eater'], gy: ['Battle Ox', 'Feral Imp'] });
  t.answer(0, pickNamed('Battle Ox', 'Feral Imp'));
  await t.act(t.find(0, 'Bazoo the Soul-Eater'));
  assert.equal(t.d.atk(t.find(0, 'Bazoo the Soul-Eater')), 2200);
});

test('Chain Destruction destroys copies in hand and Deck', async () => {
  const t = setup({ s: ['Chain Destruction'] }, { hand: ['Battle Ox', 'Battle Ox'], deck: ['Battle Ox'] });
  t.answer(0, respondWith('Chain Destruction'));
  t.d.tp = 1;
  await (t.d as any).perform(t.d.mainActions(1, false).find((a) => a.a === 'summon'));
  await t.d.settle();
  assert.equal(t.P1.gy.filter((c) => c.def.name === 'Battle Ox').length, 2);
});

test('Earthshaker: opponent picks one of two Attributes to destroy', async () => {
  const t = setup({ s: ['Earthshaker'] }, { m: ['Blue-Eyes White Dragon', 'Battle Ox'] });
  t.answer(0, chooseOption('LIGHT'), chooseOption('EARTH'));
  t.answer(1, chooseOption('LIGHT'));
  await t.act(t.find(0, 'Earthshaker'));
  assert.deepEqual(names(t.d.monsters(1)), ['Battle Ox']);
});

test('Ceasefire: flips everything and burns 500 per Effect Monster', async () => {
  const t = setup({ s: ['Ceasefire'], m: ['Sangan'] }, { m: [fd('Man-Eater Bug')] });
  await t.act(t.find(0, 'Ceasefire'));
  assert.ok(t.find(1, 'Man-Eater Bug').faceUp);
  assert.equal(t.P1.lp, 7000);
});

test('Electric Lizard: the attacker cannot attack next turn', async () => {
  const t = setup({ m: [{ name: 'Electric Lizard', pos: 'def' }] }, { m: ['Battle Ox'] });
  const ox = t.find(1, 'Battle Ox');
  await attack(t.d, ox, t.find(0, 'Electric Lizard'));
  t.d.turn += 2;
  assert.equal(t.d.canAttack(ox), false);
});

test('Goblin Fan destroys Flip Summoned Level 2 or lower monsters before their effect', async () => {
  const t = setup({ m: [fd('Man-Eater Bug')] }, { s: [{ name: 'Goblin Fan', faceUp: true }], m: ['Blue-Eyes White Dragon'] });
  await (t.d as any).perform({ a: 'flip', card: t.find(0, 'Man-Eater Bug') });
  await t.d.settle();
  assert.equal(t.find(0, 'Man-Eater Bug').zone, 'gy');
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'mzone');
});

test('Time Machine brings back a monster destroyed in battle', async () => {
  const t = setup({ s: ['Time Machine'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Time Machine'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Battle Ox'));
  assert.equal(t.find(0, 'Battle Ox').zone, 'mzone');
});

test('Dragon Capture Jar forces Dragons into Defense', async () => {
  const t = setup({ s: ['Dragon Capture Jar'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Dragon Capture Jar'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'def');
});

test("Alligator's Sword Dragon attacks directly past EARTH/WATER/FIRE monsters", () => {
  const t = setup({ m: ["Alligator's Sword Dragon"] }, { m: ['Battle Ox'] });
  t.d.phase = 'BP';
  assert.ok(t.d.attackTargets(t.find(0, "Alligator's Sword Dragon")).includes(null));
});

test('Tornado Wall: no damage while Umi is face-up', async () => {
  const t = setup({ s: [{ name: 'Tornado Wall', faceUp: true }], f: 'Umi' }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), null);
  assert.equal(t.P0.lp, 8000);
});

test('Lava Battleguard / Swamp Battleguard boost each other', () => {
  const t = setup({ m: ['Lava Battleguard', 'Swamp Battleguard'] });
  assert.equal(t.d.atk(t.find(0, 'Lava Battleguard')), 2050);
  assert.equal(t.d.atk(t.find(0, 'Swamp Battleguard')), 2300);
});

test("Harpie's Pet Dragon: +300 per Harpie Lady (Cyber Harpie counts)", () => {
  const t = setup({ m: ["Harpie's Pet Dragon", 'Harpie Lady', 'Cyber Harpie'] });
  assert.equal(t.d.atk(t.find(0, "Harpie's Pet Dragon")), 2600);
});

test('Elegant Egotist summons Harpie Lady Sisters properly', async () => {
  const t = setup({ hand: ['Elegant Egotist'], m: ['Harpie Lady'], deck: ['Harpie Lady Sisters'] });
  t.answer(0, pickNamed('Harpie Lady Sisters'));
  await t.act(t.find(0, 'Elegant Egotist'));
  assert.ok(t.find(0, 'Harpie Lady Sisters').properly);
});

test('Magical Labyrinth: Tribute Labyrinth Wall for Wall Shadow', async () => {
  const t = setup({ hand: ['Magical Labyrinth'], m: ['Labyrinth Wall'], deck: ['Wall Shadow'] });
  const lab = t.find(0, 'Magical Labyrinth');
  await t.act(lab);
  await t.act(lab);
  assert.equal(t.find(0, 'Wall Shadow').zone, 'mzone');
});

test('Metalmorph turns Zoa into Metalzoa', async () => {
  const t = setup({ s: ['Metalmorph'], m: ['Zoa'], deck: ['Metalzoa'] });
  const mm = t.find(0, 'Metalmorph');
  await t.act(mm);
  assert.equal(t.d.atk(t.find(0, 'Zoa')), 2900);
  await t.act(mm);
  assert.equal(t.find(0, 'Metalzoa').zone, 'mzone');
});

test('Limiter Removal doubles Machines and destroys them at the End Phase', async () => {
  const t = setup({ hand: ['Limiter Removal'], m: ['Cannon Soldier'] });
  await t.act(t.find(0, 'Limiter Removal'));
  assert.equal(t.d.atk(t.find(0, 'Cannon Soldier')), 2800);
  await endTurn(t.d, 0);
  assert.equal(t.find(0, 'Cannon Soldier').zone, 'gy');
});

test('De-Fusion splits a Fusion Monster back into its materials', async () => {
  const t = setup({ hand: ['De-Fusion'], m: ['Flame Swordsman'], gy: ['Flame Manipulator', 'Masaki the Legendary Swordsman'] });
  await t.act(t.find(0, 'De-Fusion'));
  assert.deepEqual(names(t.d.monsters(0)), ['Flame Manipulator', 'Masaki the Legendary Swordsman']);
});

test('Shadow Spell: -700 ATK, locked position, gone with the monster', async () => {
  const t = setup({ s: ['Shadow Spell'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Shadow Spell'));
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 2300);
  await t.d.destroy(t.find(1, 'Blue-Eyes White Dragon'), 'effect'); await t.d.cleanup();
  assert.equal(t.find(0, 'Shadow Spell').zone, 'gy');
});

test('Rocket Warrior takes no battle damage on your turn and weakens its target', async () => {
  const t = setup({ m: ['Rocket Warrior'] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(0, 'Rocket Warrior'), t.find(1, 'Blue-Eyes White Dragon'));
  assert.equal(t.P0.lp, 8000);
});

test('Dimensionhole banishes your monster until your next Standby Phase', async () => {
  const t = setup({ hand: ['Dimensionhole'], m: ['Battle Ox'] });
  await t.act(t.find(0, 'Dimensionhole'));
  assert.equal(t.find(0, 'Battle Ox').zone, 'banished');
  await standby(t.d, 1);
  await standby(t.d, 0);
  assert.equal(t.find(0, 'Battle Ox').zone, 'mzone');
});

test('Hourglass of Courage: halved for 3 turns, then doubled', async () => {
  const t = setup({ hand: ['Hourglass of Courage'] });
  await (t.d as any).perform(t.d.mainActions(0, false).find((a) => a.a === 'summon'));
  const h = t.find(0, 'Hourglass of Courage');
  assert.equal(t.d.atk(h), 550);
  t.d.turn += 3;
  assert.equal(t.d.atk(h), 2200);
});

test('Revival Jam returns at your next Standby Phase for 1000 LP', async () => {
  const t = setup({ m: ['Revival Jam'] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Revival Jam'));
  await standby(t.d, 0);
  assert.equal(t.find(0, 'Revival Jam').zone, 'mzone');
  assert.equal(t.P0.lp, 8000 - 1500 - 1000);
});

test('Mirror Wall halves the ATK only for that attack', async () => {
  const t = setup({ s: [{ name: 'Mirror Wall', faceUp: true }] }, { m: ['Blue-Eyes White Dragon'] });
  const bewd = t.find(1, 'Blue-Eyes White Dragon');
  await attack(t.d, bewd, null);
  assert.equal(t.P0.lp, 8000 - 1500);
  assert.equal(t.d.atk(bewd), 3000, 'back to full ATK after the attack');
});

test('Fairy Box sets the ATK to 0 for the Battle Phase only', async () => {
  const t = setup({ s: [{ name: 'Fairy Box', faceUp: true }] }, { m: ['Blue-Eyes White Dragon'] }, () => 0.2);
  const bewd = t.find(1, 'Blue-Eyes White Dragon');
  await attack(t.d, bewd, null);
  assert.equal(t.P0.lp, 8000);
  await (t.d as any).battlePhase().catch(() => {});
  t.d.phase = 'M2';
  assert.equal(t.d.atk(bewd), 3000);
});

test('Solemn Judgment can negate a Fusion Summon', async () => {
  const t = setup({ hand: ['Polymerization', 'Flame Manipulator', 'Masaki the Legendary Swordsman'], extra: ['Flame Swordsman'] }, { s: ['Solemn Judgment'] });
  t.answer(1, (p) => (p.t === 'chain' && p.ev.e === 'summoning' ? p.actions[0] : undefined));
  await t.act(t.find(0, 'Polymerization'));
  assert.equal(t.find(0, 'Polymerization').zone, 'gy');
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'gy', 'the Fusion Summon was negated');
  assert.equal(t.P1.lp, 4000);
});
