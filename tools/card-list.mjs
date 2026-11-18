// Builds a printable list of every card, straight from the game's card data.
//   node tools/card-list.mjs [out-folder]
// Writes card-list.html and, if Playwright is installed, card-list.pdf.

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { CARDS } from '../js/engine/cards.js';
import * as D from '../js/engine/data.js';
import { describeCard, describeHouse, plain } from '../js/engine/describe.js';

const outDir = resolve(process.argv[2] || 'docs');
mkdirSync(outDir, { recursive: true });

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const TYPE = { project: 'Commission', active: 'Charter', event: 'Event' };
const TAG_ORDER = [...D.TAGS, 'none'];
const groupOf = (c) => c.tags[0] || 'none';
const groupName = (g) => (g === 'none' ? 'Untagged' : D.TAG_NAME[g]);

function payNote(card) {
  const ways = [];
  for (const t of card.tags) {
    const tp = D.TAG_PAY[t];
    if (tp && !ways.includes(tp.res)) ways.push(tp.res);
  }
  return ways.map((r) => `${D.RES_SHORT[r]} (${D.TAG_PAY[Object.keys(D.TAG_PAY).find((t) => D.TAG_PAY[t].res === r)].value})`).join(', ');
}

let n = 0;
function row(card) {
  n++;
  const d = describeCard(card);
  const effect = d.lines.map((l) => `<div>${esc(plain(l))}.</div>`).join('')
    + (d.actions.length === 1 ? `<div class="act"><b>Action, once a year:</b> ${esc(plain(d.actions[0]))}.</div>` : '')
    + (d.actions.length > 1 ? `<div class="act"><b>Action, once a year, choose one:</b><ul>${d.actions.map((a) => `<li>${esc(plain(a))}.</li>`).join('')}</ul></div>` : '')
    + (card.token ? `<div class="pay">Collects ${D.TOKENS[card.token].many}</div>` : '')
    + (card.flavor ? `<div class="flavor">“${esc(card.flavor)}”</div>` : '');
  return `<tr class="t-${card.type}">
    <td class="num">${n}</td>
    <td class="name">${esc(card.name)}</td>
    <td class="cost">${card.cost}</td>
    <td class="type"><span class="pill">${TYPE[card.type]}</span></td>
    <td class="tags">${card.tags.map((t) => D.TAG_NAME[t]).join(', ') || '—'}${payNote(card) ? `<div class="pay">pay with ${payNote(card)}</div>` : ''}</td>
    <td class="req">${d.req ? esc(d.req) : ''}</td>
    <td class="fx">${effect}</td>
    <td class="fp">${d.fp ? esc(d.fp) : ''}</td>
    <td class="notes"></td>
  </tr>`;
}

const groups = TAG_ORDER.map((g) => ({
  g,
  cards: CARDS.filter((c) => groupOf(c) === g).sort((a, b) => a.name.localeCompare(b.name)),
})).filter((x) => x.cards.length);

// Summary numbers.
const byType = Object.fromEntries(Object.keys(TYPE).map((t) => [t, CARDS.filter((c) => c.type === t).length]));
const tagCount = Object.fromEntries(D.TAGS.map((t) => [t, CARDS.filter((c) => c.tags.includes(t)).length]));
const costs = CARDS.map((c) => c.cost);
const avg = (costs.reduce((a, b) => a + b, 0) / costs.length).toFixed(1);
const bands = [[0, 5], [6, 10], [11, 15], [16, 20], [21, 99]].map(([lo, hi]) => ({
  label: hi >= 99 ? `${lo}+` : `${lo}–${hi}`, n: costs.filter((c) => c >= lo && c <= hi).length,
}));
const tracks = { power: 0, faith: 0, wealth: 0, culture: 0 };
let rfCards = 0;
let fpCards = 0;
let attackCards = 0;
for (const c of CARDS) {
  for (const f of c.fx || []) {
    if (f[0] === 'track') tracks[f[1]]++;
    if (f[0] === 'rf') rfCards++;
    if (['steal', 'harm', 'harmProd', 'harmAll'].includes(f[0])) attackCards++;
  }
  if (c.fp) fpCards++;
}
const attackSet = new Set(CARDS.filter((c) => (c.fx || []).some((f) => ['steal', 'harm', 'harmProd', 'harmAll'].includes(f[0]))).map((c) => c.id));

