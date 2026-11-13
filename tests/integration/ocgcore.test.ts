import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import createCore, { OcgMessageType, OcgResponseType, SelectIdleCMDAction } from 'ocgcore-wasm';
import { OPPONENTS } from '../../src/data/decks';
import { cardCatalog, effectDescription, type Bundle } from '../../src/ocgcore/data';
import { cpuChoice, decision } from '../../src/ocgcore/choices';
import { openDuel } from '../../src/ocgcore/session';

const readBundle = (): Bundle => JSON.parse(gunzipSync(readFileSync('assets/ocgcore/data.json.gz')).toString('utf8'));

test('OCGCore choices show coin calls and card effect descriptions in response order', () => {
  const bundle = readBundle();
  const { rows } = cardCatalog(bundle);
  const describe = (id: bigint) => effectDescription(id, rows, bundle.systemStrings);
  const choose = (options: bigint[]) => decision({ type: OcgMessageType.SELECT_OPTION, player: 0, options }, String, describe);
  const coin = choose([60n, 61n]);
  assert.equal(coin.title, 'Call the coin toss');
  assert.deepEqual(coin.choices.map(choice => choice.label), ['Heads', 'Tails']);
  const card = [...rows.values()].find(row => row.str1?.trim() && row.str2?.trim() && row.str1 !== row.str2);
  assert.ok(card);
  const id = BigInt(card.id) << 20n;
  const effects = choose([id | 1n, id]);
  assert.deepEqual(effects.choices.map(choice => choice.label), [card.str2!.trim(), card.str1!.trim()]);
  assert.deepEqual(effects.choices.map(choice => choice.response), [
    { type: OcgResponseType.SELECT_OPTION, index: 0 },
    { type: OcgResponseType.SELECT_OPTION, index: 1 },
  ]);
});

test('OCGCore uses classic opening draws and resolves a Lua Spell', async () => {
  const bundle = readBundle();
  const core = await createCore({ sync: true });
  const pot = 55144522;
  const duel = openDuel(core, bundle, [Array(15).fill(pot), Array(15).fill(pot)], [[], []], 4000, [1n, 2n, 3n, 4n]);
  try {
    let opening = duel.advance();
    while (opening.prompt?.type === OcgMessageType.SELECT_CHAIN && !opening.prompt.forced) {
      duel.respond({ type: OcgResponseType.SELECT_CHAIN, index: null });
      opening = duel.advance();
    }
    assert.equal(opening.prompt?.type, OcgMessageType.SELECT_IDLECMD);
    assert.equal(duel.field().players[0].hand_size, 6);
    assert.equal(duel.field().players[1].hand_size, 5);
    const action = decision(opening.prompt!, code => String(code)).choices.find(x =>
      x.response.type === OcgResponseType.SELECT_IDLECMD && x.response.action === SelectIdleCMDAction.SELECT_ACTIVATE);
    assert.ok(action);
    duel.respond(action.response);
    let next = duel.advance();
    const messages = [...next.messages];
    while (next.prompt && (next.prompt.type === OcgMessageType.SELECT_PLACE || next.prompt.type === OcgMessageType.SELECT_CHAIN && !next.prompt.forced)) {
      duel.respond(cpuChoice(decision(next.prompt, String)));
      next = duel.advance();
      messages.push(...next.messages);
    }
    assert.ok(messages.some(m => m.type === OcgMessageType.DRAW && m.drawn.length === 2));
    assert.equal(duel.field().players[0].hand_size, 7);
  } finally { duel.close(); }
});

test('every premade opponent completes an OCGCore CPU duel', async () => {
  const bundle = readBundle();
  const core = await createCore({ sync: true });
  const { codeFor } = cardCatalog(bundle);
  for (const [i, opponent] of OPPONENTS.entries()) {
    const rival = OPPONENTS[(i * 3 + 5) % OPPONENTS.length];
    const main: [number[], number[]] = [opponent.deck.main.map(codeFor), rival.deck.main.map(codeFor)];
    const extra: [number[], number[]] = [opponent.deck.extra.map(codeFor), rival.deck.extra.map(codeFor)];
    const duel = openDuel(core, bundle, main, extra, 8000, [1n, 2n, 3n, 4n]);
    try {
      let finished = false;
      for (let step = 0; step < 5000; step++) {
        const next = duel.advance();
        if (next.ended) { finished = true; break; }
        assert.ok(next.prompt, opponent.name);
        duel.respond(cpuChoice(decision(next.prompt, code => duel.rows.get(code)?.name ?? String(code))));
      }
      assert.ok(finished, opponent.name);
    } finally { duel.close(); }
  }
});

test('the original board adapter receives turns, draws and legal Phaser actions', async () => {
  const { OcgDuel, SURRENDER } = await import('../../src/ocgcore/duel');
  const bundle = readBundle();
  const core = await createCore({ sync: true });
  const yugi = OPPONENTS[0].deck;
  const kaiba = OPPONENTS[1].deck;
  const events: string[] = [];
  let turns = 0;
  const duel = new OcgDuel([yugi, kaiba], ['You', 'Kaiba'], async prompt => {
    if (prompt.t === 'main') {
      turns++;
      const action = prompt.actions.find(a => a.a === 'summon') ?? prompt.actions.find(a => a.a === 'sset');
      if (turns === 1 && action && 'card' in action) return { ...action, slot: 2 };
      if (turns >= 2) return SURRENDER;
      return prompt.actions.find(a => a.a === 'phase');
    }
    if (prompt.t === 'chain') return null;
    if (prompt.t === 'option') return 0;
    throw new Error(`Unexpected prompt ${prompt.t}`);
  }, event => { events.push(event.t); }, 4000, 0, 0);
  await duel.run(core, bundle, undefined, 0);
  assert.ok(turns >= 2);
  assert.ok(events.includes('turn'));
  assert.ok(events.includes('draw'));
  assert.ok(events.includes('end'));
  assert.equal(duel.players[0].lp, 4000);
  assert.equal(duel.players[1].hand.length, 5);
  assert.ok(duel.players[1].hand.every(card => card.def.id === ''));
});
