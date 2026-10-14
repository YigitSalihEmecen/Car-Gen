// Body kit: front bumper, side skirts, rear bumper; three sets that can be mixed per piece. Built like the fender
// flares: the part's structure comes first, the connection second.
// Part: a closed, filleted cross-section swept along a guide curve. The guide is the body's plan outline at the attach
// height (found by rays), smoothed and spline-interpolated, so every part is a fair, rigid sweep whatever the skin
// does. The section's back runs inside the body (it follows the skin's receding profile, 15 mm in), so the part sits
// in the body with no gap; ends get a rounded cap. Blend: a painted strip from the part's top edge over the skin,
// lifted toward the part and decaying to zero (lands tangent). Bumpers are built for the right half and mirrored.
import { bodyMesh, mesh, lathe, mirrored } from './lights.js';

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
const UP = [0, 1, 0];

export const KIT_TYPES = ['None', 'Street', 'Track', 'Rugged'];
export const KIT_SWEEP = ['paint', 'plastic', 'carbon', 'metal'];
export const KIT_LATHE = ['chrome', 'bolt', 'accent', 'dark'];

// ---------- 2D section tools ----------
// closed polygon [[o, y, r]] -> points with every corner filleted by r (always seg + 1 points per corner, so sections
// of one design have the same point count everywhere)
export function roundPoly(pts, seg) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const [px, py, r = 0] = pts[i], [ax, ay] = pts[(i + n - 1) % n], [bx, by] = pts[(i + 1) % n];
    const la = Math.hypot(ax - px, ay - py), lb = Math.hypot(bx - px, by - py);
    const u = [(ax - px) / (la || 1), (ay - py) / (la || 1)], v = [(bx - px) / (lb || 1), (by - py) / (lb || 1)];
    const th = Math.acos(clamp(u[0] * v[0] + u[1] * v[1], -1, 1));
    if (r <= 0 || la < 1e-6 || lb < 1e-6 || th > Math.PI - 1e-3 || th < 1e-3) { for (let k = 0; k <= seg; k++) out.push([px, py]); continue; }
    const d = Math.min(r / Math.tan(th / 2), 0.45 * la, 0.45 * lb), rr = d * Math.tan(th / 2);
    const bis = [u[0] + v[0], u[1] + v[1]], bl = Math.hypot(...bis), cd = rr / Math.sin(th / 2);
    const c = [px + (bis[0] / bl) * cd, py + (bis[1] / bl) * cd];
    const a1 = Math.atan2(py + u[1] * d - c[1], px + u[0] * d - c[0]);
    let da = Math.atan2(py + v[1] * d - c[1], px + v[0] * d - c[0]) - a1;
    if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= seg; k++) { const a = a1 + (da * k) / seg; out.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]); }
  }
  return out;
}
// outermost o of a section at height y
function faceO(poly, y) {
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ao, ay] = poly[i], [bo, by] = poly[(i + 1) % poly.length];
    if ((ay - y) * (by - y) > 0 || ay === by) continue;
    best = Math.max(best, lerp(ao, bo, (y - ay) / (by - ay)));
  }
  return best;
}
function earClip(pts) {
  const idx = pts.map((_, i) => i).filter((i) => Math.hypot(pts[i][0] - pts[(i + 1) % pts.length][0], pts[i][1] - pts[(i + 1) % pts.length][1]) > 1e-7);
  let area = 0;
  for (let i = 0; i < idx.length; i++) { const a = pts[idx[i]], b = pts[idx[(i + 1) % idx.length]]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = Math.sign(area) || 1, tris = [];
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  const inside = (p, a, b, c) => sgn * cr(a, b, p) >= 0 && sgn * cr(b, c, p) >= 0 && sgn * cr(c, a, p) >= 0;
  for (let guard = 0; idx.length > 3 && guard < 4000; guard++) {
    let cut = -1;
    for (let i = 0; i < idx.length && cut < 0; i++) {
      const a = pts[idx[(i + idx.length - 1) % idx.length]], b = pts[idx[i]], c = pts[idx[(i + 1) % idx.length]];
      if (sgn * cr(a, b, c) <= 1e-12) continue;
      if (idx.some((q, j) => j !== i && q !== idx[(i + idx.length - 1) % idx.length] && q !== idx[(i + 1) % idx.length] && inside(pts[q], a, b, c))) continue;
      cut = i;
    }
    if (cut < 0) cut = 0; // degenerate remainder: clip anyway rather than leave a hole
    tris.push([idx[(cut + idx.length - 1) % idx.length], idx[cut], idx[(cut + 1) % idx.length]]);
    idx.splice(cut, 1);
  }
  if (idx.length === 3) tris.push([...idx]);
  return tris;
}

// ---------- 3D sweep: columns of closed point rings, smooth normals, flat caps ----------
// wrap: the columns form a closed loop (a ring of rings, no caps)
export function pushTube(M, rings, { capStart = true, capEnd = true, sym = false, wrap = false } = {}) {
  const n = rings.length, m = rings[0].length, o = M.p.length / 3;
  const P = (j, r) => rings[wrap ? ((j % n) + n) % n : clamp(j, 0, n - 1)][((r % m) + m) % m];
  const raw = (j, r) => cross(sub(P(j + 1, r), P(j - 1, r)), sub(P(j, r + 1), P(j, r - 1)));
  const cen = rings.map((ring) => mul(ring.reduce(add, [0, 0, 0]), 1 / m));
  let acc = 0;
  for (let j = 0; j < n; j += Math.max(1, n >> 3)) for (let r = 0; r < m; r += 3) acc += dot(raw(j, r), sub(P(j, r), cen[j]));
  const flip = acc < 0 ? -1 : 1;
  for (let j = 0; j < n; j++) for (let r = 0; r < m; r++) {
    M.p.push(...P(j, r));
    let nn = mul(unit(raw(j, r)), flip);
    if (sym && j === 0) nn = unit([nn[0], nn[1], 0]);
    M.n.push(...nn);
  }
  for (let j = 0; j < (wrap ? n : n - 1); j++) for (let r = 0; r < m; r++) {
    const jn = (j + 1) % n, a = o + j * m + r, b = o + j * m + ((r + 1) % m), c = o + jn * m + r, d = o + jn * m + ((r + 1) % m);
    if (flip > 0) M.i.push(a, c, b, b, c, d); else M.i.push(a, b, c, b, d, c);
  }
  // caps: the ring triangulated in its own plane, facing away from the part
  for (const [j, out] of [[0, capStart], [n - 1, capEnd]]) {
    if (!out || wrap) continue;
    const ring = rings[j], T = unit(sub(cen[j === 0 ? Math.min(1, n - 1) : Math.max(n - 2, 0)], cen[j]));
    const N = mul(T, -1), ax = unit(sub(ring[0], cen[j])), ay = cross(N, ax);
    const flat = ring.map((p) => [dot(sub(p, cen[j]), ax), dot(sub(p, cen[j]), ay)]);
    const base = M.p.length / 3;
    for (const p of ring) { M.p.push(...p); M.n.push(...N); }
    for (const [a, b, c] of earClip(flat)) {
      const fn = cross(sub(ring[b], ring[a]), sub(ring[c], ring[a]));
      if (dot(fn, N) >= 0) M.i.push(base + a, base + b, base + c); else M.i.push(base + a, base + c, base + b);
    }
  }
}
// lathe instance in a local frame (U, V across, W along the axis)
export function place(M, C, U, V, W, build) {
  const L = mesh(); build(L);
  const v0 = M.p.length / 3;
  for (let i = 0; i < L.p.length; i += 3) M.p.push(...add(C, add(add(mul(U, L.p[i]), mul(V, L.p[i + 1])), mul(W, L.p[i + 2]))));
  for (const i of L.i) M.i.push(i + v0);
}

// ---------- designs ----------
// c: { ya attach height, yf body floor, yu part bottom, H = ya - yu, k outward scale, back(y) inside-the-skin offset }
// sections run from the attach point (0, ya) out and down the face, under the part and back up inside the body
const backPts = (c) => { const ym = (c.yf + c.ya) / 2; return [[c.back(c.yf + 0.02), c.yf + 0.02], [c.back(ym), ym], [c.back(c.ya - 0.012), c.ya - 0.012]]; };
const under = (c, y) => [c.back(c.yf + 0.02), y];
const shell = (c, face) => [[0, c.ya, 0], ...face, ...backPts(c)];
const B0 = (c) => c.back(c.yf + 0.02);

const STREET_FRONT = (c) => shell(c, [[0.012 * c.k, c.ya - 0.3 * c.H, 0.08], [0.02 * c.k, c.yu + 0.02, 0.015], [0.016 * c.k, c.yu + 0.008, 0.004], under(c, c.yu + 0.008)]);
const TRACK_FRONT = (c) => shell(c, [[0.016 * c.k, c.ya - 0.3 * c.H, 0.07], [0.024 * c.k, c.yu + 0.024, 0.014], [0.018 * c.k, c.yu + 0.011, 0.004], under(c, c.yu + 0.011)]);
const RUGGED = (c) => shell(c, [[0.042 * c.k, c.ya - 0.006, 0.01], [0.048 * c.k, c.ya - 0.5 * c.H, 0.02], [0.04 * c.k, c.yu + 0.03, 0.02], [0.01 * c.k, c.yu + 0.022, 0.008], under(c, c.yu + 0.022)]);
const plate = (c, inner, o, y0, y1, r = 0.0025) => [[inner, y1, 0], [o, y1 - 0.002, r], [o, y0, r], [inner, y0, 0]];
const skid = (c) => [[B0(c) + 0.02, c.yu + 0.004, 0], [0.015 * c.k, c.yu + 0.004, 0.025], [0.036 * c.k, c.yu + 0.034, 0.005], [0.031 * c.k, c.yu + 0.038, 0.003], [0.01 * c.k, c.yu + 0.01, 0.02], [B0(c) + 0.02, c.yu + 0.01, 0]];
// a slat proud of the main face at height y
const slat = (main) => (c, y) => { const f = faceO(roundPoly(main(c), 3), y); return [[f - 0.006, y - 0.0035, 0], [f + 0.004, y - 0.0035, 0.0015], [f + 0.006, y + 0.0035, 0.0015], [f - 0.006, y + 0.0035, 0]]; };

// each piece: parts [{ mat, sec(c), s: [s0, s1], top: blend attaches here }], details(ctx) for instanced hardware
const DESIGNS = [null,
  { // Street: smooth painted valances with a black lip; front corner vents, twin exhaust tips at the rear
    front: {
      parts: [{ mat: 'paint', sec: STREET_FRONT, top: true },
        { mat: 'plastic', sec: (c) => [[0.004 * c.k, c.yu + 0.02, 0], [0.044 * c.k, c.yu + 0.01, 0.003], [0.046 * c.k, c.yu, 0.003], [B0(c) + 0.01, c.yu, 0], [B0(c) + 0.01, c.yu + 0.02, 0]] },
        ...[0.36, 0.49, 0.62].map((f) => ({ mat: 'plastic', s: [0.55, 0.86], sec: (c) => slat(STREET_FRONT)(c, c.yu + f * c.H) }))],
    },
    side: { parts: [{ mat: 'paint', top: true, sec: (c) => shell(c, [[0.01 * c.k, c.ya - 0.45 * c.H, 0.06], [0.026 * c.k, c.yu + 0.014, 0.01], [0.024 * c.k, c.yu, 0.004], under(c, c.yu)]) }] },
    rear: {
      parts: [{ mat: 'paint', top: true, sec: (c) => shell(c, [[0.012 * c.k, c.ya - 0.35 * c.H, 0.07], [0.016 * c.k, c.yu + 0.022, 0.015], [0.004 * c.k, c.yu + 0.01, 0.006], under(c, c.yu + 0.01)]) },
        { mat: 'plastic', s: [0, 0.6], sec: (c) => [[-0.002, c.yu + 0.016, 0], [0.012 * c.k, c.yu + 0.012, 0.003], [0.01 * c.k, c.yu + 0.002, 0.002], [B0(c) + 0.01, c.yu, 0], [B0(c) + 0.01, c.yu + 0.016, 0]] }],
      details: ({ at, lathes }) => {
        const { G, O, T, c, face } = at(0.74, (cc) => cc.yu + 0.3 * cc.H), r = clamp(0.16 * c.H, 0.026, 0.042);
        const C = add([G[0], c.yu + 0.3 * c.H, G[2]], mul(O, face + 0.018));
        place(lathes.chrome, C, T, UP, O, (L) => lathe(L, 0, 0, [[r, -0.12], [r, 0], [r * 0.96, 0.006], [r * 0.88, 0.004], [r * 0.88, -0.03]], 24));
        place(lathes.dark, C, T, UP, O, (L) => lathe(L, 0, 0, [[r * 0.88, -0.03], [0, -0.03]], 24));
      },
    },
  },
  { // Track: painted extensions over carbon aero: splitter with end plates and canards, skirt blades, a straked diffuser
    front: {
      parts: [{ mat: 'paint', sec: TRACK_FRONT, top: true },
        { mat: 'carbon', sec: (c) => plate(c, B0(c) + 0.02, 0.08 * c.k, c.yu + 0.002, c.yu + 0.012) }],
      details: ({ at, sweeps, fin }) => {
        const e = at(0.985, (c) => c.yu + 0.3 * c.H);
        fin(sweeps.carbon, e, e.T, 0.005, [[0.005, e.c.yu + 0.002, 0], [0.08 * e.c.k, e.c.yu + 0.002, 0.003], [0.08 * e.c.k, e.c.yu + 0.024, 0.008], [0.03 * e.c.k, e.c.yu + 0.55 * e.c.H, 0.02], [0.005, e.c.yu + 0.55 * e.c.H, 0]]);
        for (const f of [0.5, 0.75]) {
          const a = at(0.9, (c) => c.yu + f * c.H), y = a.c.yu + f * a.c.H, tilt = 0.14, Bv = add(mul(a.T, Math.cos(tilt)), mul(UP, Math.sin(tilt)));
          fin(sweeps.carbon, { ...a, G: [a.G[0], 0, a.G[2]], base: [0, y] }, unit(cross(a.O, Bv)), 0.004,
            [[a.face - 0.004, -0.05, 0], [a.face + 0.045 * a.c.k, -0.025, 0.006], [a.face + 0.05 * a.c.k, 0.012, 0.004], [a.face - 0.004, 0.015, 0]], Bv);
        }
      },
    },
    side: {
      parts: [{ mat: 'paint', top: true, sec: (c) => shell(c, [[0.012 * c.k, c.ya - 0.45 * c.H, 0.05], [0.02 * c.k, c.yu + 0.015, 0.008], [0.014 * c.k, c.yu + 0.011, 0.003], under(c, c.yu + 0.011)]) },
        { mat: 'carbon', sec: (c) => plate(c, B0(c) + 0.02, 0.062 * c.k, c.yu + 0.003, c.yu + 0.012) }],
    },
    rear: {
      parts: [{ mat: 'paint', top: true, sec: (c) => shell(c, [[0.012 * c.k, c.ya - 0.4 * c.H, 0.06], [0.014 * c.k, c.yu + 0.055, 0.016], [0.002, c.yu + 0.048, 0.004], under(c, c.yu + 0.048)]) },
        { mat: 'carbon', s: [0, 0.72], sec: (c) => [[-0.18, c.yu + 0.003, 0], [0.022 * c.k, c.yu + 0.047, 0.003], [0.022 * c.k, c.yu + 0.053, 0.003], [-0.18, c.yu + 0.009, 0]] }],
      details: ({ at, sweeps, fin }) => {
        for (const s of [0, 0.22, 0.44, 0.64]) {
          const a = at(s, (c) => c.ya);
          fin(sweeps.carbon, a, a.T, 0.005, [[-0.16, a.c.yu + 0.008, 0], [0.02 * a.c.k, a.c.yu + 0.048, 0.003], [0.02 * a.c.k, a.c.yu - 0.002, 0.004], [-0.16, a.c.yu + 0.002, 0]]);
        }
      },
    },
  },
  { // Rugged: chunky black textured plastic with a top shelf, bolts, brushed skid plates and red tow hooks
    front: {
      parts: [{ mat: 'plastic', sec: RUGGED, top: true }, { mat: 'metal', s: [0, 0.5], sec: skid }],
      details: (ctx) => { hooks(ctx, 0.32); bolts(ctx, RUGGED, 0.28, 0.14); },
    },
    side: {
      parts: [{ mat: 'plastic', top: true, sec: (c) => shell(c, [[0.03 * c.k, c.ya - 0.006, 0.008], [0.036 * c.k, c.ya - 0.5 * c.H, 0.015], [0.032 * c.k, c.yu + 0.01, 0.012], [0.012 * c.k, c.yu, 0.004], under(c, c.yu)]) }],
      details: (ctx) => bolts(ctx, (c) => shell(c, [[0.03 * c.k, c.ya - 0.006, 0.008], [0.036 * c.k, c.ya - 0.5 * c.H, 0.015], [0.032 * c.k, c.yu + 0.01, 0.012], [0.012 * c.k, c.yu, 0.004], under(c, c.yu)]), 0.42, 0.16),
    },
    rear: {
      parts: [{ mat: 'plastic', sec: RUGGED, top: true }, { mat: 'metal', s: [0, 0.45], sec: skid }],
      details: (ctx) => { hooks(ctx, 0.36); bolts(ctx, RUGGED, 0.28, 0.14); },
    },
  },
];
function hooks({ at, lathes }, s) {
  const a = at(s, (c) => c.yu + 0.42 * c.H), y = a.c.yu + 0.42 * a.c.H, C = add([a.G[0], y, a.G[2]], mul(a.O, a.face + 0.024));
  place(lathes.accent, C, a.O, UP, a.T, (L) => lathe(L, 0, 0, Array.from({ length: 13 }, (_, i) => { const t = (2 * Math.PI * i) / 12; return [0.022 + 0.0062 * Math.cos(t), 0.0062 * Math.sin(t)]; }), 20));
  place(lathes.accent, add([a.G[0], y, a.G[2]], mul(a.O, a.face - 0.03)), a.T, UP, a.O, (L) => lathe(L, 0, 0, [[0.009, 0], [0.009, 0.034], [0, 0.036]], 14));
}
function bolts({ at, lathes, len }, sec, f, pitch) {
  const cnt = Math.max(2, Math.round((len * 0.84) / pitch));
  for (let b = 0; b <= cnt; b++) {
    const s = lerp(0.08, 0.92, b / cnt), a = at(s, (c) => c.ya - f * c.H, sec), y = a.c.ya - f * a.c.H;
    const poly = roundPoly(sec(a.c), 3), slope = (faceO(poly, y + 0.004) - faceO(poly, y - 0.004)) / 0.008;
    const N = unit(sub(a.O, mul(UP, slope))), U = a.T, V = cross(N, U);
    place(lathes.bolt, add([a.G[0], y, a.G[2]], mul(a.O, a.face)), U, V, N, (L) => {
      lathe(L, 0, 0, [[0.0085, -0.002], [0.0085, 0.0012], [0.0065, 0.0018]], 14);
      lathe(L, 0, 0, [[0.0055, 0.0014], [0.0055, 0.0046], [0.0047, 0.0055], [0, 0.0057]], 6, Math.PI / 6);
    });
  }
}

// cubic (Catmull-Rom) through uniform knots, with the derivative; mirror = reflect about z = 0 before the first knot
function spline(K, mirror) {
  const n = K.length, get = (i) => (i < 0 ? (mirror ? [K[-i][0], K[-i][1], -K[-i][2]] : sub(mul(K[0], 2), K[1])) : i >= n ? sub(mul(K[n - 1], 2), K[n - 2]) : K[i]);
  return (u) => { // u in [0, n - 1]
    const i = clamp(Math.floor(u), 0, n - 2), t = u - i, [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    const pos = [0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t * t * t));
    const der = [0, 1, 2].map((a) => 0.5 * ((-p0[a] + p2[a]) + 2 * (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t + 3 * (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t * t));
    return { pos, der };
  };
}
const blurArr = (a, s) => a.map((_, i) => { let w = 0, v = 0; for (let k = -3 * s; k <= 3 * s; k++) { const e = Math.exp(-(k * k) / (2 * s * s)); v += e * a[clamp(i + k, 0, a.length - 1)]; w += e; } return v / w; });

const NH = 6, ROLL = 0.006, LIFT = 0.15;

// body: { position, N, RL, xF, xR, W0, R, Ra, wb, floorAt(x), floorMin, fenderGap }
export function buildKit(P, body, detail = 1) {
  const sw = Object.fromEntries(KIT_SWEEP.map((k) => [k, { p: [], i: [], n: [] }]));
  const lt = Object.fromEntries(KIT_LATHE.map((k) => [k, mesh()]));
  const blend = { p: [], i: [], n: [] }, tops = [], rim = [];
  const { R, Ra, wb, W0 } = body, gap = 0.04 + body.fenderGap;
  const seg = lod(detail, 1, 4), step = lerp(0.05, 0.016, clamp(detail, 0, 1) ** 1.5);
  const pieces = [];
  const xs0 = Ra + gap, xs1 = wb - Ra - gap;
  // a bumper ends short of the arch (and of any fender flare); on a short overhang it may reach toward the wheel, never
  // closer than the arch plus 4 cm, rather than be dropped
  const cxF = Math.max(-(Ra + gap), body.xF + 0.15), cxR = Math.min(wb + Ra + gap, body.xR - 0.15);
  if (P.kitF && cxF <= -(Ra + 0.04)) pieces.push({ kind: 'front', D: DESIGNS[P.kitF].front, xw: 0, sx: -1, cx: cxF, ya: body.floorAt(body.xF + 0.12) + P.kitH, range: [body.xF - 0.05, 0.05] });
  if (P.kitS && xs1 - xs0 > 0.3) pieces.push({ kind: 'side', D: DESIGNS[P.kitS].side, ya: body.floorAt((xs0 + xs1) / 2) + 0.8 * P.kitH, range: [xs0 - 0.05, xs1 + 0.05] });
  if (P.kitR && cxR >= wb + Ra + 0.04) pieces.push({ kind: 'rear', D: DESIGNS[P.kitR].rear, xw: wb, sx: 1, cx: cxR, ya: body.floorAt(body.xR - 0.12) + P.kitH, range: [wb - 0.05, body.xR + 0.05] });
  // bumpers wrap forward into the arch: past the arch plane their lower edge follows a clearance circle around the wheel
  // (rC) and the part runs out where that circle meets its top; skipped when fender flares own that band
  const rC = Ra + 0.02, MINH = 0.035;
  // one ground line for the whole kit: every part's bottom sits kitDrop below the body's lowest floor, so bumpers and
  // skirts read as one band from the side whichever pieces are fitted (only the wheel clearance circle lifts it)
  const yKit = Math.max(0.035, body.floorMin - P.kitDrop);

  for (const pc of pieces) {
    const { cast, surf, walk } = bodyMesh(body, pc.range), sym = pc.kind !== 'side', ya = pc.ya;
    // raw guide: the plan outline at the attach height (polar rays around the arch plane for bumpers, sideways for skirts)
    const Kr = 48, raw = [];
    for (let k = 0; k < Kr; k++) {
      const f = k / (Kr - 1);
      let h;
      if (pc.kind === 'side') h = cast([lerp(xs0, xs1, f), ya, W0 + 2], [0, 0, -1]);
      else { const th = (Math.PI / 2) * f, d = [pc.kind === 'front' ? -Math.cos(th) : Math.cos(th), 0, Math.sin(th)]; h = cast(add([pc.cx, ya, 0], mul(d, 3)), mul(d, -1)); }
      if (h && h.p[2] > -1e-6) raw.push(h.p);
    }
    const wrap = pc.kind !== 'side' && !body.fenderGap && ya - MINH - 0.01 > R;
    if (wrap) {
      const dxe = Math.sqrt(Math.max(0, rC * rC - (ya - MINH - 0.01 - R) ** 2));
      // ...and only while the body is there at the attach height (past the arch edge a sideways ray crosses the wheel
      // tunnel and would find the far side of the car)
      for (let k = 1; k <= 12; k++) {
        const h = cast([lerp(pc.cx, pc.xw + pc.sx * dxe, k / 12), ya, W0 + 2], [0, 0, -1]);
        if (!h || h.p[2] < 0.5 * W0 || h.n[2] < 0.3) break;
        raw.push(h.p);
      }
    }
    if (raw.length < Kr * 0.75) continue;
    // smooth, then resample to uniform arc length knots
    const sx = blurArr(raw.map((p) => p[0]), 2), sz = blurArr(raw.map((p) => p[2]), 2);
    let pts = raw.map((_, i) => [sx[i], ya, sz[i]]);
    if (sym) pts[0][2] = 0;
    if (pc.kind !== 'side' && !wrap) pts[pts.length - 1][0] = pc.cx;
    const cl = [0];
    for (let i = 1; i < pts.length; i++) cl.push(cl[i - 1] + Math.hypot(...sub(pts[i], pts[i - 1])));
    const Lg = cl[cl.length - 1], NK = 40, knots = [];
    for (let q = 0, i = 0; q < NK; q++) {
      const s = (Lg * q) / (NK - 1);
      while (i < pts.length - 2 && cl[i + 1] < s) i++;
      knots.push(add(pts[i], mul(sub(pts[i + 1], pts[i]), clamp((s - cl[i]) / Math.max(cl[i + 1] - cl[i], 1e-9), 0, 1))));
    }
    const sp = spline(knots, sym);
    const frame = (s01) => {
      const { pos, der } = sp(clamp(s01, 0, 1) * (NK - 1)), T = unit([der[0], 0, der[2]]);
      let O = [T[2], 0, -T[0]];
      if (pc.kind === 'side' ? O[2] < 0 : dot(O, [pos[0] - pc.cx, 0, pos[2]]) < 0) O = mul(O, -1);
      return { G: pos, T, O };
    };
    // skin profile under the guide: how far the skin recedes inward between the attach height and the floor
    // sampled at every third knot (it is smoothed and interpolated anyway)
    const PS = 3, prof = knots.map((_, q) => q % PS && q !== NK - 1 ? null : q).map((q) => {
      if (q === null) return null;
      // the body's real bottom under this station (the floor curve alone misses the blurred arch cut beside a wheel)
      const { G, O } = frame(q / (NK - 1)), hit = (y) => cast([G[0] + O[0] * 0.3, y, G[2] + O[2] * 0.3], mul(O, -1), 0.6);
      let lo = body.floorAt(G[0] - O[0] * 0.12) - 0.05, hi = ya;
      for (let y = ya - 0.025; y > lo; y -= 0.025) if (!hit(y)) { lo = y; break; } else hi = y;
      for (let it = 0; it < 6; it++) { const m = (lo + hi) / 2; if (hit(m)) hi = m; else lo = m; }
      const yf = Math.min(hi, ya - 0.05), sk = [];
      for (let i = 0; i < NH; i++) {
        const h = hit(ya - ((ya - yf) * i) / (NH - 1));
        sk.push(h ? Math.min(0.3 - h.t, 0.02) : (i ? sk[i - 1] - 0.05 : 0));
      }
      return { yf, sk };
    });
    for (let q = 0; q < NK; q++) if (!prof[q]) {
      const a = q - (q % PS), b = Math.min(a + PS, NK - 1), t = (q - a) / (b - a);
      prof[q] = { yf: lerp(prof[a].yf, prof[b].yf, t), sk: prof[a].sk.map((v, i) => lerp(v, prof[b].sk[i], t)) };
    }
    const yfK = blurArr(prof.map((p) => p.yf), 2), skK = Array.from({ length: NH }, (_, i) => blurArr(prof.map((p) => p.sk[i]), 2));
    const ctx = (s01) => {
      const u = clamp(s01, 0, 1) * (NK - 1), i = Math.min(Math.floor(u), NK - 2), t = u - i, G = frame(s01).G;
      const dx = pc.kind === 'side' ? Infinity : Math.abs(G[0] - pc.xw), circ = dx < rC ? R + Math.sqrt(rC * rC - dx * dx) : 0;
      const yu = clamp(Math.max(yKit, circ), 0.035, ya - MINH);
      const yf = Math.max(lerp(yfK[i], yfK[i + 1], t), yu), sk = skK.map((a) => lerp(a[i], a[i + 1], t));
      const back = (y) => {
        const f = clamp((ya - y) / (ya - yf), 0, 1) * (NH - 1), q = Math.min(Math.floor(f), NH - 2);
        return Math.min(lerp(sk[q], sk[q + 1], f - q), 0) - 0.015;
      };
      return { ya, yf, yu, H: ya - yu, k: P.kitOut, back };
    };

    // columns over a part's span: uniform, refined toward capped ends for the rounded end roll
    const columns = (s0, s1, capA, capB) => {
      const L = (s1 - s0) * Lg, n = Math.max(3, Math.ceil(L / step)), us = [];
      for (let i = 0; i <= n; i++) us.push(i / n);
      const add01 = (d) => us.push(clamp(d / L, 0, 1));
      for (const f of [0.15, 0.4, 0.7]) { if (capA) add01(ROLL * f); if (capB) add01(L - ROLL * f); }
      return [...new Set(us)].sort((a, b) => a - b).map((u) => ({ s: lerp(s0, s1, u), dA: capA ? u * L : Infinity, dB: capB ? (1 - u) * L : Infinity }));
    };
    const ring = (sec, col) => {
      const c = ctx(col.s), { G, O } = frame(col.s), poly = roundPoly(sec(c), seg);
      const cen = poly.reduce((a, p) => [a[0] + p[0] / poly.length, a[1] + p[1] / poly.length], [0, 0]);
      const ext = Math.max(...poly.map((p) => Math.hypot(p[0] - cen[0], p[1] - cen[1])));
      const k = 1 - (1 - quarter(Math.min(col.dA, col.dB) / ROLL)) * Math.min(ROLL / ext, 0.4);
      return poly.map(([o, y]) => { const oo = cen[0] + (o - cen[0]) * k, yy = cen[1] + (y - cen[1]) * k; return [G[0] + O[0] * oo, yy, G[2] + O[2] * oo]; });
    };

    for (const part of pc.D.parts) {
      const [s0, s1] = part.s || [0, 1], capA = !(sym && s0 === 0), capB = true, cols = columns(s0, s1, capA, capB);
      const rings = cols.map((col) => ring(part.sec, col));
      pushTube(sw[part.mat], rings, { capStart: capA, capEnd: capB, sym: sym && s0 === 0 });
      if (!part.top) continue;

      // blend: from each column's attach point up over the skin
      const Lb = P.kitBlend, nS = lod(detail, 3, clamp(Math.round(Lb / 0.005) + 6, 8, 24));
      const decay = (t) => lerp(1 - t * t * t * (t * (6 * t - 15) + 10), (1 - t) ** 3, 0.5);
      const all = cols.map((col, j) => { const { O } = frame(col.s), p = rings[j][0]; return { p, O, j, h: cast(add(p, mul(O, LIFT)), mul(O, -1), 2 * LIFT) }; });
      // the blend runs over the longest stretch of columns whose top edge has skin behind it
      let r0 = 0, r1 = -1;
      for (let a = 0; a < all.length;) {
        if (!all[a].h) { a++; continue; }
        let b = a; while (b + 1 < all.length && all[b + 1].h) b++;
        if (b - a > r1 - r0) { r0 = a; r1 = b; }
        a = b + 1;
      }
      if (r1 - r0 < 2) continue;
      const items = all.slice(r0, r1 + 1);
      const stop = (S) => S.n[1] < -0.6 || dot(S.n, UP) > 0.92 || (pc.kind === 'side' && S.p[2] < 0.02);
      const paths = items.map((it) => walk(it.h.ci, it.h.cr, UP, Lb, stop));
      const reach = paths.map((pa) => pa[pa.length - 1].s);
      const skinAt = (j, t) => {
        const pa = paths[j], s = t * reach[j];
        let q = 0; while (q < pa.length - 2 && pa[q + 1].s < s) q++;
        const a = pa[q], b = pa[Math.min(q + 1, pa.length - 1)], f = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
        return surf(lerp(a.ci, b.ci, f), lerp(a.cr, b.cr, f));
      };
      const grid = items.map((it, j) => { const d0 = LIFT - it.h.t; return Array.from({ length: nS }, (_, r) => (r === 0 ? it.p : add(skinAt(j, r / (nS - 1)).p, mul(it.O, d0 * decay(r / (nS - 1)))))); });
      const o = blend.p.length / 3, nC = grid.length;
      const rawN = (j, r) => cross(sub(grid[Math.min(j + 1, nC - 1)][r], grid[Math.max(j - 1, 0)][r]), sub(grid[j][Math.min(r + 1, nS - 1)], grid[j][Math.max(r - 1, 0)]));
      const flip = grid.reduce((a, _, j) => a + dot(rawN(j, 1), items[j].O), 0) < 0 ? -1 : 1;
      for (let j = 0; j < nC; j++) for (let r = 0; r < nS; r++) {
        blend.p.push(...grid[j][r]);
        const t = r / (nS - 1), w = decay(t), sn = skinAt(j, t).n;
        let nn = r === nS - 1 ? sn : unit(add(mul(mul(unit(rawN(j, r)), flip), w), mul(sn, 1 - w)));
        if (sym && items[j].j === 0) nn = unit([nn[0], nn[1], 0]);
        blend.n.push(...nn);
      }
      for (let j = 0; j < nC - 1; j++) for (let r = 0; r < nS - 1; r++) {
        const a = o + j * nS + r, b = a + nS;
        if (flip > 0) blend.i.push(a, b, a + 1, b, b + 1, a + 1); else blend.i.push(a, a + 1, b, b, a + 1, b + 1);
      }
      for (let j = 0; j < nC; j++) { tops.push({ part: rings[items[j].j][0], blend: grid[j][0] }); rim.push({ p: grid[j][nS - 1], n: skinAt(j, 1).n }); }
    }

    // instanced details: at(s, yOf, sec) gives the frame, the section context and the main face's o at height yOf(c)
    const main = pc.D.parts[0].sec;
    const at = (s, yOf, sec = main) => { const c = ctx(s), f = frame(s); return { ...f, c, face: faceO(roundPoly(sec(c), 3), yOf(c)) }; };
    // fin: a filleted 2D outline in a frame's (o, y) plane (or (o, Bv) with base), extruded by thickness t along E
    const fin = (M, a, E, t, pts, Bv = UP) => {
      const poly = roundPoly(pts, seg), C0 = a.base ? [a.G[0], a.base[1], a.G[2]] : [a.G[0], 0, a.G[2]];
      const map = (sgn) => poly.map(([o, v]) => add(add(add(C0, mul(a.O, o)), mul(Bv, v)), mul(E, (sgn * t) / 2)));
      pushTube(M, [map(-1), map(1)]);
    };
    pc.D.details?.({ at, sweeps: sw, lathes: lt, fin, len: Lg });
  }

  const out = {};
  for (const k of KIT_SWEEP) out[k] = sw[k].p.length ? mirrored(sw[k].p, sw[k].i, sw[k].n) : null;
  for (const k of KIT_LATHE) out[k] = lt[k].p.length ? mirrored(lt[k].p, lt[k].i) : null;
  out.blend = blend.p.length ? mirrored(blend.p, blend.i, blend.n) : null;
  return { ...out, tops, rim, pieces: pieces.length };
}
