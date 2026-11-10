// Machine-readable effect coverage for every card in the imported catalog: coverage/effects.json.
// Run after the tests (npm run coverage) so smoke/fuzz exercise data is included.
import fs from 'node:fs';
import path from 'node:path';
import { YGO_CATALOG } from '../src/data/ygoCatalog';
import { CARDS } from '../src/data/cards';
import { CARD_EFFECTS, ORIGINAL_EFFECT_NAMES } from '../src/data/cardEffects';
import type { CardDef } from '../src/engine/types';

/** Known, deliberate deviations from the printed text. Everything not listed follows the text as written. */
const NOTES: Record<string, string> = {
  'Bait Doll': 'The forced Trap resolves immediately, outside the chain.',
  'Kotodama': 'Destroys a later-summoned duplicate; two copies summoned simultaneously are not both destroyed.',
  'Prohibition': 'The name is declared from the cards present in this duel (both Decks), not the whole card list.',
  'Magic-Arm Shield': "Implements the catalog text: the opponent's monster becomes the attack target without changing control.",
  'Big Eye': 'Reordering is done by choosing the cards one at a time, top first.',
  'Bright Castle': 'Implemented as an Equip Spell for a LIGHT monster (+700 ATK); the catalog text is an abbreviation.',
  'Mystical Refpanel': 'Applies to Spells whose effects all name a single player (burn, heal, draw, discard, mill).',
  'Fake Trap': 'Protects your Traps from destroy effects that target or sweep them; destruction done by bespoke scripts is not detected.',
  'Kunai with Chain': 'Choose one of its two effects, as in the OCG ruling.',
  'Curse of Fiend': 'Only face-up monsters change position.',
  'Steel Scorpion': "Destroyed at the End Phase of the opponent's second own turn after the attack (4 turns later).",
  'Imperial Order': 'Negated Spells cannot be activated at all (rather than activating with no effect).',
  'Royal Decree': 'Negated Traps cannot be activated at all (rather than activating with no effect).',
  'Jinzo': 'Traps cannot be activated and face-up Traps are negated, as printed.',
  'Exchange': 'The taken card is temporarily owned by the taker and goes to its original owner\'s Graveyard.',
  'Graverobber': 'The stolen Spell returns to its owner\'s Graveyard at the End Phase if unused.',
  'Lightforce Sword': "Returns in the Standby Phase of the opponent's 4th turn after activation.",
  'Dark Spirit of the Silent': 'The new attacker attacks the original target.',
  'Shift': 'A link "targets 1 monster" when exactly one monster is among its targets.',
  "Fairy's Hand Mirror": 'A link "targets 1 monster" when exactly one monster is among its targets.',
  'Riryoku Field': 'A link "targets 1 monster" when exactly one monster is among its targets.',
  'Spear Cretin': 'Only when sent from the field after it was flipped.',
  'Cocoon of Evolution': "Turn counts are the controller's Standby Phases while Cocoon is equipped.",
  // YGO Online pool (behaviour reference: Fluorohydride/ygopro-scripts)
  'Ancient Gear Castle': 'Counters and the ATK boost are implemented; using the counters as Tribute substitutes is not.',
  'Colosseum - Cage of the Gladiator Beasts': 'Discarding a copy to prevent its destruction is not implemented.',
  'Second Coin Toss': 'No effect: coin tosses cannot be redone.',
  'Convulsion of Nature': 'No gameplay effect: Decks are not shown face-up.',
  'Arcana Force VI - The Lovers': 'Heads (count as 2 Tributes) is not implemented; Tails is.',
  'Simorgh, Bird of Ancestry': 'WIND monsters do not need 1 less Tribute; the bounce on a WIND-only Tribute Summon is implemented.',
  'Dark Effigy': 'Not implemented: counting as 2 Tributes for a DARK Normal Monster.',
  'Maiden of the Aqua': 'Not implemented: the field is not treated as "Umi".',
  'Elemental Mistress Doriado': 'Not implemented: it keeps only its printed Attribute.',
  'Ritual Raven': 'Not implemented: cannot be the entire Tribute for a DARK Ritual Monster.',
  'Toy Magician': 'Only the Flip Summon effect; it cannot be Set as a Spell Card.',
  'Neo-Spacian Dark Panther': "Copies the selected monster's name, not its effects.",
  'Phantom of Chaos': "Copies the banished monster's name and ATK, not its effects.",
  'Great Shogun Shien': 'Destroys another Six Samurai instead only for battle destruction.',
  'Armament of the Lethal Lords': 'Winning the Match by direct attack is a normal duel win.',
  'Chimaera, the Master of Beasts': 'Winning the Match by direct attack is a normal duel win.',
  'Emperor of Lightning': 'Winning the Match by direct attack is a normal duel win.',
  'King of Destruction - Xexex': 'Winning the Match by direct attack is a normal duel win.',
  'Meteo the Matchless': 'Winning the Match by direct attack is a normal duel win.',
  'Queen of Fate - Eternia': 'Winning the Match by direct attack is a normal duel win.',
  'Testament of the Arcane Lords': 'Winning the Match by direct attack is a normal duel win.',
  'Ulevo': 'Winning the Match by direct attack is a normal duel win.',
  'Victory Dragon': 'Winning the Match by direct attack is a normal duel win.',
  'Berserk Gorilla': 'It is not forced to attack.',
  'Evil Hero Malicious Fiend': "Opponent's monsters are not forced into Attack Position or to attack.",
  'Pyro Clock of Destiny': 'Advances the turn counter used for turn-limited effects.',
};

