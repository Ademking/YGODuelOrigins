// Player reports about CPU play and card rulings, each checked in a real OCGCore duel on the shipped card data.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import createCore from 'ocgcore-wasm';
import type { Bundle } from '../../src/ocgcore/data';
import { CARDS } from '../../src/ocgcore/catalog';
import type { DebugSetup } from '../../src/engine/debug';
import type { Prompt, UIEvent } from '../../src/engine/types';

const bundle: Bundle = JSON.parse(gunzipSync(readFileSync('assets/ocgcore/duel.json.gz')).toString('utf8'));
const id = (name: string) => CARDS.find(card => card.name === name)!.id;
const deckOf = (name: string) => ({ main: Array(20).fill(id(name)), extra: [] });

/**
 * Run a duel where you (side 0) go first and play by `you`, until `done` says stop or `turns` turns have passed.
 * The CPU (side 1) plays from `cpuDeck`, drawing 1 card a turn (debug duels start with empty hands).
 */
async function duel(o: {
  setup: Partial<DebugSetup>; cpuDeck: string; turns: number; lp?: number;
  you?: (prompt: Prompt, d: InstanceType<typeof import('../../src/ocgcore/duel').OcgDuel>) => unknown;
  onEvent?: (event: UIEvent, d: InstanceType<typeof import('../../src/ocgcore/duel').OcgDuel>) => void;
  done?: () => boolean;
}) {
  const { OcgDuel, SURRENDER } = await import('../../src/ocgcore/duel');
  const core = await createCore({ sync: true });
  const setup: DebugSetup = { hand: [], monsters: [], traps: [], opponentMonsters: [], extra: [], ...o.setup };
  const d: InstanceType<typeof OcgDuel> = new OcgDuel([deckOf('Blue-Eyes White Dragon'), deckOf(o.cpuDeck)], ['You', 'CPU'], async prompt => {
    if (d.turn > o.turns || o.done?.()) return SURRENDER;
    const answer = o.you?.(prompt, d);
    if (answer !== undefined) return answer;
    if (prompt.t === 'main') return prompt.actions.find(action => action.a === 'phase' && action.to === 'EP') ?? prompt.actions[0];
    if (prompt.t === 'select') return prompt.cards.slice(0, Math.max(1, prompt.min));
    return null;
  }, event => o.onEvent?.(event, d), o.lp ?? 8000, 0, 0);
  await d.run(core, bundle, setup, 0);
  return d;
}

test('Ring of Destruction works on your own turn and hits both players (2004 text)', async () => {
  const destroyed: string[] = [];
  const d = await duel({
    setup: { traps: [id('Ring of Destruction')], opponentMonsters: [id('Battle Ox')] }, cpuDeck: 'Blue-Eyes White Dragon', turns: 1,
    you: prompt => prompt.t === 'main' ? prompt.actions.find(action => action.a === 'act' && action.card.def.name === 'Ring of Destruction') : undefined,
    onEvent: event => { if (event.t === 'destroy') destroyed.push(event.card.def.name); },
    done: () => destroyed.length > 0,
  });
  assert.deepEqual(destroyed, ['Battle Ox']);
  assert.deepEqual(d.players.map(player => player.lp), [8000 - 1700, 8000 - 1700]);
});

test('Future Fusion sends the materials when it resolves and summons on your 2nd Standby Phase (original text)', async () => {
  const sent: [number, string][] = [];
  const summoned: [number, string][] = [];
  await duel({
    setup: { traps: [id('Future Fusion')], extra: [id('Blue-Eyes Ultimate Dragon')] }, cpuDeck: 'Battle Ox', turns: 5,
    you: (prompt, d) => {
      if (prompt.t === 'option') return 0; // pick the first Blue-Eyes as each material
      if (d.turn === 1 && prompt.t === 'main') return prompt.actions.find(action => action.a === 'act' && action.card.def.name === 'Future Fusion');
    },
    onEvent: (event, d) => {
      if (event.t === 'move' && event.from === 'deck' && event.to === 'gy') sent.push([d.turn, event.card.def.name]);
      if (event.t === 'summon' && event.card.def.name === 'Blue-Eyes Ultimate Dragon') summoned.push([d.turn, event.how]);
    },
    done: () => summoned.length > 0,
  });
  // activated on turn 1: the three Blue-Eyes leave the Deck at once; your 2nd Standby Phase after that is turn 5
  assert.deepEqual(sent, Array(3).fill([1, 'Blue-Eyes White Dragon']));
  assert.deepEqual(summoned, [[5, 'fusion']]);
});

test('The CPU springs Sakuretsu Armor on your attack', async () => {
  const destroyed: string[] = [];
  await duel({
    // your Blue-Eyes outclasses the CPU's Battle Ox, so the CPU keeps it home and you attack on turn 3
    setup: { monsters: [id('Blue-Eyes White Dragon')], opponentMonsters: [id('Battle Ox')], opponentTraps: [id('Sakuretsu Armor')] },
    cpuDeck: 'Blue-Eyes White Dragon', turns: 3,
    you: (prompt, d) => {
      if (prompt.t !== 'main' || d.turn !== 3) return;
      return prompt.actions.find(action => action.a === 'attack') ?? prompt.actions.find(action => action.a === 'phase' && action.to === 'BP');
    },
    onEvent: event => { if (event.t === 'destroy' && event.by === 'effect') destroyed.push(event.card.def.name); },
    done: () => destroyed.length > 0,
  });
  assert.deepEqual(destroyed, ['Blue-Eyes White Dragon']);
});

test('The CPU puts Mask of the Accursed on your monster, not its own', async () => {
  const equipped: number[] = [];
  await duel({
    setup: { monsters: [id('Battle Ox')], opponentMonsters: [id('Dark Elf')] }, cpuDeck: 'Mask of the Accursed', turns: 2,
    onEvent: event => { if (event.t === 'equip') equipped.push(event.target.ctrl); },
    done: () => equipped.length > 0,
  });
  assert.deepEqual(equipped, [0]);
});

test('The CPU does not activate a second Toon World', async () => {
  const activations: number[] = [];
  await duel({
    setup: {}, cpuDeck: 'Toon World', turns: 6,
    onEvent: (event, d) => { if (event.t === 'activate' && event.card.def.name === 'Toon World') activations.push(d.turn); },
  });
  assert.equal(activations.length, 1);
});

test('The CPU keeps Exodia pieces in its hand without Exodia Necross', async () => {
  const played: string[] = [];
  await duel({
    setup: {}, cpuDeck: 'Left Arm of the Forbidden One', turns: 6,
    onEvent: event => { if ((event.t === 'summon' || event.t === 'set') && event.card.ctrl === 1) played.push(event.card.def.name); },
  });
  assert.deepEqual(played, []);
});

test('The CPU stops paying for Messenger of Peace before its LP run low', async () => {
  let lowest = Infinity;
  const d = await duel({
    setup: {}, cpuDeck: 'Messenger of Peace', turns: 10, lp: 1250,
    onEvent: (_event, duel) => { lowest = Math.min(lowest, duel.players[1].lp); },
  });
  assert.ok(lowest > 1000, `CPU LP fell to ${lowest}`);
  assert.ok(d.players[1].gy.some(card => card.def.name === 'Messenger of Peace'), 'Messenger of Peace was let go');
});
