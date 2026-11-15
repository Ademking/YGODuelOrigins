// Every interface string the game translates: the English text inside each t('…') / h('…') / tr('…') call in src/
// (including the branches of a ternary or lookup inside the call) plus DYNAMIC_KEYS. Run with --json to print them, or
// --missing <locale> to list what a locale lacks.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DYNAMIC_KEYS } from '../src/i18n/dynamic';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'locales' ? [] : files(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

/** String literals in the first argument of a translate call; template literals with ${…} are runtime-built keys. */
function keysIn(source: string): string[] {
  const keys: string[] = [];
  const call = /(?<![\w.])(?:t|h|tr)\(/g;
  for (let match; (match = call.exec(source));) {
    let depth = 1, i = call.lastIndex, quote = '';
    const start = i;
    for (; i < source.length && depth > 0; i++) {
      const ch = source[i];
      if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth--;
      else if (ch === ',' && depth === 1) break;
    }
    const arg = source.slice(start, i);
    for (const lit of arg.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\$]|\\.)*)`/g)) {
      const raw = lit[1] ?? lit[2] ?? lit[3];
      if (raw === undefined || !/[A-Za-z]/.test(raw)) continue;
      // values compared against (result === 'win' ? …) are not shown
      if (/[!=]==?\s*$/.test(arg.slice(0, lit.index))) continue;
      keys.push(raw.replace(/\\(['"`\\])/g, '$1'));
    }
  }
  return keys;
}

export function allKeys(root = 'src'): string[] {
  const found = files(root).flatMap((file) => keysIn(readFileSync(file, 'utf8')));
  return [...new Set([...found, ...DYNAMIC_KEYS])].sort();
}

if (process.argv[1]?.endsWith('i18n-keys.ts')) {
  const keys = allKeys();
  const missingFor = process.argv.indexOf('--missing');
  if (missingFor > 0) {
    const { DICTIONARIES } = await import('../src/i18n');
    const dict = DICTIONARIES[process.argv[missingFor + 1] as keyof typeof DICTIONARIES];
    console.log(JSON.stringify(keys.filter((key) => !(key in dict)), null, 1));
  } else console.log(process.argv.includes('--json') ? JSON.stringify(keys, null, 1) : keys.join('\n'));
}
