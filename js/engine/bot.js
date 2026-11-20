// A straightforward heuristic opponent. It plays a sensible economic game:
// settles, builds churches, marches regiments to the king, trades when the
// Trade Track is ripe, and takes an easy skirmish or raid when one is on offer.

import * as E from './engine.js';
import * as D from './data.js';
import { CARD_BY_ID } from './cards.js';

const RES_VALUE = { gold: 1, stone: 2, ore: 3, food: 2, rm: 3, lux: 2.5, card: 3.5, people: 5 };
const PROD_VALUE = { gold: 5, stone: 6, ore: 7, food: 6, rm: 7, lux: 6 };
const SITE_WEIGHT = { food: 1.2, stone: 1.2, rm: 1.3, ore: 1.1, gold: 1.0 };

function progress(state) {
  let done = 0;
  let total = 0;
  for (const t of D.TRACK_IDS) { done += state.tracks[t]; total += D.TRACKS[t].max; }
  return done / total;
}

function distFrom(state, sources) {
  const map = E.mapOf(state);
  const dist = new Map();
  let frontier = [];
  for (const s of sources) { dist.set(s, 0); frontier.push(s); }
  while (frontier.length) {
    const next = [];
    for (const cur of frontier) {
      for (const nb of map.junctions[cur].adj) {
        if (dist.has(nb) || !map.junctions[nb].land) continue;
        dist.set(nb, dist.get(cur) + 1);
        next.push(nb);
      }
    }
    frontier = next;
  }
  return dist;
}

function siteScore(state, j) {
  const y = E.mapOf(state).junctions[j].yields;
  let s = 0;
  for (const r in y) s += SITE_WEIGHT[r] * y[r] + 0.4;
  return s;
}

function fxValue(state, pid, fx, late) {
  let v = 0;
  for (const f of fx || []) {
    switch (f[0]) {
      case 'prod': v += f[2] * PROD_VALUE[f[1]] * (1.15 - late); break;
      case 'gain': v += f[2] * RES_VALUE[f[1]]; break;
      case 'track': v += state.tracks[f[1]] < D.TRACKS[f[1]].max ? 12 * Math.min(f[2], D.TRACKS[f[1]].max - state.tracks[f[1]]) : 0; break;
      case 'rf': v += 12 * f[1]; break;
      case 'draw': v += 3 * f[1]; break;
      case 'unit': v += { soldiers: 9, knights: 14, settlers: 10, caravan: 6 }[f[1]]; break;
      case 'roads': v += 3 * f[1]; break;
      case 'steal': v += f[2] * RES_VALUE[f[1]] * 0.9; break;
      case 'harm': v += f[2] * 0.5; break;
      case 'harmProd': v += 4 * f[2]; break;
      case 'harmAll': v += 2; break;
      case 'gainPer': v += f[2] * RES_VALUE[f[1]] * Math.floor(E.count(state, pid, f[3]) / (f[4] || 1)); break;
      case 'prodPer': v += f[2] * PROD_VALUE[f[1]] * (1.15 - late) * Math.floor(E.count(state, pid, f[3]) / (f[4] || 1)); break;
      case 'choose': v += f[1] * 2.3; break;
      case 'chosen': v += f[1] * 2.5; break;
      case 'counter': v += 2 * Math.max(0, f[1]); break;
      case 'gainPerToken': v += 3; break;
      case 'place': v += { church: 14, cathedral: 20, city: 34 }[f[1]]; break;
      case 'protect': v += 3; break;
      case 'advanceTrade': v += 4; break;
      default: v += 1;
    }
  }
  return v;
}

function cardValue(state, pid, cardId) {
  const card = CARD_BY_ID[cardId];
  const late = progress(state);
  let v = fxValue(state, pid, card.fx, late);
  if (card.fxp) v += 10 * (1.1 - late);
  if (card.act) {
    // What one use of the best option is worth, over the years likely left.
    const yearsLeft = Math.max(1, 9 * (1 - late));
    let best = 0;
    for (const o of E.cardActs(card)) {
      let u = fxValue(state, pid, o.fx, late) + (o.token ? 4 : 0);
      if (o.each) {
        const k = o.each.max === 'tokens' ? 2 : Math.min(o.each.max, 3);
        u += k * fxValue(state, pid, o.each.fx, late);
        for (const r in o.each.pay || {}) if (r !== 'tokens') u -= k * o.each.pay[r] * RES_VALUE[r];
      }
      for (const r in o.pay || {}) if (r !== 'tokens') u -= o.pay[r] * RES_VALUE[r];
      best = Math.max(best, u);
    }
    v += Math.max(4, best) * yearsLeft * 0.5;
  }
  if (card.token && card.fp && card.fp.counter) v += (6 / card.fp.counter) * (1.1 - late);
  if (card.fp) v += (typeof card.fp === 'number' ? card.fp : 2) * (3 + 4 * late);
  return v;
}

