// Headlights: rigid lamp units posed in the car frame, never conformed to the panel they sit on, then a painted bezel
// lofted from each lamp's rim to the body skin. The bezel's outer edge is the lamp outline grown by `hlBlend` and
// projected onto the skin along the lamp axis; it leaves the rim radially and lands tangent to the skin (G1), so lamp and
// body read as one pressed panel. The body shader cuts the same projected outline out of the skin (app.js).
// Lamp frame: u = outboard, v = up, w = out of the lens (right handed). Outline = tapered, skewed superellipse.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const lod = (d, lo, hi) => Math.max(lo, Math.round(lerp(lo, hi, clamp(d, 0, 1) ** 1.5)));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const TAU = Math.PI * 2;

export const LAMP_TYPES = ['None', 'Round', 'Projector', 'Slim LED', 'Twin round', 'Halo', 'Triple', 'Light bar'];
export const TAIL_TYPES = ['None', 'Twin round', 'Blade', 'Block', 'Single round', 'Halo ring', 'Triple round', 'Light bar'];
export const LIGHT_BAR = 7; // full-width strip, built along the body by lightbar.js instead of as a posed lamp
const SHAPES = [null,
  { a: 0.095, b: 0.095, n: 2, taper: 0, skew: 0 },
  { a: 0.2, b: 0.062, n: 3.2, taper: -0.4, skew: 0.16 },
  { a: 0.22, b: 0.032, n: 6, taper: -0.25, skew: 0.07 },
  { a: 0.17, b: 0.079, n: 2.6, taper: 0, skew: 0 },
  { a: 0.092, b: 0.092, n: 2, taper: 0, skew: 0 },
  { a: 0.21, b: 0.054, n: 4, taper: -0.1, skew: 0.05 },
  null,
];
const TAIL_SHAPES = [null,
  { a: 0.17, b: 0.072, n: 2.6, taper: 0, skew: 0 },
  { a: 0.24, b: 0.05, n: 4, taper: 0.35, skew: -0.04 },
  { a: 0.15, b: 0.09, n: 7, taper: 0, skew: 0 },
  { a: 0.078, b: 0.078, n: 2, taper: 0, skew: 0 },
  { a: 0.088, b: 0.088, n: 2, taper: 0, skew: 0 },
  { a: 0.2, b: 0.058, n: 4, taper: 0, skew: 0 },
  null,
];

// outline point at angle th (0 = outboard tip, pi/2 = top), grown by m; the shader's inside test inverts exactly this
export function outline(S, th, m = 0, n = S.n) {
  const a = S.a + m, b = S.b + m, e = 2 / n, u = a * spow(Math.cos(th), e);
  return [u, b * (1 + (S.taper * u) / a) * spow(Math.sin(th), e) + S.skew * u];
}

// ---------- lamp modelling primitives, all in the lamp frame ----------
export const mesh = () => ({ p: [], i: [] });
function grid(M, rows, cols, f) {
  const base = M.p.length / 3;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) M.p.push(...f(r, c));
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols; c++) {
    const a = base + r * cols + c, b = base + r * cols + ((c + 1) % cols);
    M.i.push(a, a + cols, b, b, a + cols, b + cols);
  }
}
export const lathe = (M, cu, cv, prof, segs, phase = 0) => grid(M, prof.length, segs, (r, c) => {
  const f = phase + (TAU * c) / segs, [rad, w] = prof[r];
  return [cu + rad * Math.cos(f), cv + rad * Math.sin(f), w];
});
// housing walls and back plates: the outline scaled by rho at depth w, ring by ring
const tub = (M, S, rings, nT) => grid(M, rings.length, nT, (r, c) => {
  const [u, v] = outline(S, (TAU * c) / nT), [rho, w] = rings[r];
  return [u * rho, v * rho, w];
});
const lens = (M, S, rho0, w0, bulge, nT, rows, ripple = 0) => grid(M, rows, nT, (r, c) => {
  const q = 1 - r / (rows - 1), [u, v] = outline(S, (TAU * c) / nT);
  return [u * rho0 * q, v * rho0 * q, w0 + bulge * (1 - q * q) + ripple * Math.sin(q * Math.PI * 8) ** 2];
});
// light guide: round tube along a path parallel to the lens, ends pinched shut
function tube(M, path, rad, segs) {
  const n = path.length, rows = [path[0], ...path, path[n - 1]];
  grid(M, rows.length, segs, (r, c) => {
    const k = clamp(r - 1, 0, n - 1), rr = r === 0 || r === rows.length - 1 ? 0 : rad, f = (TAU * c) / segs;
    const B = unit(cross(sub(path[Math.min(k + 1, n - 1)], path[Math.max(k - 1, 0)]), [0, 0, 1]));
    return add(rows[r], add(mul(B, rr * Math.cos(f)), [0, 0, rr * Math.sin(f)]));
  });
}
const arc = (S, t0, t1, rho, w, n) => Array.from({ length: n }, (_, i) => {
  const [u, v] = outline(S, lerp(t0, t1, i / (n - 1)));
  return [u * rho, v * rho, w];
});
const range = (n, f) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));

