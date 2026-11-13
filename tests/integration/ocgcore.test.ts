import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { test } from 'node:test';
import createCore, { OcgMessageType, OcgResponseType, SelectIdleCMDAction } from 'ocgcore-wasm';
import { OPPONENTS } from '../../src/data/decks';
import { cardCatalog, type Bundle } from '../../src/ocgcore/data';
import { cpuChoice, decision } from '../../src/ocgcore/choices';
import { openDuel } from '../../src/ocgcore/session';

const readBundle = (): Bundle => JSON.parse(gunzipSync(readFileSync('assets/ocgcore/data.json.gz')).toString('utf8'));

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
