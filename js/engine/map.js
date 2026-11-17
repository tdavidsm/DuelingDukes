// Hex map: geometry (hexes, junctions, edges) and terrain generation.
// The map is a pure function of (seed, radius, style), so it is never sent
// over the network: every client rebuilds it locally.

import { makeRng } from './rng.js';

const SQ3 = Math.sqrt(3);

export const TERRAIN = {
  grass: { name: 'Grassland', res: 'food' },
  hill: { name: 'Hills', res: 'stone' },
  forest: { name: 'Forest', res: 'rm' },
  ore: { name: 'Ore Mountains', res: 'ore' },
  mountain: { name: 'Mountains', res: null },
  water: { name: 'Water', res: 'gold' },
};

const DIRS = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

function buildGrid(radius) {
  const hexes = [];
  const junctions = [];
  const edges = [];
  const jKey = new Map();
  const eKey = new Map();
  const hKey = new Map();
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      const id = hexes.length;
      const cx = SQ3 * (q + r / 2);
      const cy = 1.5 * r;
      const corners = [];
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i - 30);
        const x = cx + Math.cos(a);
        const y = cy + Math.sin(a);
        const k = Math.round(x * 100) + ',' + Math.round(y * 100);
        let j = jKey.get(k);
        if (j === undefined) {
          j = junctions.length;
          jKey.set(k, j);
          junctions.push({ id: j, x, y, hexes: [], adj: [], edges: [] });
        }
        junctions[j].hexes.push(id);
        corners.push(j);
      }
      const ring = (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
      hexes.push({ id, q, r, x: cx, y: cy, corners, ring, terrain: 'grass', bounty: null, neighbors: [] });
      hKey.set(q + ',' + r, id);
    }
  }
  for (const h of hexes) {
    for (const [dq, dr] of DIRS) {
      const n = hKey.get(h.q + dq + ',' + (h.r + dr));
      if (n !== undefined) h.neighbors.push(n);
    }
    for (let i = 0; i < 6; i++) {
      const a = h.corners[i];
      const b = h.corners[(i + 1) % 6];
      const k = a < b ? a + '-' + b : b + '-' + a;
      let e = eKey.get(k);
      if (e === undefined) {
        e = edges.length;
        eKey.set(k, e);
        edges.push({ id: e, a: Math.min(a, b), b: Math.max(a, b), hexes: [] });
        junctions[a].adj.push(b);
        junctions[b].adj.push(a);
        junctions[a].edges.push(e);
        junctions[b].edges.push(e);
      }
      edges[e].hexes.push(h.id);
    }
  }
  return { radius, hexes, junctions, edges, hKey };
}

const BOUNTIES = [
  { res: 'gold', n: 4 }, { res: 'stone', n: 2 }, { res: 'food', n: 2 },
  { res: 'ore', n: 2 }, { res: 'rm', n: 2 }, { res: 'card', n: 1 },
];

function assignTerrain(grid, rng, style) {
  const { hexes, radius } = grid;
  const N = hexes.length;
  const water = new Set();
  if (style === 'coast') {
    // One whole side of the board is open sea, with a ragged shoreline.
    const d = rng.int(6);
    const axis = (h) => {
      const s = -h.q - h.r;
      return [h.q, -h.r, s, -h.q, h.r, -s][d];
    };
    for (const h of hexes) {
      const a = axis(h);
      if (a >= radius) water.add(h.id);
      else if (a === radius - 1 && rng() < 0.35) water.add(h.id);
    }
  } else {
    // A lake in the heart of the kingdom.
    const centre = hexes.find((h) => h.q === 0 && h.r === 0);
    water.add(centre.id);
    const ring1 = centre.neighbors.slice();
    const start = rng.int(6);
    const extra = radius >= 5 ? 5 : radius >= 4 ? 3 : 2;
    for (let i = 0; i < extra; i++) water.add(ring1[(start + i) % 6]);
  }
  // Scattered ponds and tarns up to the water budget.
  const target = Math.round(N * (style === 'coast' ? 0.2 : 0.15));
  let guard = 0;
  while (water.size < target && guard++ < 500) {
    const h = rng.pick(hexes);
    if (water.has(h.id)) continue;
    if (h.neighbors.some((n) => water.has(n)) && rng() < 0.8) continue;
    water.add(h.id);
  }
  const land = hexes.filter((h) => !water.has(h.id));
  const L = land.length;
  const bag = [];
  const quota = [['grass', 0.3], ['forest', 0.24], ['hill', 0.19], ['ore', 0.13], ['mountain', 0.14]];
  for (const [t, f] of quota) for (let i = 0; i < Math.round(L * f); i++) bag.push(t);
  while (bag.length < L) bag.push('grass');
  rng.shuffle(bag);
  for (const h of hexes) h.terrain = 'water';
  land.forEach((h, i) => { h.terrain = bag[i]; });
  // Bounties: one-time rewards for the first settlement founded beside them.
  for (const h of land) {
    h.bounty = rng() < 0.2 ? { ...rng.pick(BOUNTIES) } : null;
  }
}

