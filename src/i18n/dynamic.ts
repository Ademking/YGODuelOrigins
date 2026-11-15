// Interface strings the code builds at runtime (t(variable)), so the key scanner cannot find them in a t('…') call.
// The translation test checks every locale has these too.
import { OPPONENTS } from '../data/decks';

const RACES = ['Dragon', 'Spellcaster', 'Warrior', 'Beast', 'Beast-Warrior', 'Fiend', 'Zombie', 'Machine', 'Aqua', 'Pyro', 'Rock',
  'Winged Beast', 'Insect', 'Plant', 'Fairy', 'Thunder', 'Dinosaur', 'Reptile', 'Sea Serpent', 'Fish', 'Divine-Beast', 'Psychic',
  'Creator God', 'Wyrm', 'Cyberse', 'Illusion'];
const PILES = ['Graveyard', 'Banished', 'Fusion Deck'];

export const DYNAMIC_KEYS: string[] = [
  ...RACES,
  // card types (catalog.typeLine) and Deck Builder filters
  'Normal', 'Effect', 'Fusion', 'Ritual', 'Gemini', 'Union', 'Spirit', 'Toon', 'Quick-Play', 'Continuous', 'Equip', 'Field', 'Counter Trap Card',
  'Any', 'Name', 'ATK', 'DEF', 'Level', 'Type', 'All', 'Monster', 'Spell', 'Trap',
  // phases, attributes, OCGCore idle actions, zones
  'Draw Phase', 'Standby Phase', 'Main Phase 1', 'Battle Phase', 'Main Phase 2', 'End Phase',
  'Earth', 'Water', 'Fire', 'Wind', 'Light', 'Dark', 'Divine',
  'Summon', 'Special Summon', 'Change position', 'Set monster', 'Set Spell/Trap', 'Activate', 'Spell/Trap',
  'Rock', 'Paper', 'Scissors', 'Trending',
  // pile viewer headings
  ...PILES.flatMap((pile) => [`Your ${pile} ({n})`, `Opponent's ${pile} ({n})`, `{player}'s ${pile} ({n})`]),
  // duel emotes
  'Hello!', 'Nice play!', 'Hmm…', 'Wow!', 'Oops!', 'On fire!', 'Good game!',
  // CPU duelists' titles and deck styles
  ...new Set(OPPONENTS.flatMap((opponent) => [opponent.title, opponent.style]).filter(Boolean)),
];
