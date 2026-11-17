// Drives the interaction dialogs through the UI: skirmish, raid, duke trade, capital trade, market, card play, titles.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.stack));
// two dukes on this device and no bots, so that nothing moves while we test
await p.goto('http://localhost:8080/?auto=local&bots=0&locals=1&style=lake');
const seatFix = async () => { if (await p.isVisible('#btn-seat')) await p.click('#btn-seat'); };
// run setup for both local seats through the engine directly
await p.evaluate(async () => {
  const E = await import('/js/engine/engine.js');
  const { botAction } = await import('/js/engine/bot.js');
  const s = window.__dd.session;
  while (s.state.phase !== 'action') { const pid = E.waitingOn(s.state)[0]; const a = botAction(s.state, pid); if (a.type === 'chooseSetup') a.keep = a.keep.slice(0, 2); s.dispatch(pid, a); }
  const st = s.state;
  const map = E.mapOf(st);
  const me = st.turn.pid;
  const foe = st.order.find((x) => x !== me);
  s.seat = me;
  for (const pid of st.order) Object.assign(st.players[pid].res, { gold: 60, stone: 12, ore: 12, food: 12, rm: 12, lux: 12 });
  st.units = [];
  const put = (owner, type, at) => { st.units.push({ id: st.nextUnit++, owner, type, at, moved: 0, acted: false, done: false }); return st.nextUnit - 1; };
  const cap = (pid) => +Object.keys(st.settlements).find((j) => st.settlements[j].owner === pid && st.settlements[j].type === 'capital');
  // a rival town with open ground beside it
  const site = map.junctions.find((J) => J.land && !J.fortified && !E.townSiteError(st, J.id) && J.adj.filter((x) => map.junctions[x].land).length >= 2).id;
  st.settlements[site] = { owner: foe, type: 'town', church: 0, bonus: null, raided: 0 };
  const [n1, n2] = map.junctions[site].adj.filter((x) => map.junctions[x].land);
  window.__t = {
    me, foe, site,
    raider: put(me, 'soldiers', site),
    knight: put(me, 'knights', n1),
    victim: put(foe, 'soldiers', n2),
    trader: put(me, 'caravan', cap(foe)),
    merchant: put(me, 'caravan', st.capital),
  };
  // make sure the knight and the victim are neighbours: move the victim next to the knight if not
  if (!map.junctions[n1].adj.includes(n2)) {
    const spot = map.junctions[n1].adj.find((x) => x !== site && map.junctions[x].land && !st.settlements[x] && x !== st.capital);
    st.units.find((u) => u.id === window.__t.victim).at = spot;
  }
  st.trade.lux.pos = 5;
  st.players[me].hand = ['tavern', 'stone_quarry', 'royal_tournament'];
  s.broadcast();
});
await seatFix();
await p.waitForFunction(() => window.__dd.game && window.__dd.game.myTurn());
const T = await p.evaluate(() => window.__t);
const st = () => p.evaluate(() => { const s = window.__dd.session.state; const t = window.__t; return { me: s.players[t.me].res, foe: s.players[t.foe].res, units: s.units.map((u) => u.id), wealth: s.tracks.wealth, power: s.tracks.power, turn: s.turn.pid, n: s.turn.n }; });
const backToMe = async () => {
  // the silent rival passes; then it is our turn again
  await p.evaluate(async () => { const s = window.__dd.session; const t = window.__t; while (s.state.phase === 'action' && s.state.turn.pid !== t.me) s.dispatch(s.state.turn.pid, { type: s.state.turn.n ? 'endTurn' : 'pass' }); s.setSeat(t.me); });
  await seatFix();
};
const closeModal = async () => { await p.click('.modal-wrap:last-of-type .x'); };

// 1. raid
await p.evaluate((id) => window.__dd.game.pick({ kind: 'unit', id }), T.raider);
await p.waitForSelector('.unit-box:not(.hidden)');
await p.locator('.unit-box .btn', { hasText: 'Raid' }).click();
await p.screenshot({ path: out + '/war-raid.png' });
await p.locator('.modal .btn', { hasText: 'Gold' }).click();
await p.locator('.modal .btn', { hasText: 'Ore' }).click();
await p.locator('.modal .btn.danger', { hasText: 'Raid' }).click();
let x = await st();
console.log('raid:', x.me.gold === 62 && x.me.ore === 13 && x.foe.gold === 58 && x.foe.ore === 11 ? 'ok' : 'WRONG ' + JSON.stringify(x));

