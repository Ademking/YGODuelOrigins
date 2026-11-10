// Headless check: CPU vs CPU duels across all decks/difficulties must finish without engine errors.
// Run with `npm run check`.
import { Duel, type DeckList } from './duel';
import { AIController, type Difficulty } from './ai';
import { OPPONENTS, STARTERS, validateDeck } from '../data/decks';
import { CARDS } from '../data/cards';
async function checkImportedSpell(name: string, expectedLP: [number, number], expectedDraws: number) {
  const definition = CARDS.find(card => card.name === name);
  const filler = CARDS.find(card => card.kind === 'monster' && card.mtype === 'normal');
  if (!definition || !filler) throw new Error(`Missing imported test cards for ${name}`);
  const deck = { main: [filler.id, definition.id], extra: [] };
  const controller = new AIController('normal', 0, () => 0.5);
  const duel = new Duel([deck, deck], ['A', 'B'], [controller, controller]);
  const card = duel.players[0].deck.find(candidate => candidate.def.id === definition.id)!;
  const effect = card.def.effects?.find(candidate => candidate.type === 'activate');
  if (!effect) throw new Error(`Missing imported effect for ${name}`);
  const link = { card, eff: effect, p: 0, targets: [], tmv: [], ev: { e: 'open' } };
  for (const op of effect.ops) await (duel as any).runOp(op, link, false);
  if (duel.players[0].lp !== expectedLP[0] || duel.players[1].lp !== expectedLP[1] || duel.players[0].hand.length !== expectedDraws) {
    throw new Error(`Incorrect imported effect for ${name}`);
  }
}
await checkImportedSpell('Upstart Goblin', [8000, 9000], 1);
await checkImportedSpell('Tremendous Fire', [7500, 7000], 0);
await checkImportedSpell('Rain of Mercy', [9000, 9000], 0);
await checkImportedSpell('Soul of the Pure', [8800, 8000], 0);
await checkImportedSpell('Blue Medicine', [8400, 8000], 0);
for (const [name, race] of [
  ['Legendary Sword', 'Warrior'], ['Book of Secret Arts', 'Spellcaster'], ['Dark Energy', 'Fiend'],
  ['Beast Fangs', 'Beast'], ['Mystical Moon', 'Beast-Warrior'], ['Vile Germs', 'Plant'],
  ['Silver Bow and Arrow', 'Fairy'], ['Violet Crystal', 'Zombie'], ['Raise Body Heat', 'Dinosaur'],
  ['Follow Wind', 'Winged Beast'], ['Power of Kaishin', 'Aqua'], ['Machine Conversion Factory', 'Machine'],
] as const) {
  const equip = CARDS.find(card => card.name === name);
  const monster = CARDS.find(card => card.kind === 'monster' && card.race === race);
  const wrongMonster = CARDS.find(card => card.kind === 'monster' && card.race !== race);
  if (!equip?.equip || !monster || !wrongMonster) throw new Error(`Missing equip test cards for ${name}`);
  const deck = { main: [equip.id, monster.id, wrongMonster.id], extra: [] };
  const controller = new AIController('normal', 0, () => 0.5);
  const duel = new Duel([deck, deck], ['A', 'B'], [controller, controller]);
  const [spell, target, wrong] = duel.players[0].deck;
  target.zone = wrong.zone = 'mzone';
  target.faceUp = wrong.faceUp = true;
  duel.players[0].m[0] = target;
  duel.players[0].m[1] = wrong;
  spell.zone = 'szone';
  spell.faceUp = true;
  duel.players[0].s[0] = spell;
  if (!duel.match(target, equip.equip.f!, 0, spell) || duel.match(wrong, equip.equip.f!, 0, spell)) throw new Error(`Incorrect target filter for ${name}`);
  const effect = spell.def.effects?.find(candidate => candidate.type === 'activate');
  if (!effect) throw new Error(`Missing activation for ${name}`);
  const attack = duel.atk(target), defense = duel.defv(target);
  const link = { card: spell, eff: effect, p: 0, targets: [[target]], tmv: [[target.mv]], ev: { e: 'open' } };
  for (const op of effect.ops) await (duel as any).runOp(op, link, false);
  if (duel.atk(target) !== attack + 300 || duel.defv(target) !== defense + 300) throw new Error(`Incorrect equip bonus for ${name}`);
}
for (const [name, kind, value, atkBonus, defBonus] of [
  ['Umiiruka', 'attr', 'WATER', 500, -400], ['Gaia Power', 'attr', 'EARTH', 500, -400],
  ['Luminous Spark', 'attr', 'LIGHT', 500, -400], ['Mystic Plasma Zone', 'attr', 'DARK', 500, -400],
  ['Rising Air Current', 'attr', 'WIND', 500, -400], ['Wasteland', 'race', 'Dinosaur', 200, 200],
  ['Forest', 'race', 'Plant', 200, 200],
] as const) {
  const field = CARDS.find(card => card.name === name);
  const monster = CARDS.find(card => card.kind === 'monster' && card[kind] === value && (card.def ?? 0) >= 400);
  if (!field || !monster) throw new Error(`Missing field spell test cards for ${name}`);
  const deck = { main: [field.id, monster.id], extra: [] };
  const controller = new AIController('normal', 0, () => 0.5);
  const duel = new Duel([deck, deck], ['A', 'B'], [controller, controller]);
  const [spell, target] = duel.players[0].deck;
  target.zone = 'mzone';
  target.faceUp = true;
  duel.players[0].m[0] = target;
  const attack = duel.atk(target), defense = duel.defv(target);
  spell.zone = 'fzone';
  spell.faceUp = true;
  duel.players[0].f = spell;
  if (duel.atk(target) !== attack + atkBonus || duel.defv(target) !== defense + defBonus) throw new Error(`Incorrect field spell bonus for ${name}`);
}
for (const [name, attribute, atkBonus, defBonus] of [
  ['Sword of Dark Destruction', 'DARK', 400, -200], ['Invigoration', 'EARTH', 400, -200],
  ["Elf's Light", 'LIGHT', 400, -200], ['Burning Spear', 'FIRE', 400, -200],
  ['Gust Fan', 'WIND', 400, -200], ['Steel Shell', 'WATER', 400, -200],
  ['Salamandra', 'FIRE', 700, 0],
] as const) {
  const equip = CARDS.find(card => card.name === name);
  const monster = CARDS.find(card => card.kind === 'monster' && card.attr === attribute && (card.def ?? 0) >= 200);
  const wrongMonster = CARDS.find(card => card.kind === 'monster' && card.attr && card.attr !== attribute);
  if (!equip?.equip || !monster || !wrongMonster) throw new Error(`Missing equip test cards for ${name}`);
  const deck = { main: [equip.id, monster.id, wrongMonster.id], extra: [] };
  const controller = new AIController('normal', 0, () => 0.5);
  const duel = new Duel([deck, deck], ['A', 'B'], [controller, controller]);
  const [spell, target, wrong] = duel.players[0].deck;
  target.zone = wrong.zone = 'mzone';
  target.faceUp = wrong.faceUp = true;
  duel.players[0].m[0] = target;
  duel.players[0].m[1] = wrong;
  spell.zone = 'szone';
  spell.faceUp = true;
  duel.players[0].s[0] = spell;
  if (!duel.match(target, equip.equip.f!, 0, spell) || duel.match(wrong, equip.equip.f!, 0, spell)) throw new Error(`Incorrect target filter for ${name}`);
  const effect = spell.def.effects?.find(candidate => candidate.type === 'activate');
  if (!effect) throw new Error(`Missing activation for ${name}`);
  const attack = duel.atk(target), defense = duel.defv(target);
  const link = { card: spell, eff: effect, p: 0, targets: [[target]], tmv: [[target.mv]], ev: { e: 'open' } };
  for (const op of effect.ops) await (duel as any).runOp(op, link, false);
  if (duel.atk(target) !== attack + atkBonus || duel.defv(target) !== defense + defBonus) throw new Error(`Incorrect equip bonus for ${name}`);
}
// Seeded RNG so failures are reproducible.
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const decks: [string, DeckList][] = [...Object.entries(STARTERS), ...OPPONENTS.map((o) => [o.name, o.deck] as [string, DeckList])];
for (const [name, d] of decks) {
  const errs = validateDeck(d);
  if (errs.length) throw new Error(`Deck ${name} invalid: ${errs.join(' ')}`);
}
// every ritual spell must point at a real ritual monster, every fusion material at a real card
for (const c of CARDS) {
  for (const e of c.effects ?? []) for (const op of e.ops) if (op.op === 'ritual' && !CARDS.some((x) => x.name === op.name && x.mtype === 'ritual')) throw new Error(`bad ritual ${c.id}`);
  for (const m of c.mats ?? []) if (typeof m === 'string' && !CARDS.some((x) => x.id === m)) throw new Error(`bad mat ${c.id}`);
}

