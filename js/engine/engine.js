// Dueling Dukes rules engine. Pure functions over a JSON-serialisable state;
// no DOM, no network. The host runs this authoritatively, clients use the
// same code to work out which moves are legal and to light up the board.

import { nextRand, shuffleWith } from './rng.js';
import { genMap, radiusFor } from './map.js';
import * as D from './data.js';
import { CARDS, CARD_BY_ID } from './cards.js';

export function mapOf(state) {
  return genMap(state.seed, state.opts.radius, state.opts.style);
}

// ------------------------------------------------------------------ setup

export function createGame({ players, seed, style = 'random' }) {
  const state = {
    v: 1,
    seed: seed | 0,
    rng: (seed ^ 0x5bd1e995) | 0,
    opts: { radius: radiusFor(players.length), style },
    phase: 'capitalVote',
    year: 0,
    order: [],
    first: 0,
    turn: null,
    players: {},
    deck: [],
    discard: [],
    tracks: { power: 0, faith: 0, wealth: 0 },
    capital: null,
    candIdx: 0,
    votes: {},
    settlements: {},
    roads: {},
    units: [],
    nextUnit: 1,
    bounties: {},
    trade: {},
    titles: [],
    honors: [],
    pending: [],
    log: [],
    placeIdx: 0,
    result: null,
    seq: 0,
  };
  const map = mapOf(state);
  for (const h of map.hexes) if (h.bounty) state.bounties[h.id] = { ...h.bounty };
  for (const m of D.TRADE_MARKERS) state.trade[m] = { pos: D.TRADE_START, traded: false, posts: [] };
  state.deck = shuffleWith(state, CARDS.map((card) => card.id));
  const houses = shuffleWith(state, D.HOUSES.map((h) => h.id));
  state.order = shuffleWith(state, players.map((p) => p.id));
  for (const pl of players) {
    state.players[pl.id] = {
      id: pl.id,
      name: pl.name,
      color: pl.color,
      bot: !!pl.bot,
      rf: D.START_RF,
      res: { gold: 0, stone: 0, ore: 0, food: 0, rm: 0, lux: 0 },
      prod: { gold: 0, stone: 0, ore: 0, food: 0, rm: 0 },
      hand: [],
      tableau: [],
      events: [],
      house: null,
      houseChoices: [houses.pop(), houses.pop()],
      draft: [],
      draftDone: false,
      setupDone: false,
      placed: false,
      passed: false,
      passage: {},
      peaceUntil: 0,
      connections: 0,
      stats: { trades: 0, donated: 0, raids: 0, raised: { power: 0, faith: 0, wealth: 0 } },
    };
  }
  for (const pid of state.order) state.players[pid].draft = drawFromDeck(state, D.START_HAND);
  log(state, 'The dukes gather to choose a site for the kingdom’s capital.');
  return state;
}

function log(state, t, pid = null) {
  state.log.push({ y: state.year, t, p: pid });
  if (state.log.length > 300) state.log.splice(0, state.log.length - 300);
}

function drawFromDeck(state, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    if (!state.deck.length) {
      if (!state.discard.length) break;
      state.deck = shuffleWith(state, state.discard);
      state.discard = [];
    }
    out.push(state.deck.pop());
  }
  return out;
}

// ---------------------------------------------------------------- queries

export function tagCount(state, pid, tag) {
  const p = state.players[pid];
  let n = 0;
  if (p.house && D.HOUSE_BY_ID[p.house].tags.includes(tag)) n++;
  for (const t of p.tableau) if (CARD_BY_ID[t.id].tags.includes(tag)) n++;
  return n;
}

export function settlementsOf(state, pid) {
  const out = [];
  for (const j in state.settlements) if (state.settlements[j].owner === pid) out.push(+j);
  return out;
}

export function count(state, pid, what) {
  const p = state.players[pid];
  if (what.startsWith('tag:')) return tagCount(state, pid, what.slice(4));
  if (what.startsWith('prod:')) return p.prod[what.slice(5)];
  if (what.startsWith('raised:')) return p.stats.raised[what.slice(7)];
  let n = 0;
  switch (what) {
    case 'rf': return p.rf;
    case 'trades': return p.stats.trades;
    case 'roads':
      for (const e in state.roads) if (state.roads[e] === pid) n++;
      return n;
    case 'military':
      return state.units.filter((u) => u.owner === pid && (u.type === 'soldiers' || u.type === 'knights')).length;
    default:
  }
  for (const j in state.settlements) {
    const s = state.settlements[j];
    if (s.owner !== pid) continue;
    if (what === 'settlements') n++;
    else if (what === 'towns' && s.type === 'town') n++;
    else if (what === 'cities' && s.type !== 'town') n++;
    else if (what === 'churches' && s.church > 0) n++;
    else if (what === 'cathedrals' && s.church === 2) n++;
  }
  return n;
}

// Everything a player's house and blue cards change about the rules for them.
export function mods(state, pid) {
  const p = state.players[pid];
  const m = {
    discount: {}, value: {}, std: {}, tradeDiscount: 0, move: {}, str: 0, def: 0, loot: 0,
    convert: { keep: 0, cap: 0, bonus: 0 }, luxCost: 0, cardBuy: 0, raidImmune: false, peace: false, on: [],
  };
  const add = (fxp, cardId) => {
    if (!fxp) return;
    for (const k in fxp.discount || {}) m.discount[k] = (m.discount[k] || 0) + fxp.discount[k];
    for (const k in fxp.value || {}) m.value[k] = (m.value[k] || 0) + fxp.value[k];
    for (const k in fxp.std || {}) {
      m.std[k] = m.std[k] || {};
      for (const r in fxp.std[k]) m.std[k][r] = (m.std[k][r] || 0) + fxp.std[k][r];
    }
    for (const k in fxp.move || {}) m.move[k] = (m.move[k] || 0) + fxp.move[k];
    for (const k in fxp.convert || {}) m.convert[k] += fxp.convert[k];
    m.tradeDiscount += fxp.tradeDiscount || 0;
    m.str += fxp.str || 0;
    m.def += fxp.def || 0;
    m.loot += fxp.loot || 0;
    m.luxCost += fxp.luxCost || 0;
    m.cardBuy += fxp.cardBuy || 0;
    if (fxp.raidImmune) m.raidImmune = true;
    if (fxp.peace) m.peace = true;
    for (const o of fxp.on || []) m.on.push({ ...o, cardId });
  };
  if (p.house) add(D.HOUSE_BY_ID[p.house].fxp, null);
  for (const t of p.tableau) add(CARD_BY_ID[t.id].fxp, t.id);
  return m;
}

export function isProtected(state, pid) {
  return state.players[pid].peaceUntil >= state.year || mods(state, pid).peace;
}

export function cardBuyCost(state, pid) {
  return Math.max(0, D.CARD_BUY_COST + mods(state, pid).cardBuy);
}

export function luxCost(state, pid) {
  return Math.max(1, D.LUX_PER_WEALTH + mods(state, pid).luxCost);
}

export function cardCost(state, pid, cardId) {
  const card = CARD_BY_ID[cardId];
  const m = mods(state, pid);
  let cost = card.cost - (m.discount.all || 0);
  for (const t of card.tags) cost -= m.discount[t] || 0;
  return Math.max(0, cost);
}

