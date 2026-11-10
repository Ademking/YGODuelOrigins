// Third batch of per-card assertions: the remaining scripted and situational cards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { type Card, type Duel } from '../../src/engine/duel';
import { setup, pickNamed, respondWith, chooseOption, sayNo } from '../helpers';

const names = (cs: Card[]) => cs.map((c) => c.def.name).sort();
async function attack(d: Duel, att: Card, tgt: Card | null) { d.tp = att.ctrl; d.phase = 'BP'; await (d as any).attack(att, tgt); await d.settle(); }
const standby = async (d: Duel, tp: 0 | 1) => { d.turn++; d.tp = tp; d.phase = 'SP'; await (d as any).standby(); };
const endTurn = async (d: Duel, tp: 0 | 1) => { d.tp = tp; d.phase = 'EP'; await (d as any).endPhase(); };
const flipUp = async (d: Duel, c: Card) => { await d.changePos(c, 'reveal'); await d.settle(); };
const fd = (name: string) => ({ name, pos: 'def' as const, faceUp: false });
const summon = async (d: Duel, p: 0 | 1, name: string, kind: 'summon' | 'mset' | 'ss' = 'summon') => {
  d.tp = p;
  const a = d.mainActions(p, false).find((x) => x.a === kind && x.card.def.name === name);
  assert.ok(a, `${kind} ${name}`);
  await (d as any).perform(a);
  await d.settle();
};
const revealed = (t: ReturnType<typeof setup>, s: 0 | 1) => t.ctl[s].seen.some((p) => p.t === 'select' && p.reveal);

// ---------------------------------------------------------------- monsters
test('The Little Swordsman of Aile: Tribute a monster for +700 ATK', async () => {
  const t = setup({ m: ['The Little Swordsman of Aile', 'Battle Ox'] });
  await t.act(t.find(0, 'The Little Swordsman of Aile'));
  assert.equal(t.d.atk(t.find(0, 'The Little Swordsman of Aile')), 1500);
  assert.equal(t.find(0, 'Battle Ox').zone, 'gy');
});

test('Bite Shoes changes a face-up monster\'s position', async () => {
  const t = setup({ m: [fd('Bite Shoes')] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, pickNamed('Blue-Eyes White Dragon'));
  await flipUp(t.d, t.find(0, 'Bite Shoes'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'def');
});

test('Tainted Wisdom shuffles the Deck when switched to Defense', async () => {
  const t = setup({ m: ['Tainted Wisdom'] });
  let shuffled = 0;
  t.d.onEvent = (e) => { if (e.t === 'shuffle') shuffled++; };
  await t.d.changePos(t.find(0, 'Tainted Wisdom'), 'def'); await t.d.settle();
  assert.equal(shuffled, 1);
});

test('Amazon Archer: Tribute 2 for 1200 damage', async () => {
  const t = setup({ m: ['Amazon Archer', 'Battle Ox', 'Feral Imp'] });
  t.answer(0, pickNamed('Battle Ox', 'Feral Imp'));
  await t.act(t.find(0, 'Amazon Archer'));
  assert.equal(t.P1.lp, 6800);
});

test('Swordsman from a Foreign Land dooms what it attacks five turns later', async () => {
  const t = setup({ m: ['Swordsman from a Foreign Land'] }, { m: [{ name: 'Mystical Elf', pos: 'def' }] });
  await attack(t.d, t.find(0, 'Swordsman from a Foreign Land'), t.find(1, 'Mystical Elf'));
  t.d.turn += 5;
  await endTurn(t.d, 0);
  assert.equal(t.find(1, 'Mystical Elf').zone, 'gy');
});

test('Electric Snake draws 2 when discarded by the opponent', async () => {
  const t = setup({}, { hand: ['Electric Snake'] });
  await t.d.discard(1, [t.find(1, 'Electric Snake')], 0); await t.d.settle();
  assert.equal(t.P1.hand.length, 2);
});

test('Garuda the Wind Spirit: summoned by banishing a WIND monster; switches a position at the opponent\'s End Phase', async () => {
  const t = setup({ hand: ['Garuda the Wind Spirit'], gy: ['Harpie Lady'] }, { m: ['Blue-Eyes White Dragon'] });
  await summon(t.d, 0, 'Garuda the Wind Spirit', 'ss');
  await endTurn(t.d, 1);
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'def');
});

test('Masked Sorcerer and The Bistro Butcher trigger on battle damage', async () => {
  const t = setup({ m: ['Masked Sorcerer', 'The Bistro Butcher'] });
  await attack(t.d, t.find(0, 'Masked Sorcerer'), null);
  await attack(t.d, t.find(0, 'The Bistro Butcher'), null);
  assert.equal(t.P0.hand.length, 1);
  assert.equal(t.P1.hand.length, 2);
});

test('Goddess of Whim doubles (right call) or halves (wrong call)', async () => {
  const t = setup({ m: ['Goddess of Whim'] }, {}, () => 0.2);
  await t.act(t.find(0, 'Goddess of Whim'));
  assert.equal(t.d.atk(t.find(0, 'Goddess of Whim')), 1900);
  const u = setup({ m: ['Goddess of Whim'] }, {}, () => 0.8);
  await u.act(u.find(0, 'Goddess of Whim'));
  assert.equal(u.d.atk(u.find(0, 'Goddess of Whim')), 475);
});

test('Griggle: its owner gains 3000 when control shifts', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { m: ['Griggle'] });
  await t.act(t.find(0, 'Change of Heart'));
  assert.equal(t.P1.lp, 11000);
});

test('Crimson Sentry returns a battle-destroyed monster to the bottom; Lady Panther to the top', async () => {
  for (const [name, top] of [['Crimson Sentry', false], ['Lady Panther', true]] as const) {
    const t = setup({ m: [name, 'Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
    await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Battle Ox'));
    t.d.tp = 0; t.d.phase = 'M2';
    await t.act(t.find(0, name));
    assert.equal((top ? t.P0.deck[t.P0.deck.length - 1] : t.P0.deck[0]).def.name, 'Battle Ox', name);
  }
});

test('Gale Dogra: pay 3000 to send a Fusion Monster to the Graveyard', async () => {
  const t = setup({ m: ['Gale Dogra'], extra: ['Flame Swordsman'] });
  await t.act(t.find(0, 'Gale Dogra'));
  assert.equal(t.P0.lp, 5000);
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'gy');
});

test('The Stern Mystic reveals all face-down cards', async () => {
  const t = setup({ m: [fd('The Stern Mystic')] }, { s: ['Mirror Force'] });
  await flipUp(t.d, t.find(0, 'The Stern Mystic'));
  assert.ok(revealed(t, 0));
  assert.equal(t.find(1, 'Mirror Force').faceUp, false);
});

test('Summoner of Illusions: Tribute for a Fusion Monster that dies at the End Phase', async () => {
  const t = setup({ m: [fd('Summoner of Illusions'), 'Battle Ox'], extra: ['Flame Swordsman'] });
  await flipUp(t.d, t.find(0, 'Summoner of Illusions'));
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'mzone');
  await endTurn(t.d, 0);
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'gy');
});

test('Pumpking grows with Castle of Dark Illusions; Castle boosts Zombies', async () => {
  const t = setup({ m: [fd('Castle of Dark Illusions'), 'Pumpking the King of Ghosts'] });
  await flipUp(t.d, t.find(0, 'Castle of Dark Illusions'));
  const pk = t.find(0, 'Pumpking the King of Ghosts');
  assert.equal(t.d.atk(pk), 1800 + 100 + 200);
  await standby(t.d, 0);
  assert.equal(t.d.atk(pk), 1800 + 200 + 400);
});

