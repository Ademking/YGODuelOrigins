// Interface language. Strings are written in English in the code and wrapped in t(); each locale file maps the English
// text to its translation, and anything missing falls back to English. The choice is saved on the device; the first
// visit follows the browser's language.
import { AR } from './locales/ar';
import { DE } from './locales/de';
import { ES } from './locales/es';
import { FR } from './locales/fr';
import { ID } from './locales/id';
import { IT } from './locales/it';
import { PT_BR } from './locales/pt-BR';
import { RU } from './locales/ru';

export type Locale = 'en' | 'pt-BR' | 'fr' | 'es' | 'de' | 'it' | 'ru' | 'ar' | 'id';
/** Every language, named in itself, in menu order. */
export const LOCALES: { code: Locale; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'ru', name: 'Русский' },
  { code: 'ar', name: 'العربية' },
  { code: 'id', name: 'Bahasa Indonesia' },
];
export type Dictionary = Record<string, string>;
export const DICTIONARIES: Record<Exclude<Locale, 'en'>, Dictionary> = { 'pt-BR': PT_BR, fr: FR, es: ES, de: DE, it: IT, ru: RU, ar: AR, id: ID };

const KEY = 'arcana-duel.locale';

/** The saved language, else the browser's first language the game has, else English. */
function detect(): Locale {
  if (typeof document === 'undefined') return 'en'; // tests and build scripts stay in English
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LOCALES.some((l) => l.code === saved)) return saved as Locale;
  } catch { /* storage unavailable */ }
  for (const wanted of navigator.languages ?? [navigator.language]) {
    if (!wanted) continue;
    const tag = wanted.toLowerCase();
    if (tag.startsWith('pt')) return 'pt-BR';
    const match = LOCALES.find((l) => l.code.toLowerCase() === tag.split('-')[0]);
    if (match) return match.code;
  }
  return 'en';
}

let current: Locale = detect();
applyDocument();

function applyDocument() {
  if (typeof document === 'undefined') return; // tests run without a page
  document.documentElement.lang = current;
  document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
}

export const locale = () => current;
/** Arabic reads right to left. */
export function isRTL() { return current === 'ar'; }

/** Save a new language. Screens pick it up when they are next created (the caller restarts the current one). */
export function setLocale(code: Locale) {
  current = code;
  try { localStorage.setItem(KEY, code); } catch { /* storage unavailable */ }
  applyDocument();
}

/**
 * Translate `text` (the English wording) into the current language. `{name}` placeholders are filled from `vars`,
 * in the translation as in the English.
 */
export function t(text: string, vars?: Record<string, string | number>): string {
  const translated = current === 'en' ? text : DICTIONARIES[current][text] ?? text;
  return vars ? translated.replace(/\{(\w+)\}/g, (all, key: string) => (key in vars ? String(vars[key]) : all)) : translated;
}

/** A number in the current language's format (8,000 · 8.000 · 8 000). */
export function num(value: number) {
  return value.toLocaleString(current === 'en' ? 'en-US' : current);
}
