import type { CardDef } from '../engine/types';
import { SOURCE_CARDS, SOURCE_TOKENS } from './sourceCards';
import { CARD_EFFECTS } from './cardEffects';
import { YGO_CATALOG } from './ygoCatalog';
import { GOD_CARDS } from './godCards';

export const CARDS: CardDef[] = [...SOURCE_CARDS.map(source => ({ ...source, ...CARD_EFFECTS[source.name] })), ...GOD_CARDS];

for (const card of CARDS) {
  if (card.kind === 'monster') continue;
  card.effects ??= [];
  if (!card.effects.some(effect => effect.type === 'activate')) {
    card.effects.unshift(card.equip
      ? { type: 'activate', targets: [{ f: card.equip.f ?? { side: 'any', zone: 'mzone', faceUp: true }, good: (card.equip.atk ?? 0) >= 0 }], ops: [{ op: 'equip' }] }
      : { type: 'activate', ops: [] });
  }
}

export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map(card => [card.id, card]));

/** Monster Tokens created by card effects; never part of a Deck. */
export const TOKENS: Record<string, CardDef> = Object.fromEntries(YGO_CATALOG.filter(c => c.kind === 'monster' && / Token$/.test(c.name)).map(c => [c.name, {
  id: `ygo_${c.code}`, name: c.name, kind: 'monster', art: '', text: c.desc, mtype: 'normal', attr: c.attribute as CardDef['attr'], race: c.race as CardDef['race'],
  lv: c.level, atk: c.atk, def: c.def, token: true, rules: c.name === 'Sheep Token' || c.name === 'Kuriboh Token' ? ['noTributeSummon'] : undefined,
} satisfies CardDef]));
for (const t of SOURCE_TOKENS) TOKENS[t.name] ??= t;
if (TOKENS['Ojama Token']) TOKENS['Ojama Token'] = {
  ...TOKENS['Ojama Token'],
  rules: [...(TOKENS['Ojama Token'].rules ?? []), 'noTribute'],
  onTokenDestroyed: async (duel, card, controller) => { await duel.damage(controller, 300, card); },
};
export const getToken = (name: string): CardDef => {
  const t = TOKENS[name];
  if (!t) throw new Error(`Unknown token ${name}`);
  return t;
};
export const getCard = (id: string): CardDef => {
  const card = CARD_MAP[id];
  if (!card) throw new Error(`Unknown card ${id}`);
  return card;
};
export const isExtraDeckCard = (card: CardDef) => card.mtype === 'fusion';
export const copyLimit = (card: CardDef) => card.limit ?? 3;

export function typeLine(card: CardDef): string {
  if (card.kind === 'monster') {
    const sub = card.ability ?? (card.mtype === 'normal' ? '' : card.mtype!);
    const subtype = sub ? `/${sub[0].toUpperCase()}${sub.slice(1)}` : '';
    return `[${card.race}${subtype}]`;
  }
  const subtype = card.stype === 'normal' ? '' : ` (${card.stype === 'quick' ? 'Quick-Play' : card.stype![0].toUpperCase() + card.stype!.slice(1)})`;
  return `${card.kind === 'spell' ? 'Spell' : 'Trap'} Card${subtype}`;
}
