// The 3D kingdom: hex tiles, towns, roads and unit pieces, drawn with three.js.
// It knows nothing about rules: game.js hands it a view to draw and a set of
// things to highlight, and it reports what the player clicks.

import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';
import { svgString } from './dom.js';

const TOP = 0.1; // height of the land surface
const TERRAIN_COLOR = {
  grass: 0x93bf58, forest: 0x5d994b, hill: 0xb9a66b, ore: 0x8d8781, mountain: 0xa1a7ac, water: 0x3a80c2,
};

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.02, ...opts }));
  }
  return matCache.get(key);
}

const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const box = (w, hh, d) => geo(`b${w},${hh},${d}`, () => new THREE.BoxGeometry(w, hh, d));
const cyl = (rt, rb, hh, seg = 12) => geo(`c${rt},${rb},${hh},${seg}`, () => new THREE.CylinderGeometry(rt, rb, hh, seg));
const cone = (r, hh, seg = 8) => geo(`k${r},${hh},${seg}`, () => new THREE.ConeGeometry(r, hh, seg));
const sphere = (r) => geo(`s${r}`, () => new THREE.SphereGeometry(r, 12, 10));

function mesh(g, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

function rand(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

const STONE = 0xd9d2c0;
const ROOF_NEUTRAL = 0x6b4a32;

function house(color, w = 0.15, x = 0, z = 0, rot = 0) {
  const g = new THREE.Group();
  g.add(mesh(box(w, w * 0.75, w * 0.9), mat(0xf1e6cc), 0, w * 0.375, 0));
  const roof = mesh(cone(w * 0.78, w * 0.6, 4), mat(color), 0, w * 0.75 + w * 0.3, 0);
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  return g;
}

function tower(color, r, hh, x, z, wall = STONE) {
  const g = new THREE.Group();
  g.add(mesh(cyl(r, r * 1.08, hh, 10), mat(wall), 0, hh / 2, 0));
  g.add(mesh(cone(r * 1.35, r * 2.2, 10), mat(color), 0, hh + r * 1.1, 0));
  g.position.set(x, 0, z);
  return g;
}

function flag(color, hh) {
  const g = new THREE.Group();
  g.add(mesh(cyl(0.012, 0.012, hh, 6), mat(0x3b2a1a), 0, hh / 2, 0));
  g.add(mesh(box(0.16, 0.1, 0.012), mat(color, { emissive: color, emissiveIntensity: 0.15 }), 0.085, hh - 0.06, 0));
  return g;
}

function settlementModel(type, color, church) {
  const g = new THREE.Group();
  const baseR = type === 'town' ? 0.27 : type === 'city' ? 0.34 : 0.4;
  g.add(mesh(cyl(baseR, baseR + 0.02, 0.04, 24), mat(color), 0, 0.02, 0));
  const y = 0.04;
  const b = new THREE.Group();
  b.position.y = y;
  if (type === 'town') {
    b.add(house(color, 0.16, -0.07, 0.05, 0.3));
    b.add(house(color, 0.13, 0.1, -0.06, -0.5));
  } else if (type === 'city') {
    b.add(house(color, 0.16, -0.14, 0.08, 0.2));
    b.add(house(color, 0.14, 0.13, 0.12, -0.4));
    b.add(house(color, 0.14, -0.05, -0.16, 0.9));
    b.add(tower(color, 0.06, 0.3, 0.1, -0.08));
  } else {
    // duchy capital: a walled keep under the duke's banner
    b.add(mesh(box(0.32, 0.2, 0.32), mat(STONE), 0, 0.1, 0));
    b.add(mesh(box(0.2, 0.16, 0.2), mat(0xcfc7b2), 0, 0.28, 0));
    for (const [x, z] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) b.add(tower(color, 0.055, 0.3, x, z));
    const f = flag(color, 0.36);
    f.position.set(0, 0.36, 0);
    b.add(f);
  }
  if (church) {
    const c = new THREE.Group();
    const s = church === 2 ? 1.35 : 1;
    c.add(mesh(box(0.1 * s, 0.1 * s, 0.16 * s), mat(0xf7f3ea), 0, 0.05 * s, 0));
    c.add(mesh(cone(0.085 * s, 0.07 * s, 4), mat(0x55606e), 0, 0.135 * s, 0));
    c.add(tower(0x55606e, 0.03 * s, 0.24 * s, 0, 0.1 * s, 0xf7f3ea));
    if (church === 2) c.add(tower(0x55606e, 0.03 * s, 0.24 * s, 0.07 * s, 0.1 * s, 0xf7f3ea));
    const cross = mat(0xe9b93a, { emissive: 0xe9b93a, emissiveIntensity: 0.4 });
    c.add(mesh(box(0.012, 0.09, 0.012), cross, 0, 0.42 * s, 0.1 * s));
    c.add(mesh(box(0.05, 0.012, 0.012), cross, 0, 0.43 * s, 0.1 * s));
    c.position.set(baseR - 0.02, y, -baseR + 0.04);
    g.add(c);
  }
  g.add(b);
  return g;
}

function kingdomCapitalModel() {
  const g = new THREE.Group();
  const gold = 0xe2b33c;
  g.add(mesh(cyl(0.5, 0.53, 0.05, 32), mat(gold, { metalness: 0.5, roughness: 0.4 }), 0, 0.025, 0));
  const b = new THREE.Group();
  b.position.y = 0.05;
  b.add(mesh(box(0.5, 0.22, 0.5), mat(0xf4efe2), 0, 0.11, 0));
  b.add(mesh(box(0.3, 0.2, 0.3), mat(0xe9e2d0), 0, 0.32, 0));
  for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) b.add(tower(0x6a3fa0, 0.07, 0.36, x, z, 0xf4efe2));
  b.add(tower(gold, 0.09, 0.62, 0, 0, 0xf4efe2));
  const f = flag(0x6a3fa0, 0.3);
  f.position.set(0, 0.82, 0);
  b.add(f);
  g.add(b);
  return g;
}

function unitModel(type, color) {
  const g = new THREE.Group();
  const rim = mat(0x1d1611);
  g.add(mesh(cyl(0.15, 0.16, 0.035, 20), rim, 0, 0.0175, 0));
  g.add(mesh(cyl(0.13, 0.13, 0.04, 20), mat(color), 0, 0.022, 0));
  const y = 0.04;
  const skin = mat(0xe8c39e);
  if (type === 'settlers') {
    g.add(mesh(box(0.2, 0.05, 0.11), mat(0x7a5230), 0, y + 0.05, 0));
    const cover = mesh(cyl(0.065, 0.065, 0.18, 12), mat(0xf6f0de), 0, y + 0.1, 0);
    cover.rotation.z = Math.PI / 2;
    g.add(cover);
    const band = mesh(cyl(0.068, 0.068, 0.04, 12), mat(color), 0, y + 0.1, 0);
    band.rotation.z = Math.PI / 2;
    g.add(band);
    for (const x of [-0.07, 0.07]) for (const z of [-0.065, 0.065]) {
      const w = mesh(cyl(0.032, 0.032, 0.015, 10), rim, x, y + 0.032, z);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
  } else if (type === 'caravan') {
    g.add(mesh(box(0.22, 0.04, 0.12), mat(0x7a5230), 0, y + 0.05, 0));
    g.add(mesh(box(0.08, 0.07, 0.09), mat(0xd9a441), -0.06, y + 0.105, 0));
    g.add(mesh(box(0.07, 0.09, 0.08), mat(0x9b59d0), 0.03, y + 0.115, 0));
    for (const x of [-0.07, 0.07]) for (const z of [-0.07, 0.07]) {
      const w = mesh(cyl(0.032, 0.032, 0.015, 10), rim, x, y + 0.032, z);
      w.rotation.x = Math.PI / 2;
      g.add(w);
    }
    const f = flag(color, 0.22);
    f.position.set(0.09, y + 0.06, 0);
    f.scale.setScalar(0.8);
    g.add(f);
  } else if (type === 'soldiers') {
    for (const [x, z] of [[-0.05, 0.03], [0.05, 0.03], [0, -0.05]]) {
      g.add(mesh(cyl(0.032, 0.038, 0.13, 8), mat(color), x, y + 0.065, z));
      g.add(mesh(sphere(0.03), skin, x, y + 0.155, z));
      g.add(mesh(cone(0.034, 0.03, 8), mat(0x9aa0a6, { metalness: 0.6, roughness: 0.4 }), x, y + 0.185, z));
      g.add(mesh(cyl(0.006, 0.006, 0.26, 5), mat(0x3b2a1a), x + 0.035, y + 0.13, z));
    }
  } else {
    // knights: a mounted rider with a lance
    g.add(mesh(box(0.2, 0.08, 0.07), mat(0x4a3526), 0, y + 0.1, 0));
    g.add(mesh(box(0.05, 0.11, 0.06), mat(0x4a3526), 0.1, y + 0.16, 0));
    g.add(mesh(box(0.09, 0.045, 0.05), mat(0x4a3526), 0.14, y + 0.215, 0));
    for (const x of [-0.07, 0.07]) g.add(mesh(box(0.03, 0.07, 0.06), mat(0x3a2a1e), x, y + 0.035, 0));
    g.add(mesh(box(0.14, 0.05, 0.085), mat(color), -0.01, y + 0.12, 0));
    g.add(mesh(cyl(0.035, 0.04, 0.12, 8), mat(0xb8bec4, { metalness: 0.7, roughness: 0.35 }), -0.01, y + 0.2, 0));
    g.add(mesh(sphere(0.034), mat(0xb8bec4, { metalness: 0.7, roughness: 0.35 }), -0.01, y + 0.285, 0));
    const plume = mesh(cone(0.02, 0.06, 6), mat(color), -0.01, y + 0.34, 0);
    g.add(plume);
    const lance = mesh(cyl(0.007, 0.007, 0.42, 5), mat(0xe2b33c), 0.06, y + 0.3, 0.05);
    lance.rotation.z = -0.5;
    g.add(lance);
  }
  g.scale.setScalar(1.3);
  return g;
}

function bountySprite(b) {
  const size = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fillStyle = '#f6ecd2';
    ctx.fill();
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#6b4a22';
    ctx.stroke();
    ctx.fillStyle = '#2b1d10';
    ctx.font = 'bold 54px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(b.n), 40, 68);
    if (img) ctx.drawImage(img, 60, 36, 56, 56);
    tex.needsUpdate = true;
  };
  draw(null);
  const img = new Image();
  img.onload = () => draw(img);
  img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgString(b.res).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" '));
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.setScalar(0.52);
  sp.renderOrder = 5;
  return sp;
}

const HL_COLOR = { place: 0xffd75e, move: 0xfff3c4, attack: 0xff5a4a, select: 0xffffff, target: 0xffd75e, vote: 0xc79bff };

export class Board {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.append(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16110d);
    this.scene.fog = new THREE.Fog(0x16110d, 30, 70);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = 1.3;
    this.controls.minDistance = 3.5;
    this.controls.maxDistance = 42;
    this.controls.screenSpacePanning = false;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };

    this.scene.add(new THREE.HemisphereLight(0xfff3dc, 0x4a5563, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
    this.sun.position.set(7, 14, 5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun);

    this.groups = {};
    for (const name of ['tiles', 'bounties', 'roads', 'settlements', 'units', 'highlights']) {
      this.groups[name] = new THREE.Group();
      this.scene.add(this.groups[name]);
    }
    this.unitMeshes = new Map();
    this.bountySprites = new Map();
    this.bountyMap = null;
    this.hlPicks = [];
    this.pulsing = [];
    this.waterTiles = [];
    this.raycaster = new THREE.Raycaster();
    this.onPick = null;
    this.onHover = null;
    this.map = null;

    const el = this.renderer.domElement;
    let down = null;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved < 6 && e.button === 0 && this.onPick) this.onPick(this.pickAt(e.clientX, e.clientY));
    });
    el.addEventListener('pointermove', (e) => {
      if (down || !this.onHover || e.pointerType === 'touch') return;
      this.onHover(this.pickAt(e.clientX, e.clientY, true), e.clientX, e.clientY);
    });
    el.addEventListener('pointerleave', () => { if (this.onHover) this.onHover(null, 0, 0); });
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    this.inset = { top: 0, bottom: 0 };
    this.resize = this.resize.bind(this);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(container);
    this.resize();
    this.clock = new THREE.Clock();
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      requestAnimationFrame(loop);
      this.frame();
    };
    loop();
  }

  dispose() {
    this.running = false;
    this.ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || 800;
    const hh = this.container.clientHeight || 600;
    this.renderer.setSize(w, hh);
    this.camera.aspect = w / hh;
    // Keep the kingdom centred in the part of the screen the panels leave free.
    const shift = Math.round(((this.inset.bottom || 0) - (this.inset.top || 0)) / 2);
    if (shift) this.camera.setViewOffset(w, hh, 0, shift, w, hh);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
  }

  setInset(top, bottom) {
    if (this.inset.top === top && this.inset.bottom === bottom) return;
    this.inset = { top, bottom };
    this.resize();
  }

  frame() {
    const t = this.clock.getElapsedTime();
    this.controls.update();
    const s = 1 + 0.13 * Math.sin(t * 4.5);
    for (const o of this.pulsing) o.scale.set(s, s, s);
    for (const w of this.waterTiles) w.position.y = w.userData.baseY + 0.012 * Math.sin(t * 1.3 + w.userData.phase);
    for (const m of this.unitMeshes.values()) {
      if (m.userData.target) m.position.lerp(m.userData.target, 0.16);
    }
    this.renderer.render(this.scene, this.camera);
  }

  jpos(j, y = TOP) {
    const J = this.map.junctions[j];
    return new THREE.Vector3(J.x, y, J.y);
  }

  setMap(map) {
    if (this.map === map) return;
    this.map = map;
    const g = this.groups.tiles;
    g.clear();
    this.waterTiles = [];
    this.tilePicks = [];
    const R = map.radius;
    const base = mesh(cyl(R * 1.78 + 1.6, R * 1.78 + 1.75, 0.3, 6), mat(0x3b2a1b, { roughness: 0.7 }), 0, -0.2, 0);
    base.rotation.y = Math.PI / 6;
    base.castShadow = false;
    g.add(base);
    const felt = mesh(cyl(R * 1.78 + 1.35, R * 1.78 + 1.35, 0.02, 6), mat(0x24384a), 0, -0.045, 0);
    felt.rotation.y = Math.PI / 6;
    felt.castShadow = false;
    g.add(felt);
    const table = mesh(cyl(60, 60, 0.1, 40), mat(0x1c1510, { roughness: 1 }), 0, -0.42, 0);
    table.castShadow = false;
    g.add(table);

    for (const hx of map.hexes) {
      const rnd = rand(hx.id + 11);
      const water = hx.terrain === 'water';
      const hh = water ? 0.1 : 0.2;
      const color = new THREE.Color(TERRAIN_COLOR[hx.terrain]).offsetHSL(0, 0, (rnd() - 0.5) * 0.05);
      const m = new THREE.MeshStandardMaterial({
        color, roughness: water ? 0.25 : 0.9, metalness: water ? 0.15 : 0, transparent: water, opacity: water ? 0.93 : 1,
      });
      const tile = new THREE.Mesh(cyl(0.965, 0.965, hh, 6), m);
      tile.position.set(hx.x, water ? -0.03 : 0, hx.y);
      tile.receiveShadow = true;
      tile.castShadow = !water;
      tile.userData.pick = { kind: 'hex', id: hx.id };
      g.add(tile);
      this.tilePicks.push(tile);
      if (water) {
        tile.userData.baseY = -0.03;
        tile.userData.phase = rnd() * 6;
        this.waterTiles.push(tile);
        continue;
      }
      const deco = new THREE.Group();
      deco.position.set(hx.x, TOP, hx.y);
      const spot = (rMax) => {
        const a = rnd() * Math.PI * 2;
        const r = Math.sqrt(rnd()) * rMax;
        return [Math.cos(a) * r, Math.sin(a) * r];
      };
      if (hx.terrain === 'forest') {
        for (let i = 0; i < 9; i++) {
          const [x, z] = spot(0.56);
          const s = 0.75 + rnd() * 0.6;
          deco.add(mesh(cyl(0.022, 0.028, 0.1, 5), mat(0x5b3d24), x, 0.05, z));
          const top = mesh(cone(0.1 * s, 0.3 * s, 7), mat(rnd() < 0.5 ? 0x2f6f3c : 0x3d8548), x, 0.1 + 0.15 * s, z);
          deco.add(top);
        }
      } else if (hx.terrain === 'hill') {
        for (let i = 0; i < 3; i++) {
          const [x, z] = spot(0.38);
          const s = 0.2 + rnd() * 0.14;
          const mound = mesh(sphere(1), mat(i % 2 ? 0xa39258 : 0xad9c61), x, 0, z);
          mound.scale.set(s * 1.25, s * 0.62, s * 1.25);
          deco.add(mound);
        }
        for (let i = 0; i < 4; i++) {
          const [x, z] = spot(0.5);
          deco.add(mesh(box(0.07, 0.05, 0.06), mat(0xcfcabd), x, 0.025, z));
        }
      } else if (hx.terrain === 'ore' || hx.terrain === 'mountain') {
        const ore = hx.terrain === 'ore';
        const rock = ore ? 0x6f6a66 : 0x858c93;
        const peaks = ore ? [[0, 0, 0.36, 0.5], [0.28, 0.16, 0.24, 0.34], [-0.26, -0.14, 0.22, 0.3]]
          : [[0, 0.02, 0.4, 0.74], [0.3, -0.12, 0.27, 0.48], [-0.28, 0.14, 0.25, 0.42]];
        for (const [x, z, r, hgt] of peaks) {
          deco.add(mesh(cone(r, hgt, 6), mat(rock, { flatShading: true }), x, hgt / 2, z));
          if (!ore) deco.add(mesh(cone(r * 0.42, hgt * 0.4, 6), mat(0xf5f7f9, { flatShading: true }), x, hgt * 0.805, z));
        }
        if (ore) {
          for (let i = 0; i < 6; i++) {
            const [x, z] = spot(0.42);
            const nug = mesh(geo('oct', () => new THREE.OctahedronGeometry(0.05)), mat(0xee8a3c, { metalness: 0.6, roughness: 0.35, emissive: 0x6b2c06, emissiveIntensity: 0.5 }), x, 0.12 + rnd() * 0.16, z);
            deco.add(nug);
          }
        }
      } else {
        for (let i = 0; i < 5; i++) {
          const [x, z] = spot(0.5);
          const field = mesh(box(0.2, 0.012, 0.13), mat(i % 2 ? 0xe2c95a : 0xb7d46a), x, 0.006, z);
          field.rotation.y = rnd() * 3;
          field.castShadow = false;
          deco.add(field);
        }
      }
      g.add(deco);
    }
    const span = R * 1.9 + 2.5;
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 50 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.resetCamera();
  }

  resetCamera() {
    const R = this.map ? this.map.radius : 3;
    const narrow = this.camera.aspect < 0.9;
    const d = R * (narrow ? 6.6 : 4.5) + 4;
    this.camera.position.set(0, d * 0.95, d * 0.8);
    this.controls.target.set(0, 0, 0);
    this.controls.maxDistance = d * 1.9;
    // Keep the whole board clear of the fog, and fade only the table beyond it.
    const dist = this.camera.position.length();
    this.scene.fog.near = dist + R * 1.2;
    this.scene.fog.far = dist + R * 1.2 + 45;
    this.controls.update();
  }

  focus(j) {
    const p = this.jpos(j, 0);
    const delta = p.clone().sub(this.controls.target);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
  }

  // Draw the current game: bounties, capital, settlements, roads and units.
  sync(view, colorOf) {
    const map = this.map;
    const G = this.groups;
    // Bounty tokens are kept between updates (each owns a small canvas texture).
    if (this.bountyMap !== map) {
      for (const sp of this.bountySprites.values()) { sp.material.map.dispose(); sp.material.dispose(); }
      this.bountySprites.clear();
      G.bounties.clear();
      this.bountyMap = map;
    }
    for (const hid in view.bounties) {
      if (this.bountySprites.has(hid)) continue;
      const hx = map.hexes[hid];
      const sp = bountySprite(view.bounties[hid]);
      sp.position.set(hx.x, hx.terrain === 'mountain' ? 1.05 : hx.terrain === 'ore' ? 0.85 : 0.6, hx.y);
      G.bounties.add(sp);
      this.bountySprites.set(hid, sp);
    }
    for (const [hid, sp] of this.bountySprites) {
      if (view.bounties[hid]) continue;
      G.bounties.remove(sp);
      sp.material.map.dispose();
      sp.material.dispose();
      this.bountySprites.delete(hid);
    }
    G.roads.clear();
    for (const e in view.roads) {
      const ed = map.edges[e];
      const a = this.jpos(ed.a);
      const b = this.jpos(ed.b);
      const color = colorOf(view.roads[e]);
      const road = mesh(box(0.66, 0.05, 0.11), mat(color), (a.x + b.x) / 2, TOP + 0.025, (a.z + b.z) / 2);
      road.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
      const kerb = mesh(box(0.7, 0.03, 0.15), mat(0x1d1611), (a.x + b.x) / 2, TOP + 0.012, (a.z + b.z) / 2);
      kerb.rotation.y = road.rotation.y;
      G.roads.add(kerb, road);
    }
    G.settlements.clear();
    this.objPicks = [];
    if (view.capital !== null && view.capital !== undefined) {
      const m = kingdomCapitalModel();
      m.position.copy(this.jpos(view.capital));
      m.userData.pick = { kind: 'capital', id: view.capital };
      G.settlements.add(m);
      this.objPicks.push(m);
    }
    for (const j in view.settlements) {
      const s = view.settlements[j];
      const m = settlementModel(s.type, colorOf(s.owner), s.church);
      m.position.copy(this.jpos(+j));
      m.userData.pick = { kind: 'settlement', id: +j };
      G.settlements.add(m);
      this.objPicks.push(m);
    }
    // Units keep their meshes between updates so that moves glide.
    const alive = new Set();
    const atCapital = view.units.filter((u) => u.at === view.capital);
    for (const u of view.units) {
      alive.add(u.id);
      let m = this.unitMeshes.get(u.id);
      if (!m || m.userData.type !== u.type) {
        if (m) G.units.remove(m);
        const fresh = unitModel(u.type, colorOf(u.owner));
        fresh.userData.type = u.type;
        fresh.userData.pick = { kind: 'unit', id: u.id };
        if (m) fresh.position.copy(m.position);
        m = fresh;
        m.userData.isNew = !this.unitMeshes.has(u.id);
        this.unitMeshes.set(u.id, m);
        G.units.add(m);
      }
      const p = this.jpos(u.at);
      if (u.at === view.capital) {
        const i = atCapital.indexOf(u);
        const ang = (i / Math.max(1, atCapital.length)) * Math.PI * 2 + 0.6;
        p.x += Math.cos(ang) * 0.72;
        p.z += Math.sin(ang) * 0.72;
      } else if (view.settlements[u.at]) {
        p.x -= 0.3;
        p.z += 0.34;
      }
      m.userData.target = p;
      if (m.userData.isNew) { m.position.copy(p); m.userData.isNew = false; }
      this.objPicks.push(m);
    }
    for (const [id, m] of this.unitMeshes) {
      if (!alive.has(id)) { G.units.remove(m); this.unitMeshes.delete(id); }
    }
  }

  unitPos(id) {
    const m = this.unitMeshes.get(id);
    return m ? (m.userData.target || m.position) : null;
  }

  // hl: { junctions: [{id, kind}], edges: [{id, kind}], units: [{id, kind}], ghostCapital: junction }
  setHighlights(hl) {
    const G = this.groups.highlights;
    G.clear();
    this.hlPicks = [];
    this.pulsing = [];
    const glow = (kind) => new THREE.MeshBasicMaterial({ color: HL_COLOR[kind] || 0xffd75e, transparent: true, opacity: 0.95, depthTest: false });
    const ghost = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
    for (const j of hl.junctions || []) {
      const p = this.jpos(j.id, TOP + 0.06);
      const ring = new THREE.Mesh(geo('ring', () => new THREE.TorusGeometry(0.2, 0.035, 8, 28)), glow(j.kind));
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 4;
      const holder = new THREE.Group();
      holder.position.copy(p);
      holder.add(ring);
      G.add(holder);
      this.pulsing.push(holder);
      const pk = new THREE.Mesh(sphere(0.3), ghost);
      pk.position.copy(p);
      pk.userData.pick = { kind: 'junction', id: j.id };
      G.add(pk);
      this.hlPicks.push(pk);
    }
    for (const e of hl.edges || []) {
      const ed = this.map.edges[e.id];
      const a = this.jpos(ed.a);
      const b = this.jpos(ed.b);
      const mid = new THREE.Vector3((a.x + b.x) / 2, TOP + 0.06, (a.z + b.z) / 2);
      const rot = -Math.atan2(b.z - a.z, b.x - a.x);
      const m = glow(e.kind);
      m.opacity = 0.75;
      const bar = new THREE.Mesh(box(0.6, 0.04, 0.12), m);
      bar.position.copy(mid);
      bar.rotation.y = rot;
      bar.renderOrder = 4;
      G.add(bar);
      const pk = new THREE.Mesh(box(0.7, 0.3, 0.34), ghost);
      pk.position.copy(mid);
      pk.rotation.y = rot;
      pk.userData.pick = { kind: 'edge', id: e.id };
      G.add(pk);
      this.hlPicks.push(pk);
    }
    for (const u of hl.units || []) {
      const p = this.unitPos(u.id);
      if (!p) continue;
      const ring = new THREE.Mesh(geo('uring', () => new THREE.TorusGeometry(0.25, 0.04, 8, 28)), glow(u.kind));
      ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 4;
      const holder = new THREE.Group();
      holder.position.set(p.x, TOP + 0.05, p.z);
      holder.add(ring);
      G.add(holder);
      this.pulsing.push(holder);
      if (u.kind !== 'select') {
        const pk = new THREE.Mesh(sphere(0.3), ghost);
        pk.position.set(p.x, TOP + 0.15, p.z);
        pk.userData.pick = { kind: 'unit', id: u.id, highlighted: true };
        G.add(pk);
        this.hlPicks.push(pk);
      }
    }
    if (hl.ghostCapital !== undefined && hl.ghostCapital !== null) {
      const m = kingdomCapitalModel();
      m.position.copy(this.jpos(hl.ghostCapital));
      G.add(m);
      const beam = new THREE.Mesh(cyl(0.08, 0.5, 5, 16), new THREE.MeshBasicMaterial({ color: 0xc79bff, transparent: true, opacity: 0.22, depthWrite: false }));
      beam.position.copy(this.jpos(hl.ghostCapital, 2.6));
      G.add(beam);
    }
  }

  pickAt(cx, cy, hover = false) {
    if (!this.map) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    // Highlights added since the last frame have not had their matrices computed yet.
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const find = (hits) => {
      for (const hit of hits) {
        let o = hit.object;
        while (o && !o.userData.pick) o = o.parent;
        if (o) return o.userData.pick;
      }
      return null;
    };
    if (!hover) {
      const hi = find(this.raycaster.intersectObjects(this.hlPicks, false));
      if (hi) return hi;
    }
    const obj = find(this.raycaster.intersectObjects(this.objPicks || [], true));
    if (obj) return obj;
    return find(this.raycaster.intersectObjects(this.tilePicks || [], false));
  }
}
