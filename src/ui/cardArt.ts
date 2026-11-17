import type { Attr } from '../engine/types';

/** Every card texture (art, back, local fallbacks) is resampled to this size at boot. */
export const CW = 300;
export const CH = 438;
/** Layout scales were tuned for 200px-wide art; multiply by this to keep the same on-screen size. */
export const CARD_K = 200 / CW;
export const cardKey = (id: string) => `card_${id}`;
export const BACK = 'card_back';
/** The card's art if it has finished loading, else the card back (images stream in after boot). */
export const faceKey = (textures: { exists(key: string): boolean }, id: string) => (textures.exists(cardKey(id)) ? cardKey(id) : BACK);
export const ATTR_COLOR: Record<Attr, string> = {
  DARK: '#b689e6', LIGHT: '#ecd36a', EARTH: '#c99a66', WATER: '#6aaaf0', FIRE: '#f0785e', WIND: '#6cc98a', DIVINE: '#e7c970',
};
