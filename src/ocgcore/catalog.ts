// Metadata for the browser deck editor. OCGCore supplies all duel behavior.
import type { CardDef } from '../engine/types';
import { SOURCE_CARDS } from '../data/sourceCards';

const specials: CardDef[] = [
  { id: 'ocg_89194033', name: 'Mystical Beast of Serket', kind: 'monster', mtype: 'effect', race: 'Fairy', attr: 'EARTH', lv: 6, atk: 2500, def: 2000, art: '',
    text: 'If you do not control "Temple of the Kings", destroy this card. Banish any monster destroyed by battle with this card. If this card destroys a monster by battle: It gains 500 ATK.' },
  { id: 'ocg_29762407', name: 'Temple of the Kings', kind: 'spell', stype: 'continuous', art: '',
    text: 'You can activate 1 Trap Card the turn it was Set. You can send 1 "Mystical Beast of Serket" in your Monster Zone and this card you control to the Graveyard; Special Summon 1 monster from your hand or Deck, or 1 Fusion Monster from your Extra Deck. You can only use each effect of "Temple of the Kings" once per turn.' },
  { id: 'god_slifer', name: 'Slifer the Sky Dragon', atk: 0, def: 0, kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '', text: 'Divine-Beast Effect Monster.' },
  { id: 'god_ra', name: 'The Winged Dragon of Ra', atk: 0, def: 0, kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '', text: 'Divine-Beast Effect Monster.' },
  { id: 'god_obelisk', name: 'Obelisk the Tormentor', atk: 4000, def: 4000, kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '', text: 'Divine-Beast Effect Monster.' },
  { id: 'seal_of_orichalcos', name: 'The Seal of Orichalcos', kind: 'spell', stype: 'field', art: '', text: 'Field Spell.' },
];

export const CARDS: CardDef[] = [...SOURCE_CARDS, ...specials];
export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map(card => [card.id, card]));
export function getCard(id: string): CardDef {
  const card = CARD_MAP[id];
  if (!card) throw new Error(`Unknown card ${id}`);
  return card;
}
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
