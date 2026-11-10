export type Attribute = 'LIGHT' | 'DARK' | 'WATER' | 'FIRE' | 'EARTH' | 'WIND' | 'DIVINE';
export type Race =
  | 'Dragon' | 'Zombie' | 'Fiend' | 'Pyro' | 'Sea Serpent' | 'Rock' | 'Machine' | 'Fish' | 'Dinosaur' | 'Insect'
  | 'Beast' | 'Beast-Warrior' | 'Plant' | 'Aqua' | 'Warrior' | 'Winged Beast' | 'Fairy' | 'Spellcaster' | 'Thunder'
  | 'Reptile' | 'Divine-Beast' | 'Unknown';
export type CardKind = 'monster' | 'spell' | 'trap';
export type MonsterType = 'normal' | 'effect' | 'fusion' | 'ritual';
export type SpellType = 'normal' | 'equip' | 'field' | 'continuous' | 'quickplay' | 'ritual';
export type TrapType = 'normal' | 'continuous' | 'counter';

export interface CardData {
  /** Konami internal id (card_id.bin); stable key used by the game's .ydc deck files. */
  code: number;
  index: number;
  name: string;
  desc: string;
  passcode: string;
  kind: CardKind;
  monsterType?: MonsterType;
  spellType?: SpellType;
  trapType?: TrapType;
  race?: Race;
  attribute?: Attribute;
  level: number;
  atk: number;
  def: number;
  /** Image file name under data/card/, lower-case; may be missing on disk. */
  image?: string;
}