const MODELS = [null,
  // classic sealed beam: chrome trim ring, parabolic reflector, shielded bulb, Fresnel-ringed domed lens
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.03], [0.85, -0.1], [0, -0.1]], q.t);
    lathe(M.chrome, 0, 0, [[0.082, -0.004], [0.086, 0.004], [0.091, 0.006], [0.093, 0.002], [0.093, -0.008]], q.t);
    lathe(M.chrome, 0, 0, range(q.r, (t) => { const r = lerp(0.084, 0.014, t); return [r, -0.075 + (r * r) / 0.1023]; }), q.t);
    lathe(M.led, 0, 0, [[0.005, -0.075], [0.009, -0.06], [0.008, -0.046], [0, -0.042]], q.s);
    lathe(M.chrome, 0, 0, [[0, -0.03], [0.012, -0.032], [0.014, -0.04], [0.013, -0.043]], q.s);
    lens(M.lens, S, 0.93, 0.002, 0.014, q.t, q.r * 2, 0.0012);
  },
  // modern projector: two aspheric lenses in chrome shrouds, J-shaped light guide underneath, amber indicator on top
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.98, -0.02], [0.92, -0.055], [0, -0.055]], q.t);
    for (const [u, r] of [[-0.11, 0.034], [-0.025, 0.028]]) {
      const v = S.skew * u, R = r / Math.sin(Math.PI / 3);
      lathe(M.chrome, u, v, [[r * 1.3, -0.054], [r * 1.22, -0.038], [r * 1.08, -0.02], [r, -0.018]], q.t);
      lathe(M.housing, u, v, [[r, -0.018], [r * 0.95, -0.05]], q.t);
      lathe(M.glass, u, v, range(q.r, (t) => { const g = (Math.PI / 3) * (1 - t); return [R * Math.sin(g), -0.018 + R * (Math.cos(g) - 0.5)]; }), q.t);
    }
    tube(M.led, arc(S, 1.12 * Math.PI, 2.06 * Math.PI, 0.88, -0.016, q.r * 3), 0.0045, q.s);
    tube(M.amber, arc(S, 0.14 * Math.PI, 0.42 * Math.PI, 0.86, -0.02, q.r), 0.004, q.s);
    lens(M.lens, S, 1, 0.002, 0.012, q.t, q.r);
  },
  // slim LED bar: a row of square reflector cells with emitters, full-width light guide along the top edge
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.015], [0.9, -0.05], [0, -0.05]], q.t);
    for (let i = 0; i < 5; i++) {
      const u = lerp(-0.16, 0.1, i / 4), bu = S.b * (1 + (S.taper * u) / S.a), h = 0.42 * bu * Math.SQRT2, v = S.skew * u - 0.22 * bu;
      lathe(M.chrome, u, v, [[h, -0.006], [h * 0.92, -0.014], [h * 0.4, -0.034], [0, -0.034]], 4, Math.PI / 4);
      lathe(M.led, u, v, [[h * 0.28, -0.033], [h * 0.28, -0.027], [0, -0.026]], q.s);
    }
    tube(M.led, arc(S, 0.03 * Math.PI, 0.97 * Math.PI, 0.84, -0.01, q.r * 3), 0.0035, q.s);
    lens(M.lens, S, 1, 0.002, 0.006, q.t, q.r);
  },
  // twin round: two sealed beams side by side in one housing, each with a chrome trim ring, parabolic bowl and bulb
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.025], [0.88, -0.08], [0, -0.08]], q.t);
    for (const [u, r] of [[0.084, 0.066], [-0.084, 0.06]]) {
      lathe(M.chrome, u, 0, [[r - 0.007, -0.004], [r - 0.003, 0.003], [r + 0.001, 0.003], [r + 0.002, -0.01]], q.t);
      lathe(M.chrome, u, 0, range(q.r, (t) => { const rr = lerp(r - 0.007, 0.011, t); return [rr, -0.068 + (rr * rr) / 0.075]; }), q.t);
      lathe(M.led, u, 0, [[0.005, -0.066], [0.008, -0.052], [0.007, -0.042], [0, -0.039]], q.s);
      lathe(M.chrome, u, 0, [[0, -0.028], [0.01, -0.03], [0.012, -0.036], [0.011, -0.039]], q.s);
      lathe(M.lens, u, 0, range(q.r * 2, (t) => { const rr = (r - 0.006) * (1 - t); return [rr, 0.001 + 0.011 * (1 - (rr / r) ** 2) + 0.0009 * Math.sin((rr / r) * Math.PI * 7) ** 2]; }), q.t);
    }
  },
  // halo: one round projector in a chrome bowl ringed by an LED light guide (angel eye), indicator crescent on top
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.02], [0.86, -0.075], [0, -0.075]], q.t);
    lathe(M.chrome, 0, 0, range(q.r, (t) => { const r = lerp(0.082, 0.04, t); return [r, -0.06 + (r * r) / 0.13]; }), q.t);
    tube(M.led, ring(0, 0, 0.07, -0.012, q.t), 0.0048, q.s);
    const R = 0.034 / Math.sin(Math.PI / 3);
    lathe(M.chrome, 0, 0, [[0.05, -0.05], [0.046, -0.03], [0.04, -0.016], [0.035, -0.014]], q.t);
    lathe(M.housing, 0, 0, [[0.035, -0.014], [0.033, -0.05]], q.t);
    lathe(M.glass, 0, 0, range(q.r, (t) => { const g = (Math.PI / 3) * (1 - t); return [R * Math.sin(g), -0.014 + R * (Math.cos(g) - 0.5)]; }), q.t);
    tube(M.amber, arc(S, 0.3 * Math.PI, 0.7 * Math.PI, 0.9, -0.018, q.r), 0.0035, q.s);
    lens(M.lens, S, 1, 0.002, 0.014, q.t, q.r);
  },
  // triple: three small projectors in a row, each in a chrome shroud, an LED guide under them and an amber tip
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.98, -0.02], [0.92, -0.055], [0, -0.055]], q.t);
    for (const u of [-0.13, 0, 0.13]) {
      const v = S.skew * u + 0.006, r = 0.028, R = r / Math.sin(Math.PI / 3);
      lathe(M.chrome, u, v, [[r * 1.42, -0.052], [r * 1.3, -0.032], [r * 1.1, -0.016], [r, -0.014]], q.t);
      lathe(M.housing, u, v, [[r, -0.014], [r * 0.95, -0.05]], q.t);
      lathe(M.glass, u, v, range(q.r, (t) => { const g = (Math.PI / 3) * (1 - t); return [R * Math.sin(g), -0.014 + R * (Math.cos(g) - 0.5)]; }), q.t);
    }
    tube(M.led, range(q.r * 3, (t) => { const u = lerp(-0.17, 0.17, t); return [u, S.skew * u - 0.042 * (1 + (S.taper * u) / S.a), -0.012]; }), 0.003, q.s);
    tube(M.amber, arc(S, -0.18 * Math.PI, 0.18 * Math.PI, 0.86, -0.014, q.r), 0.0035, q.s);
    lens(M.lens, S, 1, 0.002, 0.008, q.t, q.r);
  },
];

