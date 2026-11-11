/* Exams tab: ring cards, topic checklists and the add/edit form. */
import { state, P, today, newId, commit } from './store.js';
import { $, el, t, num, pct, fmtLong, fmtTime, dayDiff, announce, diffColor, hoursText } from './util.js';
import { ring } from './ring.js';

let editingId = null;
let formChoice = null; // true/false once the person opens or closes the form; null = automatic
let errors = {};
const openTopics = new Set();

const FIELDS = { name: 'f-name', date: 'f-date', time: 'f-time', difficulty: 'f-diff', topics: 'f-topics' };

// ---------- cards ----------

function countdownText(diff) {
  if (diff === 0) return t('card.today');
  if (diff === 1) return t('card.tomorrow');
  if (diff > 1) return t('card.days', { n: diff });
  return t('card.pastAgo', { n: -diff });
}

function topicsBlock(e) {
  const done = e.checklist.filter((c) => c.done).length;
  const d = el('details', { class: 'topics', 'data-id': e.id });
  if (openTopics.has(e.id)) d.open = true;
  d.addEventListener('toggle', () => { if (d.open) openTopics.add(e.id); else openTopics.delete(e.id); });
  d.appendChild(el('summary', { 'data-fk': 'sum-' + e.id },
    el('span', { text: t('topics.title') }),
    el('span', { class: 'sum-count', text: e.checklist.length ? done + '/' + e.checklist.length : t('topics.none') })));
  const ul = el('ul', { class: 'check' });
  e.checklist.forEach((c) => {
    const id = 'ck-' + c.id;
    const cb = el('input', { type: 'checkbox', id, 'data-fk': 'ck-' + c.id });
    cb.checked = c.done;
    cb.addEventListener('change', () => { c.done = cb.checked; commit(); });
    const del = el('button', { type: 'button', class: 'btn icon', 'data-fk': 'cd-' + c.id, 'aria-label': t('topics.deleteLabel', { text: c.text }), text: '×' });
    del.addEventListener('click', () => {
      e.checklist = e.checklist.filter((x) => x.id !== c.id);
      commit();
    });
    ul.appendChild(el('li', { class: c.done ? 'is-done' : '' }, el('label', { for: id }, cb, el('span', { text: c.text })), del));
  });
  d.appendChild(ul);
  if (e.checklist.length < P.MAX_CHECKLIST) {
    const input = el('input', { type: 'text', maxlength: String(P.MAX_ITEM), id: 'ti-' + e.id, 'data-fk': 'ti-' + e.id, 'aria-label': t('topics.addLabel', { name: e.name }), placeholder: t('topics.ph'), autocomplete: 'off' });
    const btn = el('button', { type: 'submit', class: 'btn', text: t('topics.add') });
    const form = el('form', { class: 'topic-add', novalidate: true }, input, btn);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const text = input.value.replace(/\s+/g, ' ').trim().slice(0, P.MAX_ITEM);
      if (!text) { input.focus(); return; }
      e.checklist.push({ id: newId() + e.checklist.length, text, done: false });
      openTopics.add(e.id);
      commit();
      const again = document.getElementById('ti-' + e.id);
      if (again) again.focus();
    });
    d.appendChild(form);
  } else {
    d.appendChild(el('p', { class: 'hint', text: t('topics.max', { n: P.MAX_CHECKLIST }) }));
  }
  return d;
}

function card(e, rec, animate, past) {
  const td = today();
  const diff = dayDiff(e.date, td);
  const col = diffColor(e.difficulty);
  const when = fmtLong(e.date) + (e.time ? ', ' + fmtTime(e.time) : '');
  const topicTotal = e.checklist.length;
  const topicDone = e.checklist.filter((c) => c.done).length;
  const need = P.neededSlots(e) / 2;
  const done = rec ? rec.doneHours : 0;
  const ratio = rec ? rec.ratio : 0;
  const label = t('ring.label', { name: e.name, done: num(Math.min(done, need)), need: num(need), p: pct(ratio) }) +
    (topicTotal ? ', ' + t('ring.topics', { a: topicDone, b: topicTotal }) : '');
  const r = ring({ ratio: past ? 0 : ratio, topicRatio: topicTotal ? topicDone / topicTotal : null, color: col, label, text: past ? '–' : pct(ratio) + '%', size: 96, animate: animate && !past });

  const chips = el('div', { class: 'chips' }, el('span', { class: 'chip ' + col, text: t('diff.' + e.difficulty) }));
  if (e.topics) chips.appendChild(el('span', { class: 'chip', text: e.topics === 1 ? t('card.topic1') : t('card.topics', { n: e.topics }) }));
  if (!past) chips.appendChild(el('span', { class: 'chip', text: t('card.hoursDone', { a: num(Math.min(done, need)), b: num(need) }) }));

  const edit = el('button', { type: 'button', class: 'btn', 'data-fk': 'ed-' + e.id, 'aria-label': t('card.editLabel', { name: e.name }), text: t('card.edit') });
  const del = el('button', { type: 'button', class: 'btn danger', 'data-fk': 'dl-' + e.id, 'aria-label': t('card.deleteLabel', { name: e.name }), text: t('card.delete') });
  edit.addEventListener('click', () => startEdit(e.id));
  del.addEventListener('click', () => deleteExam(e.id));

  const cls = 'xcard c-' + col + (diff === 0 ? ' is-today' : diff === 1 ? ' is-tomorrow' : diff < 0 ? ' is-past' : '');
  return el('li', { class: cls },
    el('div', { class: 'xcard-top' },
      r,
      el('div', { class: 'xcard-info' },
        el('h3', { text: e.name }),
        el('p', { class: 'meta', text: when }),
        el('p', { class: 'xcount', text: countdownText(diff) }),
        chips)),
    topicsBlock(e),
    el('div', { class: 'actions' }, edit, del));
}

