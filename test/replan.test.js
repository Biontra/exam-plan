'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../plan.js');

const TODAY = '2026-11-09'; // Monday
const wk = { weekdayHours: 3, weekendHours: null };
const ex = (id, name, date, difficulty, extra) => Object.assign({ id, name, date, difficulty: difficulty || 'medium' }, extra || {});
const sumFuture = (plan, id) => {
  let s = 0;
  plan.days.forEach((d, i) => { if (i > 0) d.items.forEach((x) => { if (x.examId === id) s += x.hours; }); });
  return s;
};
const examRec = (plan, id) => plan.exams.find((e) => e.id === id);

test('replan without progress equals buildPlan', () => {
  const exams = [ex('a', 'A', '2026-11-20', 'hard'), ex('b', 'B', '2026-11-16', 'easy')];
  const a = P.buildPlan(exams, wk, TODAY);
  const b = P.replan(exams, wk, {}, TODAY);
  assert.equal(b.days.length, a.days.length);
  a.days.forEach((d, i) => {
    assert.deepEqual(b.days[i].items.map((x) => [x.examId, x.hours]), d.items.map((x) => [x.examId, x.hours]));
  });
  assert.equal(b.totals.done, 0);
  assert.equal(b.totals.remaining, b.totals.needed);
});

test('missed days: work not done before today is spread over the days left', () => {
  const exams = [ex('a', 'A', '2026-11-16', 'medium')]; // 8 h
  // planned 3 h/day, but only 1 h done on Nov 7 and nothing since
  const progress = { a: { '2026-11-07': 1 } };
  const plan = P.replan(exams, wk, progress, TODAY);
  const rec = examRec(plan, 'a');
  assert.equal(rec.doneHours, 1);
  assert.equal(rec.remainingHours, 7);
  assert.equal(rec.shortHours, 0);
  const total = plan.days.reduce((s, d) => s + d.totalHours, 0);
  assert.equal(total, 7); // exactly what is left, no more
  assert.ok(plan.days.every((d) => d.totalHours <= d.capacityHours));
  // and a plan that ignored the progress would ask for 8
  assert.equal(P.buildPlan(exams, wk, TODAY).days.reduce((s, d) => s + d.totalHours, 0), 8);
});

test('missed days with too little time left are reported as short, never overfilled', () => {
  const exams = [ex('a', 'A', '2026-11-11', 'hard')]; // 12 h, only Nov 9 and 10 left = 6 h
  const plan = P.replan(exams, wk, {}, TODAY);
  const rec = examRec(plan, 'a');
  assert.equal(rec.shortHours, 6);
  assert.equal(rec.plannedHours, 6);
  assert.ok(plan.days.every((d) => d.totalHours <= d.capacityHours));
});

test("today's target does not shrink while today's hours are logged", () => {
  const exams = [ex('a', 'A', '2026-11-20', 'hard')];
  const before = P.replan(exams, wk, {}, TODAY);
  const target = before.days[0].items[0].hours;
  const during = P.replan(exams, wk, { a: { [TODAY]: 1 } }, TODAY);
  assert.equal(during.days[0].items[0].hours, target);
  assert.equal(during.days[0].items[0].doneHours, 1);
  assert.equal(during.totals.todayDone, 1);
  assert.equal(during.totals.todayTarget, target);
});

test('overwork today shortens the days after today; hours are never lost', () => {
  const exams = [ex('a', 'A', '2026-11-20', 'hard')]; // 12 h
  const base = P.replan(exams, wk, {}, TODAY);
  const over = P.replan(exams, wk, { a: { [TODAY]: 5 } }, TODAY);
  assert.equal(over.days[0].items[0].hours, base.days[0].items[0].hours); // target unchanged
  assert.ok(sumFuture(over, 'a') < sumFuture(base, 'a'));
  const r = examRec(over, 'a');
  assert.equal(r.doneHours, 5);
  assert.equal(r.remainingHours, 7);
  assert.equal(r.shortHours, 0);
  assert.equal(sumFuture(over, 'a'), 7); // 12 h minus the 5 h done today
});