test('Dark Sage arrives when Time Wizard calls right with Dark Magician out', async () => {
  const t = setup({ m: ['Time Wizard', 'Dark Magician'], deck: ['Dark Sage', 'Pot of Greed'] }, { m: ['Battle Ox'] }, () => 0.2);
  await t.act(t.find(0, 'Time Wizard'));
  assert.equal(t.find(0, 'Dark Sage').zone, 'mzone');
  assert.ok(t.P0.hand.some((c) => c.def.kind === 'spell'));
});

test('4-Starred Ladybug of Doom destroys face-up Level 4 monsters only', async () => {
  const t = setup({ m: [fd('4-Starred Ladybug of Doom')] }, { m: ['Battle Ox', 'Blue-Eyes White Dragon'] });
  await flipUp(t.d, t.find(0, '4-Starred Ladybug of Doom'));
  assert.deepEqual(names(t.d.monsters(1)), ['Blue-Eyes White Dragon']);
});

test('Skelengel draws on flip; Needle Worm mills 5', async () => {
  const t = setup({ m: [fd('Skelengel'), fd('Needle Worm')] });
  await flipUp(t.d, t.find(0, 'Skelengel'));
  await flipUp(t.d, t.find(0, 'Needle Worm'));
  assert.equal(t.P0.hand.length, 1);
  assert.equal(t.P1.gy.length, 5);
});

test('Nimble Momonga: +1000 LP and face-down copies from the Deck', async () => {
  const t = setup({ m: ['Nimble Momonga'], deck: ['Nimble Momonga'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, (p) => (p.t === 'select' ? p.cards : undefined));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Nimble Momonga'));
  assert.equal(t.P0.lp, 9000 - 2000);
  assert.equal(t.d.monsters(0)[0].faceUp, false);
});

test('Total Defense Shogun is summoned in Defense and attacks from it', async () => {
  const t = setup({ hand: ['Total Defense Shogun', 'Feral Imp'], m: ['Battle Ox'] });
  t.answer(0, pickNamed('Battle Ox'));
  await summon(t.d, 0, 'Total Defense Shogun');
  const s = t.find(0, 'Total Defense Shogun');
  assert.equal(s.pos, 'def');
  t.d.turn++;
  await attack(t.d, s, null);
  assert.equal(t.P1.lp, 8000 - 1550);
});

test('Ceremonial Bell and Respect Play reveal hands', () => {
  const t = setup({ m: ['Ceremonial Bell'] }, {});
  assert.ok(t.d.handRevealed(0) && t.d.handRevealed(1));
  const u = setup({ s: [{ name: 'Respect Play', faceUp: true }] }, {});
  assert.ok(u.d.handRevealed(0) && !u.d.handRevealed(1));
});

test('Drill Bug sets Parasite Paracide on top of the Deck', async () => {
  const t = setup({ m: ['Drill Bug'], deck: ['Parasite Paracide', 'Battle Ox'] });
  await attack(t.d, t.find(0, 'Drill Bug'), null);
  assert.equal(t.P0.deck[t.P0.deck.length - 1].def.name, 'Parasite Paracide');
});

test('Dark Artist loses half its DEF when attacked by LIGHT', async () => {
  const t = setup({ m: [{ name: 'Dark Artist', pos: 'def' }] }, { m: ['Mystical Elf'] });
  await attack(t.d, t.find(1, 'Mystical Elf'), t.find(0, 'Dark Artist'));
  assert.equal(t.find(0, 'Dark Artist').zone, 'gy', '800 ATK beats 700 DEF');
});

test('Dark-Eyes Illusionist: the chosen monster cannot attack', async () => {
  const t = setup({ m: [fd('Dark-Eyes Illusionist')] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, pickNamed('Blue-Eyes White Dragon'));
  await flipUp(t.d, t.find(0, 'Dark-Eyes Illusionist'));
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
});

test('Dark Zebra switches to Defense when it is your only card', async () => {
  const t = setup({ m: ['Dark Zebra'] });
  await standby(t.d, 0);
  assert.equal(t.find(0, 'Dark Zebra').pos, 'def');
});

test('Spear Cretin: after being flipped, both players revive a monster', async () => {
  const t = setup({ m: [fd('Spear Cretin')], gy: ['Battle Ox'] }, { gy: ['Feral Imp'] });
  await flipUp(t.d, t.find(0, 'Spear Cretin'));
  await t.d.destroy(t.find(0, 'Spear Cretin'), 'effect'); await t.d.settle();
  assert.equal(t.d.monsters(0).length, 1);
  assert.equal(t.d.monsters(1).length, 1);
});

test('Jigen Bakudan: Tribute in the Standby Phase, half the destroyed ATK as damage', async () => {
  const t = setup({ m: [fd('Jigen Bakudan'), 'Battle Ox', 'Feral Imp'] });
  await flipUp(t.d, t.find(0, 'Jigen Bakudan'));
  await standby(t.d, 0);
  assert.equal(t.d.monsters(0).length, 0);
  assert.equal(t.P1.lp, 8000 - (1700 + 1300) / 2);
});

test('Dragon Piper / Dragon Seeker interact with Dragons', async () => {
  const t = setup({ m: [fd('Dragon Piper')], s: [{ name: 'Dragon Capture Jar', faceUp: true }] }, { m: [{ name: 'Blue-Eyes White Dragon', pos: 'def' }] });
  await flipUp(t.d, t.find(0, 'Dragon Piper'));
  assert.equal(t.find(0, 'Dragon Capture Jar').zone, 'gy');
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'atk');
  const u = setup({ hand: ['Dragon Seeker'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  u.answer(0, pickNamed('Battle Ox'));
  await summon(u.d, 0, 'Dragon Seeker');
  assert.equal(u.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
});

test('Bubonic Vermin calls another copy face-down', async () => {
  const t = setup({ m: [fd('Bubonic Vermin')], deck: ['Bubonic Vermin'] });
  await flipUp(t.d, t.d.monsters(0)[0]);
  assert.equal(t.d.monsters(0).length, 2);
});

test('Steel Scorpion dooms a non-Machine attacker 4 turns later', async () => {
  const t = setup({ m: [{ name: 'Steel Scorpion', pos: 'def' }] }, { m: ['Battle Ox'] });
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'Steel Scorpion'));
  t.d.turn += 4;
  await endTurn(t.d, 1);
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
});

test('Cyber-Stein: 5000 LP for a Fusion Monster', async () => {
  const t = setup({ m: ['Cyber-Stein'], extra: ['Flame Swordsman'] });
  await t.act(t.find(0, 'Cyber-Stein'));
  assert.equal(t.P0.lp, 3000);
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'mzone');
});

test('Mysterious Puppeteer: +500 per Normal or Flip Summon', async () => {
  const t = setup({ m: ['Mysterious Puppeteer'], hand: ['Battle Ox'] });
  await summon(t.d, 0, 'Battle Ox');
  assert.equal(t.P0.lp, 8500);
});

test('Needle Ball: pay 2000 for 1000 damage', async () => {
  const t = setup({ m: [fd('Needle Ball')] });
  await flipUp(t.d, t.find(0, 'Needle Ball'));
  assert.deepEqual([t.P0.lp, t.P1.lp], [6000, 7000]);
});

test('Slate Warrior: +500 on flip; its destroyer loses 500', async () => {
  const t = setup({ m: [fd('Slate Warrior')] }, { m: ['Blue-Eyes White Dragon'] });
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Slate Warrior'));
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 2500);
});

test('Bombardment Beetle destroys a face-down Effect Monster', async () => {
  const t = setup({ m: [fd('Bombardment Beetle')] }, { m: [fd('Man-Eater Bug')] });
  await flipUp(t.d, t.find(0, 'Bombardment Beetle'));
  assert.equal(t.find(1, 'Man-Eater Bug').zone, 'gy');
});

test('The Unhappy Maiden ends the Battle Phase when destroyed in battle', async () => {
  const t = setup({ m: ['The Unhappy Maiden'] }, { m: ['Battle Ox'] });
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'The Unhappy Maiden'));
  assert.ok(t.d.battleEnded);
});

