/* Today view (blocks you can log) and the day-by-day plan list. */
import { state, today, logHours, setHours } from './store.js';
import { $, el, t, num, pct, fmtDay, fmtLong, fmtTime, hoursText, announce, diffColor } from './util.js';
import { openFocus } from './focus.js';

function block(it, rec) {
  const target = it.hours;
  const done = it.doneHours;
  const key = it.examId;
  const complete = target > 0 && done >= target;
  const li = el('li', { class: 'block c-' + diffColor(rec ? rec.difficulty : 'medium') + (complete ? ' is-done' : '') });

  const head = el('div', { class: 'block-head' });
  const title = el('h3', { class: 'block-title' }, el('span', { text: it.name }));
  if (it.review) title.appendChild(el('span', { class: 'tag', text: t('plan.review') }));
  if (it.extra) title.appendChild(el('span', { class: 'tag', text: t('today.extra') }));
  head.appendChild(title);
  const amount = target > 0 ? num(done) + ' / ' + num(target) + ' ' + t('unit.hshort') : num(done) + ' ' + t('unit.hshort');
  head.appendChild(el('span', { class: 'block-amount', text: amount }));
  li.appendChild(head);

  const ratio = target > 0 ? Math.min(1, done / target) : 1;
  li.appendChild(el('span', { class: 'bar', 'aria-hidden': 'true' }, el('span', { class: 'bar-fill', style: 'width:' + pct(ratio) + '%' })));
  li.appendChild(el('p', { class: 'sr-only', text: t('today.srProgress', { name: it.name, done: hoursText(done), target: hoursText(target) }) }));

  const ctl = el('div', { class: 'block-ctl' });
  const minus = el('button', { type: 'button', class: 'btn step', 'data-fk': 'm-' + key, 'aria-label': t('today.minusLabel', { name: it.name }), text: '−0.5' });
  minus.disabled = done <= 0;
  minus.addEventListener('click', () => logHours(it.examId, -0.5));
  const plus = el('button', { type: 'button', class: 'btn step', 'data-fk': 'p-' + key, 'aria-label': t('today.plusLabel', { name: it.name }), text: '+0.5' });
  plus.addEventListener('click', () => logHours(it.examId, 0.5));
  ctl.appendChild(minus); ctl.appendChild(plus);
  if (target > 0) {
    const doneBtn = el('button', {
      type: 'button', class: 'btn' + (complete ? ' on' : ''), 'data-fk': 'd-' + key, 'aria-pressed': String(complete),
      'aria-label': t('today.doneLabel', { name: it.name }), text: complete ? t('today.done') : t('today.markDone')
    });
    doneBtn.addEventListener('click', () => {
      if (complete) setHours(it.examId, 0);
      else { setHours(it.examId, target); announce(t('today.loggedAll', { name: it.name })); }
    });
    ctl.appendChild(doneBtn);
  }
  const focus = el('button', { type: 'button', class: 'btn primary', 'data-fk': 'f-' + key, 'aria-label': t('focus.startLabel', { name: it.name }), text: t('focus.start') });
  focus.addEventListener('click', () => openFocus(it.examId));
  ctl.appendChild(focus);
  li.appendChild(ctl);
  return li;
}

export function renderToday(plan) {
  const td = today();
  $('today-date').textContent = fmtDay(td);
  const list = $('today-list');
  const msg = $('today-msg');
  list.textContent = '';
  msg.textContent = '';
  msg.hidden = true;
  const sum = $('today-sum');
  const T = plan.totals;
  sum.textContent = plan.exams.length ? num(T.todayDone) + ' / ' + num(T.todayTarget) + ' ' + t('unit.hshort') : '';

  if (!state.exams.length) { msg.hidden = false; msg.textContent = t('today.noExams'); return; }
  const day = plan.days[0];
  if (!day) { msg.hidden = false; msg.textContent = plan.skipped.some((s) => s.reason === 'today') ? t('plan.onlyToday') : t('plan.noUpcoming'); return; }

  const byId = {};
  plan.exams.forEach((e) => { byId[e.id] = e; });
  day.items.forEach((it) => list.appendChild(block(it, byId[it.examId])));
  day.exams.forEach((x) => {
    list.appendChild(el('li', { class: 'block exam-today' }, el('strong', { text: t('today.examToday', { name: x.name }) + (x.time ? ' · ' + fmtTime(x.time) : '') }),
      el('span', { text: t('today.goodLuck') })));
  });
  if (!day.items.length) {
    msg.hidden = false;
    const done = plan.exams.length && plan.exams.every((e) => e.completed);
    msg.textContent = done ? t('today.allComplete') : day.capacityHours === 0 ? t('plan.noTime') : t('today.freeDay');
  } else if (T.todayTarget > 0 && T.todayDone >= T.todayTarget) {
    msg.hidden = false;
    msg.textContent = t('today.targetMet', { n: plan.streak.current });
  }
}

