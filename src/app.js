import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PRESETS, randomCar, clone, sanitize, setPillarCount, sToX, xToS, PLAN_MIN } from './car.js';
import { CarMesh } from './render.js';
import { SPEC, TAB, OPTIONS } from './params.js';

let P = sanitize(clone(PRESETS.sedan));
let detail = 1; // tessellation level, a view setting: 0 = PS1-grade, 1 = full
let preset = 'sedan';

// ---------- scene ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
scene.environmentIntensity = 0.7;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
camera.position.set(-6.2, 2.2, 5.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.495;
controls.minDistance = 2.5; controls.maxDistance = 18;

const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(-3, 8, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
sun.shadow.radius = 6;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// the car itself: meshes and materials live in render.js, shared with the library entry (index.js)
const carMesh = new CarMesh();
const car = carMesh.group, paint = carMesh.mats.paint, U = carMesh.mats.U;
scene.add(car);
let built;

function rebuild() {
  built = carMesh.update(P, detail);
  const m = built.meta;
  car.position.x = -(m.xF + m.xR) / 2;
  const tris = carMesh.triangles();
  document.getElementById('tris').textContent = tris >= 1000 ? `${(tris / 1000).toFixed(1)}k tris` : `${tris} tris`;
  drawEditor();
  syncPanel();
}

let queued = false;
const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; rebuild(); }); } };

// ---------- camera views ----------
let camGoal = null;
const VIEWS = { front: [-6.2, 2.2, 5.6], side: [0, 0.9, 9.2], rear: [6.2, 2.2, 5.6], top: [0, 10, 0.01] };
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { camGoal = new THREE.Vector3(...VIEWS[b.dataset.view]); }));
controls.addEventListener('start', () => { camGoal = null; });

