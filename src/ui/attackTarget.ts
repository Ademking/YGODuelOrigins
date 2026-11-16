import type { Card } from '../engine/duel';
import { t } from '../i18n';
import { cardName } from '../i18n/cards';

export function attackTargetLabel(target: Card | null): string {
  if (!target) return t('Direct Attack');
  const name = target.faceUp ? cardName(target.def) : t('Face-down monster');
  return t('Attack {card} (Zone {n})', { card: name, n: target.slot + 1 });
}
