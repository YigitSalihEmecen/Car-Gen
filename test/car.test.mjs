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
    // the end stations collapse to a line or a point (zero-area faces): probe the winding elsewhere
    const st = Math.floor(i / 3 / meta.RL);
    if (p[i + 1] > maxY && st > 0 && st < p.length / 3 / meta.RL - 1) { maxY = p[i + 1]; roofI = i / 3; }
  }
  assert.ok(Math.abs(minX - meta.xF) < 1e-3 && Math.abs(maxX - meta.xR) < 1e-3, `${name}: length`);
  assert.ok(minY > 0.03, `${name}: body touches ground (${minY})`);
  assert.ok(maxZ < Math.max(P.width / 2 * 1.15, P.track / 2 + P.tireW / 2 + 0.015) + Math.max(P.flare, P.flareR) + P.archLip + P.crease + 0.03, `${name}: too wide (${maxZ})`);

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
  for (const [name, base] of cars) for (const type of [1, 2, 3, 4, 5, 6]) for (const end of ['front', 'rear']) {
    const P = clone(base); P.hlType = type; P.tlType = type;
    const car = buildCar(P), L = end === 'front' ? car.lights : car.tails, B = L.bezel, nT = B.cols, s = B.rows - 1;
    for (const part of ['bezel', 'housing', 'chrome', 'lens', 'led']) assert.ok(L[part].position.every(Number.isFinite), `${name}/${end}/${type}: ${part} not finite`);
    assert.equal(L.landed, nT, `${name}/${end}/${type}: ${nT - L.landed} rim points miss the body`);
    assert.ok(L.hole, `${name}/${end}/${type}: no skin cut`);
    // a rear bezel may stop on the tail crease or the lip (the face's edges), never far short of them
    if (!name.startsWith('random')) assert.ok(L.reach > (end === 'rear' ? 0.6 : 0.99), `${name}/${end}/${type}: default bezel width cut short (${L.reach.toFixed(2)})`);
    const { cast } = bodyMesh({ position: car.position, N: car.position.length / 3 / car.meta.RL, RL: car.meta.RL, xF: car.meta.xF, xR: car.meta.xR }, end);
    for (let c = 0; c < nT; c++) {
      const p = [0, 1, 2].map((a) => B.position[(s * nT + c) * 3 + a]), n = [0, 1, 2].map((a) => B.normal[(s * nT + c) * 3 + a]);
      // a gap shows; an edge tucked a few mm under the skin (in a concave step such as a bumper ledge) does not
      const h = cast(p.map((v, a) => v + n[a] * 0.006), n.map((v) => -v));
      assert.ok(h && h.t - 0.006 < 1e-3 && h.t - 0.006 > -4e-3, `${name}/${end}/${type}: bezel edge off the skin (col ${c}, ${h ? ((h.t - 0.006) * 1000).toFixed(1) + ' mm' : 'no hit'})`);
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


// fender flares: every style on every preset (and random bodies) lands on both arches; the painted blend starts exactly
// on the part's base edge and ends on the skin (no gaps), nothing is left non-finite
{
  const { bodyMesh } = await import('../src/lights.js');
  let seed6 = 23;
  const rng6 = () => ((seed6 = (seed6 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 10 }, (_, i) => [`random${i}`, randomCar(rng6)])];
  for (const [name, base] of cars) for (const type of [1, 2, 3]) {
    const P = clone(base); P.fdType = type;
    const car = buildCar(P), F = car.fenders;
    assert.ok(F.shell && F.blend, `${name}/${type}: no flare`);
    for (const part of ['shell', 'blend', 'hardware']) if (F[part]) assert.ok(F[part].position.every(Number.isFinite), `${name}/${type}: ${part} not finite`);
    assert.ok(F.landed > 0.6 * F.cols, `${name}/${type}: only ${F.landed}/${F.cols} arch columns landed`);
    for (const { part, blend } of F.edge) assert.ok(Math.hypot(...part.map((v, a) => v - blend[a])) < 1e-9, `${name}/${type}: blend detached from the part`);
    const { cast } = bodyMesh({ position: car.position, N: car.position.length / 3 / car.meta.RL, RL: car.meta.RL, xF: car.meta.xF, xR: car.meta.xR }, [-5, 10]);
    for (const { p, n } of F.rim) {
      const h = cast(p.map((v, a) => v + n[a] * 0.02), n.map((v) => -v));
      assert.ok(h && Math.abs(h.t - 0.02) < 1e-3, `${name}/${type}: blend edge off the skin (${h ? ((h.t - 0.02) * 1000).toFixed(1) + ' mm' : 'no hit'})`);
    }
  }
  console.log('ok fender flares: rigid part, blend lands on the skin');
}

// body kit: every set on every preset (and random bodies) builds its pieces; the blend starts exactly on each part's top
// edge and ends on the skin, nothing reaches the ground, nothing is non-finite
{
  const { bodyMesh } = await import('../src/lights.js');
  const { KIT_SWEEP, KIT_LATHE } = await import('../src/kit.js');
  let seed7 = 29;
  const rng7 = () => ((seed7 = (seed7 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 10 }, (_, i) => [`random${i}`, randomCar(rng7)])];
  for (const [name, base] of cars) for (const type of [1, 2, 3, 4, 5]) {
    const P = clone(base); P.kitF = P.kitS = P.kitR = type;
    const car = buildCar(P), K = car.kit;
    assert.ok(K.pieces >= 2 && K.blend, `${name}/${type}: only ${K.pieces} kit pieces`);
    if (type > 3) for (const k of KIT_SWEEP) if (K[k]) assert.equal(openEdges(K[k]), 0, `${name}/${type}: kit ${k} is not a closed mesh`);
    for (const part of [...KIT_SWEEP, ...KIT_LATHE, 'blend']) {
      if (!K[part]) continue;
      assert.ok(K[part].position.every(Number.isFinite), `${name}/${type}: kit ${part} not finite`);
      const q = K[part].position, m = car.meta;
      for (let i = 0; i < q.length; i += 3) {
        assert.ok(q[i + 1] > 0.02, `${name}/${type}: kit ${part} reaches the ground`);
        assert.ok(q[i] > m.xF - 0.15 && q[i] < m.xR + 0.15 && Math.abs(q[i + 2]) < m.W0 * 1.2 + 0.1, `${name}/${type}: kit ${part} escapes the car at ${[q[i], q[i + 1], q[i + 2]].map((v) => v.toFixed(2))}`);
      }
    }
    for (const { part, blend } of K.tops) assert.ok(Math.hypot(...part.map((v, a) => v - blend[a])) < 1e-9, `${name}/${type}: kit blend detached from its part`);
    const { cast } = bodyMesh({ position: car.position, N: car.position.length / 3 / car.meta.RL, RL: car.meta.RL, xF: car.meta.xF, xR: car.meta.xR }, [-5, 10]);
    for (const { p, n } of K.rim) {
      // bumper centre points lie on z = 0, the seam between mirrored triangles: the probe ray starts 0.1 mm to one side
      const h = cast(p.map((v, a) => v + n[a] * 0.02 + (a === 2 ? 1e-4 : 0)), n.map((v) => -v));
      assert.ok(h && Math.abs(h.t - 0.02) < 1e-3, `${name}/${type}: kit blend edge off the skin (${h ? ((h.t - 0.02) * 1000).toFixed(1) + ' mm' : 'no hit'})`);
    }
  }
  console.log('ok body kit: rigid parts, blend lands on the skin');
}

// closed mesh: after welding coincident vertices, every edge is shared by exactly two triangles
function openEdges({ position: p, index: idx }) {
  const ids = new Map(), vid = (i) => { const k = `${Math.round(p[3 * i] * 2e4)},${Math.round(p[3 * i + 1] * 2e4)},${Math.round(p[3 * i + 2] * 2e4)}`; if (!ids.has(k)) ids.set(k, ids.size); return ids.get(k); };
  const edges = new Map();
  for (let f = 0; f < idx.length; f += 3) {
    const v = [vid(idx[f]), vid(idx[f + 1]), vid(idx[f + 2])];
    if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
    for (let k = 0; k < 3; k++) { const a = v[k], b = v[(k + 1) % 3], e = a < b ? `${a}_${b}` : `${b}_${a}`; edges.set(e, (edges.get(e) || 0) + 1); }
  }
  let open = 0; for (const c of edges.values()) if (c === 1) open++;
  return open;
}

// roof attachments: every style on every preset (and random bodies) stands on the roof; parts are closed and finite,
// every pad is seated on the roof skin and nothing hangs below it
{
  const { ROOF_PARTS } = await import('../src/roof.js');
  const { KIT_SWEEP } = await import('../src/kit.js');
  let seed8 = 37;
  const rng8 = () => ((seed8 = (seed8 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 8 }, (_, i) => [`random${i}`, randomCar(rng8)])];
  for (const [name, base] of cars) for (const type of [1, 2, 3]) {
    const P = clone(base); P.rfType = type; P.kitF = P.kitS = P.kitR = type;
    const car = buildCar(P), R = car.rack;
    assert.ok(R, `${name}/${type}: no roof attachment`);
    let minY = Infinity;
    for (const k of ROOF_PARTS) for (const part of [R[k], R[`${k}_l`]]) {
      if (!part) continue;
      assert.ok(part.position.every(Number.isFinite), `${name}/${type}: roof ${k} not finite`);
      for (let i = 1; i < part.position.length; i += 3) minY = Math.min(minY, part.position[i]);
      if (R[k] === part) assert.equal(openEdges(part), 0, `${name}/${type}: roof ${k} is not a closed mesh`);
    }
    // pads tilt with the roof crown, so their low corners may sit a little under the foot centre
    assert.ok(minY > Math.min(...R.feet.map((f) => f.y)) - 0.02, `${name}/${type}: roof part hangs below the feet`);
    for (const k of KIT_SWEEP) if (car.kit[k]) assert.equal(openEdges(car.kit[k]), 0, `${name}/${type}: kit ${k} is not a closed mesh`);
  }
  console.log('ok roof attachments seated and closed; kit parts closed');
}

// full-width light bars: build on every preset and random body at both ends, closed and finite, within the car's length
{
  let seed9 = 43;
  const rng9 = () => ((seed9 = (seed9 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 10 }, (_, i) => [`random${i}`, randomCar(rng9)])];
  for (const [name, base] of cars) {
    const P = clone(base); P.hlType = 7; P.tlType = 7;
    const car = buildCar(P), m = car.meta;
    for (const end of ['front', 'rear']) {
      const B = car.bars[end];
      assert.ok(B, `${name}: no ${end} light bar`);
      for (const part of ['housing', 'core', 'lens']) {
        const q = B[part].position;
        assert.ok(q.every(Number.isFinite), `${name}/${end}: light bar ${part} not finite`);
        assert.equal(openEdges(B[part]), 0, `${name}/${end}: light bar ${part} is not a closed mesh`);
        for (let i = 0; i < q.length; i += 3) assert.ok(q[i] > m.xF - 0.03 && q[i] < m.xR + 0.03, `${name}/${end}: light bar sticks out of the car`);
      }
    }
  }
  console.log('ok full-width light bars closed and on the body');
}

// roof is never shorter than ROOF_MIN; plan width never under PLAN_MIN
{
  const { ROOF_MIN, PLAN_MIN, sToX } = await import('../src/car.js');
  let seed10 = 47;
  const rng10 = () => ((seed10 = (seed10 * 16807) % 2147483647) / 2147483647);
  for (const P of [...Object.values(PRESETS).map((p) => sanitize(clone(p))), ...Array.from({ length: 30 }, () => randomCar(rng10))]) {
    assert.ok(sToX(P, P.profile[4][0]) - sToX(P, P.profile[3][0]) >= ROOF_MIN - 1e-6, 'roof shorter than ROOF_MIN');
    assert.ok(P.plan.every((p) => p[1] >= PLAN_MIN - 1e-9), 'plan width under PLAN_MIN');
  }
  console.log('ok roof length and plan width minimums hold');
}

// fenders rise gradually: along the car the side never slopes in or out faster than 1:1 around the arches (a pinched,
// near-vertical bulge read as a pulled-up blister)
{
  let seed11 = 53;
  const rng11 = () => ((seed11 = (seed11 * 16807) % 2147483647) / 2147483647);
  for (const [name, P] of [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 12 }, (_, i) => [`random${i}`, randomCar(rng11)])]) {
    const g = buildCar(P, { detail: 0.6 }), o = g.outline, p = g.position, RL = g.meta.RL, { bf, bc, side } = g.ring, m = g.meta;
    // half width at a fixed height, read off a station's side rows (monotone in height there)
    const widthAt = (i, zt) => {
      for (let q = bf + bc; q < bf + bc + side - 1; q++) {
        const a = (i * RL + q) * 3, b = (i * RL + q + 1) * 3;
        if ((p[a + 1] - zt) * (p[b + 1] - zt) <= 0 && p[a + 1] !== p[b + 1]) return p[a + 2] + ((p[b + 2] - p[a + 2]) * (zt - p[a + 1])) / (p[b + 1] - p[a + 1]);
      }
      return null;
    };
    let worst = 0;
    // toward the doors from each arch (the nose and tail taper on purpose), at heights beside and over the wheel
    for (const [xw, dir] of [[0, 1], [m.wb, -1]]) for (const zt of [m.R, m.R + 0.5 * m.Ra, m.R + m.Ra + 0.04]) {
      let prev = null;
      for (let i = 0; i < o.x.length; i++) {
        const d = (o.x[i] - xw) * dir;
        if (d < m.Ra + 0.04 || d > m.Ra + 0.6) continue;
        const w = widthAt(i, zt);
        if (w !== null && prev && o.x[i] - prev[0] > 0.004) worst = Math.max(worst, Math.abs(w - prev[1]) / (o.x[i] - prev[0]));
        if (w !== null) prev = [o.x[i], w]; else prev = null;
      }
    }
    assert.ok(worst < 1, `${name}: fender flank slopes ${worst.toFixed(2)} along the car`);
  }
  console.log('ok fenders rise gradually');
}

