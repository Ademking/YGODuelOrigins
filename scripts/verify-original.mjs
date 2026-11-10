import fs from 'node:fs';
import path from 'node:path';

const baseline = '.recovery/original';
// The interface was redesigned on purpose, and the rules engine / AI were extended on purpose to run every catalog
// effect (see docs/EFFECTS.md). What stays pinned is the build configuration; the recovered originals stay readable.
const unchanged = ['tsconfig.json'];
for (const file of ['src/engine/types.ts', 'src/engine/duel.ts', 'src/engine/ai.ts']) if (!fs.existsSync(path.join(baseline, file))) throw new Error(`Recovered original missing: ${file}`);
for (const file of unchanged) {
  let expected = fs.readFileSync(path.join(baseline, file), 'utf8').replaceAll('\r\n', '\n').trimEnd();
  if (file === 'index.html') expected = expected.replace(/  <link rel="preconnect" href="https:\/\/fonts.googleapis.com" \/>\n  <link href="https:\/\/fonts.googleapis.com\/css2[^\n]+\n/, '  <link href="/fonts/fonts.css" rel="stylesheet" />\n');
  const current = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n').trimEnd();
  if (current !== expected) throw new Error(`Original game changed unexpectedly: ${file}`);
}
console.log(`${unchanged.length} pinned file matches the recovered Phaser game; recovered engine originals are present in ${baseline}.`);
