import type { Action, Card, Prompt } from '../engine/duel';
import type { Side } from '../engine/types';

export function extraDeckActions(card: Card, viewer: Side, prompt: Prompt | null): Action[] {
  if (card.zone !== 'extra' || card.owner !== viewer || prompt?.t !== 'main') return [];
  return prompt.actions.filter((action) => action.a === 'ss' && action.card === card);
}
