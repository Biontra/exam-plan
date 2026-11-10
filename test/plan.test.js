'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../plan.js');

const TODAY = '2026-11-09'; // a Monday
const wk = { weekdayHours: 3, weekendHours: null };

function ex(id, name, date, difficulty, extra) {
  return Object.assign({ id, name, date, difficulty: difficulty || 'medium' }, extra || {});
}
function hoursFor(plan, id) {
  let sum = 0;
  plan.days.forEach((d) => d.items.forEach((i) => { if (i.examId === id) sum += i.hours; }));
  return sum;
}
function dayOf(plan, date) {
  return plan.days.find((d) => d.date === date);
}
function checkInvariants(plan, settings) {
  plan.days.forEach((d) => {
    assert.ok(d.totalHours <= d.capacityHours + 1e-9, 'day ' + d.date + ' over capacity');
    d.items.forEach((i) => assert.equal((i.hours * 2) % 1, 0, 'hours not in 30 min steps'));
  });
  plan.exams.forEach((e) => {
    assert.equal(e.plannedHours + e.shortHours, e.neededHours, e.name + ' planned+short != needed');
    assert.ok(Math.abs(hoursFor(plan, e.id) - e.plannedHours) < 1e-9);
    // nothing planned on or after the exam day
    plan.days.forEach((d) => {
      if (d.date >= e.date) assert.equal(d.items.filter((i) => i.examId === e.id).length, 0);
    });
  });
}

test('single exam: all hours fit, spread over days, review the day before, none on exam day', () => {
  const plan = P.buildPlan([ex('a', 'Calculus', '2026-11-16', 'medium')], wk, TODAY);
  assert.equal(plan.exams[0].neededHours, 8);
  assert.equal(plan.exams[0].shortHours, 0);
  assert.equal(plan.shortages.length, 0);
  assert.equal(hoursFor(plan, 'a'), 8);
  assert.equal(plan.days.length, 8); // Nov 9 .. Nov 16
  const dayBefore = dayOf(plan, '2026-11-15');
  assert.equal(dayBefore.items.length, 1);
  assert.equal(dayBefore.items[0].review, true);
  assert.ok(dayBefore.items[0].hours >= 0.5);
  const others = plan.days.filter((d) => d.date !== '2026-11-15' && d.date !== '2026-11-16');
  others.forEach((d) => d.items.forEach((i) => assert.equal(i.review, false)));
  assert.equal(dayOf(plan, '2026-11-16').items.length, 0);
  assert.equal(dayOf(plan, '2026-11-16').exams[0].name, 'Calculus');
  checkInvariants(plan, wk);
});

test('two exams on the same day share the days and respect the daily limit', () => {
  const plan = P.buildPlan([
    ex('a', 'Physics', '2026-11-13', 'hard'),
    ex('b', 'History', '2026-11-13', 'easy')
  ], wk, TODAY);
  checkInvariants(plan, wk);
  assert.ok(hoursFor(plan, 'a') > 0 && hoursFor(plan, 'b') > 0);
  const review = dayOf(plan, '2026-11-12');
  assert.equal(review.items.length, 2);
  assert.ok(review.items.every((i) => i.review));
  assert.ok(review.totalHours <= 3);
  assert.equal(dayOf(plan, '2026-11-13').exams.length, 2);
});

test('exam today is skipped, not planned, but shown as an exam marker on today', () => {
  const plan = P.buildPlan([
    ex('a', 'Today exam', TODAY, 'hard'),
    ex('b', 'Later', '2026-11-12', 'easy')
  ], wk, TODAY);
  assert.deepEqual(plan.skipped.map((s) => [s.id, s.reason]), [['a', 'today']]);
  assert.equal(plan.exams.length, 1);
  assert.equal(hoursFor(plan, 'a'), 0);
  assert.equal(dayOf(plan, TODAY).exams[0].name, 'Today exam');
  assert.equal(plan.shortages.length === 0 || plan.shortages.every((s) => s.id !== 'a'), true);
});

test('past exam is skipped and ignored', () => {
  const plan = P.buildPlan([ex('a', 'Old', '2026-11-01')], wk, TODAY);
  assert.deepEqual(plan.skipped.map((s) => s.reason), ['past']);
  assert.equal(plan.days.length, 0);
  assert.equal(plan.exams.length, 0);
});

