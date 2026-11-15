import { execFileSync } from 'node:child_process';
import { accessSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = resolve(root, 'tsconfig.build.json');
const require = createRequire(import.meta.url);

function checkProject(stage) {
  try {
    accessSync(project);
  } catch (cause) {
    throw new Error(`Missing TypeScript project ${stage}: ${project}`, { cause });
  }
}

function run(script, ...args) {
  execFileSync(process.execPath, [script, ...args], { cwd: root, stdio: 'inherit' });
}

checkProject('before OCGCore preparation');
console.log(`Building from ${root}`);
run(fileURLToPath(new URL('./prepare-ocgcore.mjs', import.meta.url)));
// keep only the cards this game can duel with: the browser downloads this, not the full bundle
execFileSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./trim-ocgcore.ts', import.meta.url))], { cwd: root, stdio: 'inherit' });
checkProject('after OCGCore preparation');
run(require.resolve('typescript/bin/tsc'), '--project', project);
run(resolve(require.resolve('vite/package.json'), '../bin/vite.js'), 'build');
// the full bundle only feeds trim-ocgcore.ts and is never fetched by the game
rmSync(resolve(root, 'dist/ocgcore/data.json.gz'), { force: true });