const ring = (cu, cv, r, w, n) => Array.from({ length: n + 1 }, (_, i) => [cu + r * Math.cos((TAU * i) / n), cv + r * Math.sin((TAU * i) / n), w]);
const square = (M, u, v, h, prof, phase = Math.PI / 4) => lathe(M, u, v, prof.map(([r, w]) => [r * h * Math.SQRT2, w]), 4, phase);

const TAIL_MODELS = [null,
  // twin round: two chrome-ringed rounds, each a reflector bowl with an LED ring and a Fresnel dome; inboard has reverse
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.02], [0.88, -0.07], [0, -0.07]], q.t);
    for (const [u, centre] of [[0.085, M.red], [-0.085, M.white]]) {
      lathe(M.chrome, u, 0, [[0.056, -0.004], [0.06, 0.002], [0.065, 0.002], [0.066, -0.01]], q.t);
      lathe(M.chrome, u, 0, range(q.r, (t) => { const r = lerp(0.056, 0.012, t); return [r, -0.06 + (r * r) / 0.09]; }), q.t);
      tube(M.red, ring(u, 0, 0.04, -0.016, q.t), 0.005, q.s);
      lathe(centre, u, 0, [[0.016, -0.034], [0.016, -0.022], [0.012, -0.019], [0, -0.018]], q.s);
      lathe(M.tint, u, 0, range(q.r * 2, (t) => { const r = 0.056 * (1 - t); return [r, -0.002 + 0.007 * (1 - (r / 0.056) ** 2) + 0.0008 * Math.sin((r / 0.056) * Math.PI * 7) ** 2]; }), q.t);
    }
    lens(M.lens, S, 1, 0.003, 0.008, q.t, q.r);
  },
  // blade: three stacked red light guides joined by a C on the outboard edge, amber indicator, reverse block, chrome sill
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.015], [0.9, -0.045], [0, -0.045]], q.t);
    tub(M.tint, S, [[0.95, -0.03], [0, -0.03]], q.t);
    const bu = (u) => S.b * (1 + (S.taper * u) / S.a);
    for (const lv of [-0.5, 0, 0.5]) tube(M.red, range(q.r * 3, (t) => { const u = lerp(-0.62 * S.a, 0.86 * S.a, t); return [u, S.skew * u + lv * 0.62 * bu(u), -0.012]; }), 0.0035, q.s);
    tube(M.red, arc(S, -0.32 * Math.PI, 0.32 * Math.PI, 0.86, -0.012, q.r * 2), 0.0035, q.s);
    tube(M.amber, arc(S, 0.58 * Math.PI, 0.86 * Math.PI, 0.84, -0.014, q.r), 0.0035, q.s);
    const ur = -0.8 * S.a;
    square(M.white, ur, S.skew * ur - 0.25 * bu(ur), 0.32 * bu(ur), [[1, -0.012], [1, -0.02], [0, -0.02]]);
    tube(M.chrome, range(q.r * 2, (t) => { const u = lerp(-0.7 * S.a, 0.8 * S.a, t); return [u, S.skew * u - 0.86 * bu(u), -0.008]; }), 0.0018, q.s);
    lens(M.lens, S, 1, 0.002, 0.008, q.t, q.r);
  },
  // block: a 3 x 2 grid of chrome cells, each with an emitter under a coloured square lens; chrome dividers between rows
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.02], [0.9, -0.06], [0, -0.06]], q.t);
    const cols = [-0.095, 0, 0.095], rowsV = [0.042, -0.042], h = 0.036;
    rowsV.forEach((v, ri) => cols.forEach((u, ci) => {
      const col = ri === 0 ? [M.red, M.tint] : ci === 2 ? [M.amber, M.amber] : ci === 0 ? [M.white, M.white] : [M.red, M.tint];
      square(M.chrome, u, v, h, [[1, -0.004], [0.92, -0.012], [0.4, -0.04], [0, -0.04]]);
      lathe(col[0], u, v, [[h * 0.3, -0.038], [h * 0.3, -0.03], [0, -0.029]], q.s);
      square(col[1], u, v, h, [[0.9, -0.009], [0.9, -0.006], [0, -0.005]]);
    }));
    tube(M.chrome, range(q.r * 2, (t) => [lerp(-0.14, 0.14, t), 0, -0.006]), 0.0025, q.s);
    for (const u of [-0.0475, 0.0475]) tube(M.chrome, range(q.r, (t) => [u, lerp(-0.08, 0.08, t), -0.006]), 0.0018, q.s);
    lens(M.lens, S, 1, 0.002, 0.006, q.t, q.r, 0.0006);
  },
  // single round: a deep chrome bowl, an LED ring, a red centre and a Fresnel-ringed red dome
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.02], [0.86, -0.07], [0, -0.07]], q.t);
    lathe(M.chrome, 0, 0, [[0.07, -0.004], [0.075, 0.002], [0.079, 0.002], [0.08, -0.01]], q.t);
    lathe(M.chrome, 0, 0, range(q.r, (t) => { const r = lerp(0.07, 0.014, t); return [r, -0.062 + (r * r) / 0.1]; }), q.t);
    tube(M.red, ring(0, 0, 0.05, -0.016, q.t), 0.0055, q.s);
    lathe(M.red, 0, 0, [[0.02, -0.036], [0.02, -0.022], [0.015, -0.019], [0, -0.018]], q.s);
    lathe(M.tint, 0, 0, range(q.r * 2, (t) => { const r = 0.07 * (1 - t); return [r, -0.002 + 0.008 * (1 - (r / 0.07) ** 2) + 0.0008 * Math.sin((r / 0.07) * Math.PI * 7) ** 2]; }), q.t);
  },
  // halo ring: two concentric red light guides around a dark, recessed centre with a white reverse dot
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.02], [0.88, -0.06], [0, -0.06]], q.t);
    lathe(M.chrome, 0, 0, [[0.078, -0.003], [0.082, 0.002], [0.086, 0.001], [0.087, -0.01]], q.t);
    tube(M.red, ring(0, 0, 0.066, -0.012, q.t), 0.005, q.s);
    tube(M.red, ring(0, 0, 0.042, -0.016, q.t), 0.0042, q.s);
    lathe(M.chrome, 0, 0, [[0.03, -0.024], [0.027, -0.03], [0.012, -0.032], [0, -0.032]], q.t);
    lathe(M.white, 0, 0, [[0.011, -0.032], [0.011, -0.024], [0.008, -0.021], [0, -0.02]], q.s);
    lens(M.tint, S, 0.97, 0.001, 0.004, q.t, q.r);
  },
  // triple round: three round units in a row, each a chrome ring round a red light guide; the inboard one has reverse
  (S, q, M) => {
    tub(M.housing, S, [[1, 0], [0.97, -0.02], [0.9, -0.06], [0, -0.06]], q.t);
    for (const [u, centre] of [[0.13, M.red], [0, M.red], [-0.13, M.white]]) {
      lathe(M.chrome, u, 0, [[0.043, -0.003], [0.047, 0.002], [0.05, 0.001], [0.051, -0.01]], q.t);
      lathe(M.chrome, u, 0, range(q.r, (t) => { const r = lerp(0.043, 0.01, t); return [r, -0.05 + (r * r) / 0.07]; }), q.t);
      tube(M.red, ring(u, 0, 0.031, -0.014, q.t), 0.0045, q.s);
      lathe(centre, u, 0, [[0.012, -0.03], [0.012, -0.02], [0.009, -0.017], [0, -0.016]], q.s);
      lathe(M.tint, u, 0, range(q.r * 2, (t) => { const r = 0.043 * (1 - t); return [r, -0.002 + 0.006 * (1 - (r / 0.043) ** 2)]; }), q.t);
    }
    lens(M.lens, S, 1, 0.002, 0.006, q.t, q.r);
  },
];

