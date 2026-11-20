// Card names, text, effect-choice labels and engine prompts in the interface language, from
// assets/i18n/cards/<locale>.json, loaded at boot:
//   - French, German, Italian, Portuguese, Spanish: Konami's official translations (scripts/import-card-text.ts);
//   - Arabic: the community translations of Arab Duelists (scripts/import-arabic-card-text.ts), names and text only;
//   - Vietnamese: the community translations of Yu-Gi-Oh! Việt Nam (scripts/import-vietnamese-card-text.ts), names, text
//     and Vietnamese card pictures;
//   - the few cards no source has: our own translations (scripts/card-text-supplement.ts), so every card is translated.
// Russian and Indonesian cards stay in English.
import type { CardDef } from '../engine/types';
import { cardImagePasscode } from '../data/cardImages';
import { locale, type Locale } from '.';
import { OVERRIDES } from '../ocgcore/overrides';
import { timeoutSignal } from '../timeoutSignal';

/** Languages with translated card text: the file name for each. */
export const CARD_TEXT_FILES: Partial<Record<Locale, string>> = { 'pt-BR': 'pt', fr: 'fr', es: 'es', de: 'de', it: 'it', ar: 'ar', vi: 'vi' };

/** The file's shape: names and text, effect-choice labels by index (str1 = 0), engine prompts by id. */
export interface CardTextFile {
  cards: Record<string, [string, string]>;
  strings?: Record<string, Record<string, string>>;
  system?: Record<string, string>;
  /** Translations of the older English text the game plays some cards by (src/ocgcore/overrides.ts). */
  olderText?: Record<string, string>;
  /** Card pictures printed in this language, by passcode: a file under PICTURE_BASE (Vietnamese only). */
  images?: Record<string, string>;
}

/** Where the translated card pictures are (Yu-Gi-Oh! Việt Nam's CDN), through the same resizing proxy as the English ones. */
const PICTURE_BASE = 'https://wsrv.nl/?url=cdn.ygovietnam.com/storage/CardVietSub/';

/** passcode → [name, text] for the current language. */
let texts = new Map<string, [string, string]>();
let labels: CardTextFile['strings'] = {};
let system: CardTextFile['system'] = {};
let olderText: CardTextFile['olderText'] = {};
let pictures: CardTextFile['images'] = {};
/** Passcodes whose text the game plays differently from the official current text (src/ocgcore/overrides.ts). */
const keepEnglishText = new Set<string>();

/** Install the current language's card text (from the JSON file loaded at boot). */
export function setCardTexts(data: CardTextFile | undefined, englishTextFor: number[] = []) {
  texts = new Map(Object.entries(data?.cards ?? {}));
  labels = data?.strings ?? {};
  system = data?.system ?? {};
  olderText = data?.olderText ?? {};
  pictures = data?.images ?? {};
  keepEnglishText.clear();
  for (const code of englishTextFor) keepEnglishText.add(String(code));
}

/**
 * Fetch and install the current language's card text (or clear it for English and languages without card text).
 * Never fails: on any error the cards simply stay in English.
 */
export async function loadCardTexts(): Promise<void> {
  const url = cardTextUrl(import.meta.env.BASE_URL);
  if (!url) { setCardTexts(undefined); return; }
  try {
    const response = await fetch(url, { signal: timeoutSignal(20_000) });
    // cards the game plays by older rules (Ring of Destruction) show that older text, not the current official one
    setCardTexts(response.ok ? await response.json() : undefined, Object.keys(OVERRIDES).map(Number));
  } catch { setCardTexts(undefined); }
}

/**
 * An effect-choice label or engine prompt in the interface language, by OCGCore description id (an engine prompt
 * below 0x100000, else the card passcode in the high bits and the label index in the low 20). Undefined: use English.
 */
export function translatedDescription(id: bigint): string | undefined {
  if (id < 0x100000n) return system?.[String(id)];
  const code = String(id >> 20n);
  if (keepEnglishText.has(code)) return undefined;
  return labels?.[code]?.[String(id & 0xfffffn)];
}

/** The URL of the current language's card text, or null when cards stay in English. */
export function cardTextUrl(base = '/'): string | null {
  const file = CARD_TEXT_FILES[locale()];
  return file ? `${base}i18n/cards/${file}.json` : null;
}

/** The card's key in the text files: its passcode, or its id for the few video-game cards that have none. */
const passcodeOf = (card: CardDef) => {
  if (card.id.startsWith('ocg_')) return card.id.slice(4);
  try { return cardImagePasscode(card.id) ?? card.id; } catch { return card.id; }
};

/** The card's name in the interface language. */
export function cardName(card: CardDef): string {
  if (!card.id) return card.name;
  return texts.get(passcodeOf(card))?.[0] || card.name;
}

/** The card's text in the interface language. */
export function cardText(card: CardDef): string {
  if (!card.id) return card.text;
  const code = passcodeOf(card);
  if (keepEnglishText.has(code)) return olderText?.[code] || card.text;
  return texts.get(code)?.[1] || card.text;
}

/** Does the current language have a translated name matching `query` for this card? (Deck Builder search) */
export function matchesTranslated(card: CardDef, query: string): boolean {
  const entry = texts.get(passcodeOf(card));
  return !!entry && (entry[0].toLowerCase().includes(query) || entry[1].toLowerCase().includes(query));
}

/** Does the current language have its own card pictures? (Card textures are cached per picture language.) */
export const hasTranslatedPictures = () => Object.keys(pictures ?? {}).length > 0;

/**
 * The card picture printed in the interface language for this artwork passcode, `width` pixels wide, or undefined
 * when there is none (then the English picture shows). Cards played by older text keep their English picture.
 */
export function translatedPicture(passcode: string, width = 421): string | undefined {
  const file = pictures?.[passcode];
  if (!file || keepEnglishText.has(passcode)) return undefined;
  return `${PICTURE_BASE}${file}&w=${width}&output=webp`;
}
