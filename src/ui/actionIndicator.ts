import type { Action } from '../engine/duel';

export function actionIndicator(actions: Action[]): 'activate' | 'set' | null {
  if (actions.some((action) => action.a === 'act')) return 'activate';
  if (actions.length && actions.every((action) => action.a === 'sset' || action.a === 'mset')) return 'set';
  return null;
}
