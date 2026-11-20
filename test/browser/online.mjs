// Two browsers, one hosting and one joining, through a local PeerJS broker.
import { chromium } from 'playwright';
const out = process.argv[2];
const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-features=WebRtcHideLocalIpsWithMdns'];
const b = await chromium.launch({ args });
const errs = [];
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(name + ' ' + m.text()); });
  p.on('pageerror', (e) => errs.push(name + ' PAGEERROR: ' + e.stack));
  return p;
};
const base = 'http://localhost:8080/?broker=localhost:9000&fastbots';
const host = await mk('host');
await host.goto(base);
await host.click('#btn-offer-no'); // a first visit offers the tutorial
await host.fill('#name', 'Duke Host');
await host.click('#btn-host');
await host.waitForFunction(() => window.__dd && window.__dd.session.status === 'open', null, { timeout: 20000 });
const code = await host.textContent('#table-code');
console.log('table code', code);
await host.screenshot({ path: out + '/net-lobby-host.png' });

const guest = await mk('guest');
await guest.goto(base + '&join=' + code);
await guest.fill('#name', 'Duchess Guest');
await guest.click('#btn-join');
await host.waitForFunction(() => window.__dd.session.seats.length === 2, null, { timeout: 30000 });
console.log('guest seated');
await host.click('#btn-add-bot');
await guest.waitForFunction(() => window.__dd.session.lobby() && window.__dd.session.lobby().seats.length === 3);
await guest.screenshot({ path: out + '/net-lobby-guest.png' });
await host.click('#btn-start');

for (const p of [host, guest]) {
  await p.waitForSelector('#btn-approve');
  await p.click('#btn-approve');
}
for (const p of [host, guest]) {
  await p.waitForSelector('.phase-modal .card.house');
  await p.click('.phase-modal .card.house');
  await p.click('.phase-modal .card-grid:not(.houses) .card:nth-child(1)');
  await p.click('#btn-confirm');
}
// hidden information: the guest must not be able to see the host's hand
const leak = await guest.evaluate(() => {
  const v = window.__dd.session.view();
  const other = Object.values(v.players).find((p) => p.id !== v.you && !p.bot);
  return { hand: other.hand.length, handCount: other.handCount, hasDeck: 'deck' in v, hasRng: 'rng' in v };
});
console.log('guest sees of host', JSON.stringify(leak));

// place capitals in turn
const place = async (p) => {
  await p.evaluate(() => { const g = window.__dd.game; const hl = g.highlights().junctions; g.pick({ kind: 'junction', id: hl[Math.floor(hl.length / 3)].id }); });
  await p.waitForSelector('[data-bonus]');
  await p.click('[data-bonus]');
};
for (let guard = 0; guard < 400; guard++) {
  if (await host.evaluate(() => window.__dd.session.view().phase === 'action')) break;
  for (const p of [host, guest]) {
    const mine = await p.evaluate(() => { const v = window.__dd.session.view(); return v.phase === 'placeCapitals' && v.order[v.placeIdx] === v.you && !v.players[v.you].placed && !document.querySelector('[data-bonus]'); });
    if (mine) {
      await place(p);
      await p.waitForFunction(() => window.__dd.session.view().players[window.__dd.session.view().you].placed);
    }
  }
  await host.waitForTimeout(100);
}
await host.waitForFunction(() => window.__dd.session.view().phase === 'action');
console.log('year 1 under way');

// an illegal move from the guest out of turn must be refused by the host
const refused = await guest.evaluate(async () => {
  const s = window.__dd.session;
  const v = s.view();
  if (v.turn.pid === v.you) return 'guest is on turn, skipped';
  return await s.act({ type: 'std', kind: 'tribute' });
});
console.log('out-of-turn move:', refused);

// both humans play by bot logic through their own sessions for a while
const auto = (p, untilYear) => p.evaluate(async (untilYear) => {
  const { botAction } = await import('/js/engine/bot.js');
  const E = await import('/js/engine/engine.js');
  const s = window.__dd.session;
  let n = 0;
  for (let guard = 0; guard < 4000; guard++) {
    const v = s.view();
    if (v.phase === 'ended' || v.year >= untilYear) break;
    if (E.waitingOn(v).includes(v.you)) {
      // a remote client only has its own view: bots must work from that alone
      const a = botAction(v, v.you);
      const err = await s.act(a);
      if (err) { await s.act(v.pending.length ? { type: 'resolve', skip: true } : v.turn && v.turn.n ? { type: 'endTurn' } : { type: 'pass' }); }
      n++;
    } else await new Promise((r) => setTimeout(r, 15));
  }
  return { n, year: s.view().year };
}, untilYear);
const [h1, g1] = await Promise.all([auto(host, 3), auto(guest, 3)]);
console.log('played', JSON.stringify({ h1, g1 }));
await guest.evaluate(() => window.__dd.session.chat('Well met, cousin.'));
await host.waitForFunction(() => window.__dd.session.view().log.some((l) => l.chat));
await host.waitForTimeout(600);
await host.screenshot({ path: out + '/net-host.png' });
await guest.screenshot({ path: out + '/net-guest.png' });

// guest drops and rejoins by reloading: same seat, same hand
const before = await guest.evaluate(() => { const v = window.__dd.session.view(); return { you: v.you, hand: v.players[v.you].hand.length }; });
await guest.reload();
await guest.fill('#name', 'Duchess Guest');
await guest.click('#btn-join');
await guest.waitForFunction(() => window.__dd && window.__dd.session.view(), null, { timeout: 30000 });
const after = await guest.evaluate(() => { const v = window.__dd.session.view(); return { you: v.you, hand: v.players[v.you].hand.length }; });
console.log('rejoin', JSON.stringify({ before, after }));

// host reloads and resumes the table; guest reconnects on its own
await host.reload();
await host.click('#btn-resume');
await host.waitForFunction(() => window.__dd && window.__dd.session.status === 'open', null, { timeout: 30000 });
await guest.waitForFunction(() => window.__dd.session.status === 'connected', null, { timeout: 40000 });
const seq = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__dd.session.view().seq)));
console.log('after host resume, seq', JSON.stringify(seq));
console.log(errs.join('\n') || 'no console errors');
await b.close();
