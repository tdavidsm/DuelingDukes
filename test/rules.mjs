// Targeted checks of individual rules.   node test/rules.mjs
import * as E from '../js/engine/engine.js';
import * as D from '../js/engine/data.js';
import { botAction } from '../js/engine/bot.js';

let failures = 0;
let checks = 0;
function ok(cond, msg) {
  checks++;
  if (!cond) { failures++; console.error('FAIL: ' + msg); }
}
function eq(a, b, msg) { ok(a === b, `${msg} (got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)})`); }

// A three-duke game advanced to the first action turn, with no cards in hand to muddy things.
function fresh(seed = 7, n = 3) {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Duke ' + i, color: D.PLAYER_COLORS[i].id }));
  const s = E.createGame({ players, seed, style: 'lake' });
  while (s.phase !== 'action') {
    const pid = E.waitingOn(s)[0];
    const a = botAction(s, pid);
    if (a.type === 'chooseSetup') a.keep = [];
    const err = E.apply(s, pid, a);
    if (err) throw new Error(err);
  }
  for (const pid of s.order) {
    const p = s.players[pid];
    p.res = { gold: 100, stone: 20, ore: 20, food: 20, rm: 20, lux: 20 };
  }
  s.units = [];
  return s;
}
const turn = (s) => s.turn.pid;
// Give a duke a fresh turn, so a test can take more than two actions in a row.
const again = (s, pid) => { s.turn = { pid, n: 0, end: false }; };
const other = (s, k = 1) => s.order[(s.order.indexOf(turn(s)) + k) % s.order.length];
function put(s, owner, type, at) {
  const u = { id: s.nextUnit++, owner, type, at, moved: 0, acted: false, done: false };
  s.units.push(u);
  return u;
}
const capitalOf = (s, pid) => E.settlementsOf(s, pid).find((j) => s.settlements[j].type === 'capital');
// a free land junction away from every settlement, with a free land neighbour
function openGround(s, avoid = []) {
  const map = E.mapOf(s);
  for (const J of map.junctions) {
    if (!J.land || avoid.includes(J.id) || E.townSiteError(s, J.id)) continue;
    if (s.units.some((u) => u.at === J.id)) continue;
    const nb = J.adj.find((x) => map.junctions[x].land && !E.townSiteError(s, x) && !s.units.some((u) => u.at === x) && !avoid.includes(x));
    if (nb !== undefined) return [J.id, nb];
  }
  throw new Error('no open ground');
}

// ---- income, conversion, year end
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  p.res = { gold: 10, stone: 0, ore: 0, food: 0, rm: 5, lux: 0 };
  p.prod = { gold: 3, stone: 1, ore: 0, food: 2, rm: 1, lux: 0 };
  const year = s.year;
  for (let i = 0; i < s.order.length; i++) eq(E.apply(s, turn(s), { type: 'pass' }), null, 'pass');
  eq(s.phase, 'research', 'everyone passing ends the year');
  eq(s.year, year + 1, 'year advances');
  eq(p.res.lux, 2, 'a lone duchy capital (a city) turns 2 Raw Materials into Luxuries');
  eq(p.res.rm, 5 - 2 + 1, 'unconverted Raw Materials stay, production arrives after');
  eq(p.res.gold, 10 + p.rf + 3, 'income is Royal Favor plus Gold production');
  eq(p.res.food, 2, 'food production');
  ok(D.TRADE_MARKERS.every((m) => s.trade[m].pos === D.TRADE_START + 1), 'untraded markers climb one step');
  eq(p.draft.length, D.RESEARCH_DRAW, 'four cards are offered in research');
  eq(s.order[s.first] !== me, true, 'the first player rotates');
}