test('Patrol Robo looks at a Set card', async () => {
  const t = setup({ m: ['Patrol Robo'] }, { s: ['Mirror Force'] });
  t.answer(0, pickNamed('Mirror Force'));
  await standby(t.d, 0);
  assert.ok(revealed(t, 0));
});

test('Berfomet searches Gazelle; Chimera revives one of its parts', async () => {
  const t = setup({ hand: ['Berfomet'], m: ['Battle Ox'], deck: ['Gazelle the King of Mythical Beasts'] });
  t.answer(0, pickNamed('Battle Ox'));
  await summon(t.d, 0, 'Berfomet');
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Gazelle the King of Mythical Beasts'));
  const u = setup({ m: ['Chimera the Flying Mythical Beast'], gy: ['Berfomet'] });
  u.answer(0, pickNamed('Berfomet'));
  await u.d.destroy(u.find(0, 'Chimera the Flying Mythical Beast'), 'effect'); await u.d.settle();
  assert.equal(u.find(0, 'Berfomet').zone, 'mzone');
});

test('Hayabusa Knight attacks twice', async () => {
  const t = setup({ m: ['Hayabusa Knight'] });
  const h = t.find(0, 'Hayabusa Knight');
  await attack(t.d, h, null);
  assert.ok(t.d.canAttack(h));
  await attack(t.d, h, null);
  assert.equal(t.P1.lp, 6000);
});

test('Hysteric Fairy: Tribute 2 for 1000 LP', async () => {
  const t = setup({ m: ['Hysteric Fairy', 'Battle Ox', 'Feral Imp'] });
  t.answer(0, pickNamed('Battle Ox', 'Feral Imp'));
  await t.act(t.find(0, 'Hysteric Fairy'));
  assert.equal(t.P0.lp, 9000);
});

test('Flash Assailant / Muka Muka scale with the hand', () => {
  const t = setup({ m: ['Flash Assailant', 'Muka Muka'], hand: ['Battle Ox', 'Battle Ox'] });
  assert.equal(t.d.atk(t.find(0, 'Flash Assailant')), 1200);
  assert.equal(t.d.atk(t.find(0, 'Muka Muka')), 1200);
});

test('Fire Sorcerer: banish 2 random cards from hand for 800', async () => {
  const t = setup({ m: [fd('Fire Sorcerer')], hand: ['Battle Ox', 'Feral Imp'] });
  await flipUp(t.d, t.find(0, 'Fire Sorcerer'));
  assert.equal(t.P0.banished.length, 2);
  assert.equal(t.P1.lp, 7200);
});

test('Red-Moon Baby steals what it destroyed at the end of the Battle Phase', async () => {
  const t = setup({ m: ['Red-Moon Baby'] }, { m: ['Petit Moth'] });
  await attack(t.d, t.find(0, 'Red-Moon Baby'), t.find(1, 'Petit Moth'));
  await (t.d as any).runTasks('BPend');
  assert.equal(t.find(1, 'Petit Moth').ctrl, 0);
});

test('Supply returns Fusion Materials', async () => {
  const t = setup({ hand: ['Polymerization', 'Flame Manipulator', 'Masaki the Legendary Swordsman'], extra: ['Flame Swordsman'], m: [fd('Supply')] });
  await t.act(t.find(0, 'Polymerization'));
  await flipUp(t.d, t.find(0, 'Supply'));
  assert.deepEqual(names(t.P0.hand), ['Flame Manipulator', 'Masaki the Legendary Swordsman']);
});

test('Boar Soldier is destroyed if Normal Summoned; Nuvia the Wicked too', async () => {
  for (const n of ['Boar Soldier', 'Nuvia the Wicked']) {
    const t = setup({ hand: [n] });
    await summon(t.d, 0, n);
    assert.equal(t.find(0, n).zone, 'gy', n);
  }
});

test('Soul of Purity and Light: banish 2 LIGHT; opponent -300 in their Battle Phase', async () => {
  const t = setup({ hand: ['Soul of Purity and Light'], gy: ['Mystical Elf', 'Mystical Elf'] }, { m: ['Battle Ox'] });
  await summon(t.d, 0, 'Soul of Purity and Light', 'ss');
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.atk(t.find(1, 'Battle Ox')), 1400);
});

test('Spirit of Flames: +300 in your Battle Phase', async () => {
  const t = setup({ hand: ['Spirit of Flames'], gy: ['Flame Manipulator'] });
  await summon(t.d, 0, 'Spirit of Flames', 'ss');
  t.d.phase = 'BP';
  assert.equal(t.d.atk(t.find(0, 'Spirit of Flames')), 2000);
});

test('Ancient Lamp redirects an attack on it while face-down', async () => {
  const t = setup({ m: [fd('Ancient Lamp')] }, { m: ['Battle Ox', 'Petit Moth'] });
  t.answer(0, pickNamed('Petit Moth'));
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'Ancient Lamp'));
  assert.equal(t.find(1, 'Petit Moth').zone, 'gy');
});

test('Mushroom Man #2 drains 300 per Standby Phase', async () => {
  const t = setup({ m: ['Mushroom Man #2'] });
  await standby(t.d, 0);
  assert.equal(t.P0.lp, 7700);
});

test('The Fiend Megacyber needs no Tribute when outnumbered by 2', () => {
  const t = setup({ hand: ['The Fiend Megacyber'] }, { m: ['Battle Ox', 'Feral Imp'] });
  const a = t.d.mainActions(0, false).find((x) => x.a === 'summon' && x.card.def.name === 'The Fiend Megacyber');
  assert.ok(a && a.a === 'summon' && a.tributes === 0);
});

test('Maha Vailo: +500 per Equip Card', async () => {
  const t = setup({ hand: ['Book of Secret Arts'], m: ['Maha Vailo'] });
  await t.act(t.find(0, 'Book of Secret Arts'));
  assert.equal(t.d.atk(t.find(0, 'Maha Vailo')), 1550 + 300 + 500);
});

test('Maryokutai negates a Spell on the opponent\'s turn', async () => {
  const t = setup({ hand: ['Pot of Greed'] }, { m: ['Maryokutai'] });
  t.answer(1, respondWith('Maryokutai'));
  await t.act(t.find(0, 'Pot of Greed'));
  assert.equal(t.P0.hand.length, 0);
});

test('Wodan, Copycat and Fairy King Truesdale', async () => {
  const t = setup({ m: ['Wodan the Resident of the Forest', 'Fairy King Truesdale'] });
  assert.equal(t.d.atk(t.find(0, 'Wodan the Resident of the Forest')), 1000);
  assert.equal(t.d.atk(t.find(0, 'Fairy King Truesdale')), 2700);
  const u = setup({ hand: ['Copycat'] }, { m: ['Blue-Eyes White Dragon'] });
  await summon(u.d, 0, 'Copycat');
  assert.equal(u.d.atk(u.find(0, 'Copycat')), 3000);
});

test('Monster Eye recovers Polymerization for 1000', async () => {
  const t = setup({ m: ['Monster Eye'], gy: ['Polymerization'] });
  await t.act(t.find(0, 'Monster Eye'));
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Polymerization'));
});

