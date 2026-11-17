// Generates flavor art for every card and house in one run, with Google's
// Gemini image models ("Nano Banana"), instead of prompting one image at a time.
//
//   export GEMINI_API_KEY=...            # from https://aistudio.google.com/apikey
//   node tools/art/generate-art.mjs --dry-run        # write the prompts only, to review
//   node tools/art/generate-art.mjs --only stone_quarry,tavern   # try a few first
//   node tools/art/generate-art.mjs                  # everything not yet drawn
//
// Options:
//   --dry-run          write tools/art/prompts.json and stop; no API calls, no cost
//   --only a,b,c       only these card ids (or house ids)
//   --limit N          stop after N new images
//   --redo             redraw images that already exist
//   --model NAME       image model to use (default: picked automatically, see below)
//   --size 1K|2K       image size, if the model supports it (default 1K)
//   --concurrency N    parallel requests (default 3)
//   --out DIR          where images go (default art/cards)
//
// Prompts are built from each card's name, type, tags, rules text and flavor
// line, plus the shared style in style.txt. To steer one card, give it its
// own scene in subjects.json ({ "card_id": "what to paint" }). For a
// consistent look, put one to three images you like in tools/art/style/;
// they are sent with every request as style references.
//
// The run is resumable: existing images are skipped, so after a failure or a
// rate limit just run it again.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from '../../js/engine/cards.js';
import * as D from '../../js/engine/data.js';
import { describeCard, describeHouse, plain } from '../../js/engine/describe.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const API = (process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');

const args = process.argv.slice(2);
const flag = (name) => args.includes('--' + name);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const dryRun = flag('dry-run');
const redo = flag('redo');
const only = opt('only', '') ? new Set(opt('only', '').split(',').map((s) => s.trim())) : null;
const limit = +opt('limit', 0) || Infinity;
const size = opt('size', '1K');
const concurrency = Math.max(1, +opt('concurrency', 3));
const outDir = resolve(ROOT, opt('out', 'art/cards'));

const readJson = (p, dflt) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : dflt);
const style = readFileSync(resolve(HERE, 'style.txt'), 'utf8').trim();
const subjects = readJson(resolve(HERE, 'subjects.json'), {});

const TYPE_HINT = {
  project: 'It shows something the duke builds or establishes, as a lasting part of the duchy.',
  active: 'It shows an ongoing institution, privilege or practice of the duchy.',
  event: 'It shows a single dramatic moment as it happens.',
};

function cardPrompt(card) {
  const d = describeCard(card);
  const rules = [...d.lines, d.action ? 'Once a year: ' + d.action : null].filter(Boolean).map((l) => plain(l)).join('; ');
  const scene = subjects[card.id]
    ? `Scene to paint: ${subjects[card.id]}`
    : `Paint a scene that captures "${card.name}" in a small medieval kingdom. ${TYPE_HINT[card.type]} `
      + `Themes: ${card.tags.map((t) => D.TAG_NAME[t]).join(', ') || 'the realm'}. `
      + `For context, what the card does in the game (do not depict this literally or as text): ${rules}.`
      + (card.flavor ? ` Its flavor line, to set the mood: "${card.flavor}"` : '');
  return `${style}\n\n${scene}`;
}

function housePrompt(house) {
  const d = describeHouse(house);
  const scene = subjects[house.id]
    ? `Scene to paint: ${subjects[house.id]}`
    : `Paint a portrait-like scene of a noble ducal family, ${house.name}, known as "${house.motto}", `
      + `shown at the heart of what they are known for. Their strengths in the game, for context only: ${d.lines.slice(1).map(plain).join('; ') || 'versatility'}.`;
  return `${style}\n\n${scene}`;
}

const allJobs = [
  ...CARDS.map((c) => ({ id: c.id, name: c.name, prompt: cardPrompt(c) })),
  ...D.HOUSES.map((h) => ({ id: h.id, name: h.name, prompt: housePrompt(h) })),
];
const jobs = allJobs.filter((j) => !only || only.has(j.id));
if (only && jobs.length < only.size) {
  const known = new Set(allJobs.map((j) => j.id));
  console.error('Unknown id(s): ' + [...only].filter((id) => !known.has(id)).join(', ') + ' (ids are listed in tools/art/prompts.json)');
  process.exit(1);
}

writeFileSync(resolve(HERE, 'prompts.json'), JSON.stringify(Object.fromEntries(allJobs.map((j) => [j.id, j.prompt])), null, 2) + '\n');
console.log(`${allJobs.length} prompts written to tools/art/prompts.json`);
if (dryRun) process.exit(0);

