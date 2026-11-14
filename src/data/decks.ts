import type { DeckList } from '../engine/duel';
import type { Difficulty } from '../engine/ai';
import { CARD_MAP, copyLimit, getCard, isExtraDeckCard } from '../ocgcore/catalog';
import { PREMADE, PREVIOUS_PREMADE } from './premadeDecks';

export interface Opponent { id: string; name: string; title: string; art: string; ace: string; style: string; deck: DeckList; suggested: Difficulty }

// Anime debut order, with same-episode characters grouped together.
const appearanceOrder = [
  'yugi', 'joey', 'kaiba', 'pegasus', 'weevil', 'rex', 'mai', 'bakura', 'mako', 'panik', 'keith', 'bonz',
  'paradox', 'rebecca', 'exodia', 'marik', 'espa', 'odion', 'ishizu', 'orichalcos',
  'jaden', 'syrus', 'chumley', 'bastion', 'chazz', 'alexis', 'crowler', 'zane',
  'titan', 'atticus', 'camula', 'zaloog', 'amnael', 'kagemaru', 'aster', 'sartorius', 'tyranno', 'jaden-neos', 'jesse', 'axel', 'adrian',
];
const appearanceRank = new Map(appearanceOrder.map((id, index) => [id, index]));
export const OPPONENTS: Opponent[] = PREMADE.map(opponent => structuredClone(opponent))
  .sort((a, b) => (appearanceRank.get(a.id) ?? Infinity) - (appearanceRank.get(b.id) ?? Infinity));
export const STARTERS: Record<string, DeckList> = Object.fromEntries(PREMADE.map(opponent => [opponent.name, structuredClone(opponent.deck)]));

/** 2004-style deck rules: 40–60 main, up to 15 Fusion Deck, 3 copies max (or the card's limit). */
export function validateDeck(d: DeckList): string[] {
  const errs: string[] = [];
  if (d.main.length < 40) errs.push(`Main Deck has ${d.main.length} cards (minimum 40).`);
  if (d.main.length > 60) errs.push(`Main Deck has ${d.main.length} cards (maximum 60).`);
  if (d.extra.length > 15) errs.push(`Fusion Deck has ${d.extra.length} cards (maximum 15).`);
  const counts: Record<string, number> = {};
  for (const id of [...d.main, ...d.extra]) {
    if (!CARD_MAP[id]) { errs.push(`Unknown card "${id}".`); continue; }
    counts[id] = (counts[id] ?? 0) + 1;
  }
  for (const id of d.main) if (CARD_MAP[id] && isExtraDeckCard(getCard(id))) errs.push(`${getCard(id).name} belongs in the Fusion Deck.`);
  for (const id of d.extra) if (CARD_MAP[id] && !isExtraDeckCard(getCard(id))) errs.push(`${getCard(id).name} cannot be in the Fusion Deck.`);
  for (const [id, n] of Object.entries(counts)) {
    const lim = copyLimit(getCard(id));
    if (n > lim) errs.push(`${getCard(id).name}: ${n} copies (limit ${lim}).`);
  }
  return [...new Set(errs)];
}

const KEY = 'arcana-duel.ygo.decks.premade-v2';
const SEL = 'arcana-duel.ygo.selected.premade-v2';

const SEEN = 'arcana-duel.ygo.starters-seen.premade-v2';

export function loadDecks(): Record<string, DeckList> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, DeckList>;
      if (parsed && typeof parsed === 'object' && Object.keys(parsed).length) {
        // Starter decks added after the player's first visit are offered once; a deleted starter stays deleted.
        const seen = new Set<string>(JSON.parse(localStorage.getItem(SEEN) ?? '[]'));
        let added = false;
        if (Object.prototype.hasOwnProperty.call(parsed, 'Gravekeeper')) {
          delete parsed['Gravekeeper'];
          added = true;
        }
        for (const previous of PREVIOUS_PREMADE) {
          const saved = parsed[previous.name];
          if (!saved || !Array.isArray(saved.main) || !Array.isArray(saved.extra)) continue;
          const sameCards = (left: string[], right: string[]) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
          if (sameCards(saved.main, previous.deck.main) && sameCards(saved.extra, previous.deck.extra)) {
            const updated = STARTERS[previous.name];
            if (!sameCards(saved.main, updated.main) || !sameCards(saved.extra, updated.extra)) {
              parsed[previous.name] = structuredClone(updated);
              added = true;
            }
          }
        }
        for (const [name, deck] of Object.entries(STARTERS)) {
          if (seen.has(name)) continue;
          if (!parsed[name]) { parsed[name] = structuredClone(deck); added = true; }
          seen.add(name);
        }
        localStorage.setItem(SEEN, JSON.stringify([...seen]));
        if (added) saveDecks(parsed);
        return parsed;
      }
    }
  } catch { /* storage unavailable or corrupt: fall back to starters */ }
  try { localStorage.setItem(SEEN, JSON.stringify(Object.keys(STARTERS))); } catch { /* ignore */ }
  return structuredClone(STARTERS);
}

export function saveDecks(decks: Record<string, DeckList>) {
  try { localStorage.setItem(KEY, JSON.stringify(decks)); } catch { /* ignore */ }
}

export function selectedDeck(): string {
  try { return localStorage.getItem(SEL) ?? Object.keys(STARTERS)[0]; } catch { return Object.keys(STARTERS)[0]; }
}
export function setSelectedDeck(name: string) {
  try { localStorage.setItem(SEL, name); } catch { /* ignore */ }
}
