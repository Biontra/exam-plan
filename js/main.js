/* Exam Plan: wiring. Calculation lives in plan.js, text in i18n.js, views in this folder. */
import { state, P, load, save, commit, subscribe, plan as getPlan, today, replaceAll } from './store.js';
import { $, t, announce, runUndo, keepFocus, fmtLong } from './util.js';
import { renderMission, renderStats, renderTimeline, tick } from './dashboard.js';
import { renderToday, renderPlan } from './today.js';
import { renderExams, renderFormErrors, renderFormMode, refreshMinDate, initExams } from './exams.js';
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
  if (add) add.addEventListener('click', () => { setTab('exams'); $('f-name').focus(); });
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

// ---------- tabs (phone) ----------

function setTab(tab) {
  state.tab = tab;
  document.body.dataset.tab = tab;
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
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
  document.querySelectorAll('.tabbar [data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
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

  setTab('today');
  render();
  if (!state.storageOk) $('storage-note').hidden = false;
  if (!state.onboarded && !state.exams.length) openGuide();
}

init();
