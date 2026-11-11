/*
 * plan.js - pure functions for the exam study plan.
 * No DOM, no storage, no clock: "today" is always passed in as "YYYY-MM-DD".
 * Works in the browser (window.ExamPlan) and in Node (require).
 *
 * All study time is handled in slots of 30 minutes (integers), so sums never
 * drift because of floating point rounding.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ExamPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SLOTS_PER_HOUR = 2;
  var MAX_NAME = 60;
  var MAX_TOPICS = 50;

  // Hours needed per exam. With a topic count: topics * perTopic.
  // Without: base. weight scales a course's share when time is short.
  var DIFFICULTY = {
    easy: { base: 4, perTopic: 1, weight: 1 },
    medium: { base: 8, perTopic: 1.5, weight: 1.5 },
    hard: { base: 12, perTopic: 2, weight: 2 }
  };

  // ---------- dates ("YYYY-MM-DD" <-> day number) ----------

  function parseDate(s) {
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (y < 2000 || y > 2100) return null;
    var ms = Date.UTC(y, mo - 1, d);
    var dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return Math.round(ms / 86400000);
  }

  function formatDate(n) {
    return new Date(n * 86400000).toISOString().slice(0, 10);
  }

  function dayOfWeek(n) {
    return new Date(n * 86400000).getUTCDay(); // 0 = Sunday
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // Local calendar date of a JS Date as "YYYY-MM-DD".
  function todayString(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // ---------- validation ----------

  function normalizeName(s) {
    return String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  }

  /*
   * input: { name, date, time, difficulty, topics } (strings as typed)
   * ctx:   { exams, today, editingId }
   * returns { errors: { field: code }, value }
   */
  function validateExam(input, ctx) {
    input = input || {};
    ctx = ctx || {};
    var errors = {};
    var exams = ctx.exams || [];
    var today = parseDate(ctx.today);
    var editing = null;
    for (var i = 0; i < exams.length; i++) if (exams[i].id === ctx.editingId) editing = exams[i];

    var name = normalizeName(input.name);
    if (!name) errors.name = 'name.empty';
    else if (name.length > MAX_NAME) errors.name = 'name.long';
    else {
      var lower = name.toLowerCase();
      for (var j = 0; j < exams.length; j++) {
        if (exams[j].id !== ctx.editingId && normalizeName(exams[j].name).toLowerCase() === lower) {
          errors.name = 'name.duplicate';
          break;
        }
      }
    }

    var dateStr = String(input.date == null ? '' : input.date).trim();
    var d = parseDate(dateStr);
    if (d === null) errors.date = 'date.invalid';
    else if (today !== null && d < today && !(editing && editing.date === dateStr)) errors.date = 'date.past';

    var time = String(input.time == null ? '' : input.time).trim();
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.time = 'time.invalid';

    var diff = String(input.difficulty || '');
    if (!DIFFICULTY[diff]) errors.difficulty = 'difficulty.invalid';

    var topics = null;
    var topicsRaw = String(input.topics == null ? '' : input.topics).trim();
    if (topicsRaw !== '') {
      if (!/^\d+$/.test(topicsRaw) || +topicsRaw < 1 || +topicsRaw > MAX_TOPICS) errors.topics = 'topics.invalid';
      else topics = +topicsRaw;
    }

    return {
      errors: errors,
      value: { name: name, date: dateStr, time: time, difficulty: diff, topics: topics }
    };
  }

  /*
   * Daily hours. optional=true: empty means "not set" (null).
   * returns { error: code|null, value: number|null }
   */
  function validateHours(raw, optional) {
    var s = String(raw == null ? '' : raw).trim().replace(',', '.');
    if (s === '') return optional ? { error: null, value: null } : { error: 'hours.empty', value: null };
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { error: 'hours.invalid', value: null };
    var n = Number(s);
    if (n < 0 || n >= 24) return { error: 'hours.range', value: null };
    if (Math.round(n * 2) !== n * 2) return { error: 'hours.step', value: null };
    return { error: null, value: n };
  }

  // ---------- planning ----------

  function neededSlots(exam) {
    var cfg = DIFFICULTY[exam.difficulty] || DIFFICULTY.medium;
    var topics = exam.topics;
    var hours = topics >= 1 ? Math.min(topics, MAX_TOPICS) * cfg.perTopic : cfg.base;
    return Math.round(hours * SLOTS_PER_HOUR);
  }

  function capacitySlots(hours) {
    var x = Number(hours);
    if (!isFinite(x) || x <= 0) return 0;
    return Math.floor(Math.min(x, 24) * SLOTS_PER_HOUR + 1e-9);
  }

  /*
   * Split `total` slots between items {cap, weight} proportionally to weight,
   * never giving an item more than its cap. Whole slots only; the largest
   * fractional share gets the leftover slot. If total >= sum of caps every
   * item simply gets its cap.
   */
  function distribute(total, items) {
    var alloc = items.map(function () { return 0; });
    var active = [];
    var capSum = 0;
    items.forEach(function (it, i) { capSum += it.cap; if (it.cap > 0 && it.weight > 0) active.push(i); });
    if (total >= capSum) return items.map(function (it) { return Math.max(0, it.cap); });
    var remaining = total;
    while (remaining > 0 && active.length) {
      var wsum = 0;
      active.forEach(function (i) { wsum += items[i].weight; });
      // items whose proportional share reaches their cap are filled first,
      // then the rest is split again
      var capped = active.filter(function (i) {
        return remaining * items[i].weight / wsum >= items[i].cap - alloc[i];
      });
      if (capped.length) {
        capped.forEach(function (i) { remaining -= items[i].cap - alloc[i]; alloc[i] = items[i].cap; });
        active = active.filter(function (i) { return capped.indexOf(i) < 0; });
        continue;
      }
      // nobody hits a cap: whole slots by share, leftover to the largest fractions
      var fracs = [];
      var used = 0;
      active.forEach(function (i) {
        var share = remaining * items[i].weight / wsum;
        var whole = Math.floor(share + 1e-9);
        alloc[i] += whole;
        used += whole;
        fracs.push({ i: i, frac: share - whole });
      });
      var left = remaining - used;
      fracs.sort(function (x, y) { return y.frac - x.frac || x.i - y.i; });
      for (var k = 0; k < fracs.length && left > 0; k++) {
        var idx = fracs[k].i;
        if (alloc[idx] < items[idx].cap) { alloc[idx] += 1; left -= 1; }
      }
      remaining = 0;
    }
    return alloc;
  }

  /*
   * exams:    [{ id, name, date, time?, difficulty, topics? }]
   * settings: { weekdayHours, weekendHours (null/undefined = same as weekday) }
   * today:    "YYYY-MM-DD"
   *
   * Rules:
   *  - Exams dated before today, or today, get no study days (listed in `skipped`).
   *  - Study runs from today up to the day before each exam.
   *  - The day before an exam is that course's review day. About a quarter of
   *    its hours (at least 30 min) are kept for that day.
   *  - Each day, every open course asks for an even share of what is left
   *    (remaining hours / days left). If the day cannot fit all requests, the
   *    day's hours are split in proportion to request x difficulty weight.
   *    Since a request grows as the exam gets closer, near exams win.
   *  - A day never gets more than its daily hours. What does not fit is
   *    reported as a shortage.
   */
  function buildPlan(exams, settings, todayStr, progress) {
    var today = parseDate(todayStr);
    var withProgress = !!progress && typeof progress === 'object';
    var plan = { today: todayStr, days: [], exams: [], skipped: [], shortages: [], plannedHours: 0, neededHours: 0 };
    if (today === null || !Array.isArray(exams)) return plan;
    settings = settings || {};

    var active = [];
    exams.forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var d = parseDate(e.date);
      if (d === null) { plan.skipped.push({ id: e.id, name: e.name, reason: 'invalid' }); return; }
      if (d < today) { plan.skipped.push({ id: e.id, name: e.name, reason: 'past' }); return; }
      if (d === today) { plan.skipped.push({ id: e.id, name: e.name, reason: 'today' }); return; }
      var need = neededSlots(e);
      var done = withProgress ? progressSlots(progress, e.id, today) : { before: 0, today: 0, total: 0 };
      var reserve = Math.min(need, Math.max(1, Math.ceil(need * 0.25)));
      active.push({
        id: e.id, name: normalizeName(e.name), date: e.date, time: e.time || '', d: d,
        difficulty: e.difficulty, weight: (DIFFICULTY[e.difficulty] || DIFFICULTY.medium).weight,
        need: need, left: Math.max(0, need - done.before), reserve: reserve,
        doneBefore: done.before, doneToday: done.today, doneTotal: done.total, allocToday: 0, scheduled: 0
      });
    });
    active.sort(function (a, b) {
      return a.d - b.d || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
    if (!active.length) return plan;

    var lastDay = active[active.length - 1].d;
    var wd = settings.weekdayHours;
    var weHas = settings.weekendHours !== null && settings.weekendHours !== undefined && settings.weekendHours !== '';

    // exam markers for every valid exam dated today or later (also today's)
    var markers = {};
    exams.forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var d = parseDate(e.date);
      if (d === null || d < today) return;
      (markers[d] = markers[d] || []).push({ id: e.id, name: normalizeName(e.name), time: e.time || '' });
    });

    for (var n = today; n <= lastDay; n++) {
      var dow = dayOfWeek(n);
      var weekend = dow === 0 || dow === 6;
      var capHours = weekend && weHas ? settings.weekendHours : wd;
      var cap = capacitySlots(capHours);
      var day = {
        date: formatDate(n), dow: dow, isWeekend: weekend,
        capacityHours: cap / SLOTS_PER_HOUR, totalHours: 0, items: [], exams: markers[n] || []
      };

      var cand = [];
      active.forEach(function (e) {
        if (e.d <= n || e.left <= 0) return;
        var review = n === e.d - 1;
        var ask;
        if (review) ask = e.left;
        else {
          var avail = Math.max(0, e.left - e.reserve);
          var daysLeft = e.d - 1 - n; // study days n .. d-2
          ask = avail > 0 ? Math.ceil(avail / daysLeft) : 0;
        }
        if (ask > 0) cand.push({ e: e, review: review, cap: ask, weight: ask * e.weight });
      });

      if (cand.length && cap > 0) {
        var alloc = distribute(cap, cand);
        cand.forEach(function (c, i) {
          if (alloc[i] <= 0) return;
          c.e.left -= alloc[i];
          c.e.scheduled += alloc[i];
          if (n === today) c.e.allocToday = alloc[i];
          day.totalHours += alloc[i] / SLOTS_PER_HOUR;
          day.items.push({ examId: c.e.id, name: c.e.name, hours: alloc[i] / SLOTS_PER_HOUR, review: c.review, doneHours: c.e.doneToday / SLOTS_PER_HOUR });
        });
      }
      if (n === today && withProgress) {
        // From tomorrow on, what was done today replaces today's target:
        // unfinished target is assumed done (it is re-planned tomorrow if not),
        // extra work shortens the rest of the plan.
        active.forEach(function (e) {
          e.left = Math.max(0, e.need - e.doneBefore - Math.max(e.allocToday, e.doneToday));
          if (e.doneToday > 0 && !day.items.some(function (it) { return it.examId === e.id; })) {
            day.items.push({ examId: e.id, name: e.name, hours: 0, review: false, doneHours: e.doneToday / SLOTS_PER_HOUR, extra: true });
          }
        });
      }
      plan.days.push(day);
    }

    active.forEach(function (e) {
      var short = e.left / SLOTS_PER_HOUR;
      var planned = e.scheduled / SLOTS_PER_HOUR;
      var rec = {
        id: e.id, name: e.name, date: e.date, time: e.time, difficulty: e.difficulty,
        neededHours: e.need / SLOTS_PER_HOUR, plannedHours: planned, shortHours: short
      };
      if (withProgress) {
        rec.doneHours = e.doneTotal / SLOTS_PER_HOUR;
        rec.doneToday = e.doneToday / SLOTS_PER_HOUR;
        rec.remainingHours = Math.max(0, e.need - e.doneTotal) / SLOTS_PER_HOUR;
        rec.extraHours = Math.max(0, e.doneTotal - e.need) / SLOTS_PER_HOUR;
        rec.completed = e.doneTotal >= e.need;
        rec.ratio = e.need > 0 ? Math.min(1, e.doneTotal / e.need) : 1;
      }
      plan.exams.push(rec);
      plan.neededHours += e.need / SLOTS_PER_HOUR;
      plan.plannedHours += planned;
      if (short > 0) plan.shortages.push({ id: e.id, name: e.name, hours: short });
    });
    return plan;
  }


  // ---------- progress: { examId: { "YYYY-MM-DD": hours } } ----------

  var MAX_DAY_HOURS = 24;

  function slotsOf(h) { return Math.round(Number(h) * SLOTS_PER_HOUR); }

  // done slots of one exam: before today, today, and everything up to today
  function progressSlots(progress, examId, today) {
    var out = { before: 0, today: 0, total: 0 };
    var rows = progress && Object.prototype.hasOwnProperty.call(progress, examId) ? progress[examId] : null;
    if (!rows || typeof rows !== 'object') return out;
    Object.keys(rows).forEach(function (date) {
      var d = parseDate(date);
      var h = rows[date];
      if (d === null || d > today || typeof h !== 'number' || !isFinite(h) || h <= 0) return;
      var sl = slotsOf(h);
      out.total += sl;
      if (d === today) out.today += sl; else out.before += sl;
    });
    return out;
  }

  // Hours logged on one date for one exam.
  function doneOn(progress, examId, date) {
    var rows = progress && Object.prototype.hasOwnProperty.call(progress, examId) ? progress[examId] : null;
    var h = rows && typeof rows[date] === 'number' ? rows[date] : 0;
    return h > 0 ? h : 0;
  }

  // New progress object with `hours` set for (exam, date). 0 removes the entry.
  // Whole 30 minute steps, never below 0 or above 24 per exam and day.
  function setProgress(progress, examId, date, hours) {
    var next = {};
    Object.keys(progress || {}).forEach(function (id) { next[id] = Object.assign({}, progress[id]); });
    var h = Number(hours);
    if (!isFinite(h) || h < 0) h = 0;
    h = Math.min(MAX_DAY_HOURS, Math.round(h * SLOTS_PER_HOUR) / SLOTS_PER_HOUR);
    if (parseDate(date) === null || typeof examId !== 'string' || !examId) return next;
    if (h === 0) {
      if (next[examId]) { delete next[examId][date]; if (!Object.keys(next[examId]).length) delete next[examId]; }
    } else {
      next[examId] = next[examId] || {};
      next[examId][date] = h;
    }
    return next;
  }

  function addProgress(progress, examId, date, delta) {
    return setProgress(progress, examId, date, doneOn(progress, examId, date) + Number(delta));
  }

  // Drop everything that is not a valid { examId: { date: hours } }.
  function sanitizeProgress(raw, validIds) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    var count = 0;
    Object.keys(raw).forEach(function (id) {
      if (validIds && validIds.indexOf(id) < 0) return;
      var rows = raw[id];
      if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return;
      Object.keys(rows).forEach(function (date) {
        var h = rows[date];
        if (parseDate(date) === null || typeof h !== 'number' || !isFinite(h) || h <= 0 || h > MAX_DAY_HOURS) return;
        if (Math.round(h * 2) !== h * 2) h = Math.round(h * 2) / 2;
        if (h <= 0 || count >= MAX_PROGRESS_ROWS) return;
        (out[id] = out[id] || {})[date] = h;
        count++;
      });
    });
    return out;
  }

  // Days in a row with any study logged, counted back from today. A day
  // without logged work yet does not break the streak until it ends.
  function streak(progress, todayStr) {
    var today = parseDate(todayStr);
    var res = { current: 0, best: 0 };
    if (today === null || !progress || typeof progress !== 'object') return res;
    var days = {};
    Object.keys(progress).forEach(function (id) {
      var rows = progress[id];
      if (!rows || typeof rows !== 'object') return;
      Object.keys(rows).forEach(function (date) {
        var d = parseDate(date);
        if (d !== null && d <= today && typeof rows[date] === 'number' && rows[date] > 0) days[d] = true;
      });
    });
    var keys = Object.keys(days).map(Number).sort(function (a, b) { return a - b; });
    var run = 0, prev = null;
    keys.forEach(function (d) {
      run = prev !== null && d === prev + 1 ? run + 1 : 1;
      if (run > res.best) res.best = run;
      prev = d;
    });
    var n = days[today] ? today : today - 1;
    while (days[n]) { res.current++; n--; }
    return res;
  }

  // Hours to log for a finished focus session: nearest 30 min, nothing under 15 min.
  function focusCredit(minutes) {
    var m = Number(minutes);
    if (!isFinite(m) || m < 0) return 0;
    return Math.min(4, Math.round(m / 30) / 2);
  }

  /*
   * The living plan. Same rules as buildPlan, but hours already done
   * (progress) are taken off what each exam needs, and planning restarts from
   * today. Work that was planned for a past day and not done is simply still
   * "remaining", so it is spread over the days that are left.
   * Today's target is fixed by what was done before today, so it does not
   * shrink while you tick it off. Extra work today shortens later days.
   * Progress of exams that are past is ignored by the plan (it still counts
   * for the streak).
   */
  function replan(exams, settings, progress, todayStr) {
    var plan = buildPlan(exams, settings, todayStr, progress && typeof progress === 'object' ? progress : {});
    var t = { needed: 0, done: 0, remaining: 0, extra: 0, todayTarget: 0, todayDone: 0 };
    plan.exams.forEach(function (e) {
      t.needed += e.neededHours;
      t.done += Math.min(e.doneHours, e.neededHours);
      t.remaining += e.remainingHours;
      t.extra += e.extraHours;
      t.todayDone += e.doneToday;
    });
    if (plan.days.length) {
      plan.days[0].items.forEach(function (it) { t.todayTarget += it.hours; });
    }
    plan.totals = t;
    plan.streak = streak(progress, todayStr);
    return plan;
  }

  // ---------- exam sanitizing, backup, sample data ----------

  var MAX_EXAMS = 100;
  var MAX_CHECKLIST = 40;
  var MAX_ITEM = 60;
  var MAX_PROGRESS_ROWS = 20000;

  function validTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }

  // One stored/imported exam -> clean exam, or null if it cannot be used.
  function sanitizeExam(e) {
    if (!e || typeof e !== 'object') return null;
    if (typeof e.id !== 'string' || !e.id || e.id.length > 60 || typeof e.name !== 'string') return null;
    var name = normalizeName(e.name).slice(0, MAX_NAME);
    if (!name || parseDate(e.date) === null || !DIFFICULTY[e.difficulty]) return null;
    var list = [];
    if (Array.isArray(e.checklist)) {
      e.checklist.forEach(function (it) {
        if (list.length >= MAX_CHECKLIST || !it || typeof it !== 'object') return;
        var text = normalizeName(it.text).slice(0, MAX_ITEM);
        if (!text || typeof it.id !== 'string' || !it.id || it.id.length > 60) return;
        if (list.some(function (x) { return x.id === it.id; })) return;
        list.push({ id: it.id, text: text, done: it.done === true });
      });
    }
    return {
      id: e.id, name: name, date: e.date, time: validTime(e.time) ? e.time : '',
      difficulty: e.difficulty,
      topics: Number.isInteger(e.topics) && e.topics >= 1 && e.topics <= MAX_TOPICS ? e.topics : null,
      checklist: list
    };
  }

  function buildBackup(data, now) {
    data = data || {};
    return {
      app: 'exam-plan', version: 2,
      exportedAt: (now || new Date()).toISOString(),
      settings: { weekday: String(data.weekday == null ? '3' : data.weekday), weekend: String(data.weekend == null ? '' : data.weekend) },
      exams: data.exams || [],
      progress: data.progress || {}
    };
  }

  /*
   * Check a parsed JSON backup. Never throws.
   * returns { error: code|null, data: { exams, progress, weekday, weekend }, dropped }
   * Exams that cannot be used are dropped and counted, the rest is kept.
   */
  function validateBackup(raw) {
    var fail = function (code) { return { error: code, data: null, dropped: 0 }; };
    try {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('backup.format');
      if (raw.app !== 'exam-plan') return fail('backup.app');
      if (raw.version !== 1 && raw.version !== 2) return fail('backup.version');
      if (!Array.isArray(raw.exams)) return fail('backup.format');
      if (raw.exams.length > MAX_EXAMS) return fail('backup.tooMany');
      var exams = [], seen = {}, names = {}, dropped = 0;
      raw.exams.forEach(function (e) {
        var c = sanitizeExam(e);
        if (!c || seen[c.id] || names[c.name.toLowerCase()]) { dropped++; return; }
        seen[c.id] = true; names[c.name.toLowerCase()] = true;
        exams.push(c);
      });
      if (!exams.length && raw.exams.length) return fail('backup.noValid');
      var st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
      var wd = validateHours(typeof st.weekday === 'string' ? st.weekday : '', false);
      var we = validateHours(typeof st.weekend === 'string' ? st.weekend : '', true);
      return {
        error: null, dropped: dropped,
        data: {
          exams: exams,
          progress: sanitizeProgress(raw.progress, exams.map(function (x) { return x.id; })),
          weekday: wd.error ? '3' : String(st.weekday).trim(),
          weekend: we.error || we.value === null ? '' : String(st.weekend).trim()
        }
      };
    } catch (err) {
      return fail('backup.format');
    }
  }

  function addDays(dateStr, n) {
    var d = parseDate(dateStr);
    return d === null ? null : formatDate(d + n);
  }

  /*
   * Demo data: four exams in the coming weeks, three days of work already
   * logged and some topics ticked, so rings and streak are not empty.
   * names: 4 course names, topics: 4 arrays of topic titles (may be empty).
   */
  function sampleData(todayStr, names, topics) {
    var rows = [
      { off: 6, difficulty: 'hard', topics: 6, time: '10:00', ticked: 3, log: { '-3': 1.5, '-2': 2, '-1': 1.5 } },
      { off: 9, difficulty: 'medium', topics: 5, time: '', ticked: 2, log: { '-3': 1.5, '-1': 1.5 } },
      { off: 12, difficulty: 'hard', topics: null, time: '14:00', ticked: 1, log: { '-2': 1 } },
      { off: 16, difficulty: 'easy', topics: null, time: '', ticked: 0, log: {} }
    ];
    var exams = [], progress = {};
    rows.forEach(function (r, i) {
      var id = 'sample-' + (i + 1);
      var list = ((topics && topics[i]) || []).slice(0, MAX_CHECKLIST).map(function (text, k) {
        return { id: id + '-t' + (k + 1), text: String(text), done: k < r.ticked };
      });
      exams.push({
        id: id, name: String((names && names[i]) || 'Exam ' + (i + 1)), date: addDays(todayStr, r.off), time: r.time,
        difficulty: r.difficulty, topics: r.topics, checklist: list
      });
      Object.keys(r.log).forEach(function (off) {
        progress[id] = progress[id] || {};
        progress[id][addDays(todayStr, +off)] = r.log[off];
      });
    });
    return { exams: exams, progress: progress, weekday: '3', weekend: '' };
  }

  // ---------- .ics export ----------

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  // fold to 75 octets per line (UTF-8 aware), continuation lines start with a space
  function icsFold(line) {
    var out = [];
    var cur = '';
    var bytes = 0;
    var limit = 75;
    for (var i = 0; i < line.length; ) {
      var cp = line.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      var b = cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
      if (bytes + b > limit) { out.push(cur); cur = ' '; bytes = 1; limit = 75; }
      cur += ch; bytes += b; i += ch.length;
    }
    out.push(cur);
    return out.join('\r\n');
  }

  function compact(dateStr) { return dateStr.replace(/-/g, ''); }

  function stamp(now) {
    return now.getUTCFullYear() + pad(now.getUTCMonth() + 1) + pad(now.getUTCDate()) + 'T' +
      pad(now.getUTCHours()) + pad(now.getUTCMinutes()) + pad(now.getUTCSeconds()) + 'Z';
  }

  function fmtHours(h) {
    return String(Math.round(h * 10) / 10);
  }

  /*
   * One all-day event per course per study day, and one event per exam
   * (timed, 2 hours, if a time was given; otherwise all-day).
   * opts: { now: Date, labels: { study, review, exam, hour } }
   */
  function toICS(plan, exams, opts) {
    opts = opts || {};
    var now = opts.now || new Date();
    var L = Object.assign({ study: 'Study', review: 'Review', exam: 'Exam', hour: 'h' }, opts.labels || {});
    var today = parseDate(plan && plan.today);
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//exam-plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    var dtstamp = stamp(now);

    function event(uid, summary, startLines) {
      lines.push('BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + dtstamp);
      startLines.forEach(function (l) { lines.push(l); });
      lines.push('SUMMARY:' + icsEscape(summary), 'END:VEVENT');
    }

    function allDay(dateStr) {
      var n = parseDate(dateStr);
      return ['DTSTART;VALUE=DATE:' + compact(dateStr), 'DTEND;VALUE=DATE:' + compact(formatDate(n + 1))];
    }

    ((plan && plan.days) || []).forEach(function (day) {
      day.items.forEach(function (it) {
        event(day.date + '-' + it.examId + '@exam-plan',
          (it.review ? L.review : L.study) + ': ' + it.name + ' (' + fmtHours(it.hours) + ' ' + L.hour + ')',
          allDay(day.date));
      });
    });

    (exams || []).forEach(function (e) {
      var d = parseDate(e && e.date);
      if (d === null || today === null || d < today) return;
      var uid = 'exam-' + e.date + '-' + e.id + '@exam-plan';
      var name = normalizeName(e.name);
      if (e.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)) {
        var h = +e.time.slice(0, 2), m = +e.time.slice(3, 5);
        var endMin = h * 60 + m + 120;
        var endDay = d + Math.floor(endMin / 1440);
        endMin = endMin % 1440;
        event(uid, L.exam + ': ' + name, [
          'DTSTART:' + compact(e.date) + 'T' + pad(h) + pad(m) + '00',
          'DTEND:' + compact(formatDate(endDay)) + 'T' + pad(Math.floor(endMin / 60)) + pad(endMin % 60) + '00'
        ]);
      } else {
        event(uid, L.exam + ': ' + name, allDay(e.date));
      }
    });

    lines.push('END:VCALENDAR');
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  return {
    DIFFICULTY: DIFFICULTY,
    MAX_NAME: MAX_NAME,
    MAX_TOPICS: MAX_TOPICS,
    parseDate: parseDate,
    formatDate: formatDate,
    todayString: todayString,
    validateExam: validateExam,
    validateHours: validateHours,
    neededSlots: neededSlots,
    distribute: distribute,
    buildPlan: buildPlan,
    replan: replan,
    streak: streak,
    setProgress: setProgress,
    addProgress: addProgress,
    doneOn: doneOn,
    sanitizeProgress: sanitizeProgress,
    sanitizeExam: sanitizeExam,
    focusCredit: focusCredit,
    buildBackup: buildBackup,
    validateBackup: validateBackup,
    sampleData: sampleData,
    addDays: addDays,
    MAX_EXAMS: MAX_EXAMS,
    MAX_CHECKLIST: MAX_CHECKLIST,
    MAX_ITEM: MAX_ITEM,
    toICS: toICS
  };
});