const levels: Difficulty[] = ['easy', 'normal', 'hard'];
const N = Number((globalThis as any).process.argv[2] ?? 60);
const results = { 0: 0, 1: 0, draw: 0 } as Record<string, number>;
const reasons: Record<string, number> = {};
let turns = 0;
for (let i = 0; i < N; i++) {
  const rng = mulberry(1000 + i);
  const a = decks[i % decks.length], b = decks[(i * 7 + 3) % decks.length];
  const la = levels[i % 3], lb = levels[(i + 1) % 3];
  const duel = new Duel([a[1], b[1]], [`${a[0]} (${la})`, `${b[0]} (${lb})`], [new AIController(la, 0, rng), new AIController(lb, 0, rng)], () => {}, rng);
  try {
    const r = await duel.run();
    results[r.winner === -1 ? 'draw' : r.winner]++;
    const key = r.reason.replace(/^.*(Life Points|could not draw|turn limit|both).*$/, '$1');
    reasons[key] = (reasons[key] ?? 0) + 1;
    turns += duel.turn;
  } catch (e) {
    console.error(`Duel ${i} crashed on turn ${duel.turn}:`, e);
    console.error(duel.logLines.slice(-25).join('\n'));
    (globalThis as any).process.exit(1);
  }
}
console.log(`${N} duels OK. P0 wins ${results[0]}, P1 wins ${results[1]}, draws ${results.draw}. Avg turns ${(turns / N).toFixed(1)}`);
console.log('End reasons:', reasons);
