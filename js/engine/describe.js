// Turns card data into rules text, so the words on a card can never drift
// from what the engine actually does. Resource names are emitted as {tokens}
// that the UI swaps for icons; plain() gives ordinary text.

import * as D from './data.js';

const R = (res) => `{${res}}`;
const signed = (n) => (n > 0 ? '+' + n : '−' + Math.abs(n));

function whatText(what, div) {
  const many = div && div > 1;
  let noun;
  if (what.startsWith('tag:')) noun = many ? `${D.TAG_NAME[what.slice(4)]} tags you have` : `${D.TAG_NAME[what.slice(4)]} tag you have`;
  else noun = {
    settlements: many ? 'towns or cities you own' : 'town or city you own',
    towns: many ? 'towns you own' : 'town you own',
    cities: many ? 'cities you own' : 'city you own',
    roads: many ? 'roads you own' : 'road you own',
    churches: many ? 'churches or cathedrals you own' : 'church or cathedral you own',
    military: many ? 'Soldiers or Knights units you have' : 'Soldiers or Knights unit you have',
  }[what] || what;
  return many ? `${div} ${noun}` : noun;
}

export function fxText(f) {
  switch (f[0]) {
    case 'prod': return `${signed(f[2])} ${R(f[1])} production`;
    case 'gain': return f[2] >= 0 ? `Gain ${f[2]} ${R(f[1])}` : `Spend ${-f[2]} ${R(f[1])}`;
    case 'track': return `Raise ${D.TRACKS[f[1]].name} ${f[2]} rank${f[2] > 1 ? 's' : ''}`;
    case 'rf': return `+${f[1]} Royal Favor`;
    case 'draw': return `Draw ${f[1]} card${f[1] > 1 ? 's' : ''}`;
    case 'unit': return `Place free ${D.UNITS[f[1]].name} at one of your settlements`;
    case 'roads': return `Place ${f[1]} free road${f[1] > 1 ? 's' : ''}`;
    case 'steal': return `Take up to ${f[2]} ${R(f[1])} from a rival`;
    case 'harm': return `A rival loses up to ${f[2]} ${R(f[1])}`;
    case 'harmProd': return `A rival loses ${f[2]} ${R(f[1])} production`;
    case 'harmAll': return `Every rival loses up to ${f[2]} ${R(f[1])}`;
    case 'gainPer': return `Gain ${f[2]} ${R(f[1])} per ${whatText(f[3], f[4])}`;
    case 'prodPer': return `+${f[2]} ${R(f[1])} production per ${whatText(f[3], f[4])}`;
    case 'choose': return `Gain ${f[1]} of one kind: ${f[2].map(R).join(' / ')}`;
    case 'counter': return `Add ${f[1]} token${f[1] > 1 ? 's' : ''} to this card`;
    case 'protect': return 'King’s Peace: until the end of next year, rivals cannot raid you or target you with cards';
    case 'advanceTrade': return `Every Trade Track marker climbs ${f[1]} step${f[1] > 1 ? 's' : ''}`;
    case 'resetMove': return 'All your units regain their movement for this year';
    default: return f[0];
  }
}

function costPhrase(pay) {
  const parts = Object.keys(pay || {}).map((r) => `${pay[r]} ${R(r)}`);
  return parts.length ? `Spend ${parts.join(' and ')}` : 'Free';
}

function triggerText(o) {
  let when;
  const who = o.who === 'self' ? 'you' : 'any duke';
  switch (o.when) {
    case 'playTag': when = `Whenever ${who} play${o.who === 'self' ? '' : 's'} a ${D.TAG_NAME[o.tag]} card`; break;
    case 'track': when = `Whenever ${who} raise${o.who === 'self' ? '' : 's'} ${o.track === 'any' ? 'any track' : D.TRACKS[o.track].name}`; break;
    case 'foundTown': when = `Whenever ${who} found${o.who === 'self' ? '' : 's'} a town`; break;
    case 'trade': when = `Whenever ${who} trade${o.who === 'self' ? '' : 's'}`; break;
    case 'road': when = `Whenever ${who} build${o.who === 'self' ? '' : 's'} a road`; break;
    case 'yearEnd': when = 'At the end of each year'; break;
    default: when = o.when;
  }
  return `${when}: ${o.fx.map(fxText).join(', ').replace(/^G/, 'g').replace(/^A/, 'a').replace(/^D/, 'd')}`;
}

