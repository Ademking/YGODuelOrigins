import { getCard } from '../data/cards';
import { Duel } from './duel';
import type { Side } from './types';

export interface DebugSetup {
  hand: string[];
  monsters: string[];
  traps: string[];
  opponentMonsters: string[];
  extra: string[];
}

export function prepareDebugDuel(duel: Duel, setup: DebugSetup) {
  const add = (id: string, side: Side) => {
    const card = duel.mkCard(getCard(id), side, 'hand');
    duel.players[side].hand.push(card);
    return card;
  };
  for (const id of setup.hand) add(id, 0);
  for (const [side, ids] of [[0, setup.monsters], [1, setup.opponentMonsters]] as const) {
    for (const id of ids) {
      const card = add(id, side);
      if (!duel.placeMonster(card, side, true, 'atk')) throw new Error('No free monster zone');
      card.turnIn = card.summonedTurn = 0;
    }
  }
  for (const id of setup.traps) {
    const card = add(id, 0);
    if (!duel.placeST(card, 0, false)) throw new Error('No free Spell & Trap Zone');
    card.turnIn = 0;
  }
  for (const id of setup.extra) {
    const card = duel.mkCard(getCard(id), 0, 'extra');
    card.faceUp = true;
    duel.players[0].extra.push(card);
  }
  duel.listens ||= duel.allCards().some((card) => card.def.effects?.some((effect) => effect.when));
}