function tryAct(state, pid, a) {
  return E.check(state, pid, a) === null ? a : null;
}

function resolvePending(state, pid) {
  const pd = state.pending[0];
  const ch = E.pendingChoices(state);
  if (pd.kind === 'road') {
    const want = roadGoal(state, pid);
    return { type: 'resolve', edge: want !== null && ch.edges.includes(want) ? want : ch.edges[0] };
  }
  if (pd.kind === 'unit') return { type: 'resolve', junction: ch.junctions[0] };
  if (pd.kind === 'place') {
    let best = ch.junctions[0];
    if (pd.what === 'city') best = [...ch.junctions].sort((x, y) => siteScore(state, y) - siteScore(state, x))[0];
    const bonus = pd.what === 'city' ? E.bonusOptions(state, best).sort((x, y) => PROD_VALUE[y] - PROD_VALUE[x])[0] : undefined;
    return { type: 'resolve', junction: best, bonus };
  }
  if (pd.kind === 'choose') {
    const best = [...ch.res].sort((a, b) => RES_VALUE[b] - RES_VALUE[a])[0];
    return { type: 'resolve', res: best };
  }
  if (pd.kind === 'discard') {
    const worst = [...ch.cards].sort((x, y) => cardValue(state, pid, x) - cardValue(state, pid, y))[0];
    return { type: 'resolve', card: worst };
  }
  if (pd.kind === 'target') {
    const best = [...ch.players].sort((a, b) => state.players[b].rf - state.players[a].rf)[0];
    return { type: 'resolve', target: best };
  }
  return { type: 'resolve', skip: true };
}

