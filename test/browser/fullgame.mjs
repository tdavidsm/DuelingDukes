import { chromium } from 'playwright';
const out = process.argv[2];
const size = process.argv[3] === 'phone' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const tag = process.argv[3] === 'phone' ? 'm-' : '';
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: size });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.type() + ': ' + m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.stack));
const shot = (n) => p.screenshot({ path: out + '/' + tag + n + '.png' });
const myTurn = () => p.waitForFunction(() => window.__dd.session.view().phase === 'action' && window.__dd.game.myTurn(), null, { timeout: 60000 });
const closeModal = async () => { await p.click('.modal-wrap:last-of-type .x'); };

await p.goto('http://localhost:8080/?auto=local&bots=2&fastbots&style=lake');
await p.waitForSelector('#btn-approve');
await p.click('#btn-approve');
await p.waitForSelector('.phase-modal .card.house');
await p.click('.phase-modal .card.house');
for (let i = 1; i <= 5; i++) await p.click('.phase-modal .card-grid:not(.houses) .card:nth-child(' + i + ')');
await p.click('#btn-peek');
await p.waitForTimeout(300);
await shot('peek');
await p.click('#btn-unpeek');
await p.click('#btn-confirm');
await p.waitForFunction(() => { const v = window.__dd.session.view(); return v.phase === 'placeCapitals' && v.order[v.placeIdx] === v.you; });
await p.waitForTimeout(300);
await shot('place');
// take the richest legal site
await p.evaluate(async () => {
  const E = await import('/js/engine/engine.js');
  const g = window.__dd.game;
  const v = g.view;
  const map = E.mapOf(v);
  let best = null, bs = -1;
  for (const hl of g.highlights().junctions) {
    const y = map.junctions[hl.id].yields;
    const s = Object.keys(y).length * 2 + Object.values(y).reduce((a, c) => a + c, 0);
    if (s > bs) { bs = s; best = hl.id; }
  }
  g.pick({ kind: 'junction', id: best });
});
await p.waitForSelector('[data-bonus]');
await p.click('[data-bonus]');
await myTurn();
await p.waitForTimeout(500);
await shot('turn1');

// card dialog
await p.click('.hand .card');
await p.waitForSelector('#btn-play');
await shot('card-dialog');
await closeModal();

// recruit settlers through the actions panel
const log = [];
const act = async (name) => {
  const btn = p.locator('.side .act', { hasText: name });
  if (await btn.isDisabled()) { log.push(name + ': disabled (' + (await btn.getAttribute('title')) + ')'); return false; }
  await btn.click();
  return true;
};
if (process.argv[3] === 'phone') await p.click('.side .tabs button');
if (await act('Recruit Settlers')) {
  await p.waitForTimeout(200);
  await shot('recruit-mode');
  await p.evaluate(() => { const g = window.__dd.game; g.pick({ kind: 'junction', id: g.highlights().junctions[0].id }); });
  await p.waitForFunction(() => window.__dd.game.myUnits().length > 0);
}
// select the unit and move it
await p.evaluate(() => { const g = window.__dd.game; g.pick({ kind: 'unit', id: g.myUnits()[0].id }); });
await p.waitForSelector('.unit-box:not(.hidden)');
await p.waitForTimeout(300);
await shot('unit-selected');
const moved = await p.evaluate(() => { const g = window.__dd.game; const hl = g.highlights().junctions; if (!hl.length) return 'no reach'; g.pick({ kind: 'junction', id: hl[hl.length - 1].id }); return 'moved'; });
log.push('move: ' + moved);
await p.waitForTimeout(600);
await shot('after-move');

await myTurn();
await p.click('#btn-trade');
await p.waitForSelector('.trade-track');
await shot('trade');
await closeModal();
await p.click('#btn-titles');
await p.waitForSelector('.award-list');
await shot('titles');
await closeModal();
await p.click('.hud-right .btn:nth-child(3)');
await p.waitForSelector('.rules');
await shot('rules');
await closeModal();
await p.click('.players .player');
await p.waitForSelector('.stat-row');
await shot('player');
await closeModal();

// Let a bot play our seat for the rest of the game, through the same session.
const result = await p.evaluate(async () => {
  const { botAction, fallbackAction } = await import('/js/engine/bot.js');
  const E = await import('/js/engine/engine.js');
  const s = window.__dd.session;
  const shots = [];
  let guard = 0;
  while (s.state.phase !== 'ended' && guard++ < 200000) {
    const you = s.seat;
    if (E.waitingOn(s.state).includes(you)) {
      const a = botAction(s.state, you);
      if (s.dispatch(you, a)) s.dispatch(you, fallbackAction(s.state, you));
    } else {
      await new Promise((r) => setTimeout(r, 8));
    }
    if (s.state.year === 6 && s.state.phase === 'action' && !shots.length) { shots.push(1); break; }
  }
  return { year: s.state.year, phase: s.state.phase };
});
await p.waitForTimeout(800);
await shot('midgame');
await p.click('.side .tabs button:nth-child(2)');
await p.waitForTimeout(200);
await shot('chronicle');
await p.click('#btn-tableau');
await p.waitForSelector('.stat-row');
await shot('tableau');
await closeModal();
const end = await p.evaluate(async () => {
  const { botAction, fallbackAction } = await import('/js/engine/bot.js');
  const E = await import('/js/engine/engine.js');
  const s = window.__dd.session;
  let guard = 0;
  while (s.state.phase !== 'ended' && guard++ < 400000) {
    const you = s.seat;
    if (E.waitingOn(s.state).includes(you)) {
      const a = botAction(s.state, you);
      if (s.dispatch(you, a)) s.dispatch(you, fallbackAction(s.state, you));
    } else {
      await new Promise((r) => setTimeout(r, 8));
    }
  }
  return { year: s.state.year, phase: s.state.phase, tracks: s.state.tracks };
});
await p.waitForSelector('.score-table', { timeout: 20000 });
await p.waitForTimeout(500);
await shot('scores');
await closeModal();
await p.waitForTimeout(300);
await shot('endboard');
console.log(JSON.stringify({ result, end, log }));
console.log(errs.join('\n') || 'no console errors');
await b.close();
