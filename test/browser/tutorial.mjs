// Plays through the whole tutorial as a new player would, step by step.
//   node test/browser/tutorial.mjs <screenshot dir> [phone]
import { chromium } from 'playwright';
const out = process.argv[2];
const phone = process.argv[3] === 'phone';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage(phone ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true } : { viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.stack));
const tag = phone ? 'm' : 'd';
let shots = 0;
const shot = (name) => p.screenshot({ path: `${out}/tut-${tag}-${String(++shots).padStart(2, '0')}-${name}.png` });
const title = () => p.$eval('.coach-body h3', (x) => x.textContent).catch(() => '');
const waitTitle = async (t) => {
  await p.waitForFunction((t) => document.querySelector('.coach-body h3')?.textContent === t, t, { timeout: 30000 })
    .catch(async () => { throw new Error(`expected step "${t}", still on "${await title()}"`); });
};
const next = async (t) => { await waitTitle(t); await p.click('#coach-next'); };
const g = (fn, arg) => p.evaluate(fn, arg);
// Click a spot on the map the way the board would report it.
const pick = (sel) => g(sel);
const closeModals = () => g(() => document.querySelectorAll('.modal-wrap').forEach((m) => m.querySelector('.x')?.click()));
const resolveMine = () => g(async () => {
  const E = await import('/js/engine/engine.js');
  for (let i = 0; i < 6; i++) {
    const v = window.__dd.session.view();
    const pd = v.pending[0];
    if (!pd || pd.pid !== v.you) return;
    const ch = E.pendingChoices(v);
    const gm = window.__dd.game;
    if (ch.edges) gm.pick({ kind: 'edge', id: ch.edges[0] });
    else if (ch.junctions) gm.pick({ kind: 'junction', id: ch.junctions[0] });
    else await gm.act({ type: 'resolve', skip: true });
    await new Promise((r) => setTimeout(r, 150));
  }
});
const myTurn = () => p.waitForFunction(() => window.__dd.game && window.__dd.game.myTurn(), null, { timeout: 30000 });

await p.goto('http://localhost:8080/?auto=tutorial&fastbots');
await p.waitForSelector('.coach');
await p.waitForTimeout(500);
await shot('welcome');
await next('Welcome, my lord');
await next('How to win');
await shot('tracks');
await next('The kingdom’s tracks');

await waitTitle('Agree on the capital');
await shot('capital');
await p.click('#btn-approve');

await waitTitle('Your house and opening hand');
await p.waitForSelector('.phase-modal .card.house');
await p.waitForTimeout(300);
await shot('house');
await p.click('.phase-modal .card.house >> nth=0');
await p.click('.phase-modal .card-grid:not(.houses) .card >> nth=0');
await p.click('.phase-modal .card-grid:not(.houses) .card >> nth=1');
await p.click('#btn-confirm');

await waitTitle('Found your duchy capital');
await p.waitForFunction(() => { const v = window.__dd.session.view(); return v.phase === 'placeCapitals' && v.order[v.placeIdx] === v.you; }, null, { timeout: 30000 });
await shot('found-capital');
await pick(() => { const gm = window.__dd.game; const hl = gm.highlights().junctions; gm.pick({ kind: 'junction', id: hl[Math.floor(hl.length / 2)].id }); });
await p.waitForSelector('[data-bonus]');
await p.click('[data-bonus]');
await p.waitForTimeout(400);
await resolveMine();

await next('Your treasury');
await shot('turns');
await next('Turns and actions');

await waitTitle('Build a road');
await myTurn();
await p.click('[data-act="build-road"]');
await pick(() => { const gm = window.__dd.game; gm.pick({ kind: 'edge', id: gm.highlights().edges[0].id }); });
await next('Plan for your goods');

await waitTitle('Recruit Settlers');
await myTurn();
await shot('settlers');
await p.click('[data-act="recruit-settlers"]');
await pick(() => { const gm = window.__dd.game; gm.pick({ kind: 'junction', id: gm.highlights().junctions[0].id }); });

await waitTitle('Move your Settlers');
await myTurn();
// Walk the Settlers to a junction where a town may be founded.
const moved = await g(async () => {
  const E = await import('/js/engine/engine.js');
  const gm = window.__dd.game;
  const v = window.__dd.session.view();
  const u = v.units.find((x) => x.owner === v.you && x.type === 'settlers');
  gm.pick({ kind: 'unit', id: u.id });
  const reach = [...E.reach(v, u).keys()].filter((j) => j !== u.at);
  const good = reach.find((j) => !E.townSiteError(v, j)) ?? reach[reach.length - 1];
  gm.pick({ kind: 'junction', id: good });
  return { good, ok: !E.townSiteError(v, good) };
});
console.log('settlers walk to', moved);

await waitTitle('Found a town');
await myTurn();
await g(() => { const gm = window.__dd.game; const v = window.__dd.session.view(); const u = v.units.find((x) => x.owner === v.you && x.type === 'settlers'); gm.pick({ kind: 'unit', id: u.id }); });
await p.waitForSelector('[data-act="found-a-town-here"]');
await p.waitForTimeout(300);
await shot('town');
await p.click('[data-act="found-a-town-here"]');

await next('Your hand of cards');
await waitTitle('Play a card');
await myTurn();
await p.waitForTimeout(300);
await shot('play-card');
await p.click('.hand .card.coach-hl');
await p.waitForSelector('#btn-play');
await p.click('#btn-play');

await waitTitle('Use a Charter’s action');
await myTurn();
await g(() => window.__dd.game.showPlayer(window.__dd.session.view().you));
await p.waitForSelector('[data-use].coach-hl');
await p.waitForTimeout(300);
await shot('charter');
await p.click('[data-use].coach-hl');
await p.waitForTimeout(300);
await closeModals();

await next('Counters on cards');
await waitTitle('Trade at the capital');
await myTurn();
await p.click('#btn-trade');
await p.waitForSelector('[data-trade]');
await p.waitForTimeout(300);
await shot('trade');
await p.click('[data-trade]:not([disabled]):not([data-trade="people"])');
await p.waitForTimeout(400);
await closeModals();

await next('How the Trade Track moves');
await waitTitle('Raise a track');
await myTurn();
await shot('church');
await p.click('[data-act="build-church"]');
await pick(() => { const gm = window.__dd.game; gm.pick({ kind: 'junction', id: gm.highlights().junctions[0].id }); });

await next('Soldiers and war');
await next('Titles and Honors');
await next('Selling');

await waitTitle('Pass for the year');
await myTurn();
if (await p.$eval('#btn-end', (x) => !x.disabled)) { await p.click('#btn-end'); await myTurn(); }
await p.click('#btn-pass');
await p.waitForSelector('#btn-pass-yes');
await shot('pass');
await p.click('#btn-pass-yes');

await waitTitle('Research');
await p.waitForSelector('.phase-modal #btn-confirm');
await p.waitForTimeout(300);
await shot('research');
await p.click('.phase-modal #btn-confirm');

await next('A little strategy');
await waitTitle('Off you go');
await shot('finish');
const before = await g(() => window.__dd.session.state.log.length);
await p.click('#coach-keep');
await p.waitForTimeout(300);
const after = await g(() => ({ coach: !!document.querySelector('.coach'), teaching: window.__dd.session.teaching, saved: localStorage.getItem('duelingdukes.host') }));
console.log(JSON.stringify({ moved, after, logGrew: before > 0 }));
if (after.coach || after.teaching || after.saved) throw new Error('keep playing did not hand the game over cleanly');
console.log('tutorial completed:', shots, 'screenshots');
console.log(errs.join('\n') || 'no console errors');
await b.close();