// ---- trade track
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  const c1 = put(s, me, 'caravan', s.capital);
  ok(E.check(s, me, { type: 'tradeCapital', unit: c1.id, marker: 'food', pay: 'food' }) !== null, 'food cannot pay for a trade');
  s.trade.gold.pos = 4;
  const before = p.res.gold;
  eq(E.apply(s, me, { type: 'tradeCapital', unit: c1.id, marker: 'gold', pay: 'rm' }), null, 'trade for gold');
  eq(p.res.gold, before + D.TRADE_TABLE.gold[4], 'pays the value under the marker');
  eq(p.res.rm, 17, 'costs 3 Raw Materials');
  eq(s.trade.gold.pos, 0, 'marker drops back to its floor');
  ok(E.check(s, me, { type: 'tradeCapital', unit: c1.id, marker: 'stone', pay: 'ore' }) !== null, 'one trade per Caravan per year');
  const c2 = put(s, me, 'caravan', s.capital);
  ok(/already traded/.test(E.check(s, me, { type: 'tradeCapital', unit: c2.id, marker: 'gold', pay: 'ore' })), 'one trade per marker per year');
  eq(E.apply(s, me, { type: 'std', kind: 'post', marker: 'stone' }), null, 'establish a trading post');
  ok(E.check(s, other(s), { type: 'endTurn' }) === null || true, 'noop');
  // next duke trades for stone: post owner earns 1 stone, floor is now step 1
  const you = turn(s);
  const c3 = put(s, you, 'caravan', s.capital);
  const mineBefore = p.res.stone;
  s.trade.stone.pos = 5;
  eq(E.apply(s, you, { type: 'tradeCapital', unit: c3.id, marker: 'stone', pay: 'gold' }), null, 'rival trades where I have a post');
  eq(p.res.stone, mineBefore + 1, 'the post pays its owner');
  eq(s.trade.stone.pos, 1, 'a post raises the floor one step');
  eq(s.players[you].res.gold, 100 - 9, 'a trade can be paid with 9 Gold');
  eq(s.players[you].stats.trades, 1, 'trades are counted');
}

// ---- movement
{
  const s = fresh();
  const map = E.mapOf(s);
  const me = turn(s);
  const foe = other(s);
  const [a, b] = openGround(s);
  const sol = put(s, me, 'soldiers', a);
  const r = E.reach(s, sol);
  eq(D.UNITS.soldiers.move, 2, 'Soldiers move two edges'); ok([...r.values()].every((x) => x.cost <= E.moveLimit(s, sol)), 'no further than their limit');
  ok(r.has(b), 'a neighbouring junction is reachable');
  // knights go further
  const kn = put(s, me, 'knights', b);
  ok(E.reach(s, kn).size >= r.size, 'Knights reach at least as far');
  ok(!E.reach(s, sol).has(b), 'cannot stop on an occupied junction');
  s.units = s.units.filter((u) => u.id !== kn.id);
  // roads are free
  const e = map.edgeOf(a, b);
  s.roads[e] = foe;
  eq(E.reach(s, sol).get(b).cost, 0, 'moving along a road is free, whoever built it');
  delete s.roads[e];
  // blocking and passage
  const blocker = put(s, foe, 'soldiers', b);
  const beyond = map.junctions[b].adj.filter((x) => x !== a && map.junctions[x].land);
  const onlyViaB = beyond.filter((x) => !map.junctions[a].adj.includes(x));
  const blockedReach = E.reach(s, sol);
  const viaB = onlyViaB.filter((x) => { const info = blockedReach.get(x); return info && info.prev === b; });
  eq(viaB.length, 0, 'a rival unit blocks passage through its junction');
  s.players[foe].passage[me] = true;
  const openReach = E.reach(s, sol);
  ok(onlyViaB.some((x) => openReach.has(x)), 'granting passage lets units through');
  ok(!openReach.has(b), 'but still not onto the occupied junction');
  s.units = s.units.filter((u) => u.id !== blocker.id);
  // movement can be split across actions
  eq(E.apply(s, me, { type: 'move', unit: sol.id, to: b }), null, 'move one edge');
  eq(E.movesLeft(s, sol), E.moveLimit(s, sol) - 1, 'one move used');
  ok([...E.reach(s, sol).values()].every((x) => x.cost <= E.moveLimit(s, sol) - 1), 'the rest may be used later');
  // the kingdom's capital holds any number of units; duchy capitals admit only Caravans
  const cj = s.capital;
  put(s, foe, 'soldiers', cj);
  const near = map.junctions[cj].adj.find((x) => map.junctions[x].land);
  const s2 = put(s, me, 'soldiers', near);
  ok(E.reach(s, s2).has(cj), 'units may share the kingdom’s capital');
  const foeCap = capitalOf(s, foe);
  const gate = map.junctions[foeCap].adj.find((x) => map.junctions[x].land && !s.units.some((u) => u.at === x));
  const raider = put(s, me, 'knights', gate);
  const trader = put(s, me, 'caravan', map.junctions[foeCap].adj.find((x) => x !== gate && map.junctions[x].land && !s.units.some((u) => u.at === x)));
  ok(!E.reach(s, raider).has(foeCap), 'Knights cannot enter a rival duchy capital');
  ok(E.reach(s, trader).has(foeCap), 'a Caravan can');
}

