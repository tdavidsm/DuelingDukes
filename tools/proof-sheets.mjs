// Prints the card proof sheets (tools/proof-sheets.html) to PDF with Playwright.
//   node tools/proof-sheets.mjs [out-folder] [--large] [--only changed] [--cards id,id]
// Serves the project folder itself on a free local port, so nothing else needs to be running.
// Writes card-proofs.pdf (real card size, 9 a sheet) or card-proofs-large.pdf (4 a sheet).

import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const large = args.includes('--large');
if (large) args.splice(args.indexOf('--large'), 1);
const only = flag('--only');
const cards = flag('--cards');
const outDir = resolve(args[0] || 'docs');
await mkdir(outDir, { recursive: true });

const root = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
const q = new URLSearchParams({ size: large ? 'large' : 'actual' });
if (only) q.set('only', only);
if (cards) q.set('cards', cards);
await page.goto(`http://127.0.0.1:${port}/tools/proof-sheets.html?${q}`);
await page.waitForSelector('body[data-ready]', { timeout: 120000 });
const { sheets, cut } = await page.evaluate(() => ({ sheets: document.querySelectorAll('.sheet').length, cut: +document.body.dataset.cut }));
const pdfPath = resolve(outDir, large ? 'card-proofs-large.pdf' : 'card-proofs.pdf');
await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
await browser.close();
server.close();
console.log(`wrote ${pdfPath}: ${sheets} pages${cut ? `, ${cut} card${cut === 1 ? '' : 's'} marked "cut off"` : ', nothing cut off'}`);
