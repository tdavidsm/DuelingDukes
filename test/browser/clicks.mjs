// Real pointer input on the 3D board: clicking junctions, edges and units.
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.stack));
await p.goto('http://localhost:8080/?auto=local&bots=1&fastbots&style=lake');
await p.waitForSelector('#btn-approve');
await p.click('#btn-approve');
await p.waitForSelector('.phase-modal .card.house');
await p.click('.phase-modal .card.house');
await p.click('#btn-confirm');
await p.waitForFunction(() => { const v = window.__dd.session.view(); return v.phase === 'placeCapitals' && v.order[v.placeIdx] === v.you; });
await p.waitForTimeout(500);
// screen position of a world point
const screenOf = (kind, id) => p.evaluate(([kind, id]) => {
  const g = window.__dd.game;
  const bd = g.board;
  let v;
  if (kind === 'junction') v = bd.jpos(id, 0.16);
  else if (kind === 'edge') { const e = bd.map.edges[id]; v = bd.jpos(e.a, 0.16).add(bd.jpos(e.b, 0.16)).multiplyScalar(0.5); }
  else { v = bd.unitPos(id).clone(); v.y = 0.3; }
  bd.camera.updateMatrixWorld();
  v.project(bd.camera);
  const r = bd.renderer.domElement.getBoundingClientRect();
  return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
}, [kind, id]);
const visible = (pt) => pt.x > 260 && pt.x < 1140 && pt.y > 110 && pt.y < 640;
const pickVisible = async (kind, ids) => { for (const id of ids) { const pt = await screenOf(kind, id); if (visible(pt)) return { id, pt }; } return null; };

let hl = await p.evaluate(() => window.__dd.game.highlights().junctions.map((j) => j.id));
let t = await pickVisible('junction', hl.slice(Math.floor(hl.length / 2)));
await p.mouse.click(t.pt.x, t.pt.y);
await p.waitForSelector('[data-bonus]', { timeout: 5000 });
await p.click('[data-bonus]');
const capAt = await p.evaluate(() => { const v = window.__dd.session.view(); return +Object.keys(v.settlements).find((j) => v.settlements[j].owner === v.you); });
console.log('capital placed by click at junction', capAt, 'expected', t.id);
await p.waitForFunction(() => window.__dd.session.view().phase === 'action' && window.__dd.game.myTurn(), null, { timeout: 30000 });
await p.evaluate(() => { const s = window.__dd.session; const me = s.state.players[s.seat]; me.res.gold = 60; me.res.stone = 9; me.res.food = 9; s.state.units = []; s.broadcast(); });

// build a road by clicking an edge
await p.locator('.side .act', { hasText: 'Build Road' }).click();
hl = await p.evaluate(() => window.__dd.game.highlights().edges.map((e) => e.id));
t = await pickVisible('edge', hl);
await p.mouse.click(t.pt.x, t.pt.y);
// (a rival from House Viator may already own roads, so look for ours on the clicked edge)
await p.waitForFunction((e) => { const v = window.__dd.session.view(); return v.roads[e] === v.you; }, t.id, { timeout: 5000 });
console.log('road built by click on edge', t.id);
await p.keyboard.press('Escape');

// recruit settlers by clicking the capital, then select and move them with clicks
await p.waitForFunction(() => window.__dd.game.myTurn(), null, { timeout: 30000 });
await p.locator('.side .act', { hasText: 'Recruit Settlers' }).click();
let pt = await screenOf('junction', capAt);
await p.mouse.click(pt.x, pt.y);
await p.waitForFunction(() => window.__dd.game.myUnits().length === 1, null, { timeout: 5000 });
await p.waitForFunction(() => window.__dd.game.myTurn(), null, { timeout: 30000 });
await p.waitForTimeout(400);
const uid = await p.evaluate(() => window.__dd.game.myUnits()[0].id);
pt = await screenOf('unit', uid);
await p.mouse.click(pt.x, pt.y);
await p.waitForSelector('.unit-box:not(.hidden)', { timeout: 5000 });
console.log('unit selected by click');
hl = await p.evaluate(() => window.__dd.game.highlights().junctions.map((j) => j.id));
t = await pickVisible('junction', hl.reverse());
await p.mouse.move(t.pt.x, t.pt.y);
await p.mouse.click(t.pt.x, t.pt.y);
await p.waitForFunction((to) => window.__dd.game.myUnits()[0].at === to, t.id, { timeout: 5000 });
console.log('unit moved by click to', t.id);
await p.waitForTimeout(700);
// hover tooltip over a hex
await p.mouse.move(700, 380);
await p.waitForTimeout(200);
console.log('tooltip:', await p.evaluate(() => document.querySelector('.tip').classList.contains('hidden') ? '(hidden)' : document.querySelector('.tip').textContent));
await p.screenshot({ path: out + '/clicks.png' });
console.log(errs.join('\n') || 'no console errors');
await b.close();