test('overwork beyond the need: remaining 0, extra reported, nothing planned', () => {
  const exams = [ex('a', 'A', '2026-11-20', 'easy')]; // 4 h
  const plan = P.replan(exams, wk, { a: { '2026-11-07': 3, '2026-11-08': 3 } }, TODAY);
  const r = examRec(plan, 'a');
  assert.equal(r.completed, true);
  assert.equal(r.remainingHours, 0);
  assert.equal(r.extraHours, 2);
  assert.equal(r.ratio, 1);
  assert.equal(plan.days.reduce((s, d) => s + d.totalHours, 0), 0);
  assert.equal(plan.totals.done, 4); // capped at need in the totals
  assert.equal(plan.totals.extra, 2);
});

test('completed exam frees its hours for the other exams', () => {
  const exams = [ex('a', 'A', '2026-11-12', 'hard'), ex('b', 'B', '2026-11-12', 'hard')]; // 24 h in 3 days x 3 h
  const both = P.replan(exams, wk, {}, TODAY);
  const aDone = P.replan(exams, wk, { a: { '2026-11-08': 12 } }, TODAY);
  assert.ok(examRec(both, 'b').shortHours > examRec(aDone, 'b').shortHours);
  assert.equal(examRec(aDone, 'a').completed, true);
  assert.equal(aDone.days.every((d) => d.items.every((i) => i.examId === 'b')), true);
});

test('progress on a past exam is ignored by the plan but kept for the streak', () => {
  const exams = [ex('old', 'Old', '2026-11-01', 'hard'), ex('a', 'A', '2026-11-20', 'easy')];
  const progress = { old: { '2026-11-08': 2, '2026-11-07': 2 }, a: {} };
  const plan = P.replan(exams, wk, progress, TODAY);
  assert.equal(plan.exams.length, 1);
  assert.equal(plan.skipped[0].reason, 'past');
  assert.equal(plan.totals.done, 0);
  assert.equal(plan.totals.needed, 4);
  assert.equal(plan.streak.current, 2);
});

test('progress dated in the future is ignored', () => {
  const exams = [ex('a', 'A', '2026-11-20', 'easy')];
  const plan = P.replan(exams, wk, { a: { '2026-11-15': 4 } }, TODAY);
  assert.equal(examRec(plan, 'a').doneHours, 0);
});

test('an exam that is today stays out of the plan; an exam tomorrow still gets a review day', () => {
  const exams = [ex('t', 'T', TODAY, 'easy'), ex('m', 'M', '2026-11-10', 'easy')];
  const plan = P.replan(exams, wk, { t: { '2026-11-08': 1 } }, TODAY);
  assert.equal(plan.skipped.some((s) => s.reason === 'today'), true);
  assert.equal(plan.days[0].items.length, 1);
  assert.equal(plan.days[0].items[0].review, true);
});

test('work logged today on an exam with no target today shows as an extra item', () => {
  const exams = [ex('a', 'A', '2026-11-20', 'easy')];
  // finish everything earlier, then log more today
  const plan = P.replan(exams, wk, { a: { '2026-11-08': 4, [TODAY]: 1 } }, TODAY);
  const item = plan.days[0].items.find((i) => i.examId === 'a');
  assert.ok(item && item.extra && item.hours === 0 && item.doneHours === 1);
});

test('replan keeps its invariants over random inputs (30 min steps, capacity, no loss)', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let k = 0; k < 300; k++) {
    const n = 1 + Math.floor(rnd() * 4);
    const exams = [], progress = {};
    for (let i = 0; i < n; i++) {
      const id = 'e' + i;
      exams.push(ex(id, 'E' + i, P.addDays(TODAY, Math.floor(rnd() * 25) - 2), ['easy', 'medium', 'hard'][Math.floor(rnd() * 3)],
        rnd() < 0.5 ? { topics: 1 + Math.floor(rnd() * 20) } : {}));
      for (let j = 0; j < 4; j++) if (rnd() < 0.6) progress[id] = Object.assign(progress[id] || {}, { [P.addDays(TODAY, -Math.floor(rnd() * 6))]: Math.floor(rnd() * 10) / 2 || 0.5 });
    }
    const s = { weekdayHours: Math.floor(rnd() * 12) / 2, weekendHours: rnd() < 0.5 ? null : Math.floor(rnd() * 12) / 2 };
    const plan = P.replan(exams, s, progress, TODAY);
    plan.days.forEach((d) => {
      assert.ok(d.totalHours <= d.capacityHours + 1e-9);
      d.items.forEach((it) => assert.equal((it.hours * 2) % 1, 0));
    });
    plan.exams.forEach((e) => {
      assert.ok(e.remainingHours >= 0 && e.shortHours >= 0 && e.ratio <= 1 && e.ratio >= 0);
      const scheduled = plan.days.reduce((sum, d) => sum + d.items.filter((i) => i.examId === e.id).reduce((a, i) => a + i.hours, 0), 0);
      assert.ok(Math.abs(scheduled - e.plannedHours) < 1e-9, 'scheduled == plannedHours');
      if (e.doneToday === 0) {
        // nothing is lost: done before + scheduled + short = need (unless it was already complete)
        const doneBefore = e.doneHours;
        assert.ok(Math.abs(Math.max(0, e.neededHours - doneBefore) - (scheduled + e.shortHours)) < 1e-9, 'conservation');
      }
    });
  }
});

