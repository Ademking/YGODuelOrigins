import type { CardDef, Effect, Filter, Attr, Race } from '../engine/types';
import { MONSTERS } from './effects/monsters';
import { SPELLS } from './effects/spells';
import { TRAPS } from './effects/traps';
import { ONLINE } from './effects/online';

const monsters: Filter = { side: 'any', zone: 'mzone' };
const opposingMonsters: Filter = { side: 'opp', zone: 'mzone' };
const activate = (effect: Omit<Effect, 'type'>): Effect => ({ type: 'activate', ...effect });
const recruiter = (attr: Attr, pos?: 'atk'): Partial<CardDef> => ({
  effects: [{ type: 'trigger', on: ['battleDestroyed'], optional: true, ops: [{ op: 'summon', pos, s: { t: 'choose', f: { side: 'self', zone: 'deck', kind: 'monster', attr, maxAtk: 1500 } } }] }],
});

const typeEquip = (race: Race): Partial<CardDef> => ({
  equip: { f: { ...monsters, faceUp: true, race: [race] }, atk: 300, def: 300 },
});
const attributeEquip = (attr: Attr, atk: number, def: number): Partial<CardDef> => ({
  equip: { f: { ...monsters, faceUp: true, attr }, atk, def },
});
const ORIGINAL: Record<string, Partial<CardDef>> = {
  'Man-Eater Bug': { effects: [{ type: 'flip', targets: [{ f: monsters }], ops: [{ op: 'destroy', s: { t: 'target' } }] }] },
  'Magician of Faith': { effects: [{ type: 'flip', targets: [{ f: { side: 'self', zone: 'gy', kind: 'spell' } }], ops: [{ op: 'toHand', s: { t: 'target' } }] }] },
  'Hane-Hane': { effects: [{ type: 'flip', targets: [{ f: monsters }], ops: [{ op: 'toHand', s: { t: 'target' } }] }] },
  'Giant Rat': recruiter('EARTH'),
  'Mystic Tomato': recruiter('DARK'),
  'UFO Turtle': recruiter('FIRE', 'atk'),
  'Mother Grizzly': recruiter('WATER', 'atk'),
  'Shining Angel': recruiter('LIGHT', 'atk'),
  'Flying Kamakiri #1': recruiter('WIND', 'atk'),
  'Hayabusa Knight': { rules: ['doubleAttack'] },
  'Cannon Soldier': { effects: [{ type: 'ignition', label: 'Tribute: 500 damage', cost: [{ op: 'tribute', s: { t: 'choose', f: { side: 'self', zone: 'mzone' } } }], ops: [{ op: 'damage', who: 'opp', n: 500 }] }] },
  'Pot of Greed': { effects: [activate({ ops: [{ op: 'draw', who: 'self', n: 2 }] })] },
  'Graceful Charity': { effects: [activate({ ops: [{ op: 'draw', who: 'self', n: 3 }, { op: 'discard', who: 'self', n: 2 }] })] },
  'Dark Hole': { effects: [activate({ ops: [{ op: 'destroy', s: { t: 'all', f: monsters } }] })] },
  'Raigeki': { effects: [activate({ ops: [{ op: 'destroy', s: { t: 'all', f: opposingMonsters } }] })] },
  'Heavy Storm': { effects: [activate({ ops: [{ op: 'destroy', s: { t: 'all', f: { side: 'any', st: true, zone: ['szone', 'fzone'], notThis: true } } }] })] },
  'Mystical Space Typhoon': { effects: [activate({ targets: [{ f: { side: 'any', st: true, zone: ['szone', 'fzone'], notThis: true } }], ops: [{ op: 'destroy', s: { t: 'target' } }] })] },
  'Monster Reborn': { effects: [activate({ targets: [{ f: { side: 'any', zone: 'gy', kind: 'monster' } }], ops: [{ op: 'summon', s: { t: 'target' } }] })] },
  'Upstart Goblin': { effects: [activate({ ops: [{ op: 'draw', who: 'self', n: 1 }, { op: 'heal', who: 'opp', n: 1000 }] })] },
  'Tremendous Fire': { effects: [activate({ ops: [{ op: 'damage', who: 'opp', n: 1000 }, { op: 'damage', who: 'self', n: 500 }] })] },
  "Goblin's Secret Remedy": { effects: [activate({ ops: [{ op: 'heal', who: 'self', n: 600 }] })] },
  'Red Medicine': { effects: [activate({ ops: [{ op: 'heal', who: 'self', n: 500 }] })] },
  'Rain of Mercy': { effects: [activate({ ops: [{ op: 'heal', who: 'both', n: 1000 }] })] },
  'Exile of the Wicked': { effects: [activate({ ops: [{ op: 'destroy', s: { t: 'all', f: { ...monsters, faceUp: true, race: ['Fiend'] } } }] })] },
  'Warrior Elimination': { effects: [activate({ ops: [{ op: 'destroy', s: { t: 'all', f: { ...monsters, faceUp: true, race: ['Warrior'] } } }] })] },
  'Giant Trunade': { effects: [activate({ ops: [{ op: 'toHand', s: { t: 'all', f: { side: 'any', st: true, zone: ['szone', 'fzone'], notThis: true } } }] })] },
  'Soul of the Pure': { effects: [activate({ ops: [{ op: 'heal', who: 'self', n: 800 }] })] },
  'Blue Medicine': { effects: [activate({ ops: [{ op: 'heal', who: 'self', n: 400 }] })] },
  'Dian Keto the Cure Master': { effects: [activate({ ops: [{ op: 'heal', who: 'self', n: 1000 }] })] },
  'Ookazi': { effects: [activate({ ops: [{ op: 'damage', who: 'opp', n: 800 }] })] },
  'Final Flame': { effects: [activate({ ops: [{ op: 'damage', who: 'opp', n: 600 }] })] },
  'Hinotama': { effects: [activate({ ops: [{ op: 'damage', who: 'opp', n: 500 }] })] },
  'Sparks': { effects: [activate({ ops: [{ op: 'damage', who: 'opp', n: 200 }] })] },
  'Polymerization': { effects: [activate({ ops: [{ op: 'fusion' }] })] },
  'Change of Heart': { effects: [activate({ targets: [{ f: opposingMonsters }], ops: [{ op: 'control', s: { t: 'target' } }] })] },
  'Rush Recklessly': { effects: [activate({ targets: [{ f: { ...monsters, faceUp: true } }], ops: [{ op: 'stat', s: { t: 'target' }, atk: 700 }] })] },
  'Messenger of Peace': { rules: ['lockAtk1500'], upkeep: 100 },
  'Mountain': { aura: [{ f: { ...monsters, race: ['Dragon', 'Winged Beast', 'Thunder'] }, atk: 200, def: 200 }] },
  'Yami': { aura: [{ f: { ...monsters, race: ['Fiend', 'Spellcaster'] }, atk: 200, def: 200 }, { f: { ...monsters, race: ['Fairy'] }, atk: -200, def: -200 }] },
  'Umi': { aura: [{ f: { ...monsters, race: ['Fish', 'Sea Serpent', 'Thunder', 'Aqua'] }, atk: 200, def: 200 }, { f: { ...monsters, race: ['Machine', 'Pyro'] }, atk: -200, def: -200 }] },
  'Sogen': { aura: [{ f: { ...monsters, race: ['Beast-Warrior', 'Warrior'] }, atk: 200, def: 200 }] },
  'Umiiruka': { aura: [{ f: { ...monsters, attr: 'WATER' }, atk: 500, def: -400 }] },
  'Gaia Power': { aura: [{ f: { ...monsters, attr: 'EARTH' }, atk: 500, def: -400 }] },
  'Luminous Spark': { aura: [{ f: { ...monsters, attr: 'LIGHT' }, atk: 500, def: -400 }] },
  'Mystic Plasma Zone': { aura: [{ f: { ...monsters, attr: 'DARK' }, atk: 500, def: -400 }] },
  'Rising Air Current': { aura: [{ f: { ...monsters, attr: 'WIND' }, atk: 500, def: -400 }] },
  'Wasteland': { aura: [{ f: { ...monsters, race: ['Dinosaur', 'Zombie', 'Rock'] }, atk: 200, def: 200 }] },
  'Forest': { aura: [{ f: { ...monsters, race: ['Insect', 'Beast', 'Plant', 'Beast-Warrior'] }, atk: 200, def: 200 }] },
  'Molten Destruction': { aura: [{ f: { ...monsters, attr: 'FIRE' }, atk: 500, def: -400 }] },
  'Legendary Sword': typeEquip('Warrior'),
  'Book of Secret Arts': typeEquip('Spellcaster'),
  'Dark Energy': typeEquip('Fiend'),
  'Beast Fangs': typeEquip('Beast'),
  'Mystical Moon': typeEquip('Beast-Warrior'),
  'Vile Germs': typeEquip('Plant'),
  'Silver Bow and Arrow': typeEquip('Fairy'),
  'Violet Crystal': typeEquip('Zombie'),
  'Raise Body Heat': typeEquip('Dinosaur'),
  'Follow Wind': typeEquip('Winged Beast'),
  'Power of Kaishin': typeEquip('Aqua'),
  'Machine Conversion Factory': typeEquip('Machine'),
  'Sword of Dark Destruction': attributeEquip('DARK', 400, -200),
  'Invigoration': attributeEquip('EARTH', 400, -200),
  "Elf's Light": attributeEquip('LIGHT', 400, -200),
  'Burning Spear': attributeEquip('FIRE', 400, -200),
  'Gust Fan': attributeEquip('WIND', 400, -200),
  'Steel Shell': attributeEquip('WATER', 400, -200),
  'Salamandra': attributeEquip('FIRE', 700, 0),
  'Insect Armor with Laser Cannon': { equip: { f: { ...monsters, faceUp: true, race: ['Insect'] }, atk: 700 } },
  'Dragon Treasure': { equip: { f: { ...monsters, faceUp: true, race: ['Dragon'] }, atk: 300, def: 300 } },
  'Fairy Meteor Crush': { equip: { f: { ...monsters, faceUp: true }, rules: ['pierce'] } },
  'Trap Hole': { effects: [activate({ on: ['oppNormalFlip'], onF: { minAtk: 1000, faceUp: true }, ops: [{ op: 'destroy', s: { t: 'event' } }] })] },
  'Mirror Force': { effects: [activate({ on: ['oppAttack'], ops: [{ op: 'negateAttack' }, { op: 'destroy', s: { t: 'all', f: { ...opposingMonsters, pos: 'atk' } } }] })] },
  'Magic Cylinder': { effects: [activate({ on: ['oppAttack'], ops: [{ op: 'negateAttack' }, { op: 'damageAtk', who: 'opp', s: { t: 'event' } }] })] },
  'Negate Attack': { effects: [activate({ on: ['oppAttack'], ops: [{ op: 'negateAttack', endBattle: true }] })] },
  'Torrential Tribute': { effects: [activate({ on: ['anySummon'], ops: [{ op: 'destroy', s: { t: 'all', f: monsters } }] })] },
  'Reinforcements': { effects: [activate({ targets: [{ f: { ...monsters, faceUp: true } }], ops: [{ op: 'stat', s: { t: 'target' }, atk: 500 }] })] },
  'Jar of Greed': { effects: [activate({ ops: [{ op: 'draw', who: 'self', n: 1 }] })] },
  'Gravity Bind': { rules: ['lockLv4Attack'] },
  'Solemn Judgment': { effects: [activate({ on: ['summoning', 'activateST'], cost: [{ op: 'payHalf' }], ops: [{ op: 'negate' }] })] },
  'Magic Jammer': { effects: [activate({ on: ['activateSpell'], cost: [{ op: 'discard', who: 'self', n: 1 }], ops: [{ op: 'negate' }] })] },
  'Seven Tools of the Bandit': { effects: [activate({ on: ['activateTrap'], cost: [{ op: 'payLP', n: 1000 }], ops: [{ op: 'negate' }] })] },
};

/** Every implemented card behaviour, keyed by printed card name. */
export const CARD_EFFECTS: Record<string, Partial<CardDef>> = { ...ORIGINAL, ...MONSTERS, ...SPELLS, ...TRAPS, ...ONLINE };
export const ORIGINAL_EFFECT_NAMES = Object.keys(ORIGINAL);