// ---- skirmishes
{
  const s = fresh();
  const me = turn(s);
  const foe = other(s);
  const [a, b] = openGround(s);
  const sol = put(s, me, 'soldiers', a);
  const wagon = put(s, foe, 'settlers', b);
  ok(E.attackTargets(s, sol).includes(wagon.id), 'Soldiers can attack neighbouring Settlers');
  const g0 = s.players[me].res.gold;
  eq(E.apply(s, me, { type: 'attack', unit: sol.id, target: wagon.id }), null, 'attack');
  eq(s.players[me].res.gold, g0 + D.PLUNDER_GOLD, 'plunder');
  eq(E.unitById(s, wagon.id).at, capitalOf(s, foe), 'routed Settlers flee to their capital');
  eq(E.reach(s, sol).size, 0, 'a unit that fought cannot move again this year');
  ok(E.check(s, me, { type: 'attack', unit: sol.id, target: wagon.id }) !== null, 'nor fight again');
}
{
  const s = fresh();
  const me = turn(s);
  const foe = other(s);
  const [a, b] = openGround(s);
  const sol = put(s, me, 'soldiers', a);
  const their = put(s, foe, 'soldiers', b);
  eq(E.apply(s, me, { type: 'attack', unit: sol.id, target: their.id }), null, 'soldiers attack soldiers');
  ok(!E.unitById(s, sol.id) && !E.unitById(s, their.id), 'equal strength destroys both');
  const kn = put(s, me, 'knights', a);
  const their2 = put(s, foe, 'soldiers', b);
  eq(E.apply(s, me, { type: 'attack', unit: kn.id, target: their2.id }), null, 'knights attack soldiers');
  ok(E.unitById(s, kn.id) && !E.unitById(s, their2.id), 'Knights beat Soldiers');
  // a soldier cannot attack knights; a garrison in its own town gets +1
  const s3 = fresh(11);
  const m3 = turn(s3);
  const f3 = other(s3);
  const map = E.mapOf(s3);
  const [x, y] = openGround(s3);
  const weak = put(s3, m3, 'soldiers', x);
  const strong = put(s3, f3, 'knights', y);
  eq(E.attackTargets(s3, weak).length, 0, 'cannot attack a stronger unit');
  s3.units = s3.units.filter((u) => u.id !== strong.id);
  s3.settlements[y] = { owner: f3, type: 'town', church: 0, bonus: null, raided: 0 };
  const garrison = put(s3, f3, 'soldiers', y);
  eq(E.strength(s3, garrison, true), 2, 'a garrison in its own town defends at +1');
  eq(E.attackTargets(s3, weak).length, 0, 'so Soldiers cannot dislodge it');
  const kn3 = put(s3, m3, 'knights', map.junctions[y].adj.find((q) => q !== x && map.junctions[q].land && !s3.settlements[q]));
  ok(E.attackTargets(s3, kn3).includes(garrison.id), 'Knights can, at the cost of both');
  // neutral ground
  const s4 = fresh(5);
  const m4 = turn(s4);
  const guard = put(s4, other(s4), 'settlers', s4.capital);
  const nb = E.mapOf(s4).junctions[s4.capital].adj.find((q) => E.mapOf(s4).junctions[q].land);
  const hunter = put(s4, m4, 'knights', nb);
  ok(!E.attackTargets(s4, hunter).includes(guard.id), 'no attacks into the kingdom’s capital');
}

// ---- raids
{
  const s = fresh(21);
  const map = E.mapOf(s);
  const me = turn(s);
  const foe = other(s);
  const site = map.junctions.find((J) => J.land && !J.fortified && !E.townSiteError(s, J.id)).id;
  s.settlements[site] = { owner: foe, type: 'town', church: 0, bonus: null, raided: 0 };
  const sol = put(s, me, 'soldiers', site);
  const info = E.raidInfo(s, sol);
  eq(info.points, 2, 'Soldiers carry off 2 from a town');
  ok(E.check(s, me, { type: 'raid', unit: sol.id, loot: ['ore', 'ore', 'ore'] }) !== null, 'cannot take more than allowed');
  const t = s.players[foe];
  eq(E.apply(s, me, { type: 'raid', unit: sol.id, loot: ['gold', 'ore'] }), null, 'raid');
  eq(t.res.gold, 98, 'a Gold item is 2 Gold');
  eq(t.res.ore, 19, 'one Ore taken');
  eq(s.players[me].res.ore, 21, 'and it goes to the raider');
  const kn = put(s, me, 'knights', site);
  s.units = s.units.filter((u) => u.id !== sol.id);
  ok(/Already raided/.test(E.raidInfo(s, kn).error), 'a settlement is raided at most once a year');
  s.settlements[site].raided = 0;
  s.settlements[site].type = 'city';
  eq(E.raidInfo(s, kn).points, 2, 'Knights take 3, one less from a city');
  s.players[foe].peaceUntil = s.year;
  ok(/protection/.test(E.raidInfo(s, kn).error), 'King’s Peace stops raids');
}