const tests = fs.readdirSync('tests', { recursive: true }).filter((f) => String(f).endsWith('.test.ts')).map((f) => fs.readFileSync(path.join('tests', String(f)), 'utf8')).join('\n');
const readSet = (f: string) => { try { return new Set<string>(JSON.parse(fs.readFileSync(f, 'utf8'))); } catch { return new Set<string>(); } };
const fuzz = readSet('coverage/exercised.json');
const smoke = readSet('coverage/smoke.json');
const playable = new Map(CARDS.map((c) => [c.name, c]));
const original = new Set(ORIGINAL_EFFECT_NAMES);

const fnHooks: (keyof CardDef)[] = ['statFn', 'auraFn', 'lock', 'negateFn', 'immune', 'protect', 'raceFn', 'attrFn', 'onSummon', 'preBattle', 'postBattle', 'battleDmg', 'winCheck', 'selfDestructIf', 'reveals', 'battleSub', 'onTargeted', 'ruleIf', 'summonCond', 'tributes', 'attackCond', 'onResolve', 'onDamage', 'onMove', 'gyOnMove', 'afterBattle', 'lvFn', 'gyAuraFn', 'extraAttacks', 'doubleTribute'];
function implementation(c: CardDef): string {
  if (c.kind === 'monster' && c.mtype === 'normal') return 'vanilla';
  if (!CARD_EFFECTS[c.name]) return c.mtype === 'fusion' ? 'vanilla-fusion' : 'none';
  const e = CARD_EFFECTS[c.name];
  if (c.mtype === 'ritual' && Object.keys(e).length === 0) return 'vanilla-ritual';
  if (original.has(c.name)) return 'data-ops';
  const scripted = fnHooks.some((k) => e[k]) || e.effects?.some((x) => x.ops.some((o) => o.op === 'run') || x.cost?.some((o) => o.op === 'run') || x.when || x.cond) || e.equip?.fn;
  return scripted ? 'script' : 'data-ops';
}
function behaves(c: CardDef) {
  if (c.kind === 'monster') return true;
  return !!(c.effects?.some((e) => e.ops.length || e.type !== 'activate' || e.cond || e.cost?.length) || c.equip || c.aura || c.rules || c.stays || c.upkeep || c.lifetime || fnHooks.some((k) => c[k]));
}

const seen = new Set<string>();
const cards = [];
const ONLINE: typeof YGO_CATALOG = JSON.parse(fs.readFileSync('game-data/online-cards.json', 'utf8'));
for (const raw of [...YGO_CATALOG, ...ONLINE]) {
  if (seen.has(raw.name)) continue;
  seen.add(raw.name);
  const def = playable.get(raw.name);
  const base = { name: raw.name, code: raw.code, passcode: raw.passcode || null, kind: raw.kind, type: raw.monsterType ?? raw.spellType ?? raw.trapType };
  if (!def) {
    let reason = 'No implementation.';
    if (/ Token$/.test(raw.name)) reason = 'Token: created by card effects (Scapegoat, Multiply, Jam Breeding Machine, Insect Queen), never part of a Deck.';
    else if (raw.attribute === 'DIVINE' || raw.race === 'Divine-Beast' || raw.race === 'Unknown' || (!raw.passcode && raw.kind === 'monster' && raw.monsterType === 'normal'))
      reason = 'Unobtainable placeholder in the game data (Egyptian God / promotional entry) with no rules text and no card image.';
    else if (raw.monsterType === 'fusion') reason = 'Fusion Monster whose materials are not available in the catalog.';
    cards.push({ ...base, status: 'excluded', reason });
    continue;
  }
  const impl = implementation(def);
  const verified = [tests.includes(`'${raw.name}'`) || tests.includes(`"${raw.name}"`) ? 'unit' : '', smoke.has(raw.name) ? 'smoke' : '', fuzz.has(raw.name) ? 'fuzz' : ''].filter(Boolean);
  const ok = impl !== 'none' && behaves(def);
  cards.push({
    ...base, id: def.id, status: ok ? 'supported' : 'unsupported', implementation: impl, verified,
    ...(ok ? {} : { reason: 'Spell/Trap without an implemented effect.' }), ...(NOTES[raw.name] ? { note: NOTES[raw.name] } : {}),
  });
}
const count = (pred: (c: (typeof cards)[number]) => boolean) => cards.filter(pred).length;
const effectful = cards.filter((c) => c.status === 'supported' && !String((c as { implementation?: string }).implementation).startsWith('vanilla'));
const summary = {
  catalogNames: cards.length,
  supported: count((c) => c.status === 'supported'),
  unsupported: count((c) => c.status === 'unsupported'),
  excluded: count((c) => c.status === 'excluded'),
  effectCards: effectful.length,
  effectCardsUnitTested: effectful.filter((c) => (c as { verified: string[] }).verified.includes('unit')).length,
  effectCardsExercised: effectful.filter((c) => (c as { verified: string[] }).verified.length > 0).length,
  withNotes: count((c) => 'note' in c),
};
fs.mkdirSync('coverage', { recursive: true });
fs.writeFileSync('coverage/effects.json', JSON.stringify({ generated: new Date().toISOString(), summary, cards }, null, 1));
console.log(summary);
for (const c of cards.filter((c) => c.status !== 'supported')) console.log(`${c.status}: ${c.name} - ${(c as { reason?: string }).reason}`);
