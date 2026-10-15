// Roof attachments: aero crossbars, a cargo box on crossbars, an expedition basket with a light bar. Everything stands
// on four rubber-padded feet; each foot is placed by a ray down onto the cabin's roof skin and its pad is tilted to the
// roof normal and sunk a few millimetres into it, so it sits flush on any crown. Above the feet the parts are rigid,
// level and symmetric. Closed sweeps (filleted sections with rounded, capped ends) and closed lathes throughout.
import { mesh, lathe } from './lights.js';
import { roundPoly, pushTube, place } from './kit.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lod = (d, lo, hi) => Math.max(lo, Math.round(lerp(lo, hi, clamp(d, 0, 1) ** 1.5)));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const quarter = (t) => { t = clamp(t, 0, 1); return Math.sqrt(1 - (1 - t) ** 2); };
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

export const ROOF_TYPES = ['None', 'Crossbars', 'Cargo box', 'Expedition'];
export const ROOF_PARTS = ['metal', 'plastic', 'rubber', 'box', 'frame', 'lens', 'led', 'chrome'];

// ray straight down onto a triangle mesh (the roof skin): highest hit and its face normal
export function castDown({ position: p, index: idx }, x, z) {
  let best = null;
  for (let f = 0; f < idx.length; f += 3) {
    const a = 3 * idx[f], b = 3 * idx[f + 1], c = 3 * idx[f + 2];
    const ax = p[a], az = p[a + 2], bx = p[b], bz = p[b + 2], cx = p[c], cz = p[c + 2];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * p[a + 1] + l2 * p[b + 1] + l3 * p[c + 1];
    if (best && y <= best.y) continue;
    let n = unit(cross(sub([bx, p[b + 1], bz], [ax, p[a + 1], az]), sub([cx, p[c + 1], cz], [ax, p[a + 1], az])));
    if (n[1] < 0) n = mul(n, -1);
    best = { y, n };
  }
  return best;
}

// ---------- sweep helpers ----------
// columns along a straight axis E from s0 to s1 (frame A, B across), section(s) -> [[a, b, r]], rounded capped ends
// shrink: how far the end roll closes the section (rounded ends; near 1 closes it to a point)
export function bar(M, origin, E, A, B, s0, s1, section, seg, step, roll = 0.004, shrink = 0.45) {
  const L = s1 - s0, ss = new Set();
  const n = Math.max(2, Math.ceil(L / step));
  for (let i = 0; i <= n; i++) ss.add(s0 + (L * i) / n);
  for (const f of [0.04, 0.15, 0.3, 0.5, 0.7, 1]) { ss.add(s0 + roll * f); ss.add(s1 - roll * f); }
  const cols = [...ss].filter((s) => s >= s0 && s <= s1).sort((a, b) => a - b);
  const rings = cols.map((s) => {
    const poly = roundPoly(section(s), seg), cen = poly.reduce((a, q) => [a[0] + q[0] / poly.length, a[1] + q[1] / poly.length], [0, 0]);
    const ext = Math.max(...poly.map((q) => Math.hypot(q[0] - cen[0], q[1] - cen[1]))), dd = Math.min(s - s0, s1 - s);
    const k = 1 - (1 - quarter(dd / roll)) * (shrink > 0.5 ? shrink : Math.min(roll / ext, shrink));
    return poly.map(([a, b]) => add(add(add(origin, mul(E, s)), mul(A, cen[0] + (a - cen[0]) * k)), mul(B, cen[1] + (b - cen[1]) * k)));
  });
  pushTube(M, rings);
}
// round tube along a polyline (closed loop or open with capped ends)
export function tube(M, path, r, segs, loop) {
  const n = path.length;
  const rings = path.map((p, i) => {
    const T = unit(sub(path[loop ? (i + 1) % n : Math.min(i + 1, n - 1)], path[loop ? (i + n - 1) % n : Math.max(i - 1, 0)]));
    const ref = Math.abs(dot(T, Y)) > 0.9 ? X : Y, Nn = unit(cross(T, ref)), Bn = cross(Nn, T);
    return Array.from({ length: segs }, (_, k) => { const a = (2 * Math.PI * k) / segs; return add(p, add(mul(Nn, r * Math.cos(a)), mul(Bn, r * Math.sin(a)))); });
  });
  pushTube(M, rings, { wrap: loop });
}
// plan outline of a rounded rectangle, as a closed list of [x, z]
const planLoop = (x0, x1, zw, rc, seg) => roundPoly([[x0, -zw, rc], [x1, -zw, rc], [x1, zw, rc], [x0, zw, rc]], seg);