test('0 hours per day: nothing planned, every hour is reported as short', () => {
  const plan = P.buildPlan([ex('a', 'Calc', '2026-11-14', 'hard')], { weekdayHours: 0, weekendHours: null }, TODAY);
  assert.equal(plan.plannedHours, 0);
  assert.deepEqual(plan.shortages, [{ id: 'a', name: 'Calc', hours: 12 }]);
  plan.days.forEach((d) => assert.equal(d.items.length, 0));
});

test('exam tomorrow: only today is available, it is a review day, the rest is short', () => {
  const plan = P.buildPlan([ex('a', 'Quiz', '2026-11-10', 'hard')], wk, TODAY);
  assert.equal(plan.days.length, 2);
  assert.equal(plan.days[0].items[0].hours, 3);
  assert.equal(plan.days[0].items[0].review, true);
  assert.equal(plan.shortages[0].hours, 9); // 12 needed - 3 available
  checkInvariants(plan, wk);
});

test('difficulty: hard needs more hours than easy and wins a bigger share when time is short', () => {
  const plan = P.buildPlan([
    ex('h', 'Hard course', '2026-11-12', 'hard'),
    ex('e', 'Easy course', '2026-11-12', 'easy')
  ], wk, TODAY);
  const hard = plan.exams.find((e) => e.id === 'h');
  const easy = plan.exams.find((e) => e.id === 'e');
  assert.ok(hard.neededHours > easy.neededHours);
  assert.ok(hard.plannedHours > easy.plannedHours);
  const first = dayOf(plan, TODAY);
  const h = first.items.find((i) => i.examId === 'h').hours;
  const e = first.items.find((i) => i.examId === 'e').hours;
  assert.ok(h > e, 'hard should get more than easy on a full day');
});

test('closer exam gets more of a crowded day than a far one of the same difficulty', () => {
  const plan = P.buildPlan([
    ex('near', 'Near', '2026-11-12', 'medium'),
    ex('far', 'Far', '2026-11-25', 'medium')
  ], { weekdayHours: 2, weekendHours: null }, TODAY);
  const first = dayOf(plan, TODAY);
  const near = first.items.find((i) => i.examId === 'near').hours;
  const far = (first.items.find((i) => i.examId === 'far') || { hours: 0 }).hours;
  assert.ok(near > far, 'near ' + near + ' far ' + far);
  checkInvariants(plan, { weekdayHours: 2 });
});

test('rounding: odd daily hours (2.5) never overflow and planned + short equals needed', () => {
  const s = { weekdayHours: 2.5, weekendHours: null };
  const plan = P.buildPlan([
    ex('a', 'A', '2026-11-12', 'hard', { topics: 7 }),
    ex('b', 'B', '2026-11-12', 'medium', { topics: 3 }),
    ex('c', 'C', '2026-11-13', 'easy')
  ], s, TODAY);
  checkInvariants(plan, s);
  assert.ok(plan.days.some((d) => d.totalHours === 2.5));
});

test('weekend hours are used on Saturday and Sunday when set', () => {
  const s = { weekdayHours: 2, weekendHours: 5 };
  const plan = P.buildPlan([ex('a', 'Big', '2026-11-17', 'hard', { topics: 10 })], s, TODAY);
  const sat = dayOf(plan, '2026-11-14');
  const sun = dayOf(plan, '2026-11-15');
  const mon = dayOf(plan, '2026-11-09');
  assert.equal(sat.capacityHours, 5);
  assert.equal(sun.capacityHours, 5);
  assert.equal(mon.capacityHours, 2);
  assert.ok(sat.totalHours > mon.totalHours);
  checkInvariants(plan, s);
});

test('a course stops at its exam day but later exams keep being planned that day', () => {
  const plan = P.buildPlan([
    ex('a', 'First', '2026-11-11', 'easy'),
    ex('b', 'Second', '2026-11-13', 'hard')
  ], wk, TODAY);
  const examDay = dayOf(plan, '2026-11-11');
  assert.equal(examDay.items.filter((i) => i.examId === 'a').length, 0);
  assert.ok(examDay.items.some((i) => i.examId === 'b'));
  checkInvariants(plan, wk);
});