// ---- trade with a duke
{
  const s = fresh();
  const me = turn(s);
  const foe = other(s);
  const car = put(s, me, 'caravan', capitalOf(s, foe));
  const p = s.players[me];
  const t = s.players[foe];
  ok(E.check(s, me, { type: 'tradeDuke', unit: car.id, give: 'food', take: 'ore', n: 6 }) !== null, 'at most five goods');
  eq(E.apply(s, me, { type: 'tradeDuke', unit: car.id, give: 'food', take: 'ore', n: 3 }), null, 'forced 2:1 trade');
  eq(p.res.food, 14, 'gave 6');
  eq(p.res.ore, 23, 'took 3');
  eq(t.res.food, 26, 'they are paid');
  eq(t.res.ore, 17, 'and cannot refuse');
  ok(!E.unitById(s, car.id), 'the Caravan is used up');
}

// ---- standard improvements
{
  const s = fresh();
  const map = E.mapOf(s);
  const me = turn(s);
  const p = s.players[me];
  p.res = { gold: 50, stone: 0, ore: 0, food: 0, rm: 0, lux: 16 };
  const cap = capitalOf(s, me);
  const pay = E.stdPayment(s, me, 'settlers');
  const cost = E.stdCost(s, me, 'settlers');
  eq(pay.gold, cost.gold + cost.food * D.SUBSTITUTE_COST, 'missing Food is bought at 3 Gold each');
  eq(E.apply(s, me, { type: 'std', kind: 'settlers', junction: cap }), null, 'recruit settlers');
  ok(E.check(s, me, { type: 'std', kind: 'caravan', junction: cap }) !== null, 'a settlement holding a unit cannot recruit');
  const rf = p.rf;
  eq(E.apply(s, me, { type: 'supply' }), null, 'supply luxuries');
  eq(p.rf, rf + 1, 'raising Wealth gives Royal Favor');
  eq(s.tracks.wealth, 1, 'Wealth rises');
  eq(turn(s) !== me, true, 'two actions end the turn');
}
{
  // roads link settlements for Gold production; churches raise Faith
  const s = fresh(3);
  const map = E.mapOf(s);
  const me = turn(s);
  const p = s.players[me];
  const cap = capitalOf(s, me);
  const nb = map.junctions[cap].adj.find((x) => map.junctions[x].land);
  const nb2 = map.junctions[nb].adj.find((x) => x !== cap && map.junctions[x].land && !E.townSiteError(s, x));
  const gp = p.prod.gold;
  eq(E.apply(s, me, { type: 'std', kind: 'road', edge: map.edgeOf(cap, nb) }), null, 'first road');
  eq(p.prod.gold, gp, 'a road to nowhere earns nothing');
  ok(E.check(s, me, { type: 'std', kind: 'road', edge: map.edgeOf(cap, nb) }) !== null, 'one road per edge');
  eq(E.apply(s, me, { type: 'std', kind: 'road', edge: map.edgeOf(nb, nb2) }), null, 'second road');
  // found a town at the end of the road
  while (turn(s) !== me) E.apply(s, turn(s), { type: 'pass' });
  const wagon = put(s, me, 'settlers', nb2);
  const before = { ...p.prod };
  eq(E.apply(s, me, { type: 'std', kind: 'town', unit: wagon.id }), null, 'found a town');
  const y = map.junctions[nb2].yields;
  for (const r of ['stone', 'ore', 'food', 'rm']) eq(p.prod[r], before[r] + (y[r] || 0), `town yields ${r}`);
  eq(p.prod.gold, before.gold + (y.gold || 0) + 1, 'the road now links two settlements: +1 Gold production');
  const f = s.tracks.faith;
  eq(E.apply(s, me, { type: 'std', kind: 'church', junction: nb2 }), null, 'build a church');
  eq(s.tracks.faith, f + 1, 'Faith rises');
  while (turn(s) !== me) E.apply(s, turn(s), { type: 'pass' });
  ok(E.check(s, me, { type: 'std', kind: 'cathedral', junction: nb2 }) !== null, 'a cathedral needs a city');
  const opt = E.bonusOptions(s, nb2)[0];
  const pb = p.prod[opt];
  eq(E.apply(s, me, { type: 'std', kind: 'city', junction: nb2, bonus: opt }), null, 'raise a city');
  eq(p.prod[opt], pb + 2, 'the city adds +2 to a production');
  eq(E.apply(s, me, { type: 'std', kind: 'cathedral', junction: nb2 }), null, 'cathedral');
  eq(s.tracks.faith, f + 2, 'Faith rises again');
  eq(E.score(s, me).cathedrals, 1, 'a cathedral is worth a Favor Point');
  ok(E.townSiteError(s, nb) !== null, 'no settlement next to another');
}