// ---------- ray casting against the body loft (stations x ring grid), chunked AABBs ----------
function intersect(o, d, a, b, c) {
  const e1 = sub(b, a), e2 = sub(c, a), pv = cross(d, e2), det = dot(e1, pv);
  if (Math.abs(det) < 1e-12) return null;
  const tv = sub(o, a), u = dot(tv, pv) / det;
  if (u < 0 || u > 1) return null;
  const qv = cross(tv, e1), v = dot(d, qv) / det;
  if (v < 0 || u + v > 1) return null;
  const t = dot(e2, qv) / det;
  return t > 1e-6 ? [t, u, v] : null;
}

// Body mesh access: ray casts plus `surf(ci, cr)`, the mesh as a function of continuous (station, ring) coordinates.
// Within a grid quad it is exactly the two render triangles; normals interpolate the renderer's vertex normals.
// `end`: 'front' / 'rear' (strips within FRONT of that end) or an [x0, x1] range; only those strips are searchable.
export function bodyMesh({ position: p, N, RL, xF, xR }, end = 'front') {
  const G = 8, nc = Math.ceil(RL / G);
  let i0 = 0, i1 = N - 1;
  if (Array.isArray(end)) {
    while (i0 < N - 2 && p[(i0 + 1) * RL * 3] < end[0]) i0++;
    i1 = i0 + 1; while (i1 < N - 1 && p[i1 * RL * 3] < end[1]) i1++;
  } else if (end === 'front') { i1 = 1; while (i1 < N - 1 && p[i1 * RL * 3] < xF + FRONT) i1++; }
  else { i0 = N - 2; while (i0 > 0 && p[i0 * RL * 3] > xR - FRONT) i0--; }
  const NB = i1 - i0;
  const vi = (i, r) => (i * RL + (((r % RL) + RL) % RL)) * 3;
  const P3 = (i, r) => { const v = vi(i, r); return [p[v], p[v + 1], p[v + 2]]; };
  const box = new Float64Array(NB * nc * 6);
  for (let i = i0; i < i1; i++) for (let c = 0; c < nc; c++) {
    const o = ((i - i0) * nc + c) * 6;
    box.fill(Infinity, o, o + 3); box.fill(-Infinity, o + 3, o + 6);
    for (let ii = i; ii <= i + 1; ii++) for (let r = c * G; r <= Math.min(c * G + G, RL); r++) {
      const v = vi(ii, r);
      for (let a = 0; a < 3; a++) { box[o + a] = Math.min(box[o + a], p[v + a]); box[o + 3 + a] = Math.max(box[o + 3 + a], p[v + a]); }
    }
  }
  // vertex normal exactly as the renderer computes it: area-weighted sum over the six grid triangles sharing the vertex
  const face = (a, b, c) => cross(sub(P3(...b), P3(...a)), sub(P3(...c), P3(...a)));
  const vn = ([i, r]) => {
    const tris = [];
    if (i < N - 1) tris.push([[i, r], [i + 1, r], [i, r + 1]], [[i, r - 1], [i + 1, r - 1], [i, r]], [[i, r], [i + 1, r - 1], [i + 1, r]]);
    if (i > 0) tris.push([[i - 1, r], [i, r], [i - 1, r + 1]], [[i - 1, r + 1], [i, r], [i, r + 1]], [[i - 1, r], [i, r - 1], [i, r]]);
    return tris.reduce((s, t) => add(s, face(...t)), [0, 0, 0]);
  };
  const vnu = (i, r) => unit(vn([i, r]));
  const surf = (ci, cr) => {
    const i = clamp(Math.floor(ci), 0, N - 2), r = Math.floor(cr), fi = clamp(ci - i, 0, 1), fr = cr - r;
    const A = P3(i, r), B = P3(i, r + 1), C = P3(i + 1, r), D = P3(i + 1, r + 1);
    if (fi + fr <= 1) {
      const Ji = sub(C, A), Jr = sub(B, A);
      const n = add(add(mul(vnu(i, r), 1 - fi - fr), mul(vnu(i + 1, r), fi)), mul(vnu(i, r + 1), fr));
      return { p: add(A, add(mul(Ji, fi), mul(Jr, fr))), n: unit(n), Ji, Jr };
    }
    const Ji = sub(D, B), Jr = sub(D, C);
    const n = add(add(mul(vnu(i + 1, r + 1), fi + fr - 1), mul(vnu(i, r + 1), 1 - fi)), mul(vnu(i + 1, r), 1 - fr));
    return { p: add(D, add(mul(Ji, fi - 1), mul(Jr, fr - 1))), n: unit(n), Ji, Jr };
  };
  // strip index holding x (stations are sorted by x)
  const stripAt = (x) => { let lo = i0, hi = i1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m * RL * 3] <= x) lo = m; else hi = m; } return lo; };
  // tMax (optional): only hits closer than that count, so only the strips the segment spans in x are searched
  const cast = (o, d, tMax = Infinity) => {
    const inv = d.map((x) => 1 / x);
    let bt = tMax, best = null, b0 = 0, b1 = box.length;
    if (d[0] === 0 || tMax < Infinity) {
      const xa = o[0] + Math.min(0, d[0] * (tMax < Infinity ? tMax : 0)), xb = o[0] + Math.max(0, d[0] * (tMax < Infinity ? tMax : 0));
      b0 = Math.max(stripAt(xa) - 1 - i0, 0) * nc * 6; b1 = Math.min(stripAt(xb) + 2 - i0, NB) * nc * 6;
    }
    for (let b = b0; b < b1; b += 6) {
      let t0 = 0, t1 = bt;
      for (let a = 0; a < 3; a++) {
        let ta = (box[b + a] - o[a]) * inv[a], tb = (box[b + 3 + a] - o[a]) * inv[a];
        if (ta > tb) [ta, tb] = [tb, ta];
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      }
      if (t0 > t1) continue;
      const k = b / 6, i = i0 + Math.floor(k / nc), c = k % nc;
      for (let r = c * G; r < Math.min(c * G + G, RL); r++) {
        const A = [i, r], B = [i, r + 1], C = [i + 1, r], D = [i + 1, r + 1];
        for (const tri of [[A, C, B], [B, C, D]]) {
          const h = intersect(o, d, P3(...tri[0]), P3(...tri[1]), P3(...tri[2]));
          if (h && h[0] < bt) { bt = h[0]; best = [tri, h[1], h[2]]; }
        }
      }
    }
    if (!best) return null;
    const [tri, u, v] = best, w = [1 - u - v, u, v];
    let n = tri.reduce((s, t, k) => add(s, mul(unit(vn(t)), w[k])), [0, 0, 0]);
    if (Math.hypot(...n) < 1e-6) { const [a, b, c] = tri.map((t) => P3(...t)); n = cross(sub(b, a), sub(c, a)); }
    const ci = tri.reduce((s, t, k) => s + t[0] * w[k], 0), cr = tri.reduce((s, t, k) => s + t[1] * w[k], 0);
    return { t: bt, p: add(o, mul(d, bt)), n: unit(n), ci, cr };
  };
  // walk on the skin in mesh coordinates, parallel-transporting the direction, until `stop(sample)` or the length is used
  const walk = (ci, cr, dir, len, stop) => {
    const path = [{ ci, cr, s: 0 }];
    for (let s = 0, it = 0; s < len - 1e-6 && it < (len / STEP) * 3 + 400; it++) {
      const A = surf(ci, cr);
      dir = unit(sub(dir, mul(A.n, dot(dir, A.n))));
      const d = mul(dir, Math.min(STEP, len - s));
      const a11 = dot(A.Ji, A.Ji), a12 = dot(A.Ji, A.Jr), a22 = dot(A.Jr, A.Jr), b1 = dot(A.Ji, d), b2 = dot(A.Jr, d), det = a11 * a22 - a12 * a12;
      if (det < 1e-16) break;
      // at most half a cell per step: the loft collapses rows near the cut line, where the solve would leap
      let di = (a22 * b1 - a12 * b2) / det, dr = (a11 * b2 - a12 * b1) / det;
      const big = Math.max(Math.abs(di), Math.abs(dr)) * 2;
      if (big > 1) { di /= big; dr /= big; }
      const ni = ci + di, nr = cr + dr;
      if (ni < 1 || ni > N - 2) break;
      const B = surf(ni, nr);
      if (stop(B)) break;
      s += Math.hypot(...sub(B.p, A.p)); ci = ni; cr = nr;
      path.push({ ci, cr, s });
    }
    return path;
  };
  return { cast, surf, walk, N };
}