test('topic count changes the hours needed', () => {
  const noTopics = P.neededSlots({ difficulty: 'hard' }) / 2;
  const withTopics = P.neededSlots({ difficulty: 'hard', topics: 3 }) / 2;
  assert.equal(noTopics, 12);
  assert.equal(withTopics, 6);
});

test('shortage list names the course and the missing hours', () => {
  const plan = P.buildPlan([ex('a', 'Organic Chemistry', '2026-11-11', 'hard')], wk, TODAY);
  assert.equal(plan.shortages.length, 1);
  assert.equal(plan.shortages[0].name, 'Organic Chemistry');
  assert.equal(plan.shortages[0].hours, 6); // 12 needed, 2 days x 3 h
});

test('garbage input does not throw', () => {
  assert.doesNotThrow(() => P.buildPlan(null, wk, TODAY));
  assert.doesNotThrow(() => P.buildPlan([null, 5, {}, { date: 'nope' }], wk, TODAY));
  assert.doesNotThrow(() => P.buildPlan([ex('a', 'A', '2026-11-12')], undefined, TODAY));
  assert.doesNotThrow(() => P.buildPlan([ex('a', 'A', '2026-11-12')], wk, 'bad'));
  assert.equal(P.buildPlan([], wk, TODAY).days.length, 0);
});

test('property: random inputs never exceed daily hours or lose hours', () => {
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const diffs = ['easy', 'medium', 'hard'];
  for (let run = 0; run < 200; run++) {
    const n = 1 + Math.floor(rnd() * 5);
    const exams = [];
    for (let i = 0; i < n; i++) {
      const day = 9 + Math.floor(rnd() * 25);
      const date = day <= 30 ? '2026-11-' + String(day).padStart(2, '0') : '2026-12-' + String(day - 30).padStart(2, '0');
      exams.push(ex('e' + i, 'Course ' + i, date, diffs[Math.floor(rnd() * 3)], rnd() < 0.5 ? { topics: 1 + Math.floor(rnd() * 12) } : {}));
    }
    const s = { weekdayHours: Math.floor(rnd() * 14) / 2, weekendHours: rnd() < 0.5 ? null : Math.floor(rnd() * 20) / 2 };
    checkInvariants(P.buildPlan(exams, s, TODAY), s);
  }
});

test('parseDate accepts real dates only', () => {
  assert.equal(P.parseDate('2026-02-30'), null);
  assert.equal(P.parseDate('2026-13-01'), null);
  assert.equal(P.parseDate('26-01-01'), null);
  assert.equal(P.parseDate(''), null);
  assert.equal(P.parseDate(undefined), null);
  assert.notEqual(P.parseDate('2028-02-29'), null); // leap year
  assert.equal(P.parseDate('2027-02-29'), null);
  assert.equal(P.formatDate(P.parseDate('2026-11-09')), '2026-11-09');
});

test('validateExam: empty name, bad date, past date, duplicate, topics', () => {
  const ctx = { exams: [ex('a', 'Calculus', '2026-11-20')], today: TODAY };
  const v = (o) => P.validateExam(Object.assign({ name: 'X', date: '2026-11-20', difficulty: 'easy' }, o), ctx);
  assert.equal(v({ name: '   ' }).errors.name, 'name.empty');
  assert.equal(v({ name: 'a'.repeat(61) }).errors.name, 'name.long');
  assert.equal(v({ name: ' calculus ' }).errors.name, 'name.duplicate');
  assert.equal(v({ date: '' }).errors.date, 'date.invalid');
  assert.equal(v({ date: '2026-02-31' }).errors.date, 'date.invalid');
  assert.equal(v({ date: '2026-11-08' }).errors.date, 'date.past');
  assert.equal(v({ date: TODAY }).errors.date, undefined);
  assert.equal(v({ time: '25:00' }).errors.time, 'time.invalid');
  assert.equal(v({ topics: '0' }).errors.topics, 'topics.invalid');
  assert.equal(v({ topics: '-3' }).errors.topics, 'topics.invalid');
  assert.equal(v({ topics: '2.5' }).errors.topics, 'topics.invalid');
  assert.equal(v({ difficulty: 'insane' }).errors.difficulty, 'difficulty.invalid');
  const ok = v({ name: '  Linear   Algebra ', topics: '4', time: '09:30' });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value, { name: 'Linear Algebra', date: '2026-11-20', time: '09:30', difficulty: 'easy', topics: 4 });
});