// accessories: every style of every accessory on every preset (and random bodies) builds, stays finite and inside the
// car's envelope; plates sit on the tail face, exhaust tips reach past the skin behind them, mirrors stand off the side
{
  const { bodyMesh } = await import('../src/lights.js');
  const KINDS = { plates: ['plateType', 5], exhaust: ['exType', 3], spoiler: ['spType', 5], mirrors: ['mrType', 3], antenna: ['anType', 4], grille: ['grType', 5], hood: ['hdType', 4] };
  // parts that need room a body may not have (a deck behind the glass, a hood long enough) may be skipped there
  const OPTIONAL = new Set(['spoiler', 'hood']);
  let seed12 = 61;
  const rng12 = () => ((seed12 = (seed12 * 16807) % 2147483647) / 2147483647);
  const cars = [...Object.entries(PRESETS).map(([k, p]) => [k, sanitize(clone(p))]), ...Array.from({ length: 8 }, (_, i) => [`random${i}`, randomCar(rng12)])];
  for (const [name, base] of cars) for (const [group, [key, n]] of Object.entries(KINDS)) for (let type = 1; type <= n; type++) {
    const P = clone(base); P[key] = type;
    const car = buildCar(P, { detail: 0.4 }), A = car[group], m = car.meta, roofTop = Math.max(...car.cabin.profile.map((q) => q[1]));
    if (!A) { assert.ok(OPTIONAL.has(group) || name.startsWith('random'), `${name}: no ${group} of style ${type}`); continue; }
    for (const k in A) {
      const q = A[k]?.position;
      if (!q) continue;
      for (let i = 0; i < q.length; i += 3) {
        assert.ok(Number.isFinite(q[i] + q[i + 1] + q[i + 2]), `${name}: ${group}/${type} ${k} not finite`);
        assert.ok(q[i + 1] > 0.02 && q[i + 1] < roofTop + 1.1, `${name}: ${group}/${type} ${k} at height ${q[i + 1].toFixed(3)}`);
        assert.ok(q[i] > m.xF - 0.3 && q[i] < m.xR + 0.3 && Math.abs(q[i + 2]) < m.W0 * 1.4, `${name}: ${group}/${type} ${k} escapes the car at ${[q[i], q[i + 1], q[i + 2]].map((v) => v.toFixed(2))}`);
      }
    }
    if (group === 'plates' && A.rear) assert.ok(A.rear.y0 > m.tail.zTk - 0.01 && A.rear.y1 < m.tail.zLip + 0.01, `${name}: rear plate off the tail face`);
    if (group === 'exhaust') {
      const { cast } = bodyMesh({ position: car.position, N: car.position.length / 3 / m.RL, RL: m.RL, xF: m.xF, xR: m.xR }, 'rear'), q = A.chrome.position;
      let tip = 0; for (let i = 3; i < q.length; i += 3) if (q[i] > q[tip]) tip = i;
      const h = cast([m.xR + 1, q[tip + 1], q[tip + 2]], [-1, 0, 0]);
      assert.ok(!h || q[tip] > h.p[0] + 0.003, `${name}: exhaust ${type} tip buried in the body`);
    }
    if (group === 'mirrors') { const wx = Math.max(...car.outline.wmax.filter((_, i) => Math.abs(car.outline.x[i] - m.xA - 0.2) < 0.2)); assert.ok(Math.max(...A.mirror.position.filter((_, i) => i % 3 === 2)) > wx + 0.02, `${name}: mirror ${type} does not clear the body side`); }
  }
  console.log('ok accessories: every style builds, finite, inside the car, seated');
}
