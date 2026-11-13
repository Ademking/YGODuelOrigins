import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const cache = resolve('node_modules/.cache/duel-origins-ocgcore');
const assets = resolve('assets/ocgcore');
const scriptsRevision = '9a5738639924bbbf3b86c4599f3f7e70ea8711a6';
const databaseRevision = '172462f1e7405c7544cc256471d3310df6e6b7c3';
const version = `2-${scriptsRevision}-${databaseRevision}`;
const output = resolve(assets, 'data.json.gz');
if (existsSync(resolve(assets, 'revision')) && existsSync(output) && readFileSync(resolve(assets, 'revision'), 'utf8') === version) process.exit(0);

function checkout(name, revision, supplied) {
  const dir = supplied ? resolve(supplied) : resolve(cache, name);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const git = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (!supplied && !existsSync(resolve(dir, '.git'))) git('init', '-q');
  let head;
  try { head = git('rev-parse', '--verify', 'HEAD').trim(); } catch {}
  if (head !== revision) {
    if (supplied) throw new Error(`${dir} must be at ${revision}`);
    git('fetch', '-q', '--depth=1', `https://github.com/ProjectIgnis/${name}.git`, revision);
    git('checkout', '-q', '--detach', 'FETCH_HEAD');
  }
  return dir;
}

const lua = checkout('CardScripts', scriptsRevision, process.env.OCG_SCRIPTS_DIR);
const database = checkout('BabelCDB', databaseRevision, process.env.OCG_DATABASE_DIR);
const db = new DatabaseSync(resolve(database, 'cards.cdb'), { readOnly: true });
const query = db.prepare('SELECT datas.*, texts.name, texts.desc FROM datas JOIN texts USING(id)');
query.setReadBigInts(true);
const cards = query.all();
db.close();
const scripts = {};
for (const folder of [lua, resolve(lua, 'official')]) {
  for (const name of readdirSync(folder).filter(name => name.endsWith('.lua'))) scripts[name] = readFileSync(resolve(folder, name), 'utf8');
}
mkdirSync(assets, { recursive: true });
writeFileSync(output + '.tmp', gzipSync(JSON.stringify({ cards, scripts }, (_key, value) => typeof value === 'bigint' ? value.toString() : value)));
renameSync(output + '.tmp', output);
writeFileSync(resolve(assets, 'CardScripts-COPYING'), readFileSync(resolve(lua, 'COPYING')));
writeFileSync(resolve(assets, 'revision'), version);
