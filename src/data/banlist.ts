/**
 * YGO Duel Origins - Custom GX banlist v1.0: the game's own Forbidden & Limited list for online duels. Cards not
 * listed are unlimited (3). Keyed by lowercase card name, as the game's card list names them ("Crush Card" is
 * Crush Card Virus).
 */
export const BANLIST_NAME = 'YGO Duel Origins - Custom GX v1.0';
const FORBIDDEN = [
  'Butterfly Dagger - Elma', 'Change of Heart', 'Chaos Emperor Dragon - Envoy of the End', 'Dark Hole',
  'Exchange of the Spirit', 'Fiber Jar', 'Imperial Order', 'Magical Scientist', 'Makyura the Destructor',
  'Mirage of Nightmare', 'Painful Choice', 'Raigeki', 'The Forceful Sentry', 'Victory Dragon', 'Yata-Garasu',
  'Card of Safe Return', 'Destiny HERO - Disk Commander', 'Mind Crush', 'Monster Reborn',
];
const LIMITED = [
  'Ring of Destruction',
  'Black Luster Soldier - Envoy of the Beginning', 'Chaos Sorcerer', 'Confiscation', 'Cyber Jar', 'Delinquent Duo',
  'Dimension Fusion', 'Graceful Charity', "Harpie's Feather Duster", 'Last Will', 'Pot of Greed', 'Sinister Serpent',
  'Snatch Steal', 'Time Seal', 'Tribe-Infecting Virus', 'Tsukuyomi', 'Witch of the Black Forest', 'Brain Control',
  'Breaker the Magical Warrior', 'Call of the Haunted', 'Card Destruction', 'Chain Strike', 'Crush Card',
  'D.D. Warrior Lady', 'Dark Armed Dragon', 'Dark Magician of Chaos', 'Elemental HERO Stratos',
  'Exodia the Forbidden One', 'Future Fusion', 'Green Baboon, Defender of the Forest',
  'Heavy Storm', 'Left Arm of the Forbidden One', 'Left Leg of the Forbidden One', 'Magic Cylinder',
  'Magical Stone Excavation', 'Marshmallon', 'Mirror Force', 'Morphing Jar', 'Mystical Space Typhoon',
  'Neo-Spacian Grand Mole', 'Night Assailant', 'Overload Fusion', 'Premature Burial',
  'Return from the Different Dimension', 'Right Arm of the Forbidden One', 'Right Leg of the Forbidden One',
  'Sangan', 'Snipe Hunter', 'Spirit Reaper', 'Swords of Revealing Light', 'The Transmigration Prophecy',
  'Torrential Tribute', 'Trap Dustshoot', 'Allure of Darkness', 'Creature Swap', 'Manticore of Darkness',
  'Mask of Darkness', 'Reinforcement of the Army', 'Royal Decree',
];
const SEMI_LIMITED = [
  'Giant Trunade',
  'Last Turn', 'Book of Moon', 'Ceasefire', 'Gold Sarcophagus', 'Gravity Bind', 'Level Limit - Area B', 'Mage Power',
  'Magician of Faith', 'Destiny Draw', 'Destiny HERO - Malicious', 'Jinzo', 'Nobleman of Crossout',
];
export const BANLIST = new Map<string, 0 | 1 | 2>([
  ...FORBIDDEN.map(n => [n.toLowerCase(), 0] as const), ...LIMITED.map(n => [n.toLowerCase(), 1] as const), ...SEMI_LIMITED.map(n => [n.toLowerCase(), 2] as const),
]);

/**
 * The list as first released (1.4.4), before Ring of Destruction became Limited and Giant Trunade Semi-Limited. Only
 * used to recognise starter decks saved under it, so an unedited one is brought up to the current list (decks.ts).
 */
export const CUSTOM_V1_0_BANLIST = new Map<string, 0 | 1 | 2>([...BANLIST, ['ring of destruction', 0], ['giant trunade', 1]]);

/**
 * The April 2005 "GOAT" list the game used before (version 1.4.3). Only used to recognise starter decks saved under
 * it, so an unedited one is brought up to the current list (decks.ts).
 */
const GOAT_FORBIDDEN = ['Chaos Emperor Dragon - Envoy of the End', 'Fiber Jar', 'Magical Scientist', 'Makyura the Destructor', 'Witch of the Black Forest',
  'Yata-Garasu', 'Butterfly Dagger - Elma', 'Change of Heart', 'Confiscation', 'Dark Hole', "Harpie's Feather Duster", 'Mirage of Nightmare',
  'Monster Reborn', 'Painful Choice', 'Raigeki', 'The Forceful Sentry', 'Imperial Order'];
const GOAT_LIMITED = ['Black Luster Soldier - Envoy of the Beginning', 'Breaker the Magical Warrior', 'Cyber Jar', 'D.D. Warrior Lady', 'Dark Magician of Chaos',
  'Exiled Force', 'Exodia the Forbidden One', 'Injection Fairy Lily', 'Jinzo', 'Left Arm of the Forbidden One', 'Left Leg of the Forbidden One',
  'Morphing Jar', 'Protector of the Sanctuary', 'Reflect Bounder', 'Right Arm of the Forbidden One', 'Right Leg of the Forbidden One',
  'Sacred Phoenix of Nephthys', 'Sangan', 'Sinister Serpent', 'Tribe-Infecting Virus', 'Twin-Headed Behemoth', 'Card Destruction', 'Delinquent Duo',
  'Graceful Charity', 'Heavy Storm', 'Lightning Vortex', 'Mage Power', 'Mystical Space Typhoon', 'Pot of Greed', 'Premature Burial', 'Snatch Steal',
  'Swords of Revealing Light', 'United We Stand', 'Call of the Haunted', 'Ceasefire', 'Deck Devastation Virus', 'Magic Cylinder', 'Mirror Force',
  'Reckless Greed', 'Ring of Destruction', 'Torrential Tribute'];
const GOAT_SEMI_LIMITED = ['Abyss Soldier', 'Dark Scorpion - Chick the Yellow', 'Manticore of Darkness', 'Marauding Captain', 'Night Assailant',
  'Vampire Lord', 'Creature Swap', 'Emergency Provisions', 'Level Limit - Area B', 'Nobleman of Crossout', 'Reinforcement of the Army',
  'Upstart Goblin', 'Good Goblin Housekeeping', 'Gravity Bind', 'Last Turn'];
export const GOAT_BANLIST = new Map<string, 0 | 1 | 2>([
  ...GOAT_FORBIDDEN.map(n => [n.toLowerCase(), 0] as const), ...GOAT_LIMITED.map(n => [n.toLowerCase(), 1] as const),
  ...GOAT_SEMI_LIMITED.map(n => [n.toLowerCase(), 2] as const),
]);
