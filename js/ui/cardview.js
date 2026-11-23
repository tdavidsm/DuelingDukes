// Card and house faces, in a Terraforming Mars style dressed for the Middle
// Ages: cost coin, title ribbon, framed art, effects drawn as icons where
// they can be, and rules text where they cannot.

import { h, icon, rich } from './dom.js';
import { CARD_BY_ID } from '../engine/cards.js';
import { HOUSE_BY_ID, TAG_NAME, TOKENS, TRACKS, UNITS, RES_NAME, TAG_PAY } from '../engine/data.js';
import { describeCard, describeHouse, fxText, fxpLines, actionText } from '../engine/describe.js';

export const TYPE_LABEL = { project: 'Commission', active: 'Charter', event: 'Event' };

// ------------------------------------------------------------------- art
// art/cards/index.json lists the cards that have art, so no missing image is ever requested.
// It is either a list of ids (each with an .webp file) or a map of id to file name.
let ART = new Map();
let ART_BASE = '';
export async function loadArt(base = '') {
  ART_BASE = base;
  const [list, layouts] = await Promise.all([
    fetch(base + 'art/cards/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    fetch(base + 'art/cards/layouts.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);
  if (list) ART = new Map(Array.isArray(list) ? list.map((id) => [id, id + '.webp']) : Object.entries(list));
  LAYOUTS = new Map(Object.entries((layouts && layouts.cards) || {}));
  return ART;
}
export const hasArt = (id) => ART.has(id);

// ---------------------------------------------------------------- layouts
// art/cards/layouts.json holds hand-tuned adjustments for particular cards,
// made with tools/card-layout.html. Everything is optional, in em (so it
// scales with the card) or as a multiplier, and a card with no entry is drawn
// exactly as the automatic layout draws it:
//   art:    { h: picture height, x, y: focal point in %, zoom }
//   title:  { size, x, y }
//   body:   { size, padX: side padding, gap: space between parts }
//   icons | explain | words | actions | flavor: { size, width: % of the panel, y: extra space above, hide }
//   badges: { cost | tags | req | fp | tokens: [x, y] }   moved by this much
let LAYOUTS = new Map();
export const savedLayouts = () => LAYOUTS;
export const LAYOUT_PARTS = { icons: '.cf-icons', explain: '.cf-explain', words: '.cf-words', actions: '.cf-actions', flavor: '.cf-flavor' };
export const LAYOUT_BADGES = { cost: '.cf-cost', tags: '.cf-tags', req: '.cf-req', fp: '.cf-fp', tokens: '.cf-tokens' };
const TITLE_SIZE = { '': 1.02, ' cf-long': 0.9, ' cf-long2': 0.8, ' cf-long3': 0.72 };

const fin = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);

export function applyLayout(el, L, name) {
  if (!L || typeof L !== 'object') return el;
  const q = (s) => el.querySelector(s);
  const art = q('.cf-art');
  const img = q('.cf-art img');
  const body = q('.cf-body');
  if (L.art && art) {
    const ah = fin(L.art.h, 2, 18);
    if (ah !== null) {
      Object.assign(art.style, { flex: `0 0 ${ah}em`, minHeight: '0' });
      if (body) body.style.flex = '1 1 auto';
    }
    const x = fin(L.art.x, 0, 100) ?? 50;
    const y = fin(L.art.y, 0, 100) ?? 50;
    const zoom = fin(L.art.zoom, 1, 4) ?? 1;
    if (img) {
      img.style.objectPosition = `${x}% ${y}%`;
      if (zoom !== 1) Object.assign(img.style, { transform: `scale(${zoom})`, transformOrigin: `${x}% ${y}%` });
    }
  }
  const title = q('.cf-title');
  if (L.title && title) {
    const size = fin(L.title.size, 0.4, 2);
    if (size !== null) title.style.fontSize = `${((TITLE_SIZE[titleClass(name || '')] || 1.02) * size).toFixed(3)}em`;
    const tx = fin(L.title.x, -10, 10) ?? 0;
    const ty = fin(L.title.y, -5, 5) ?? 0;
    if (tx || ty) title.style.translate = `${tx}em ${ty}em`;
  }
  if (L.body && body) {
    const size = fin(L.body.size, 0.4, 2);
    if (size !== null) body.style.zoom = size;
    const pad = fin(L.body.padX, 0, 5);
    if (pad !== null) Object.assign(body.style, { paddingLeft: pad + 'em', paddingRight: pad + 'em' });
    const gap = fin(L.body.gap, 0, 3);
    if (gap !== null) body.style.gap = gap + 'em';
  }
  for (const [part, sel] of Object.entries(LAYOUT_PARTS)) {
    const P = L[part];
    if (!P || !body) continue;
    for (const node of body.querySelectorAll(':scope > ' + sel)) {
      if (P.hide) { node.style.display = 'none'; continue; }
      const size = fin(P.size, 0.4, 2.5);
      if (size !== null) node.style.zoom = size;
      const w = fin(P.width, 20, 100);
      if (w !== null && w < 100) Object.assign(node.style, { maxWidth: w + '%', alignSelf: 'center', width: '100%' });
      const dy = fin(P.y, -6, 6);
      if (dy) node.style.marginTop = dy + 'em';
    }
  }
  for (const [badge, sel] of Object.entries(LAYOUT_BADGES)) {
    const B = L.badges && L.badges[badge];
    const node = q(':scope > ' + sel);
    if (!Array.isArray(B) || !node) continue;
    const bx = fin(B[0], -20, 20) ?? 0;
    const by = fin(B[1], -30, 30) ?? 0;
    if (bx || by) node.style.translate = `${bx}em ${by}em`;
  }
  el.classList.add('cf-tuned');
  return el;
}

function artEl(id, fallbackTag, label) {
  if (ART.has(id)) {
    return h('div', { class: 'cf-art' }, h('img', { src: `${ART_BASE}art/cards/${ART.get(id)}`, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' }));
  }
  return h('div', { class: 'cf-art cf-art-empty' }, icon(fallbackTag || 'card', 'cf-art-ghost'), label ? h('span', { class: 'cf-art-label' }, label) : null);
}

// --------------------------------------------------------------- pieces
const sign = (n) => (n > 0 ? '+' + n : '−' + Math.abs(n));
const num = (n, cls = '') => h('span', { class: 'cf-n ' + cls }, String(n));
const ic = (name, title) => {
  const el = icon(name);
  if (title) el.title = title;
  return el;
};
const WHAT_ICON = {
  settlements: 'city', towns: 'city', cities: 'city', roads: 'road', churches: 'church', cathedrals: 'cathedral', military: 'soldiers',
};
const whatIcon = (what) => (what.startsWith('tag:') ? what.slice(4) : WHAT_ICON[what] || 'card');
const tokIcon = (card) => 'tok-' + ((card && card.token) || 'noble');

// One effect as icons, or null when words do it better.
function fxIcons(f, card) {
  const t = fxText(f, card).replace(/\{(\w+)\}/g, (_, r) => RES_NAME[r] || r);
  const g = (cls, ...kids) => h('span', { class: 'cf-fx ' + cls, title: t }, ...kids);
  switch (f[0]) {
    case 'gain': return g('', num(sign(f[2])), ic(f[1]));
    case 'track': return g('cf-track', h('span', { class: 'cf-up' }, '▲'), ic(f[1]), f[2] > 1 ? num('×' + f[2]) : null);
    case 'rf': return g('', num('+' + f[1]), ic('rf'));
    case 'draw': return g('', num('+' + f[1]), ic('card'));
    case 'unit': return g('cf-unit', num('+1'), ic(f[1]));
    case 'roads': return g('', num('+' + f[1]), ic('road'));
    case 'place': return g('', num('+1'), ic(f[1]));
    case 'counter': return g('', num(sign(f[1])), ic(tokIcon(card)));
    case 'steal': return g('', h('span', { class: 'cf-rival' }, num('−' + f[2]), ic(f[1])), h('span', { class: 'cf-arrow' }, '➜'), num('+' + f[2]), ic(f[1]));
    case 'harm': return g('', h('span', { class: 'cf-rival' }, num('−' + f[2]), ic(f[1])));
    case 'harmProd': return g('', h('span', { class: 'cf-rival cf-prod' }, num('−' + f[2]), ic(f[1])));
    case 'gainPer': return g('', num('+' + f[2]), ic(f[1]), h('span', { class: 'cf-per' }, '/'), f[4] > 1 ? num(f[4]) : null, ic(whatIcon(f[3])));
    case 'gainPerToken': return g('', num('+' + f[2]), ic(f[1]), h('span', { class: 'cf-per' }, '/'), ic(tokIcon(card)));
    case 'choose': return g('', num('+' + f[1]), ...f[2].flatMap((r, i) => (i ? [h('span', { class: 'cf-per' }, '/'), ic(r)] : [ic(r)])));
    case 'protect': return g('', ic('peace'));
    case 'advanceTrade': return g('', ic('tradetrack'), num('+' + f[1]));
    case 'resetMove': return g('', ic('march'));
    default: return null;
  }
}

// Production lives in a ledger box, as in the original's brown boxes.
function prodBox(items, card) {
  return h('span', { class: 'cf-prod', title: items.map((f) => fxText(f, card).replace(/\{(\w+)\}/g, (_, r) => RES_NAME[r] || r)).join(', ') },
    ...items.map((f) => (f[0] === 'prod'
      ? h('span', { class: 'cf-fx' }, num(sign(f[2])), ic(f[1]))
      : h('span', { class: 'cf-fx' }, num('+' + f[2]), ic(f[1]), h('span', { class: 'cf-per' }, '/'), f[4] > 1 ? num(f[4]) : null, ic(whatIcon(f[3]))))));
}

// A list of effects becomes one row of icons plus any lines of text left over.
function fxRow(fx, card) {
  const icons = [];
  const words = [];
  let prods = [];
  const flush = () => { if (prods.length) icons.push(prodBox(prods, card)); prods = []; };
  for (const f of fx || []) {
    if (f[0] === 'prod' || f[0] === 'prodPer') { prods.push(f); continue; }
    flush();
    const el = fxIcons(f, card);
    if (el) icons.push(el); else words.push(fxText(f, card));
  }
  flush();
  return { icons, words };
}

// Actions: "cost ➜ effect" when it can be drawn, words when not.
function actionEl(o, card) {
  const cost = [];
  for (const r in o.pay || {}) {
    if (r === 'tokens') cost.push(h('span', { class: 'cf-fx' }, num('−' + o.pay.tokens), ic(tokIcon(card))));
    else cost.push(h('span', { class: 'cf-fx' }, num(o.pay[r]), ic(r)));
  }
  const fx = fxRow(o.fx, card);
  const title = actionText(o, card).replace(/\{(\w+)\}/g, (_, r) => RES_NAME[r] || r);
  if (fx.words.length) return h('div', { class: 'cf-act cf-act-words', title }, rich(actionText(o, card) + '.'));
  const arrow = () => h('span', { class: 'cf-arrow' }, '➜');
  const plus = () => h('span', { class: 'cf-plus' }, '+');
  const row = [];
  let caption = null;
  if (o.each) {
    const e = o.each;
    const chosen = e.fx.find((f) => f[0] === 'chosen');
    const per = fxRow(e.fx.filter((f) => f[0] !== 'chosen'), card);
    if (per.words.length) return h('div', { class: 'cf-act cf-act-words', title }, rich(actionText(o, card) + '.'));
    const pay = Object.keys(e.pay || {}).map((r) => (r === 'tokens'
      ? h('span', { class: 'cf-fx' }, num('1'), ic(tokIcon(card)))
      : h('span', { class: 'cf-fx' }, num(e.pay[r]), ic(r))));
    const gets = chosen ? [h('span', { class: 'cf-fx', title: 'any one resource' }, num('+' + chosen[1]), h('span', { class: 'cf-any' }, 'any'))] : per.icons;
    if (cost.length) row.push(...cost, plus());
    row.push(h('span', { class: 'cf-times' }, e.max === 'tokens' ? 'any ×' : `up to ${e.max} ×`), ...pay, arrow(), ...gets);
    if (fx.icons.length) row.push(plus(), ...fx.icons);
  } else {
    if (cost.length) row.push(...cost, arrow());
    row.push(...fx.icons);
    if (o.token) {
      const t = tokenOp(o.token);
      if (fx.icons.length) row.push(plus());
      row.push(...t.icons);
      caption = t.caption;
    }
    if (!row.length) row.push(h('span', { class: 'cf-muted' }, '—'));
  }
  return h('div', { class: 'cf-act-wrap', title },
    h('div', { class: 'cf-act' }, ...row),
    caption ? h('div', { class: 'cf-small' }, caption) : null);
}

// Moving or adding a counter, drawn: "+1 Noble (on any card)", "Noble ➜ Noble (from any card to another)".
function tokenOp(spec) {
  const T = TOKENS[spec.type];
  const to = ic('tok-' + spec.type);
  const arrow = h('span', { class: 'cf-arrow' }, '➜');
  if (spec.op === 'add') return { icons: [h('span', { class: 'cf-fx' }, num('+1'), to)], caption: `on any card that collects ${T.many}` };
  if (spec.from) {
    return {
      icons: [h('span', { class: 'cf-rival cf-soft' }, ...spec.from.map((t) => ic('tok-' + t))), arrow, to],
      caption: `from any duke’s card onto a card that has ${T.many}`,
    };
  }
  return { icons: [h('span', { class: 'cf-rival cf-soft' }, ic('tok-' + spec.type)), arrow, to], caption: 'from any duke’s card to another' };
}

function reqEl(req) {
  if (!req) return null;
  const parts = [];
  for (const tr of Object.keys(TRACKS)) {
    if (!req[tr]) continue;
    const [lo, hi] = req[tr];
    parts.push(h('span', { class: 'cf-req-part', title: `${TRACKS[tr].name} ${hi >= 99 ? lo + ' or more' : hi + ' or less'}` }, ic(tr), hi >= 99 ? `${lo}+` : `≤${hi}`));
  }
  for (const t in req.tags || {}) parts.push(h('span', { class: 'cf-req-part', title: `${req.tags[t]} ${TAG_NAME[t]} tag${req.tags[t] > 1 ? 's' : ''}` }, String(req.tags[t]), ic(t)));
  for (const k of ['cities', 'settlements', 'towns', 'churches', 'cathedrals', 'military', 'roads']) {
    if (req[k]) parts.push(h('span', { class: 'cf-req-part', title: `${req[k]} ${k}` }, String(req[k]), ic(WHAT_ICON[k])));
  }
  return h('div', { class: 'cf-req', title: 'Requirement' }, ...parts);
}

function fpEl(card) {
  const fp = card.fp;
  if (!fp) return null;
  if (typeof fp === 'number') return h('div', { class: 'cf-fp', title: `${fp} Favor Point${fp > 1 ? 's' : ''} at the end of the game` }, icon('seal', 'cf-seal'), h('b', {}, String(fp)));
  const what = fp.counter ? tokIcon(card) : whatIcon(fp.per);
  const div = fp.counter || fp.div || 1;
  const title = fp.counter
    ? `1 Favor Point per ${div === 1 ? '' : div + ' '}${TOKENS[card.token][div === 1 ? 'one' : 'many']} on this card`
    : `1 Favor Point per ${div === 1 ? '' : div + ' '}${fp.per.startsWith('tag:') ? TAG_NAME[fp.per.slice(4)] + ' tags' : fp.per}`;
  return h('div', { class: 'cf-fp cf-fp-per', title }, h('span', { class: 'cf-fp-rate' }, div === 1 ? 'per' : `per ${div}`, icon(what)), icon('seal', 'cf-seal'), h('b', {}, '1'));
}

function titleClass(name) {
  return name.length > 30 ? ' cf-long3' : name.length > 22 ? ' cf-long2' : name.length > 16 ? ' cf-long' : '';
}

// ------------------------------------------------------------------ cards
export function cardEl(cardId, opts = {}) {
  const card = CARD_BY_ID[cardId];
  const d = describeCard(card);
  const cost = opts.cost !== undefined ? opts.cost : card.cost;
  const main = fxRow(card.fx, card);
  const words = [...main.words, ...fxpLines(card.fxp, card)];
  if (card.tokenMax) words.push(`Holds at most ${card.tokenMax} ${TOKENS[card.token].many}`);
  const acts = !card.act ? [] : Array.isArray(card.act) ? card.act : [card.act];
  const payWith = [...new Set(card.tags.map((t) => TAG_PAY[t] && TAG_PAY[t].res).filter(Boolean))];
  // How much the text panel has to hold, so busy cards can give up some of their art.
  const load = words.length + acts.length * 1.6 + acts.filter((o) => o.token || o.each).length * 0.6 + (card.flavor ? 0.8 : 0) + (main.icons.length ? 0.8 : 0);
  const busy = load >= 5.5 ? ' cf-busy2' : load >= 4 ? ' cf-busy' : '';

  const el = h('div', {
    class: `card cf type-${card.type}${card.fp ? ' has-fp' : ''}${card.token ? ' has-tokens' : ''}${busy}${opts.small ? ' small' : ''}${opts.selected ? ' selected' : ''}${opts.dim ? ' dim' : ''}${opts.onclick ? ' clickable' : ''}`,
    onclick: opts.onclick || null,
    dataset: { card: cardId },
    title: opts.small ? card.name : null,
  },
  h('div', { class: 'cf-frame' },
    h('div', { class: 'cf-ribbon' }, h('span', { class: 'cf-title' + titleClass(card.name) }, card.name)),
    artEl(cardId, card.tags[0], null),
    h('div', { class: 'cf-body' },
      main.icons.length ? h('div', { class: 'cf-icons' }, ...main.icons) : null,
      // When there is room, spell out what the icons mean, as the original's cards do.
      main.icons.length && !acts.length && words.length <= 1
        ? h('p', { class: 'cf-explain' }, rich((card.fx || []).filter((f) => !main.words.includes(fxText(f, card))).map((f) => fxText(f, card)).join('. ') + '.'))
        : null,
      words.map((w) => h('p', { class: 'cf-words' }, rich(w + '.'))),
      acts.length ? h('div', { class: 'cf-actions' },
        h('div', { class: 'cf-act-head' }, acts.length > 1 ? 'Once a year, choose one' : 'Once a year'),
        ...acts.map((o, i) => [i ? h('div', { class: 'cf-or' }, 'or') : null, actionEl(o, card)])) : null,
      card.flavor ? h('p', { class: 'cf-flavor' }, card.flavor) : null),
    h('div', { class: 'cf-type' }, TYPE_LABEL[card.type], payWith.length ? h('span', { class: 'cf-paywith', title: 'Goods that can help pay for this card' }, '· pay with', ...payWith.map((r) => icon(r))) : null)),
  h('div', { class: 'cf-cost' + (cost < card.cost ? ' cheaper' : ''), title: cost < card.cost ? `Costs you ${cost} Gold (printed ${card.cost})` : `Costs ${cost} Gold` }, icon('coin', 'cf-coin'), h('b', {}, String(cost))),
  h('div', { class: 'cf-tags' }, card.tags.map((t) => icon(t, 'cf-tag')), card.type === 'event' ? icon('event', 'cf-tag') : null),
  reqEl(card.req),
  fpEl(card),
  card.token ? h('div', {
    class: 'cf-tokens' + (opts.counters ? ' some' : ''),
    title: opts.counters !== undefined ? `${opts.counters || 0} ${TOKENS[card.token][(opts.counters || 0) === 1 ? 'one' : 'many']} on this card` : `Collects ${TOKENS[card.token].many}`,
  }, icon(tokIcon(card)), opts.counters !== undefined ? h('b', {}, String(opts.counters || 0)) : null) : null,
  opts.footer || null);
  void d;
  return applyLayout(el, opts.layout !== undefined ? opts.layout : LAYOUTS.get(cardId), card.name);
}

export function houseEl(houseId, opts = {}) {
  const house = HOUSE_BY_ID[houseId];
  const d = describeHouse(house);
  const start = fxRow(house.start, null);
  const el = h('div', {
    class: `card cf house${opts.selected ? ' selected' : ''}${opts.onclick ? ' clickable' : ''}`,
    onclick: opts.onclick || null,
    dataset: { house: houseId },
  },
  h('div', { class: 'cf-frame' },
    h('div', { class: 'cf-ribbon' }, h('span', { class: 'cf-title' + titleClass(house.name) }, house.name)),
    artEl(houseId, house.tags[0] || 'rf', null),
    h('div', { class: 'cf-body' },
      h('div', { class: 'cf-icons' }, h('span', { class: 'cf-fx', title: `Start with ${house.gold} Gold` }, num(house.gold), ic('gold')), ...start.icons),
      start.words.map((w) => h('p', { class: 'cf-words' }, rich(w + '.'))),
      fxpLines(house.fxp, null).map((w) => h('p', { class: 'cf-words' }, rich(w + '.'))),
      h('p', { class: 'cf-flavor' }, house.motto)),
    h('div', { class: 'cf-type' }, 'Noble house')),
  h('div', { class: 'cf-tags' }, house.tags.map((t) => icon(t, 'cf-tag'))));
  return applyLayout(el, opts.layout !== undefined ? opts.layout : LAYOUTS.get(houseId), house.name);
}

export { UNITS };
