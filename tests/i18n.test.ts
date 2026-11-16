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

test('Official card text feeds names, card text, effect labels and engine prompts', async () => {
  const { readFileSync } = await import('node:fs');
  const { setCardTexts, cardName, cardText, translatedDescription } = await import('../src/i18n/cards');
  const { effectDescription } = await import('../src/ocgcore/data');
  const { CARDS } = await import('../src/ocgcore/catalog');
  const spanish = JSON.parse(readFileSync('assets/i18n/cards/es.json', 'utf8'));
  setCardTexts(spanish, [83555666]);
  try {
    const darkMagician = CARDS.find((card) => card.name === 'Dark Magician')!;
    assert.equal(cardName(darkMagician), 'Mago Oscuro');
    assert.notEqual(cardText(darkMagician), darkMagician.text);
    // Ring of Destruction plays by its 2004 English text (src/ocgcore/overrides.ts), so its text is not replaced
    const ring = CARDS.find((card) => card.name === 'Ring of Destruction')!;
    assert.equal(cardText(ring), ring.text);
    assert.equal(effectDescription(31n, new Map()), '¿Atacar directamente con este monstruo?');
    assert.equal(translatedDescription((62121n << 20n) | 0n), spanish.strings['62121']['0']);
  } finally {
    setCardTexts(undefined);
  }
});

test('Arabic card text (Arab Duelists) feeds names and text, and leaves effect labels in English', async () => {
  const { readFileSync } = await import('node:fs');
  const { setCardTexts, cardName, cardText, translatedDescription } = await import('../src/i18n/cards');
  const { CARDS } = await import('../src/ocgcore/catalog');
  setCardTexts(JSON.parse(readFileSync('assets/i18n/cards/ar.json', 'utf8')));
  try {
    const darkMagician = CARDS.find((card) => card.name === 'Dark Magician')!;
    assert.equal(cardName(darkMagician), 'ساحر الظلام');
    assert.match(cardText(darkMagician), /[؀-ۿ]/);
    assert.equal(translatedDescription((62121n << 20n) | 0n), undefined);
  } finally {
    setCardTexts(undefined);
  }
});
