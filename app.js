/* UI for Exam Plan. All calculation lives in plan.js; all text lives in i18n.js. */
(function () {
  'use strict';

  var P = window.ExamPlan;
  var STORE_KEY = 'exam-plan:v1';
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    exams: [],
    weekday: '3',     // raw text of the inputs, so the user's typing is never rewritten
    weekend: '',
    lang: 'en',
    editingId: null,
    errors: {},       // exam form: field -> error code
    hourErrors: {},   // hours form: weekday|weekend -> error code
    undo: null
  };
  var storageOk = true;
  var icsUrl = null;
  var statusTimer = null;
  var lastToday = P.todayString();

  // ---------- storage (never throws) ----------

  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      if (data.lang === 'tr' || data.lang === 'en') state.lang = data.lang;
      if (typeof data.weekday === 'string' && !P.validateHours(data.weekday, false).error) state.weekday = data.weekday;
      if (typeof data.weekend === 'string' && !P.validateHours(data.weekend, true).error) state.weekend = data.weekend;
      if (Array.isArray(data.exams)) {
        data.exams.forEach(function (e) {
          if (!e || typeof e.id !== 'string' || typeof e.name !== 'string') return;
          if (P.parseDate(e.date) === null || !P.DIFFICULTY[e.difficulty]) return;
          state.exams.push({
            id: e.id, name: e.name.slice(0, P.MAX_NAME), date: e.date,
            time: /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time || '') ? e.time : '',
            difficulty: e.difficulty,
            topics: Number.isInteger(e.topics) && e.topics >= 1 && e.topics <= P.MAX_TOPICS ? e.topics : null
          });
        });
      }
    } catch (err) {
      storageOk = false;
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1, lang: state.lang, weekday: state.weekday, weekend: state.weekend, exams: state.exams
      }));
    } catch (err) {
      storageOk = false;
      $('storage-note').hidden = false;
    }
  }

  // ---------- text helpers ----------

  function t(key, params) {
    var dict = window.I18N[state.lang];
    var s = dict[key] !== undefined ? dict[key] : window.I18N.en[key];
    if (s === undefined) return key;
    if (typeof s !== 'string') return s;
    return s.replace(/\{(\w+)\}/g, function (m, k) { return params && params[k] !== undefined ? params[k] : m; });
  }

  function num(n) {
    var s = String(Math.round(n * 10) / 10);
    return state.lang === 'tr' ? s.replace('.', ',') : s;
  }

  function hoursText(n) {
    return t(n === 1 ? 'hour.one' : 'hour.many', { n: num(n) });
  }

  function locale() {
    if (state.lang === 'tr') return 'tr-TR';
    var nav = (navigator.language || '').toLowerCase();
    return nav.indexOf('en') === 0 ? navigator.language : 'en-GB';
  }

  function localDate(str) {
    var p = str.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function fmtDate(str, opts) {
    try { return new Intl.DateTimeFormat(locale(), opts).format(localDate(str)); }
    catch (e) { return str; }
  }

  function fmtLong(str) { return fmtDate(str, { day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtDay(str) { return fmtDate(str, { weekday: 'long', day: 'numeric', month: 'short' }); }

  function fmtTime(hhmm) {
    var p = hhmm.split(':');
    try {
      return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(2000, 0, 1, +p[0], +p[1]));
    } catch (e) { return hhmm; }
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') node.textContent = attrs[k];
      else if (k === 'class') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  function dayDiff(dateStr) {
    return P.parseDate(dateStr) - P.parseDate(P.todayString());
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  // ---------- status line (announced by screen readers) ----------

  function announce(text, opts) {
    opts = opts || {};
    var box = $('status');
    var txt = $('status-text');
    clearTimeout(statusTimer);
    txt.textContent = '';
    box.classList.toggle('bad', !!opts.bad);
    $('undo-btn').hidden = !opts.undo;
    // set the text on the next tick so the same message is announced again
    setTimeout(function () { txt.textContent = text; }, 30);
    statusTimer = setTimeout(function () {
      txt.textContent = '';
      $('undo-btn').hidden = true;
      state.undo = null;
    }, opts.undo ? 9000 : 5000);
  }

  // ---------- static text ----------

  function applyLang() {
    document.documentElement.lang = state.lang;
    document.title = t('title');
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (n) {
      n.textContent = t(n.getAttribute('data-i18n'));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-placeholder]'), function (n) {
      n.setAttribute('placeholder', t(n.getAttribute('data-i18n-placeholder')));
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n-aria-label]'), function (n) {
      n.setAttribute('aria-label', t(n.getAttribute('data-i18n-aria-label')));
    });
    ['en', 'tr'].forEach(function (l) { $('lang-' + l).setAttribute('aria-pressed', String(state.lang === l)); });
    renderFormMode();
  }

  function renderFormMode() {
    var editing = !!state.editingId;
    $('form-title').textContent = t(editing ? 'form.edit' : 'form.add');
    $('submit-btn').textContent = t(editing ? 'form.saveBtn' : 'form.addBtn');
    $('cancel-btn').hidden = !editing;
  }

  // ---------- errors ----------

  var EXAM_FIELDS = { name: 'f-name', date: 'f-date', time: 'f-time', difficulty: 'f-diff', topics: 'f-topics' };
  var HOUR_FIELDS = { weekday: 'h-weekday', weekend: 'h-weekend' };

  function renderErrors() {
    Object.keys(EXAM_FIELDS).forEach(function (f) { paintError(f, EXAM_FIELDS[f], state.errors[f]); });
    Object.keys(HOUR_FIELDS).forEach(function (f) { paintError(f, HOUR_FIELDS[f], state.hourErrors[f]); });
  }

  function paintError(field, inputId, code) {
    var input = $(inputId);
    var msg = $('err-' + field);
    if (code) {
      msg.textContent = t('err.' + code);
      input.setAttribute('aria-invalid', 'true');
    } else {
      msg.textContent = '';
      input.removeAttribute('aria-invalid');
    }
  }

  // ---------- exam form ----------

  function readForm() {
    return {
      name: $('f-name').value, date: $('f-date').value, time: $('f-time').value,
      difficulty: $('f-diff').value, topics: $('f-topics').value
    };
  }

  function resetForm() {
    $('exam-form').reset();
    $('f-diff').value = 'medium';
    state.editingId = null;
    state.errors = {};
    $('f-date').setAttribute('min', P.todayString());
    renderFormMode();
    renderErrors();
  }

  function onSubmit(ev) {
    ev.preventDefault();
    var res = P.validateExam(readForm(), { exams: state.exams, today: P.todayString(), editingId: state.editingId });
    var fields = Object.keys(res.errors);
    state.errors = res.errors;
    renderErrors();
    if (fields.length) {
      var order = ['name', 'date', 'time', 'difficulty', 'topics'];
      var first = order.filter(function (f) { return res.errors[f]; })[0];
      $(EXAM_FIELDS[first]).focus();
      announce(t('status.notSaved', { n: fields.length }), { bad: true });
      return;
    }
    var v = res.value;
    if (state.editingId) {
      state.exams = state.exams.map(function (e) {
        return e.id === state.editingId ? Object.assign({}, v, { id: e.id }) : e;
      });
      announce(t('status.saved', { name: v.name }));
    } else {
      state.exams.push(Object.assign({ id: newId() }, v));
      announce(t('status.added', { name: v.name }));
    }
    save();
    resetForm();
    renderAll();
    $('f-name').focus();
  }

  function startEdit(id) {
    var e = state.exams.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    state.editingId = id;
    state.errors = {};
    $('f-name').value = e.name;
    $('f-date').value = e.date;
    $('f-date').removeAttribute('min'); // an old exam may keep its date
    $('f-time').value = e.time || '';
    $('f-diff').value = e.difficulty;
    $('f-topics').value = e.topics || '';
    renderFormMode();
    renderErrors();
    $('form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('f-name').focus({ preventScroll: true });
  }

  function deleteExam(id) {
    var idx = -1;
    state.exams.forEach(function (e, i) { if (e.id === id) idx = i; });
    if (idx < 0) return;
    var removed = state.exams.splice(idx, 1)[0];
    if (state.editingId === id) resetForm();
    state.undo = { exam: removed, index: idx };
    save();
    renderAll();
    announce(t('status.deleted', { name: removed.name }), { undo: true });
  }

  function undoDelete() {
    if (!state.undo) return;
    var back = state.undo;
    state.exams.splice(Math.min(back.index, state.exams.length), 0, back.exam);
    state.undo = null;
    save();
    renderAll();
    announce(t('status.restored', { name: back.exam.name }));
  }

  function addSamples() {
    var names = t('sample.names');
    var today = P.todayString();
    var base = P.parseDate(today);
    var rows = [
      { off: 3, difficulty: 'hard', topics: 6, time: '10:00' },
      { off: 5, difficulty: 'medium', topics: 5, time: '' },
      { off: 7, difficulty: 'hard', topics: null, time: '14:00' },
      { off: 8, difficulty: 'easy', topics: null, time: '' }
    ];
    rows.forEach(function (r, i) {
      state.exams.push({
        id: newId() + i, name: names[i], date: P.formatDate(base + r.off), time: r.time,
        difficulty: r.difficulty, topics: r.topics
      });
    });
    save();
    renderAll();
    announce(t('status.sample', { n: rows.length }));
  }

  // ---------- hours form ----------

  function onHoursInput() {
    var wd = P.validateHours($('h-weekday').value, false);
    var we = P.validateHours($('h-weekend').value, true);
    state.hourErrors = { weekday: wd.error, weekend: we.error };
    renderErrors();
    // keep the last valid values for the plan until both fields are valid
    if (!wd.error && !we.error) {
      state.weekday = $('h-weekday').value.trim();
      state.weekend = $('h-weekend').value.trim();
      save();
      renderPlan(true);
    } else {
      announce(t('status.hoursBad'), { bad: true });
    }
  }

  function settings() {
    var wd = P.validateHours(state.weekday, false);
    var we = P.validateHours(state.weekend, true);
    return { weekdayHours: wd.error ? 3 : wd.value, weekendHours: we.error ? null : we.value };
  }

  // ---------- rendering ----------

  function renderAll() {
    lastToday = P.todayString();
    $('empty').hidden = state.exams.length > 0;
    renderExams();
    renderPlan(false);
  }

  function countdownBlock(diff) {
    var c = el('div', { class: 'count' });
    if (diff === 0) c.appendChild(el('span', { class: 'word', text: t('card.today') }));
    else if (diff === 1) c.appendChild(el('span', { class: 'word', text: t('card.tomorrow') }));
    else if (diff > 1) {
      c.appendChild(el('span', { class: 'num', text: String(diff) }));
      c.appendChild(el('span', { class: 'unit', text: t('card.days', { n: '' }).trim() }));
    } else {
      c.appendChild(el('span', { class: 'word', text: t('card.past') }));
      c.appendChild(el('span', { class: 'unit', text: t('card.pastAgo', { n: -diff }) }));
    }
    return c;
  }

  function examCard(e) {
    var diff = dayDiff(e.date);
    var cls = 'card' + (diff === 0 ? ' is-today' : diff === 1 ? ' is-tomorrow' : diff < 0 ? ' is-past' : '');
    var when = fmtLong(e.date) + (e.time ? ', ' + fmtTime(e.time) : '');
    var chips = el('div', { class: 'chips' },
      el('span', { class: 'chip' + (e.difficulty === 'hard' ? ' hard' : ''), text: t('diff.' + e.difficulty) }));
    if (e.topics) chips.appendChild(el('span', { class: 'chip', text: e.topics === 1 ? t('card.topic1') : t('card.topics', { n: e.topics }) }));
    var edit = el('button', { type: 'button', class: 'btn', 'aria-label': t('card.editLabel', { name: e.name }), text: t('card.edit') });
    var del = el('button', { type: 'button', class: 'btn danger', 'aria-label': t('card.deleteLabel', { name: e.name }), text: t('card.delete') });
    edit.addEventListener('click', function () { startEdit(e.id); });
    del.addEventListener('click', function () { deleteExam(e.id); });
    return el('li', { class: cls },
      countdownBlock(diff),
      el('div', {}, el('h3', { text: e.name }), el('p', { class: 'meta', text: when }), chips),
      el('div', { class: 'actions' }, edit, del));
  }

  function renderExams() {
    var up = [], past = [];
    state.exams.forEach(function (e) { (dayDiff(e.date) >= 0 ? up : past).push(e); });
    up.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.time || '') < (b.time || '') ? -1 : 1; });
    past.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var list = $('exam-list'), pl = $('past-list');
    list.textContent = ''; pl.textContent = '';
    up.forEach(function (e) { list.appendChild(examCard(e)); });
    past.forEach(function (e) { pl.appendChild(examCard(e)); });
    $('exams-section').hidden = state.exams.length === 0;
    $('past-wrap').hidden = past.length === 0;
  }

  function renderPlan(announceIt) {
    var section = $('plan-section');
    if (!state.exams.length) { section.hidden = true; return; }
    section.hidden = false;
    var today = P.todayString();
    var plan = P.buildPlan(state.exams, settings(), today);
    var summary = $('plan-summary'), warnings = $('plan-warnings');
    var perExam = $('exam-hours'), days = $('day-list');
    summary.textContent = ''; warnings.textContent = ''; perExam.textContent = ''; days.textContent = '';

    var hasPlan = plan.exams.length > 0;
    $('ics-link').hidden = !hasPlan && !state.exams.some(function (e) { return dayDiff(e.date) >= 0; });
    $('print-btn').hidden = !hasPlan;
    $('print-meta').textContent = t('plan.printMeta', { date: fmtLong(today) });
    updateIcs(plan);

    if (!hasPlan) {
      var onlyToday = plan.skipped.some(function (s) { return s.reason === 'today'; });
      summary.textContent = t(onlyToday ? 'plan.onlyToday' : 'plan.noUpcoming');
      return;
    }

    var last = plan.exams[plan.exams.length - 1].date;
    var studyDays = plan.days.filter(function (d) { return d.items.length; }).length;
    summary.textContent = t(studyDays === 1 ? 'plan.summary1' : 'plan.summary', {
      days: studyDays, hours: num(plan.plannedHours), needed: num(plan.neededHours), date: fmtLong(last)
    });

    var zero = settings().weekdayHours === 0 && (settings().weekendHours === null || settings().weekendHours === 0);
    if (zero) warnings.appendChild(el('div', { class: 'note', text: t('plan.zeroHint') }));
    plan.shortages.forEach(function (s) {
      warnings.appendChild(el('div', { class: 'warn', text: t('plan.short', { name: s.name, hours: hoursText(s.hours) }) }));
    });

    plan.exams.forEach(function (e) {
      var bad = e.shortHours > 0;
      perExam.appendChild(el('li', {},
        el('span', { text: e.name }),
        el('span', { class: 'num' + (bad ? ' bad' : ''),
          text: num(e.plannedHours) + ' / ' + num(e.neededHours) + ' ' + t('plan.hours', { h: '' }).trim() +
            (bad ? ' (' + t('plan.shortBadge', { h: num(e.shortHours) }) + ')' : '') })));
    });

    plan.days.forEach(function (d, i) {
      var isFree = !d.items.length && !d.exams.length;
      var li = el('li', { class: 'day' + (d.exams.length ? ' has-exam' : '') + (isFree ? ' is-free' : '') });
      var name = el('span', { class: 'day-name', text: fmtDay(d.date) });
      if (i === 0) name.appendChild(el('span', { class: 'badge', text: t('plan.today') }));
      li.appendChild(el('div', { class: 'day-head' }, name,
        el('span', { class: 'day-total', text: t('plan.hoursOf', { h: num(d.totalHours), c: num(d.capacityHours) }) })));
      if (d.items.length) {
        var ul = el('ul', { class: 'items' });
        d.items.forEach(function (it) {
          var left = el('span', { text: it.name });
          if (it.review) left.appendChild(el('span', { class: 'tag', text: t('plan.review') }));
          ul.appendChild(el('li', {}, left, el('span', { class: 'item-h', text: t('plan.hours', { h: num(it.hours) }) })));
        });
        li.appendChild(ul);
      }
      d.exams.forEach(function (x) {
        li.appendChild(el('p', { class: 'exam-line', text: t('plan.exam') + ': ' + x.name + (x.time ? ' ' + fmtTime(x.time) : '') }));
      });
      if (!d.items.length && !d.exams.length) {
        li.appendChild(el('p', { class: 'free', text: d.capacityHours === 0 ? t('plan.noTime') : t('plan.free') }));
      }
      days.appendChild(li);
    });

    if (announceIt) announce(t('status.plan', { n: studyDays }));
  }

  function updateIcs(plan) {
    var link = $('ics-link');
    if (icsUrl) { try { URL.revokeObjectURL(icsUrl); } catch (e) { /* ignore */ } icsUrl = null; }
    try {
      var text = P.toICS(plan, state.exams, {
        labels: { study: t('ics.study'), review: t('ics.review'), exam: t('ics.exam'), hour: t('ics.hour') }
      });
      icsUrl = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
      link.setAttribute('href', icsUrl);
    } catch (e) {
      link.setAttribute('href', '#');
    }
  }

  // ---------- wiring ----------

  function init() {
    load();
    $('h-weekday').value = state.weekday;
    $('h-weekend').value = state.weekend;
    $('f-date').setAttribute('min', P.todayString());
    if (!storageOk) $('storage-note').hidden = false;

    $('exam-form').addEventListener('submit', onSubmit);
    $('cancel-btn').addEventListener('click', function () { resetForm(); });
    $('sample-btn').addEventListener('click', addSamples);
    $('h-weekday').addEventListener('input', onHoursInput);
    $('h-weekend').addEventListener('input', onHoursInput);
    $('print-btn').addEventListener('click', function () { window.print(); });
    $('ics-link').addEventListener('click', function () { announce(t('status.ics')); });
    $('undo-btn').addEventListener('click', undoDelete);
    Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
      b.addEventListener('click', function () {
        state.lang = b.getAttribute('data-lang');
        save();
        applyLang();
        renderErrors();
        renderAll();
      });
    });
    // a page left open overnight should move to the new "today"
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && P.todayString() !== lastToday) { $('f-date').setAttribute('min', P.todayString()); renderAll(); }
    });

    applyLang();
    renderErrors();
    renderAll();
  }

  init();
})();
