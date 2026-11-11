/* First-run guide: three skippable steps, ends with the sample data option. */
import { state, save } from './store.js';
import { $, t, trapFocus } from './util.js';

let step = 0;
let release = null;
let opener = null;
let hooks = null;
const LAST = 2;

function show() {
  for (let i = 0; i <= LAST; i++) $('ob-step-' + i).hidden = i !== step;
  const dots = $('ob-dots');
  Array.prototype.forEach.call(dots.children, (d, i) => d.classList.toggle('on', i === step));
  $('ob-count').textContent = t('ob.count', { a: step + 1, b: LAST + 1 });
  $('ob-back').hidden = step === 0;
  $('ob-next').hidden = step === LAST;
  $('ob-sample').hidden = step !== LAST;
  $('ob-empty').hidden = step !== LAST;
  $('ob-skip').hidden = step === LAST;
}

export function openGuide() {
  step = 0;
  opener = document.activeElement;
  $('guide').hidden = false;
  document.body.classList.add('focus-open');
  release = trapFocus($('guide'), () => finish(false));
  show();
  $('ob-next').focus();
}

export function refreshGuide() { if (!$('guide').hidden) show(); }

function finish(sample) {
  if (release) release();
  release = null;
  $('guide').hidden = true;
  document.body.classList.remove('focus-open');
  state.onboarded = true;
  save();
  if (sample && hooks.sample) hooks.sample();
  else if (opener && document.body.contains(opener)) opener.focus();
}

export function initGuide(h) {
  hooks = h;
  $('ob-next').addEventListener('click', () => { step = Math.min(LAST, step + 1); show(); $('ob-next').hidden ? $('ob-sample').focus() : $('ob-next').focus(); });
  $('ob-back').addEventListener('click', () => { step = Math.max(0, step - 1); show(); $('ob-next').focus(); });
  $('ob-skip').addEventListener('click', () => finish(false));
  $('ob-empty').addEventListener('click', () => finish(false));
  $('ob-sample').addEventListener('click', () => finish(true));
}