function resize() {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
renderer.setAnimationLoop(() => {
  if (camGoal) {
    camera.position.lerp(camGoal, 0.12);
    controls.target.lerp(new THREE.Vector3(0, 0.6, 0), 0.12);
    if (camera.position.distanceTo(camGoal) < 0.01) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
});

// ---------- orthographic editors: side, top, front/rear ----------
const svg = document.getElementById('editor');
const NS = 'http://www.w3.org/2000/svg';
const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
let drag = null, tab = 'side';
const frames = {};
const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
const poly = (xs, ys) => xs.map((x, i) => `${x},${ys[i]}`).join(' ');
let K = 0.005; // metres per css pixel
const handle = (x, y, cls, title, move) => {
  const c = el('circle', { cx: x, cy: y, r: 6 * K, class: `h ${cls}`, 'stroke-width': 2 * K });
  el('title', {}, c).textContent = title;
  c.addEventListener('pointerdown', (e) => { drag = move; svg.setPointerCapture(e.pointerId); e.preventDefault(); });
};
// drag a control point along s (between neighbours, ends pinned) and along a value axis
const dragPoint = (pts, i, valueOf, lo, hi) => (X, Y) => {
  if (i > 0 && i < pts.length - 1) pts[i][0] = clampN(xToS(P, X), pts[i - 1][0] + 0.02, pts[i + 1][0] - 0.02);
  pts[i][1] = clampN(valueOf(Y), lo, hi);
};

const FRAME = {
  side() {
    const o = built.outline, m = built.meta, zmax = Math.max(...o.side, ...o.top, ...built.cabin.profile.map((p) => p[1])) + 0.3;
    return [m.xF - 0.5, -zmax, m.xR - m.xF + 1, zmax + 0.12];
  },
  top() {
    const m = built.meta, ext = Math.max(...built.outline.wmax, P.track / 2 + P.wheelPoke + P.tireW / 2) + 0.3;
    return [m.xF - 0.5, -ext, m.xR - m.xF + 1, 2 * ext];
  },
  sec() {
    const zmax = Math.max(...built.outline.side, ...built.cabin.profile.map((p) => p[1])) + 0.3, wE = Math.max(...built.outline.wmax, P.track / 2 + P.tireW / 2) + 0.25;
    return [-wE, -zmax, 4 * wE, zmax + 0.12];
  },
};

const DRAW = {
  side() {
    const { outline: o, meta: m } = built, f = frames.side;
    el('line', { x1: f[0], x2: f[0] + f[2], y1: 0, y2: 0, class: 'ground', 'stroke-width': K });
    const sil = poly(o.x, o.x.map((_, i) => -Math.max(o.top[i], o.side[i])));
    el('polygon', { points: `${sil} ${poly(o.x, o.bot.map((v) => -v)).split(' ').reverse().join(' ')}`, class: 'body' });
    el('polyline', { points: sil, class: 'sil', 'stroke-width': 2 * K });
    const cp = built.cabin.profile;
    el('polygon', { points: poly(cp.map((p) => p[0]), cp.map((p) => -p[1])), class: 'body' });
    el('polyline', { points: poly(cp.map((p) => p[0]), cp.map((p) => -p[1])), class: 'sil', 'stroke-width': 2 * K });
    el('polyline', { points: poly(o.x, o.belt.map((v) => -v)), class: 'belt', 'stroke-width': 1.5 * K });
    el('polyline', { points: poly(o.x, o.chr.map((v) => -v)), class: 'chr', 'stroke-width': 1.5 * K, 'stroke-dasharray': `${6 * K} ${4 * K}` });
    for (const xw of m.wheels) {
      el('circle', { cx: xw, cy: -m.R, r: m.R, class: 'tire', 'stroke-width': K });
      el('circle', { cx: xw, cy: -m.R, r: m.R * P.rimRatio, class: 'rim', 'stroke-width': K });
    }
    const names = ['Nose', 'Hood leading edge', 'Cowl / windshield base', 'Roof front', 'Roof rear', 'Backlight base', 'Deck', 'Tail'];
    const last = P.profile.length - 1;
    P.profile.forEach(([s, z], i) => handle(sToX(P, s), -z, 'hp', names[i], (X, Y) => {
      if (i === 0) P.overhangF = clampN(-X, 0.3, 1.8);
      if (i === last) P.overhangR = clampN(X - P.wheelbase, 0.2, 1.8);
      dragPoint(P.profile, i, (v) => -v, 0.1, 2.4)(X, Y);
    }));
    P.belt.forEach(([s, z], i) => handle(sToX(P, s), -z, 'hb', 'Beltline', (X, Y) => { P.belt[i][0] = clampN(xToS(P, X), -1, 2); P.belt[i][1] = clampN(-Y, 0.1, 2.4); }));
    P.chr.forEach(([s, z], i) => handle(sToX(P, s), -z, 'hc', 'Character line', (X, Y) => { P.chr[i][0] = clampN(xToS(P, X), -1, 2); P.chr[i][1] = clampN(-Y, 0.1, 2.4); }));
    handle(m.wb, -m.R, 'hw', 'Rear axle: drag to set wheelbase', (X) => { P.wheelbase = clampN(X, 1.8, 3.6); });

    // pillars live on the cabin's side chart (s = arclength along the glass house, t = slant height), so widths are true widths
    const E = () => built.cabin.edit, e = E();
    const pl = (pts, w = 1.5 * K, op = 1) => el('polyline', { points: poly(pts.map((p) => p[0]), pts.map((p) => -p[1])), class: 'pil', 'stroke-width': w, opacity: op, fill: 'none' });
    pl(e.aLine); pl(e.cLine);
    const end = (pts) => pts[pts.length - 1];
    e.pillarLines.forEach((pts, i) => {
      pl(pts, P.pillarW, 0.25);
      handle(pts[0][0], -pts[0][1], 'hl', `Pillar ${i + 1}: drag to move`, (X) => {
        const c = E(), s0 = c.sAtX(X, c.t0);
        P.pillars[i][0] = clampN((c.front(c.t0) - s0) / (c.front(c.t0) - c.rear(c.t0)), 0.05, 0.95);
      });
      handle(end(pts)[0], -end(pts)[1], 'hl', `Pillar ${i + 1}: drag to lean`, (X) => {
        const c = E(), [a, b] = c.pillarAxes[i], s0 = a + b * c.t0, s1 = c.sAtX(X, c.t1);
        const f = P.pillars[i][0], fan = P.pillarFan * (c.slopeF + (c.slopeR - c.slopeF) * f);
        P.pillars[i][1] = clampN(fan - (s1 - s0) / (c.t1 - c.t0), -0.6, 0.8);
      });
    });
    handle(e.aLine[0][0], -e.aLine[0][1], 'hl', 'A-pillar: drag to set width', (X) => {
      const c = E(); P.aPillar = clampN(2 * (c.sA(c.t0) - c.sAtX(X, c.t0)), 0.06, 0.4);
    });
    handle(e.cLine[0][0], -e.cLine[0][1], 'hl', 'C-pillar base: drag to set width', (X) => {
      const c = E(); P.cPillar = clampN(c.sAtX(X, c.t0) - c.sC(c.t0), 0.07, 1.2);
    });
    handle(end(e.cLine)[0], -end(e.cLine)[1], 'hl', 'C-pillar top: drag to taper', (X) => {
      const c = E(); P.cTaper = clampN((c.sAtX(X, c.t1) - c.sC(c.t1)) / Math.max(P.cPillar, 0.02), 0.1, 2);
    });
  },
  top() {
    const { outline: o, meta: m } = built, f = frames.top, W0 = m.W0;
    el('line', { x1: f[0], x2: f[0] + f[2], y1: 0, y2: 0, class: 'ground', 'stroke-width': K, 'stroke-dasharray': `${6 * K} ${4 * K}` });
    for (const xw of m.wheels) for (const sd of [-1, 1]) {
      el('rect', { x: xw - m.R, y: sd * (P.track / 2 + P.wheelPoke) - P.tireW / 2, width: 2 * m.R, height: P.tireW, rx: 0.03, class: 'tire', 'stroke-width': K });
    }
    const up = poly(o.x, o.wmax.map((v) => -v)), down = poly(o.x, o.wmax).split(' ').reverse().join(' ');
    el('polygon', { points: `${up} ${down}`, class: 'body' });
    el('polygon', { points: `${up} ${down}`, class: 'sil', 'stroke-width': 2 * K });
    for (const ring of [built.cabin.planBase, built.cabin.planRoof]) {
      el('polygon', { points: poly(ring.map((p) => p[0]), ring.map((p) => -p[1])), class: 'cabin', 'stroke-width': 1.5 * K });
    }
    P.plan.forEach(([s, v], i) => handle(sToX(P, s), -W0 * v, 'hp', 'Body plan width', dragPoint(P.plan, i, (Y) => -Y / W0, PLAN_MIN, 1.15)));
    const cabNames = ['Windshield base', 'Roof front', 'Roof rear', 'Backlight base'];
    P.cabin.forEach((c, i) => handle(sToX(P, P.profile[2 + i][0]), -W0 * c, 'hb', `Cabin width: ${cabNames[i]}`, (X, Y) => { P.cabin[i] = clampN(-Y / W0, 0.3, 1); }));
  },
  sec() {
    const f = frames.sec, wE = f[2] / 4;
    [['F', 0, 'Front'], ['R', 2 * wE, 'Rear']].forEach(([key, off, label]) => {
      const S = built.sections[key];
      if (!S) return;
      el('line', { x1: off - wE + 0.1, x2: off + wE - 0.1, y1: 0, y2: 0, class: 'ground', 'stroke-width': K });
      el('text', { x: off, y: f[1] + 16 * K, class: 'lbl', 'font-size': 12 * K, 'text-anchor': 'middle' }).textContent = label;
      for (const sd of [-1, 1]) el('rect', { x: off + sd * (P.track / 2 + P.wheelPoke) - P.tireW / 2, y: -2 * P.wheelR, width: P.tireW, height: 2 * P.wheelR, rx: 0.04, class: 'tire', 'stroke-width': K });
      const ys = [], zs = [];
      for (let q = 0; q < S.half.length; q += 2) { ys.push(off + S.half[q]); zs.push(-S.half[q + 1]); }
      const right = poly(ys, zs), left = poly(ys.map((y) => 2 * off - y), zs).split(' ').reverse().join(' ');
      el('polygon', { points: `${right} ${left}`, class: 'body' });
      el('polygon', { points: `${right} ${left}`, class: 'sil', 'stroke-width': 2 * K });
      el('line', { x1: off - S.Wp, x2: off + S.Wp, y1: -S.zbelt, y2: -S.zbelt, class: 'chr', 'stroke-width': K, 'stroke-dasharray': `${4 * K} ${4 * K}` });
      const cs = built.cabin.sectionAt(S.x);
      if (cs.length > 2) {
        const right = poly(cs.map((p) => off + p[0]), cs.map((p) => -p[1])), left = poly(cs.map((p) => off - p[0]), cs.map((p) => -p[1])).split(' ').reverse().join(' ');
        el('polygon', { points: `${right} ${left}`, class: 'cabin', 'stroke-width': 1.5 * K });
      }
      const sec = P[`sec${key}`], cur = () => built.sections[key];
      sec.body.forEach(([t, ins], i) => handle(off + S.Wp - ins, -(S.zr + t * S.spanB), 'hp', `${label} section`, (X, Y) => {
        const C = cur();
        sec.body[i][1] = clampN(C.Wp - (X - off), -0.06, 0.25);
        if (i > 0 && i < sec.body.length - 1) sec.body[i][0] = clampN((-Y - C.zr) / C.spanB, sec.body[i - 1][0] + 0.04, sec.body[i + 1][0] - 0.04);
      }));
    });
  },
};

const LEGEND = {
  side: [['var(--ink)', 'Silhouette'], ['var(--blue)', 'Beltline'], ['var(--ink-3)', 'Character line'], ['var(--green)', 'Pillars']],
  top: [['var(--ink)', 'Body plan'], ['var(--blue)', 'Cabin plan']],
  sec: [['var(--ink)', 'Body section'], ['var(--accent)', 'Body side'], ['var(--blue)', 'Cabin']],
};
const legend = document.querySelector('.legend');

function drawEditor() {
  if (!built) return;
  if (!drag) { frames[tab] = FRAME[tab](); svg.setAttribute('viewBox', frames[tab].join(' ')); }
  const f = frames[tab];
  K = Math.max(f[2] / svg.clientWidth, f[3] / svg.clientHeight) || 0.005;
  svg.replaceChildren();
  DRAW[tab]();
  legend.innerHTML = LEGEND[tab].map(([c, t]) => `<span><i style="background:${c}"></i>${t}</span>`).join('');
}
document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('[data-panel]').forEach((x) => x.setAttribute('aria-selected', x === b));
  for (const k in panels) panels[k].hidden = k !== b.dataset.panel;
}));
document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
  tab = b.dataset.tab;
  document.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-selected', x === b));
  drawEditor();
}));
new ResizeObserver(() => drawEditor()).observe(svg);

