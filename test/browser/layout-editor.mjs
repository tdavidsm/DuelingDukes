// The card layout editor: drag and slide a card's layout, export the file,
// then load that file into the game and check the card is drawn with it.
//   node test/browser/layout-editor.mjs <screenshot dir>
import { chromium } from 'playwright';
const out = process.argv[2];
const base = 'http://localhost:8080';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.stack));
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
const fail = (msg) => { throw new Error(msg); };

await p.goto(base + '/tools/card-layout.html?card=market_hall');
await p.waitForSelector('body[data-ready]');
await p.waitForSelector('#big .card img');
await p.waitForFunction(() => document.querySelector('#big .card img').complete);
await p.screenshot({ path: out + '/layout-1-start.png' });

// Drag the tags badge 1.5em left and 1em down.
const px = await p.$eval('#big .card', (c) => parseFloat(getComputedStyle(c).fontSize));
const tags = await p.$('#big .card > .cf-tags');
const tb = await tags.boundingBox();
await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
await p.mouse.down();
await p.mouse.move(tb.x + tb.width / 2 - 1.5 * px, tb.y + tb.height / 2 + px, { steps: 6 });
await p.mouse.up();
// Drag the picture's bottom edge up by 2em.
const art = await (await p.$('#big .cf-art')).boundingBox();
await p.mouse.move(art.x + art.width / 2, art.y + art.height - 4);
await p.mouse.down();
await p.mouse.move(art.x + art.width / 2, art.y + art.height - 4 - 2 * px, { steps: 6 });
await p.mouse.up();
// Zoom the picture with the wheel, then pan it.
await p.mouse.move(art.x + art.width / 2, art.y + art.height / 3);
for (let i = 0; i < 5; i++) await p.mouse.wheel(0, -100);
await p.mouse.down();
await p.mouse.move(art.x + art.width / 2 + 40, art.y + art.height / 3, { steps: 4 });
await p.mouse.up();
// Narrow the rules text and make it bigger with the sliders.
const setSlider = (path, v) => p.$eval(`.ed-row[data-path="${path}"] input`, (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const parts = await p.$$eval('.ed-row[data-path]', (rows) => rows.map((r) => r.dataset.path));
const textPart = ['words.width', 'explain.width', 'icons.width'].find((x) => parts.includes(x));
await setSlider(textPart, 70);
await setSlider('title.size', 0.9);
await p.waitForTimeout(200);
const draft = await p.evaluate(() => JSON.parse(localStorage.getItem('duelingdukes.layoutDrafts')).market_hall);
console.log('draft', JSON.stringify(draft));
if (!draft || !draft.badges || !draft.badges.tags || draft.badges.tags[0] > -1.3 || draft.badges.tags[1] < 0.8) fail('tags were not dragged');
if (!draft.art || !(draft.art.h > 0) || !(draft.art.zoom > 1) || draft.art.x === undefined) fail('picture was not resized, zoomed and panned');
if (getComputed(draft, textPart) !== 70) fail('width slider not saved');
await p.screenshot({ path: out + '/layout-2-edited.png' });
const fit = await p.textContent('#fit');
console.log('fit:', fit);

// The list marks the card unsaved; the save dialog holds the merged file.
if (!(await p.$('.ed-item[data-id="market_hall"] .mk.draft'))) fail('list does not mark the card unsaved');
await p.click('#btn-save');
await p.waitForSelector('#layout-json');
const json = await p.$eval('#layout-json', (t) => t.value);
const href = await p.$eval('#btn-github', (a) => a.href);
await p.screenshot({ path: out + '/layout-3-save.png' });
const file = JSON.parse(json);
console.log('github link:', href);
if (!file.cards.market_hall) fail('saved file is missing the card');

// Reloading keeps the draft.
await p.reload();
await p.waitForSelector('body[data-ready]');
if (!(await p.$('.ed-item[data-id="market_hall"] .mk.draft'))) fail('draft lost on reload');

// The game draws the card with the saved file.
const g = await ctx.newPage();
g.on('pageerror', (e) => errs.push('GAME PAGEERROR: ' + e.stack));
await g.route('**/art/cards/layouts.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: json }));
await g.goto(base + '/tools/card-preview.html?only=cards&cards=market_hall,granary&extra=granary');
await g.waitForSelector('body[data-ready]');
const styles = await g.$eval('.card[data-card="market_hall"]', (c) => ({
  tuned: c.classList.contains('cf-tuned'),
  tags: c.querySelector(':scope > .cf-tags').style.translate,
  art: c.querySelector('.cf-art').style.flex,
  zoom: c.querySelector('.cf-art img').style.transform,
}));
const plain = await g.$eval('.card[data-card="granary"]', (c) => c.classList.contains('cf-tuned'));
console.log('in game', JSON.stringify(styles), 'untouched card tuned:', plain);
if (!styles.tuned || !styles.tags || !styles.art.startsWith('0 0') || !styles.zoom.startsWith('scale')) fail('game did not apply the layout');
if (plain) fail('a card without a layout was changed');
await g.screenshot({ path: out + '/layout-4-in-game.png' });

// Move a card's flavour text freely: lift it out, drag it onto the picture, give it a backing.
const flav = await p.evaluate(async () => {
  const { CARDS } = await import('/js/engine/cards.js');
  const { hasArt } = await import('/js/ui/cardview.js');
  return CARDS.find((c) => c.flavor && hasArt(c.id) && c.id !== 'market_hall').id;
});
await p.goto(base + '/tools/card-layout.html?card=' + flav);
await p.waitForSelector('body[data-ready]');
const before = await p.$eval('#big .cf-body > .cf-flavor', (n) => n.getBoundingClientRect().top);
await p.click('[data-check="flavor.pos"]');
await p.waitForSelector('#big [data-float="flavor"]');
const lifted = await p.$eval('#big [data-float="flavor"]', (n) => n.getBoundingClientRect().top);
if (Math.abs(lifted - before) > 2) fail(`ticking "move freely" moved the flavour text (${before} -> ${lifted})`);
const fb = await (await p.$('#big [data-float="flavor"]')).boundingBox();
const artBox = await (await p.$('#big .cf-art')).boundingBox();
await p.mouse.move(fb.x + 10, fb.y + fb.height / 2);
await p.mouse.down();
await p.mouse.move(fb.x + 10, artBox.y + artBox.height - fb.height - 24 + fb.height / 2, { steps: 8 });
await p.mouse.up();
await p.click('[data-check="flavor.back"]');
await p.waitForTimeout(200);
const fd = await p.evaluate((id) => JSON.parse(localStorage.getItem('duelingdukes.layoutDrafts'))[id], flav);
console.log('flavour draft', JSON.stringify(fd));
if (!fd.flavor || !Array.isArray(fd.flavor.pos) || !fd.flavor.back || !(fd.flavor.w > 0)) fail('flavour text was not placed');
const onArt = await p.evaluate(() => {
  const f = document.querySelector('#big [data-float="flavor"]').getBoundingClientRect();
  const a = document.querySelector('#big .cf-art').getBoundingClientRect();
  return f.top >= a.top && f.bottom <= a.bottom + 1;
});
if (!onArt) { await p.screenshot({ path: out + "/layout-5-flavour-fail.png" }); console.log("rects", JSON.stringify(await p.evaluate(() => [document.querySelector("#big [data-float=flavor]").getBoundingClientRect(), document.querySelector("#big .cf-art").getBoundingClientRect()]))); fail("flavour text did not land on the picture"); }
await p.screenshot({ path: out + '/layout-5-flavour.png' });
console.log('fit:', await p.textContent('#fit'));
await p.click('#btn-save');
const json2 = await p.$eval('#layout-json', (t) => t.value);
await p.click('.modal .x');
const g2 = await ctx.newPage();
await g2.route('**/art/cards/layouts.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: json2 }));
await g2.goto(base + `/tools/card-preview.html?only=cards&cards=${flav}&extra=granary`);
await g2.waitForSelector('body[data-ready]');
const inGame = await g2.$eval(`.card[data-card="${flav}"]`, (c) => {
  const f = c.querySelector('.cf-frame > [data-float="flavor"]');
  return f && { backed: f.classList.contains('cf-backed'), text: f.textContent.slice(0, 30), inBody: !!c.querySelector('.cf-body .cf-flavor') };
});
console.log('flavour in game', JSON.stringify(inGame));
if (!inGame || !inGame.backed || inGame.inBody) fail('the game did not place the flavour text');
await g2.screenshot({ path: out + '/layout-6-flavour-game.png' });

// Edit the wording: new flavour text with an icon, shorter rules text, and an action in words.
const actCard = await p.evaluate(async () => {
  const { CARDS } = await import('/js/engine/cards.js');
  return CARDS.find((c) => c.act && !Array.isArray(c.act) && !c.flavor).id;
});
await p.goto(base + '/tools/card-layout.html?card=' + actCard);
await p.waitForSelector('body[data-ready]');
if (await p.$('#big .cf-flavor')) fail('card was expected to have no flavour text yet');
await p.fill('textarea[data-text="flavor"]', 'Gold flows where the river bends.');
await p.click('textarea[data-text="flavor"]');
await p.keyboard.press('End');
await p.click('.ed-icons button[title="{gold}"]');
await p.fill('textarea[data-text="actions.0"]', 'Pay {gold}, take what you need.');
await p.waitForTimeout(200);
const wording = await p.evaluate(() => ({
  flavour: document.querySelector('#big .cf-flavor')?.innerHTML,
  action: document.querySelector('#big .cf-actions .cf-act-words')?.textContent,
}));
console.log('wording', JSON.stringify(wording));
if (!wording.flavour || !wording.flavour.includes("river bends") || !/ico/.test(wording.flavour)) fail("flavour text with an icon was not drawn");
if (!wording.action || !wording.action.includes('take what you need')) fail('action wording was not drawn');
// The flavour group appears for the newly added text, so it can be moved too.
if (!(await p.$('[data-check="flavor.pos"]'))) fail('added flavour text has no layout controls');
// Back to the game's wording.
await p.fill('textarea[data-text="actions.0"]', '');
await p.click('.ed-text:has(textarea[data-text="flavor"]) .rs');
await p.waitForTimeout(200);
if (await p.$('#big .cf-flavor')) fail('resetting the flavour did not remove it');
const textDraft = await p.evaluate((id) => (JSON.parse(localStorage.getItem('duelingdukes.layoutDrafts'))[id] || null), actCard);
console.log('after reset', JSON.stringify(textDraft));
if (textDraft) fail('reset text left a draft behind');
await p.screenshot({ path: out + '/layout-7-text.png' });

// Reset the card to automatic and discard.
await p.click('.ed-item[data-id="market_hall"]');
await p.click('#btn-reset-card');
const after = await p.evaluate(() => localStorage.getItem('duelingdukes.layoutDrafts'));
console.log('after reset:', after);
console.log(errs.join('\n') || 'no console errors');
await b.close();

function getComputed(d, path) { return path.split('.').reduce((o, k) => (o ? o[k] : undefined), d); }
