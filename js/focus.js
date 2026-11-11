/* Full-screen focus timer (Pomodoro). Time is read from timestamps, so a
   throttled background tab does not slow it down. */
import { state, P, save, logHours } from './store.js';
import { $, t, num, announce, trapFocus } from './util.js';

const BREAK_MIN = 5;
const R = 130;
const LEN = 2 * Math.PI * R;

let s = null;          // current session, null when the overlay is closed
let timer = null;
let releaseTrap = null;
let openerKey = null;
let audio = null;

function mmss(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

function remaining() {
  if (!s) return 0;
  return s.running ? Math.max(0, s.endAt - Date.now()) : s.remainMs;
}

// ---------- sound ----------

function beep(kind) {
  if (!state.sound) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const tones = kind === 'break' ? [660, 880] : [880, 660, 880];
    tones.forEach((f, i) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      const at = audio.currentTime + i * 0.2;
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);
      o.connect(g); g.connect(audio.destination);
      o.start(at); o.stop(at + 0.18);
    });
  } catch (err) { /* no audio available: the timer still works */ }
}

// ---------- drawing ----------

function phaseName() { return s.phase === 'break' ? t('focus.break') : t('focus.focus'); }

function title() {
  if (!s) return;
  document.title = s.phase === 'ready' ? t('title') : mmss(remaining()) + ' · ' + phaseName() + ' — ' + t('title');
}

function paint() {
  if (!s) return;
  const ms = s.phase === 'ready' ? s.lenMin * 60000 : remaining();
  const total = s.phase === 'ready' ? ms : s.totalMs;
  $('focus-time').textContent = mmss(ms);
  const arc = $('focus-arc');
  arc.style.strokeDasharray = LEN.toFixed(1);
  arc.style.strokeDashoffset = (LEN * (1 - (total > 0 ? ms / total : 0))).toFixed(1);
  title();
}

function layout() {
  const ready = s.phase === 'ready';
  const focus = s.phase === 'focus';
  const brk = s.phase === 'break';
  $('focus').dataset.phase = s.phase;
  $('focus').dataset.running = String(s.running);
  $('focus-mode').textContent = ready ? t('focus.ready') : phaseName();
  $('focus-title').textContent = s.name;
  $('focus-len').hidden = !ready;
  $('len-val').textContent = t('focus.min', { n: s.lenMin });
  $('len-minus').disabled = s.lenMin <= 15;
  $('len-plus').disabled = s.lenMin >= 50;
  const main = $('focus-main');
  main.textContent = ready ? t(s.rounds ? 'focus.again' : 'focus.begin') : s.running ? t('focus.pause') : t('focus.resume');
  $('focus-end').hidden = ready || brk;
  $('focus-skip').hidden = !brk;
  $('focus-hint').textContent = ready ? t('focus.hintReady', { min: s.lenMin }) : focus ? t('focus.hintFocus') : t('focus.hintBreak');
  $('focus-logged').textContent = s.logged > 0 ? t('focus.logged', { h: num(s.logged), name: s.name }) : '';
  $('focus-sound').setAttribute('aria-pressed', String(state.sound));
  $('focus-sound').textContent = state.sound ? t('focus.soundOn') : t('focus.soundOff');
  paint();
}

function say(text) { $('focus-sr').textContent = text; }

// ---------- state changes ----------

function begin() {
  s.phase = 'focus';
  s.totalMs = s.lenMin * 60000;
  s.remainMs = s.totalMs;
  s.endAt = Date.now() + s.totalMs;
  s.running = true;
  say(t('focus.sayStart', { min: s.lenMin }));
  layout();
}

function pause() {
  s.remainMs = Math.max(0, s.endAt - Date.now());
  s.running = false;
  say(t('focus.sayPause'));
  layout();
}

function resume() {
  s.endAt = Date.now() + s.remainMs;
  s.running = true;
  say(t('focus.sayResume'));
  layout();
}

// Credit the time actually spent in the focus phase.
function credit() {
  const spentMin = (s.totalMs - remaining()) / 60000;
  const hours = P.focusCredit(spentMin);
  if (hours > 0) { logHours(s.examId, hours); s.logged += hours; }
  return hours;
}

function finishFocus() {
  credit();
  s.rounds += 1;
  beep('focus');
  s.phase = 'break';
  s.totalMs = BREAK_MIN * 60000;
  s.remainMs = s.totalMs;
  s.endAt = Date.now() + s.totalMs;
  s.running = true;
  say(t('focus.sayDone', { h: num(s.logged) }));
  layout();
}

function finishBreak() {
  beep('break');
  s.phase = 'ready';
  s.running = false;
  say(t('focus.sayBreakOver'));
  layout();
}

function onMain() {
  if (!s) return;
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) { /* ignore */ }
  if (s.phase === 'ready') begin();
  else if (s.running) pause();
  else resume();
}

function tick() {
  if (!s || s.phase === 'ready' || !s.running) { if (s) paint(); return; }
  if (remaining() <= 0) { if (s.phase === 'focus') finishFocus(); else finishBreak(); return; }
  paint();
}

function end() {
  if (!s) return;
  if (s.phase === 'focus') credit();
  close();
}

function close() {
  if (!s) return;
  const logged = s.logged, name = s.name;
  clearInterval(timer);
  timer = null;
  if (releaseTrap) releaseTrap();
  releaseTrap = null;
  s = null;
  $('focus').hidden = true;
  document.body.classList.remove('focus-open');
  document.title = t('title');
  const back = openerKey ? document.querySelector('[data-fk="' + openerKey + '"]') : null;
  if (back) back.focus();
  if (logged > 0) announce(t('focus.endLogged', { h: num(logged), name }));
}

export function openFocus(examId) {
  const e = state.exams.find((x) => x.id === examId);
  if (!e || s) return;
  openerKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk || null : null;
  s = { examId, name: e.name, phase: 'ready', running: false, lenMin: state.focusMin, totalMs: 0, remainMs: 0, endAt: 0, rounds: 0, logged: 0 };
  $('focus').hidden = false;
  document.body.classList.add('focus-open');
  releaseTrap = trapFocus($('focus'), end);
  timer = setInterval(tick, 250);
  layout();
  say(t('focus.sayOpen', { name: e.name }));
  $('focus-main').focus();
}

export function isFocusOpen() { return !!s; }

// language switch while the overlay is open
export function refreshFocus() { if (s) layout(); }

export function initFocus() {
  const arc = $('focus-arc');
  arc.style.strokeDasharray = LEN.toFixed(1);
  $('focus-main').addEventListener('click', onMain);
  $('focus-end').addEventListener('click', end);
  $('focus-close').addEventListener('click', end);
  $('focus-skip').addEventListener('click', () => { if (s && s.phase === 'break') finishBreak(); });
  $('len-minus').addEventListener('click', () => setLen(-5));
  $('len-plus').addEventListener('click', () => setLen(5));
  $('focus-sound').addEventListener('click', () => {
    state.sound = !state.sound;
    save();
    const box = $('set-sound'); if (box) box.checked = state.sound;
    if (s) layout();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

function setLen(d) {
  if (!s || s.phase !== 'ready') return;
  s.lenMin = Math.max(15, Math.min(50, s.lenMin + d));
  state.focusMin = s.lenMin;
  save();
  const r = $('set-focus'); if (r) { r.value = String(s.lenMin); r.dispatchEvent(new Event('input')); }
  layout();
}
