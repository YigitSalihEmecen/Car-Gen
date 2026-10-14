import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PRESETS, buildCar, randomCar, clone, sanitize, setPillarCount, sToX, xToS, PLAN_MIN } from './car.js';
import { LAMP_TYPES, TAIL_TYPES } from './lights.js';
import { FENDER_TYPES } from './flares.js';
import { KIT_TYPES, KIT_SWEEP, KIT_LATHE } from './kit.js';
import { RIM_TYPES, makeWheel } from './wheels.js';
import { ROOF_TYPES, ROOF_PARTS } from './roof.js';

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

const car = new THREE.Group();
scene.add(car);

// ---------- paint shader: wheel wells and cladding are flush masks on the body ----------
const HOLE_MAX = 256; // per lamp pair; the texture holds the headlight polygon, then the tail-light polygon
const U = {
  uT: { value: new THREE.Vector4() },
  uEnds: { value: new THREE.Vector4() },
  uWheel: { value: new THREE.Vector4() }, uOpt: { value: new THREE.Vector4() }, uMisc: { value: new THREE.Vector4() },
  uZebra: { value: 0 },
  uHPoly: { value: new THREE.DataTexture(new Float32Array(HOLE_MAX * 8), HOLE_MAX * 2, 1, THREE.RGBAFormat, THREE.FloatType) },
  uHN: { value: 0 }, uHBox: { value: new THREE.Vector4() }, uTN: { value: 0 }, uTBox: { value: new THREE.Vector4() }, uRL: { value: 0 },
};
const paint = new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.06 });
paint.onBeforeCompile = (sh) => {
  Object.assign(sh.uniforms, U);
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>
      attribute float aT; attribute float aBelt; attribute vec2 aIR;
      varying vec3 vOP; varying vec3 vON; varying float vT; varying float vBelt; varying vec2 vIR;`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>
      vOP = position; vON = normal; vT = aT; vBelt = aBelt; vIR = aIR;`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vOP; varying vec3 vON; varying float vT; varying float vBelt; varying vec2 vIR;
      uniform vec4 uT, uEnds, uWheel, uOpt, uMisc; uniform float uZebra;
      uniform sampler2D uHPoly; uniform int uHN, uTN; uniform vec4 uHBox, uTBox; uniform float uRL;
      // even-odd test against a lamp bezel edge, a polygon in the body's (station, ring) coordinates
      bool inPoly(vec2 p, int off, int n, vec4 box) {
        if (n == 0 || any(lessThan(p, box.xy)) || any(greaterThan(p, box.zw))) return false;
        bool inside = false;
        for (int k = 0; k < ${HOLE_MAX}; k++) {
          if (k >= n) break;
          vec2 a = texelFetch(uHPoly, ivec2(off + k, 0), 0).xy, b = texelFetch(uHPoly, ivec2(off + (k + 1) % n, 0), 0).xy;
          if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
        }
        return inside;
      }
      bool inHole(vec2 p) { return inPoly(p, 0, uHN, uHBox) || inPoly(p, ${HOLE_MAX}, uTN, uTBox); }
      float aaw(float v){ return fwidth(v) * 0.75 + 1e-5; }
      float above(float v, float a){ float w = aaw(v); return smoothstep(a - w, a + w, v); }
      float band(float v, float a, float b){ return above(v, a) * (1.0 - above(v, b)); }
      float line(float v, float c, float hw){ float w = aaw(v); return 1.0 - smoothstep(hw - w, hw + w, abs(v - c)); }
      float archH(float u){ return uMisc.z > 0.5 ? min(1.0, (1.0 - u) * 2.2) : sqrt(max(1.0 - u * u, 0.0)); }
      float inArch(float dx, float y, float ra){ float u = abs(dx) / ra; return (1.0 - above(u, 1.0)) * (1.0 - above(y, uWheel.z + ra * archH(min(u, 1.0)))); }
      float inArches(float x, float y, float ra){ return max(inArch(x, y, ra), inArch(x - uWheel.y, y, ra)); }`)
    .replace('#include <color_fragment>', `#include <color_fragment>
      // headlight openings: the skin under each bezel is cut away (left side folds onto the right: ring r <-> RL - r)
      if (uHN + uTN > 0 && vT < 1.5 && inHole(vec2(vIR.x, vIR.y > 0.5 * uRL ? uRL - vIR.y : vIR.y))) discard;
      float x = vOP.x, y = vOP.y;
      // wheel wells, underbody, cladding
      float well = inArches(x, y, uWheel.w + 0.004) * (1.0 - above(vT, uT.z));
      float under = smoothstep(-0.25, -0.6, vON.y) * (1.0 - above(vT, 1.5));
      float clad = uOpt.x > 0.001 ? max((inArches(x, y, uWheel.w + uOpt.x) - inArches(x, y, uWheel.w - 0.01)) * (1.0 - above(y, vBelt - 0.08)), 1.0 - above(y, uEnds.w + uOpt.x * 1.5)) : 0.0;

      float trim = max(well, max(under, clad));
      vec3 col = diffuseColor.rgb;
      col = mix(col, vec3(0.035, 0.04, 0.045), trim);
      diffuseColor.rgb = col;
      float mPaint = 1.0 - trim;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.75, trim);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
      metalnessFactor *= mPaint;`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      material.clearcoat *= 1.0 - trim;`)
    .replace('#include <dithering_fragment>', `#include <dithering_fragment>
      if (uZebra > 0.5) {
        vec3 r = reflect(normalize(vViewPosition), normalize(normal));
        float k = r.y * 26.0;
        float s = clamp(0.5 + sin(k) / (fwidth(k) * 1.6 + 1e-4), 0.0, 1.0);
        gl_FragColor = vec4(vec3(mix(0.06, 0.95, s)), 1.0);
      }`);
};