// ---- power, titles, honors
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  const kn = put(s, me, 'knights', s.capital);
  put(s, me, 'soldiers', capitalOf(s, me));
  const map = E.mapOf(s);
  const [a] = openGround(s);
  put(s, me, 'soldiers', a);
  ok(E.titleEligible(s, me, 'marshal'), 'three military units earn Lord Marshal');
  eq(E.apply(s, me, { type: 'claimTitle', id: 'marshal' }), null, 'claim title');
  const g = p.res.gold;
  eq(E.apply(s, me, { type: 'donate', unit: kn.id }), null, 'donate knights');
  eq(s.tracks.power, 1, 'Power rises');
  eq(p.res.gold, g + D.KNIGHT_DONATION_GOLD, 'the king rewards Knights');
  const you = turn(s);
  ok(E.check(s, you, { type: 'claimTitle', id: 'marshal' }) !== null, 'a title can be claimed once');
  eq(E.apply(s, you, { type: 'fundHonor', id: 'warlord' }), null, 'fund an honor');
  eq(s.players[you].res.gold, 100 - D.HONOR_COSTS[0], 'first honor costs 8');
  const sc = E.score(s, me);
  eq(sc.titles, D.TITLE_FP, 'title scores');
  eq(sc.honors, D.HONOR_FP[0], 'leading a funded honor scores');
  void map;
}

// ---- cards: tags as payment, requirements, targeted effects
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  p.hand = ['stone_quarry', 'royal_mint', 'border_raid', 'scorched_fields', 'stone_bridge'];
  p.res = { gold: 4, stone: 3, ore: 0, food: 0, rm: 0, lux: 0 };
  const stoneValue = 2 + (E.mods(s, me).value.stone || 0);
  const cost = E.cardCost(s, me, 'stone_quarry');
  const auto = E.autoPay(s, me, 'stone_quarry');
  eq(auto.stone * stoneValue + auto.gold >= cost, true, 'Stone helps pay for Building cards');
  ok(E.check(s, me, { type: 'playCard', card: 'stone_quarry', pay: { gold: 4, ore: 2 } }) !== null, 'Ore cannot pay for a Building card');
  ok(/Wealth/.test(E.check(s, me, { type: 'playCard', card: 'royal_mint' })), 'track requirements are enforced');
  const sp = p.prod.stone;
  eq(E.apply(s, me, { type: 'playCard', card: 'stone_quarry', pay: auto }), null, 'play a project');
  eq(p.prod.stone, sp + 2, 'its production arrives');
  ok(/Soldiers or Knights/.test(E.check(s, me, { type: 'playCard', card: 'border_raid' })), 'unit requirements are enforced');
  p.res.gold = 30;
  eq(E.apply(s, me, { type: 'playCard', card: 'scorched_fields' }), null, 'play an attack card');
  eq(s.pending.length, 1, 'it waits for a target');
  const victim = E.pendingChoices(s).players[0];
  const fp = s.players[victim].prod.food;
  eq(E.apply(s, me, { type: 'resolve', target: victim }), null, 'choose the victim');
  eq(s.players[victim].prod.food, fp - 1, 'their production falls');
  ok(p.events.includes('scorched_fields') && !p.tableau.some((t) => t.id === 'scorched_fields'), 'events do not stay in play');
}

// ---- standing cards: year-end triggers, once-a-year actions, discounts
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  p.tableau.push({ id: 'tapestry_workshop', counters: 0, used: false }, { id: 'prize_herds', counters: 0, used: false }, { id: 'guildhall', counters: 0, used: false });
  const rival = other(s);
  eq(E.cardCost(s, me, 'tavern'), 4, 'Guildhall makes cards 1 cheaper');
  eq(E.apply(s, me, { type: 'cardAction', card: 'prize_herds' }), null, 'use a card action');
  ok(E.check(s, me, { type: 'cardAction', card: 'prize_herds' }) !== null, 'only once a year');
  eq(E.cardFp(s, me, p.tableau[1]), 0, 'one token is not yet a point');
  p.res.rm = 0;
  p.res.lux = 0;
  E.apply(s, me, { type: 'endTurn' });
  while (s.phase === 'action') E.apply(s, turn(s), { type: 'pass' });
  eq(p.res.lux, 2, 'Tapestry Workshop pays out at year’s end');
  eq(s.players[rival].res.lux, 20 + 2, 'and only for its owner (the others just converted 2)');
  ok(!p.tableau[1].used, 'card actions refresh each year');
}

