// CPU duels on OCGCore through the real board adapter (src/ocgcore/duel.ts), with side 0 played by a "human" that
// picks random legal answers through the same prompts the duel screen gets. Any exception, such as the core
// rejecting a response, fails the run.
// Usage: npm run fuzz:ocgcore -- [duels=100] [seed=1] [opponent name filter]. FUZZ_ONLY=<index> replays one duel and
// prints every prompt, answer and card message.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import createCore from 'ocgcore-wasm';
import { OPPONENTS } from '../src/data/decks';
import type { Bundle } from '../src/ocgcore/data';
import { OcgDuel, SURRENDER } from '../src/ocgcore/duel';
import type { Card, Prompt } from '../src/engine/duel';
import { mulberry } from './helpers';

const N = Number(process.argv[2] ?? 100);
const SEED = Number(process.argv[3] ?? 1);
const FILTER = process.argv[4]?.toLowerCase();
const bundle: Bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/duel.json.gz')).toString('utf8'));
const core = await createCore({ sync: true });
const rivals = OPPONENTS.filter(o => !FILTER || o.name.toLowerCase().includes(FILTER));

/** A human clicking at random among the answers the duel screen offers. */
function randomHuman(rng: () => number) {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)];
  let prompts = 0;
  return async (p: Prompt): Promise<unknown> => {
    if (++prompts > 4000) return SURRENDER;
    switch (p.t) {
      case 'main': {
        const phases = p.actions.filter(a => a.a === 'phase');
        return rng() < 0.35 && phases.length ? pick(phases) : pick(p.actions);
      }
      case 'chain': return rng() < 0.5 || !p.actions.length ? null : pick(p.actions);
      case 'select': {
        if (p.max === 0) return [];
        if (p.cancel && rng() < 0.1) return null;
        const most = Math.min(p.max, p.cards.length);
        for (let tries = 0; tries < 50; tries++) {
          const size = p.min + Math.floor(rng() * (most - p.min + 1));
          const pool = [...p.cards];
          const chosen: Card[] = [];
          while (chosen.length < size && pool.length) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
          if (!p.validate || p.validate(chosen)) return chosen;
        }
        // every subset, smallest first (selections are short)
        if (p.cards.length <= 14) {
          const subsets = Array.from({ length: 1 << p.cards.length }, (_, mask) => p.cards.filter((_, i) => mask & (1 << i)))
            .filter(c => c.length >= p.min && c.length <= most).sort((a, b) => a.length - b.length);
          const found = subsets.find(c => !p.validate || p.validate(c));
          if (found) return found;
        }
        return p.cancel ? null : p.cards.slice(0, p.min);
      }
      case 'yesno': return rng() < 0.5;
      case 'option': return Math.floor(rng() * p.options.length);
      case 'position': return rng() < 0.5 ? 'atk' : 'def';
      case 'zones': {
        const indices = p.zones.map((_, i) => i);
        const chosen: number[] = [];
        while (chosen.length < p.count) chosen.push(indices.splice(Math.floor(rng() * indices.length), 1)[0]);
        return chosen;
      }
      case 'announce': return pick(p.cards).code;
      case 'replay': return rng() < 0.2 ? false : pick(p.targets);
    }
  };
}

const failures: string[] = [];
let turns = 0;
const endings: Record<string, number> = {};
const ONLY = process.env.FUZZ_ONLY === undefined ? undefined : Number(process.env.FUZZ_ONLY);
for (let i = 0; i < N; i++) {
  if (ONLY !== undefined && i !== ONLY) continue;
  const seed = SEED * 100000 + i;
  const rng = mulberry(seed);
  const human = OPPONENTS[Math.floor(rng() * OPPONENTS.length)];
  const rival = rivals[Math.floor(rng() * rivals.length)];
  const log: string[] = [];
  const ask = randomHuman(rng);
  const duel = new OcgDuel([human.deck, rival.deck], ['You', rival.name], p => ask(p), event => {
    if (event.t === 'log') log.push(event.text);
    if (event.t === 'end') endings[event.reason] = (endings[event.reason] ?? 0) + 1;
  }, 8000, 0, 0);
  if (ONLY !== undefined) {
    // debugging one duel: print every prompt the core sends and the answer given
    const internals = duel as unknown as { answer: (m: unknown) => Promise<unknown> };
    const answer = internals.answer.bind(duel);
    internals.answer = async m => {
      const r = await answer(m);
      console.log('PROMPT', JSON.stringify(m, (_k, v) => typeof v === 'bigint' ? String(v) : v), '\n  ANSWER', JSON.stringify(r));
      return r;
    };
    const update = (duel as unknown as { update: (m: { type: number; code?: number }) => Promise<void> }).update.bind(duel);
    (duel as unknown as { update: (m: { type: number; code?: number }) => Promise<void> }).update = async m => {
      if ('code' in m) console.log('MSG', JSON.stringify(m, (_k, v) => typeof v === 'bigint' ? String(v) : v));
      return update(m);
    };
  }
  duel.onRejected = info => failures.push(`seed ${seed}: ${human.name} vs ${rival.name}: rejected ${info.human ? 'human' : 'CPU'} answer to ${info.prompt} ${JSON.stringify(info.response, (_k, v) => typeof v === 'bigint' ? String(v) : v)}\n    ${log.slice(-14).join('\n    ')}`);
  const coreSeed = [1, 2, 3, 4].map(n => String((seed * 7919 + n) >>> 0)) as [string, string, string, string];
  try {
    await duel.run(core, bundle, undefined, (i % 2) as 0 | 1, { seed: coreSeed, exchange: (_m, _local, answer) => answer() });
    turns += duel.turn;
  } catch (error) {
    failures.push(`seed ${seed}: ${human.name} (random human) vs ${rival.name}: ${(error as Error).message}\n    ${log.slice(-14).join('\n    ')}`);
  }
}
console.log(`${N} OCGCore duels, avg ${(turns / N).toFixed(1)} turns, endings ${JSON.stringify(endings)}; ${failures.length} problems`);
for (const failure of failures) console.log(failure);
if (failures.length) process.exitCode = 1;
