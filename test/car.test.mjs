import assert from 'node:assert/strict';
import { PRESETS, buildCar, randomCar, clone, sanitize } from '../src/car.js';

let seed = 7;
const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cases = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 40 }, (_, i) => [`random${i}`, randomCar(rng)])];

for (const [name, P] of cases) {
  const t0 = performance.now();
  const { position: p, index, meta } = buildCar(P);
  const ms = performance.now() - t0;
  assert.ok(p.every(Number.isFinite), `${name}: non-finite vertex`);
  assert.ok(index.every((i) => i < p.length / 3), `${name}: index out of range`);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = 0, maxZ = 0, roofI = 0;
  for (let i = 0; i < p.length; i += 3) {
    minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]);
    minY = Math.min(minY, p[i + 1]); maxZ = Math.max(maxZ, Math.abs(p[i + 2]));
    if (p[i + 1] > maxY) { maxY = p[i + 1]; roofI = i / 3; }
  }
  assert.ok(Math.abs(minX - meta.xF) < 1e-3 && Math.abs(maxX - meta.xR) < 1e-3, `${name}: length`);
  assert.ok(minY > 0.03, `${name}: body touches ground (${minY})`);
  assert.ok(maxZ < Math.max(P.width / 2 * 1.15, P.track / 2 + P.tireW / 2 + 0.015) + Math.max(P.flare, P.flareR) + P.archLip + P.crease + 0.02, `${name}: too wide (${maxZ})`);

  // outward winding: faces touching the highest vertex must point up
  let ny = 0;
  for (let f = 0; f < index.length; f += 3) {
    if (![index[f], index[f + 1], index[f + 2]].includes(roofI)) continue;
    const [a, b, c] = [index[f], index[f + 1], index[f + 2]].map((v) => [p[3 * v], p[3 * v + 1], p[3 * v + 2]]);
    const u = b.map((v, k) => v - a[k]), w = c.map((v, k) => v - a[k]);
    ny += u[2] * w[0] - u[0] * w[2];
  }
  assert.ok(ny > 0, `${name}: inward winding`);
  if (!name.startsWith('random')) console.log(`ok ${name.padEnd(9)} ${(p.length / 3) | 0} verts  ${ms.toFixed(1)} ms`);
}
console.log(`all ${cases.length} cases passed`);

// top view must not be a box: the nose has to be narrower than the body at the front axle
{
  const P = sanitize(clone(PRESETS.supercar));
  const { outline: o } = buildCar(P);
  const at = (x) => o.wmax[o.x.findIndex((v) => v >= x)];
  assert.ok(at(-P.overhangF * 0.85) < at(0.4) * 0.92, 'plan taper missing at nose');
  assert.ok(at(P.wheelbase / 2) < at(P.wheelbase) - 0.02, 'supercar waist missing in plan');
  console.log('ok plan view shaping');
}

// cabin: every preset gets a windshield, a backlight and side glass; the windshield reads as a straight line in side view
for (const [name, base] of Object.entries(PRESETS)) {
  const P = sanitize(clone(base));
  const { cabin, meta: m } = buildCar(P);
  assert.ok(cabin.hasShield && cabin.hasBacklight && cabin.windows >= 1, `${name}: missing glass`);
  for (const part of ['wall', 'roof', 'glass', 'gasket']) assert.ok(cabin[part].position.every(Number.isFinite), `${name}: ${part} not finite`);
  const pts = cabin.profile.filter(([x]) => x > m.xA + 0.25 * (m.xRF - m.xA) && x < m.xA + 0.75 * (m.xRF - m.xA));
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dev = Math.max(...pts.map(([x, y]) => Math.abs(y - (a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])))));
  assert.ok(dev < 0.012 + P.glassBulge, `${name}: windshield bows ${(dev * 1000).toFixed(1)} mm`);
}
console.log('ok cabin glass and windshield line');

// surface fairness above the beltline: pillar bases used to pinch into a staircase (35-64 deg zigzag)
{
  const { upperFairness } = await import('./smooth.mjs');
  let seed2 = 11;
  const rng2 = () => ((seed2 = (seed2 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 20 }, (_, i) => [`random${i}`, randomCar(rng2)])];
  for (const [name, P] of cars) {
    const { worst, at } = upperFairness(P);
    assert.ok(worst < 16, `${name}: surface zigzag ${worst.toFixed(1)} deg at ${JSON.stringify(at)}`);
  }
  console.log('ok greenhouse fairness');
}

// minimum detail: PS1-grade budget, still a valid closed body with glass
{
  let seed3 = 5;
  const rng3 = () => ((seed3 = (seed3 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 20 }, (_, i) => [`random${i}`, randomCar(rng3)])];
  for (const [name, P] of cars) {
    const g = buildCar(P, { detail: 0 }), c = g.cabin;
    const parts = [g, c.wall, c.roof, c.glass, c.gasket];
    assert.ok(parts.every((m) => m.position.every(Number.isFinite)), `${name}: non-finite at detail 0`);
    const tris = parts.reduce((s, m) => s + m.index.length / 3, 0);
    assert.ok(tris < 1500, `${name}: ${tris} tris at detail 0`);
    assert.ok(c.hasShield, `${name}: no windshield at detail 0`);
  }
  console.log('ok detail 0 budget');
}

