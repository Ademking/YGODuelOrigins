/**
 * April 2005 TCG "GOAT" Forbidden & Limited list (from Project Ignis LFLists GOAT.lflist.conf), matching the engine's
 * MODE_GOAT rules. Only the 0/1/2 entries apply; cards newer than the format stay at 3 so the game's later cards remain usable.
 * Keyed by lowercase card name because the source mixes alternate passcodes.
 */
export const BANLIST_NAME = 'GOAT (April 2005)';
const FORBIDDEN = ['Chaos Emperor Dragon - Envoy of the End', 'Fiber Jar', 'Magical Scientist', 'Makyura the Destructor', 'Witch of the Black Forest',
  'Yata-Garasu', 'Butterfly Dagger - Elma', 'Change of Heart', 'Confiscation', 'Dark Hole', "Harpie's Feather Duster", 'Mirage of Nightmare',
  'Monster Reborn', 'Painful Choice', 'Raigeki', 'The Forceful Sentry', 'Imperial Order'];
const LIMITED = ['Black Luster Soldier - Envoy of the Beginning', 'Breaker the Magical Warrior', 'Cyber Jar', 'D.D. Warrior Lady', 'Dark Magician of Chaos',
  'Exiled Force', 'Exodia the Forbidden One', 'Injection Fairy Lily', 'Jinzo', 'Left Arm of the Forbidden One', 'Left Leg of the Forbidden One',
  'Morphing Jar', 'Protector of the Sanctuary', 'Reflect Bounder', 'Right Arm of the Forbidden One', 'Right Leg of the Forbidden One',
  'Sacred Phoenix of Nephthys', 'Sangan', 'Sinister Serpent', 'Tribe-Infecting Virus', 'Twin-Headed Behemoth', 'Card Destruction', 'Delinquent Duo',
  'Graceful Charity', 'Heavy Storm', 'Lightning Vortex', 'Mage Power', 'Mystical Space Typhoon', 'Pot of Greed', 'Premature Burial', 'Snatch Steal',
  'Swords of Revealing Light', 'United We Stand', 'Call of the Haunted', 'Ceasefire', 'Deck Devastation Virus', 'Magic Cylinder', 'Mirror Force',
  'Reckless Greed', 'Ring of Destruction', 'Torrential Tribute'];
const SEMI_LIMITED = ['Abyss Soldier', 'Dark Scorpion - Chick the Yellow', 'Manticore of Darkness', 'Marauding Captain', 'Night Assailant',
  'Vampire Lord', 'Creature Swap', 'Emergency Provisions', 'Level Limit - Area B', 'Nobleman of Crossout', 'Reinforcement of the Army',
  'Upstart Goblin', 'Good Goblin Housekeeping', 'Gravity Bind', 'Last Turn'];
export const BANLIST = new Map<string, 0 | 1 | 2>([
  ...FORBIDDEN.map(n => [n.toLowerCase(), 0] as const), ...LIMITED.map(n => [n.toLowerCase(), 1] as const), ...SEMI_LIMITED.map(n => [n.toLowerCase(), 2] as const),
]);
