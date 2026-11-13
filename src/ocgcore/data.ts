import type { OcgCardData } from 'ocgcore-wasm';
import { cardImagePasscode } from '../data/cardImages';
import { getCard } from './catalog';

export interface DatabaseRow {
  id: string; alias: string; setcode: string; type: string; level: string;
  attribute: string; race: string; atk: string; def: string; name: string; desc: string;
}
export interface Bundle { cards: DatabaseRow[]; scripts: Record<string, string> }
export function cardData(row: DatabaseRow): OcgCardData {
  const setcodes: number[] = [];
  let sets = BigInt.asUintN(64, BigInt(row.setcode));
  for (; sets; sets >>= 16n) if (sets & 65535n) setcodes.push(Number(sets & 65535n));
  const level = Number(row.level);
  const type = Number(row.type);
  return {
    code: Number(row.id), alias: Number(row.alias), setcodes, type, level: level & 255,
    attribute: Number(row.attribute), race: BigInt(row.race), attack: Number(row.atk),
    defense: type & 0x4000000 ? 0 : Number(row.def),
    link_marker: type & 0x4000000 ? Number(row.def) : 0,
    lscale: (level >>> 24) & 255, rscale: (level >>> 16) & 255,
  };
}

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
export function cardCatalog(bundle: Bundle) {
  const rows = new Map(bundle.cards.map(row => [Number(row.id), row]));
  const names = new Map(bundle.cards.map(row => [normalize(row.name), row]));
  return {
    rows,
    codeFor(id: string) {
      const card = getCard(id);
      const passcode = Number(cardImagePasscode(id));
      const row = rows.get(passcode);
      if (row && normalize(row.name) === normalize(card.name)) return passcode;
      const byName = names.get(normalize(card.name));
      if (byName) return Number(byName.id);
      // Old deck saves can contain pre-errata display names.
      if (row) return passcode;
      throw new Error(`No Project Ignis card data for ${card.name} (${id}).`);
    },
  };
}
