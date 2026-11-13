import {
  OcgDuelMode, OcgLocation, OcgMessageType, OcgPosition, OcgProcessResult, OcgQueryFlags,
  type OcgCoreSync, type OcgMessage, type OcgResponse,
} from 'ocgcore-wasm';
import type { DebugSetup } from '../engine/debug';
import { cardCatalog, cardData, type Bundle } from './data';

export function openDuel(core: OcgCoreSync, bundle: Bundle, decks: [number[], number[]], extra: [number[], number[]],
  startingLP: number, seed: [bigint, bigint, bigint, bigint], debug?: DebugSetup & { codeFor: (id: string) => number }) {
  const { rows } = cardCatalog(bundle);
  const team = { startingLP, startingDrawCount: debug ? 0 : 5, drawCountPerTurn: 1 };
  const errors: string[] = [];
  const handle = core.createDuel({
    flags: OcgDuelMode.MODE_GOAT, seed, team1: team, team2: team,
    cardReader: (code) => {
      const row = rows.get(code);
      if (!row) errors.push(`Unknown Project Ignis card ${code}`);
      return row ? cardData(row) : null;
    },
    scriptReader: name => bundle.scripts[name] ?? null,
    errorHandler: (_type, message) => errors.push(message),
  });
  if (!handle) throw new Error('OCGCore could not create the duel.');
  const failIfErrors = () => {
    if (errors.length) throw new Error(errors.join('\n'));
  };
  try {
    for (const name of ['constant.lua', 'utility.lua']) {
      const source = bundle.scripts[name];
      if (!source || !core.loadScript(handle, name, source)) throw new Error(`Cannot load ${name}`);
    }
    for (const player of [0, 1] as const) {
      for (const [cards, location] of [[decks[player], OcgLocation.DECK], [extra[player], OcgLocation.EXTRA]] as const) {
        for (const code of cards) core.duelNewCard(handle, {
          team: player, duelist: 0, controller: player, code, location,
          sequence: 0, position: OcgPosition.FACEDOWN_DEFENSE,
        });
      }
    }
    if (debug) {
      for (const [controller, location, position, ids] of [
        [0, OcgLocation.HAND, OcgPosition.FACEDOWN_DEFENSE, debug.hand],
        [0, OcgLocation.MZONE, OcgPosition.FACEUP_ATTACK, debug.monsters],
        [1, OcgLocation.MZONE, OcgPosition.FACEUP_ATTACK, debug.opponentMonsters],
        [0, OcgLocation.SZONE, OcgPosition.FACEDOWN_DEFENSE, debug.traps],
        [0, OcgLocation.EXTRA, OcgPosition.FACEDOWN_DEFENSE, debug.extra],
      ] as const) {
        ids.forEach((id, sequence) => core.duelNewCard(handle, { team: controller, duelist: 0, controller,
          code: debug.codeFor(id), location, sequence, position }));
      }
    }
    core.startDuel(handle);
    failIfErrors();
  } catch (error) {
    core.destroyDuel(handle);
    throw error;
  }
  let closed = false;
  let pending = false;
  return {
    rows,
    advance() {
      if (closed || pending) throw new Error('OCGCore duel is closed or waiting for input.');
      const messages: OcgMessage[] = [];
      for (let step = 0; step < 10000; step++) {
        const status = core.duelProcess(handle);
        messages.push(...core.duelGetMessage(handle));
        failIfErrors();
        if (messages.some(message => message.type === OcgMessageType.RETRY)) {
          throw new Error('OCGCore rejected the selection. Restart the duel to try again.');
        }
        const win = messages.find(message => message.type === OcgMessageType.WIN);
        if (win || status === OcgProcessResult.END) return { messages, win, ended: true };
        if (status === OcgProcessResult.WAITING) {
          const prompt = messages[messages.length - 1];
          if (!prompt || !('player' in prompt)) throw new Error('OCGCore is waiting without a player prompt.');
          pending = true;
          return { messages, prompt, ended: false };
        }
      }
      throw new Error('OCGCore exceeded the step limit.');
    },
    respond(response: OcgResponse) {
      if (closed || !pending) throw new Error('No pending OCGCore prompt.');
      core.duelSetResponse(handle, response);
      pending = false;
    },
    field: () => core.duelQueryField(handle),
    cards: (controller: 0 | 1, location: OcgLocation) => core.duelQueryLocation(handle, {
      controller, location,
      flags: (OcgQueryFlags.CODE | OcgQueryFlags.POSITION | OcgQueryFlags.ATTACK | OcgQueryFlags.DEFENSE | OcgQueryFlags.IS_PUBLIC | OcgQueryFlags.OWNER) as OcgQueryFlags,
    }),
    close() {
      if (closed) return;
      closed = true;
      core.destroyDuel(handle);
    },
  };
}
