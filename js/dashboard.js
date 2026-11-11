/* Mission control: next-mission countdown, summary tiles, timeline. */
import { state, today } from './store.js';
import { $, el, t, num, pct, fmtLong, fmtShort, fmtTime, dayDiff, examMoment, diffColor, hoursText } from './util.js';
import { ring } from './ring.js';

let hero = null; // { moment } of the exam the clock runs to

function upcoming() {
  const td = today();
  return state.exams
    .filter((e) => dayDiff(e.date, td) >= 0)
    .sort((a, b) => examMoment(a) - examMoment(b) || (a.name < b.name ? -1 : 1));
}

export function nextExam() { return upcoming()[0] || null; }

function unit(id, label) {
  return el('div', { class: 'cd-unit' },
    el('span', { class: 'cd-num', id: 'cd-' + id, 'aria-hidden': 'true', text: '00' }),
    el('span', { class: 'cd-lab', text: label }));
}

export function renderMission(plan, animate) {
  const box = $('mission-body');
  box.textContent = '';
  const list = upcoming();
  const e = list[0];
  hero = null;
  if (!e) {
    $('mission-eyebrow').textContent = t('mission.none.eyebrow');
    box.appendChild(el('h2', { class: 'hero-title', text: t('mission.none.title') }));
    box.appendChild(el('p', { class: 'lead', text: t('mission.none.text') }));
    const row = el('div', { class: 'row' });
    const sample = el('button', { type: 'button', class: 'btn primary', id: 'sample-btn', text: t('empty.sample') });
    const add = el('button', { type: 'button', class: 'btn', id: 'goto-add', text: t('mission.none.add') });
    row.appendChild(sample); row.appendChild(add);
    box.appendChild(row);
    return;
  }
  $('mission-eyebrow').textContent = t('mission.eyebrow');
  hero = { moment: examMoment(e), assumed: !e.time };
  const rec = plan.exams.find((x) => x.id === e.id);
  const col = diffColor(e.difficulty);
  const when = fmtLong(e.date) + (e.time ? ', ' + fmtTime(e.time) : '');

  const info = el('div', { class: 'hero-info' });
  info.appendChild(el('h2', { class: 'hero-title', text: e.name }));
  info.appendChild(el('p', { class: 'meta', text: when }));
  const chips = el('div', { class: 'chips' }, el('span', { class: 'chip ' + col, text: t('diff.' + e.difficulty) }));
  if (list.length > 1) chips.appendChild(el('span', { class: 'chip', text: t('mission.more', { n: list.length - 1 }) }));
  if (!e.time) chips.appendChild(el('span', { class: 'chip', text: t('mission.assumed') }));
  info.appendChild(chips);

  const clock = el('div', { class: 'clock', role: 'timer', 'aria-label': t('mission.clockLabel', { name: e.name }) });
  clock.appendChild(unit('d', t('unit.d')));
  clock.appendChild(el('span', { class: 'cd-sep', 'aria-hidden': 'true', text: ':' }));
  clock.appendChild(unit('h', t('unit.h')));
  clock.appendChild(el('span', { class: 'cd-sep', 'aria-hidden': 'true', text: ':' }));
  clock.appendChild(unit('m', t('unit.m')));
  clock.appendChild(el('span', { class: 'cd-sep', 'aria-hidden': 'true', text: ':' }));
  clock.appendChild(unit('s', t('unit.s')));

  const left = el('div', { class: 'hero-main' }, info, clock, el('p', { class: 'sr-only', id: 'cd-sr' }),
    el('p', { class: 'hero-note', id: 'cd-note' }));

  const parts = [left];
  if (rec) {
    const topics = e.checklist.length ? e.checklist.filter((c) => c.done).length / e.checklist.length : null;
    const label = t('ring.label', { name: e.name, done: num(rec.doneHours), need: num(rec.neededHours), p: pct(rec.ratio) });
    const r = ring({ ratio: rec.ratio, topicRatio: topics, color: col, label, text: pct(rec.ratio) + '%', size: 120, animate });
    parts.push(el('div', { class: 'hero-ring' }, r,
      el('p', { class: 'ring-cap', text: t('mission.ready') }),
      el('p', { class: 'ring-sub', text: t('mission.left', { h: hoursText(rec.remainingHours) }) })));
  }
  parts.forEach((p) => box.appendChild(p));
  tick();
}

// Called every second. Only touches the digits, never rebuilds the card.
export function tick() {
  if (!hero) return;
  const ms = hero.moment.getTime() - Date.now();
  const past = ms <= 0;
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400), h = Math.floor(total / 3600) % 24, m = Math.floor(total / 60) % 60, s = total % 60;
  const set = (id, v) => { const n = $('cd-' + id); const txt = String(v).padStart(2, '0'); if (n && n.textContent !== txt) n.textContent = txt; };
  set('d', d); set('h', h); set('m', m); set('s', s);
  const sr = $('cd-sr');
  if (sr) {
    const txt = past ? t('mission.started') : t('mission.sr', { d, h, m });
    if (sr.textContent !== txt) sr.textContent = txt;
  }
  const note = $('cd-note');
  if (note) {
    const txt = past ? t('mission.started') : '';
    if (note.textContent !== txt) note.textContent = txt;
  }
}

