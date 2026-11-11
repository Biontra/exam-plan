/* Settings tab: study hours, focus length, sound, backup and restore. */
import { state, P, save, exportData, replaceAll, commit, today } from './store.js';
import { $, el, t, announce } from './util.js';

const HOUR_FIELDS = { weekday: 'h-weekday', weekend: 'h-weekend' };
let hourErrors = {};
let pending = null; // validated import waiting for a click on "Replace"
const MAX_FILE = 2 * 1024 * 1024;

export function renderHourErrors() {
  Object.keys(HOUR_FIELDS).forEach((f) => {
    const input = $(HOUR_FIELDS[f]);
    const msg = $('err-' + f);
    const code = hourErrors[f];
    if (code) { msg.textContent = t('err.' + code); input.setAttribute('aria-invalid', 'true'); }
    else { msg.textContent = ''; input.removeAttribute('aria-invalid'); }
  });
}

function onHoursInput() {
  const wd = P.validateHours($('h-weekday').value, false);
  const we = P.validateHours($('h-weekend').value, true);
  hourErrors = { weekday: wd.error, weekend: we.error };
  renderHourErrors();
  // the plan keeps the last valid values until both fields are valid
  if (!wd.error && !we.error) {
    state.weekday = $('h-weekday').value.trim();
    state.weekend = $('h-weekend').value.trim();
    commit();
  } else {
    announce(t('status.hoursBad'), { bad: true });
  }
}

export function syncSettingsInputs() {
  $('h-weekday').value = state.weekday;
  $('h-weekend').value = state.weekend;
  $('set-focus').value = String(state.focusMin);
  $('set-focus-out').textContent = t('focus.min', { n: state.focusMin });
  $('set-sound').checked = state.sound;
}

// ---------- backup ----------

function backupMsg(text, bad) {
  const m = $('backup-msg');
  m.textContent = text;
  m.classList.toggle('bad', !!bad);
}

function exportJson() {
  try {
    const json = JSON.stringify(exportData(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = el('a', { href: url, download: 'exam-plan-backup-' + today() + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    backupMsg(t('backup.exported'), false);
    announce(t('backup.exported'));
  } catch (err) {
    backupMsg(t('backup.exportFail'), true);
  }
}

function clearPending() {
  pending = null;
  $('import-confirm').hidden = true;
}

function onFile(ev) {
  const input = ev.target;
  const file = input.files && input.files[0];
  clearPending();
  if (!file) return;
  if (file.size > MAX_FILE) { backupMsg(t('err.backup.size'), true); input.value = ''; return; }
  const reader = new FileReader();
  reader.onerror = () => backupMsg(t('err.backup.read'), true);
  reader.onload = () => {
    let raw;
    try { raw = JSON.parse(String(reader.result)); } catch (err) { backupMsg(t('err.backup.json'), true); input.value = ''; return; }
    const res = P.validateBackup(raw);
    if (res.error) { backupMsg(t('err.' + res.error), true); input.value = ''; return; }
    pending = res.data;
    const rows = Object.keys(res.data.progress).reduce((n, id) => n + Object.keys(res.data.progress[id]).length, 0);
    $('import-text').textContent = t('backup.found', { n: res.data.exams.length, d: rows }) + (res.dropped ? ' ' + t('backup.dropped', { n: res.dropped }) : '');
    $('import-confirm').hidden = false;
    backupMsg('', false);
    $('import-yes').focus();
    input.value = '';
  };
  reader.readAsText(file);
}

export function initSettings(hooks) {
  $('h-weekday').addEventListener('input', onHoursInput);
  $('h-weekend').addEventListener('input', onHoursInput);
  $('set-focus').addEventListener('input', () => {
    const v = +$('set-focus').value;
    if (v >= 15 && v <= 50) { state.focusMin = v; save(); }
    $('set-focus-out').textContent = t('focus.min', { n: state.focusMin });
  });
  $('set-sound').addEventListener('change', () => { state.sound = $('set-sound').checked; save(); });
  $('export-btn').addEventListener('click', exportJson);
  $('import-btn').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', onFile);
  $('import-no').addEventListener('click', () => { clearPending(); backupMsg(t('backup.cancelled'), false); $('import-btn').focus(); });
  $('import-yes').addEventListener('click', () => {
    if (!pending) return;
    const d = pending;
    clearPending();
    replaceAll(d);
    syncSettingsInputs();
    hourErrors = {};
    renderHourErrors();
    backupMsg(t('backup.imported', { n: d.exams.length }), false);
    announce(t('backup.imported', { n: d.exams.length }));
    if (hooks && hooks.afterImport) hooks.afterImport();
  });
  $('guide-btn').addEventListener('click', () => hooks && hooks.showGuide && hooks.showGuide());
}