// ---- Culture
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  const rf = p.rf;
  eq(E.apply(s, me, { type: 'patronage' }), null, 'Patronage for the Arts');
  eq(s.tracks.culture, 1, 'Culture rises');
  eq(p.rf, rf + 1, 'and gives Royal Favor');
  eq(p.res.gold, 100 - D.PATRONAGE_COST.gold, 'costs Gold');
  eq(p.res.lux, 20 - D.PATRONAGE_COST.lux, 'and Luxuries');
  p.res.lux = 2;
  ok(/Luxuries/.test(E.check(s, me, { type: 'patronage' })), 'needs the Luxuries');
  const s2 = fresh(9);
  Object.assign(s2.tracks, { power: 10, faith: 15, wealth: 20, culture: 0 });
  while (s2.phase === 'action') E.apply(s2, turn(s2), { type: 'pass' });
  eq(s2.phase, 'ended', 'the game ends with Culture empty: it is optional');
}

// ---- cards that place churches, cathedrals and cities
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  const cap = capitalOf(s, me);
  p.hand = ['church_of_st_joseph_the_loud', 'cathedral_of_st_thomas_the_doubter', 'new_nineveh'];
  const f0 = s.tracks.faith;
  eq(E.apply(s, me, { type: 'playCard', card: 'church_of_st_joseph_the_loud' }), null, 'play a church card');
  eq(s.pending[0] && s.pending[0].kind, 'place', 'it asks where');
  ok(E.pendingChoices(s).junctions.every((j) => s.settlements[j].owner === me), 'only your own settlements');
  eq(E.apply(s, me, { type: 'resolve', junction: cap }), null, 'place it');
  eq(s.settlements[cap].church, 1, 'a church stands there');
  eq(s.tracks.faith, f0 + 1, 'and Faith rises, as for building one');
  const s2 = fresh(13);
  const m2 = turn(s2);
  const p2 = s2.players[m2];
  p2.hand = ['cathedral_of_st_thomas_the_doubter', 'church_of_st_joseph_the_loud'];
  const c2 = capitalOf(s2, m2);
  s2.settlements[c2].church = 1;
  ok(/church/.test(E.check(s2, m2, { type: 'playCard', card: 'church_of_st_joseph_the_loud' })), 'a church card needs a settlement without a church');
  s2.settlements[c2].church = 0;
  const rf = p2.rf;
  eq(E.apply(s2, m2, { type: 'playCard', card: 'cathedral_of_st_thomas_the_doubter' }), null, 'play a cathedral card');
  eq(E.apply(s2, m2, { type: 'resolve', junction: c2 }), null, 'in a city with no church yet');
  eq(s2.settlements[c2].church, 2, 'a cathedral stands there');
  eq(p2.rf, rf + 2 + 1, '+2 Royal Favor, and Faith gives one more');
  // a new city beside water, and the Sanitarium hears of it
  const s3 = fresh(17);
  const m3 = turn(s3);
  const rival = other(s3);
  s3.players[rival].tableau.push({ id: 'sanitarium_of_st_sarah_the_kind', counters: 0, used: false });
  s3.players[m3].hand = ['new_nineveh'];
  const before = E.count(s3, m3, 'cities');
  eq(E.apply(s3, m3, { type: 'playCard', card: 'new_nineveh' }), null, 'play New Nineveh');
  const sites = E.pendingChoices(s3).junctions;
  const map = E.mapOf(s3);
  ok(sites.length > 0 && sites.every((j) => map.junctions[j].hexes.some((h) => map.hexes[h].terrain === 'water') && !E.townSiteError(s3, j)), 'only free sites beside water');
  const site = sites[0];
  const bonus = E.bonusOptions(s3, site)[0];
  eq(E.apply(s3, m3, { type: 'resolve', junction: site, bonus }), null, 'found the city');
  eq(E.count(s3, m3, 'cities'), before + 1, 'a new city');
  eq(s3.settlements[site].bonus, bonus, 'with its +2 production');
  eq(E.findCard(s3, 'sanitarium_of_st_sarah_the_kind').t.counters, 2, 'a rival Sanitarium gains 2 Acolytes from any new city');
  eq(E.score(s3, m3).cards, 1, 'New Nineveh is worth 1 Favor Point');
}

