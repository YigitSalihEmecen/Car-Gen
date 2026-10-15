// Hood features: an engine sticking out (a supercharger through a hole in the hood), three louvred vents on each side,
// a raised intake scoop in the middle, and the same scoop turned round as a cowl-induction intake facing the
// windshield. Shells that rise out of the hood are built on the hood's own surface law (deckAt): every section starts
// on the skin and is sunk 3-4 mm into it, so the part grows out of the hood with a clean intersection line. The engine is
// rigid hardware standing in a dark opening trimmed with a chrome ring.
import { pushTube } from './kit.js';
import { tube } from './roof.js';
import { bags, finish, frame, extrude, spin, rrect, add, lerp, clamp, lod, smooth, X, Y, Z } from './acc.js';

export const HOOD_TYPES = ['None', 'Blower', 'Side vents', 'Center scoop', 'Cowl scoop'];
const quarter = (t) => Math.sqrt(1 - (1 - clamp(t, 0, 1)) ** 2);

// body: { deckAt(x, lat), flatW(x), xHood, xA }
export function buildHood(P, body, detail = 1) {
  const t = P.hdType;
  if (!t) return null;
  const len = body.xA - body.xHood;
  if (len < 0.35) return null;
  const B = bags(), k = P.hdSize, nS = lod(detail, 8, 26), nT = lod(detail, 8, 24);
  if (t === 1) blower(P, body, B, k, detail);
  else if (t === 2) vents(body, B, k, nS, nT);
  else scoop(body, B, k, t === 4, nS, nT);
  return finish(B, t === 2);
}

// raised scoop: rings across the car from its tail to the mouth, then a lip turning into a cavity; a dark mesh inside
function scoop(body, B, k, cowl, nS, nT) {
  const len = body.xA - body.xHood, L = Math.min(0.5 * k, 0.75 * len), b0 = Math.min(0.18 * k, 0.6 * body.flatW(body.xA - 0.1)), H = 0.06 * k;
  const xc = cowl ? body.xA - L / 2 - 0.04 : lerp(body.xHood, body.xA, 0.42), dir = cowl ? 1 : -1;
  const xs = (s) => xc - (dir * L) / 2 + dir * s * L; // s = 0 tail, 1 mouth
  const hS = (s) => H * smooth(s / 0.7) ** 0.8, lat = (u) => 1 - smooth((Math.abs(u) - 0.5) / 0.5);
  const ring = (s, inset = 0, back = 0) => {
    const x = xs(s) - dir * back, b = b0 * lerp(0.72, 1, s) - inset, top = [], bot = [];
    for (let i = 0; i <= nT; i++) {
      const u = -1 + (2 * i) / nT, z = u * b, d = body.deckAt(x, z);
      top.push([x, d - 0.003 + Math.max(0, hS(s) * lat(u) - inset), z]);
      bot.push([x, d - 0.004 - (inset ? 0.002 : 0), z]);
    }
    return [...bot.reverse(), ...top];
  };
  const rings = Array.from({ length: nS + 1 }, (_, i) => ring(i / nS));
  // the lip: 6 mm thick, then the cavity running 9 cm back into the scoop
  rings.push(ring(1, 0.006, 0), ring(1, 0.006, 0.04), ring(1, 0.006, 0.09));
  pushTube(B.paint, rings);
  const m = ring(1, 0.008, 0.07).map((p) => [...p]), m2 = m.map((p) => add(p, [-dir * 0.006, 0, 0]));
  pushTube(B.dark, [m, m2]);
}

// louvres: three wedges per side, rising rearward from a feather edge to an open back, each over a dark slot
function vents(body, B, k, nS, nT) {
  for (let i = 0; i < 3; i++) {
    const x0 = body.xA - 0.1 - i * 0.075 * k, c = 0.045 * k, h = 0.013 * k, Lz = 0.2 * k, zc = Math.min(0.56 * body.flatW(x0), body.flatW(x0) - Lz / 2 - 0.03);
    if (zc - Lz / 2 < 0.05) return;
    const rings = [], slot = [];
    for (let j = 0; j <= nT; j++) {
      const f = j / nT, z = zc - Lz / 2 + f * Lz, e = quarter(Math.min(f, 1 - f) / 0.12), top = [], bot = [];
      for (let q = 0; q <= nS; q++) {
        const s = q / nS, x = x0 - c / 2 + s * c, d = body.deckAt(x, z), lift = h * e * s ** 1.5;
        top.push([x, d - 0.003 + lift + 0.002 * e, z]);
        bot.push([x, d - 0.004 + Math.max(0, lift - 0.003), z]);
      }
      rings.push([...bot, ...top.reverse()]);
      // the slot under the louvre's open back: a dark strip just proud of the skin
      if (j % Math.max(1, nT >> 3) === 0 || j === nT) slot.push(z);
    }
    pushTube(B.paint, rings);
    const sl = (z, lift) => [[x0 - c * 0.1, body.deckAt(x0 - c * 0.1, z) + lift, z], [x0 + c * 0.46, body.deckAt(x0 + c * 0.46, z) + lift, z]];
    const strip = slot.slice(1, -1).map((z) => [...sl(z, -0.002), ...sl(z, 0.0016).reverse()]);
    if (strip.length > 1) pushTube(B.dark, strip);
  }
}