svg.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  drag(pt.x, pt.y);
  preset = null; markPreset();
  schedule();
});
const endDrag = () => { if (drag) { drag = null; schedule(); } };
svg.addEventListener('pointerup', endDrag);
svg.addEventListener('pointercancel', endDrag);

// ---------- parameter panel ----------
const panels = { body: document.getElementById('params'), parts: document.getElementById('parts') };
const inputs = {};
for (const [group, rows] of SPEC) {
  const det = document.createElement('details'), panel = panels[TAB(group) === 'attachments' ? 'parts' : 'body'];
  det.open = group === 'Roof';
  det.innerHTML = `<summary>${group}</summary>`;
  for (const [key, label, min, max, step, unit = ''] of rows) {
    const row = document.createElement('label');
    row.className = 'row';
    row.innerHTML = `<span class="lbl">${label}</span><output></output><input type="range" min="${min}" max="${max}" step="${step}">`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.addEventListener('input', () => { if (key === 'pillarCount') setPillarCount(P, +inp.value); else P[key] = +inp.value; preset = null; markPreset(); schedule(); });
    inputs[key] = { inp, out, unit, step };
    det.appendChild(row);
  }
  panel.appendChild(det);
}
function syncPanel() {
  for (const k in inputs) {
    const { inp, out, unit, step } = inputs[k];
    const v = k === 'pillarCount' ? P.pillars.length : P[k];
    if (document.activeElement !== inp) inp.value = v;
    out.textContent = OPTIONS[k] ? OPTIONS[k][v] : (+v).toFixed(step >= 1 ? 0 : step >= 0.01 ? 2 : 3) + (unit ? ` ${unit}` : '');
  }
  document.getElementById('color').value = P.color;
  document.getElementById('roof').checked = !!P.contrastRoof;
}

