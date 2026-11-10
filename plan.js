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
  function buildPlan(exams, settings, todayStr) {
    var today = parseDate(todayStr);
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
      var reserve = Math.min(need, Math.max(1, Math.ceil(need * 0.25)));
      active.push({
        id: e.id, name: normalizeName(e.name), date: e.date, time: e.time || '', d: d,
        difficulty: e.difficulty, weight: (DIFFICULTY[e.difficulty] || DIFFICULTY.medium).weight,
        need: need, left: need, reserve: reserve
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
          day.totalHours += alloc[i] / SLOTS_PER_HOUR;
          day.items.push({ examId: c.e.id, name: c.e.name, hours: alloc[i] / SLOTS_PER_HOUR, review: c.review });
        });
      }
      plan.days.push(day);
    }

    active.forEach(function (e) {
      var planned = (e.need - e.left) / SLOTS_PER_HOUR;
      var short = e.left / SLOTS_PER_HOUR;
      plan.exams.push({
        id: e.id, name: e.name, date: e.date, time: e.time, difficulty: e.difficulty,
        neededHours: e.need / SLOTS_PER_HOUR, plannedHours: planned, shortHours: short
      });
      plan.neededHours += e.need / SLOTS_PER_HOUR;
      plan.plannedHours += planned;
      if (short > 0) plan.shortages.push({ id: e.id, name: e.name, hours: short });
    });
    return plan;
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
    toICS: toICS
  };
});
