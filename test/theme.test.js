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

// ---- the inline script in index.html must follow the same rule ----

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));

function inlineScript() {
  const m = head.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(m, 'index.html has an inline script in <head>');
  return m[1];
}

function runInline(saved, device) {
  // saved: string | null | 'THROW'; device: true | false | 'THROW' | 'ABSENT'
  const attrs = {};
  const meta = (content) => ({ content, setAttribute(k, v) { assert.equal(k, 'content'); this.content = v; } });
  const metas = { 'meta[name=color-scheme]': meta('dark'), 'meta[name=theme-color]': meta('#070b14') };
  const el = (sel) => {
    const key = sel.replace(/"/g, '');
    return metas[key] || null;
  };
  const win = {
    document: {
      documentElement: { setAttribute: (k, v) => { attrs[k] = v; } },
      querySelector: el
    },
    localStorage: {
      getItem: (k) => {
        assert.equal(k, T.STORAGE_KEY);
        if (saved === 'THROW') throw new Error('blocked');
        return saved;
      }
    }
  };
  if (device !== 'ABSENT') {
    win.matchMedia = (q) => {
      assert.match(q, /prefers-color-scheme:\s*dark/);
      if (device === 'THROW') throw new Error('nope');
      return { matches: device };
    };
  }
  const ctx = vm.createContext(Object.assign({}, win, { window: win }));
  vm.runInContext(inlineScript(), ctx);
  return { theme: attrs['data-theme'], scheme: metas['meta[name=color-scheme]'].content, color: metas['meta[name=theme-color]'].content };
}

test('the inline head script runs before the stylesheet', () => {
  assert.ok(head.indexOf('<script>') > 0);
  assert.ok(head.indexOf('<script>') < head.indexOf('href="style.css"'));
  assert.ok(head.indexOf('<script>') > head.indexOf('name="theme-color"'), 'the meta tags exist before it runs');
});

test('the inline head script gives the same answer as resolveTheme', () => {
  const savedCases = [null, 'light', 'dark', 'auto', 'LIGHT', '', 'THROW'];
  const deviceCases = [true, false, 'THROW', 'ABSENT'];
  savedCases.forEach((saved) => {
    deviceCases.forEach((device) => {
      const s = saved === 'THROW' ? null : saved;
      const d = device === true || device === false ? device : undefined;
      const want = T.resolveTheme(s, d);
      const got = runInline(saved, device);
      const label = 'saved=' + saved + ' device=' + device;
      assert.equal(got.theme, want, label);
      assert.equal(got.scheme, want, label);
      assert.equal(got.color, T.THEME_COLOR[want], label);
    });
  });
});