// ---- counters: collecting, trading in, Favor Points
{
  const s = fresh();
  const me = turn(s);
  const you = other(s);
  const p = s.players[me];
  p.tableau.push({ id: 'the_order_of_the_sisters_of_verity', counters: 0, used: false });
  s.players[you].hand = ['circle_of_sages'];
  E.apply(s, me, { type: 'endTurn' }) === null || E.apply(s, me, { type: 'pass' });
  E.apply(s, me, { type: 'pass' });
  while (turn(s) !== you) E.apply(s, turn(s), { type: 'pass' });
  eq(E.apply(s, you, { type: 'playCard', card: 'circle_of_sages' }), null, 'a rival plays a Scholar card');
  eq(E.findCard(s, 'the_order_of_the_sisters_of_verity').t.counters, 1, 'the Sisters gain an Acolyte');
  eq(E.cardFp(s, me, p.tableau.find((t) => t.id === 'the_order_of_the_sisters_of_verity')), 1, '1 Favor Point per Acolyte');
}
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  p.tableau.push({ id: 'sanitarium_of_st_sarah_the_kind', counters: 3, used: false }, { id: 'st_rachel_s_magnificent_market', counters: 0, used: false });
  ok(/At most 3/.test(E.check(s, me, { type: 'cardAction', card: 'sanitarium_of_st_sarah_the_kind', n: 4 })), 'cannot trade in more Acolytes than the card holds');
  eq(E.apply(s, me, { type: 'cardAction', card: 'sanitarium_of_st_sarah_the_kind', n: 2 }), null, 'trade in 2 Acolytes');
  eq(p.res.gold, 106, '3 Gold each');
  eq(E.findCard(s, 'sanitarium_of_st_sarah_the_kind').t.counters, 1, 'one left');
  ok(/once|Already/.test(E.check(s, me, { type: 'cardAction', card: 'sanitarium_of_st_sarah_the_kind', n: 1 })), 'once a year');
  eq(E.apply(s, me, { type: 'cardAction', card: 'st_rachel_s_magnificent_market', opt: 0, n: 5 }), null, 'buy 5 Workers at the market');
  eq(p.res.gold, 101, '1 Gold each');
  eq(E.findCard(s, 'st_rachel_s_magnificent_market').t.counters, 5, 'five Workers');
  const m = E.findCard(s, 'st_rachel_s_magnificent_market').t;
  m.used = false;
  again(s, me);
  ok(/resource/.test(E.check(s, me, { type: 'cardAction', card: 'st_rachel_s_magnificent_market', opt: 1, n: 2 })), 'the trade-in needs a resource chosen');
  const ore = p.res.ore;
  eq(E.apply(s, me, { type: 'cardAction', card: 'st_rachel_s_magnificent_market', opt: 1, n: 3, res: 'ore' }), null, 'trade 3 Workers for Ore');
  eq(p.res.ore, ore + 3, 'one Ore per Worker');
  eq(m.counters, 2, 'Workers spent');
}
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  p.hand = ['lady_myra_s_herds'];
  eq(E.apply(s, me, { type: 'playCard', card: 'lady_myra_s_herds' }), null, 'play Lady Myra’s Herds');
  const t = E.findCard(s, 'lady_myra_s_herds').t;
  eq(t.counters, 3, 'it starts with 3 Workers');
  const g = p.res.gold;
  eq(E.apply(s, me, { type: 'cardAction', card: 'lady_myra_s_herds', opt: 0 }), null, 'take the herd’s income');
  eq(p.res.gold, g + 6, '2 Gold per Worker');
  eq(t.counters, 2, 'and one Worker leaves');
  p.tableau.push({ id: 'lady_hannah_s_loom', counters: 0, used: false });
  p.res.rm = 5;
  const lux = p.res.lux;
  again(s, me);
  ok(/At most 3/.test(E.check(s, me, { type: 'cardAction', card: 'lady_hannah_s_loom', n: 4 })), 'the Loom takes at most 3');
  eq(E.apply(s, me, { type: 'cardAction', card: 'lady_hannah_s_loom', n: 3 }), null, 'weave');
  eq(p.res.lux, lux + 6, 'twice the Raw Materials in Luxuries');
}