// 2. skirmish
await p.evaluate((id) => window.__dd.game.pick({ kind: 'unit', id }), T.knight);
await p.waitForSelector('.unit-box:not(.hidden)');
await p.waitForTimeout(300);
await p.screenshot({ path: out + '/war-select.png' });
const targets = await p.evaluate(() => window.__dd.game.highlights().units.filter((u) => u.kind === 'attack').map((u) => u.id));
console.log('attack targets:', JSON.stringify(targets), 'expected', T.victim);
await p.evaluate((id) => window.__dd.game.pick({ kind: 'unit', id, highlighted: true }), T.victim);
await p.waitForSelector('#btn-attack');
await p.screenshot({ path: out + '/war-attack.png' });
await p.click('#btn-attack');
x = await st();
console.log('skirmish:', !x.units.includes(T.victim) && x.units.includes(T.knight) ? 'ok' : 'WRONG ' + JSON.stringify(x.units));
console.log('turn passed after two actions:', x.turn !== T.me ? 'ok' : 'WRONG');

// 3. duke trade and capital trade
await backToMe();
await p.waitForFunction(() => window.__dd.game.myTurn());
await p.locator('.side .act', { hasText: 'Trade with a Duke' }).click();
await p.locator('.modal .btn-row').nth(0).locator('.btn', { hasText: 'Food' }).click();
await p.locator('.modal .btn-row').nth(1).locator('.btn', { hasText: 'Luxuries' }).click();
await p.locator('.modal .stepper .btn', { hasText: '+' }).click();
await p.screenshot({ path: out + '/war-duke.png' });
await p.locator('.modal .btn.primary', { hasText: 'Trade' }).click();
x = await st();
console.log('duke trade:', x.me.food === 8 && x.me.lux === 14 && x.foe.food === 16 && x.foe.lux === 10 && !x.units.includes(T.trader) ? 'ok' : 'WRONG ' + JSON.stringify(x));
await p.click('#btn-trade');
await p.waitForSelector('.trade-track');
await p.click('[data-trade="lux"]');
await p.waitForTimeout(200);
await p.screenshot({ path: out + '/war-trade.png' });
x = await st();
console.log('capital trade:', x.me.lux === 14 + 9 && x.me.rm === 9 ? 'ok' : 'WRONG ' + JSON.stringify(x.me));
await closeModal();

// 4. supply luxuries, market, card play
await backToMe();
await p.waitForFunction(() => window.__dd.game.myTurn());
await p.locator('.side .act', { hasText: 'Supply Royal Luxuries' }).click();
x = await st();
console.log('supply:', x.wealth === 1 && x.me.lux === 15 ? 'ok' : 'WRONG ' + JSON.stringify(x));
await p.locator('.side .act', { hasText: 'Sell Goods at Market' }).click();
await p.locator('.modal .btn', { hasText: 'Food' }).click();
await p.locator('.modal .btn', { hasText: 'All' }).click();
await p.screenshot({ path: out + '/war-market.png' });
const goldBefore = (await st()).me.gold;
await p.locator('.modal .btn.primary', { hasText: 'Sell' }).click();
x = await st();
console.log('market:', x.me.food === 0 && x.me.gold === goldBefore + 8 ? 'ok' : 'WRONG ' + JSON.stringify(x.me));
await backToMe();
await p.waitForFunction(() => window.__dd.game.myTurn());
await p.click('.hand .card[data-card="stone_quarry"]');
await p.waitForSelector('#btn-play');
await p.screenshot({ path: out + '/war-card.png' });
const g2 = (await st()).me;
await p.click('#btn-play');
x = await st();
console.log('card with stone:', x.me.stone < g2.stone && g2.gold - x.me.gold + (g2.stone - x.me.stone) * 2 >= 10 ? 'ok paid ' + (g2.gold - x.me.gold) + ' gold + ' + (g2.stone - x.me.stone) + ' stone' : 'WRONG ' + JSON.stringify([g2, x.me]));
await p.click('.hand .card[data-card="royal_tournament"]');
await p.click('#btn-play');
x = await st();
console.log('event raises power:', x.power === 1 ? 'ok' : 'WRONG');
console.log(errs.join('\n') || 'no console errors');
await b.close();