test('validateExam: editing an exam keeps its own name and its own past date', () => {
  const ctx = { exams: [ex('a', 'Calculus', '2026-11-01')], today: TODAY, editingId: 'a' };
  const r = P.validateExam({ name: 'Calculus', date: '2026-11-01', difficulty: 'hard' }, ctx);
  assert.deepEqual(r.errors, {});
  const r2 = P.validateExam({ name: 'Calculus', date: '2026-10-31', difficulty: 'hard' }, ctx);
  assert.equal(r2.errors.date, 'date.past');
});

test('validateHours: empty, negative, 24+, step, comma decimals, optional', () => {
  assert.equal(P.validateHours('', false).error, 'hours.empty');
  assert.deepEqual(P.validateHours('', true), { error: null, value: null });
  assert.equal(P.validateHours('-1').error, 'hours.range');
  assert.equal(P.validateHours('24').error, 'hours.range');
  assert.equal(P.validateHours('30').error, 'hours.range');
  assert.equal(P.validateHours('abc').error, 'hours.invalid');
  assert.equal(P.validateHours('1.3').error, 'hours.step');
  assert.equal(P.validateHours('2,5').value, 2.5);
  assert.equal(P.validateHours('0').value, 0);
  assert.equal(P.validateHours('23.5').value, 23.5);
});

test('distribute: caps respected, whole slots, total used when demand is higher', () => {
  const a = P.distribute(5, [{ cap: 10, weight: 1 }, { cap: 10, weight: 1 }, { cap: 10, weight: 1 }]);
  assert.equal(a.reduce((x, y) => x + y, 0), 5);
  const b = P.distribute(10, [{ cap: 2, weight: 5 }, { cap: 20, weight: 1 }]);
  assert.deepEqual(b, [2, 8]);
  const c = P.distribute(10, [{ cap: 2, weight: 1 }, { cap: 3, weight: 1 }]);
  assert.deepEqual(c, [2, 3]);
});

test('toICS: valid structure, escaping, CRLF, folding, exam time', () => {
  const exams = [
    ex('a', 'Math, Part 1; "Intro" \\ and a really long course name that will definitely need to be folded across lines', '2026-11-12', 'easy', { time: '10:00' }),
    ex('b', 'Çalışma Türkçe', '2026-11-11', 'easy')
  ];
  const plan = P.buildPlan(exams, wk, TODAY);
  const ics = P.toICS(plan, exams, { now: new Date(Date.UTC(2026, 10, 9, 12, 0, 0)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  const studyEvents = plan.days.reduce((n, d) => n + d.items.length, 0);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, studyEvents + 2);
  assert.ok(ics.includes('DTSTART:20261112T100000'));
  assert.ok(ics.includes('DTEND:20261112T120000'));
  assert.ok(ics.includes('DTSTAMP:20261109T120000Z'));
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261111'));
  ics.split('\r\n').forEach((line) => assert.ok(Buffer.byteLength(line) <= 75, 'line too long: ' + line));
  assert.ok(!/[^\r]\n/.test(ics), 'bare LF found');
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('Math\\, Part 1\\; "Intro" \\\\ and'));
  assert.ok(unfolded.includes('Çalışma Türkçe'));
});

test('toICS: exam at 23:00 ends after midnight on the next day; past exams are left out', () => {
  const exams = [ex('a', 'Late', '2026-11-12', 'easy', { time: '23:00' }), ex('b', 'Old', '2026-11-01')];
  const plan = P.buildPlan(exams, wk, TODAY);
  const ics = P.toICS(plan, exams, { now: new Date(0) });
  assert.ok(ics.includes('DTEND:20261113T010000'));
  assert.ok(!ics.includes('Old'));
});