// ---- moving counters between dukes' cards
{
  const s = fresh();
  const me = turn(s);
  const you = other(s);
  s.players[me].tableau.push({ id: 'college_of_diplomats', counters: 0, used: false }, { id: 'the_entourage_of_earls', counters: 0, used: false });
  s.players[you].tableau.push({ id: 'the_conclave_of_counts', counters: 2, used: false });
  const a = { type: 'cardAction', card: 'college_of_diplomats', opt: 0, from: 'the_conclave_of_counts', to: 'the_entourage_of_earls' };
  ok(E.tokenTargets(s, me, { op: 'move', type: 'noble' }).from.some((x) => x.card === 'the_conclave_of_counts'), 'a rival’s Nobles can be taken');
  s.players[you].peaceUntil = s.year;
  ok(/protection/.test(E.check(s, me, a)), 'but not from a duke under the King’s Peace');
  s.players[you].peaceUntil = 0;
  eq(E.apply(s, me, a), null, 'move a Noble to my own card');
  eq(E.findCard(s, 'the_conclave_of_counts').t.counters, 1, 'it leaves the rival’s card');
  eq(E.findCard(s, 'the_entourage_of_earls').t.counters, 1, 'and arrives on mine');
  eq(s.players[me].res.lux, 19, 'for 1 Luxury');
  const s2 = fresh(23);
  const m2 = turn(s2);
  const y2 = other(s2);
  s2.players[m2].tableau.push({ id: 'guildmasters', counters: 0, used: false });
  s2.players[y2].tableau.push({ id: 'lumber_camp', counters: 1, used: false });
  eq(E.apply(s2, m2, { type: 'cardAction', card: 'guildmasters', opt: 1, to: 'lumber_camp' }), null, 'a Worker may be added to a rival’s card');
  eq(E.findCard(s2, 'lumber_camp').t.counters, 2, 'it arrives there');
  s2.players[m2].tableau.push({ id: 'the_conclave_of_counts', counters: 0, used: false });
  E.findCard(s2, 'guildmasters').t.used = false;
  again(s2, m2);
  ok(/collects Workers/.test(E.check(s2, m2, { type: 'cardAction', card: 'guildmasters', opt: 1, to: 'the_conclave_of_counts' })), 'only onto cards that collect that kind');
}
{
  // The Evangelist converts other counters into Acolytes, onto cards that already have some
  const s = fresh();
  const me = turn(s);
  const you = other(s);
  s.players[me].tableau.push({ id: 'the_evangelist', counters: 0, used: false }, { id: 'monastery_of_st_ezekiel', counters: 0, used: false });
  s.players[you].tableau.push({ id: 'st_rachel_s_magnificent_market', counters: 4, used: false });
  const a = { type: 'cardAction', card: 'the_evangelist', opt: 0, from: 'st_rachel_s_magnificent_market', to: 'monastery_of_st_ezekiel' };
  ok(/already has/.test(E.check(s, me, a)), 'the Acolyte card must already have Acolytes');
  E.findCard(s, 'monastery_of_st_ezekiel').t.counters = 1;
  const g = s.players[me].res.gold;
  eq(E.apply(s, me, a), null, 'convert a Worker');
  eq(E.findCard(s, 'st_rachel_s_magnificent_market').t.counters, 3, 'the Worker leaves the market');
  eq(E.findCard(s, 'monastery_of_st_ezekiel').t.counters, 2, 'and becomes an Acolyte');
  eq(s.players[me].res.gold, g + 2, 'the Evangelist also brings 2 Gold');
}

// ---- Workers that pay out every year, and caps
{
  const s = fresh();
  const me = turn(s);
  const p = s.players[me];
  p.tableau.push({ id: 'lumber_camp', counters: 3, used: false }, { id: 'cooper_s_workshop', counters: 2, used: false });
  ok(/cannot hold/.test(E.check(s, me, { type: 'cardAction', card: 'lumber_camp' })), 'a Lumber Camp holds at most 3 Workers');
  p.res.rm = 0;
  const car = put(s, me, 'caravan', s.capital);
  const g = p.res.gold;
  eq(E.apply(s, me, { type: 'tradeCapital', unit: car.id, marker: 'stone', pay: 'gold' }), null, 'trade at the capital');
  eq(p.res.gold, g - 9 + 4, 'the Cooper’s Workshop pays 2 Gold per Worker on each trade');
  E.apply(s, me, { type: 'endTurn' });
  while (s.phase === 'action') E.apply(s, turn(s), { type: 'pass' });
  eq(p.res.rm, 3 + p.prod.rm, 'the Lumber Camp’s 3 Raw Materials arrive after the year’s Luxuries are made');
}
{
  const s = fresh();
  const me = turn(s);
  s.players[me].hand = ['royal_monument'];
  ok(/Culture 4/.test(E.check(s, me, { type: 'playCard', card: 'royal_monument' })), 'Royal Monument needs Culture 4');
  s.tracks.culture = 4;
  eq(E.apply(s, me, { type: 'playCard', card: 'royal_monument' }), null, 'play it');
  eq(E.findCard(s, 'royal_monument').t.counters, 2, 'with 2 Artisans');
  eq(E.score(s, me).cards, 2, '1 Favor Point per Artisan');
  eq(s.tracks.culture, 5, 'and Culture rises');
}

// ---- hidden information
{
  const s = fresh();
  const me = s.order[0];
  s.players[s.order[1]].hand = ['tavern', 'granary'];
  const v = E.viewFor(s, me);
  eq(v.players[s.order[1]].hand.length, 0, 'rivals’ hands are hidden');
  eq(v.players[s.order[1]].handCount, 2, 'but their size is known');
  ok(!('deck' in v) && !('rng' in v), 'the deck and the dice are hidden');
}

console.log(failures ? `${failures} of ${checks} rule checks FAILED` : `All ${checks} rule checks passed.`);
process.exit(failures ? 1 : 0);
