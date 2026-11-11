/* Small helpers shared by the views: DOM, text, number and date formatting. */
import { state, P } from './store.js';

export const $ = (id) => document.getElementById(id);

export function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach((k) => {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.className = v;
      else node.setAttribute(k, v === true ? '' : v);
    });
  }
  kids.forEach((c) => { if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return node;
}

export function t(key, params) {
  const dict = window.I18N[state.lang];
  const s = dict[key] !== undefined ? dict[key] : window.I18N.en[key];
  if (s === undefined) return key;
  if (typeof s !== 'string') return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (params && params[k] !== undefined ? params[k] : m));
}

export function num(n) {
  const s = String(Math.round(n * 10) / 10);
  return state.lang === 'tr' ? s.replace('.', ',') : s;
}

export function hoursText(n) {
  return t(n === 1 ? 'hour.one' : 'hour.many', { n: num(n) });
}

export function pct(r) { return Math.round(Math.max(0, Math.min(1, r)) * 100); }

function locale() {
  if (state.lang === 'tr') return 'tr-TR';
  const nav = (navigator.language || '').toLowerCase();
  return nav.indexOf('en') === 0 ? navigator.language : 'en-GB';
}

export function localDate(str) {
  const p = str.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function fmtDate(str, opts) {
  try { return new Intl.DateTimeFormat(locale(), opts).format(localDate(str)); } catch (e) { return str; }
}
export const fmtLong = (s) => fmtDate(s, { day: 'numeric', month: 'long', year: 'numeric' });
export const fmtDay = (s) => fmtDate(s, { weekday: 'long', day: 'numeric', month: 'short' });
export const fmtShort = (s) => fmtDate(s, { day: 'numeric', month: 'short' });

export function fmtTime(hhmm) {
  const p = hhmm.split(':');
  try {
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(2000, 0, 1, +p[0], +p[1]));
  } catch (e) { return hhmm; }
}

export function dayDiff(dateStr, todayStr) {
  return P.parseDate(dateStr) - P.parseDate(todayStr);
}

// Exam start as a local Date. Without a time, 09:00 is assumed.
export function examMoment(e) {
  const d = localDate(e.date);
  const p = (e.time || '09:00').split(':');
  d.setHours(+p[0], +p[1], 0, 0);
  return d;
}

export function diffColor(d) { return d === 'hard' ? 'amber' : d === 'easy' ? 'green' : 'cyan'; }

// ---------- status line (announced by screen readers) ----------

let statusTimer = null;
let undoHandler = null;

export function announce(text, opts) {
  opts = opts || {};
  const box = $('status');
  const txt = $('status-text');
  clearTimeout(statusTimer);
  txt.textContent = '';
  box.classList.toggle('bad', !!opts.bad);
  $('undo-btn').hidden = !opts.undo;
  undoHandler = opts.undo || null;
  // set on the next tick so the same message is announced again
  setTimeout(() => { txt.textContent = text; }, 30);
  statusTimer = setTimeout(() => {
    txt.textContent = '';
    $('undo-btn').hidden = true;
    undoHandler = null;
  }, opts.undo ? 9000 : 5000);
}

export function runUndo() {
  const fn = undoHandler;
  undoHandler = null;
  if (fn) fn();
}

// Redraw, then put keyboard focus back on the control that had it.
export function keepFocus(fn) {
  const a = document.activeElement;
  const key = a && a.dataset ? a.dataset.fk : null;
  fn();
  if (key) {
    const again = document.querySelector('[data-fk="' + key.replace(/"/g, '\\"') + '"]');
    if (again && again !== document.activeElement) again.focus({ preventScroll: true });
  }
}

// ---------- modal helper: focus trap + Esc ----------

export function trapFocus(root, onEscape) {
  const sel = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  function onKey(ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); onEscape(); return; }
    if (ev.key !== 'Tab') return;
    const items = Array.prototype.filter.call(root.querySelectorAll(sel), (n) => !n.hidden && n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
    else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
  }
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}