// The next missing road on the shortest way from this duke's lands to the kingdom's capital.
function roadGoal(state, pid) {
  const map = E.mapOf(state);
  const mine = E.settlementsOf(state, pid);
  if (!mine.length || state.capital === null) return null;
  const dist = distFrom(state, [state.capital]);
  const spots = E.roadSpots(state, pid);
  let best = null;
  let bestD = Infinity;
  for (const e of spots) {
    const ed = map.edges[e];
    const d = Math.min(dist.get(ed.a) ?? 99, dist.get(ed.b) ?? 99) + Math.max(dist.get(ed.a) ?? 99, dist.get(ed.b) ?? 99) * 0.01;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function bestTownSite(state, pid, from) {
  const map = E.mapOf(state);
  const dist = distFrom(state, [from]);
  let best = null;
  let bestS = -Infinity;
  for (const J of map.junctions) {
    if (!dist.has(J.id) || E.townSiteError(state, J.id)) continue;
    const s = siteScore(state, J.id) - 0.55 * dist.get(J.id);
    if (s > bestS) { bestS = s; best = J.id; }
  }
  return best;
}

function stepToward(state, unit, goal) {
  const r = E.reach(state, unit);
  if (!r.size) return null;
  if (r.has(goal)) return goal;
  const dist = distFrom(state, [goal]);
  const cur = dist.get(unit.at) ?? 99;
  let best = null;
  let bestD = cur;
  for (const j of r.keys()) {
    const d = dist.get(j) ?? 99;
    if (d < bestD) { bestD = d; best = j; }
  }
  return best;
}

// Builds a sensible, legal use of a card's once-a-year action, or null.
function cardActionFor(state, pid, t) {
  const card = CARD_BY_ID[t.id];
  const acts = E.cardActs(card);
  if (!acts.length) return null;
  const p = state.players[pid];
  const n0 = t.counters || 0;
  const cashesOut = (o) => (o.pay && o.pay.tokens) || (o.each && o.each.max === 'tokens') || (o.fx || []).some((f) => f[0] === 'gainPerToken');
  // Cash counters in once there are a few; otherwise build them up.
  const order = acts.map((o, i) => i).sort((x, y) => {
    const wantCash = n0 >= 3 || progress(state) > 0.8;
    return (cashesOut(acts[y]) === wantCash) - (cashesOut(acts[x]) === wantCash);
  });
  for (const i of order) {
    const o = acts[i];
    const goldNeed = ((o.pay && o.pay.gold) || 0) + (o.each && o.each.pay && o.each.pay.gold ? o.each.pay.gold : 0);
    if (goldNeed && p.res.gold - goldNeed < 8) continue;
    const a = { type: 'cardAction', card: t.id, opt: i };
    if (o.each) {
      a.n = E.eachMax(state, pid, t.id, o);
      if (o.each.pay && o.each.pay.gold) a.n = Math.min(a.n, Math.max(0, p.res.gold - 10));
      if (a.n < 1) continue;
      if (o.each.choose) a.res = [...o.each.choose].sort((x, y) => RES_VALUE[y] - RES_VALUE[x])[0];
    }
    if (o.token) {
      const tt = E.tokenTargets(state, pid, o.token);
      const mine = tt.to.filter((x) => x.pid === pid);
      if (!mine.length) continue;
      a.to = mine[0].card;
      if (o.token.op === 'move') {
        const rivals = tt.from.filter((x) => x.pid !== pid && x.card !== a.to)
          .sort((x, y) => state.players[y.pid].rf - state.players[x.pid].rf || y.n - x.n);
        if (!rivals.length) continue;
        a.from = rivals[0].card;
      }
    }
    if (E.check(state, pid, a) === null) return a;
  }
  return null;
}

function chooseAction(state, pid) {
  const p = state.players[pid];
  const late = progress(state);
  const my = state.units.filter((u) => u.owner === pid);
  const settlements = E.settlementsOf(state, pid);
  let a;

  if ((a = tryAct(state, pid, { type: 'supply' }))) return a;
  for (const u of my) if ((a = tryAct(state, pid, { type: 'donate', unit: u.id }))) return a;
  for (const t of D.TITLES) if ((a = tryAct(state, pid, { type: 'claimTitle', id: t.id }))) return a;

  // Opportunism: easy skirmishes and raids.
  for (const u of my) {
    if (D.UNITS[u.type].str === 0) continue;
    const info = E.raidInfo(state, u);
    // A regiment raids once, then gets on with marching to the king.
    const marching = state.tracks.power < D.TRACKS.power.max && (u.raids || 0) >= 1;
    if (info && !info.error && !marching) {
      const t = state.players[info.victim];
      const loot = [];
      const stock = { ...t.res };
      for (let i = 0; i < info.points; i++) {
        const pick = D.RES.filter((r) => stock[r] > 0).sort((x, y) => RES_VALUE[y] * (y === 'gold' ? 2 : 1) - RES_VALUE[x] * (x === 'gold' ? 2 : 1))[0];
        if (!pick) break;
        loot.push(pick);
        stock[pick] -= pick === 'gold' ? 2 : 1;
      }
      if (loot.length && (a = tryAct(state, pid, { type: 'raid', unit: u.id, loot }))) return a;
    }
    for (const tid of E.attackTargets(state, u)) {
      const t = E.unitById(state, tid);
      if (E.strength(state, u, false) > E.strength(state, t, true) && (state.seq + u.id) % 3 === 0) {
        if ((a = tryAct(state, pid, { type: 'attack', unit: u.id, target: tid }))) return a;
      }
    }
  }

  // Trade with the capital when a marker is ripe.
  const cost = E.tradeCost(state, pid);
  for (const u of my) {
    if (u.type !== 'caravan' || u.at !== state.capital || u.acted) continue;
    let best = null;
    let bestV = 0;
    let bestCard;
    for (const m of D.TRADE_MARKERS) {
      const mk = state.trade[m];
      if (mk.traded) continue;
      let n = D.TRADE_TABLE[m][mk.pos];
      let card;
      if (m === 'people') {
        // Counters go to the card with the most room for them.
        const room = (id) => E.tokenRoom(CARD_BY_ID[id], p.tableau.find((t) => t.id === id));
        card = E.peopleCards(state, pid).sort((x, y) => room(y) - room(x))[0];
        if (!card) continue;
        n = Math.min(n, room(card));
      }
      const v = n * RES_VALUE[m];
      if (v > bestV) { bestV = v; best = m; bestCard = card; }
    }
    if (best) {
      let pay = null;
      if (p.res.rm >= cost.rm && bestV >= 7) pay = 'rm';
      else if (p.res.ore >= cost.ore + 2 && bestV >= 9) pay = 'ore';
      else if (p.res.gold >= cost.gold + 8 && bestV >= cost.gold + 4) pay = 'gold';
      if (pay && (a = tryAct(state, pid, { type: 'tradeCapital', unit: u.id, marker: best, pay, card: bestCard }))) return a;
    }
  }

  if (p.res.gold >= 50 && p.res.lux >= 3 && (a = tryAct(state, pid, { type: 'patronage' }))) return a;

  // Settlers found a town once they stand on a good site.
  for (const u of my) {
    if (u.type !== 'settlers') continue;
    const goal = bestTownSite(state, pid, u.at);
    if (goal === u.at || (E.movesLeft(state, u) === 0 && !E.townSiteError(state, u.at) && siteScore(state, u.at) >= 3.5)) {
      if ((a = tryAct(state, pid, { type: 'std', kind: 'town', unit: u.id }))) return a;
    }
  }

  // Churches and cathedrals.
  if (state.tracks.faith < D.TRACKS.faith.max) {
    for (const j of settlements) {
      if ((a = tryAct(state, pid, { type: 'std', kind: 'church', junction: j }))) return a;
      if (p.res.gold >= 16 && (a = tryAct(state, pid, { type: 'std', kind: 'cathedral', junction: j }))) return a;
    }
  }

  // Best playable card.
  let bestCard = null;
  let bestNet = -1;
  for (const c of p.hand) {
    if (E.check(state, pid, { type: 'playCard', card: c }) !== null) continue;
    const net = cardValue(state, pid, c) - E.cardCost(state, pid, c);
    if (net > bestNet) { bestNet = net; bestCard = c; }
  }
  if (bestCard) return { type: 'playCard', card: bestCard, pay: E.autoPay(state, pid, bestCard) };

  // Card actions.
  for (const t of p.tableau) {
    if (t.used) continue;
    if ((a = cardActionFor(state, pid, t))) return a;
  }

  // March.
  for (const u of my) {
    let goal = null;
    if (u.type === 'settlers') goal = bestTownSite(state, pid, u.at);
    else if (u.type === 'caravan') goal = state.capital;
    else if (state.tracks.power < D.TRACKS.power.max) goal = state.capital;
    if (goal === null || goal === u.at) continue;
    const to = stepToward(state, u, goal);
    if (to !== null && (a = tryAct(state, pid, { type: 'move', unit: u.id, to }))) return a;
  }

  // Recruit.
  const free = E.recruitSpots(state, pid);
  if (free.length) {
    const spot = free[0];
    const hasSettlers = my.some((u) => u.type === 'settlers');
    const wantTowns = Math.min(6, 2 + Math.floor(state.year / 2));
    if (!hasSettlers && settlements.length < wantTowns && late < 0.85 && bestTownSite(state, pid, spot) !== null && p.res.gold >= 10) {
      if ((a = tryAct(state, pid, { type: 'std', kind: 'settlers', junction: spot }))) return a;
    }
    if (!my.some((u) => u.type === 'caravan') && p.res.gold >= 12) {
      if ((a = tryAct(state, pid, { type: 'std', kind: 'caravan', junction: spot }))) return a;
    }
    const military = my.filter((u) => D.UNITS[u.type].str > 0).length;
    if (state.tracks.power < D.TRACKS.power.max && military < 2 && p.res.gold >= 8) {
      if ((a = tryAct(state, pid, { type: 'std', kind: 'soldiers', junction: spot }))) return a;
    }
  }

  // Cities, roads, tribute.
  if (p.res.gold >= 22) {
    for (const j of settlements) {
      if (state.settlements[j].type !== 'town') continue;
      const opts = E.bonusOptions(state, j).sort((x, y) => PROD_VALUE[y] - PROD_VALUE[x]);
      if ((a = tryAct(state, pid, { type: 'std', kind: 'city', junction: j, bonus: opts[0] }))) return a;
    }
  }
  if (p.res.gold >= 16 && E.count(state, pid, 'roads') < 8 && late < 0.8) {
    const e = roadGoal(state, pid);
    if (e !== null && (a = tryAct(state, pid, { type: 'std', kind: 'road', edge: e }))) return a;
  }
  if (p.res.lux >= 3 && p.res.lux < 8 && p.res.gold >= (late > 0.6 ? 18 : 26) && (a = tryAct(state, pid, { type: 'patronage' }))) return a;
  if (p.res.gold >= (late > 0.6 ? 22 : 30) && (a = tryAct(state, pid, { type: 'std', kind: 'tribute' }))) return a;
  // Granaries and stockpiles overflowing: take the surplus to market.
  for (const [r, keep] of [['food', 14], ['stone', 14], ['ore', 12]]) {
    if (p.res[r] >= keep + 8 && (a = tryAct(state, pid, { type: 'sellGoods', res: r, n: p.res[r] - keep }))) return a;
  }
  if (p.res.gold >= 45 && state.honors.length < D.HONOR_COSTS.length) {
    for (const h of D.HONORS) {
      const st = E.honorStandings(state, h.id);
      if (st.fp[pid] === D.HONOR_FP[0] && (a = tryAct(state, pid, { type: 'fundHonor', id: h.id }))) return a;
    }
  }
  return null;
}

export function botAction(state, pid) {
  const p = state.players[pid];
  switch (state.phase) {
    case 'capitalVote':
      return { type: 'voteCapital', approve: true };
    case 'setup': {
      const house = p.houseChoices[0];
      const H = D.HOUSE_BY_ID[house];
      const ranked = p.draft
        .map((c) => ({ c, net: cardValue(state, pid, c) - CARD_BY_ID[c].cost }))
        .filter((x) => x.net >= 2 && !CARD_BY_ID[x.c].req)
        .sort((x, y) => y.net - x.net)
        .slice(0, 4)
        .map((x) => x.c);
      void H;
      return { type: 'chooseSetup', house, keep: ranked };
    }
    case 'placeCapitals': {
      if (state.pending.length) return resolvePending(state, pid);
      const map = E.mapOf(state);
      const dist = distFrom(state, [state.capital]);
      let best = null;
      let bestS = -Infinity;
      for (const J of map.junctions) {
        if (E.capitalSiteError(state, J.id)) continue;
        const s = siteScore(state, J.id) - 0.25 * (dist.get(J.id) ?? 20);
        if (s > bestS) { bestS = s; best = J.id; }
      }
      const opts = E.bonusOptions(state, best).sort((x, y) => PROD_VALUE[y] - PROD_VALUE[x]);
      return { type: 'placeCapital', junction: best, bonus: opts[0] };
    }
    case 'research': {
      const each = E.cardBuyCost(state, pid);
      const max = Math.min(p.res.gold >= 40 ? 3 : 2, Math.floor(Math.max(0, p.res.gold - 8) / Math.max(1, each)));
      const keep = p.draft
        .map((c) => ({ c, net: cardValue(state, pid, c) - CARD_BY_ID[c].cost }))
        .filter((x) => x.net >= 3)
        .sort((x, y) => y.net - x.net)
        .slice(0, Math.max(0, max))
        .map((x) => x.c);
      return { type: 'buyCards', keep };
    }
    case 'action': {
      if (state.pending.length) return resolvePending(state, pid);
      // Computer dukes let everyone's units through, so the roads never jam.
      const closed = state.order.find((o) => o !== pid && !state.players[pid].passage[o]);
      if (closed) return { type: 'setPassage', pid: closed, allow: true };
      const a = chooseAction(state, pid);
      if (a) return a;
      return state.turn.n > 0 ? { type: 'endTurn' } : { type: 'pass' };
    }
    default:
      return null;
  }
}

// A move that is always legal, used if a bot's first choice is somehow refused.
export function fallbackAction(state, pid) {
  if (state.pending.length) return { type: 'resolve', skip: true };
  if (state.phase === 'action') return state.turn.n > 0 ? { type: 'endTurn' } : { type: 'pass' };
  if (state.phase === 'research') return { type: 'buyCards', keep: [] };
  if (state.phase === 'setup') return { type: 'chooseSetup', house: state.players[pid].houseChoices[0], keep: [] };
  return null;
}
