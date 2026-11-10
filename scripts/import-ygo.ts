import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_FILES, IMAGE_LIST, parseCards } from './ygo/database/parse';
import { CARD_EFFECTS } from '../src/data/cardEffects';

const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(project, 'scripts/ygo/effects');
const data = path.join(project, 'game-data'); // importer-only copy of the unpacked card data (not served to the browser)
const binaries: Record<string, unknown> = Object.fromEntries(Object.entries(CARD_FILES).map(([key, filename]) => [key, new Uint8Array(fs.readFileSync(path.join(data, filename as string)))]));
binaries.imageList = fs.readFileSync(path.join(data, IMAGE_LIST), 'latin1');
const originals = parseCards(binaries);
const files = ['monsters.ts', 'spells.ts', 'equips.ts', 'traps.ts'];
const effects = Object.fromEntries(files.map(file => [file, fs.readFileSync(path.join(source, file), 'utf8')]));
const ygoproScripts: Record<string, string> = {
  'Soul of the Pure': '47852924', 'Blue Medicine': '20871001', 'Umiiruka': '82999629',
  'Gaia Power': '56594520', 'Luminous Spark': '81777047', 'Mystic Plasma Zone': '18161786',
  'Rising Air Current': '45778932', 'Wasteland': '23424603', 'Forest': '87430998',
};
// Passcodes missing from the unpacked data (verified against db.ygoprodeck.com, primary artwork ids).
const PASSCODE_FIXES: Record<string, number> = {"Beastly Mirror Ritual": 81933259,"Wall Shadow": 63162310,"Commencement Dance": 43417563,"Tremendous Fire": 46918794,"Dark Magic Ritual": 76792184,"Black Luster Soldier": 5405694,"Black Luster Ritual": 55761792,"Turtle Oath": 76806714,"Perfectly Ultimate Great Moth": 48579379,"Crab Turtle": 91782219,"Great Moth": 14141448,"Gate Guardian": 25833572,"Thousand Dragon": 41462083,"Shadow Ghoul": 30778711,"Javelin Beetle": 26932788,"Javelin Beetle Pact": 41182875,"Cocoon of Evolution": 40240595,"Suijin": 98434877,"Super War-Lion": 33951077,"Skull Knight": 2504891,"Dokurorider": 99721536,"Revival of Dokurorider": 31066283,"Zera The Mant": 69123138,"Zera Ritual": 81756897,"Sengenjin": 76232340,"Performance of Sword": 4849037,"Chakra": 65393205,"Resurrection of Chakra": 39399168,"Dian Keto the Cure Master": 84257639,"Fiend's Mirror": 31890399,"Hungry Burger": 30243636,"Hamburger Recipe": 80811661,"Firewing Pegasus": 27054370,"Kazejin": 62340868,"B. Skull Dragon": 11901678,"Dark Magician Girl": 38033121,"Blue-Eyes Ultimate Dragon": 23995346,"Magician of Black Chaos": 30208479,"Rabid Horseman": 94905343,"Meteor Dragon": 64271667,"Meteor B. Dragon": 90660762,"Fortress Whale": 62337487,"Fortress Whale's Oath": 77454922,"Larvae Moth": 87756343,"War-Lion Ritual": 54539105,"Sanga of the Thunder": 25955164,"Skull Guardian": 3627449,"Novox's Prayer": 43694075,"Kuriboh": 40640057,"Scapegoat": 73915051,"Kanan the Swordmistress": 12829151,"Mikazukinoyaiba": 38277918,"Cosmo Queen": 38999506,"Tri-Horned Dragon": 39111158,"Seiyaryu": 6740720,"Labyrinth Wall": 67284908,"Serpent Night Dragon": 66516792};
for (const o of originals) if (!(/^\d{8}$/.test(o.passcode) && Number(o.passcode) > 0) && PASSCODE_FIXES[o.name]) o.passcode = String(PASSCODE_FIXES[o.name]).padStart(8, '0');
// Cards of YGO_Online_Cards.xlsx that the unpacked catalog lacks (scripts/xlsx-to-json.py).
type OnlineCard = (typeof originals)[number] & { ability?: string };
const online: OnlineCard[] = JSON.parse(fs.readFileSync(path.join(data, 'online-cards.json'), 'utf8'));
originals.push(...online);
const tokens: Record<string, unknown>[] = [];
const used = new Set<string>();
const cards: Record<string, unknown>[] = [];
const media: Record<string, string> = {};
const provenance: Record<string, { code: number; passcode: string; index: number; effectFile?: string }> = {};
const fusions: { card: any; names: string[] }[] = [];

