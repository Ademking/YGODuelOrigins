import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARD_FILES, IMAGE_LIST, parseCards, type CardBinaries } from './ygo/database/parse';

const project = fileURLToPath(new URL('../', import.meta.url));
const source = path.resolve(process.argv[2] ?? path.join(project, 'game-data'));
const binaries = Object.fromEntries(Object.entries(CARD_FILES).map(([key, filename]) => [key, new Uint8Array(fs.readFileSync(path.join(source, filename)))])) as unknown as CardBinaries;
binaries.imageList = fs.readFileSync(path.join(source, IMAGE_LIST), 'latin1');
const cards = parseCards(binaries).filter(card => card.name);
const output = `import type { CardData } from '../../scripts/ygo/database/types';\n\nexport const YGO_CATALOG: CardData[] = ${JSON.stringify(cards, null, 2)};\n`;
fs.writeFileSync(path.join(project, 'src/data/ygoCatalog.ts'), output);
console.log(`Imported ${cards.length} named cards, including ${cards.filter(card => card.passcode).length} passcodes.`);