// Decks in the formats other Yu-Gi-Oh! simulators use: .ydk files (YGOPro, EDOPro) and ydke:// codes (EDOPro,
// YGOProDeck, Discord bots). Both list cards by passcode; this game's decks list catalog ids, so cards are mapped
// through their passcode (and alternate artworks through PASSCODE_ALIASES). Side decks are not used here: dropped on
// import, empty on export.
import type { DeckList } from '../engine/duel';
import { CARDS, getCard, isExtraDeckCard, NO_DUEL_DATA } from '../ocgcore/catalog';
import { cardImagePasscode } from './cardImages';
import { PASSCODE_ALIASES } from './passcodeAliases';

let byPasscode: Map<string, string> | undefined;
/** The catalog id for a passcode (any artwork), or undefined for a card this game does not have. */
export function cardForPasscode(passcode: string | number): string | undefined {
  if (!byPasscode) {
    byPasscode = new Map();
    for (const card of CARDS) {
      const code = cardImagePasscode(card.id);
      // three passcodes have an old video-game entry beside the real card: the real (ocg_) one wins, else the first
      if (code && !NO_DUEL_DATA.has(card.id) && (!byPasscode.has(code) || card.id.startsWith('ocg_'))) byPasscode.set(code, card.id);
    }
  }
  const code = String(Number(passcode));
  return byPasscode.get(code) ?? byPasscode.get(PASSCODE_ALIASES[code] ?? '');
}
const passcode = (id: string) => cardImagePasscode(id) ?? '0';

/** A .ydk file: one passcode per line under #main, #extra and !side. */
export function toYdk(deck: DeckList, name = ''): string {
  return [`#created by YGO Duel Origins${name ? ` - ${name.replace(/[\r\n]/g, ' ')}` : ''}`, '#main', ...deck.main.map(passcode),
    '#extra', ...deck.extra.map(passcode), '!side', ''].join('\n');
}

const toBase64 = (codes: string[]) => {
  const bytes = new Uint8Array(new Uint32Array(codes.map(Number)).buffer); // little-endian on every browser
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
};
const fromBase64 = (text: string): number[] => {
  const binary = atob(text);
  if (binary.length % 4) throw new Error('bad length');
  const view = new DataView(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)).buffer);
  return Array.from({ length: binary.length / 4 }, (_, i) => view.getUint32(i * 4, true));
};

/** A ydke:// code: each section a base64 run of 32-bit little-endian passcodes, ending in "!". */
export function toYdke(deck: DeckList): string {
  return `ydke://${toBase64(deck.main.map(passcode))}!${toBase64(deck.extra.map(passcode))}!!`;
}

export interface ImportedDeck {
  deck: DeckList;
  /** Passcodes this game does not have (each listed once). */
  missing: string[];
  /** The deck's name, from a .ydk this game exported, if any. */
  name?: string;
}

/**
 * Read a deck from a ydke:// code, a share link holding one, or the text of a .ydk file. Fusion monsters go to the
 * Fusion Deck wherever they were listed. Returns null when the text holds no deck at all.
 */
export function parseDeck(text: string): ImportedDeck | null {
  const input = text.trim();
  let main: number[] = [], extra: number[] = [], name: string | undefined;
  const ydke = /ydke:\/\/([A-Za-z0-9+/=]*)!([A-Za-z0-9+/=]*)!([A-Za-z0-9+/=]*)!?/.exec(input)
    // a share link (#deck=…) carries the code without its scheme
    ?? /#deck=([A-Za-z0-9+/=]*)!([A-Za-z0-9+/=]*)!([A-Za-z0-9+/=]*)!?/.exec(input.replace(/%21/gi, '!').replace(/%2B/gi, '+').replace(/%2F/gi, '/').replace(/%3D/gi, '='));
  if (ydke) {
    try { main = fromBase64(ydke[1]); extra = fromBase64(ydke[2]); } catch { return null; }
  } else {
    let section: 'main' | 'extra' | 'side' = 'main', any = false;
    for (const raw of input.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^#main/i.test(line)) { section = 'main'; any = true; continue; }
      if (/^#extra/i.test(line)) { section = 'extra'; any = true; continue; }
      if (/^!side/i.test(line)) { section = 'side'; any = true; continue; }
      const created = /^#created by YGO Duel Origins - (.+)$/i.exec(line);
      if (created) { name = created[1].trim(); continue; }
      if (line.startsWith('#') || line.startsWith('!')) continue;
      const code = /^(\d{1,10})\b/.exec(line);
      if (!code) continue;
      any = true;
      if (section === 'main') main.push(Number(code[1]));
      else if (section === 'extra') extra.push(Number(code[1]));
    }
    if (!any) return null;
  }
  const deck: DeckList = { main: [], extra: [] };
  const missing = new Set<string>();
  // a link or file is outside input: nothing real is longer than 60 + 15 + 15 cards
  for (const code of [...main, ...extra].slice(0, 100)) {
    const id = code ? cardForPasscode(code) : undefined;
    if (!id) { if (code) missing.add(String(code)); continue; }
    (isExtraDeckCard(getCard(id)) ? deck.extra : deck.main).push(id);
  }
  return { deck, missing: [...missing], ...(name ? { name } : {}) };
}

/** A link that opens the Deck Builder and imports this deck. */
export function shareLink(deck: DeckList, origin = location.origin): string {
  return `${origin}/#deck=${toYdke(deck).slice('ydke://'.length)}`;
}