export function fxpLines(fxp) {
  const out = [];
  if (!fxp) return out;
  for (const k in fxp.discount || {}) {
    out.push(k === 'all' ? `Cards you play cost ${fxp.discount[k]} {gold} less` : `${D.TAG_NAME[k]} cards cost you ${fxp.discount[k]} {gold} less`);
  }
  for (const k in fxp.value || {}) out.push(`Your ${R(k)} is worth 1 {gold} more when paying for cards`);
  for (const k in fxp.std || {}) {
    const parts = Object.keys(fxp.std[k]).map((r) => `${-fxp.std[k][r]} ${R(r)}`).join(' and ');
    out.push(k === '*' ? `Standard improvements cost you ${parts} less` : `${D.STD[k].name} costs you ${parts} less`);
  }
  if (fxp.tradeDiscount) out.push(`Trading with the capital costs you ${fxp.tradeDiscount} less {rm} or {ore}, or ${3 * fxp.tradeDiscount} less {gold}`);
  const mv = Object.keys(fxp.move || {});
  if (mv.length) out.push(`Your ${mv.map((u) => D.UNITS[u].name).join(', ').replace(/, ([^,]*)$/, ' and $1')} move ${fxp.move[mv[0]]} further each year`);
  if (fxp.str) out.push(`Your Soldiers and Knights fight at +${fxp.str} strength`);
  if (fxp.def) out.push(`Your units defending your own towns and cities get a further +${fxp.def} strength`);
  if (fxp.loot) out.push(`Your raids carry off ${fxp.loot} more`);
  if (fxp.convert) {
    if (fxp.convert.bonus) out.push(`At year’s end, if you turn any {rm} into {lux}, gain ${fxp.convert.bonus} extra {lux}`);
    if (fxp.convert.keep) out.push(`At year’s end, your first ${fxp.convert.keep} {rm} are not turned into {lux}`);
    if (fxp.convert.cap) out.push(`At year’s end, you may turn up to ${fxp.convert.cap} more {rm} into {lux}`);
  }
  if (fxp.luxCost) out.push(`Supplying Royal Luxuries costs you ${-fxp.luxCost} less {lux}`);
  if (fxp.cardBuy) out.push(`Cards cost you ${-fxp.cardBuy} {gold} less to buy`);
  if (fxp.raidImmune) out.push('Your towns and cities cannot be raided');
  if (fxp.peace) out.push('Rivals cannot raid you or target you with cards');
  for (const o of fxp.on || []) out.push(triggerText(o));
  return out;
}

export function reqText(req) {
  if (!req) return null;
  const parts = [];
  for (const tr of D.TRACK_IDS) {
    if (!req[tr]) continue;
    const [lo, hi] = req[tr];
    parts.push(hi >= 99 ? `${D.TRACKS[tr].name} ${lo}+` : `${D.TRACKS[tr].name} ${hi} or less`);
  }
  for (const t in req.tags || {}) parts.push(`${req.tags[t]} ${D.TAG_NAME[t]} tag${req.tags[t] > 1 ? 's' : ''}`);
  const names = {
    cities: ['city', 'cities'], settlements: ['town or city', 'towns or cities'], churches: ['church', 'churches'],
    cathedrals: ['cathedral', 'cathedrals'], military: ['Soldiers or Knights unit', 'Soldiers or Knights units'],
    roads: ['road', 'roads'], towns: ['town', 'towns'],
  };
  for (const k in names) if (req[k]) parts.push(`${req[k]} ${names[k][req[k] > 1 ? 1 : 0]}`);
  return parts.join(', ');
}

export function fpText(fp) {
  if (!fp) return null;
  if (typeof fp === 'number') return String(fp);
  if (fp.counter) return fp.counter === 1 ? '1 per token' : `1 per ${fp.counter} tokens`;
  if (fp.per) return `1 per ${whatText(fp.per, fp.div)}`;
  return null;
}

export function describeCard(card) {
  return {
    req: reqText(card.req),
    lines: (card.fx || []).map(fxText).concat(fxpLines(card.fxp)),
    action: card.act ? `${costPhrase(card.act.pay)}: ${card.act.fx.map(fxText).join(', ')}` : null,
    fp: fpText(card.fp),
  };
}

export function describeHouse(house) {
  const lines = [`Start with ${house.gold} {gold}`];
  for (const f of house.start) lines.push(fxText(f).replace('Place free', 'Start with').replace(' at one of your settlements', ' at your capital'));
  return { lines: lines.concat(fxpLines(house.fxp)) };
}

export function plain(text) {
  return text.replace(/\{(\w+)\}/g, (_, r) => D.RES_NAME[r] || r);
}