// Which stockpiles may help pay for a card, and at what value.
export function payAlts(state, pid, cardId) {
  const card = CARD_BY_ID[cardId];
  const m = mods(state, pid);
  const alts = [];
  for (const t of card.tags) {
    const tp = D.TAG_PAY[t];
    if (tp && !alts.some((a) => a.res === tp.res)) alts.push({ res: tp.res, value: tp.value + (m.value[tp.res] || 0) });
  }
  return alts;
}

export function autoPay(state, pid, cardId) {
  const p = state.players[pid];
  let left = cardCost(state, pid, cardId);
  const pay = { gold: 0 };
  const alts = payAlts(state, pid, cardId).sort((a, b) => b.value - a.value);
  for (const a of alts) {
    const n = Math.min(p.res[a.res], Math.floor(left / a.value));
    if (n > 0) { pay[a.res] = n; left -= n * a.value; }
  }
  if (left > p.res.gold) {
    // Overpay with spare goods if the purse is short.
    for (const a of alts) {
      while (left > p.res.gold && (pay[a.res] || 0) < p.res[a.res]) {
        pay[a.res] = (pay[a.res] || 0) + 1;
        left -= a.value;
      }
    }
  }
  left = Math.max(0, left);
  if (left > p.res.gold) return null;
  pay.gold = left;
  return pay;
}

export function reqError(state, pid, req) {
  if (!req) return null;
  for (const tr of D.TRACK_IDS) {
    if (!req[tr]) continue;
    const [lo, hi] = req[tr];
    const v = state.tracks[tr];
    if (v < lo) return `Requires ${D.TRACKS[tr].name} ${lo} or higher`;
    if (v > hi) return `Requires ${D.TRACKS[tr].name} ${hi} or lower`;
  }
  for (const t in req.tags || {}) {
    if (tagCount(state, pid, t) < req.tags[t]) return `Requires ${req.tags[t]} ${D.TAG_NAME[t]} tag${req.tags[t] > 1 ? 's' : ''}`;
  }
  const names = { cities: 'cities', settlements: 'towns or cities', churches: 'churches', cathedrals: 'cathedrals', military: 'Soldiers or Knights in play', roads: 'roads', towns: 'towns' };
  for (const k in names) {
    if (req[k] && count(state, pid, k) < req[k]) return `Requires ${req[k]} ${names[k]}`;
  }
  return null;
}

function fxError(state, pid, fx) {
  const p = state.players[pid];
  const spend = {};
  for (const f of fx || []) {
    if (f[0] === 'gain' && f[2] < 0) spend[f[1]] = (spend[f[1]] || 0) - f[2];
    if (f[0] === 'prod' && f[2] < 0) {
      const floor = f[1] === 'gold' ? D.MIN_GOLD_PROD : 0;
      if (p.prod[f[1]] + f[2] < floor) return `Not enough ${D.RES_NAME[f[1]]} production`;
    }
  }
  for (const r in spend) if (p.res[r] < spend[r]) return `Needs ${spend[r]} ${D.RES_NAME[r]}`;
  return null;
}

export function unitsAt(state, j) {
  return state.units.filter((u) => u.at === j);
}

export function unitById(state, id) {
  return state.units.find((u) => u.id === id);
}

export function moveLimit(state, unit) {
  return D.UNITS[unit.type].move + (mods(state, unit.owner).move[unit.type] || 0);
}

export function movesLeft(state, unit) {
  return Math.max(0, moveLimit(state, unit) - unit.moved);
}

function mayStop(state, unit, j) {
  if (j === state.capital) return true;
  if (state.units.some((u) => u.at === j)) return false;
  const s = state.settlements[j];
  if (s && s.owner !== unit.owner) {
    if (s.type === 'capital') return unit.type === 'caravan';
    return unit.type !== 'settlers';
  }
  return true;
}

function mayPass(state, unit, j) {
  if (j === state.capital) return true;
  for (const u of state.units) {
    if (u.at === j && u.owner !== unit.owner && !state.players[u.owner].passage[unit.owner]) return false;
  }
  return true;
}

// Where can this unit get to this year? Returns Map(junction -> {cost, prev}).
// Road edges are free; every other edge costs one point of movement.
export function reach(state, unit) {
  const map = mapOf(state);
  if (unit.done) return new Map();
  const budget = movesLeft(state, unit);
  const best = new Map([[unit.at, { cost: 0, prev: null }]]);
  const queue = [unit.at];
  while (queue.length) {
    // tiny graphs: a simple relaxation loop is plenty
    const cur = queue.shift();
    const base = best.get(cur).cost;
    const J = map.junctions[cur];
    for (let i = 0; i < J.adj.length; i++) {
      const nb = J.adj[i];
      const e = map.edges[map.edgeOf(cur, nb)];
      if (!e.passable) continue;
      const cost = base + (state.roads[e.id] !== undefined ? 0 : 1);
      if (cost > budget) continue;
      const prevBest = best.get(nb);
      if (prevBest && prevBest.cost <= cost) continue;
      best.set(nb, { cost, prev: cur });
      if (mayPass(state, unit, nb)) queue.push(nb);
    }
  }
  const out = new Map();
  for (const [j, info] of best) {
    if (j !== unit.at && mayStop(state, unit, j)) out.set(j, info);
  }
  return out;
}

export function roadSpots(state, pid) {
  const map = mapOf(state);
  const out = [];
  for (const e of map.edges) {
    if (!e.passable || state.roads[e.id] !== undefined) continue;
    let ok = false;
    for (const j of [e.a, e.b]) {
      const s = state.settlements[j];
      if (s && s.owner === pid) ok = true;
      for (const e2 of map.junctions[j].edges) if (state.roads[e2] === pid) ok = true;
    }
    if (ok) out.push(e.id);
  }
  return out;
}

// Your settlements where a new unit can appear. A foreign Caravan standing
// there is sent home to make room; foreign soldiers block recruitment.
export function recruitSpots(state, pid) {
  const out = [];
  for (const j of settlementsOf(state, pid)) {
    const here = unitsAt(state, j);
    if (!here.length || here.every((u) => u.owner !== pid && D.UNITS[u.type].str === 0)) out.push(j);
  }
  return out;
}

export function townSiteError(state, j) {
  const map = mapOf(state);
  const J = map.junctions[j];
  if (!J || !J.land) return 'Not on land';
  if (j === state.capital || state.settlements[j]) return 'Already settled';
  for (const nb of J.adj) {
    if (nb === state.capital || state.settlements[nb]) return 'Too close to another settlement';
  }
  return null;
}

export function capitalSiteError(state, j) {
  const err = townSiteError(state, j);
  if (err) return err;
  const map = mapOf(state);
  // Duchy capitals keep a respectful distance: at least 3 edges from any other seat of power.
  const seen = new Set([j]);
  let frontier = [j];
  for (let d = 1; d <= 2; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const nb of map.junctions[cur].adj) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        next.push(nb);
        if (nb === state.capital || state.settlements[nb]) return 'Too close to another capital';
      }
    }
    frontier = next;
  }
  return null;
}

