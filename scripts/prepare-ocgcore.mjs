import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

const assets = resolve('assets/ocgcore');
const scriptsRevision = '9a5738639924bbbf3b86c4599f3f7e70ea8711a6';
const databaseRevision = '172462f1e7405c7544cc256471d3310df6e6b7c3';
const localeRevision = '54a6e2395c532648ff762540e9615319fac4f51b';
const version = `3-${scriptsRevision}-${databaseRevision}-${localeRevision}`;
const output = resolve(assets, 'data.json.gz');
if (existsSync(resolve(assets, 'revision')) && existsSync(output) && readFileSync(resolve(assets, 'revision'), 'utf8') === version) process.exit(0);

console.log(`Preparing OCGCore card data with Node ${process.version}`);
const { DatabaseSync } = await import('node:sqlite').catch(error => {
  throw new Error('OCGCore card data requires Node.js 24.x with node:sqlite enabled.', { cause: error });
});

// Keep deployment Git settings from redirecting dependency checkouts into the app.
const gitEnv = { ...process.env };
const repoGitVars = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' });
for (const name of repoGitVars.trim().split(/\s+/)) delete gitEnv[name];

async function localeFile(path) {
  if (process.env.OCG_LOCALE_DIR) return readFileSync(resolve(process.env.OCG_LOCALE_DIR, path), 'utf8');
  const url = `https://raw.githubusercontent.com/ProjectIgnis/Distribution/${localeRevision}/${path}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Could not download Project Ignis ${path} (HTTP ${response.status})`);
  return response.text();
}

function checkout(workspace, name, revision, supplied) {
  if (supplied) {
    const dir = resolve(supplied);
    const head = execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8', env: gitEnv,
    }).trim();
    if (head !== revision) throw new Error(`${dir} must be at ${revision}`);
    return dir;
  }

  const dir = resolve(workspace, name);
  mkdirSync(dir);
  execFileSync('git', ['init', '-q', '--template=', dir], { cwd: workspace, env: gitEnv });
  const git = (...args) => execFileSync('git', [
    '--git-dir', resolve(dir, '.git'), '--work-tree', dir, ...args,
  ], { cwd: dir, env: gitEnv });
  git('fetch', '-q', '--depth=1', `https://github.com/ProjectIgnis/${name}.git`, revision);
  git('checkout', '-q', '--detach', 'FETCH_HEAD');
  return dir;
}

const workspace = mkdtempSync(resolve(tmpdir(), 'duel-origins-ocgcore-'));
try {
  const lua = checkout(workspace, 'CardScripts', scriptsRevision, process.env.OCG_SCRIPTS_DIR);
  const database = checkout(workspace, 'BabelCDB', databaseRevision, process.env.OCG_DATABASE_DIR);
  const [locale, localeLicense] = await Promise.all([localeFile('config/strings.conf'), localeFile('LICENSE')]);
  const systemStrings = Object.fromEntries(
    [...locale.matchAll(/^!system (\d+) (.+)$/gm)]
      .map(([, id, label]) => [id, label.trim()]),
  );
  const db = new DatabaseSync(resolve(database, 'cards.cdb'), { readOnly: true });
  const query = db.prepare('SELECT datas.*, texts.* FROM datas JOIN texts USING(id)');
  query.setReadBigInts(true);
  const cards = query.all();
  db.close();
  const scripts = {};
  for (const folder of [lua, resolve(lua, 'official')]) {
    for (const name of readdirSync(folder).filter(name => name.endsWith('.lua'))) scripts[name] = readFileSync(resolve(folder, name), 'utf8');
  }
  mkdirSync(assets, { recursive: true });
  writeFileSync(output + '.tmp', gzipSync(JSON.stringify({ cards, scripts, systemStrings }, (_key, value) => typeof value === 'bigint' ? value.toString() : value)));
  renameSync(output + '.tmp', output);
  writeFileSync(resolve(assets, 'CardScripts-COPYING'), readFileSync(resolve(lua, 'COPYING')));
  writeFileSync(resolve(assets, 'Distribution-LICENSE'), localeLicense);
  writeFileSync(resolve(assets, 'revision'), version);
} finally {
  rmSync(workspace, { recursive: true, force: true });
}
