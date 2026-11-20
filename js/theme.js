/*
 * Light / dark theme. The rule is a pure function; the rest is small DOM and storage glue.
 * Loaded as a normal script (window.ExamTheme) and in Node (require) for the tests.
 * index.html runs the same rule inline in <head> so the first paint is already right;
 * test/theme.test.js checks that the inline copy and resolveTheme agree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExamTheme = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STORAGE_KEY = 'exam-plan:theme';
  var THEME_COLOR = { dark: '#070b14', light: '#f5f7fb' };

  // saved: what the user picked ('light' | 'dark'; anything else counts as "no choice").
  // systemPrefersDark: true / false from the device; anything else (unreadable) counts as dark.
  function resolveTheme(saved, systemPrefersDark) {
    if (saved === 'light' || saved === 'dark') return saved;
    return systemPrefersDark === false ? 'light' : 'dark';
  }

  function readSaved() {
    try { return window.localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }

  function saveChoice(theme) {
    try { window.localStorage.setItem(STORAGE_KEY, theme); } catch (e) { /* storage may be blocked */ }
  }

  function systemQuery() {
    try { return window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return null; }
  }

  function systemPrefersDark() {
    var q = systemQuery();
    return q ? q.matches : undefined;
  }

  function current() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  // Puts the theme on <html> and in the two <meta> tags the browser reads.
  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var cs = document.querySelector('meta[name="color-scheme"]');
    if (cs) cs.setAttribute('content', theme);
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', THEME_COLOR[theme]);
  }

  return {
    STORAGE_KEY: STORAGE_KEY,
    THEME_COLOR: THEME_COLOR,
    resolveTheme: resolveTheme,
    readSaved: readSaved,
    saveChoice: saveChoice,
    systemQuery: systemQuery,
    systemPrefersDark: systemPrefersDark,
    current: current,
    apply: apply
  };
}));