export function bonusOptions(state, j) {
  const y = mapOf(state).junctions[j].yields;
  const opts = D.PROD_RES.filter((r) => y[r]);
  return opts.length ? opts : ['gold'];
}

export function stdCost(state, pid, kind) {
  const m = mods(state, pid);
  const cost = { ...D.STD[kind].cost };
  for (const key of ['*', kind]) {
    const d = m.std[key];
    if (!d) continue;
    for (const r in d) if (cost[r] !== undefined) cost[r] = Math.max(0, cost[r] + d[r]);
  }
  return cost;
}

// How a standard improvement would actually be paid: goods first, then Gold
// (including 3 Gold for each missing Stone / Ore / Food). Null if unaffordable.
export function stdPayment(state, pid, kind) {
  const p = state.players[pid];
  const cost = stdCost(state, pid, kind);
  const pay = {};
  let gold = cost.gold || 0;
  for (const r of ['stone', 'ore', 'food']) {
    const need = cost[r] || 0;
    const have = Math.min(need, p.res[r]);
    if (have) pay[r] = have;
    gold += (need - have) * D.SUBSTITUTE_COST;
  }
  if (gold > p.res.gold) return null;
  pay.gold = gold;
  return pay;
}

export function tradeCost(state, pid) {
  const d = mods(state, pid).tradeDiscount;
  return {
    rm: Math.max(1, D.TRADE_COST.rm - d),
    ore: Math.max(1, D.TRADE_COST.ore - d),
    gold: Math.max(3, D.TRADE_COST.gold - 3 * d),
  };
}

export function strength(state, unit, defending) {
  const m = mods(state, unit.owner);
  let s = D.UNITS[unit.type].str;
  if (s > 0) s += m.str;
  if (defending) {
    const st = state.settlements[unit.at];
    if (st && st.owner === unit.owner) s += 1 + m.def;
  }
  return s;
}

export function attackTargets(state, unit) {
  if (D.UNITS[unit.type].str === 0 || unit.acted || unit.at === state.capital) return [];
  const map = mapOf(state);
  const atk = strength(state, unit, false);
  const out = [];
  for (const nb of map.junctions[unit.at].adj) {
    if (nb === state.capital) continue;
    if (!map.edges[map.edgeOf(unit.at, nb)].passable) continue;
    for (const u of state.units) {
      if (u.at === nb && u.owner !== unit.owner && atk >= strength(state, u, true)) out.push(u.id);
    }
  }
  return out;
}

export function raidInfo(state, unit) {
  const s = state.settlements[unit.at];
  if (!s || s.owner === unit.owner || D.UNITS[unit.type].str === 0) return null;
  const map = mapOf(state);
  let points = D.UNITS[unit.type].loot + mods(state, unit.owner).loot;
  if (s.type !== 'town') points--;
  if (map.junctions[unit.at].fortified) points--;
  let error = null;
  if (unit.acted) error = 'This unit has already fought this year';
  else if (s.raided === state.year) error = 'Already raided this year';
  else if (isProtected(state, s.owner)) error = 'Under the King’s protection';
  else if (mods(state, s.owner).raidImmune) error = 'Protected by Town Walls';
  else if (points < 1) error = 'Too well defended for this unit';
  return { victim: s.owner, points: Math.max(0, points), error };
}