const key = process.env.GEMINI_API_KEY;
if (!key) {
  console.error('Set GEMINI_API_KEY first (create one at https://aistudio.google.com/apikey).');
  process.exit(1);
}

async function api(path, body) {
  const res = await fetch(`${API}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(`${res.status} ${json?.error?.message || text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

// Pick an image model: --model if given, otherwise the newest "flash" image
// model the key can use (cheapest), falling back to any image model.
async function chooseModel() {
  if (opt('model')) return opt('model').replace(/^models\//, '');
  const names = [];
  let pageToken = '';
  do {
    const page = await api(`models?pageSize=200${pageToken ? '&pageToken=' + pageToken : ''}`);
    for (const m of page.models || []) {
      if ((m.supportedGenerationMethods || []).includes('generateContent') && /image/i.test(m.name) && !/imagen/i.test(m.name)) names.push(m.name.replace(/^models\//, ''));
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  if (!names.length) throw new Error('No Gemini image models are available to this API key. Pass one with --model.');
  const score = (n) => (/flash/i.test(n) ? 100 : 0) + (/preview|exp/i.test(n) ? -5 : 0) + (parseFloat((n.match(/(\d+(?:\.\d+)?)/) || [0, 0])[1]) || 0);
  names.sort((a, b) => score(b) - score(a));
  console.log('Image models available:', names.join(', '));
  return names[0];
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
const styleDir = resolve(HERE, 'style');
const refs = existsSync(styleDir)
  ? readdirSync(styleDir).filter((f) => MIME[extname(f).toLowerCase()]).slice(0, 3)
    .map((f) => ({ inlineData: { mimeType: MIME[extname(f).toLowerCase()], data: readFileSync(resolve(styleDir, f)).toString('base64') } }))
  : [];

async function draw(model, job) {
  const parts = [{ text: job.prompt + (refs.length ? '\n\nMatch the painting style, palette and level of detail of the reference image(s), but not their subject.' : '') }, ...refs];
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '4:3', imageSize: size } },
  };
  let res;
  try {
    res = await api(`models/${model}:generateContent`, body);
  } catch (e) {
    // Older models reject imageSize; retry once without it.
    if (e.status === 400 && /imageSize|image_size/i.test(e.message)) {
      delete body.generationConfig.imageConfig.imageSize;
      res = await api(`models/${model}:generateContent`, body);
    } else throw e;
  }
  const outParts = res?.candidates?.[0]?.content?.parts || [];
  const img = outParts.map((p) => p.inlineData || p.inline_data).find(Boolean);
  if (!img) {
    const why = res?.candidates?.[0]?.finishReason || res?.promptFeedback?.blockReason || 'no image returned';
    throw new Error(why);
  }
  const ext = (img.mimeType || img.mime_type || 'image/png').includes('jpeg') ? '.jpg' : '.png';
  writeFileSync(resolve(outDir, job.id + ext), Buffer.from(img.data, 'base64'));
}

const exists = (id) => ['.png', '.jpg', '.webp'].some((e) => existsSync(resolve(outDir, id + e)));

mkdirSync(outDir, { recursive: true });
let model;
try {
  model = await chooseModel();
} catch (e) {
  console.error(e.status === 400 || e.status === 401 || e.status === 403
    ? `The API refused the key (${e.message}). Check GEMINI_API_KEY.`
    : `Could not list the available models: ${e.message}`);
  process.exit(1);
}
const todo = jobs.filter((j) => redo || !exists(j.id)).slice(0, limit);
console.log(`Model ${model}. ${todo.length} image(s) to draw${refs.length ? `, with ${refs.length} style reference(s)` : ''}. Output: ${outDir}`);

let done = 0;
const failed = [];
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const job = queue.shift();
    for (let attempt = 1; ; attempt++) {
      try {
        await draw(model, job);
        done++;
        console.log(`[${done}/${todo.length}] ${job.name}`);
        break;
      } catch (e) {
        const retry = (e.status === 429 || e.status >= 500 || !e.status) && attempt < 5;
        if (!retry) { failed.push(`${job.id}: ${e.message}`); console.log(`FAILED ${job.name}: ${e.message}`); break; }
        const wait = Math.min(60, 4 * 2 ** attempt);
        console.log(`  ${job.name}: ${e.message} — retrying in ${wait}s`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
    }
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));
console.log(`Done: ${done} drawn, ${failed.length} failed.`);
if (failed.length) {
  console.log(failed.join('\n'));
  console.log('Run the same command again to retry the failures; finished images are kept.');
  process.exit(1);
}
