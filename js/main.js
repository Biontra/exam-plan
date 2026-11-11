/* Exam Plan: wiring. Calculation lives in plan.js, text in i18n.js, views in this folder. */
import { state, P, load, save, commit, subscribe, plan as getPlan, today, replaceAll } from './store.js';
import { $, t, announce, runUndo, keepFocus, fmtLong } from './util.js';
import { renderMission, renderStats, renderTimeline, tick } from './dashboard.js';
import { renderToday, renderPlan, initPlan } from './today.js';
import { renderExams, renderFormErrors, renderFormMode, refreshMinDate, initExams, openForm } from './exams.js';
import { initSettings, syncSettingsInputs, renderHourErrors } from './settings.js';
import { initFocus, refreshFocus } from './focus.js';
import { initGuide, openGuide, refreshGuide } from './onboarding.js';

let icsUrl = null;
let lastToday = today();
let firstDraw = true;

// ---------- static text ----------

function applyLang() {
  document.documentElement.lang = state.lang;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.getAttribute('data-i18n')); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((n) => { n.setAttribute('placeholder', t(n.getAttribute('data-i18n-placeholder'))); });
  document.querySelectorAll('[data-i18n-aria-label]').forEach((n) => { n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria-label'))); });
  ['en', 'tr'].forEach((l) => { $('lang-' + l).setAttribute('aria-pressed', String(state.lang === l)); });
  renderFormMode();
  syncSettingsInputs();
}

// ---------- .ics ----------

function updateIcs(plan) {
  const link = $('ics-link');
  if (icsUrl) { try { URL.revokeObjectURL(icsUrl); } catch (e) { /* ignore */ } icsUrl = null; }
  try {
    // the calendar file lists the full remaining plan, today included
    const text = P.toICS(plan, state.exams, {
      labels: { study: t('ics.study'), review: t('ics.review'), exam: t('ics.exam'), hour: t('ics.hour') }
    });
    icsUrl = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
    link.setAttribute('href', icsUrl);
  } catch (e) {
    link.setAttribute('href', '#');
  }
}

// ---------- drawing ----------

function render() {
  keepFocus(() => {
    lastToday = today();
    const plan = getPlan();
    renderMission(plan, firstDraw);
    renderStats(plan);
    renderToday(plan);
    renderTimeline(plan);
    renderPlan(plan, updateIcs);
    renderExams(plan);
    wireDynamic();
    $('storage-note').hidden = state.storageOk;
    firstDraw = false;
  });
}

// buttons that are rebuilt on every draw
function wireDynamic() {
  const sample = $('sample-btn');
  if (sample) sample.addEventListener('click', addSamples);
  const add = $('goto-add');
  if (add) add.addEventListener('click', () => { setTab('exams'); openForm(true); });
  const empty = $('exams-sample');
  if (empty && !empty.dataset.wired) { empty.dataset.wired = '1'; empty.addEventListener('click', addSamples); }
}

function addSamples() {
  const data = P.sampleData(today(), t('sample.names'), t('sample.topics'));
  if (state.exams.length) {
    // keep what the person already has: add only samples whose name is free
    const names = state.exams.map((e) => e.name.toLowerCase());
    data.exams = data.exams.filter((e) => names.indexOf(e.name.toLowerCase()) < 0);
    const ids = data.exams.map((e) => e.id);
    Object.keys(data.progress).forEach((id) => { if (ids.indexOf(id) < 0) delete data.progress[id]; });
    state.exams = state.exams.concat(data.exams);
    state.progress = Object.assign({}, state.progress, data.progress);
    state.onboarded = true;
    commit();
  } else {
    replaceAll({ exams: data.exams, progress: data.progress, weekday: state.weekday, weekend: state.weekend });
  }
  announce(t('status.sample', { n: data.exams.length }));
  setTab('today');
}

// ---------- tabs (tablist at the top on desktop, at the bottom on phones) ----------

const TABS = ['today', 'plan', 'exams', 'settings'];
const TAB_KEY = 'exam-plan:tab';

function storedTab() {
  try { const v = window.localStorage.getItem(TAB_KEY); return TABS.indexOf(v) >= 0 ? v : null; } catch (e) { return null; }
}

function hashTab() {
  const h = window.location.hash.replace(/^#/, '');
  return TABS.indexOf(h) >= 0 ? h : null;
}

// Shows one panel. The URL hash is the source of truth, so the back button works.
function showTab(tab) {
  const changed = state.tab !== tab || document.body.dataset.tab !== tab;
  state.tab = tab;
  document.body.dataset.tab = tab;
  TABS.forEach((name) => {
    const b = $('tab-' + name);
    const on = name === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    $('panel-' + name).hidden = !on;
  });
  try { window.localStorage.setItem(TAB_KEY, tab); } catch (e) { /* storage may be blocked */ }
  if (changed) window.scrollTo(0, 0);
}

function setTab(tab) {
  if (TABS.indexOf(tab) < 0) return;
  if (hashTab() !== tab) window.location.hash = tab; // adds a history entry; hashchange repeats showTab harmlessly
  showTab(tab);
}

// The compact timeline sits above the Today blocks; on phones it moves to the Plan tab to keep Today short.
function placeTimeline(phone) {
  const sec = $('timeline-sec');
  if (phone) $('panel-plan').insertBefore(sec, $('panel-plan').firstChild);
  else $('panel-today').insertBefore(sec, $('panel-today').firstChild);
}

function initTabs() {
  const mq = window.matchMedia('(max-width: 719px)');
  placeTimeline(mq.matches);
  const onMq = (ev) => placeTimeline(ev.matches);
  if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  const list = $('tablist');
  list.addEventListener('click', (ev) => {
    const b = ev.target.closest ? ev.target.closest('[role="tab"]') : null;
    if (b) setTab(b.dataset.tab);
  });
  list.addEventListener('keydown', (ev) => {
    const i = TABS.indexOf(state.tab);
    let n = -1;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') n = (i + 1) % TABS.length;
    else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') n = (i + TABS.length - 1) % TABS.length;
    else if (ev.key === 'Home') n = 0;
    else if (ev.key === 'End') n = TABS.length - 1;
    if (n < 0) return;
    ev.preventDefault();
    setTab(TABS[n]);
    $('tab-' + TABS[n]).focus();
  });
  window.addEventListener('hashchange', () => { const h = hashTab(); if (h) showTab(h); });
  const first = hashTab() || storedTab() || 'today';
  showTab(first);
  if (hashTab() !== first) { try { window.history.replaceState(null, '', '#' + first); } catch (e) { /* ignore */ } }
}

// ---------- start ----------

function init() {
  load();
  applyLang();
  initExams();
  initFocus();
  initSettings({ showGuide: openGuide, afterImport: () => setTab('today') });
  initGuide({ sample: addSamples });
  renderFormErrors();
  renderHourErrors();

  subscribe(render);
  $('print-btn').addEventListener('click', () => window.print());
  $('ics-link').addEventListener('click', () => announce(t('status.ics')));
  $('undo-btn').addEventListener('click', runUndo);
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => {
      state.lang = b.getAttribute('data-lang');
      save();
      applyLang();
      renderFormErrors();
      renderHourErrors();
      refreshFocus();
      refreshGuide();
      render();
    });
  });
  document.addEventListener('click', (ev) => {
    const go = ev.target.closest ? ev.target.closest('[data-goto]') : null;
    if (go) setTab(go.getAttribute('data-goto'));
  });

  // the clock; also moves the app to a new day when the page stays open overnight
  setInterval(() => {
    tick();
    if (today() !== lastToday) { refreshMinDate(); render(); }
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && today() !== lastToday) { refreshMinDate(); render(); }
  });

  initTabs();
  initPlan(render);
  render();
  if (!state.storageOk) $('storage-note').hidden = false;
  if (!state.onboarded && !state.exams.length) openGuide();
}

init();