// (station, ring) at arc length s along a walked path
export const along = (path, s) => {
  let j = 0;
  while (j < path.length - 2 && path[j + 1].s < s) j++;
  const a = path[j], b = path[Math.min(j + 1, path.length - 1)], t = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
  return [lerp(a.ci, b.ci, t), lerp(a.cr, b.cr, t)];
};

// erode then blur around a closed loop (or an open run): a smooth curve that never exceeds the input
export function smoothLoop(a, er, open = false) {
  const n = a.length, sig = Math.max(er / 2.5, 1e-3), at = (i) => a[open ? clamp(i, 0, n - 1) : (i + n) % n];
  const m = a.map((_, i) => { let v = Infinity; for (let k = -er; k <= er; k++) v = Math.min(v, at(i + k)); return v; });
  return m.map((_, i) => {
    let s = 0, ws = 0;
    for (let k = -er; k <= er; k++) { const w = Math.exp(-(k * k) / (2 * sig * sig)); s += w * m[open ? clamp(i + k, 0, n - 1) : (i + k + n) % n]; ws += w; }
    return s / ws;
  });
}

// right lamp in the car frame, mirrored to the left (z -> -z, winding flipped)
export function mirrored(p, i, nrm) {
  const n = p.length / 3, P = new Float32Array(n * 6), I = new Uint32Array(i.length * 2);
  P.set(p);
  for (let j = 0; j < n; j++) { P[3 * (n + j)] = p[3 * j]; P[3 * (n + j) + 1] = p[3 * j + 1]; P[3 * (n + j) + 2] = -p[3 * j + 2]; }
  I.set(i);
  for (let j = 0; j < i.length; j += 3) { I[i.length + j] = i[j] + n; I[i.length + j + 1] = i[j + 2] + n; I[i.length + j + 2] = i[j + 1] + n; }
  const out = { position: P, index: I };
  if (nrm) {
    out.normal = new Float32Array(n * 6);
    out.normal.set(nrm);
    for (let j = 0; j < n; j++) { out.normal[3 * (n + j)] = nrm[3 * j]; out.normal[3 * (n + j) + 1] = nrm[3 * j + 1]; out.normal[3 * (n + j) + 2] = -nrm[3 * j + 2]; }
  }
  return out;
}

