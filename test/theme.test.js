'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/theme.js');

test('a saved choice wins over the device setting', () => {
  assert.equal(T.resolveTheme('light', true), 'light');
  assert.equal(T.resolveTheme('dark', false), 'dark');
  assert.equal(T.resolveTheme('light', false), 'light');
  assert.equal(T.resolveTheme('dark', true), 'dark');
});

test('without a saved choice the device setting decides', () => {
  assert.equal(T.resolveTheme(null, true), 'dark');
  assert.equal(T.resolveTheme(null, false), 'light');
  assert.equal(T.resolveTheme(undefined, false), 'light');
});

test('an unreadable device setting means dark', () => {
  assert.equal(T.resolveTheme(null, undefined), 'dark');
  assert.equal(T.resolveTheme(null, null), 'dark');
  assert.equal(T.resolveTheme('', undefined), 'dark');
});

test('an invalid saved value is ignored', () => {
  ['auto', 'system', 'LIGHT', ' light', 'Dark', '', 0, 1, true, {}, [], 'light '].forEach((bad) => {
    assert.equal(T.resolveTheme(bad, false), 'light', 'device light, saved ' + JSON.stringify(bad));
    assert.equal(T.resolveTheme(bad, true), 'dark', 'device dark, saved ' + JSON.stringify(bad));
  });
});

test('the theme is stored under its own key, not in the exam data', () => {
  assert.equal(T.STORAGE_KEY, 'exam-plan:theme');
});

test('browser colours exist for both themes', () => {
  assert.match(T.THEME_COLOR.dark, /^#[0-9a-f]{6}$/i);
  assert.match(T.THEME_COLOR.light, /^#[0-9a-f]{6}$/i);
  assert.notEqual(T.THEME_COLOR.dark, T.THEME_COLOR.light);
});
