// Tiny DOM toolkit: element builder, inline SVG icons, rich rules text, toasts.

import { RES_NAME, TAG_NAME } from '../engine/data.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const prop in v) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v[prop]);
        else el.style[prop] = v[prop];
      }
    }
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

// The UI builds its panels with el.append(a, cond ? b : null, [c, d]). The
// browser's own append() would print "null" and "a,b" for those, so within
// this app append() skips empty values and flattens lists, as h() does.
const nativeAppend = Element.prototype.append;
Element.prototype.append = function appendClean(...kids) {
  return nativeAppend.apply(this, kids.flat(Infinity).filter((k) => k !== null && k !== undefined && k !== false));
};

function append(el, kids) {
  for (const kid of kids) {
    if (kid === null || kid === undefined || kid === false) continue;
    if (Array.isArray(kid)) append(el, kid);
    else el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
}

const disc = (fill, glyph) => `<circle cx="12" cy="12" r="11" fill="${fill}"/>${glyph}`;

const SVG = {
  gold: '<circle cx="12" cy="12" r="9.5" fill="#e9b93a" stroke="#8a6410" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#8a6410" stroke-width="1.3"/>',
  stone: '<path d="M3 16 6 8l7-3 7 4 1 8-7 3-8-1z" fill="#b3b0a8" stroke="#55524d" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 8l6 4 8-3M12 12l2 8" fill="none" stroke="#55524d" stroke-width="1"/>',
  ore: '<path d="M4 17 8 6l7-2 5 8-3 8H8z" fill="#4d5361" stroke="#22252c" stroke-width="1.5" stroke-linejoin="round"/><path d="M9 9.5l3-1 1 3-3 1zM13 14.5l3-1 1 3-3 1z" fill="#ee8a3c"/>',
  food: '<path d="M12 22V9" stroke="#7a8a2a" stroke-width="1.8"/><path d="M12 9C8 8 7 5 8 2.5c3 1 4 3.500 4 6.500zM12 9c4-1 5-4 4-6.500-3 1-4 3.500-4 6.500zM12 15.500c-4-1-5.500-4-5-6.500 3 1 5 3.500 5 6.500zM12 15.500c4-1 5.500-4 5-6.500-3 1-5 3.500-5 6.500z" fill="#e6c545" stroke="#8f7414" stroke-width="1"/>',
  rm: '<rect x="2.500" y="8" width="15" height="9" rx="2" fill="#9b6b3f" stroke="#55361a" stroke-width="1.5"/><ellipse cx="18" cy="12.500" rx="3.200" ry="4.500" fill="#dcb88e" stroke="#55361a" stroke-width="1.5"/><circle cx="18" cy="12.500" r="1.300" fill="none" stroke="#55361a"/>',
  lux: '<path d="M12 21.500 2.500 10 7 3.500h10l4.500 6.500z" fill="#a064d6" stroke="#47206f" stroke-width="1.5" stroke-linejoin="round"/><path d="M2.500 10h19M7 3.500l3 6.500 2 11.500L14 10l3-6.500" fill="none" stroke="#ecdcfb" stroke-width="1"/>',
  card: '<rect x="6" y="2.500" width="12" height="19" rx="2" fill="#f2e6c8" stroke="#5a4526" stroke-width="1.5"/><path d="M9 8h6M9 12h6M9 16h4" stroke="#5a4526" stroke-width="1.3"/>',
  rf: '<path d="M3 17.500 4.500 6.500 9 11.500l3-7 3 7 4.500-5 1.500 11z" fill="#e9b93a" stroke="#8a6410" stroke-width="1.5" stroke-linejoin="round"/><rect x="3" y="18" width="18" height="3" rx="1" fill="#8a6410"/>',
  fp: '<circle cx="12" cy="12" r="10" fill="#a3282c" stroke="#5c1014" stroke-width="1.5"/><path d="M12 5.500l1.900 4.200 4.600.500-3.400 3.100.900 4.500-4-2.300-4 2.300.900-4.500-3.400-3.100 4.600-.500z" fill="#f6d67a"/>',
  building: disc('#8d6e4f', '<path d="M8 19V10H6.500V6H9v1.800h1.800V6h2.400v1.800H15V6h2.500v4H16v9z" fill="#fff"/>'),
  military: disc('#8f2f2f', '<path d="M12 3.500l2 3.500v6.500h2.800v2H13.500V19h-3v-3.500H7.200v-2H10V7z" fill="#fff"/>'),
  trade: disc('#b8862b', '<path d="M9.500 5.500h5l-1.200 2.500c2.800 1.200 4.200 3.800 4.200 6.200 0 2.600-2 4.300-5.500 4.300s-5.500-1.700-5.500-4.300c0-2.400 1.400-5 4.200-6.200z" fill="#fff"/>'),
  farming: disc('#4f8a45', '<path d="M6.500 17.500c0-7 4-11 11-11 0 7-4 11-11 11z" fill="#fff"/><path d="M6.500 17.500l6.500-6.500" stroke="#4f8a45" stroke-width="1.3"/>'),
  faith: disc('#3d5a99', '<path d="M10.500 4.500h3V9H18v3h-4.500v7.500h-3V12H6V9h4.500z" fill="#fff"/>'),
  scholar: disc('#2f7f86', '<path d="M4.500 7h5.500c1 0 2 .500 2 1.300C12 7.500 13 7 14 7h5.500v10H14c-1 0-2 .400-2 1 0-.600-1-1-2-1H4.500z" fill="#fff"/><path d="M12 8.300V18" stroke="#2f7f86" stroke-width="1.200"/>'),
  court: disc('#7d4bc4', '<path d="M5.500 16.500 6.800 8l3.400 3.500L12 6.500l1.800 5L17.200 8l1.300 8.500z" fill="#fff"/>'),
  event: '<path d="M13 2 4 13.500h6.500L9.500 22 20 9.500h-7z" fill="#f6d67a" stroke="#8a6410" stroke-width="1.2" stroke-linejoin="round"/>',
  settlers: '<path d="M3 15.500V10c0-3.500 3.500-6 9-6s9 2.500 9 6v5.500z" fill="#f6ecd2" stroke="currentColor" stroke-width="1.6"/><circle cx="7.500" cy="17.500" r="2.800" fill="currentColor"/><circle cx="16.500" cy="17.500" r="2.800" fill="currentColor"/>',
  soldiers: '<path d="M12 2.500 20 5.500v6.500c0 5-3.500 8-8 9.500-4.500-1.500-8-4.500-8-9.500V5.500z" fill="currentColor" stroke="#1d1611" stroke-width="1.2"/><path d="M12 6v12M7 10.500h10" stroke="#f6ecd2" stroke-width="1.800"/>',
  knights: '<path d="M12 2.500 20 5.500v6.500c0 5-3.500 8-8 9.500-4.500-1.500-8-4.500-8-9.500V5.500z" fill="currentColor" stroke="#1d1611" stroke-width="1.2"/><path d="M12 6.500l1.600 3.400 3.700.400-2.700 2.500.700 3.700-3.300-1.900-3.300 1.900.700-3.700-2.700-2.500 3.700-.400z" fill="#f6d67a"/>',
  caravan: '<rect x="3.500" y="6" width="17" height="10" rx="1.500" fill="currentColor" stroke="#1d1611" stroke-width="1.2"/><path d="M3.500 11h17M12 6v10" stroke="#f6ecd2" stroke-width="1.400"/><circle cx="7.500" cy="18.500" r="2.300" fill="#1d1611"/><circle cx="16.500" cy="18.500" r="2.300" fill="#1d1611"/>',
};
SVG.power = SVG.military;
SVG.wealth = SVG.gold;

const TITLES = { ...RES_NAME, ...TAG_NAME, rf: 'Royal Favor', fp: 'Favor Points', power: 'Power', wealth: 'Wealth', event: 'Event' };

export function svgString(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${SVG[name] || ''}</svg>`;
}

export function icon(name, cls = '') {
  return h('span', { class: 'ico ' + cls, title: TITLES[name] || name, html: svgString(name) });
}

// "Gain 4 {gold}" -> text with inline icons.
export function rich(text) {
  const frag = document.createDocumentFragment();
  const parts = String(text).split(/\{(\w+)\}/);
  parts.forEach((part, i) => {
    if (i % 2) frag.append(icon(part));
    else if (part) frag.append(part);
  });
  return frag;
}

export function amount(n, res, cls = '') {
  return h('span', { class: 'amt ' + cls }, String(n), icon(res));
}

export function costRow(cost) {
  const order = ['gold', 'stone', 'ore', 'food', 'rm', 'lux'];
  return h('span', { class: 'cost-row' }, order.filter((r) => cost[r]).map((r) => amount(cost[r], r)));
}

let toastBox = null;
export function toast(msg, kind = '') {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    document.body.append(toastBox);
  }
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastBox.append(t);
  setTimeout(() => t.classList.add('gone'), 3200);
  setTimeout(() => t.remove(), 3800);
}

export function clear(el) {
  while (el.firstChild) el.firstChild.remove();
  return el;
}

// A modal dialog. Returns { el, close }.
export function modal({ title, body, wide = false, onClose = null, dismissable = true, cls = '' }) {
  const close = () => {
    wrap.remove();
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
  const box = h('div', { class: 'modal ' + (wide ? 'wide ' : '') + cls },
    h('div', { class: 'modal-head' },
      h('h2', {}, title),
      dismissable ? h('button', { class: 'x', onclick: close, 'aria-label': 'Close' }, '×') : null),
    h('div', { class: 'modal-body' }, body));
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap && dismissable) close(); } }, box);
  document.body.append(wrap);
  document.addEventListener('keydown', onKey);
  return { el: box, wrap, close };
}
