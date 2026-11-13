// Data-driven card + effect model. Cards are plain data; the duel engine interprets the ops.
// Anything the op vocabulary cannot express is a `run` op: a small script against the Duel API.
import type { Card, Duel, Ev, Link } from './duel';

export type Side = 0 | 1;
export type Attr = 'DARK' | 'LIGHT' | 'EARTH' | 'WATER' | 'FIRE' | 'WIND' | 'DIVINE';
export type Race =
  | 'Dragon' | 'Spellcaster' | 'Warrior' | 'Beast' | 'Beast-Warrior' | 'Fiend' | 'Zombie' | 'Machine'
  | 'Aqua' | 'Pyro' | 'Rock' | 'Winged Beast' | 'Insect' | 'Plant' | 'Fairy' | 'Thunder' | 'Dinosaur'
  | 'Reptile' | 'Sea Serpent' | 'Fish' | 'Divine-Beast';
export type Kind = 'monster' | 'spell' | 'trap';
export type MType = 'normal' | 'effect' | 'fusion' | 'ritual';
export type SType = 'normal' | 'quick' | 'continuous' | 'equip' | 'field' | 'ritual' | 'counter';
export type Zone = 'deck' | 'hand' | 'mzone' | 'szone' | 'fzone' | 'gy' | 'banished' | 'extra';

/** Card filter. `side` is relative to the player using the effect. */
export interface Filter {
  side?: 'self' | 'opp' | 'any';
  zone?: Zone | Zone[];
  kind?: Kind;
  st?: boolean; // spell or trap
  mtype?: MType[];
  stype?: SType;
  attr?: Attr;
  race?: Race[];
  minLv?: number;
  maxLv?: number;
  minAtk?: number;
  maxAtk?: number;
  maxDef?: number;
  faceUp?: boolean;
  pos?: 'atk' | 'def';
  id?: string;
  name?: string | string[]; // printed name (or alias, e.g. Cyber Harpie = Harpie Lady)
  /** Archetype: the printed name (or alias) contains one of these strings ("Elemental Hero", "Ojama"...). */
  set?: string | string[];
  ability?: Ability;
  notThis?: boolean;
  fn?: (d: Duel, c: Card, p: Side, src?: Card | null) => boolean;
}

export type Who = 'self' | 'opp' | 'both';

/** How an op picks the cards it affects. */
export type Sel =
  | { t: 'target'; i?: number } // chosen on activation (targets the card)
  | { t: 'choose'; f: Filter; n?: number; by?: 'self' | 'opp'; upTo?: boolean } // chosen on resolution
  | { t: 'all'; f: Filter }
  | { t: 'this' }
  | { t: 'event' } // the summoned / attacking card that opened the window
  | { t: 'other' }; // the opposing monster in a battle trigger

/** Context handed to scripted ops. `t` = still-valid targets of target group 0. */
export interface Ctx { d: Duel; p: Side; o: Side; card: Card; link: Link; t: Card[]; isCost: boolean }
export type Script = (x: Ctx) => Promise<unknown> | unknown;
/** Rough value of an effect for the CPU (same scale as ai.ts scoreEffect). */
export type AiHint = number | ((d: Duel, me: Side, card: Card, ev: Ev) => number);

export type Op =
  | { op: 'destroy' | 'banish' | 'toHand' | 'toGY' | 'toDeck' | 'tribute'; s: Sel; soft?: boolean }
  | { op: 'summon'; s: Sel; pos?: 'atk' | 'def'; bind?: boolean; soft?: boolean }
  | { op: 'draw' | 'damage' | 'heal' | 'discard' | 'mill'; who: Who; n: number }
  | { op: 'payLP'; n: number }
  | { op: 'payHalf' }
  | { op: 'stat'; s: Sel; atk?: number; def?: number; perm?: boolean }
  | { op: 'pos'; s: Sel; to: 'atk' | 'def' | 'reveal' | 'swap'; soft?: boolean }
  | { op: 'negate'; effectOnly?: boolean; destroy?: boolean }
  | { op: 'negateAttack'; endBattle?: boolean }
  | { op: 'damageAtk'; who: Who; s: Sel }
  | { op: 'control'; s: Sel }
  | { op: 'fusion' }
  | { op: 'ritual'; name: string | ((c: Card) => boolean); exact?: boolean }
  | { op: 'equip' }
  | { op: 'shield' }
  | { op: 'noAttacks' }
  | { op: 'noAttackSelf' }
  | { op: 'run'; fn: Script; feasible?: (d: Duel, p: Side, card: Card) => boolean; ai?: AiHint };

