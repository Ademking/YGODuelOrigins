import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseBundle } from '../../src/ocgcore/bundle';

const gz = readFileSync('assets/ocgcore/duel.json.gz');
const bytes = () => gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength) as ArrayBuffer;

test('the card data parses with and without DecompressionStream (iOS before 16.4)', async () => {
  const native = await parseBundle(bytes());
  const saved = globalThis.DecompressionStream;
  // @ts-expect-error removed to act like an old browser
  delete globalThis.DecompressionStream;
  try {
    const fallback = await parseBundle(bytes());
    assert.equal(fallback.cards.length, native.cards.length);
    assert.ok(fallback.cards.length > 0);
  } finally { globalThis.DecompressionStream = saved; }
});
