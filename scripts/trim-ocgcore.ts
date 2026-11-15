// Cuts the full Project Ignis bundle (every card ever printed) down to what this game can put in a duel, so phones
// download and parse a fraction of it. Kept: every card in the catalog, its alias, and, transitively, every card a
// kept script names by passcode (tokens, "listed names", cards an effect summons or searches), plus all the shared
// utility scripts. Only the database columns the game reads are kept.
//
// Cards listed in src/ocgcore/overrides.ts get their 2004 script and text.
//
// Input: assets/ocgcore/data.json.gz (written by prepare-ocgcore.mjs). Output: assets/ocgcore/duel.json.gz.
import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CARDS } from '../src/ocgcore/catalog';
import { cardCatalog, type Bundle, type DatabaseRow } from '../src/ocgcore/data';
import { applyOverrides } from '../src/ocgcore/overrides';

const assets = resolve('assets/ocgcore');
const input = resolve(assets, 'data.json.gz');
const output = resolve(assets, 'duel.json.gz');
const stamp = resolve(assets, 'duel.revision');
// Rebuild only when the full bundle or this script changed.
const version = [input, new URL(import.meta.url), new URL('../src/ocgcore/overrides.ts', import.meta.url)].map((file) => statSync(file).mtimeMs).join('-') + `-${CARDS.length}`;
try {
  if (readFileSync(stamp, 'utf8') === version) process.exit(0);
} catch { /* first run */ }

const full = JSON.parse(gunzipSync(readFileSync(input)).toString('utf8')) as Bundle;
const rows = new Map(full.cards.map((row) => [Number(row.id), row]));
const catalog = cardCatalog(full);

const keep = new Set<number>();
const queue: number[] = [];
const add = (code: number) => {
  if (!code || keep.has(code) || !rows.has(code)) return;
  keep.add(code);
  queue.push(code);
};
for (const card of CARDS) {
  try { add(catalog.codeFor(card.id)); } catch { /* not in Project Ignis: the duel reports it the same way */ }
}
const TOKEN = 0x4000;
const isCardScript = (name: string) => /^c\d+\.lua$/.test(name);
const utility = Object.keys(full.scripts).filter((name) => !isCardScript(name));
const mentioned = (source: string) => [...source.matchAll(/\b\d{4,10}\b/g)].map(([n]) => Number(n));
for (const name of utility) mentioned(full.scripts[name]).forEach(add);
while (queue.length) {
  const code = queue.pop()!;
  add(Number(rows.get(code)!.alias));
  // Scripts often make their tokens as `id+1`, `id+2`…: keep tokens numbered just after a kept card.
  for (let next = code + 1; next <= code + 6; next++) if (Number(rows.get(next)?.type ?? 0) & TOKEN) add(next);
  const script = full.scripts[`c${code}.lua`];
  if (script) mentioned(script).forEach(add);
}

const columns = ['id', 'alias', 'setcode', 'type', 'level', 'attribute', 'race', 'atk', 'def', 'name', 'desc'];
const slim = (row: DatabaseRow) => Object.fromEntries(Object.entries(row)
  .filter(([key, value]) => columns.includes(key) || (/^str\d+$/.test(key) && value)));
const scripts: Record<string, string> = {};
for (const name of utility) scripts[name] = full.scripts[name];
for (const code of keep) {
  const script = full.scripts[`c${code}.lua`];
  if (script) scripts[`c${code}.lua`] = script;
}
const bundle = { cards: full.cards.filter((row) => keep.has(Number(row.id))).map(slim) as DatabaseRow[], scripts, systemStrings: full.systemStrings };
// 2004 versions of cards whose current errata plays differently (src/ocgcore/overrides.ts)
applyOverrides(bundle);
const zipped = gzipSync(JSON.stringify(bundle), { level: 9 });
writeFileSync(`${output}.tmp`, zipped);
renameSync(`${output}.tmp`, output);
writeFileSync(stamp, version);
console.log(`OCGCore duel data: ${bundle.cards.length} of ${full.cards.length} cards, ${Object.keys(scripts).length} scripts, ${(zipped.length / 1e6).toFixed(2)} MB`);
