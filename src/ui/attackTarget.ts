import type { Card } from '../engine/duel';

export function attackTargetLabel(target: Card | null): string {
  if (!target) return 'Direct Attack';
  const name = target.faceUp ? target.def.name : 'Face-down monster';
  return `Attack ${name} (Zone ${target.slot + 1})`;
}