let animatedOnce = false;

export function renderExams(plan) {
  const td = today();
  const recs = {};
  plan.exams.forEach((x) => { recs[x.id] = x; });
  const up = [], past = [];
  state.exams.forEach((e) => { (dayDiff(e.date, td) >= 0 ? up : past).push(e); });
  up.sort((a, b) => (a.date + (a.time || '')) < (b.date + (b.time || '')) ? -1 : 1);
  past.sort((a, b) => (a.date < b.date ? 1 : -1));
  const list = $('exam-list'), pl = $('past-list');
  list.textContent = ''; pl.textContent = '';
  const animate = !animatedOnce;
  up.forEach((e) => list.appendChild(card(e, recs[e.id], animate, false)));
  past.forEach((e) => pl.appendChild(card(e, null, false, true)));
  animatedOnce = true;
  $('exams-empty').hidden = state.exams.length > 0;
  $('past-wrap').hidden = past.length === 0;
  syncForm();
}

// ---------- add form: closed behind one button, open when there is no exam yet ----------

function formOpen() { return editingId ? true : formChoice !== null ? formChoice : state.exams.length === 0; }

function syncForm() {
  const open = formOpen();
  $('form-panel').hidden = !open;
  $('add-toggle').setAttribute('aria-expanded', String(open));
}

export function openForm(focus) {
  formChoice = true;
  syncForm();
  if (focus) $('f-name').focus();
}

function closeForm(focusToggle) {
  formChoice = false;
  syncForm();
  if (focusToggle) $('add-toggle').focus();
}

// ---------- form ----------

function paintError(field, code) {
  const input = $(FIELDS[field]);
  const msg = $('err-' + field);
  if (code) { msg.textContent = t('err.' + code); input.setAttribute('aria-invalid', 'true'); }
  else { msg.textContent = ''; input.removeAttribute('aria-invalid'); }
}

export function renderFormErrors() {
  Object.keys(FIELDS).forEach((f) => paintError(f, errors[f]));
}

export function renderFormMode() {
  $('form-title').textContent = t(editingId ? 'form.edit' : 'form.add');
  $('submit-btn').textContent = t(editingId ? 'form.saveBtn' : 'form.addBtn');
  $('cancel-btn').hidden = !editingId;
}

function readForm() {
  return { name: $('f-name').value, date: $('f-date').value, time: $('f-time').value, difficulty: $('f-diff').value, topics: $('f-topics').value };
}

function resetForm() {
  $('exam-form').reset();
  $('f-diff').value = 'medium';
  editingId = null;
  errors = {};
  $('f-date').setAttribute('min', today());
  renderFormMode();
  renderFormErrors();
}

export function refreshMinDate() { if (!editingId) $('f-date').setAttribute('min', today()); }

function onSubmit(ev) {
  ev.preventDefault();
  if (!editingId && state.exams.length >= P.MAX_EXAMS) { announce(t('err.max', { n: P.MAX_EXAMS }), { bad: true }); return; }
  const res = P.validateExam(readForm(), { exams: state.exams, today: today(), editingId });
  const fields = Object.keys(res.errors);
  errors = res.errors;
  renderFormErrors();
  if (fields.length) {
    const first = ['name', 'date', 'time', 'difficulty', 'topics'].filter((f) => res.errors[f])[0];
    $(FIELDS[first]).focus();
    announce(t('status.notSaved', { n: fields.length }), { bad: true });
    return;
  }
  const v = res.value;
  if (editingId) {
    state.exams = state.exams.map((e) => (e.id === editingId ? Object.assign({}, e, v) : e));
    announce(t('status.saved', { name: v.name }));
  } else {
    state.exams.push(Object.assign({ id: newId(), checklist: [] }, v));
    announce(t('status.added', { name: v.name }));
  }
  state.onboarded = true;
  resetForm();
  formChoice = false;
  commit();
  $('add-toggle').focus();
}

function startEdit(id) {
  const e = state.exams.filter((x) => x.id === id)[0];
  if (!e) return;
  editingId = id;
  errors = {};
  $('f-name').value = e.name;
  $('f-date').value = e.date;
  $('f-date').removeAttribute('min'); // an old exam may keep its date
  $('f-time').value = e.time || '';
  $('f-diff').value = e.difficulty;
  $('f-topics').value = e.topics || '';
  renderFormMode();
  renderFormErrors();
  syncForm();
  $('form-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('f-name').focus({ preventScroll: true });
}

function deleteExam(id) {
  const idx = state.exams.findIndex((e) => e.id === id);
  if (idx < 0) return;
  const removed = state.exams.splice(idx, 1)[0];
  const rows = state.progress[id];
  const nextProgress = Object.assign({}, state.progress);
  delete nextProgress[id];
  state.progress = nextProgress;
  if (editingId === id) resetForm();
  commit();
  announce(t('status.deleted', { name: removed.name }), {
    undo: () => {
      state.exams.splice(Math.min(idx, state.exams.length), 0, removed);
      if (rows) state.progress = Object.assign({}, state.progress, { [id]: rows });
      commit();
      announce(t('status.restored', { name: removed.name }));
    }
  });
}

export function initExams() {
  $('exam-form').addEventListener('submit', onSubmit);
  $('cancel-btn').addEventListener('click', () => { resetForm(); closeForm(true); });
  $('add-toggle').addEventListener('click', () => {
    if (formOpen() && !editingId) closeForm(false);
    else if (editingId) { /* editing keeps the form open; Cancel closes it */ $('f-name').focus(); }
    else openForm(true);
  });
  $('f-date').setAttribute('min', today());
  renderFormMode();
}

export function isEditing() { return !!editingId; }
