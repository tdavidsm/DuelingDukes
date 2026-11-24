// Prints the card proof sheets (tools/proof-sheets.html) to PDF with Playwright.
//   node tools/proof-sheets.mjs [out-folder] [--large] [--only changed] [--cards id,id] [--vector] [--dpi 300]
// Serves the project folder itself on a free local port, so nothing else needs to be running.
// Writes card-proofs.pdf (real card size, 9 a sheet) or card-proofs-large.pdf (4 a sheet).
//
// By default each sheet is flattened into one 300 dpi picture and the PDF holds
// nothing but those pictures: no fonts, no transparency, nothing a printer has
// to interpret, so it prints on anything. (Browser-made PDFs are full of soft
// masks and transparency groups that some printers cannot handle, and print as
// pages of raw "dictionary" text instead.) --vector writes the browser's own PDF.

import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, normalize, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null; };
const bool = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const large = bool('--large');
const vector = bool('--vector');
const only = flag('--only');
const cards = flag('--cards');
const dpi = +(flag('--dpi') || 300);
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
// 96 CSS pixels to the inch: this scale makes each captured sheet `dpi` dots per inch.
const page = await browser.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: vector ? 1 : dpi / 96 });
const q = new URLSearchParams({ size: large ? 'large' : 'actual' });
if (only) q.set('only', only);
if (cards) q.set('cards', cards);
await page.emulateMedia({ media: 'print' });
await page.goto(`http://127.0.0.1:${port}/tools/proof-sheets.html?${q}`);
await page.waitForSelector('body[data-ready]', { timeout: 180000 });
const cut = await page.evaluate(() => +document.body.dataset.cut);
const pdfPath = resolve(outDir, large ? 'card-proofs-large.pdf' : 'card-proofs.pdf');
let pages;
if (vector) {
  await page.pdf({ path: pdfPath, format: 'Letter', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  pages = await page.evaluate(() => document.querySelectorAll('.sheet').length);
} else {
  const sheets = await page.$$('.sheet');
  const jpegs = [];
  for (const s of sheets) jpegs.push(await s.screenshot({ type: 'jpeg', quality: 88 }));
  await writeFile(pdfPath, imagePdf(jpegs, 612, 792));
  pages = jpegs.length;
}
await browser.close();
server.close();
console.log(`wrote ${pdfPath}: ${pages} pages${vector ? '' : ` at ${dpi} dpi`}${cut ? `, ${cut} card${cut === 1 ? '' : 's'} marked "cut off"` : ', nothing cut off'}`);

// A minimal PDF: one JPEG filling each page (sizes in points, 72 to the inch).
function imagePdf(images, w, h) {
  const parts = [];
  const offsets = [];
  let size = 0;
  const put = (chunk) => { const b = typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk; parts.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; put(`${n} 0 obj\n`); for (const c of [].concat(body)) put(c); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const pageIds = images.map((_, i) => 3 + i * 3);
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Count ${images.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`);
  images.forEach((jpg, i) => {
    const [pw, ph] = jpegSize(jpg);
    const id = pageIds[i];
    const draw = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
    obj(id + 1, [`<< /Type /XObject /Subtype /Image /Width ${pw} /Height ${ph} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`, jpg, '\nendstream']);
    obj(id + 2, `<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`);
  });
  const n = 3 + images.length * 3;
  const xref = size;
  put(`xref\n0 ${n}\n0000000000 65535 f \n`);
  for (let i = 1; i < n; i++) put(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  put(`trailer\n<< /Size ${n} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

// Width and height from a JPEG's start-of-frame marker.
function jpegSize(b) {
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error('not a JPEG');
}