// ---------- summary tiles ----------

function tile(cls, label, value, sub, extra) {
  return el('li', { class: 'tile ' + cls },
    el('span', { class: 'tile-lab', text: label }),
    el('span', { class: 'tile-val', text: value }),
    sub ? el('span', { class: 'tile-sub', text: sub }) : null,
    extra || null);
}

export function renderStats(plan) {
  const ul = $('stats-list');
  ul.textContent = '';
  const T = plan.totals;
  const h = (n) => num(n) + ' ' + t('unit.hshort');
  const has = plan.exams.length > 0;
  const donePct = T.needed > 0 ? pct(T.done / T.needed) : 0;
  ul.appendChild(tile('t-cyan', t('stat.planned'), has ? h(T.needed) : '—', has ? t('stat.plannedSub', { n: plan.exams.length }) : t('stat.none')));
  ul.appendChild(tile('t-green', t('stat.done'), has ? h(T.done) : '—', has ? t('stat.doneSub', { p: donePct }) : ''));
  ul.appendChild(tile('t-amber', t('stat.left'), has ? h(T.remaining) : '—', has && T.extra > 0 ? t('stat.extra', { h: h(T.extra) }) : ''));
  const s = plan.streak;
  ul.appendChild(tile('t-purple', t('stat.streak'), t(s.current === 1 ? 'days.one' : 'days.many', { n: s.current }),
    s.best > s.current ? t('stat.best', { n: s.best }) : (s.current === 0 ? t('stat.streakHint') : t('stat.streakKeep'))));
  const bar = el('span', { class: 'bar', 'aria-hidden': 'true' }, el('span', { class: 'bar-fill', style: 'width:' + (T.todayTarget > 0 ? pct(T.todayDone / T.todayTarget) : 0) + '%' }));
  ul.appendChild(tile('t-cyan', t('stat.today'), has ? num(T.todayDone) + ' / ' + h(T.todayTarget) : '—', '', has ? bar : null));
}

// ---------- timeline ----------

export function renderTimeline(plan) {
  const box = $('timeline-body');
  box.textContent = '';
  const td = today();
  const list = upcoming();
  if (!list.length) {
    box.appendChild(el('p', { class: 'free', text: t('timeline.empty') }));
    return;
  }
  const last = dayDiff(list[list.length - 1].date, td);
  const span = Math.max(7, last);

  const wrap = el('div', { class: 'tl' });
  // load strip: planned hours per day against that day's capacity
  const strip = el('div', { class: 'tl-bars', 'aria-hidden': 'true' });
  for (let i = 0; i <= span; i++) {
    const d = plan.days[i];
    const r = d && d.capacityHours > 0 ? Math.min(1, Math.max(d.totalHours, i === 0 ? plan.totals.todayDone : 0) / d.capacityHours) : 0;
    const col = el('span', { class: 'tl-col' + (i === 0 ? ' now' : '') });
    col.appendChild(el('span', { class: 'tl-bar', style: 'height:' + Math.round(r * 100) + '%' }));
    strip.appendChild(col);
  }
  const track = el('div', { class: 'tl-track' });
  const ol = el('ol', { class: 'tl-list', 'aria-label': t('timeline.label') });
  ol.appendChild(el('li', { class: 'tl-item tl-now', style: '--pos:0' },
    el('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
    el('span', { class: 'tl-text' }, el('strong', { text: t('timeline.today') }), el('span', { text: fmtShort(td) }))));
  const lanes = [0, -100, -100]; // lane 1 holds the Today label
  list.forEach((e) => {
    const diff = dayDiff(e.date, td);
    const pos = diff / span * 100;
    let lane = lanes.findIndex((p) => pos - p >= 30);
    if (lane < 0) lane = lanes.indexOf(Math.min.apply(null, lanes));
    lanes[lane] = pos;
    const al = pos > 82 ? 'al-r' : pos < 12 ? 'al-l' : 'al-c';
    const when = diff === 0 ? t('card.today') : diff === 1 ? t('card.tomorrow') : t('card.days', { n: diff });
    ol.appendChild(el('li', { class: 'tl-item ' + al + ' c-' + diffColor(e.difficulty), style: '--pos:' + pos.toFixed(2) + ';--lane:' + (lane + 1) },
      el('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'tl-text' },
        el('strong', { text: e.name }),
        el('span', { text: when + ' · ' + fmtShort(e.date) + (e.time ? ' ' + fmtTime(e.time) : '') + ' · ' + t('diff.' + e.difficulty) }))));
  });
  track.appendChild(strip);
  track.appendChild(el('div', { class: 'tl-line', 'aria-hidden': 'true' }));
  track.appendChild(el('div', { class: 'tl-today', 'aria-hidden': 'true' }));
  track.appendChild(ol);
  wrap.appendChild(track);
  wrap.appendChild(el('p', { class: 'tl-legend' },
    el('span', { class: 'lg c-green', text: t('diff.easy') }),
    el('span', { class: 'lg c-cyan', text: t('diff.medium') }),
    el('span', { class: 'lg c-amber', text: t('diff.hard') }),
    el('span', { class: 'lg-note', text: t('timeline.bars') })));
  box.appendChild(wrap);
}
