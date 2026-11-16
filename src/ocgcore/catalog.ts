// Metadata for the browser deck editor. OCGCore supplies all duel behavior.
import type { CardDef } from '../engine/types';
import { SOURCE_CARDS } from '../data/sourceCards';
import { BANLIST } from '../data/banlist';
import { t } from '../i18n';

const specials: CardDef[] = [
  { id: 'ocg_89194033', name: 'Mystical Beast of Serket', kind: 'monster', mtype: 'effect', race: 'Fairy', attr: 'EARTH', lv: 6, atk: 2500, def: 2000, art: '',
    text: 'If you do not control "Temple of the Kings", destroy this card. Banish any monster destroyed by battle with this card. If this card destroys a monster by battle: It gains 500 ATK.' },
  { id: 'ocg_29762407', name: 'Temple of the Kings', kind: 'spell', stype: 'continuous', art: '',
    text: 'You can activate 1 Trap Card the turn it was Set. You can send 1 "Mystical Beast of Serket" in your Monster Zone and this card you control to the Graveyard; Special Summon 1 monster from your hand or Deck, or 1 Fusion Monster from your Extra Deck. You can only use each effect of "Temple of the Kings" once per turn.' },
  { id: 'god_slifer', name: 'Slifer the Sky Dragon', atk: 0, def: 0, kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '', text: 'Requires 3 Tributes to Normal Summon (cannot be Normal Set). This card\'s Normal Summon cannot be negated. When Normal Summoned, cards and effects cannot be activated. Once per turn, during the End Phase, if this card was Special Summoned: Send it to the GY. Gains 1000 ATK/DEF for each card in your hand. If a monster(s) is Normal or Special Summoned to your opponent\'s field in Attack Position: That monster(s) loses 2000 ATK, then if its ATK has been reduced to 0 as a result, destroy it.' },
  { id: 'god_ra', name: 'The Winged Dragon of Ra', atk: 0, def: 0, kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '', text: 'Cannot be Special Summoned. Requires 3 Tributes to Normal Summon (cannot be Normal Set). This card\'s Normal Summon cannot be negated. When Normal Summoned, other cards and effects cannot be activated. When this card is Normal Summoned: You can pay LP so that you only have 100 left; this card gains ATK/DEF equal to the amount of LP paid. You can pay 1000 LP, then target 1 monster on the field; destroy that target.' },
  { id: 'god_obelisk', name: 'Obelisk the Tormentor', atk: 4000, def: 4000, kind: 'monster', mtype: 'effect', attr: 'DIVINE', race: 'Divine-Beast', lv: 10, art: '', text: 'Requires 3 Tributes to Normal Summon (cannot be Normal Set). This card\'s Normal Summon cannot be negated. When Normal Summoned, cards and effects cannot be activated. Neither player can target this card with card effects. Once per turn, during the End Phase, if this card was Special Summoned: Send it to the GY. You can Tribute 2 monsters; destroy all monsters your opponent controls. This card cannot declare an attack the turn this effect is activated.' },
  { id: 'seal_of_orichalcos', name: 'The Seal of Orichalcos', kind: 'spell', stype: 'field', art: '',
    text: 'All monsters you control gain 500 ATK. Once per turn, this card cannot be destroyed by card effects. While you control 2 or more face-up Attack Position monsters, your opponent cannot target your monster(s) with the lowest ATK for an attack. If this card is activated: Destroy all Special Summoned monsters you control (if any). You cannot Special Summon monsters from the Extra Deck. You can only activate \"The Seal of Orichalcos\" once per Duel.' },
];

export const CARDS: CardDef[] = [...SOURCE_CARDS, ...specials];
export const CARD_MAP: Record<string, CardDef> = Object.fromEntries(CARDS.map(card => [card.id, card]));
export function getCard(id: string): CardDef {
  const card = CARD_MAP[id];
  if (!card) throw new Error(`Unknown card ${id}`);
  return card;
}
export const isExtraDeckCard = (card: CardDef) => card.mtype === 'fusion';
export const copyLimit = (card: CardDef, enforceBanlist = true) => card.limit ?? (enforceBanlist ? BANLIST.get(card.name.toLowerCase()) : undefined) ?? 3;

/** The card's type in brackets, in the interface language: [Dragon/Effect], Spell Card (Field). */
export function typeLine(card: CardDef): string {
  const cap = (word: string) => word[0].toUpperCase() + word.slice(1);
  if (card.kind === 'monster') {
    const sub = card.ability ?? (card.mtype === 'normal' ? '' : card.mtype!);
    const subtype = sub ? `/${t(cap(sub))}` : '';
    return `[${card.race ? t(card.race) : ''}${subtype}]`;
  }
  // Counter Traps are one phrase: "Counter" alone is also a card's counters (Spell Counter)
  if (card.kind === 'trap' && card.stype === 'counter') return t('Counter Trap Card');
  const subtype = card.stype === 'normal' ? '' : ` (${t(card.stype === 'quick' ? 'Quick-Play' : cap(card.stype!))})`;
  return `${card.kind === 'spell' ? t('Spell Card') : t('Trap Card')}${subtype}`;
}
