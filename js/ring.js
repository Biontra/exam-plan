/* SVG progress ring: thick outer ring = hours done, thin inner ring = topics ticked. */
const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  Object.keys(attrs || {}).forEach((k) => n.setAttribute(k, attrs[k]));
  return n;
}

function arc(r, stroke, cls, ratio, animate) {
  const len = 2 * Math.PI * r;
  const c = svg('circle', {
    cx: 50, cy: 50, r, fill: 'none', 'stroke-width': stroke, 'stroke-linecap': 'round',
    class: cls, transform: 'rotate(-90 50 50)',
    'stroke-dasharray': len.toFixed(2), 'stroke-dashoffset': (len * (1 - ratio)).toFixed(2)
  });
  c.style.setProperty('--len', len.toFixed(2));
  if (animate) c.classList.add('ring-anim');
  return c;
}

/*
 * opts: { ratio, topicRatio (null = no second ring), color: cyan|amber|green|purple,
 *         label (accessible text), text (center text), size (px), animate }
 */
export function ring(opts) {
  const r = Math.max(0, Math.min(1, opts.ratio || 0));
  const s = svg('svg', { viewBox: '0 0 100 100', class: 'ring ring-' + (opts.color || 'cyan'), role: 'img', 'aria-label': opts.label || '' });
  s.style.width = s.style.height = (opts.size || 96) + 'px';
  s.appendChild(svg('circle', { cx: 50, cy: 50, r: 43, fill: 'none', 'stroke-width': 9, class: 'ring-bg' }));
  if (r > 0) s.appendChild(arc(43, 9, 'ring-fg', r, opts.animate));
  if (opts.topicRatio !== null && opts.topicRatio !== undefined) {
    s.appendChild(svg('circle', { cx: 50, cy: 50, r: 31, fill: 'none', 'stroke-width': 3.5, class: 'ring-bg2' }));
    if (opts.topicRatio > 0) s.appendChild(arc(31, 3.5, 'ring-fg2', Math.min(1, opts.topicRatio), opts.animate));
  }
  const tx = svg('text', { x: 50, y: 50, class: 'ring-text', 'text-anchor': 'middle', 'dominant-baseline': 'central', 'aria-hidden': 'true' });
  tx.textContent = opts.text || '';
  s.appendChild(tx);
  return s;
}
