// Tiny DOM toolkit: element builder, inline SVG icons, rich rules text, toasts.

import { RES_NAME, TAG_NAME } from '../engine/data.js';
import { installSprite, svgUse, svgStandalone } from './icons.js';

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

const TITLES = {
  ...RES_NAME, ...TAG_NAME, rf: 'Royal Favor', fp: 'Favor Points', power: 'Power', wealth: 'Wealth', culture: 'Culture', event: 'Event',
  'tok-noble': 'Nobles', 'tok-acolyte': 'Acolytes', 'tok-scholar': 'Scholars', 'tok-worker': 'Workers', 'tok-artisan': 'Artisans',
  settlers: 'Settlers', soldiers: 'Soldiers', knights: 'Knights', caravan: 'Caravan', road: 'Road', church: 'Church', cathedral: 'Cathedral',
  city: 'City', peace: 'King’s Peace', tradetrack: 'Trade Track', march: 'Movement', rival: 'A rival',
};

// An icon inside a page: a reference into the shared sprite.
export function svgString(name) {
  installSprite();
  return svgUse(name);
}

// A self-contained SVG, for drawing onto a canvas.
export { svgStandalone };

export function icon(name, cls = '') {
  installSprite();
  return h('span', { class: 'ico ' + cls, title: TITLES[name] || name, html: svgUse(name) });
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