export const LAMP_PARTS = ['housing', 'chrome', 'lens', 'glass', 'led', 'amber', 'red', 'tint', 'white'];
const FRONT = 1.6, LIP = 0.003, REACH = 0.6, MAX_BACK = 0.2, OVERLAP = 0.006, GRAZE = 0.35, CLEAR = 0.01, STEP = 0.008;

export const buildHeadlights = (P, body, detail) => buildLamps(P, body, detail, 'front');
export const buildTaillights = (P, body, detail) => buildLamps(P, body, detail, 'rear');

// front: hl* parameters, faces -x, height between chin and hood edge; rear: tl* parameters, faces +x, tail to deck
function buildLamps(P, body, detail = 1, end = 'front') {
  const rear = end === 'rear', Q = (key) => P[(rear ? 'tl' : 'hl') + key], sx = rear ? 1 : -1;
  const S1 = (rear ? TAIL_SHAPES : SHAPES)[Q('Type')];
  if (!S1) return null;
  const k = Q('Size'), S = { ...S1, a: S1.a * k, b: S1.b * k }, m = Q('Blend');
  const { cast, surf, walk } = bodyMesh(body, end);

  const nT = lod(detail, 12, 128);
  const sw = (Q('Sweep') * Math.PI) / 180, rk = (Q('Rake') * Math.PI) / 180;
  const F = [sx * Math.cos(sw) * Math.cos(rk), Math.sin(rk), Math.sin(sw) * Math.cos(rk)];
  // u stays outboard and v up at either end (the rear frame is mirrored; lamp internals are double sided)
  const U0 = unit([-sx * F[2], 0, sx * F[0]]), V0 = rear ? cross(U0, F) : cross(F, U0);
  // angle: roll about the lamp axis; positive lifts the outboard end (the aggressive, slanted look), negative droops it
  const ra = (Q('Angle') * Math.PI) / 180, cr = Math.cos(ra), srl = Math.sin(ra);
  const U = add(mul(U0, cr), mul(V0, srl)), V = add(mul(U0, -srl), mul(V0, cr));
  // outer edge relaxes toward an ellipse as hlRound grows, so wide bezels shed the lamp's sharp corners
  const nO = lerp(S.n, 2, Q('Round') * clamp(m / (0.25 * (S.a + S.b)), 0, 1));

  // pose: height and spread are plain car-frame numbers; only the depth is found, by one ray at the lamp centre.
  // Each rim point is projected onto the skin along the lamp axis (the seed); the bezel edge is then walked outward
  // from the seed along the skin, so wide bezels wrap onto the hood and around the corners.
  const place = (yC, zC, nT) => {
    const c0 = cast([rear ? body.xR + 1 : body.xF - 1, yC, zC], [-sx, 0, 0]);
    const O = [(c0 ? c0.p[0] : rear ? body.xR - 0.15 : body.xF + 0.15) + sx * Q('Depth'), yC, zC];
    const toCar = (u, v, w) => [0, 1, 2].map((a) => O[a] + u * U[a] + v * V[a] + w * F[a]);
    const cols = [];
    let landed = 0;
    for (let c = 0; c < nT; c++) {
      const th = (TAU * c) / nT, [ui, vi] = outline(S, th), [uo, vo] = outline(S, th, m, nO);
      const seed = cast(toCar(ui, vi, REACH), mul(F, -1));
      const ok = seed && seed.t < REACH + MAX_BACK && dot(seed.n, F) > GRAZE && seed.p[2] > CLEAR;
      if (ok) landed++;
      cols.push({ Pi: toCar(ui, vi, LIP), er: unit(sub(toCar(uo, vo, 0), toCar(ui, vi, 0))), len: Math.hypot(uo - ui, vo - vi), seed: ok ? seed : null });
    }
    return { O, toCar, cols, landed, ok: landed === nT };
  };
  // a lamp hanging past the body's edge cannot seat: slide it toward the middle of the end face until it does
  const [zLo, zHi] = rear ? [P.tailBotZ, P.profile[6][1]] : [P.chinZ, P.profile[1][1]];
  const yU = lerp(zLo, zHi, Q('H')), zU = Q('Z') * body.W0;
  const yS = lerp(zLo, zHi, 0.5), zS = Math.min(zU, 0.45 * body.W0);
  const at = (t, n = nT) => place(lerp(yU, yS, t), lerp(zU, zS, t), n);
  let pose = at(0), fit = 0;
  if (!pose.ok) {
    let lo = 0, hi = 1;
    for (let it = 0; it < 6; it++) { const mid = (lo + hi) / 2; if (at(mid, 32).ok) hi = mid; else lo = mid; }
    for (fit = hi; !(pose = at(fit)).ok && fit < 1;) fit = Math.min(1, fit + 1 / 64);
  }
  const { O, toCar, cols, landed } = pose;

  // skin walk stops at the centre line, at the nose tip, and where the skin turns away (rear-facing or underside)
  const stopLamp = (B) => B.p[2] < CLEAR || dot(B.n, F) < -0.2 || B.n[1] < -0.6;
  const paths = cols.map((c) => (c.seed ? walk(c.seed.ci, c.seed.cr, c.er, c.len, stopLamp) : null));
  // columns that had to stop early pull their neighbours in smoothly instead of leaving a notch
  const reach = smoothLoop(cols.map((c, i) => (paths[i] ? paths[i][paths[i].length - 1].s / Math.max(c.len, 1e-6) : 0)), Math.ceil(nT / 16));

  // Bezel = the skin along each walked path, lifted toward the lamp rim by a displacement that decays to zero at the
  // edge. It follows every body contour by construction and ends as the skin itself (flat value, slope, curvature).
  // Decay profile: hlMelt blends a pillow (holds the rim height, rolls off late) with a flare (drops at the rim, long tail).
  const poly = new Float32Array(nT * 2), box = [Infinity, Infinity, -Infinity, -Infinity];
  const nS = lod(detail, 3, clamp(Math.round(m / 0.008) + 12, 16, 56));
  const rowsT = Array.from({ length: nS }, (_, s) => { const u = s / (nS - 1); return lerp(u, 0.5 - 0.5 * Math.cos(Math.PI * u), 0.5); });
  const decay = (t) => lerp(1 - t * t * t * (t * (6 * t - 15) + 10), (1 - t) ** 3, Q('Melt'));
  const grd = new Array(nS * nT), gn = new Array(nS * nT), skinN = new Array(nT);
  cols.forEach((c, i) => {
    const path = paths[i];
    if (!path) {
      for (let s = 0; s < nS; s++) { grd[s * nT + i] = toCar(...outline(S, (TAU * i) / nT, m * rowsT[s], nO), LIP - m * rowsT[s]); gn[s * nT + i] = F; }
      skinN[i] = F;
      return;
    }
    const L = reach[i] * c.len, [qi, qr] = along(path, Math.max(0, L - OVERLAP)), d0 = dot(sub(c.Pi, c.seed.p), F);
    poly[2 * i] = qi; poly[2 * i + 1] = qr;
    box[0] = Math.min(box[0], qi); box[1] = Math.min(box[1], qr); box[2] = Math.max(box[2], qi); box[3] = Math.max(box[3], qr);
    for (let s = 0; s < nS; s++) {
      const t = rowsT[s], A = surf(...along(path, t * L)), bump = Q('Crown') * Math.sin(Math.PI * t) ** 3;
      grd[s * nT + i] = add(add(A.p, mul(F, d0 * decay(t))), mul(unit(add(A.n, F)), bump));
      gn[s * nT + i] = A.n;
      if (s === nS - 1) skinN[i] = A.n;
    }
  });
  const node = (s, c) => grd[s * nT + ((c + nT) % nT)];
  const raw = (s, c) => cross(sub(node(s, c + 1), node(s, c - 1)), sub(node(Math.min(s + 1, nS - 1), c), node(Math.max(s - 1, 0), c)));
  const flip = skinN.reduce((acc, n, c) => acc + dot(raw(nS - 1, c), n), 0) < 0 ? -1 : 1;
  const bp = [], bn = [], bi = [];
  for (let s = 0; s < nS; s++) for (let c = 0; c < nT; c++) {
    bp.push(...node(s, c));
    // where the lift has decayed the bezel is the skin: shade it with the skin's own normal
    const w = Math.max(decay(rowsT[s]), Math.abs(Q('Crown')) > 0 ? Math.sin(Math.PI * rowsT[s]) ** 3 : 0);
    bn.push(...(s === nS - 1 ? skinN[c] : unit(add(mul(unit(raw(s, c)), flip * w), mul(gn[s * nT + c], 1 - w)))));
  }
  for (let s = 0; s < nS - 1; s++) for (let c = 0; c < nT; c++) {
    const a = s * nT + c, b = s * nT + ((c + 1) % nT);
    // (s,c) -> (s,c+1) -> (s+1,c) faces along d(theta) x d(s): the flip-corrected normal side
    if (flip > 0) bi.push(a, b, a + nT, b, b + nT, a + nT);
    else bi.push(a, a + nT, b, b, a + nT, b + nT);
  }

  const out = { bezel: { ...mirrored(bp, bi, bn), rows: nS, cols: nT }, landed, cols: nT, fit, reach: Math.min(...reach) };
  const M = Object.fromEntries(LAMP_PARTS.map((n) => [n, mesh()]));
  (rear ? TAIL_MODELS : MODELS)[Q('Type')](S1, { t: lod(detail, 12, 72), r: lod(detail, 3, 10), s: lod(detail, 6, 20) }, M);
  for (const name in M) {
    const { p, i } = M[name], q = [];
    for (let j = 0; j < p.length; j += 3) q.push(...toCar(p[j] * k, p[j + 1] * k, p[j + 2] * k));
    out[name] = mirrored(q, i);
  }
  // skin cut: the bezel edge (pulled in by OVERLAP) as a polygon in the body's (station, ring) coordinates
  out.hole = landed === nT ? { poly, n: nT, box } : null;
  return out;
}
