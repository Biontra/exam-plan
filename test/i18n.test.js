'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// i18n.js is a plain browser script that fills window.I18N; run it with a stand-in window.
function loadDictionaries() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'i18n.js'), 'utf8'), sandbox);
  return sandbox.window.I18N;
}

const placeholders = (s) => (typeof s === 'string' ? (s.match(/\{\w+\}/g) || []).sort() : []);

test('Turkish and English have exactly the same keys', () => {
  const { en, tr } = loadDictionaries();
  const missingInTr = Object.keys(en).filter((k) => !(k in tr));
  const missingInEn = Object.keys(tr).filter((k) => !(k in en));
  assert.deepEqual(missingInTr, [], 'keys missing in Turkish');
  assert.deepEqual(missingInEn, [], 'keys missing in English');
});

test('each text uses the same {placeholders} in both languages', () => {
  const { en, tr } = loadDictionaries();
  const different = Object.keys(en).filter(
    (k) => k in tr && placeholders(en[k]).join() !== placeholders(tr[k]).join()
  );
  assert.deepEqual(different, []);
});

test('no text is left empty', () => {
  const { en, tr } = loadDictionaries();
  const empty = [];
  for (const [lang, dict] of [['en', en], ['tr', tr]]) {
    for (const k of Object.keys(dict)) {
      if (typeof dict[k] === 'string' && dict[k].trim() === '') empty.push(lang + ':' + k);
    }
  }
  assert.deepEqual(empty, []);
});