test('replan does not throw on garbage', () => {
  assert.doesNotThrow(() => P.replan(null, null, null, 'x'));
  assert.doesNotThrow(() => P.replan([{}, null, 5], {}, { a: 5, b: { x: 'y' }, c: null }, TODAY));
  const p = P.replan([ex('a', 'A', '2026-11-20')], wk, 'nope', TODAY);
  assert.equal(p.totals.done, 0);
});

test('streak: counts back from today, today without work does not break it yet', () => {
  const pr = { a: { '2026-11-06': 1, '2026-11-07': 0.5, '2026-11-08': 2 }, b: { '2026-11-08': 1 } };
  assert.equal(P.streak(pr, TODAY).current, 3); // today still empty
  assert.equal(P.streak(P.addProgress(pr, 'a', TODAY, 0.5), TODAY).current, 4);
  assert.equal(P.streak(pr, '2026-11-10').current, 0); // a whole day missed
  assert.equal(P.streak({}, TODAY).current, 0);
  assert.equal(P.streak(null, TODAY).current, 0);
});

test('streak: gap breaks the run, best is kept, zero hours do not count', () => {
  const pr = { a: { '2026-11-01': 1, '2026-11-02': 1, '2026-11-03': 1, '2026-11-04': 1, '2026-11-08': 1, '2026-11-07': 0 } };
  const s = P.streak(pr, TODAY);
  assert.equal(s.current, 1);
  assert.equal(s.best, 4);
});

test('setProgress / addProgress: 30 min steps, clamps, removes zero, does not mutate input', () => {
  const p0 = { a: { '2026-11-09': 1 } };
  const p1 = P.addProgress(p0, 'a', '2026-11-09', 0.5);
  assert.equal(p1.a['2026-11-09'], 1.5);
  assert.equal(p0.a['2026-11-09'], 1);
  assert.equal(P.addProgress(p1, 'a', '2026-11-09', -5).a, undefined);
  assert.equal(P.setProgress({}, 'a', '2026-11-09', 99).a['2026-11-09'], 24);
  assert.equal(P.setProgress({}, 'a', '2026-11-09', 0.7).a['2026-11-09'], 0.5);
  assert.deepEqual(P.setProgress({}, 'a', 'not-a-date', 2), {});
  assert.deepEqual(P.setProgress({}, 'a', '2026-11-09', NaN), {});
});

test('sanitizeProgress drops bad rows and unknown exams', () => {
  const clean = P.sanitizeProgress({
    a: { '2026-11-09': 2, 'bad': 1, '2026-11-08': -1, '2026-11-07': 'x', '2026-11-06': 30, '2026-11-05': 1.2 },
    ghost: { '2026-11-09': 1 }, c: 5, d: [1]
  }, ['a', 'c', 'd']);
  assert.deepEqual(clean, { a: { '2026-11-09': 2, '2026-11-05': 1 } });
  assert.deepEqual(P.sanitizeProgress('x'), {});
});