// supercharger through the hood: opening and trim ring, manifold, ribbed case, belt drive at the front, injector hat
function blower(P, body, B, k, detail) {
  const xc = lerp(body.xHood, body.xA, 0.55), y0 = body.deckAt(xc, 0), segs = lod(detail, 12, 40), seg = lod(detail, 2, 5);
  const ax = 0.2 * k, az = 0.16 * k, F = (y) => frame([xc, y, 0], X, Z, Y), up = (poly, y0_, y1_, bev, M) => extrude(M, F(0), poly, y0_, y1_, bev);
  // opening: a dark sheet following the hood, ringed by chrome
  const nc = lod(detail, 8, 30), cols = [];
  for (let i = 0; i <= nc; i++) {
    const x = xc - ax + (2 * ax * i) / nc, w = az * Math.sqrt(Math.max(0.02, 1 - ((x - xc) / ax) ** 8));
    cols.push([[-w, -0.004], [w, -0.004], [w, 0.0025], [-w, 0.0025]].map(([z, dy]) => [x, body.deckAt(x, z) + dy, z]));
  }
  pushTube(B.dark, cols);
  const loop = Array.from({ length: 64 }, (_, i) => { const a = (2 * Math.PI * i) / 64, c = Math.cos(a), s = Math.sin(a), x = xc + ax * Math.sign(c) * Math.abs(c) ** 0.25, z = az * Math.sign(s) * Math.abs(s) ** 0.25; return [x, body.deckAt(x, z) + 0.003, z]; });
  tube(B.chrome, loop, 0.006, 10, true);
  // manifold and case
  up(rrect(0.16 * k, 0.12 * k, 0.03 * k, seg), y0 - 0.03, y0 + 0.05 * k, 0.006, B.black);
  up(rrect(0.17 * k, 0.12 * k, 0.05 * k, seg), y0 + 0.05 * k, y0 + 0.19 * k, 0.01, B.metal);
  for (let r = 0; r < 5; r++) { const y = y0 + (0.075 + r * 0.024) * k; up(rrect(0.176 * k, 0.126 * k, 0.052 * k, seg), y, y + 0.006 * k, 0.002, B.metal); }
  // belt drive on the front face: crank-side pulley low, blower pulley high, a belt round both
  const xf = xc - 0.17 * k - 0.012, P1 = [0.0, y0 + 0.14 * k], P2 = [0.05 * k, y0 + 0.03 * k], r1 = 0.055 * k, r2 = 0.04 * k, fr = (p) => frame([xf, p[1], p[0]], Z, Y, [-1, 0, 0]);
  for (const [p, r] of [[P1, r1], [P2, r2]]) {
    spin(B.black, fr(p), 0, 0, [[0, -0.02], [r, -0.02], [r, -0.017], [r * 0.9, -0.012], [r, -0.007], [r, -0.004], [0, -0.004]], segs);
    spin(B.chrome, fr(p), 0, 0, [[0, -0.001], [r * 0.3, -0.002], [r * 0.32, -0.006], [0, -0.006]], 12);
  }
  const pts = [];
  for (const [p, r] of [[P1, r1 * 0.9 + 0.004], [P2, r2 * 0.9 + 0.004]]) for (let i = 0; i < 48; i++) { const a = (2 * Math.PI * i) / 48; pts.push([p[0] + r * Math.cos(a), p[1] + r * Math.sin(a)]); }
  const hull = convexHull(pts).map(([z, y]) => [xf + 0.012, y, z]);
  tube(B.rubber, densify(hull, 0.01), 0.004, 8, true);
  // injector hat: a chrome scoop open to the front, butterflies in its mouth
  const hy = y0 + 0.19 * k, hl = 0.26 * k, hw = 0.1 * k, hh = 0.07 * k, nH = lod(detail, 6, 16);
  const sec = (x, inset, h) => rrect(hw - inset, h / 2 - inset, Math.min(0.025 * k, h / 2 - inset - 0.001), seg).map(([z, y]) => [x, hy + h / 2 + y, z]);
  const rings = Array.from({ length: nH + 1 }, (_, i) => { const f = i / nH; return sec(xc + 0.06 * k - f * hl, 0, hh * lerp(0.5, 1, smooth(f / 0.6))); });
  rings.push(sec(xc + 0.06 * k - hl, 0.006, hh), sec(xc + 0.06 * k - hl + 0.08 * k, 0.006, hh));
  pushTube(B.chrome, rings);
  for (const z of [-0.5, 0, 0.5]) extrude(B.dark, frame([xc + 0.06 * k - hl + 0.05 * k, hy + hh / 2, z * hw * 0.9], Y, X, Z), rrect(hh / 2 - 0.012, 0.014, 0.003, 1), -0.003, 0.003, 0.001);
  extrude(B.dark, frame([xc + 0.06 * k - hl + 0.072 * k, hy + hh / 2, 0], Z, Y, X), rrect(hw - 0.008, hh / 2 - 0.008, 0.01, seg), 0, 0.004, 0.001);
}

function convexHull(p) {
  const s = p.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of s) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of s.reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}
function densify(loop, step) {
  const out = [];
  for (let i = 0; i < loop.length; i++) { const a = loop[i], b = loop[(i + 1) % loop.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / step)); for (let j = 0; j < n; j++) out.push([0, 1, 2].map((q) => lerp(a[q], b[q], j / n))); }
  return out;
}