for (const original of originals) {
  const hasPasscode = /^\d{8,9}$/.test(original.passcode) && Number(original.passcode) > 0;
  const hasScan = !!original.image && fs.existsSync(path.join(data, 'data/card', original.image));
  const online = original.code >= 100000; // YGO Online cards: images come from the CDN by passcode or name, no local scan
  if (used.has(original.name) || (!hasPasscode && !hasScan && !online)) continue;
  // Materials are the leading "A" + "B" list; anything after it is an effect that must be implemented.
  const head = original.kind === 'monster' && original.monsterType === 'fusion' ? original.desc.match(/^\s*("[^"]+"(?:\s*\+\s*"[^"]+")+)\.?\s*(.*)$/s) : null;
  // Fusions summoned by their own procedure (Contact Fusion, Gladiator Beasts, Chimeratech) or with non-name materials take the regular path.
  if (original.kind === 'monster' && original.monsterType === 'fusion' && !CARD_EFFECTS[original.name]?.mats && !(online && !head && CARD_EFFECTS[original.name])) {
    if (head && (!head[2].trim() || CARD_EFFECTS[original.name])) fusions.push({ card: original, names: [...head[1].matchAll(/"([^"]+)"/g)].map(match => match[1]) });
    continue;
  }
  if (original.kind === 'monster' && / Token$/.test(original.name)) {
    if ((original as OnlineCard).ability === 'token' && !tokens.some((t) => t.name === original.name)) tokens.push({ id: `ygo_${original.code}`, name: original.name, art: '', kind: 'monster', text: original.desc, mtype: 'normal', attr: original.attribute ?? 'EARTH', race: original.race ?? 'Fiend', lv: original.level, atk: original.atk === 5110 ? 0 : original.atk, def: original.def === 5110 ? 0 : original.def, token: true });
    continue;
  }
  if (!(original.kind === 'monster' && original.monsterType === 'normal') && !CARD_EFFECTS[original.name]) continue;
  if (original.attribute === 'DIVINE' || original.race === 'Unknown' || original.race === 'Divine-Beast') continue;
  const id = `ygo_${original.code}`;
  const card: Record<string, unknown> = { id, name: original.name, art: '', kind: original.kind, text: original.desc };
  if (original.kind === 'monster') Object.assign(card, { mtype: original.monsterType, attr: original.attribute, race: original.race, lv: original.level, atk: original.atk, def: original.def });
  if ((original as OnlineCard).ability) card.ability = (original as OnlineCard).ability;
  else card.stype = original.kind === 'spell' ? original.spellType === 'quickplay' ? 'quick' : original.spellType : original.trapType;
  let effectFile: string | undefined;
  if (CARD_EFFECTS[original.name]) {
    const ygoproPasscode = ygoproScripts[original.name];
    if (ygoproPasscode && Number(original.passcode) !== Number(ygoproPasscode)) throw new Error(`Unexpected passcode for ${original.name}`);
    // Behaviour reference: the copied source scripts when they cover the card, else the card's ygopro-scripts Lua file.
    effectFile = ygoproPasscode ? `ygopro-scripts/c${ygoproPasscode}.lua` : files.find(file => effects[file].includes(`'${original.name}'`) || effects[file].includes(`"${original.name}"`))
      ?? (hasPasscode ? `ygopro-scripts/c${Number(original.passcode)}.lua` : 'src/data/effects');
  }
  used.add(original.name);
  cards.push(card);
  if (original.image) media[id] = original.image;
  provenance[id] = { code: original.code, passcode: original.passcode, index: original.index, effectFile };
}
const byName = new Map(cards.map(card => [card.name as string, card.id as string]));
// Fusions can be materials of other Fusions (Fusionist -> Rare Fish): repeat until nothing new is added.
for (let added = true; added;) {
added = false;
for (const { card: original, names } of fusions) {
  if (used.has(original.name) || names.some(name => !byName.has(name))) continue;
  const id = `ygo_${original.code}`;
  cards.push({ id, name: original.name, art: '', kind: 'monster', text: original.desc, mtype: 'fusion', attr: original.attribute, race: original.race, lv: original.level, atk: original.atk, def: original.def, mats: names.map(name => byName.get(name)) });
  if (original.image) media[id] = original.image;
  provenance[id] = { code: original.code, passcode: original.passcode, index: original.index, effectFile: CARD_EFFECTS[original.name] ? 'src/data/effects' : undefined };
  used.add(original.name);
  byName.set(original.name, id);
  added = true;
}
}
const unavailable = Object.keys(CARD_EFFECTS).filter(name => !used.has(name));
if (unavailable.length) console.log(`Not included because no usable card or image identifier was found: ${unavailable.join(', ')}`);
const output = `import type { CardDef } from '../engine/types';\n\n// Parsed from a string: a literal this large is too complex for the type checker.
export const SOURCE_CARDS: CardDef[] = JSON.parse(${JSON.stringify(JSON.stringify(cards))});\n\nexport const SOURCE_TOKENS: CardDef[] = ${JSON.stringify(tokens, null, 2)};

export const CARD_IMAGES: Record<string, string> = ${JSON.stringify(media, null, 2)};\n\nexport const CARD_PROVENANCE = ${JSON.stringify(provenance, null, 2)};\n`;
fs.writeFileSync(path.join(project, 'src/data/sourceCards.ts'), output);
console.log(`Imported ${cards.length} complete original cards from ${data}; ${Object.keys(CARD_EFFECTS).length} mapped effects, with local and ygopro-scripts provenance.`);