export type On =
  // monster / continuous card triggers (about this card)
  | 'summoned' | 'normalSummoned' | 'flipSummoned' | 'specialSummoned' | 'ritualSummoned' | 'destroyed' | 'battleDestroyed'
  | 'destroysByBattle' | 'battleDamage' | 'standby' | 'oppStandby' | 'endPhase'
  | 'toGY' | 'fieldToGY' | 'leftField' | 'discarded' | 'effDiscarded' | 'banished' | 'milled' | 'drawn' | 'controlChanged'
  | 'toDef' | 'toAtk' | 'attacks' | 'attacked' | 'lpGain' | 'anyDraw' | 'anyDiscard' | 'anyAttack' | 'anyToGY' | 'anyBattleDamage'
  // response timings (traps, quick-plays)
  | 'oppSummon' | 'oppNormalFlip' | 'anySummon' | 'oppAttack' | 'summoning'
  | 'activateSpell' | 'activateTrap' | 'activateST';

export interface TargetSpec { f: Filter; n?: number; min?: number; good?: boolean }
export interface ReqSpec { f: Filter; n?: number; max?: number }

export interface Effect {
  type: 'activate' | 'ignition' | 'trigger' | 'flip' | 'quick';
  on?: On[];
  onF?: Filter; // the event card must match this
  /** Custom response window matcher (activate / quick effects). */
  when?: (d: Duel, ev: Ev, p: Side, card: Card) => boolean;
  /** Extra activation / trigger condition. */
  cond?: (d: Duel, card: Card, p: Side, ev?: Ev) => boolean;
  /** Zones this (non-activate) effect works from; default the monster zone / field. */
  from?: Zone[];
  targets?: TargetSpec[];
  req?: ReqSpec[];
  cost?: Op[];
  ops: Op[];
  /** Speed-1 activation allowed in these phases' open windows instead of the Main Phase. */
  phase?: ('SP' | 'M1' | 'M2' | 'BP')[];
  opt?: boolean; // once per turn
  once?: boolean; // once while this card stays where it is (e.g. Suijin)
  optional?: boolean; // optional trigger: controller is asked
  label?: string;
  ai?: AiHint;
}

export type Rule =
  | 'pierce' | 'direct' | 'battleImmune' | 'doubleAttack' | 'cantAttack'
  | 'lockOppAttack' | 'lockLv4Attack' | 'lockAtk1500'
  | 'noDirect' | 'attackFromDef' | 'noTribute' | 'noEquip' | 'attackAll';

export type Mat = string | { race?: Race; attr?: Attr; name?: string; set?: string; text?: string; fn?: (c: Card) => boolean; more?: boolean };
export type Ability = 'gemini' | 'union' | 'spirit' | 'toon';

export interface StatDelta { atk?: number; def?: number }
export interface EquipSpec {
  f?: Filter;
  atk?: number;
  def?: number;
  rules?: Rule[];
  fn?: (d: Duel, eq: Card, target: Card) => StatDelta | void;
  own?: boolean; // only to monsters you control
  /** If the equipped monster would be destroyed, destroy this card instead (Union monsters). */
  sub?: boolean | 'battle';
  /** Replaces the substitute destruction (Vicious Claw returns to the hand instead). */
  onSub?: (d: Duel, eq: Card, m: Card) => Promise<void> | void;
}