// ---------- header + toolbar ----------
const presetBar = document.getElementById('presets');
for (const k of Object.keys(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = { suv: 'SUV', offroad: 'Off-road' }[k] || k[0].toUpperCase() + k.slice(1);
  b.dataset.preset = k;
  b.addEventListener('click', () => { P = sanitize(clone(PRESETS[k])); preset = k; markPreset(); rebuild(); });
  presetBar.appendChild(b);
}
const markPreset = () => presetBar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.preset === preset));
document.getElementById('random').addEventListener('click', () => { P = randomCar(); preset = null; markPreset(); rebuild(); });
document.getElementById('color').addEventListener('input', (e) => { P.color = e.target.value; paint.color.set(P.color); });
document.querySelectorAll('[data-color]').forEach((b) => {
  b.style.background = b.dataset.color;
  b.addEventListener('click', () => { P.color = b.dataset.color; paint.color.set(P.color); syncPanel(); });
});
document.getElementById('roof').addEventListener('change', (e) => { P.contrastRoof = e.target.checked ? 1 : 0; schedule(); });
document.getElementById('zebra').addEventListener('change', (e) => { U.uZebra.value = e.target.checked ? 1 : 0; });
document.getElementById('detail').addEventListener('input', (e) => { detail = +e.target.value; schedule(); });
document.getElementById('wire').addEventListener('change', (e) => { paint.wireframe = e.target.checked; });
const themeBtn = document.getElementById('theme');
const setTheme = (t) => {
  document.documentElement.dataset.theme = t;
  localStorage.setItem('theme', t);
  themeBtn.textContent = t === 'dark' ? 'Light mode' : 'Dark mode';
  ground.material.opacity = t === 'dark' ? 0.5 : 0.22;
};
setTheme(document.documentElement.dataset.theme);
themeBtn.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.getElementById('copy').addEventListener('click', async (e) => {
  await navigator.clipboard.writeText(JSON.stringify(P));
  e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy JSON'; }, 1200);
});

markPreset();
rebuild();
resize();
window.__car = { get P() { return P; }, set P(v) { P = v; }, get built() { return built; }, rebuild, camera, controls, renderer, scene, car, carMesh };
