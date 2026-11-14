import { CARD_MAP } from '../ocgcore/catalog';
import { validateDeck } from '../data/decks';
import type { DeckList } from '../engine/duel';

export const PROTOCOL = 'duel-origins-p2p-1';
export const APP_ID = 'duelorigins.online/multiplayer-v1';
export const cleanName = (value: unknown) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) : '';
export const cleanChat = (value: unknown) => typeof value === 'string'
  ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, 350) : '';
export function validDeck(value: unknown): value is DeckList {
  if (!value || typeof value !== 'object') return false;
  const d = value as DeckList;
  return Array.isArray(d.main) && Array.isArray(d.extra) && d.main.length <= 60 && d.extra.length <= 15
    && [...d.main, ...d.extra].every(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(CARD_MAP, id))
    && !validateDeck(d).length;
}
export function newCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('');
}
export function parseCode(value: string) {
  let code = value.trim();
  try { code = new URL(code).hash.match(/duel=([A-Z2-9]+)/i)?.[1] ?? ''; } catch {}
  code = code.replace(/[\s-]/g, '').toUpperCase();
  return /^[A-HJ-NP-Z2-9]{12}$/.test(code) ? code : null;
}
export const inviteURL = (code: string) => `${location.origin}${location.pathname}#duel=${code}`;
export function encode(value: unknown): string {
  return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? { $bigint: String(v) } : v);
}
export function decode(value: string): unknown {
  if (value.length > 32768) throw new Error('Message too large.');
  return JSON.parse(value, (_, v) => v && typeof v === 'object' && Object.keys(v).length === 1
    && typeof v.$bigint === 'string' && /^-?\d{1,24}$/.test(v.$bigint) ? BigInt(v.$bigint) : v);
}
export function fingerprint(value: unknown) {
  const text = encode(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function seededRandom(seed: number) {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