/** Prohibitions applied while the source is face-up (true = forbidden). */
export interface Lock {
  attack?: (d: Duel, src: Card | null, attacker: Card) => boolean;
  summon?: (d: Duel, src: Card | null, p: Side, c: Card, how: string) => boolean;
  set?: (d: Duel, src: Card | null, p: Side, c: Card) => boolean;
  tribute?: (d: Duel, src: Card | null, c: Card) => boolean;
  pos?: (d: Duel, src: Card | null, c: Card) => boolean;
  activate?: (d: Duel, src: Card | null, p: Side, c: Card, effect: Effect) => boolean;
  handLimit?: boolean;
  zone?: (d: Duel, src: Card | null, s: Side, slot: number) => boolean;
  /** Effect / battle damage to player `s` becomes 0. */
  noDamage?: (d: Duel, src: Card | null, s: Side, battle: boolean) => boolean;
  /** `attacker` may not attack `tgt` (null = direct attack). */
  target?: (d: Duel, src: Card | null, attacker: Card, tgt: Card | null) => boolean;
  /** LP the attacking player must pay to declare an attack with `attacker`. */
  tax?: (d: Duel, src: Card | null, attacker: Card) => number;
  /** Monsters "Set" are instead placed face-up in Defense Position (Light of Intervention). */
  faceUpSet?: boolean;
  /** Cards that would go to the Graveyard are banished instead (Banisher of the Light). */
  gyToBanish?: boolean | ((d: Duel, src: Card | null, c: Card) => boolean);
  /** LP each player pays per card played or Set from the hand (Chain Energy). */
  handCost?: number;
  /** p may not banish c from a Graveyard (Kycoo the Ghost Destroyer). */
  banish?: (d: Duel, src: Card | null, p: Side, c: Card) => boolean;
  /** Monster c can be Normal Summoned / Set without Tributes (Big Evolution Pill). */
  noTributes?: (d: Duel, src: Card | null, p: Side, c: Card) => boolean;
  /** Player p may activate Traps the turn they are Set (Cathedral of Nobles). */
  trapSameTurn?: (d: Duel, src: Card | null, p: Side) => boolean;
  /** Modify battle damage `n` to player `to` from the battle between att and tgt (Canyon). */
  battleDmg?: (d: Duel, src: Card | null, att: Card, tgt: Card | null, n: number, to: Side) => number;
  /** Player p cannot conduct their Battle Phase (D.D. Borderline). */
  noBP?: (d: Duel, src: Card | null, p: Side) => boolean;
  /** Card c cannot be added to the hand from the Deck / Graveyard / banished zone (Deck Lockdown). */
  noAdd?: (d: Duel, src: Card | null, c: Card) => boolean;
  /** Monsters that would return from the field to the hand are banished instead (Degenerate Circuit). */
  bounceToBanish?: boolean;
  /** Card c is unaffected by the effects of card `by` (Dust Barrier). */
  unaffected?: (d: Duel, src: Card | null, c: Card, by: Card) => boolean;
  /** Monster c may be Normal Summoned / Set without Tributes by paying this much LP instead (Mausoleum of the Emperor). */
  tributeLP?: (d: Duel, src: Card | null, p: Side, c: Card, need: number) => number | undefined;
  /** Card c's Standby Phase LP payment is waived (Pandemonium). */
  noUpkeep?: (d: Duel, src: Card | null, c: Card) => boolean;
  /** Player p pays no LP to activate Spell Cards (Spell Economics). */
  noSpellLP?: (d: Duel, src: Card | null, p: Side) => boolean;
  /** Monsters Tributed for a Ritual Summon go to the Deck instead (Samsara). */
  ritualToDeck?: boolean;
  /** Monster c has rule r while this is active (Spiral Spear Strike). */
  grants?: (d: Duel, src: Card | null, c: Card, r: Rule) => boolean;
  /** Attacks by `attacker` become direct attacks (Absolute End). */
  forceDirect?: (d: Duel, src: Card | null, attacker: Card) => boolean;
  /** Effect damage to player s is dealt to the opponent instead (Barrel Behind the Door). */
  redirect?: (d: Duel, src: Card | null, s: Side) => boolean;
  /** LP gains of player s inflict that much damage instead (Bad Reaction to Simochi). */
  healToDamage?: (d: Duel, src: Card | null, s: Side) => boolean;
  /** Damage to player s becomes an LP gain instead (Rainbow Life). */
  damageToHeal?: (d: Duel, src: Card | null, s: Side) => boolean;
  /** Control of monsters cannot change (Remove Brainwashing). */
  noControl?: boolean;
  /** Cards that would return from the Graveyard to the Deck are banished instead (Transmigration Break). */
  gyToDeckBanish?: boolean;
  /** Spell & Trap Zone `slot` of player s cannot be used (Seismic Shockwave). */
  stZone?: (d: Duel, src: Card | null, s: Side, slot: number) => boolean;
  /** Card c cannot be destroyed (by battle or by card effects). */
  indestructible?: (d: Duel, src: Card | null, c: Card, by: 'battle' | 'effect') => boolean;
  /** Extra Normal Summons for player p at an LP cost (Ultimate Offering). */
  extraSummon?: (d: Duel, src: Card | null, p: Side) => number;
}

