import type { Attribute, CardData, Race } from './types';

// Bit layout of card_prop.bin (uint32 LE per card), reverse-engineered from the game data:
//   bits 0-8 DEF/10, 9-17 ATK/10 (bit 17 doubles as a spell/trap sub-type flag),
//   18-19 frame, 20-24 race, 25-28 level, 29-31 attribute.
const RACES: Race[] = ['Unknown', 'Dragon', 'Zombie', 'Fiend', 'Pyro', 'Sea Serpent', 'Rock', 'Machine', 'Fish', 'Dinosaur', 'Insect',
  'Beast', 'Beast-Warrior', 'Plant', 'Aqua', 'Warrior', 'Winged Beast', 'Fairy', 'Spellcaster', 'Thunder', 'Reptile'];
const ATTRS: (Attribute | undefined)[] = [undefined, 'LIGHT', 'DARK', 'WATER', 'FIRE', 'EARTH', 'WIND', 'DIVINE'];
const RACE_TRAP = 21, RACE_SPELL = 22, RACE_DIVINE = 24;

export interface CardBinaries {
  names: Uint8Array; descs: Uint8Array; descIndex: Uint8Array; props: Uint8Array; ids: Uint8Array; pass: Uint8Array;
  /** Contents of data/card/list_card.txt */
  imageList: string;
}

const latin1 = (b: Uint8Array) => { let s = ''; for (const c of b) { if (!c) break; s += String.fromCharCode(c); } return s; };

export function parseImageList(text: string): Map<number, string> {
  const out = new Map<number, string>();
  let idx = -1;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\/\/\s*(\d{4}):\[/);
    if (m) idx = Number(m[1]);
    else if (idx >= 0 && /\.bmp$/i.test(line.trim())) { out.set(idx, line.trim().toLowerCase()); idx = -1; }
  }
  return out;
}

export function parseCards(b: CardBinaries): CardData[] {
  const dv = (a: Uint8Array) => new DataView(a.buffer, a.byteOffset, a.byteLength);
  const props = dv(b.props), ids = dv(b.ids), dIdx = dv(b.descIndex);
  const images = parseImageList(b.imageList);
  const count = b.props.length / 4;
  const cards: CardData[] = [];
  for (let i = 1; i < count; i++) {
    const p = props.getUint32(i * 4, true);
    const hi = p >>> 18, frame = hi & 3, raceId = (hi >> 2) & 31, level = (hi >> 7) & 15, attr = (hi >> 11) & 7;
    const flag = (p >>> 17) & 1;
    const off = dIdx.getUint32(i * 4, true);
    const pass = [...b.pass.subarray(i * 4, i * 4 + 4)].map(x => x.toString(16).padStart(2, '0')).join('');
    const name = latin1(b.names.subarray(i * 64, i * 64 + 64));
    // The game points ~340 cards without art at the Slime Token picture; treat those as having no image.
    const img = images.get(i);
    const base = {
      code: ids.getUint16(i * 2, true), index: i, name,
      desc: latin1(b.descs.subarray(off)).replace(/\r?\n/g, ' ').trim(),
      passcode: pass === 'ffffffff' ? '' : pass,
      image: img?.startsWith('token_') && !name.endsWith(' Token') ? undefined : img,
    };
    if (raceId === RACE_SPELL) {
      const spellType = (['normal', flag ? 'equip' : 'field', flag ? 'quickplay' : 'continuous', 'ritual'] as const)[frame];
      cards.push({ ...base, kind: 'spell', spellType, level: 0, atk: 0, def: 0 });
    } else if (raceId === RACE_TRAP) {
      const trapType = frame === 2 ? 'continuous' : flag ? 'counter' : 'normal';
      cards.push({ ...base, kind: 'trap', trapType, level: 0, atk: 0, def: 0 });
    } else {
      cards.push({
        ...base, kind: 'monster', monsterType: (['normal', 'effect', 'fusion', 'ritual'] as const)[frame],
        race: raceId === RACE_DIVINE ? 'Divine-Beast' : RACES[raceId] ?? 'Unknown', attribute: ATTRS[attr],
        level, atk: ((p >>> 9) & 0x1ff) * 10, def: (p & 0x1ff) * 10,
      });
    }
  }
  return cards;
}

/** Decodes a .ydc deck file into [main, fusion, side] lists of card codes. */
export function parseYdc(bytes: Uint8Array): number[][] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sections: number[][] = [];
  let o = 8;
  while (o + 2 <= bytes.length && sections.length < 3) {
    const n = v.getUint16(o, true); o += 2;
    const s: number[] = [];
    for (let k = 0; k < n && o + 2 <= bytes.length; k++, o += 2) s.push(v.getUint16(o, true));
    sections.push(s);
  }
  while (sections.length < 3) sections.push([]);
  return sections;
}

export const CARD_FILES = {
  names: 'data/bin#/card_nameeng.bin', descs: 'data/bin#/card_desceng.bin', descIndex: 'data/bin#/card_indxeng.bin',
  props: 'data/bin#/card_prop.bin', ids: 'data/bin#/card_id.bin', pass: 'data/bin#/card_pass.bin',
} as const;
export const IMAGE_LIST = 'data/card/list_card.txt';