// a small / narrow glass house must flatten its bows instead of pinching the pillars and windows
{
  const { upperFairness } = await import('./smooth.mjs');
  for (const name of ['sedan', 'coupe', 'supercar']) {
    const P = sanitize(clone(PRESETS[name]));
    P.cabin = [1, 0.42, 0.4, 1];
    const { cabin } = buildCar(P);
    assert.ok(cabin.hasShield && cabin.hasBacklight && cabin.windows >= 1, `${name}: narrow roof lost its glass`);
    const roof = cabin.planRoof, xs = roof.map((p) => p[0]), front = Math.min(...xs);
    // windshield top edge: how far the centre leads the pillar corners, relative to the roof half width
    const half = Math.max(...roof.map((p) => p[1]));
    const corner = roof.filter((p) => Math.abs(p[1]) > 0.7 * half).reduce((m, p) => Math.min(m, p[0]), Infinity);
    assert.ok(corner - front < 0.35 * half, `${name}: windshield top pinched (${((corner - front) / half).toFixed(2)} of width)`);
    assert.ok(upperFairness(P).worst < 16, `${name}: body zigzag with narrow roof`);
  }
  console.log('ok narrow roof does not pinch');
}

// a small roof stays a rounded rectangle: its front edge is straight across most of the width (no oval)
{
  for (const name of ['sedan', 'hatch', 'supercar']) {
    const P = sanitize(clone(PRESETS[name]));
    P.cabin = [1, 0.42, 0.4, 1];
    P.profile[4][0] = P.profile[3][0] + 0.14; // short roof
    sanitize(P);
    const roof = buildCar(P).cabin.planRoof;
    const front = Math.min(...roof.map((p) => p[0])), half = Math.max(...roof.map((p) => p[1]));
    const flat = roof.filter((p) => p[0] - front < 0.012).map((p) => Math.abs(p[1]));
    const share = Math.max(...flat) / half;
    assert.ok(share > 1 - P.roofRound - 0.15, `${name}: small roof front edge is curved (straight share ${share.toFixed(2)})`);
  }
  console.log('ok small roof stays rectangular');
}

// head and tail lights: every lamp style on every preset (and random bodies) seats on the skin; the bezel ends on the skin
{
  const { bodyMesh } = await import('../src/lights.js');
  let seed4 = 3;
  const rng4 = () => ((seed4 = (seed4 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 10 }, (_, i) => [`random${i}`, randomCar(rng4)])];
  for (const [name, base] of cars) for (const type of [1, 2, 3]) for (const end of ['front', 'rear']) {
    const P = clone(base); P.hlType = type; P.tlType = type;
    const car = buildCar(P), L = end === 'front' ? car.lights : car.tails, B = L.bezel, nT = B.cols, s = B.rows - 1;
    for (const part of ['bezel', 'housing', 'chrome', 'lens', 'led']) assert.ok(L[part].position.every(Number.isFinite), `${name}/${end}/${type}: ${part} not finite`);
    assert.equal(L.landed, nT, `${name}/${end}/${type}: ${nT - L.landed} rim points miss the body`);
    assert.ok(L.hole, `${name}/${end}/${type}: no skin cut`);
    if (!name.startsWith('random')) assert.ok(L.reach > 0.99, `${name}/${end}/${type}: default bezel width cut short (${L.reach.toFixed(2)})`);
    const { cast } = bodyMesh({ position: car.position, N: car.position.length / 3 / car.meta.RL, RL: car.meta.RL, xF: car.meta.xF, xR: car.meta.xR }, end);
    for (let c = 0; c < nT; c++) {
      const p = [0, 1, 2].map((a) => B.position[(s * nT + c) * 3 + a]), n = [0, 1, 2].map((a) => B.normal[(s * nT + c) * 3 + a]);
      const h = cast(p.map((v, a) => v + n[a] * 0.02), n.map((v) => -v));
      assert.ok(h && Math.abs(h.t - 0.02) < 1e-3, `${name}/${end}/${type}: bezel edge off the skin (col ${c}, ${h ? ((h.t - 0.02) * 1000).toFixed(1) + ' mm' : 'no hit'})`);
    }
  }
  console.log('ok head and tail light bezels seat and end on the skin');
}

// greenhouse is engineered: every pillar / glass edge is straight in side view, no pillar thinner than its minimum
{
  const { MIN_A, MIN_PILLAR, MIN_C } = await import('../src/cabin.js');
  let seed5 = 19;
  const rng5 = () => ((seed5 = (seed5 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 20 }, (_, i) => [`random${i}`, randomCar(rng5)])];
  const bow = (pts) => {
    const [a, b] = [pts[0], pts[pts.length - 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return Math.max(...pts.map(([x, y]) => Math.abs((b[0] - a[0]) * (a[1] - y) - (a[0] - x) * (b[1] - a[1])) / L));
  };
  for (const [name, P] of cars) {
    const e = buildCar(P).cabin.edit;
    for (const [label, line] of [['A edge', e.aLine], ['C edge', e.cLine], ...e.pillarLines.map((l, i) => [`pillar ${i + 1}`, l])]) {
      assert.ok(bow(line) < 0.003, `${name}: ${label} bows ${(bow(line) * 1000).toFixed(1)} mm in side view`);
    }
    for (const t of [e.t0, (e.t0 + e.t1) / 2, e.t1]) {
      assert.ok(e.sA(t) - e.front(t) >= MIN_A / 2 - 1e-3, `${name}: A pillar thinner than ${MIN_A} m`);
      assert.ok(e.rear(t) - e.sC(t) >= MIN_C - 0.02, `${name}: C pillar thinner than ${MIN_C} m`);
    }
    assert.ok(P.pillarW >= MIN_PILLAR, `${name}: side pillar below minimum`);
  }
  console.log('ok greenhouse edges straight, pillars above minimum width');
}

