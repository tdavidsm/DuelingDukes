// Plays whole games bot-against-bot and checks the rules engine's invariants.
//   node test/sim.mjs [games] [verbose]
import * as E from '../js/engine/engine.js';
import * as D from '../js/engine/data.js';
import { CARDS } from '../js/engine/cards.js';
import { describeCard, plain } from '../js/engine/describe.js';
import { botAction, fallbackAction } from '../js/engine/bot.js';

const games = +process.argv[2] || 40;
const verbose = process.argv[3] === 'v';
let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL: ' + msg); };

// Every card must describe itself without leaking raw effect names.
for (const card of CARDS) {
  const d = describeCard(card);
  const text = plain([d.req, ...d.lines, d.action, d.fp].filter(Boolean).join(' | '));
  if (/undefined|NaN|\[object/.test(text)) fail(`card text for ${card.name}: ${text}`);
  if (!d.lines.length && !d.action && !d.fp) fail(`card ${card.name} does nothing`);
}
if (new Set(CARDS.map((c) => c.id)).size !== CARDS.length) fail('duplicate card ids');

function invariants(state, where) {
  for (const pid of state.order) {
    const p = state.players[pid];
    for (const r of D.RES) if (!(p.res[r] >= 0) || !Number.isInteger(p.res[r])) fail(`${where}: ${pid} has ${p.res[r]} ${r}`);
    for (const r of D.PROD_RES) {
      const floor = r === 'gold' ? D.MIN_GOLD_PROD : 0;
      if (!(p.prod[r] >= floor)) fail(`${where}: ${pid} prod ${r} = ${p.prod[r]}`);
    }
  }
  const seen = new Map();
  for (const u of state.units) {
    if (u.at === state.capital) continue;
    if (seen.has(u.at)) fail(`${where}: two units on junction ${u.at}`);
    seen.set(u.at, u);
  }
  for (const t of D.TRACK_IDS) if (state.tracks[t] > D.TRACKS[t].max) fail(`${where}: track ${t} overflow`);
  const all = [...state.deck, ...state.discard];
  for (const pid of state.order) {
    const p = state.players[pid];
    all.push(...p.hand, ...p.draft, ...p.events, ...p.tableau.map((t) => t.id));
  }
  if (all.length !== CARDS.length || new Set(all).size !== CARDS.length) fail(`${where}: card count ${all.length} vs ${CARDS.length}`);
  JSON.stringify(E.viewFor(state, state.order[0]));
}

const stats = { years: [], winners: {}, scores: [], actions: 0, types: {} };
for (let g = 0; g < games; g++) {
  const n = 2 + (g % 4);
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'Bot ' + (i + 1), color: D.PLAYER_COLORS[i].id, bot: true }));
  let state = E.createGame({ players, seed: 1000 + g * 37, style: ['lake', 'coast', 'random'][g % 3] });
  let steps = 0;
  try {
    while (state.phase !== 'ended' && steps < 60000) {
      const pid = E.waitingOn(state)[0];
      // veto now and then to exercise the capital vote
      let a = state.phase === 'capitalVote' && (g + steps) % 5 === 0 ? { type: 'voteCapital', approve: false } : botAction(state, pid);
      // the client view must give the same legality verdict as the full state
      const view = E.viewFor(state, pid);
      const e1 = E.check(state, pid, a);
      const e2 = E.check(view, pid, a);
      if (e1 !== e2) fail(`view/state disagree on ${JSON.stringify(a)}: ${e1} vs ${e2}`);
      let err = E.apply(state, pid, a);
      if (err) {
        fail(`game ${g}: bot ${pid} illegal ${JSON.stringify(a)}: ${err}`);
        a = fallbackAction(state, pid);
        err = E.apply(state, pid, a);
        if (err) throw new Error('fallback refused: ' + err);
      }
      stats.types[a.type + (a.kind ? ':' + a.kind : '')] = (stats.types[a.type + (a.kind ? ':' + a.kind : '')] || 0) + 1;
      steps++;
      if (steps % 25 === 0) invariants(state, `game ${g} step ${steps}`);
      if (state.year > 60) { fail(`game ${g}: still running in year ${state.year}: tracks ${JSON.stringify(state.tracks)}; ${state.order.map((q) => `${q} gold ${state.players[q].res.gold} lux ${state.players[q].res.lux} ore ${state.players[q].res.ore} units ${state.units.filter((u) => u.owner === q).map((u) => u.type + '@' + u.at + (u.at === state.capital ? '(capital)' : '')).join(',')}`).join(' / ')}`); break; }
    }
    invariants(state, `game ${g} end`);
  } catch (e) {
    fail(`game ${g} crashed at step ${steps}: ${e.stack}`);
    continue;
  }
  if (state.phase === 'ended') {
    stats.years.push(state.year);
    const r = state.result;
    stats.scores.push(r.scores[r.ranking[0]].total);
    if (verbose) {
      console.log(`game ${g}: ${n}p, ${state.year} years, ${steps} actions, tracks ${JSON.stringify(state.tracks)}`);
      for (const pid of r.ranking) {
        const p = state.players[pid];
        console.log(`   ${p.name} ${p.house} ${JSON.stringify(r.scores[pid])} prod ${JSON.stringify(p.prod)} played ${p.tableau.length + p.events.length} settlements ${E.count(state, pid, 'settlements')}`);
      }
    }
  }
  stats.actions += steps;
}
const avg = (a) => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(1);
console.log(`${CARDS.length} cards. ${stats.years.length}/${games} games finished. years avg ${avg(stats.years)} (min ${Math.min(...stats.years)}, max ${Math.max(...stats.years)}), winning score avg ${avg(stats.scores)}`);
if (verbose) console.log(stats.types);
console.log(failures ? `${failures} FAILURES` : 'All checks passed.');
process.exit(failures ? 1 : 0);