test('focusCredit: nearest 30 min, nothing under 15 min', () => {
  assert.equal(P.focusCredit(25), 0.5);
  assert.equal(P.focusCredit(50), 1);
  assert.equal(P.focusCredit(15), 0.5);
  assert.equal(P.focusCredit(14), 0);
  assert.equal(P.focusCredit(0), 0);
  assert.equal(P.focusCredit(-3), 0);
  assert.equal(P.focusCredit(NaN), 0);
  assert.equal(P.focusCredit(9999), 4);
});

test('backup: round trip keeps exams, checklist, progress and settings', () => {
  const sample = P.sampleData(TODAY, ['A', 'B', 'C', 'D'], [['x', 'y'], ['z'], [], []]);
  const json = JSON.stringify(P.buildBackup(sample, new Date('2026-11-09T10:00:00Z')));
  const res = P.validateBackup(JSON.parse(json));
  assert.equal(res.error, null);
  assert.equal(res.dropped, 0);
  assert.deepEqual(res.data.exams, sample.exams);
  assert.deepEqual(res.data.progress, sample.progress);
  assert.equal(res.data.weekday, '3');
});

test('backup: bad files give an error code and never throw', () => {
  const bad = [null, 5, 'x', [], {}, { app: 'other' }, { app: 'exam-plan', version: 9, exams: [] },
    { app: 'exam-plan', version: 2, exams: 'no' },
    { app: 'exam-plan', version: 2, exams: [{ id: 1 }, null, { id: 'x', name: 'N', date: 'bad', difficulty: 'easy' }] },
    { app: 'exam-plan', version: 2, exams: new Array(101).fill({}) }];
  const codes = bad.map((b) => { let r; assert.doesNotThrow(() => { r = P.validateBackup(b); }); assert.ok(r.error, JSON.stringify(b)); return r.error; });
  assert.ok(codes.includes('backup.tooMany') && codes.includes('backup.noValid') && codes.includes('backup.app'));
});

test('backup: partly bad data keeps the good exams and counts the dropped ones', () => {
  const good = { id: 'g', name: ' Good  Exam ', date: '2026-12-01', difficulty: 'easy', topics: 3, time: '25:00', checklist: [{ id: 'c1', text: 'T', done: true }, { id: 'c1', text: 'dup' }, { text: 'no id' }] };
  const r = P.validateBackup({ app: 'exam-plan', version: 2, exams: [good, { id: 'g', name: 'Other', date: '2026-12-02', difficulty: 'easy' }, { id: 'h', name: 'good exam', date: '2026-12-02', difficulty: 'easy' }, 7],
    settings: { weekday: 'abc', weekend: '2' }, progress: { g: { '2026-11-08': 1 }, zz: { '2026-11-08': 1 } } });
  assert.equal(r.error, null);
  assert.equal(r.dropped, 3); // duplicate id, duplicate name, not an object
  assert.equal(r.data.exams.length, 1);
  assert.equal(r.data.exams[0].name, 'Good Exam');
  assert.equal(r.data.exams[0].time, '');
  assert.deepEqual(r.data.exams[0].checklist, [{ id: 'c1', text: 'T', done: true }]);
  assert.equal(r.data.weekday, '3'); // bad value falls back
  assert.equal(r.data.weekend, '2');
  assert.deepEqual(Object.keys(r.data.progress), ['g']);
});

test('backup: an empty exam list is a valid backup', () => {
  const r = P.validateBackup({ app: 'exam-plan', version: 2, exams: [] });
  assert.equal(r.error, null);
  assert.deepEqual(r.data.exams, []);
});

test('sampleData: has progress, ticked topics, a 3-day streak and a plan that replans cleanly', () => {
  const s = P.sampleData(TODAY, ['A', 'B', 'C', 'D'], [['1', '2', '3', '4', '5', '6'], ['1', '2', '3', '4', '5'], ['1'], []]);
  assert.equal(s.exams.length, 4);
  assert.equal(P.streak(s.progress, TODAY).current, 3);
  assert.equal(s.exams[0].checklist.filter((c) => c.done).length, 3);
  const plan = P.replan(s.exams, { weekdayHours: 3, weekendHours: null }, s.progress, TODAY);
  assert.ok(plan.totals.done > 0 && plan.totals.remaining > 0);
  assert.ok(plan.exams.every((e) => e.ratio > 0 || e.id === 'sample-4'));
  s.exams.forEach((e) => assert.ok(P.sanitizeExam(e)));
});
