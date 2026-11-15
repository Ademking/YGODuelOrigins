// Every language must translate every interface string, with the same {placeholders} as the English.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DICTIONARIES, t } from '../src/i18n';
import { allKeys } from '../scripts/i18n-keys';

const keys = allKeys();
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
  test(`${locale} translates every interface string`, () => {
    const missing = keys.filter((key) => !(key in dictionary));
    assert.deepEqual(missing, [], `${locale} is missing ${missing.length} strings`);
  });
  test(`${locale} keeps the placeholders and has no stale strings`, () => {
    const wrong = keys.filter((key) => key in dictionary && placeholders(key).join() !== placeholders(dictionary[key]).join());
    assert.deepEqual(wrong, [], `${locale} placeholders differ`);
    const stale = Object.keys(dictionary).filter((key) => !keys.includes(key));
    assert.deepEqual(stale, [], `${locale} has strings the game no longer uses`);
    const empty = Object.entries(dictionary).filter(([, value]) => !value.trim()).map(([key]) => key);
    assert.deepEqual(empty, []);
  });
}

test('t fills placeholders and falls back to English', () => {
  assert.equal(t('Turn {n}', { n: 3 }), 'Turn 3');
  assert.equal(t('Not a translated string'), 'Not a translated string');
});