const rubber = new THREE.MeshStandardMaterial({ color: 0x161718, roughness: 0.88 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc8cbce, metalness: 1, roughness: 0.22 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2c2f, metalness: 0.8, roughness: 0.5 });
const caliper = new THREE.MeshStandardMaterial({ color: 0xd9541e, roughness: 0.4 });
const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0b0e12, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 });
const gasketMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.6 });
const roofBlack = new THREE.MeshPhysicalMaterial({ color: 0x121314, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
const lampMats = {
  red: new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1208, emissiveIntensity: 1.4, roughness: 0.35 }),
  tint: new THREE.MeshPhysicalMaterial({ color: 0xd0170f, emissive: 0x500000, metalness: 0, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
  white: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.2 }),
  housing: new THREE.MeshStandardMaterial({ color: 0x1a1c1f, metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2430, metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
  led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf2ff, emissiveIntensity: 1.6 }),
  amber: new THREE.MeshStandardMaterial({ color: 0xff9a2e, emissive: 0xff7a10, emissiveIntensity: 0.35, roughness: 0.3 }),
  // plain transparency (not transmission): the transmission pass only sees opaque objects, so a red lens behind would vanish
  lens: new THREE.MeshPhysicalMaterial({ roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
};
const flareMats = {
  plastic: new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.82, metalness: 0 }),
  bolt: new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.7, roughness: 0.42, side: THREE.DoubleSide }),
  rivet: new THREE.MeshStandardMaterial({ color: 0xd4d7da, metalness: 1, roughness: 0.25, side: THREE.DoubleSide }),
};
const kitMats = {
  plastic: flareMats.plastic,
  carbon: new THREE.MeshPhysicalMaterial({ color: 0x15171a, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb4b8bd, metalness: 1, roughness: 0.34 }),
  chrome: lampMats.chrome,
  bolt: flareMats.bolt,
  accent: new THREE.MeshStandardMaterial({ color: 0xc4211a, metalness: 0.2, roughness: 0.4, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9, side: THREE.DoubleSide }),
};
const roofMats = {
  metal: new THREE.MeshStandardMaterial({ color: 0xc3c7cc, metalness: 1, roughness: 0.3 }),
  plastic: flareMats.plastic, rubber,
  box: new THREE.MeshPhysicalMaterial({ color: 0x23262a, metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, metalness: 0.45, roughness: 0.55 }),
  lens: lampMats.lens, led: lampMats.led, chrome: lampMats.chrome,
};
const parts = {};
// aT given = painted part (paint shader reads aT / aBelt): 1 keeps body-only masks off, 2 also skips the headlight cut
function setPart(name, data, mat, aT) {
  let mesh = parts[name];
  if (!data?.index.length) { if (mesh) mesh.visible = false; return; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
  g.setIndex(new THREE.BufferAttribute(data.index, 1));
  if (aT !== undefined) {
    const n = data.position.length / 3;
    g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n).fill(aT), 1));
    g.setAttribute('aBelt', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aIR', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (data.normal) g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3)); else g.computeVertexNormals();
  if (mesh) { mesh.geometry.dispose(); mesh.geometry = g; mesh.material = mat; mesh.visible = true; }
  else { mesh = parts[name] = new THREE.Mesh(g, mat); mesh.castShadow = !mat.transparent; car.add(mesh); }
  mesh.renderOrder = mat === lampMats.lens ? 2 : mat === lampMats.tint ? 1 : 0;
}