export function buildRoof(P, cabin, detail = 1) {
  if (!P.rfType || !cabin?.roof?.index?.length) return null;
  const S = Object.fromEntries(ROOF_PARTS.map((k) => [k, { p: [], i: [], n: [] }]));
  const L = Object.fromEntries(ROOF_PARTS.map((k) => [k, mesh()]));
  const seg = lod(detail, 1, 4), step = lerp(0.06, 0.02, clamp(detail, 0, 1) ** 1.5), tseg = lod(detail, 6, 16);

  // roof extent from the cabin's top outline
  const out = cabin.planRoof, rx0 = Math.min(...out.map((q) => q[0])), rx1 = Math.max(...out.map((q) => q[0]));
  const halfAt = (x) => {
    let w = 0;
    for (let i = 0; i < out.length; i++) {
      const [ax, az] = out[i], [bx, bz] = out[(i + 1) % out.length];
      if ((ax - x) * (bx - x) <= 0 && ax !== bx) w = Math.max(w, Math.abs(lerp(az, bz, (x - ax) / (bx - ax))));
    }
    return w;
  };
  const xc = (rx0 + rx1) / 2, Lr = P.rfLen * (rx1 - rx0) * 0.9;
  // feet move in from the ends until the roof under both of them is within ~16 deg of level: a pad tilted to a steep
  // roof roll hangs its low corner well below the foot
  const level = (x) => [-1, 1].every((s) => (castDown(cabin.roof, x, s * halfAt(x) * P.rfWidth * 0.94)?.n[1] ?? 0) > 0.96);
  const xs = [xc - 0.4 * Lr, xc + 0.4 * Lr].map((x) => { for (let i = 0; i < 12 && !level(x); i++) x = lerp(x, xc, 0.15); return x; });
  const zF = Math.min(...xs.map((x) => halfAt(x))) * P.rfWidth * 0.94;
  if (zF < 0.15 || Lr < 0.18) return null;
  const feet = [];
  for (const x of xs) for (const z of [-zF, zF]) { const h = castDown(cabin.roof, x, z); if (!h) return null; feet.push({ x, z, ...h }); }
  const yBar = Math.max(...feet.map((f) => f.y)) + P.rfH;

  // feet: a rubber pad tilted to the roof, then a tapering tower that rights itself to vertical under the bar
  for (const f of feet) {
    const col = (t) => {
      const up = unit(lerp3(f.n, Y, smooth(t))), A = unit(sub(X, mul(up, dot(X, up)))), B = cross(A, up);
      return { up, A, B };
    };
    const towerRing = (t, y, ax, az, r) => { const { A, B } = col(t), c = [f.x, y, f.z]; return roundPoly([[-ax, -az, r], [ax, -az, r], [ax, az, r], [-ax, az, r]], seg).map(([a, b]) => add(c, add(mul(A, a), mul(B, b)))); };
    const base = f.y - 0.004, pad = [0, 0.25, 0.6, 1].map((t) => towerRing(0, base + t * 0.01, 0.042, 0.022 + 0.002 * Math.sin(Math.PI * t), 0.012));
    pushTube(S.rubber, pad);
    const tw = [0, 0.2, 0.45, 0.7, 0.9, 1].map((t) => towerRing(t, lerp(base + 0.009, yBar + 0.008, t), lerp(0.038, 0.026, t), lerp(0.02, 0.016, t), lerp(0.012, 0.007, t)));
    pushTube(S.plastic, tw);
  }

  // aero crossbars: a filleted wing section swept across, with black end caps
  const wing = () => [[-0.036, 0, 0.012], [-0.012, 0.011, 0.02], [0.028, 0.006, 0.012], [0.04, 0, 0.003], [0.028, -0.006, 0.012], [-0.012, -0.01, 0.016]];
  const zE = zF + 0.06;
  for (const x of xs) {
    bar(S.metal, [x, yBar, 0], Z, X, Y, -zE + 0.012, zE - 0.012, wing, seg, step);
    for (const sgn of [-1, 1]) bar(S.plastic, [x, yBar, 0], Z, X, Y, sgn > 0 ? zE - 0.016 : -zE, sgn > 0 ? zE : -zE + 0.016, () => wing().map(([a, b, r]) => [a * 1.06, b * 1.15, r]), seg, 0.008, 0.007);
  }

  if (P.rfType === 2) {
    // cargo box: lofted rounded-rectangle sections, a low tapered nose, rounded tail, a lid seam and a lock
    const Lb = Math.min(2, Lr * 1.25 + 0.2), Wb = Math.min(0.92, 2 * zF * 0.98), Hb = clamp(0.36 * P.rfLen + 0.04, 0.22, 0.4), yB = yBar + 0.012;
    const x0 = xc - Lb * 0.52, n = lod(detail, 12, 64);
    const se = (t, m = 2.4) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(1 - Math.pow(1 - t, m), 1 / m));
    const shape = (u) => {
      const a = (Wb / 2) * lerp(0.7, 1, se(u / 0.38)) * lerp(1, 0.86, smooth((u - 0.78) / 0.22));
      const hh = Hb * lerp(0.3, 1, se(u / 0.5)) * lerp(1, 0.72, smooth((u - 0.82) / 0.18)), bl = 0.035 * (1 - se(u / 0.3));
      return { a, hh, bl };
    };
    const sec = (u) => { const { a, hh, bl } = shape(u), rt = Math.min(0.12, hh * 0.42, a * 0.4); return [[-a, yB + bl, 0.03], [a, yB + bl, 0.03], [a, yB + bl + hh, rt], [-a, yB + bl + hh, rt]]; };
    bar(S.box, [x0, 0, 0], X, Z, Y, 0, Lb, (s) => sec(s / Lb), seg, Lb / n, 0.14, 0.94);
    // lid seam: a dark bead running round the box at a little under half height
    const seam = [];
    const K = lod(detail, 16, 60);
    for (const sgn of [1, -1]) for (let i = 0; i <= K; i++) {
      const u = sgn > 0 ? i / K : 1 - i / K, { a, hh, bl } = shape(clamp(u, 0.03, 0.97)), x = x0 + clamp(u, 0.03, 0.97) * Lb;
      seam.push([x, yB + bl + 0.42 * hh, sgn * (a + 0.0005)]);
    }
    tube(S.plastic, seam, 0.0035, 6, true);
    const lu = 0.985, lk = shape(lu);
    bar(S.plastic, [x0 + Lb * lu - 0.012, yB + lk.bl + 0.42 * lk.hh, 0], X, Z, Y, 0, 0.03, () => [[-0.03, -0.016, 0.006], [0.03, -0.016, 0.006], [0.03, 0.016, 0.006], [-0.03, 0.016, 0.006]], seg, 0.01, 0.004);
  } else if (P.rfType === 3) {
    // expedition basket: a tubular perimeter frame and a raised rail on uprights, flat floor slats, a front light bar
    const xa = xc - Lr * 0.55, xb = xc + Lr * 0.5, zw = zF + 0.03, rc = 0.07, yL = yBar + 0.022, yU = yL + 0.085;
    const lower = planLoop(xa, xb, zw, rc, Math.max(3, seg * 2)).map(([x, z]) => [x, yL, z]);
    const upper = planLoop(xa + 0.012, xb - 0.012, zw - 0.012, rc, Math.max(3, seg * 2)).map(([x, z]) => [x, yU, z]);
    const dense = (loop) => { const o = []; for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length], k = Math.max(1, Math.ceil(Math.hypot(...sub(b, a)) / step)); for (let j = 0; j < k; j++) o.push(lerp3(a, b, j / k)); } return o.filter((q, i, arr) => Math.hypot(...sub(q, arr[(i + 1) % arr.length])) > 1e-5); };
    tube(S.frame, dense(lower), 0.014, tseg, true);
    tube(S.frame, dense(upper), 0.012, tseg, true);
    // uprights spaced evenly along the sides and ends
    const ups = [];
    const nx = Math.max(2, Math.round((xb - xa) / 0.3)), nz = Math.max(2, Math.round((2 * zw) / 0.3));
    for (let i = 0; i <= nx; i++) for (const z of [-zw + 0.006, zw - 0.006]) ups.push([lerp(xa + rc, xb - rc, i / nx), z]);
    for (let i = 1; i < nz; i++) for (const x of [xa + 0.006, xb - 0.006]) ups.push([x, lerp(-zw + rc, zw - rc, i / nz)]);
    for (const [x, z] of ups) tube(S.frame, [[x, yL, z], [x, (yL + yU) / 2, z], [x, yU, z]], 0.009, tseg, false);
    // floor slats across, resting on the lower frame
    const ns = Math.max(3, Math.round((xb - xa) / 0.13));
    for (let i = 1; i < ns; i++) {
      const x = lerp(xa, xb, i / ns);
      bar(S.frame, [x, yL + 0.004, 0], Z, X, Y, -zw + 0.008, zw - 0.008, () => [[-0.016, -0.005, 0.003], [0.016, -0.005, 0.003], [0.016, 0.005, 0.003], [-0.016, 0.005, 0.003]], seg, step);
    }
    // light bar on the front rail: housing, clear lens, reflector cups with emitters
    const lw = Math.min(0.5, zw * 0.85), lx = xa - 0.026, ly = yU - 0.01;
    bar(S.frame, [lx, ly, 0], Z, X, Y, -lw - 0.012, lw + 0.012, () => [[-0.022, -0.028, 0.008], [0.03, -0.028, 0.008], [0.03, 0.028, 0.008], [-0.022, 0.028, 0.008]], seg, step, 0.005);
    bar(S.lens, [lx, ly, 0], Z, X, Y, -lw, lw, () => [[-0.027, -0.021, 0.003], [-0.02, -0.021, 0], [-0.02, 0.021, 0], [-0.027, 0.021, 0.003]], seg, step, 0.003);
    const nl = Math.max(4, Math.round((2 * lw) / 0.075));
    for (let i = 0; i < nl; i++) {
      const z = lerp(-lw + 0.035, lw - 0.035, i / (nl - 1)), C = [lx - 0.021, ly, z];
      place(L.chrome, C, Z, Y, mul(X, -1), (M) => lathe(M, 0, 0, [[0.019, 0], [0.017, -0.006], [0.008, -0.016], [0, -0.016]], tseg));
      place(L.led, C, Z, Y, mul(X, -1), (M) => lathe(M, 0, 0, [[0.005, -0.016], [0.005, -0.009], [0, -0.008]], 8));
    }
  }

  const res = {};
  for (const k of ROOF_PARTS) {
    const s = S[k], l = L[k];
    if (s.p.length) res[k] = { position: new Float32Array(s.p), index: new Uint32Array(s.i), normal: new Float32Array(s.n) };
    if (l.p.length) res[`${k}_l`] = { position: new Float32Array(l.p), index: new Uint32Array(l.i) };
  }
  return { ...res, feet: feet.map((f) => ({ x: f.x, z: f.z, y: f.y })), yBar };
}
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