function connectionsOf(state, pid) {
  const map = mapOf(state);
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  for (const e in state.roads) {
    if (state.roads[e] !== pid) continue;
    const { a, b } = map.edges[e];
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map();
  for (const j of parent.keys()) {
    if (j === state.capital || state.settlements[j]) {
      const r = find(j);
      groups.set(r, (groups.get(r) || 0) + 1);
    }
  }
  let total = 0;
  for (const k of groups.values()) total += Math.max(0, k - 1);
  return total;
}

function updateConnections(state) {
  for (const pid of state.order) {
    const p = state.players[pid];
    const c = connectionsOf(state, pid);
    if (c > p.connections) {
      p.prod.gold += c - p.connections;
      log(state, `${p.name}'s roads link another settlement: +${c - p.connections} Gold production.`, pid);
    }
    p.connections = Math.max(p.connections, c);
  }
}

export function titleEligible(state, pid, id) {
  const t = D.TITLES.find((x) => x.id === id);
  return !!t && count(state, pid, t.what) >= t.n;
}

export function waitingOn(state) {
  switch (state.phase) {
    case 'capitalVote': return state.order.filter((p) => state.votes[p] === undefined);
    case 'setup': return state.order.filter((p) => !state.players[p].setupDone);
    case 'research': return state.order.filter((p) => !state.players[p].draftDone);
    case 'placeCapitals': return state.pending.length ? [state.pending[0].pid] : [state.order[state.placeIdx]];
    case 'action': return state.pending.length ? [state.pending[0].pid] : [state.turn.pid];
    default: return [];
  }
}

export function pendingChoices(state) {
  const pd = state.pending[0];
  if (!pd) return null;
  if (pd.kind === 'road') return { edges: roadSpots(state, pd.pid) };
  if (pd.kind === 'unit') return { junctions: recruitSpots(state, pd.pid) };
  if (pd.kind === 'choose') return { res: pd.options };
  if (pd.kind === 'target') {
    const players = state.order.filter((o) => {
      if (o === pd.pid || isProtected(state, o)) return false;
      const t = state.players[o];
      if (pd.op === 'harmProd') return t.prod[pd.res] > (pd.res === 'gold' ? D.MIN_GOLD_PROD : 0);
      return t.res[pd.res] > 0;
    });
    return { players };
  }
  return {};
}

// --------------------------------------------------------------- effects

function raise(state, pid, track, n) {
  const p = state.players[pid];
  const T = D.TRACKS[track];
  for (let i = 0; i < n; i++) {
    if (state.tracks[track] >= T.max) return;
    state.tracks[track]++;
    p.rf++;
    p.stats.raised[track]++;
    log(state, `${p.name} raises ${T.name} to ${state.tracks[track]} (+1 Royal Favor).`, pid);
    const bonus = T.bonus[state.tracks[track]];
    if (bonus) runFx(state, pid, bonus, {});
    fire(state, { when: 'track', pid, track });
    if (state.tracks[track] === T.max) log(state, `${T.name} has reached its height!`);
  }
}

function fire(state, ev) {
  for (const pid of state.order) {
    for (const o of mods(state, pid).on) {
      if (o.when !== ev.when) continue;
      if (o.who === 'self' && ev.pid !== pid) continue;
      if (o.tag && !(ev.tags || []).includes(o.tag)) continue;
      if (o.track && o.track !== 'any' && o.track !== ev.track) continue;
      runFx(state, pid, o.fx, { cardId: o.cardId });
    }
  }
}

function spawnUnit(state, pid, type, j) {
  for (const u of unitsAt(state, j)) {
    if (u.owner !== pid && j !== state.capital) rout(state, u);
  }
  const unit = { id: state.nextUnit++, owner: pid, type, at: j, moved: 0, acted: false, done: false };
  state.units.push(unit);
  return unit;
}

// A routed Caravan or band of Settlers flees home.
function rout(state, unit) {
  const homes = settlementsOf(state, unit.owner)
    .filter((j) => !state.units.some((u) => u.at === j))
    .sort((a, b) => (state.settlements[b].type === 'capital') - (state.settlements[a].type === 'capital'));
  if (!homes.length) {
    state.units = state.units.filter((u) => u.id !== unit.id);
    return false;
  }
  unit.at = homes[0];
  unit.done = true;
  return true;
}

function runFx(state, pid, fx, ctx) {
  const p = state.players[pid];
  for (const f of fx || []) {
    switch (f[0]) {
      case 'prod': p.prod[f[1]] += f[2]; break;
      case 'gain': p.res[f[1]] = Math.max(0, p.res[f[1]] + f[2]); break;
      case 'track': raise(state, pid, f[1], f[2]); break;
      case 'rf': p.rf += f[1]; break;
      case 'draw': p.hand.push(...drawFromDeck(state, f[1])); break;
      case 'unit': state.pending.push({ pid, kind: 'unit', unit: f[1], label: `Place your free ${D.UNITS[f[1]].name}` }); break;
      case 'roads':
        for (let i = 0; i < f[1]; i++) state.pending.push({ pid, kind: 'road', label: 'Place a free road' });
        break;
      case 'steal': case 'harm': case 'harmProd':
        state.pending.push({ pid, kind: 'target', op: f[0], res: f[1], n: f[2], label: targetLabel(f) });
        break;
      case 'harmAll':
        for (const o of state.order) {
          if (o === pid || isProtected(state, o)) continue;
          const t = state.players[o];
          t.res[f[1]] = Math.max(0, t.res[f[1]] - f[2]);
        }
        break;
      case 'gainPer': p.res[f[1]] += f[2] * Math.floor(count(state, pid, f[3]) / (f[4] || 1)); break;
      case 'prodPer': p.prod[f[1]] += f[2] * Math.floor(count(state, pid, f[3]) / (f[4] || 1)); break;
      case 'choose': state.pending.push({ pid, kind: 'choose', n: f[1], options: f[2], label: `Choose a resource to gain ${f[1]} of` }); break;
      case 'counter': {
        const t = p.tableau.find((x) => x.id === ctx.cardId);
        if (t) t.counters = (t.counters || 0) + f[1];
        break;
      }
      case 'protect': p.peaceUntil = state.year + 1; break;
      case 'advanceTrade':
        for (const m of D.TRADE_MARKERS) state.trade[m].pos = Math.min(D.TRADE_STEPS - 1, state.trade[m].pos + f[1]);
        break;
      case 'resetMove':
        for (const u of state.units) if (u.owner === pid) u.moved = 0;
        break;
      default: throw new Error('Unknown effect ' + f[0]);
    }
  }
}

function targetLabel(f) {
  const r = D.RES_NAME[f[1]];
  if (f[0] === 'steal') return `Choose a rival to take up to ${f[2]} ${r} from`;
  if (f[0] === 'harm') return `Choose a rival to lose up to ${f[2]} ${r}`;
  return `Choose a rival to lose ${f[2]} ${r} production`;
}

function prunePending(state) {
  while (state.pending.length) {
    const pd = state.pending[0];
    const ch = pendingChoices(state);
    const opts = ch.edges || ch.junctions || ch.players || ch.res || [];
    if (!opts.length) {
      state.pending.shift();
      log(state, `${state.players[pd.pid].name} has no way to use an effect (${pd.label.toLowerCase()}).`, pd.pid);
      continue;
    }
    if (pd.kind === 'unit' && opts.length === 1) {
      state.pending.shift();
      spawnUnit(state, pd.pid, pd.unit, opts[0]);
      continue;
    }
    break;
  }
}

function payRes(p, pay) {
  for (const r in pay) p.res[r] -= pay[r];
}

function costText(pay) {
  return Object.keys(pay).filter((r) => pay[r] > 0).map((r) => `${pay[r]} ${D.RES_NAME[r]}`).join(', ') || 'nothing';
}

function placeSettlement(state, pid, j, type) {
  const map = mapOf(state);
  const p = state.players[pid];
  const J = map.junctions[j];
  state.settlements[j] = { owner: pid, type, church: 0, bonus: null, raided: 0 };
  for (const r in J.yields) p.prod[r] += J.yields[r];
  for (const h of J.hexes) {
    const b = state.bounties[h];
    if (!b) continue;
    if (b.res === 'card') p.hand.push(...drawFromDeck(state, b.n));
    else p.res[b.res] += b.n;
    log(state, `${p.name} claims a bounty: ${b.n} ${D.RES_NAME[b.res]}.`, pid);
    delete state.bounties[h];
  }
}

// ---------------------------------------------------------------- actions

const PHASE_OF = {
  voteCapital: 'capitalVote', chooseSetup: 'setup', placeCapital: 'placeCapitals', buyCards: 'research',
};
const FREE = new Set(['resolve', 'endTurn', 'pass']);

const H = {
  setPassage(state, p, a, dry) {
    if (!state.players[a.pid] || a.pid === p.id) return 'Unknown duke';
    if (dry) return null;
    p.passage[a.pid] = !!a.allow;
    log(state, `${p.name} ${a.allow ? 'grants' : 'denies'} ${state.players[a.pid].name} passage through their lines.`, p.id);
    return null;
  },

  voteCapital(state, p, a, dry) {
    if (state.votes[p.id] !== undefined) return 'You have already answered';
    if (dry) return null;
    state.votes[p.id] = !!a.approve;
    if (state.order.some((o) => state.votes[o] === undefined)) return null;
    const cands = mapOf(state).candidates;
    const vetoers = state.order.filter((o) => !state.votes[o]).map((o) => state.players[o].name);
    if (!vetoers.length || state.candIdx >= cands.length - 1) {
      seatCapital(state, cands[state.candIdx]);
    } else {
      log(state, `${vetoers.join(' and ')} vetoed the site. Another is proposed.`);
      state.candIdx++;
      state.votes = {};
      if (state.candIdx >= cands.length - 1) {
        log(state, 'It is the last suitable site, so the capital is founded there.');
        seatCapital(state, cands[state.candIdx]);
      }
    }
    return null;
  },

  chooseSetup(state, p, a, dry) {
    if (p.setupDone) return 'You have already chosen';
    if (!p.houseChoices.includes(a.house)) return 'Choose one of your two houses';
    const keep = a.keep || [];
    if (new Set(keep).size !== keep.length || keep.some((c) => !p.draft.includes(c))) return 'Invalid cards';
    const house = D.HOUSE_BY_ID[a.house];
    const each = Math.max(0, D.CARD_BUY_COST + (house.fxp.cardBuy || 0));
    if (keep.length * each > house.gold) return 'You cannot afford that many cards';
    if (dry) return null;
    p.house = a.house;
    p.res.gold = house.gold - keep.length * each;
    p.hand.push(...keep);
    state.discard.push(...p.draft.filter((c) => !keep.includes(c)));
    p.draft = [];
    p.setupDone = true;
    if (state.order.every((o) => state.players[o].setupDone)) {
      for (const o of state.order) {
        const q = state.players[o];
        log(state, `${q.name} leads ${D.HOUSE_BY_ID[q.house].name}.`, o);
      }
      state.phase = 'placeCapitals';
      state.placeIdx = state.order.length - 1;
      log(state, 'Each duke now founds their duchy’s capital, last in turn order first.');
    }
    return null;
  },

  placeCapital(state, p, a, dry) {
    if (state.order[state.placeIdx] !== p.id || p.placed) return 'It is not your turn to place';
    const err = capitalSiteError(state, a.junction);
    if (err) return err;
    const opts = bonusOptions(state, a.junction);
    const bonus = a.bonus || opts[0];
    if (!opts.includes(bonus)) return 'Choose a production this site already has';
    if (dry) return null;
    placeSettlement(state, p.id, a.junction, 'capital');
    state.settlements[a.junction].bonus = bonus;
    p.prod[bonus] += 2;
    p.placed = true;
    log(state, `${p.name} founds their duchy capital (+2 ${D.RES_NAME[bonus]} production).`, p.id);
    runFx(state, p.id, D.HOUSE_BY_ID[p.house].start, {});
    return null;
  },

  buyCards(state, p, a, dry) {
    if (p.draftDone) return 'You have already chosen';
    const keep = a.keep || [];
    if (new Set(keep).size !== keep.length || keep.some((c) => !p.draft.includes(c))) return 'Invalid cards';
    const cost = keep.length * cardBuyCost(state, p.id);
    if (cost > p.res.gold) return 'Not enough Gold';
    if (dry) return null;
    p.res.gold -= cost;
    p.hand.push(...keep);
    state.discard.push(...p.draft.filter((c) => !keep.includes(c)));
    p.draft = [];
    p.draftDone = true;
    log(state, `${p.name} buys ${keep.length} card${keep.length === 1 ? '' : 's'}.`, p.id);
    if (state.order.every((o) => state.players[o].draftDone)) {
      state.phase = 'action';
      state.turn = { pid: state.order[state.first], n: 0, end: false };
    }
    return null;
  },

  resolve(state, p, a, dry) {
    const pd = state.pending[0];
    if (!pd || pd.pid !== p.id) return 'Nothing to resolve';
    const ch = pendingChoices(state);
    if (a.skip) {
      if (dry) return null;
      state.pending.shift();
      return null;
    }
    if (pd.kind === 'road') {
      if (!ch.edges.includes(a.edge)) return 'A road cannot go there';
      if (dry) return null;
      state.pending.shift();
      state.roads[a.edge] = p.id;
      log(state, `${p.name} lays a free road.`, p.id);
      updateConnections(state);
      fire(state, { when: 'road', pid: p.id });
    } else if (pd.kind === 'unit') {
      if (!ch.junctions.includes(a.junction)) return 'Choose one of your free towns or cities';
      if (dry) return null;
      state.pending.shift();
      spawnUnit(state, p.id, pd.unit, a.junction);
    } else if (pd.kind === 'choose') {
      if (!pd.options.includes(a.res)) return 'Choose one of the offered resources';
      if (dry) return null;
      state.pending.shift();
      p.res[a.res] += pd.n;
      log(state, `${p.name} takes ${pd.n} ${D.RES_NAME[a.res]}.`, p.id);
    } else if (pd.kind === 'target') {
      if (!ch.players.includes(a.target)) return 'Choose a valid rival';
      if (dry) return null;
      state.pending.shift();
      const t = state.players[a.target];
      if (pd.op === 'harmProd') {
        const floor = pd.res === 'gold' ? D.MIN_GOLD_PROD : 0;
        const n = Math.min(pd.n, t.prod[pd.res] - floor);
        t.prod[pd.res] -= n;
        log(state, `${p.name} costs ${t.name} ${n} ${D.RES_NAME[pd.res]} production.`, p.id);
      } else {
        const n = Math.min(pd.n, t.res[pd.res]);
        t.res[pd.res] -= n;
        if (pd.op === 'steal') p.res[pd.res] += n;
        log(state, `${p.name} ${pd.op === 'steal' ? 'takes' : 'destroys'} ${n} ${D.RES_NAME[pd.res]} ${pd.op === 'steal' ? 'from' : 'belonging to'} ${t.name}.`, p.id);
      }
    } else return 'Nothing to resolve';
    return null;
  },

  playCard(state, p, a, dry) {
    const card = CARD_BY_ID[a.card];
    if (!card || !p.hand.includes(a.card)) return 'That card is not in your hand';
    const rq = reqError(state, p.id, card.req) || fxError(state, p.id, card.fx);
    if (rq) return rq;
    const pay = a.pay || autoPay(state, p.id, a.card);
    if (!pay) return 'You cannot afford this card';
    const alts = payAlts(state, p.id, a.card);
    let total = 0;
    for (const r in pay) {
      const n = pay[r];
      if (!Number.isInteger(n) || n < 0) return 'Bad payment';
      if (n > p.res[r]) return `Not enough ${D.RES_NAME[r]}`;
      if (r === 'gold') total += n;
      else {
        const alt = alts.find((x) => x.res === r);
        if (!alt && n > 0) return `${D.RES_NAME[r]} cannot pay for this card`;
        if (alt) total += n * alt.value;
      }
    }
    if (total < cardCost(state, p.id, a.card)) return 'Payment is too low';
    // spending goods on the card must not leave its own costs unpayable
    for (const f of card.fx || []) {
      if (f[0] === 'gain' && f[2] < 0 && p.res[f[1]] - (pay[f[1]] || 0) < -f[2]) return `Needs ${-f[2]} ${D.RES_NAME[f[1]]}`;
    }
    if (dry) return null;
    payRes(p, pay);
    p.hand.splice(p.hand.indexOf(a.card), 1);
    log(state, `${p.name} plays ${card.name} (${costText(pay)}).`, p.id);
    if (card.type === 'event') p.events.push(card.id);
    else p.tableau.push({ id: card.id, counters: 0, used: false });
    runFx(state, p.id, card.fx, { cardId: card.id });
    fire(state, { when: 'playTag', pid: p.id, tags: card.tags });
    return null;
  },

  cardAction(state, p, a, dry) {
    const t = p.tableau.find((x) => x.id === a.card);
    const card = CARD_BY_ID[a.card];
    if (!t || !card.act) return 'No such action';
    if (t.used) return 'Already used this year';
    for (const r in card.act.pay || {}) if (p.res[r] < card.act.pay[r]) return `Needs ${card.act.pay[r]} ${D.RES_NAME[r]}`;
    if (dry) return null;
    payRes(p, card.act.pay || {});
    t.used = true;
    log(state, `${p.name} uses ${card.name}.`, p.id);
    runFx(state, p.id, card.act.fx, { cardId: card.id });
    return null;
  },

  sellCards(state, p, a, dry) {
    const cards = a.cards || [];
    if (!cards.length) return 'Choose cards to sell';
    if (new Set(cards).size !== cards.length || cards.some((c) => !p.hand.includes(c))) return 'Invalid cards';
    if (dry) return null;
    p.hand = p.hand.filter((c) => !cards.includes(c));
    state.discard.push(...cards);
    p.res.gold += cards.length;
    log(state, `${p.name} sells ${cards.length} card${cards.length === 1 ? '' : 's'} for Gold.`, p.id);
    return null;
  },

  sellGoods(state, p, a, dry) {
    if (!D.SELLABLE.includes(a.res)) return 'Choose Stone, Ore, Food, Raw Materials or Luxuries';
    if (!Number.isInteger(a.n) || a.n < 1) return 'Choose how many to sell';
    if (p.res[a.res] < a.n) return `You only have ${p.res[a.res]} ${D.RES_NAME[a.res]}`;
    if (dry) return null;
    p.res[a.res] -= a.n;
    p.res.gold += a.n * D.SELL_PRICE;
    log(state, `${p.name} sells ${a.n} ${D.RES_NAME[a.res]} at market for ${a.n * D.SELL_PRICE} Gold.`, p.id);
    return null;
  },

  std(state, p, a, dry) {
    const kind = a.kind;
    if (!D.STD[kind]) return 'Unknown improvement';
    const map = mapOf(state);
    const pay = stdPayment(state, p.id, kind);
    const unit = a.unit !== undefined ? unitById(state, a.unit) : null;
    const s = a.junction !== undefined ? state.settlements[a.junction] : null;
    let err = null;
    switch (kind) {
      case 'road':
        if (!roadSpots(state, p.id).includes(a.edge)) err = 'A road must touch one of your roads, towns or cities';
        break;
      case 'settlers': case 'caravan': case 'soldiers':
        if (!recruitSpots(state, p.id).includes(a.junction)) err = 'Choose one of your towns or cities with no unit in it';
        break;
      case 'town':
        if (!unit || unit.owner !== p.id || unit.type !== 'settlers') err = 'Choose one of your Settlers';
        else err = townSiteError(state, unit.at);
        break;
      case 'city':
        if (!s || s.owner !== p.id || s.type !== 'town') err = 'Choose one of your towns';
        else if (!bonusOptions(state, a.junction).includes(a.bonus)) err = 'Choose a production the town already has';
        break;
      case 'church':
        if (!s || s.owner !== p.id) err = 'Choose one of your towns or cities';
        else if (s.church) err = 'There is already a church here';
        break;
      case 'cathedral':
        if (!s || s.owner !== p.id || s.type === 'town') err = 'Choose one of your cities';
        else if (s.church !== 1) err = s.church ? 'Already a cathedral' : 'Build a church here first';
        break;
      case 'knights':
        if (!unit || unit.owner !== p.id || unit.type !== 'soldiers') err = 'Choose one of your Soldiers units';
        break;
      case 'tribute':
        if (state.tracks.wealth >= D.TRACKS.wealth.max) err = 'Wealth is already at its height';
        break;
      case 'post': {
        const m = state.trade[a.marker];
        if (!m) err = 'Choose a Trade Track marker';
        else if (m.posts.includes(p.id)) err = 'You already have a post there';
        else if (m.posts.length >= D.MAX_POSTS) err = 'That marker has no room for another post';
        else if (!state.units.some((u) => u.owner === p.id && u.type === 'caravan' && u.at === state.capital)) err = 'Needs your Caravan at the kingdom’s capital';
        break;
      }
      default:
    }
    if (err) return err;
    if (!pay) return 'You cannot afford this';
    if (dry) return null;
    payRes(p, pay);
    const paid = costText(pay);
    switch (kind) {
      case 'road':
        state.roads[a.edge] = p.id;
        log(state, `${p.name} builds a road (${paid}).`, p.id);
        updateConnections(state);
        fire(state, { when: 'road', pid: p.id });
        break;
      case 'settlers': case 'caravan': case 'soldiers':
        spawnUnit(state, p.id, kind, a.junction);
        log(state, `${p.name} recruits ${D.UNITS[kind].name} (${paid}).`, p.id);
        break;
      case 'town': {
        const j = unit.at;
        state.units = state.units.filter((u) => u.id !== unit.id);
        placeSettlement(state, p.id, j, 'town');
        log(state, `${p.name} founds a town (${paid}).`, p.id);
        updateConnections(state);
        fire(state, { when: 'foundTown', pid: p.id });
        break;
      }
      case 'city':
        s.type = 'city';
        s.bonus = a.bonus;
        p.prod[a.bonus] += 2;
        log(state, `${p.name} raises a town into a city (+2 ${D.RES_NAME[a.bonus]} production).`, p.id);
        break;
      case 'church':
        s.church = 1;
        log(state, `${p.name} builds a church (${paid}).`, p.id);
        raise(state, p.id, 'faith', 1);
        break;
      case 'cathedral':
        s.church = 2;
        log(state, `${p.name} completes a cathedral (${paid}).`, p.id);
        raise(state, p.id, 'faith', 1);
        break;
      case 'knights':
        unit.type = 'knights';
        log(state, `${p.name} knights a regiment (${paid}).`, p.id);
        break;
      case 'tribute':
        log(state, `${p.name} pays tribute to the crown (${paid}).`, p.id);
        raise(state, p.id, 'wealth', 1);
        break;
      case 'post':
        state.trade[a.marker].posts.push(p.id);
        log(state, `${p.name} establishes a trading post for ${D.RES_NAME[a.marker]}.`, p.id);
        break;
      default:
    }
    void map;
    return null;
  },

  donate(state, p, a, dry) {
    const unit = unitById(state, a.unit);
    if (!unit || unit.owner !== p.id || D.UNITS[unit.type].str === 0) return 'Choose one of your Soldiers or Knights';
    if (unit.at !== state.capital) return 'The regiment must be at the kingdom’s capital';
    if (state.tracks.power >= D.TRACKS.power.max) return 'Power is already at its height';
    if (dry) return null;
    state.units = state.units.filter((u) => u.id !== unit.id);
    p.stats.donated++;
    log(state, `${p.name} donates ${D.UNITS[unit.type].name} to the royal army.`, p.id);
    if (unit.type === 'knights') p.res.gold += D.KNIGHT_DONATION_GOLD;
    raise(state, p.id, 'power', 1);
    return null;
  },

  supply(state, p, a, dry) {
    const cost = luxCost(state, p.id);
    if (state.tracks.wealth >= D.TRACKS.wealth.max) return 'Wealth is already at its height';
    if (p.res.lux < cost) return `Needs ${cost} Luxuries`;
    if (dry) return null;
    p.res.lux -= cost;
    log(state, `${p.name} supplies ${cost} Luxuries to the royal household.`, p.id);
    raise(state, p.id, 'wealth', 1);
    return null;
  },

  move(state, p, a, dry) {
    const unit = unitById(state, a.unit);
    if (!unit || unit.owner !== p.id) return 'Choose one of your units';
    const info = reach(state, unit).get(a.to);
    if (!info) return 'That unit cannot reach there this year';
    if (dry) return null;
    unit.moved += info.cost;
    unit.at = a.to;
    return null;
  },

  tradeCapital(state, p, a, dry) {
    const unit = unitById(state, a.unit);
    if (!unit || unit.owner !== p.id || unit.type !== 'caravan' || unit.at !== state.capital) return 'Needs your Caravan at the kingdom’s capital';
    if (unit.acted) return 'This Caravan has already traded this year';
    const m = state.trade[a.marker];
    if (!m) return 'Choose a Trade Track marker';
    if (m.traded) return 'Someone has already traded for that this year';
    const cost = tradeCost(state, p.id)[a.pay];
    if (!cost) return 'Pay with Raw Materials, Ore or Gold';
    if (p.res[a.pay] < cost) return `Needs ${cost} ${D.RES_NAME[a.pay]}`;
    if (dry) return null;
    p.res[a.pay] -= cost;
    const n = D.TRADE_TABLE[a.marker][m.pos];
    if (a.marker === 'card') p.hand.push(...drawFromDeck(state, n));
    else p.res[a.marker] += n;
    log(state, `${p.name} trades ${cost} ${D.RES_NAME[a.pay]} at the capital for ${n} ${D.RES_NAME[a.marker]}.`, p.id);
    for (const o of m.posts) {
      const q = state.players[o];
      if (a.marker === 'gold') q.res.gold += 2;
      else if (a.marker === 'card') q.res.gold += 1;
      else q.res[a.marker] += 1;
    }
    m.pos = Math.min(m.posts.length, D.TRADE_STEPS - 1);
    m.traded = true;
    unit.acted = true;
    p.stats.trades++;
    fire(state, { when: 'trade', pid: p.id });
    return null;
  },

  tradeDuke(state, p, a, dry) {
    const unit = unitById(state, a.unit);
    if (!unit || unit.owner !== p.id || unit.type !== 'caravan') return 'Choose one of your Caravans';
    const s = state.settlements[unit.at];
    if (!s || s.type !== 'capital' || s.owner === p.id) return 'The Caravan must be at another duke’s capital';
    const t = state.players[s.owner];
    const n = a.n;
    if (!Number.isInteger(n) || n < 1 || n > D.DUKE_TRADE_MAX) return `Trade 1 to ${D.DUKE_TRADE_MAX} goods`;
    if (!D.RES.includes(a.give) || !D.RES.includes(a.take) || a.give === a.take) return 'Choose two different resources';
    if (p.res[a.give] < 2 * n) return `You need ${2 * n} ${D.RES_NAME[a.give]}`;
    if (t.res[a.take] < n) return `${t.name} does not have ${n} ${D.RES_NAME[a.take]}`;
    if (dry) return null;
    p.res[a.give] -= 2 * n;
    t.res[a.give] += 2 * n;
    t.res[a.take] -= n;
    p.res[a.take] += n;
    state.units = state.units.filter((u) => u.id !== unit.id);
    p.stats.trades++;
    log(state, `${p.name}'s Caravan trades ${2 * n} ${D.RES_NAME[a.give]} to ${t.name} for ${n} ${D.RES_NAME[a.take]}.`, p.id);
    fire(state, { when: 'trade', pid: p.id });
    return null;
  },

  attack(state, p, a, dry) {
    const unit = unitById(state, a.unit);
    const target = unitById(state, a.target);
    if (!unit || unit.owner !== p.id) return 'Choose one of your units';
    if (!target || !attackTargets(state, unit).includes(target.id)) return 'That unit cannot be attacked from here';
    if (dry) return null;
    const t = state.players[target.owner];
    const atk = strength(state, unit, false);
    const def = strength(state, target, true);
    unit.acted = true;
    unit.done = true;
    const un = D.UNITS[unit.type].name;
    const tn = D.UNITS[target.type].name;
    if (D.UNITS[target.type].str === 0) {
      const gold = Math.min(D.PLUNDER_GOLD, t.res.gold);
      t.res.gold -= gold;
      p.res.gold += gold;
      const home = rout(state, target);
      log(state, `${p.name}'s ${un} rout ${t.name}'s ${tn}${home ? ', who flee home' : ''}, and plunder ${gold} Gold.`, p.id);
    } else if (atk > def) {
      state.units = state.units.filter((u) => u.id !== target.id);
      log(state, `${p.name}'s ${un} defeat ${t.name}'s ${tn}.`, p.id);
    } else {
      state.units = state.units.filter((u) => u.id !== target.id && u.id !== unit.id);
      log(state, `${p.name}'s ${un} and ${t.name}'s ${tn} destroy each other.`, p.id);
    }
    return null;
  },

  raid(state, p, a, dry) {
    const unit = unitById(state, a.unit);
    if (!unit || unit.owner !== p.id) return 'Choose one of your units';
    const info = raidInfo(state, unit);
    if (!info) return 'Raids need Soldiers or Knights standing in a rival’s town or city';
    if (info.error) return info.error;
    const loot = a.loot || [];
    if (!loot.length || loot.length > info.points) return `Choose up to ${info.points} goods to carry off`;
    if (loot.some((r) => !D.RES.includes(r))) return 'Bad loot';
    if (dry) return null;
    const t = state.players[info.victim];
    const got = {};
    for (const r of loot) {
      const n = Math.min(r === 'gold' ? 2 : 1, t.res[r]);
      t.res[r] -= n;
      p.res[r] += n;
      if (n) got[r] = (got[r] || 0) + n;
    }
    state.settlements[unit.at].raided = state.year;
    unit.acted = true;
    unit.done = true;
    p.stats.raids++;
    log(state, `${p.name}'s ${D.UNITS[unit.type].name} raid ${t.name}'s ${state.settlements[unit.at].type}, carrying off ${costText(got)}.`, p.id);
    return null;
  },

  claimTitle(state, p, a, dry) {
    const t = D.TITLES.find((x) => x.id === a.id);
    if (!t) return 'Unknown title';
    if (state.titles.some((x) => x.id === a.id)) return 'Already claimed';
    if (state.titles.length >= D.MAX_TITLES) return 'All three titles have been granted';
    if (!titleEligible(state, p.id, a.id)) return 'You do not yet meet the requirement';
    if (p.res.gold < D.TITLE_COST) return `Needs ${D.TITLE_COST} Gold`;
    if (dry) return null;
    p.res.gold -= D.TITLE_COST;
    state.titles.push({ id: a.id, pid: p.id });
    log(state, `${p.name} is named ${t.name}!`, p.id);
    return null;
  },

  fundHonor(state, p, a, dry) {
    const h = D.HONORS.find((x) => x.id === a.id);
    if (!h) return 'Unknown honor';
    if (state.honors.some((x) => x.id === a.id)) return 'Already funded';
    if (state.honors.length >= D.HONOR_COSTS.length) return 'All three honors have been funded';
    const cost = D.HONOR_COSTS[state.honors.length];
    if (p.res.gold < cost) return `Needs ${cost} Gold`;
    if (dry) return null;
    p.res.gold -= cost;
    state.honors.push({ id: a.id, pid: p.id });
    log(state, `${p.name} funds the ${h.name} honor.`, p.id);
    return null;
  },

  endTurn(state, p, a, dry) {
    if (state.turn.n < 1) return 'Take an action first, or pass for the year';
    if (dry) return null;
    state.turn.end = true;
    return null;
  },

  pass(state, p, a, dry) {
    if (state.turn.n > 0) return 'You have already acted this turn: end your turn instead';
    if (dry) return null;
    p.passed = true;
    state.turn.end = true;
    log(state, `${p.name} passes for the year.`, p.id);
    return null;
  },
};

function seatCapital(state, j) {
  state.capital = j;
  state.votes = {};
  state.phase = 'setup';
  log(state, 'The kingdom’s capital is founded. Each duke chooses a house and an opening hand.');
}

function run(state, pid, a, dry) {
  const p = state.players[pid];
  if (!p) return 'Unknown duke';
  if (!a || typeof a.type !== 'string' || !Object.prototype.hasOwnProperty.call(H, a.type)) return 'Unknown action';
  if (state.phase === 'ended') return 'The game is over';
  if (a.type === 'setPassage') return H.setPassage(state, p, a, dry);
  if (a.type === 'resolve') {
    if (state.phase !== 'action' && state.phase !== 'placeCapitals') return 'Nothing to resolve';
  } else {
    const need = PHASE_OF[a.type] || 'action';
    if (state.phase !== need) return 'Not now';
    if (state.pending.length) return 'Finish the current effect first';
    if (need === 'action') {
      if (state.turn.pid !== pid) return 'It is not your turn';
      if (!FREE.has(a.type) && state.turn.n >= 2) return 'You have taken both of your actions';
    }
  }
  const err = H[a.type](state, p, a, dry);
  if (err || dry) return err;
  if (state.phase === 'action' && !FREE.has(a.type) && state.turn) state.turn.n++;
  settle(state);
  return null;
}

function settle(state) {
  prunePending(state);
  if (state.pending.length) return;
  if (state.phase === 'placeCapitals') {
    while (state.placeIdx >= 0 && state.players[state.order[state.placeIdx]].placed) state.placeIdx--;
    if (state.placeIdx < 0) {
      state.year = 1;
      state.phase = 'action';
      state.turn = { pid: state.order[state.first], n: 0, end: false };
      log(state, 'Year 1 begins.');
    }
    return;
  }
  if (state.phase === 'action' && (state.turn.end || state.turn.n >= 2)) nextTurn(state);
}

function nextTurn(state) {
  const n = state.order.length;
  const idx = state.order.indexOf(state.turn.pid);
  for (let i = 1; i <= n; i++) {
    const pid = state.order[(idx + i) % n];
    if (!state.players[pid].passed) {
      state.turn = { pid, n: 0, end: false };
      return;
    }
  }
  endYear(state);
}

function endYear(state) {
  for (const pid of state.order) fire(state, { when: 'yearEnd', pid });
  for (const pid of state.order) {
    const p = state.players[pid];
    const m = mods(state, pid);
    // Unspent Raw Materials are worked into Luxuries: 1 per town, 2 per city.
    const cap = count(state, pid, 'towns') + 2 * count(state, pid, 'cities') + m.convert.cap;
    const n = Math.min(Math.max(0, p.res.rm - m.convert.keep), cap);
    if (n > 0) {
      p.res.rm -= n;
      p.res.lux += n + m.convert.bonus;
    }
    p.res.gold = Math.max(0, p.res.gold + p.rf + p.prod.gold);
    for (const r of ['stone', 'ore', 'food', 'rm']) p.res[r] += p.prod[r];
    p.passed = false;
    p.draftDone = false;
    for (const t of p.tableau) t.used = false;
  }
  for (const mk of D.TRADE_MARKERS) {
    const m = state.trade[mk];
    if (!m.traded) m.pos = Math.min(D.TRADE_STEPS - 1, m.pos + 1);
    m.traded = false;
  }
  for (const u of state.units) { u.moved = 0; u.acted = false; u.done = false; }
  log(state, `Year ${state.year} ends. Workshops turn Raw Materials into Luxuries and the harvest comes in.`);
  if (D.TRACK_IDS.every((t) => state.tracks[t] >= D.TRACKS[t].max)) {
    finish(state);
    return;
  }
  state.year++;
  state.first = (state.first + 1) % state.order.length;
  for (const pid of state.order) state.players[pid].draft = drawFromDeck(state, D.RESEARCH_DRAW);
  state.phase = 'research';
  state.turn = null;
  log(state, `Year ${state.year} begins. ${state.players[state.order[state.first]].name} acts first.`);
}

// ---------------------------------------------------------------- scoring

export function cardFp(state, pid, t) {
  const card = CARD_BY_ID[t.id];
  if (!card.fp) return 0;
  if (typeof card.fp === 'number') return card.fp;
  if (card.fp.counter) return Math.floor((t.counters || 0) / card.fp.counter);
  if (card.fp.per) return Math.floor(count(state, pid, card.fp.per) / (card.fp.div || 1));
  return 0;
}

export function honorStandings(state, id) {
  const h = D.HONORS.find((x) => x.id === id);
  const vals = state.order.map((pid) => ({ pid, v: count(state, pid, h.what) }));
  const sorted = [...new Set(vals.map((x) => x.v))].sort((a, b) => b - a);
  const fp = {};
  const firsts = vals.filter((x) => x.v === sorted[0]);
  for (const x of firsts) fp[x.pid] = D.HONOR_FP[0];
  if (firsts.length === 1 && sorted.length > 1 && state.order.length > 2) {
    for (const x of vals.filter((y) => y.v === sorted[1])) fp[x.pid] = D.HONOR_FP[1];
  }
  return { vals, fp };
}

export function score(state, pid) {
  const p = state.players[pid];
  const out = { rf: p.rf, cards: 0, towns: 0, cities: 0, cathedrals: 0, titles: 0, honors: 0 };
  for (const t of p.tableau) out.cards += cardFp(state, pid, t);
  out.towns = count(state, pid, 'towns') * D.FP_TOWN;
  out.cities = count(state, pid, 'cities') * D.FP_CITY;
  out.cathedrals = count(state, pid, 'cathedrals') * D.FP_CATHEDRAL;
  out.titles = state.titles.filter((t) => t.pid === pid).length * D.TITLE_FP;
  for (const h of state.honors) out.honors += honorStandings(state, h.id).fp[pid] || 0;
  out.total = out.rf + out.cards + out.towns + out.cities + out.cathedrals + out.titles + out.honors;
  return out;
}

function finish(state) {
  state.phase = 'ended';
  state.turn = null;
  const scores = {};
  for (const pid of state.order) scores[pid] = score(state, pid);
  const ranking = [...state.order].sort((a, b) =>
    scores[b].total - scores[a].total || state.players[b].res.gold - state.players[a].res.gold);
  state.result = { scores, ranking };
  log(state, `The kingdom stands at its height. ${state.players[ranking[0]].name} is named King’s Chancellor!`);
}

// ------------------------------------------------------------- interface

export function check(state, pid, action) {
  return run(state, pid, action, true);
}

export function apply(state, pid, action) {
  const err = run(state, pid, action, false);
  if (!err) state.seq++;
  return err;
}

// What one player is allowed to see.
export function viewFor(state, pid) {
  const v = JSON.parse(JSON.stringify(state));
  v.you = pid;
  v.deckCount = v.deck.length;
  v.discardCount = v.discard.length;
  delete v.deck;
  delete v.discard;
  delete v.rng;
  for (const id of v.order) {
    const p = v.players[id];
    p.handCount = p.hand.length;
    if (id === pid) continue;
    p.hand = [];
    p.draft = [];
    p.houseChoices = [];
    if (state.phase === 'setup') p.house = null;
  }
  v.log = v.log.slice(-80);
  if (state.phase !== 'ended') {
    v.scores = {};
    for (const id of v.order) v.scores[id] = state.phase === 'capitalVote' || state.phase === 'setup' ? null : score(state, id);
  }
  return v;
}

export { CARDS, CARD_BY_ID };