test('Yado Karu puts hand cards on the bottom of the Deck', async () => {
  const t = setup({ m: ['Yado Karu'], hand: ['Raigeki'] });
  t.answer(0, pickNamed('Raigeki'));
  await t.d.changePos(t.find(0, 'Yado Karu'), 'def'); await t.d.settle();
  assert.equal(t.P0.deck[0].def.name, 'Raigeki');
});

test('Mask of Darkness and Magician of Faith recover cards on flip', async () => {
  const t = setup({ m: [fd('Mask of Darkness'), fd('Magician of Faith')], gy: ['Mirror Force', 'Raigeki'] });
  await flipUp(t.d, t.find(0, 'Mask of Darkness'));
  await flipUp(t.d, t.find(0, 'Magician of Faith'));
  assert.deepEqual(names(t.P0.hand), ['Mirror Force', 'Raigeki']);
});

test('Rigras Leever: each player discards a card from the other\'s hand', async () => {
  const t = setup({ m: [fd('Rigras Leever')], hand: ['Battle Ox'] }, { hand: ['Raigeki'] });
  await flipUp(t.d, t.find(0, 'Rigras Leever'));
  assert.equal(t.P0.hand.length + t.P1.hand.length, 0);
});

test('Larvae Moth emerges after 2 Standby Phases; Perfectly Ultimate Great Moth after 6', async () => {
  const t = setup({ m: ['Petit Moth', 'Cocoon of Evolution'], deck: ['Larvae Moth', 'Perfectly Ultimate Great Moth'] });
  const cocoon = t.find(0, 'Cocoon of Evolution');
  await t.act(cocoon, 0);
  for (let i = 0; i < 6; i++) await standby(t.d, 0);
  t.d.phase = 'M1';
  t.answer(0, chooseOption('Perfectly Ultimate Great Moth'));
  await t.act(cocoon, 1);
  assert.equal(t.find(0, 'Perfectly Ultimate Great Moth').zone, 'mzone');
});

test('Red-Eyes Black Metal Dragon via Metalmorph on Red-Eyes B. Dragon', async () => {
  const t = setup({ s: ['Metalmorph'], m: ['Red-Eyes B. Dragon'], deck: ['Red-Eyes Black Metal Dragon'] });
  const mm = t.find(0, 'Metalmorph');
  await t.act(mm);
  await t.act(mm);
  assert.equal(t.find(0, 'Red-Eyes Black Metal Dragon').zone, 'mzone');
});

test('White Magical Hat: random discard on battle damage', async () => {
  const t = setup({ m: ['White Magical Hat'] }, { hand: ['Raigeki'] });
  await attack(t.d, t.find(0, 'White Magical Hat'), null);
  assert.equal(t.P1.hand.length, 0);
});

test('Aqua Spirit switches an opponent\'s position in their Standby Phase', async () => {
  const t = setup({ hand: ['Aqua Spirit'], gy: ['Mother Grizzly'] }, { m: ['Blue-Eyes White Dragon'] });
  await summon(t.d, 0, 'Aqua Spirit', 'ss');
  await standby(t.d, 1);
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'def');
});

test('Jirai Gumo halves your LP on a wrong call', async () => {
  const t = setup({ m: ['Jirai Gumo'] }, {}, () => 0.8);
  await attack(t.d, t.find(0, 'Jirai Gumo'), null);
  assert.equal(t.P0.lp, 4000);
});

// ---------------------------------------------------------------- spells
test('Share the Pain: both players Tribute a monster', async () => {
  const t = setup({ hand: ['Share the Pain'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Share the Pain'));
  assert.equal(t.d.monsters(0).length + t.d.monsters(1).length, 0);
});

test('Tailor of the Fickle moves an Equip Card', async () => {
  const t = setup({ hand: ['Tailor of the Fickle'], m: ['Battle Ox'], s: [] }, { m: ['Blue-Eyes White Dragon'] });
  const ox = t.find(0, 'Battle Ox');
  const axe = t.d.mkCard((await import('../helpers')).byName('Axe of Despair'), 0, 'hand');
  t.P0.hand.push(axe);
  await t.d.equipCard(axe, ox);
  t.answer(0, pickNamed('Axe of Despair'), pickNamed('Blue-Eyes White Dragon'));
  await t.act(t.find(0, 'Tailor of the Fickle'));
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 4000);
});

test('Chosen One: the opponent picks at random', async () => {
  const t = setup({ hand: ['Chosen One', 'Battle Ox', 'Raigeki', 'Pot of Greed'] }, {}, () => 0.1);
  await t.act(t.find(0, 'Chosen One'));
  assert.equal(t.find(0, 'Battle Ox').zone, 'mzone');
  assert.equal(t.P0.gy.length, 3);
});

test('Vengeful Bog Spirit: no attacks the turn a monster is summoned', async () => {
  const t = setup({ s: [{ name: 'Vengeful Bog Spirit', faceUp: true }], hand: ['Battle Ox'] });
  await summon(t.d, 0, 'Battle Ox');
  t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(0, 'Battle Ox')), false);
});

test('Seal of the Ancients, Ancient Telescope and The Inexperienced Spy reveal cards', async () => {
  const t = setup({ hand: ['Seal of the Ancients', 'Ancient Telescope', 'The Inexperienced Spy'] }, { s: ['Mirror Force'], hand: ['Raigeki'] });
  for (const n of ['Seal of the Ancients', 'Ancient Telescope', 'The Inexperienced Spy']) await t.act(t.find(0, n));
  assert.equal(t.ctl[0].seen.filter((p) => p.t === 'select' && p.reveal).length, 3);
  assert.equal(t.P0.lp, 7000);
});

test('The Forceful Sentry returns a hand card to the Deck', async () => {
  const t = setup({ hand: ['The Forceful Sentry'] }, { hand: ['Raigeki'] });
  await t.act(t.find(0, 'The Forceful Sentry'));
  assert.equal(t.P1.hand.length, 0);
  assert.equal(t.find(1, 'Raigeki').zone, 'deck');
});