// ---------- plan list ----------

export function renderPlan(plan, icsSetter) {
  const section = $('plan-section');
  const summary = $('plan-summary'), warnings = $('plan-warnings');
  const perExam = $('exam-hours'), days = $('day-list');
  summary.textContent = ''; warnings.textContent = ''; perExam.textContent = ''; days.textContent = '';
  const td = today();
  const hasExams = state.exams.length > 0;
  $('plan-body').hidden = !hasExams;
  $('plan-empty').hidden = hasExams;
  const hasPlan = plan.exams.length > 0;
  $('ics-link').hidden = !hasExams;
  $('print-btn').hidden = !hasPlan;
  $('print-meta').textContent = t('plan.printMeta', { date: fmtLong(td) });
  icsSetter(plan);
  if (!hasExams) return;

  if (!hasPlan) {
    const onlyToday = plan.skipped.some((s) => s.reason === 'today');
    summary.textContent = t(onlyToday ? 'plan.onlyToday' : 'plan.noUpcoming');
    return;
  }

  const last = plan.exams[plan.exams.length - 1].date;
  const studyDays = plan.days.filter((d) => d.items.some((i) => i.hours > 0)).length;
  if (plan.totals.remaining === 0) summary.textContent = t('plan.allDone');
  else summary.textContent = t(studyDays === 1 ? 'plan.summary1' : 'plan.summary', {
    days: studyDays, hours: num(plan.totals.remaining), done: num(plan.totals.done), needed: num(plan.totals.needed), date: fmtLong(last)
  });

  const s = { w: state.weekday, e: state.weekend };
  const zero = (s.w.trim() === '0') && (s.e.trim() === '' || s.e.trim() === '0');
  if (zero) warnings.appendChild(el('div', { class: 'note', text: t('plan.zeroHint') }));
  plan.shortages.forEach((sh) => {
    warnings.appendChild(el('div', { class: 'warn', text: t('plan.short', { name: sh.name, hours: hoursText(sh.hours) }) }));
  });

  plan.exams.forEach((e) => {
    const bad = e.shortHours > 0;
    perExam.appendChild(el('li', {},
      el('span', { text: e.name }),
      el('span', { class: 'num' + (bad ? ' bad' : ''),
        text: t('plan.examRow', { done: num(Math.min(e.doneHours, e.neededHours)), need: num(e.neededHours) }) +
          (bad ? ' (' + t('plan.shortBadge', { h: num(e.shortHours) }) + ')' : e.completed ? ' (' + t('plan.complete') + ')' : '') })));
  });

  plan.days.forEach((d, i) => {
    const isFree = !d.items.length && !d.exams.length;
    const li = el('li', { class: 'day' + (d.exams.length ? ' has-exam' : '') + (isFree ? ' is-free' : '') + (i === 0 ? ' is-now' : '') });
    const name = el('span', { class: 'day-name', text: fmtDay(d.date) });
    if (i === 0) name.appendChild(el('span', { class: 'badge', text: t('plan.today') }));
    const tot = i === 0 ? t('plan.hoursOf', { h: num(plan.totals.todayDone), c: num(plan.totals.todayTarget) }) : t('plan.hoursOf', { h: num(d.totalHours), c: num(d.capacityHours) });
    li.appendChild(el('div', { class: 'day-head' }, name, el('span', { class: 'day-total', text: tot })));
    const shown = d.items.filter((it) => it.hours > 0);
    if (shown.length) {
      const ul = el('ul', { class: 'items' });
      shown.forEach((it) => {
        const left = el('span', { text: it.name });
        if (it.review) left.appendChild(el('span', { class: 'tag', text: t('plan.review') }));
        const txt = i === 0 ? num(it.doneHours) + ' / ' + t('plan.hours', { h: num(it.hours) }) : t('plan.hours', { h: num(it.hours) });
        ul.appendChild(el('li', {}, left, el('span', { class: 'item-h', text: txt })));
      });
      li.appendChild(ul);
    }
    d.exams.forEach((x) => {
      li.appendChild(el('p', { class: 'exam-line', text: t('plan.exam') + ': ' + x.name + (x.time ? ' ' + fmtTime(x.time) : '') }));
    });
    if (!shown.length && !d.exams.length) {
      li.appendChild(el('p', { class: 'free', text: d.capacityHours === 0 ? t('plan.noTime') : t('plan.free') }));
    }
    days.appendChild(li);
  });
}