function waterBodies(grid) {
  const body = new Map();
  const sizes = [];
  for (const h of grid.hexes) {
    if (h.terrain !== 'water' || body.has(h.id)) continue;
    const idx = sizes.length;
    let size = 0;
    const stack = [h.id];
    body.set(h.id, idx);
    while (stack.length) {
      const cur = grid.hexes[stack.pop()];
      size++;
      for (const n of cur.neighbors) {
        if (grid.hexes[n].terrain === 'water' && !body.has(n)) {
          body.set(n, idx);
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  return { body, sizes };
}

function capitalCandidates(grid, rng) {
  const { body, sizes } = waterBodies(grid);
  const out = [];
  for (const j of grid.junctions) {
    const hs = j.hexes.map((h) => grid.hexes[h]);
    if (hs.length < 3) continue; // keep the royal seat off the very rim
    if (!hs.some((h) => h.terrain === 'water')) continue;
    if (!hs.some((h) => h.terrain === 'grass')) continue;
    const central = hs.some((h) => h.ring <= 1);
    const coastal = hs.some((h) => h.terrain === 'water' && sizes[body.get(h.id)] >= 4);
    if (!central && !coastal) continue;
    const dist = Math.hypot(j.x, j.y);
    out.push({ id: j.id, score: (central ? 0 : 2) + dist * 0.3 + rng() * 0.8 });
  }
  out.sort((a, b) => a.score - b.score);
  // Spread the proposals out a little: no two proposals on neighbouring junctions.
  const picked = [];
  for (const c of out) {
    if (picked.some((p) => grid.junctions[p].adj.includes(c.id))) continue;
    picked.push(c.id);
    if (picked.length >= 5) break;
  }
  return picked;
}

const cache = new Map();

export function genMap(seed, radius, style) {
  const key = seed + '|' + radius + '|' + style;
  if (cache.has(key)) return cache.get(key);
  let map = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = makeRng((seed | 0) + attempt * 7919);
    const grid = buildGrid(radius);
    let st = style;
    if (st !== 'lake' && st !== 'coast') st = rng() < 0.5 ? 'lake' : 'coast';
    assignTerrain(grid, rng, st);
    const cands = capitalCandidates(grid, rng);
    if (cands.length < 2) continue;
    for (const j of grid.junctions) {
      j.land = j.hexes.some((h) => grid.hexes[h].terrain !== 'water');
      j.yields = {};
      for (const h of j.hexes) {
        const res = TERRAIN[grid.hexes[h].terrain].res;
        if (res) j.yields[res] = (j.yields[res] || 0) + 1;
      }
      j.fortified = j.hexes.some((h) => grid.hexes[h].terrain === 'mountain');
    }
    for (const e of grid.edges) {
      e.passable = grid.junctions[e.a].land && grid.junctions[e.b].land;
    }
    grid.edgeOf = (a, b) => {
      for (const e of grid.junctions[a].edges) {
        const ed = grid.edges[e];
        if ((ed.a === a && ed.b === b) || (ed.a === b && ed.b === a)) return e;
      }
      return -1;
    };
    grid.style = st;
    grid.candidates = cands;
    map = grid;
    break;
  }
  if (!map) throw new Error('Could not generate a valid map');
  cache.set(key, map);
  return map;
}

export function radiusFor(nPlayers) {
  // 61 hexes for 2–3 dukes, 91 for 4–5.
  return nPlayers >= 4 ? 5 : 4;
}
