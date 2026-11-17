// Pass-and-play: two dukes on one device plus a bot.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.stack));
p.on('dialog', (d) => d.accept('Duchess Second'));
await p.goto('http://localhost:8080/?fastbots');
await p.fill('#name', 'Duke First');
await p.click('#btn-local');
await p.click('#btn-add-local');
await p.click('#btn-add-bot');
await p.selectOption('#map-style', 'coast');
await p.screenshot({ path: out + '/hs-lobby.png' });
await p.click('#btn-start');
const seat = () => p.evaluate(() => window.__dd.session.seat);
const takeSeatIfAsked = async () => { if (await p.isVisible('#btn-seat')) { await p.click('#btn-seat'); return true; } return false; };
const seen = new Set();
let curtainShots = 0;
for (let guard = 0; guard < 600; guard++) {
  const st = await p.evaluate(() => { const s = window.__dd.session; const v = s.view(); return { phase: v.phase, year: v.year, waiting: s.localWaiting(), seat: s.seat, hand: v.players[v.you].hand.length }; });
  if (st.phase === 'action' && st.year >= 2) break;
  if (await p.isVisible('#btn-seat')) {
    if (curtainShots++ === 0) await p.screenshot({ path: out + '/hs-curtain.png' });
    await p.click('#btn-seat');
    continue;
  }
  if (!st.waiting.includes(st.seat)) { await p.waitForTimeout(60); continue; }
  seen.add(st.seat);
  if (st.phase === 'capitalVote') await p.click('#btn-approve');
  else if (st.phase === 'setup') { await p.click('.phase-modal .card.house'); await p.click('.phase-modal .card-grid:not(.houses) .card:nth-child(2)'); await p.click('#btn-confirm'); }
  else if (st.phase === 'research') { await p.click('#btn-confirm'); }
  else if (st.phase === 'placeCapitals') {
    await p.evaluate(() => { const g = window.__dd.game; const hl = g.highlights().junctions; g.pick({ kind: 'junction', id: hl[Math.floor(hl.length / 2)].id }); });
    await p.waitForSelector('[data-bonus]');
    await p.click('[data-bonus]');
  } else if (st.phase === 'action') {
    if (await p.isEnabled('#btn-pass')) { await p.click('#btn-pass'); await p.click('#btn-pass-yes'); }
  }
  await p.waitForTimeout(80);
}
const fin = await p.evaluate(() => { const s = window.__dd.session; return { phase: s.state.phase, year: s.state.year, seats: s.seats.map((x) => x.kind) }; });
console.log(JSON.stringify({ fin, seatsPlayed: [...seen], curtainShots }));
// resume after a reload
await p.reload();
await p.click('#btn-resume');
await p.waitForFunction(() => window.__dd && window.__dd.session.view());
console.log('resumed at year', await p.evaluate(() => window.__dd.session.state.year));
console.log(errs.join('\n') || 'no console errors');
await b.close();