test('Block Attack and Stop Defense change positions (Stop Defense triggers Flip effects)', async () => {
  const t = setup({ hand: ['Block Attack', 'Stop Defense'] }, { m: ['Blue-Eyes White Dragon', fd('Man-Eater Bug')] });
  await t.act(t.find(0, 'Block Attack'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').pos, 'def');
  t.answer(0, pickNamed('Man-Eater Bug'));
  await t.act(t.find(0, 'Stop Defense'));
  assert.equal(t.find(1, 'Man-Eater Bug').pos, 'atk');
  assert.equal(t.d.monsters(1).length, 1, 'Man-Eater Bug\'s flip effect destroyed a monster');
});

test('Thousand Knives needs Dark Magician', async () => {
  const t = setup({ hand: ['Thousand Knives'] }, { m: ['Battle Ox'] });
  assert.equal(t.canAct(t.find(0, 'Thousand Knives')), false);
  const u = setup({ hand: ['Thousand Knives'], m: ['Dark Magician'] }, { m: ['Battle Ox'] });
  await u.act(u.find(0, 'Thousand Knives'));
  assert.equal(u.find(1, 'Battle Ox').zone, 'gy');
});

test('Return of the Doomed returns a battle-destroyed monster at the End Phase', async () => {
  const t = setup({ hand: ['Return of the Doomed', 'Feral Imp'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Return of the Doomed'));
  await attack(t.d, t.find(0, 'Battle Ox'), t.find(1, 'Blue-Eyes White Dragon'));
  await endTurn(t.d, 0);
  assert.ok(t.P0.hand.some((c) => c.def.name === 'Battle Ox'));
});

test('Tribute to The Doomed: discard 1 to destroy a monster', async () => {
  const t = setup({ hand: ['Tribute to The Doomed', 'Battle Ox'] }, { m: [fd('Blue-Eyes White Dragon')] });
  await t.act(t.find(0, 'Tribute to The Doomed'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
});

test('Ground Collapse closes two Monster Card Zones', async () => {
  const t = setup({ hand: ['Ground Collapse'] }, {});
  await t.act(t.find(0, 'Ground Collapse'));
  assert.equal(t.d.freeCount(1, 'm'), 3);
});

test('Eternal Rest destroys equipped monsters', async () => {
  const t = setup({ hand: ['Legendary Sword', 'Eternal Rest'], m: ['Celtic Guardian', 'Battle Ox'] });
  await t.act(t.find(0, 'Legendary Sword'));
  await t.act(t.find(0, 'Eternal Rest'));
  assert.deepEqual(names(t.d.monsters(0)), ['Battle Ox']);
});

test('Soul Release banishes cards from Graveyards', async () => {
  const t = setup({ hand: ['Soul Release'] }, { gy: ['Monster Reborn', 'Battle Ox'] });
  t.answer(0, pickNamed('Monster Reborn', 'Battle Ox'));
  await t.act(t.find(0, 'Soul Release'));
  assert.equal(t.P1.banished.length, 2);
});

test('The Flute of Summoning Dragon summons 2 Dragons with Lord of D.', async () => {
  const t = setup({ hand: ['The Flute of Summoning Dragon', 'Blue-Eyes White Dragon', 'Red-Eyes B. Dragon'], m: ['Lord of D.'] });
  t.answer(0, pickNamed('Blue-Eyes White Dragon', 'Red-Eyes B. Dragon'));
  await t.act(t.find(0, 'The Flute of Summoning Dragon'));
  assert.equal(t.d.monsters(0).length, 3);
});

test('Gravedigger Ghoul banishes 2 monsters from the opponent\'s Graveyard', async () => {
  const t = setup({ hand: ['Gravedigger Ghoul'] }, { gy: ['Battle Ox', 'Feral Imp'] });
  t.answer(0, pickNamed('Battle Ox', 'Feral Imp'));
  await t.act(t.find(0, 'Gravedigger Ghoul'));
  assert.equal(t.P1.banished.length, 2);
});

test('Gravekeeper\'s Servant: each attack mills 1', async () => {
  const t = setup({ s: [{ name: "Gravekeeper's Servant", faceUp: true }] }, { m: ['Battle Ox'] });
  await attack(t.d, t.find(1, 'Battle Ox'), null);
  assert.equal(t.P1.gy.length, 1);
});

test('Riryoku moves half the ATK of one monster to another', async () => {
  const t = setup({ hand: ['Riryoku'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, pickNamed('Blue-Eyes White Dragon'), pickNamed('Battle Ox'));
  await t.act(t.find(0, 'Riryoku'));
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 1500);
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 3200);
});

test('Insect Imitation: Tribute for an Insect one Level higher', async () => {
  const t = setup({ hand: ['Insect Imitation'], m: ['Petit Moth'], deck: ['Basic Insect'] });
  await t.act(t.find(0, 'Insect Imitation'));
  assert.equal(t.find(0, 'Basic Insect').zone, 'mzone');
});

test('Fusion Gate: Fusion Summon without Polymerization, banishing the materials', async () => {
  const t = setup({ f: 'Fusion Gate', hand: ['Flame Manipulator', 'Masaki the Legendary Swordsman'], extra: ['Flame Swordsman'] });
  const events: { card: string; materials: string[]; zones: string[] }[] = [];
  t.d.onEvent = (event) => {
    if (event.t === 'fusion') events.push({ card: event.card.def.name, materials: event.materials.map((card) => card.def.name), zones: event.materials.map((card) => card.zone) });
  };
  await t.act(t.find(0, 'Fusion Gate'));
  assert.equal(t.find(0, 'Flame Swordsman').zone, 'mzone');
  assert.equal(t.P0.banished.length, 2);
  assert.deepEqual(events, [{ card: 'Flame Swordsman', materials: ['Flame Manipulator', 'Masaki the Legendary Swordsman'], zones: ['banished', 'banished'] }]);
});

test('De-Spell, Armed Ninja, Trap Master and Reaper of the Cards probe Set cards', async () => {
  const t = setup({ hand: ['De-Spell'] }, { s: ['Raigeki'] });
  await t.act(t.find(0, 'De-Spell'));
  assert.equal(t.find(1, 'Raigeki').zone, 'gy');
  for (const [m, keep, lose] of [['Armed Ninja', 'Mirror Force', 'Raigeki'], ['Trap Master', 'Raigeki', 'Mirror Force'], ['Reaper of the Cards', 'Raigeki', 'Mirror Force']]) {
    const u = setup({ m: [fd(m)] }, { s: [keep, lose] });
    u.answer(0, pickNamed(lose));
    await flipUp(u.d, u.find(0, m));
    assert.equal(u.find(1, lose).zone, 'gy', m);
  }
});

test('Nobleman of Extermination banishes a Set Trap and its copies in both Decks', async () => {
  const t = setup({ hand: ['Nobleman of Extermination'], deck: ['Mirror Force'] }, { s: ['Mirror Force'], deck: ['Mirror Force'] });
  await t.act(t.find(0, 'Nobleman of Extermination'));
  assert.equal(t.P0.banished.length + t.P1.banished.length, 3);
});

test('Backup Soldier returns up to 3 Normal Monsters with 1500 or less ATK', async () => {
  const t = setup({ s: ['Backup Soldier'], gy: ['Feral Imp', 'Mystical Elf', 'Sangan', 'Blue-Eyes White Dragon', 'Petit Moth'] });
  t.answer(0, pickNamed('Feral Imp', 'Mystical Elf', 'Petit Moth'));
  await t.act(t.find(0, 'Backup Soldier'));
  assert.deepEqual(names(t.P0.hand), ['Feral Imp', 'Mystical Elf', 'Petit Moth']);
});

test('Makiu: destroys monsters with DEF below the chosen monster\'s ATK and skips the Battle Phase', async () => {
  const t = setup({ hand: ['Makiu'], m: ['Summoned Skull'] }, { m: ['Blue-Eyes White Dragon', 'Mystical Elf'] });
  await t.act(t.find(0, 'Makiu'));
  assert.deepEqual(names(t.d.monsters(1)), ['Blue-Eyes White Dragon']);
  assert.ok(t.d.hasTemp('noBP', 0));
});

test('Mage Power counts your Spell & Trap cards', async () => {
  const t = setup({ hand: ['Mage Power'], m: ['Battle Ox'], s: ['Mirror Force', 'Trap Hole'] });
  await t.act(t.find(0, 'Mage Power'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1700 + 1500);
});

test('Chain Energy: 500 LP per card played from the hand', async () => {
  const t = setup({ s: [{ name: 'Chain Energy', faceUp: true }], hand: ['Battle Ox'] });
  await summon(t.d, 0, 'Battle Ox');
  assert.equal(t.P0.lp, 7500);
});

test('Magic Thorn: 500 per card the opponent discards by an effect', async () => {
  const t = setup({ s: [{ name: 'Magic Thorn', faceUp: true }] }, { hand: ['Graceful Charity'] });
  t.d.tp = 1;
  await t.act(t.find(1, 'Graceful Charity'), undefined, 1);
  assert.equal(t.P1.lp, 7000);
});

test('Mask of Dispel burns the controller of the chosen Spell', async () => {
  const t = setup({ s: ['Mask of Dispel'] }, { s: [{ name: 'Messenger of Peace', faceUp: true }] });
  await t.act(t.find(0, 'Mask of Dispel'));
  await standby(t.d, 1);
  assert.equal(t.P1.lp, 8000 - 500 - 100);
});

test('Shield & Sword swaps original ATK and DEF this turn', async () => {
  const t = setup({ hand: ['Shield & Sword'], m: ['Mystical Elf'] });
  await t.act(t.find(0, 'Shield & Sword'));
  assert.equal(t.d.atk(t.find(0, 'Mystical Elf')), 2000);
  t.d.turn++;
  assert.equal(t.d.atk(t.find(0, 'Mystical Elf')), 800);
});

test('Insect Barrier stops opposing Insects attacking', () => {
  const t = setup({ s: [{ name: 'Insect Barrier', faceUp: true }] }, { m: ['Petit Moth', 'Battle Ox'] });
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Petit Moth')), false);
  assert.ok(t.d.canAttack(t.find(1, 'Battle Ox')));
});

test('Burning Land: destroys Field Spells, 500 to the turn player each Standby Phase', async () => {
  const t = setup({ hand: ['Burning Land'] }, { f: 'Umi' });
  await t.act(t.find(0, 'Burning Land'));
  assert.equal(t.find(1, 'Umi').zone, 'gy');
  await standby(t.d, 1);
  assert.equal(t.P1.lp, 7500);
});

test('Monster Recovery reshuffles a monster and your hand, then redraws', async () => {
  const t = setup({ hand: ['Monster Recovery', 'Raigeki', 'Pot of Greed'], m: ['Battle Ox'] });
  await t.act(t.find(0, 'Monster Recovery'));
  assert.equal(t.P0.hand.length, 2);
  assert.equal(t.d.monsters(0).length, 0);
});

test('Darkness Approaches turns a monster face-down', async () => {
  const t = setup({ hand: ['Darkness Approaches', 'Battle Ox', 'Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Darkness Approaches'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').faceUp, false);
});

test('Dark-Piercing Light flips the opponent\'s monsters (Flip effects activate)', async () => {
  const t = setup({ hand: ['Dark-Piercing Light'], m: ['Battle Ox'] }, { m: [fd('Man-Eater Bug')] });
  await t.act(t.find(0, 'Dark-Piercing Light'));
  assert.equal(t.find(0, 'Battle Ox').zone, 'gy');
});

test('The Cheerful Coffin discards up to 3 monsters', async () => {
  const t = setup({ hand: ['The Cheerful Coffin', 'Battle Ox', 'Feral Imp', 'Raigeki'] });
  t.answer(0, pickNamed('Battle Ox', 'Feral Imp'));
  await t.act(t.find(0, 'The Cheerful Coffin'));
  assert.deepEqual(names(t.P0.hand), ['Raigeki']);
});

test('Spirit Elimination banishes your monster instead of a Graveyard card', async () => {
  const t = setup({ hand: ['Spirit Elimination'], m: ['Battle Ox'], gy: ['Flame Manipulator'] });
  await t.act(t.find(0, 'Spirit Elimination'));
  await t.d.banish(t.find(0, 'Flame Manipulator'), 1);
  assert.equal(t.find(0, 'Flame Manipulator').zone, 'gy');
  assert.equal(t.find(0, 'Battle Ox').zone, 'banished');
});

test('Miracle Dig returns 3 banished monsters', async () => {
  const t = setup({ hand: ['Miracle Dig'], banished: ['Battle Ox', 'Battle Ox', 'Feral Imp', 'Mystical Elf', 'Petit Moth'] });
  await t.act(t.find(0, 'Miracle Dig'));
  assert.equal(t.P0.gy.length, 4, '3 monsters plus Miracle Dig');
});

test('Rush Recklessly / The Reliable Guardian / Castle Walls / Snake Fang modify one monster', async () => {
  const t = setup({ hand: ['Rush Recklessly', 'The Reliable Guardian'], s: ['Castle Walls', 'Snake Fang'], m: ['Battle Ox'] });
  for (const n of ['Rush Recklessly', 'The Reliable Guardian', 'Castle Walls', 'Snake Fang']) await t.act(t.find(0, n));
  const ox = t.find(0, 'Battle Ox');
  assert.deepEqual([t.d.atk(ox), t.d.defv(ox)], [2400, 1000 + 700 + 500 - 500]);
});

// ---------------------------------------------------------------- traps
test('Major Riot: bounce all monsters, then re-summon face-down', async () => {
  const t = setup({ s: ['Major Riot'], m: ['Battle Ox', 'Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Major Riot'), pickNamed('Battle Ox'));
  t.d.tp = 1;
  const hane = t.d.mkCard((await import('../helpers')).byName('Hane-Hane'), 1, 'hand');
  t.P1.hand.push(hane); t.d.placeMonster(hane, 1, false, 'def');
  t.answer(1, pickNamed('Battle Ox'));
  await flipUp(t.d, hane);
  assert.equal(t.find(0, 'Battle Ox').zone, 'mzone', 'one monster returned by Major Riot, so one may come back');
  assert.equal(t.find(0, 'Battle Ox').faceUp, false);
  assert.equal(t.find(0, 'Feral Imp').zone, 'hand');
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone !== 'mzone' || !t.find(1, 'Blue-Eyes White Dragon').faceUp, true);
});

test('Armored Glass negates Equip Cards for the turn', async () => {
  const t = setup({ hand: ['Axe of Despair'], m: ['Battle Ox'] }, { s: ['Armored Glass'] });
  t.answer(1, respondWith('Armored Glass'));
  await t.act(t.find(0, 'Axe of Despair'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1700);
});

test('Forced Requisition: the opponent discards as many as you', async () => {
  const t = setup({ s: [{ name: 'Forced Requisition', faceUp: true }], hand: ['Battle Ox'] }, { hand: ['Raigeki', 'Pot of Greed'] });
  await t.d.discard(0, [t.find(0, 'Battle Ox')], null); await t.d.settle();
  assert.equal(t.P1.hand.length, 1);
});

test('Kunai with Chain changes the attacker to Defense', async () => {
  const t = setup({ s: ['Kunai with Chain'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Kunai with Chain'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Feral Imp'));
  assert.equal(t.find(0, 'Feral Imp').zone, 'mzone');
});

test('Negate Attack ends the Battle Phase; Widespread Ruin destroys the strongest attacker', async () => {
  const t = setup({ s: ['Negate Attack'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Negate Attack'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), null);
  assert.ok(t.d.battleEnded);
  assert.equal(t.P0.lp, 8000);
  const u = setup({ s: ['Widespread Ruin'] }, { m: ['Battle Ox', 'Blue-Eyes White Dragon'] });
  u.answer(0, respondWith('Widespread Ruin'));
  await attack(u.d, u.find(1, 'Battle Ox'), null);
  assert.equal(u.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
});

test('Mask of Weakness and Enchanted Javelin answer an attack', async () => {
  const t = setup({ s: ['Mask of Weakness'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Mask of Weakness'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Battle Ox'));
  assert.equal(t.P0.lp, 8000 - 600);
  const u = setup({ s: ['Enchanted Javelin'] }, { m: ['Battle Ox'] });
  u.answer(0, respondWith('Enchanted Javelin'));
  await attack(u.d, u.find(1, 'Battle Ox'), null);
  assert.equal(u.P0.lp, 8000);
});

test('Deal of Phantom: +100 per monster in your Graveyard', async () => {
  const t = setup({ s: ['Deal of Phantom'], m: ['Battle Ox'], gy: ['Feral Imp', 'Petit Moth'] });
  await t.act(t.find(0, 'Deal of Phantom'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1900);
});

test('Mask of the Accursed: cannot attack and 500 each Standby Phase', async () => {
  const t = setup({ hand: ['Mask of the Accursed'] }, { m: ['Blue-Eyes White Dragon'] });
  await t.act(t.find(0, 'Mask of the Accursed'));
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
  await standby(t.d, 0);
  assert.equal(t.P1.lp, 7500);
});

test('World Suppression negates a Field Spell for the turn', async () => {
  const t = setup({ hand: ['Yami'], m: ['Dark Magician'] }, { s: ['World Suppression'] });
  t.answer(1, respondWith('World Suppression'));
  await t.act(t.find(0, 'Yami'));
  assert.equal(t.d.atk(t.find(0, 'Dark Magician')), 2500);
});

test('7 Completed: choose ATK or DEF', async () => {
  const t = setup({ hand: ['7 Completed'], m: ['Cannon Soldier'] });
  t.answer(0, chooseOption('DEF +700'));
  await t.act(t.find(0, '7 Completed'));
  assert.equal(t.d.defv(t.find(0, 'Cannon Soldier')), 2000);
});

test('Collected Power gathers every Equip Card', async () => {
  const t = setup({ hand: ['Axe of Despair', 'Black Pendant'], s: ['Collected Power'], m: ['Battle Ox'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, pickNamed('Battle Ox'), pickNamed('Blue-Eyes White Dragon'));
  await t.act(t.find(0, 'Axe of Despair'));
  await t.act(t.find(0, 'Black Pendant'));
  t.answer(0, pickNamed('Blue-Eyes White Dragon'));
  await t.act(t.find(0, 'Collected Power'));
  assert.equal(t.d.atk(t.find(1, 'Blue-Eyes White Dragon')), 4500);
});

test('Dark Spirit of the Silent swaps in a different attacker', async () => {
  const t = setup({ s: ['Dark Spirit of the Silent'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon', 'Petit Moth'] });
  t.answer(0, respondWith('Dark Spirit of the Silent'), pickNamed('Petit Moth'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Feral Imp'));
  assert.equal(t.find(1, 'Petit Moth').zone, 'gy');
  assert.equal(t.find(0, 'Feral Imp').zone, 'mzone');
});

test('Jam Defender redirects attacks to Revival Jam', async () => {
  const t = setup({ s: [{ name: 'Jam Defender', faceUp: true }], m: ['Revival Jam', 'Feral Imp'] }, { m: ['Battle Ox'] });
  await attack(t.d, t.find(1, 'Battle Ox'), t.find(0, 'Feral Imp'));
  assert.equal(t.find(0, 'Feral Imp').zone, 'mzone');
});

test('Fairy\'s Hand Mirror redirects a single-target Spell', async () => {
  const t = setup({ hand: ['Rush Recklessly'], m: ['Battle Ox'] }, { s: ["Fairy's Hand Mirror"], m: ['Feral Imp'] });
  t.answer(1, respondWith("Fairy's Hand Mirror"), pickNamed('Feral Imp'));
  await t.act(t.find(0, 'Rush Recklessly'));
  assert.equal(t.d.atk(t.find(1, 'Feral Imp')), 2000);
});

test('Riryoku Field negates a single-target Spell', async () => {
  const t = setup({ hand: ['Change of Heart'] }, { s: ['Riryoku Field'], m: ['Blue-Eyes White Dragon'] });
  t.answer(1, respondWith('Riryoku Field'));
  await t.act(t.find(0, 'Change of Heart'));
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').ctrl, 1);
});

test('Time Seal skips the opponent\'s next Draw Phase', async () => {
  const t = setup({ s: ['Time Seal'] });
  await t.act(t.find(0, 'Time Seal'));
  assert.equal(t.d.flags['skipDraw:1'], 1);
});

test('Gust / Driving Snow answer your Spell / Trap being destroyed by the opponent', async () => {
  const t = setup({ hand: ['Mystical Space Typhoon'] }, { s: [{ name: 'Messenger of Peace', faceUp: true }, 'Gust', 'Trap Hole'] });
  t.answer(0, pickNamed('Messenger of Peace'));
  t.answer(1, respondWith('Gust'));
  const holder = setup({}, {}); void holder;
  await t.act(t.find(0, 'Mystical Space Typhoon'));
  assert.ok(t.ctl[1].seen.some((p) => p.t === 'chain' && p.ev.e === 'sent'));
});

test('Graverobber\'s Retribution: 100 per banished opponent monster', async () => {
  const t = setup({ s: [{ name: "Graverobber's Retribution", faceUp: true }] }, { banished: ['Battle Ox', 'Feral Imp'] });
  await standby(t.d, 0);
  assert.equal(t.P1.lp, 7800);
});

test('Call of the Grave negates Monster Reborn; Call of the Dark forbids it', async () => {
  const t = setup({ hand: ['Monster Reborn'], gy: ['Blue-Eyes White Dragon'] }, { s: ['Call of the Grave'] });
  t.answer(1, respondWith('Call of the Grave'));
  await t.act(t.find(0, 'Monster Reborn'));
  assert.equal(t.find(0, 'Blue-Eyes White Dragon').zone, 'gy');
  const u = setup({ hand: ['Monster Reborn'], gy: ['Blue-Eyes White Dragon'] }, { s: [{ name: 'Call of the Dark', faceUp: true }] });
  assert.equal(u.canAct(u.find(0, 'Monster Reborn')), false);
});

test('The Emperor\'s Holiday negates Equip Cards', async () => {
  const t = setup({ hand: ['Axe of Despair'], m: ['Battle Ox'] }, { s: ["The Emperor's Holiday"] });
  await t.act(t.find(0, 'Axe of Despair'));
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 2700);
  await t.act(t.find(1, "The Emperor's Holiday"), undefined, 1);
  assert.equal(t.d.atk(t.find(0, 'Battle Ox')), 1700);
});

test('Lightforce Sword removes a hand card until the opponent\'s 4th turn', async () => {
  const t = setup({ s: ['Lightforce Sword'] }, { hand: ['Raigeki'] });
  await t.act(t.find(0, 'Lightforce Sword'));
  const r = t.find(1, 'Raigeki');
  assert.equal(r.zone, 'banished');
  assert.equal(r.faceUp, false);
  t.d.turn = 3 + 7 - 1;
  await standby(t.d, 1);
  assert.equal(r.zone, 'hand');
});

test('Appropriate: draw 2 when the opponent draws outside the Draw Phase', async () => {
  const t = setup({ s: [{ name: 'Appropriate', faceUp: true }] }, { hand: ['Pot of Greed'] });
  t.d.tp = 1;
  await t.act(t.find(1, 'Pot of Greed'), undefined, 1);
  assert.equal(t.P0.hand.length, 2);
});

test('House of Adhesive Tape: summoned monster with 500 or less DEF', async () => {
  const t = setup({ s: ['House of Adhesive Tape'] }, { hand: ['Petit Moth'] });
  t.answer(0, respondWith('House of Adhesive Tape'));
  await summon(t.d, 1, 'Petit Moth');
  assert.equal(t.find(1, 'Petit Moth').zone, 'gy');
});

test('Magic Drain: negated unless the opponent discards a Spell', async () => {
  const t = setup({ hand: ['Pot of Greed'] }, { s: ['Magic Drain'] });
  t.answer(1, respondWith('Magic Drain'));
  await t.act(t.find(0, 'Pot of Greed'));
  assert.equal(t.P0.hand.length, 0);
  const u = setup({ hand: ['Pot of Greed', 'Raigeki'] }, { s: ['Magic Drain'] });
  u.answer(1, respondWith('Magic Drain'));
  await u.act(u.find(0, 'Pot of Greed'));
  assert.equal(u.P0.hand.length, 2, 'Raigeki discarded, Pot of Greed resolved');
});

test('Magical Hats hides a monster among two Set non-monsters', async () => {
  const t = setup({ s: ['Magical Hats'], m: ['Battle Ox'], deck: ['Raigeki', 'Pot of Greed'] }, { m: ['Blue-Eyes White Dragon'] });
  t.answer(0, respondWith('Magical Hats'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Battle Ox'));
  assert.equal(t.d.monsters(0).filter((c) => c.def.kind !== 'monster').length + t.P0.gy.filter((c) => c.def.kind !== 'monster').length >= 2, true);
});

test('Magic-Arm Shield makes the attacker\'s ally the new target', async () => {
  const t = setup({ s: ['Magic-Arm Shield'], m: ['Feral Imp'] }, { m: ['Blue-Eyes White Dragon', 'Petit Moth'] });
  t.answer(0, respondWith('Magic-Arm Shield'), pickNamed('Petit Moth'));
  await attack(t.d, t.find(1, 'Blue-Eyes White Dragon'), t.find(0, 'Feral Imp'));
  assert.equal(t.find(1, 'Petit Moth').zone, 'gy');
  assert.equal(t.find(0, 'Feral Imp').zone, 'mzone');
});

test('Blind Destruction destroys monsters of the rolled Level', async () => {
  const t = setup({ s: [{ name: 'Blind Destruction', faceUp: true }] }, { m: ['Battle Ox', 'Blue-Eyes White Dragon'] }, () => 0.55);
  await standby(t.d, 0);
  assert.deepEqual(names(t.d.monsters(1)), ['Blue-Eyes White Dragon']);
});

test('Infinite Dismissal destroys Level 3 or lower summons at the End Phase', async () => {
  const t = setup({ s: [{ name: 'Infinite Dismissal', faceUp: true }] }, { hand: ['Petit Moth'] });
  await summon(t.d, 1, 'Petit Moth');
  await endTurn(t.d, 1);
  assert.equal(t.find(1, 'Petit Moth').zone, 'gy');
});

test('Acid Trap Hole destroys a face-down monster with 2000 or less DEF', async () => {
  const t = setup({ s: ['Acid Trap Hole'] }, { m: [fd('Battle Ox'), fd('Labyrinth Wall')] });
  t.answer(0, pickNamed('Battle Ox'));
  await t.act(t.find(0, 'Acid Trap Hole'));
  assert.equal(t.find(1, 'Battle Ox').zone, 'gy');
  assert.equal(t.find(1, 'Battle Ox').def.name, 'Battle Ox');
});

test('Sword of Dragon\'s Soul destroys a battled Dragon at the end of the Battle Phase', async () => {
  const t = setup({ hand: ["Sword of Dragon's Soul"], m: ['Celtic Guardian'] }, { m: [{ name: 'Blue-Eyes White Dragon', pos: 'def' }] });
  await t.act(t.find(0, "Sword of Dragon's Soul"));
  await attack(t.d, t.find(0, 'Celtic Guardian'), t.find(1, 'Blue-Eyes White Dragon'));
  await (t.d as any).runTasks('BPend');
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
});

test('Remove Trap destroys a face-up Trap', async () => {
  const t = setup({ hand: ['Remove Trap'] }, { s: [{ name: 'Gravity Bind', faceUp: true }] });
  await t.act(t.find(0, 'Remove Trap'));
  assert.equal(t.find(1, 'Gravity Bind').zone, 'gy');
});

test('Bait Doll forces a Set Trap: an untimely one is destroyed; Bait Doll goes to the Deck', async () => {
  const t = setup({ hand: ['Bait Doll'] }, { s: ['Mirror Force'] });
  await t.act(t.find(0, 'Bait Doll'));
  assert.equal(t.find(1, 'Mirror Force').zone, 'gy');
  assert.equal(t.find(0, 'Bait Doll').zone, 'deck');
});

test('Inspection: pay 500 to see a random hand card', async () => {
  const t = setup({ s: [{ name: 'Inspection', faceUp: true }] }, { hand: ['Raigeki'] });
  await standby(t.d, 1);
  assert.equal(t.P0.lp, 7500);
});

test('Optional effects can be declined (Needle Ball)', async () => {
  const t = setup({ m: [fd('Needle Ball')] });
  t.answer(0, sayNo);
  await flipUp(t.d, t.find(0, 'Needle Ball'));
  assert.equal(t.P0.lp, 8000);
});

test('Morphing Jar #2 returns monsters and re-summons as many face-down from the Deck', async () => {
  const t = setup({ m: [fd('Morphing Jar #2'), 'Battle Ox'] }, { m: ['Blue-Eyes White Dragon'], deck: ['Feral Imp'] });
  await flipUp(t.d, t.d.monsters(0)[0]);
  assert.equal(t.d.monsters(0).length, 2);
  assert.ok(t.d.monsters(0).every((c) => !c.faceUp && (c.def.lv ?? 0) <= 4));
  assert.equal(t.d.monsters(1).length, 1);
});

test('Paralyzing Potion: a non-Machine cannot attack', async () => {
  const t = setup({ hand: ['Paralyzing Potion'] }, { m: ['Blue-Eyes White Dragon', 'Cannon Soldier'] });
  assert.equal(t.d.targetCands(t.find(0, 'Paralyzing Potion').def.effects![0], 0, 0, t.find(0, 'Paralyzing Potion')).length, 1);
  await t.act(t.find(0, 'Paralyzing Potion'));
  t.d.tp = 1; t.d.phase = 'BP';
  assert.equal(t.d.canAttack(t.find(1, 'Blue-Eyes White Dragon')), false);
});

test('Greenkappa destroys 2 Set Spell/Trap cards; Tornado Bird bounces 2', async () => {
  const t = setup({ m: [fd('Greenkappa')] }, { s: ['Mirror Force', 'Trap Hole'] });
  await flipUp(t.d, t.find(0, 'Greenkappa'));
  assert.equal(t.P1.gy.length, 2);
  const u = setup({ m: [fd('Tornado Bird')] }, { s: ['Mirror Force', { name: 'Gravity Bind', faceUp: true }] });
  await flipUp(u.d, u.find(0, 'Tornado Bird'));
  assert.equal(u.P1.hand.length, 2);
});

test('Dream Clown destroys and Crass Clown bounces when they change position', async () => {
  const t = setup({ m: ['Dream Clown', { name: 'Crass Clown', pos: 'def' }] }, { m: ['Blue-Eyes White Dragon', 'Battle Ox'] });
  t.answer(0, pickNamed('Blue-Eyes White Dragon'));
  await t.d.changePos(t.find(0, 'Dream Clown'), 'def'); await t.d.settle();
  assert.equal(t.find(1, 'Blue-Eyes White Dragon').zone, 'gy');
  await t.d.changePos(t.find(0, 'Crass Clown'), 'atk'); await t.d.settle();
  assert.equal(t.find(1, 'Battle Ox').zone, 'hand');
});

test('Driving Snow answers your Trap being destroyed by the opponent', async () => {
  const t = setup({ hand: ['Mystical Space Typhoon'], s: ['Raigeki'] }, { s: ['Mirror Force', 'Driving Snow'] });
  t.answer(0, pickNamed('Mirror Force'));
  t.answer(1, respondWith('Driving Snow'), pickNamed('Raigeki'));
  await t.act(t.find(0, 'Mystical Space Typhoon'));
  assert.equal(t.find(0, 'Raigeki').zone, 'gy');
});