export interface BattleInfo { att: Card; tgt: Card | null; killedT: boolean; killedA: boolean; dmg: number; dmgTo: Side | null }

export interface CardDef {
  id: string;
  name: string;
  kind: Kind;
  art: string; // emblem glyph for generated art
  text: string;
  mtype?: MType;
  attr?: Attr;
  race?: Race;
  lv?: number;
  atk?: number;
  def?: number;
  variableStats?: boolean;
  stype?: SType;
  effects?: Effect[];
  aura?: { f: Filter; atk?: number; def?: number }[];
  /** Variable continuous modifier this card applies to any face-up monster on the field. */
  auraFn?: (d: Duel, src: Card, target: Card) => StatDelta | void;
  /** Continuous modifier of this card's own stats. */
  statFn?: (d: Duel, c: Card) => StatDelta | void;
  rules?: Rule[];
  ruleIf?: Partial<Record<Rule, (d: Duel, c: Card) => boolean>>;
  equip?: EquipSpec;
  mats?: Mat[];
  noFusionSpell?: boolean; // cannot be Fusion Summoned by a card effect (e.g. Contact Fusion monsters)
  ritualOf?: string;
  ssProc?: { req?: ReqSpec[]; cost?: Op[]; cond?: (d: Duel, p: Side, c: Card) => boolean; from?: Zone[] };
  noNormal?: boolean;
  noNormalSet?: boolean;
  fixedTributes?: boolean;
  protectedNormalSummon?: boolean;
  /** Cannot be Special Summoned by card effects (Spirit monsters, Monarch-style restrictions). */
  noSpecial?: boolean;
  ability?: Ability;
  lifetime?: number; // continuous cards: stays for N of the opponent's turns
  upkeep?: number; // pay this much LP each of your Standby Phases or destroy it
  limit?: 0 | 1 | 2; // forbidden / limited / semi-limited (default 3)
  // ---- extended hooks
  alias?: string; // treated as this card name
  token?: boolean;
  onTokenDestroyed?: (d: Duel, c: Card, controller: Side) => Promise<void> | void;
  fusionSub?: boolean; // may substitute for one Fusion-Material Monster
  stays?: boolean; // Normal Spell/Trap that remains on the field after resolving
  lock?: Lock;
  /** This source negates the effects of card c. */
  negateFn?: (d: Duel, src: Card, c: Card) => boolean;
  /** This monster is unaffected by effects of `src`. */
  immune?: (d: Duel, self: Card, src: Card) => boolean;
  /** While face-up, `target` cannot be targeted by effects of `by`. */
  protect?: (d: Duel, src: Card, target: Card, by: Card) => boolean;
  raceFn?: (d: Duel, src: Card, target: Card) => Race | void;
  attrFn?: (d: Duel, src: Card, target: Card) => Attr | void;
  summonCond?: (d: Duel, p: Side) => boolean;
  tributes?: (d: Duel, p: Side) => number;
  tributeSubstitute?: (d: Duel, source: Card, monster: Card, required: number) => boolean;
  /** Other Tribute counts this monster may be Normal Summoned with (Beast King Barbaros: 0 or 3). Recorded in mark.tribCount. */
  altTributes?: number[];
  /** This monster counts as 2 Tributes for the Tribute Summon of `target` (Double Coston). */
  doubleTribute?: (d: Duel, target: Card) => boolean;
  /** Additional attacks per Battle Phase (Armed Samurai - Ben Kei). */
  extraAttacks?: (d: Duel, c: Card) => number;
  /** Only monsters matching this can be Tributed for this card's Tribute Summon. */
  tribFilter?: (d: Duel, t: Card) => boolean;
  summonPos?: 'def';
  attackCost?: Op[];
  attackCond?: (d: Duel, c: Card) => boolean;
  /** Before damage calculation; return true to skip it. */
  preBattle?: (d: Duel, self: Card, other: Card | null) => Promise<boolean | void> | boolean | void;
  /** After damage calculation. */
  postBattle?: (d: Duel, self: Card, other: Card | null, r: BattleInfo) => Promise<void> | void;
  /** Modify battle damage dealt to `to` in a battle involving this card. */
  battleDmg?: (d: Duel, self: Card, other: Card | null, n: number, to: Side) => number;
  /** Runs (while this card is face-up on the field) whenever any monster is summoned. */
  onSummon?: (d: Duel, src: Card, c: Card, how: string, p: Side) => Promise<void> | void;
  onMonsterSet?: (d: Duel, src: Card, c: Card, p: Side) => Promise<void> | void;
  /** The owner of this card wins when this returns true (checked for cards in any zone). */
  winCheck?: (d: Duel, c: Card) => boolean;
  /** Checked after every action while face-up on the field: true = destroy this card (Toons, Tornado Wall...). */
  selfDestructIf?: (d: Duel, c: Card) => boolean;
  /** While face-up, player s must keep their hand revealed. */
  reveals?: (d: Duel, src: Card, s: Side) => boolean;
  /** When this would be destroyed by battle, destroy the returned card instead. */
  battleSub?: (d: Duel, c: Card) => Card | undefined;
  destroySub?: (d: Duel, c: Card) => Promise<Card | undefined> | Card | undefined;
  /** Called when this card is chosen as a target of a chain link. */
  onTargeted?: (d: Duel, self: Card, link: Link) => Promise<void> | void;
  /** Level change this face-up card applies to monster `target` (in the hand or on the field). */
  lvFn?: (d: Duel, src: Card, target: Card) => number;
  /** Runs (while this card is face-up on the field and not negated) after a player takes damage (deferred until the action finishes). */
  onDamage?: (d: Duel, src: Card, s: Side, n: number, from: Card | null, battle: boolean) => Promise<void> | void;
  /** Runs (deferred, while this card is face-up and not negated) whenever any card moves between zones. */
  onMove?: (d: Duel, src: Card, c: Card, from: Zone, to: Zone) => Promise<void> | void;
  /** Like onMove, but while this card is in its owner's Graveyard (Zeta Reticulant). */
  gyOnMove?: (d: Duel, src: Card, c: Card, from: Zone, to: Zone) => Promise<void> | void;
  /** Runs (while this card is face-up on the field and not negated) after every damage calculation. */
  afterBattle?: (d: Duel, src: Card, r: BattleInfo) => Promise<void> | void;
  /** Runs (while this card is face-up on the field and not negated) after each chain link resolves without being negated. */
  onResolve?: (d: Duel, src: Card, link: Link) => Promise<void> | void;
  /** Can only be Normal Summoned by Setting it (Mystic Swordsman LV4). */
  setOnly?: boolean;
  /** Continuous modifier applied to face-up monsters while this card is in its owner's Graveyard (Phantom Beast Cross-Wing). */
  gyAuraFn?: (d: Duel, src: Card, target: Card) => StatDelta | void;
  /** Control of this face-up card cannot switch. */
  fixedCtrl?: boolean;
  /** Activation and effect cannot be negated. */
  noNegate?: boolean;
}