const houses = D.HOUSES.map((h) => {
  const d = describeHouse(h);
  return `<tr><td class="name">${esc(h.name)}<div class="pay">${esc(h.motto)}</div></td>
    <td class="tags">${h.tags.map((t) => D.TAG_NAME[t]).join(', ') || '—'}</td>
    <td class="fx">${d.lines.map((l) => `<div>${esc(plain(l))}.</div>`).join('')}</td><td class="notes"></td></tr>`;
}).join('');

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Dueling Dukes — Card List</title>
<style>
  @page { size: letter landscape; margin: 0.45in 0.4in 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1d1611; font-size: 9.3pt; line-height: 1.28; margin: 0; }
  h1 { font-size: 22pt; margin: 0 0 2pt; letter-spacing: .02em; }
  h2 { font-size: 13pt; margin: 14pt 0 5pt; border-bottom: 1.5pt solid #1d1611; padding-bottom: 2pt; break-after: avoid; }
  .sub { color: #5b452c; margin-bottom: 10pt; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt 18pt; margin: 6pt 0 4pt; }
  .summary div { border: .75pt solid #bba57a; border-radius: 4pt; padding: 5pt 7pt; }
  .summary b { display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #5b452c; margin-bottom: 2pt; }
  .key { font-size: 8.6pt; color: #3b2a1a; margin: 6pt 0 0; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  th { text-align: left; font-size: 7.6pt; text-transform: uppercase; letter-spacing: .05em; color: #5b452c; border-bottom: 1pt solid #1d1611; padding: 3pt 4pt; }
  td { border-bottom: .5pt solid #cbb994; padding: 3.5pt 4pt; vertical-align: top; }
  tr { break-inside: avoid; }
  .num { width: 22pt; color: #8a7350; text-align: right; }
  .name { width: 118pt; font-weight: bold; }
  .cost { width: 26pt; text-align: center; font-weight: bold; font-size: 10.5pt; }
  .type { width: 52pt; }
  .tags { width: 92pt; }
  .req { width: 92pt; font-size: 8.6pt; color: #7a2a1f; }
  .fp { width: 52pt; text-align: center; font-weight: bold; color: #7a1f22; font-size: 8.6pt; }
  .notes { width: 120pt; }
  .pill { display: inline-block; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .05em; padding: 0 4pt; border-radius: 6pt; color: #fff; }
  .t-project .pill { background: #3c7a4b; } .t-active .pill { background: #2f5d9b; } .t-event .pill { background: #a23b2e; }
  .pay { font-size: 7.6pt; color: #7a6650; font-weight: normal; }
  .act { margin-top: 1pt; }
  .act ul { margin: 1pt 0 0; padding-left: 12pt; }
  .flavor { font-style: italic; color: #6b5538; font-size: 8.4pt; margin-top: 1pt; }
  .attack { color: #a23b2e; font-weight: bold; }
</style></head><body>
<h1>Dueling Dukes — Card List</h1>
<div class="sub">All ${CARDS.length} project cards and ${D.HOUSES.length} noble houses, generated from the game’s own card data. The blank column is for your notes.</div>
<div class="summary">
  <div><b>Card types</b>${byType.project} Commissions · ${byType.active} Charters · ${byType.event} Events · ${CARDS.filter((c) => c.token).length} collect counters</div>
  <div><b>Cost</b>average ${avg} Gold · ${bands.map((b) => `${b.label}: ${b.n}`).join(' · ')}</div>
  <div><b>Tags (cards carrying each)</b>${D.TAGS.map((t) => `${D.TAG_NAME[t]} ${tagCount[t]}`).join(' · ')}</div>
  <div><b>Scoring cards</b>Power ${tracks.power} · Faith ${tracks.faith} · Wealth ${tracks.wealth} · Culture ${tracks.culture} cards raise tracks · ${rfCards} give Royal Favor · ${fpCards} carry Favor Points · ${attackCards} target rivals (marked <span class="attack">⚔</span>)</div>
</div>
<p class="key"><b>Paying for cards.</b> Every card costs Gold. Tags let goods help pay:
${Object.keys(D.TAG_PAY).map((t) => `${D.TAG_NAME[t]} — ${D.RES_SHORT[D.TAG_PAY[t].res]} worth ${D.TAG_PAY[t].value} Gold each`).join('; ')}.
<b>Commissions</b> are built once and stay in play; <b>Charters</b> give a lasting effect or a once-a-year action; <b>Events</b> happen once and their tags do not stay in play.
<b>Counters</b> (${D.TOKEN_IDS.map((t) => D.TOKENS[t].many).join(', ')}) collect on the cards that say so.
Cards are grouped by their first tag and listed alphabetically within each group.</p>
${groups.map((grp) => `
<h2>${groupName(grp.g)} (${grp.cards.length})</h2>
<table>
<thead><tr><th class="num">#</th><th>Card</th><th class="cost">Cost</th><th>Type</th><th>Tags</th><th>Requires</th><th>Effect</th><th class="fp">Favor Pts</th><th>Notes</th></tr></thead>
<tbody>${grp.cards.map((c) => row(c).replace('<td class="name">' + esc(c.name), '<td class="name">' + esc(c.name) + (attackSet.has(c.id) ? ' <span class="attack">⚔</span>' : ''))).join('')}</tbody>
</table>`).join('')}
<h2>Noble houses (${D.HOUSES.length})</h2>
<p class="key">Each duke is offered two houses at the start and keeps one.</p>
<table>
<thead><tr><th>House</th><th>Tags</th><th>Abilities</th><th>Notes</th></tr></thead>
<tbody>${houses}</tbody>
</table>
</body></html>`;

const htmlPath = resolve(outDir, 'card-list.html');
writeFileSync(htmlPath, html);
console.log('wrote', htmlPath);

try {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('file://' + htmlPath);
  const pdfPath = resolve(outDir, 'card-list.pdf');
  await page.pdf({
    path: pdfPath, format: 'Letter', landscape: true, printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: '<div style="font: 7.5pt Georgia, serif; color: #8a7350; width: 100%; text-align: center;">Dueling Dukes · card list · page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
  });
  await browser.close();
  console.log('wrote', pdfPath);
} catch (e) {
  console.log('PDF skipped (Playwright not available):', e.message.split('\n')[0]);
}
