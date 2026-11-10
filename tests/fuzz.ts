// CPU vs CPU duels with random decks drawn from every playable card. Any engine exception fails the run.
// Usage: npx tsx tests/fuzz.ts [duels=150] [seed=1]. Writes the set of cards whose effects resolved to coverage/exercised.json.
import fs from 'node:fs';
import { Duel, type DeckList } from '../src/engine/duel';
import { AIController } from '../src/engine/ai';
import { CARDS, copyLimit, isExtraDeckCard } from '../src/data/cards';
import { mulberry } from './helpers';

const N = Number(process.argv[2] ?? 150);
const SEED = Number(process.argv[3] ?? 1);
const main = CARDS.filter((c) => !isExtraDeckCard(c) && copyLimit(c) > 0);
const extra = CARDS.filter(isExtraDeckCard);
const effectCards = new Set(CARDS.filter((c) => c.effects?.length || c.statFn || c.auraFn || c.lock || c.negateFn || c.onSummon || c.preBattle || c.postBattle).map((c) => c.name));

function deck(rng: () => number): DeckList {
  const pick = <T>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
  const ids: string[] = [];
  // Half the deck from effect cards so scripts are exercised often; the rest anything.
  const fx = main.filter((c) => effectCards.has(c.name));
  while (ids.length < 40) {
    const c = ids.length < 26 ? pick(fx) : pick(main);
    if (ids.filter((x) => x === c.id).length < Math.min(3, copyLimit(c))) ids.push(c.id);
  }
  // Rituals need their monster; fusions their materials sometimes. Add a few known pairs at random.
  return { main: ids, extra: Array.from({ length: 10 }, () => pick(extra).id) };
}

const exercised = new Set<string>();
const failures: string[] = [];
let turns = 0;
for (let i = 0; i < N; i++) {
  const seed = SEED * 100000 + i;
  const rng = mulberry(seed);
  const decks: [DeckList, DeckList] = [deck(rng), deck(rng)];
  let asks = 0;
  const budget = (c: AIController): AIController => { const ask = c.ask.bind(c); c.ask = (p, d, s) => { if (++asks > 30000) throw new Error(`prompt budget exceeded (${p.t})`); return ask(p, d, s); }; return c; };
  const duel = new Duel(decks, ['A', 'B'], [budget(new AIController('normal', 0, rng)), budget(new AIController('hard', 0, rng))], (e) => {
    if (e.t === 'resolve' && !e.negated) exercised.add(e.card.def.name);
  }, rng);
  try {
    await duel.run();
    turns += duel.turn;
  } catch (e) {
    failures.push(`seed ${seed} turn ${duel.turn}: ${(e as Error).stack?.split('\n').slice(0, 4).join(' | ')}\n    ${duel.logLines.slice(-12).join('\n    ')}`);
    if (failures.length >= 5) break;
  }
}
fs.mkdirSync('coverage', { recursive: true });
let prev: string[] = [];
try { prev = JSON.parse(fs.readFileSync('coverage/exercised.json', 'utf8')); } catch { /* first run */ }
fs.writeFileSync('coverage/exercised.json', JSON.stringify([...new Set([...prev, ...exercised])].sort(), null, 1));
console.log(`${N} random-deck duels, avg ${(turns / Math.max(1, N - failures.length)).toFixed(1)} turns; ${exercised.size} distinct cards resolved effects.`);
if (failures.length) { console.error(failures.join('\n\n')); process.exit(1); }
