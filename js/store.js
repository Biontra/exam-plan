/* App state, storage and the one computed plan. Nothing here touches the DOM. */
export const P = window.ExamPlan;

const KEY_V2 = 'exam-plan:v2';
const KEY_V1 = 'exam-plan:v1';

export const state = {
  exams: [],
  progress: {},     // { examId: { 'YYYY-MM-DD': hours } }
  weekday: '3',     // raw text of the hour inputs, so typing is never rewritten
  weekend: '',
  lang: 'en',
  sound: true,
  focusMin: 25,
  onboarded: false,
  storageOk: true,
  tab: 'today'
};

const listeners = [];
let version = 0;
let cached = null;

export function subscribe(fn) { listeners.push(fn); }

export function today() { return P.todayString(); }

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- storage (never throws) ----------

function readKey(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch (err) {
    state.storageOk = false;
    return null;
  }
}

export function load() {
  const data = readKey(KEY_V2) || readKey(KEY_V1); // v1 had no progress, topic lists or settings below
  if (!data) return;
  if (data.lang === 'tr' || data.lang === 'en') state.lang = data.lang;
  if (typeof data.weekday === 'string' && !P.validateHours(data.weekday, false).error) state.weekday = data.weekday;
  if (typeof data.weekend === 'string' && !P.validateHours(data.weekend, true).error) state.weekend = data.weekend;
  if (typeof data.sound === 'boolean') state.sound = data.sound;
  if (Number.isInteger(data.focusMin) && data.focusMin >= 15 && data.focusMin <= 50) state.focusMin = data.focusMin;
  state.onboarded = data.onboarded === true || (Array.isArray(data.exams) && data.exams.length > 0);
  if (Array.isArray(data.exams)) {
    const names = {};
    data.exams.slice(0, P.MAX_EXAMS).forEach((e) => {
      const c = P.sanitizeExam(e);
      if (!c || names[c.name.toLowerCase()]) return;
      names[c.name.toLowerCase()] = true;
      state.exams.push(c);
    });
  }
  state.progress = P.sanitizeProgress(data.progress, state.exams.map((e) => e.id));
}

export function save() {
  try {
    window.localStorage.setItem(KEY_V2, JSON.stringify({
      v: 2, lang: state.lang, weekday: state.weekday, weekend: state.weekend,
      sound: state.sound, focusMin: state.focusMin, onboarded: state.onboarded,
      exams: state.exams, progress: state.progress
    }));
  } catch (err) {
    state.storageOk = false;
  }
}

// Save, drop the cached plan and tell the views to redraw.
export function commit() {
  version++;
  save();
  listeners.forEach((fn) => fn());
}

// ---------- derived ----------

export function settings() {
  const wd = P.validateHours(state.weekday, false);
  const we = P.validateHours(state.weekend, true);
  return { weekdayHours: wd.error ? 3 : wd.value, weekendHours: we.error ? null : we.value };
}

export function plan() {
  const td = today();
  const key = version + '|' + td + '|' + state.weekday + '|' + state.weekend;
  if (!cached || cached.key !== key) {
    cached = { key, value: P.replan(state.exams, settings(), state.progress, td) };
  }
  return cached.value;
}

export function invalidate() { version++; }

// ---------- changes ----------

export function logHours(examId, delta) {
  state.progress = P.addProgress(state.progress, examId, today(), delta);
  commit();
}

export function setHours(examId, hours) {
  state.progress = P.setProgress(state.progress, examId, today(), hours);
  commit();
}

export function replaceAll(data) {
  state.exams = data.exams;
  state.progress = data.progress;
  state.weekday = data.weekday;
  state.weekend = data.weekend;
  state.onboarded = true;
  commit();
}

export function exportData() {
  return P.buildBackup({ exams: state.exams, progress: state.progress, weekday: state.weekday, weekend: state.weekend });
}