let body, wheelKey = '', wheelGroup;
let built;

function rebuild() {
  sanitize(P);
  built = buildCar(P, { detail });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(built.position, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(built.aT, 1));
  geo.setAttribute('aBelt', new THREE.BufferAttribute(built.aBelt, 1));
  geo.setAttribute('aIR', new THREE.BufferAttribute(built.aIR, 2));
  geo.setIndex(new THREE.BufferAttribute(built.index, 1));
  geo.computeVertexNormals();
  if (body) { body.geometry.dispose(); body.geometry = geo; }
  else { body = new THREE.Mesh(geo, paint); body.castShadow = true; car.add(body); }

  const m = built.meta;
  U.uT.value.set(m.tSideEnd, m.tTop, m.tBot, 0);
  U.uEnds.value.set(m.xF, m.xR, m.W0, P.clearance);
  U.uWheel.value.set(0, m.wb, m.R, m.Ra);
  U.uOpt.value.set(P.cladding, P.contrastRoof, 0, 0);
  U.uMisc.value.set(0, 0, P.archShape, 0);
  paint.color.set(P.color);
  paint.metalness = P.metal; paint.roughness = P.rough;

  // cabin: painted wall (paint shader needs aT / aBelt; aT = 1 keeps body-only masks off), roof, glass on gaskets
  const cab = built.cabin;
  const cabParts = [['wall', cab.wall, paint], ['roof', cab.roof, P.contrastRoof ? roofBlack : paint], ['gasket', cab.gasket, gasketMat], ['glass', cab.glass, glassMat]];
  for (const [name, data, mat] of cabParts) setPart(name, data, mat, mat === paint || name === 'roof' ? 1 : undefined);

  // headlights: lamp internals plus the painted bezel; the paint shader cuts the bezel's footprint out of the skin
  // head and tail lights: lamp internals plus painted bezels; the paint shader cuts each bezel's footprint from the skin
  U.uRL.value = built.meta.RL;
  const tex = U.uHPoly.value;
  for (const [key, set, nU, boxU, off] of [['front', built.lights, 'uHN', 'uHBox', 0], ['rear', built.tails, 'uTN', 'uTBox', HOLE_MAX]]) {
    const hole = set?.hole;
    U[nU].value = hole ? Math.min(hole.n, HOLE_MAX) : 0;
    if (hole) {
      for (let i = 0; i < U[nU].value; i++) tex.image.data.set([hole.poly[2 * i], hole.poly[2 * i + 1]], 4 * (off + i));
      U[boxU].value.set(...hole.box);
    }
    setPart(`bezel_${key}`, set?.bezel, paint, 2);
    for (const k in lampMats) setPart(`lamp_${key}_${k}`, set?.[k], lampMats[k]);
  }
  tex.needsUpdate = true;
  // full-width light bars: dark housing, emissive core (white front, red rear), clear lens over it
  for (const [key, bar, coreMat] of [['front', built.bars.front, lampMats.led], ['rear', built.bars.rear, lampMats.red]]) {
    setPart(`bar_${key}_housing`, bar?.housing, lampMats.housing);
    setPart(`bar_${key}_core`, bar?.core, coreMat);
    setPart(`bar_${key}_lens`, bar?.lens, lampMats.lens);
  }

  // fender flares: painted styles use the body paint (masks off), the pocket style is black plastic; the blend that
  // joins each part to the body is always paint
  const fd = built.fenders;
  setPart('flares', fd?.shell, fd?.paint ? paint : flareMats.plastic, fd?.paint ? 2 : undefined);
  setPart('flare_blend', fd?.blend, paint, 2);
  setPart('flare_hw', fd?.hardware, fd?.bright ? flareMats.rivet : flareMats.bolt);

  // body kit: painted parts and the blend use the body paint; trim parts get their own materials
  const kit = built.kit;
  setPart('kit_blend', kit?.blend, paint, 2);
  for (const k of KIT_SWEEP) setPart(`kit_${k}`, kit?.[k], k === 'paint' ? paint : kitMats[k], k === 'paint' ? 2 : undefined);
  for (const k of KIT_LATHE) setPart(`kit_${k}`, kit?.[k], kitMats[k]);

  // roof attachment: swept parts carry normals, lathed details get computed ones
  const rack = built.rack;
  for (const k of ROOF_PARTS) { setPart(`roof_${k}`, rack?.[k], roofMats[k]); setPart(`roof_${k}_l`, rack?.[`${k}_l`], roofMats[k]); }

  const key = [P.wheelR, P.tireW, P.rimRatio, P.spokes, P.rimType, detail].join();
  if (key !== wheelKey) {
    if (wheelGroup) { car.remove(wheelGroup); wheelGroup.traverse((o) => o.geometry?.dispose()); }
    wheelGroup = new THREE.Group();
    const proto = makeWheel(THREE, P, detail, { rubber, rim: rimMat, dark: darkMetal, chrome: lampMats.chrome, caliper });
    for (let i = 0; i < 4; i++) { const w = proto.clone(); wheelGroup.add(w); }
    car.add(wheelGroup);
    wheelKey = key;
  }
  // camber tilts each wheel about its hub (negative = tops lean in), lifted so the low tyre shoulder stays on the ground;
  // stick-out pushes the wheels out past the body without touching the track the fenders are shaped around
  const cam = (P.camber * Math.PI) / 180, hubY = P.wheelR * Math.cos(cam) + (P.tireW / 2) * Math.abs(Math.sin(cam));
  wheelGroup.children.forEach((w, i) => {
    const left = i % 2 === 1;
    w.position.set(i < 2 ? 0 : P.wheelbase, hubY, (left ? -1 : 1) * (P.track / 2 + P.wheelPoke));
    w.rotation.set(left ? -cam : cam, left ? Math.PI : 0, 0);
  });
  car.position.x = -(m.xF + m.xR) / 2;
  let tris = 0;
  car.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
  document.getElementById('tris').textContent = tris >= 1000 ? `${(tris / 1000).toFixed(1)}k tris` : `${tris} tris`;
  drawEditor();
  syncPanel();
}
const lerp = (a, b, t) => a + (b - a) * t;

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
const SPEC = [
  ['Wheels', [['wheelR', 'Wheel radius', 0.26, 0.48, 0.005, 'm'], ['tireW', 'Tire width', 0.16, 0.34, 0.005, 'm'], ['wheelbase', 'Wheelbase', 1.8, 3.6, 0.01, 'm'], ['track', 'Track', 1.3, 1.9, 0.01, 'm'], ['wheelPoke', 'Wheel stick-out', -0.04, 0.12, 0.002, 'm'], ['camber', 'Camber', -12, 6, 0.5, 'deg'], ['archGap', 'Arch gap', 0, 0.12, 0.002, 'm']]],
  ['Chassis', [['overhangF', 'Front overhang', 0.3, 1.8, 0.01, 'm'], ['overhangR', 'Rear overhang', 0.2, 1.8, 0.01, 'm'], ['width', 'Body width', 1.5, 2.2, 0.01, 'm'],
    ['clearance', 'Ground clearance', 0.06, 0.4, 0.005, 'm'], ['chinZ', 'Front lower edge', 0.1, 0.7, 0.01, 'm'], ['tailBotZ', 'Rear lower edge', 0.1, 0.8, 0.01, 'm']]],
  ['Ends', [['planF', 'Nose plan radius', 0.04, 1, 0.01, 'm'], ['planR', 'Tail plan radius', 0.04, 1, 0.01, 'm'], ['noseTaper', 'Nose face taper', 0.5, 3, 0.05],
    ['tailTaper', 'Tail face taper', 0.5, 3, 0.05], ['noseR', 'Nose edge radius', 0.01, 0.4, 0.005, 'm'], ['tailR', 'Tail edge radius', 0.01, 0.4, 0.005, 'm']]],
  ['Surface', [['squareness', 'Section squareness', 2.2, 12, 0.1], ['edgeR', 'Shoulder radius', 0.005, 0.3, 0.005, 'm'], 
    ['bottomR', 'Sill radius', 0.005, 0.25, 0.005, 'm'], ['crown', 'Roof / hood crown', -0.02, 0.12, 0.002, 'm'], ['softness', 'Line softness', 0.002, 0.12, 0.001, 'm']]],
  ['Character', [['tension', 'Line tension', 0, 1, 0.01], ['creaseSharp', 'Crease sharpness', 0, 1, 0.01], ['ledgeSharp', 'Ledge sharpness', 0, 1, 0.01],
    ['archShape', 'Arch shape', 0, 1, 1], ['ridge', 'Center ridge', 0, 0.06, 0.001, 'm']]],
  ['Sculpt', [['crease', 'Character crease', 0, 0.03, 0.001, 'm'], ['flare', 'Front fender flare', 0, 0.15, 0.002, 'm'], ['flareR', 'Rear fender flare', 0, 0.15, 0.002, 'm'], ['fenderMelt', 'Fender blend', 1.2, 2.8, 0.05], ['archLip', 'Arch lip', 0, 0.03, 0.001, 'm'],
    ['ledge', 'Shoulder ledge', 0, 0.08, 0.002, 'm'], ['hoodDome', 'Hood dome', 0, 0.06, 0.001, 'm'], ['peakF', 'Front fender peaks', 0, 0.12, 0.002, 'm'], ['peakR', 'Rear fender peaks', 0, 0.12, 0.002, 'm']]],
  ['Greenhouse', [['pillarCount', 'Side pillars', 0, 3, 1], ['pillarFan', 'Pillar fan', 0, 1, 0.01], ['pillarW', 'Side pillar width', 0.05, 0.2, 0.005, 'm'],
    ['aPillar', 'A-pillar width', 0.06, 0.4, 0.005, 'm'], ['cPillar', 'C-pillar width', 0.07, 1.2, 0.01, 'm'], ['cTaper', 'C-pillar taper', 0.1, 2, 0.01]]],
  ['Cabin', [['cabinBlend', 'Cockpit blend', 0, 0.08, 0.001, 'm'], ['cabinR', 'Roof rail radius', 0.006, 0.08, 0.001, 'm'], ['roofRound', 'Roof corner roundness', 0.02, 0.95, 0.01], ['baseRound', 'Base corner roundness', 0.02, 0.95, 0.01], ['wsCrown', 'Windshield wrap', 0, 0.2, 0.002, 'm'],
    ['blCrown', 'Backlight wrap', 0, 0.2, 0.002, 'm'], ['glassBulge', 'Glass bulge', 0, 0.06, 0.001, 'm'], ['sideBow', 'Side glass bow', 0, 0.06, 0.001, 'm'],
    ['roofCrown', 'Roof crown', 0, 0.06, 0.001, 'm'], ['roofArch', 'Roof arch', -0.02, 0.08, 0.001, 'm'], ['sillInset', 'Window sill', 0.005, 0.12, 0.001, 'm'],
    ['headerInset', 'Window header', 0.01, 0.15, 0.001, 'm']]],
  ['Rims', [['rimType', 'Style', 0, 4, 1], ['rimRatio', 'Rim size', 0.45, 0.82, 0.01], ['spokes', 'Spokes', 3, 12, 1]]],
  ['Roof', [['rfType', 'Style', 0, 3, 1], ['rfLen', 'Length', 0.4, 1, 0.01], ['rfWidth', 'Width', 0.5, 1, 0.01], ['rfH', 'Height', 0.04, 0.16, 0.002, 'm']]],
  ['Headlights', [['hlType', 'Style', 0, 7, 1], ['hlH', 'Height', 0, 1, 0.01], ['hlZ', 'Spread', 0.3, 0.95, 0.01], ['hlDepth', 'Stand-out', -0.08, 0.1, 0.002, 'm'],
    ['hlSize', 'Size', 0.6, 1.6, 0.01], ['hlSweep', 'Sweep', -10, 40, 1, 'deg'], ['hlRake', 'Rake', -10, 35, 1, 'deg'], ['hlAngle', 'Angle (aggression)', -30, 30, 1, 'deg'],
    ['hlBlend', 'Bezel width', 0.02, 0.4, 0.002, 'm'], ['hlRound', 'Bezel roundness', 0, 1, 0.01], ['hlMelt', 'Bezel melt', 0, 1, 0.01],
    ['hlCrown', 'Bezel fullness', -0.03, 0.06, 0.001, 'm']]],
  ['Tail lights', [['tlType', 'Style', 0, 7, 1], ['tlH', 'Height', 0, 1, 0.01], ['tlZ', 'Spread', 0.3, 0.95, 0.01], ['tlDepth', 'Stand-out', -0.08, 0.1, 0.002, 'm'],
    ['tlSize', 'Size', 0.6, 1.6, 0.01], ['tlSweep', 'Sweep', -10, 40, 1, 'deg'], ['tlRake', 'Rake', -10, 35, 1, 'deg'], ['tlAngle', 'Angle (aggression)', -30, 30, 1, 'deg'],
    ['tlBlend', 'Bezel width', 0.02, 0.4, 0.002, 'm'], ['tlRound', 'Bezel roundness', 0, 1, 0.01], ['tlMelt', 'Bezel melt', 0, 1, 0.01],
    ['tlCrown', 'Bezel fullness', -0.03, 0.06, 0.001, 'm']]],
  ['Fenders', [['fdType', 'Style', 0, 3, 1], ['fdWidth', 'Width', 0.04, 0.3, 0.002, 'm'], ['fdOut', 'Stand-out', 0.01, 0.15, 0.002, 'm'],
    ['fdLip', 'Lip overhang', 0, 0.05, 0.001, 'm'], ['fdWrap', 'Wrap down', 0, 1, 0.01], ['fdBlend', 'Blend width', 0.01, 0.15, 0.002, 'm']]],
  ['Body kit', [['kitF', 'Front bumper', 0, 3, 1], ['kitS', 'Side skirts', 0, 3, 1], ['kitR', 'Rear bumper', 0, 3, 1],
    ['kitH', 'Height', 0.05, 0.25, 0.002, 'm'], ['kitDrop', 'Drop', 0, 0.08, 0.001, 'm'], ['kitOut', 'Depth', 0.5, 2, 0.01], ['kitBlend', 'Blend width', 0.01, 0.1, 0.002, 'm']]],
  ['Trim', [['cladding', 'Cladding', 0, 0.14, 0.005, 'm']]],
  ['Finish', [['metal', 'Metallic', 0, 1, 0.01], ['rough', 'Roughness', 0.05, 0.8, 0.01]]],
];
const panels = { body: document.getElementById('params'), parts: document.getElementById('parts') };
const ATTACH = new Set(['Rims', 'Roof', 'Headlights', 'Tail lights', 'Fenders', 'Body kit']);
const inputs = {};
for (const [group, rows] of SPEC) {
  const det = document.createElement('details'), panel = panels[ATTACH.has(group) ? 'parts' : 'body'];
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
    out.textContent = k === 'hlType' ? LAMP_TYPES[v] : k === 'tlType' ? TAIL_TYPES[v] : k === 'fdType' ? FENDER_TYPES[v] : k === 'rimType' ? RIM_TYPES[v] : k === 'rfType' ? ROOF_TYPES[v] : k === 'archShape' ? ['Round', 'Angular'][v] : ['kitF', 'kitS', 'kitR'].includes(k) ? KIT_TYPES[v] : (+v).toFixed(step >= 1 ? 0 : step >= 0.01 ? 2 : 3) + (unit ? ` ${unit}` : '');
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
window.__car = { get P() { return P; }, set P(v) { P = v; }, get built() { return built; }, rebuild, camera, controls, renderer, scene };
