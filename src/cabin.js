// Cabin (greenhouse) as its own crisp volume, sitting on the body's beltline deck.
// A superellipse loft of height levels: each level is a rounded-rectangle plan whose front / rear follow the windshield
// and backlight lines, whose width tapers (tumblehome) and whose front / rear edges are crowned. The roof edge rolls over
// with a small radius and the roof is crowned. Windows are real geometry (glass on a black gasket) laid out on flat
// (s, t) charts of the skin, so every pillar keeps one width on the surface.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
// Quarter of a rounded rectangle with circular corners (half extents A along the car, B across, corner radius r).
// a in [0, pi/2]: 0 = middle of the side, pi/2 = middle of the front / rear face; the corner's midpoint sits at
// exactly pi/4 (the A / C pillar axes). Points are spaced by arclength within each half-quadrant, except that the
// corner arc always gets at least ARC_SHARE of them: a tight corner is still resolved, never cut by one chord.
const ARC_SHARE = 0.25;
function roundedRect(a, A, B, r) {
  r = Math.min(Math.max(r, 1e-4), 0.98 * Math.min(A, B));
  const Ls = A - r, Lf = B - r, arcH = (Math.PI / 4) * r, q = Math.PI / 4;
  const arc = (phi) => [Ls + r * Math.sin(phi), Lf + r * Math.cos(phi)];
  if (a <= q) {
    const sig = Math.min(Ls / (Ls + arcH), 1 - ARC_SHARE), u = a / q;
    return u <= sig ? [(u / sig) * Ls, B] : arc(((u - sig) / (1 - sig)) * q);
  }
  const sig = Math.max(arcH / (arcH + Lf), ARC_SHARE), u = (a - q) / q;
  return u <= sig ? arc(q + (u / sig) * q) : [A, Math.max(0, Lf * (1 - (u - sig) / (1 - sig)))];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const NQ = 96, FQ = 24;
// engineered limits: glass is never bent tighter than these radii (m), pillars never thinner than these widths (m)
const R_SIDE = 1.6, R_SHIELD = 2.0, R_WRAP = 1.4, R_ROOF = 3.0;
export const MIN_A = 0.06, MIN_PILLAR = 0.05, MIN_C = 0.07;
// largest bow (sagitta) a span may carry without dropping below radius R
const bowCap = (span, R) => (span * span) / (8 * R);

class Mesh {
  constructor(center) { this.pos = []; this.idx = []; this.nrm = []; this.center = center; }
  v(p, n) { this.pos.push(p[0], p[1], p[2]); if (n) this.nrm.push(n[0], n[1], n[2]); return this.pos.length / 3 - 1; }
  at(i) { return [this.pos[3 * i], this.pos[3 * i + 1], this.pos[3 * i + 2]]; }
  // triangle wound so its normal points away from the solid's interior reference point
  tri(a, b, c, center = this.center) {
    const A = this.at(a), n = cross(sub(this.at(b), A), sub(this.at(c), A));
    const m = [(A[0] + this.at(b)[0] + this.at(c)[0]) / 3, (A[1] + this.at(b)[1] + this.at(c)[1]) / 3, (A[2] + this.at(b)[2] + this.at(c)[2]) / 3];
    if (dot(n, sub(m, center)) >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  band(lo, hi, closed = true, center) {
    const n = lo.length;
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const j = (i + 1) % n;
      this.tri(lo[i], lo[j], hi[j], center); this.tri(lo[i], hi[j], hi[i], center);
    }
  }
  // same topology with one winding for the whole sheet (no per-triangle guess)
  bandWound(lo, hi, flip) {
    const n = lo.length, push = (a, b, c) => (flip ? this.idx.push(a, c, b) : this.idx.push(a, b, c));
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; push(lo[i], lo[j], hi[j]); push(lo[i], hi[j], hi[i]); }
  }
  fan(ring, c, center) { for (let i = 0; i < ring.length; i++) this.tri(ring[i], ring[(i + 1) % ring.length], c, center); }
  // analytic normals (when every vertex supplied one) keep mirror-like glass smooth at any tessellation
  out() {
    const o = { position: new Float32Array(this.pos), index: new Uint32Array(this.idx) };
    if (this.nrm.length === this.pos.length) o.normal = new Float32Array(this.nrm);
    return o;
  }
}

// ---------- 2D polygon helpers on the (s, t) charts ----------
const area = (p) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
const centroid = (p) => {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x0, y0] = p[i], [x1, y1] = p[(i + 1) % p.length], w = x0 * y1 - x1 * y0; a += w; cx += (x0 + x1) * w; cy += (y0 + y1) * w; }
  return Math.abs(a) < 1e-12 ? p[0] : [cx / (3 * a), cy / (3 * a)];
};
// keep the part of a polygon where side * (s - (a + b t) - d) >= 0
function clipHalf(poly, a, b, d, side) {
  const g = (p) => side * (p[0] - (a + b * p[1]) - d), out = [];
  for (let i = 0; i < poly.length; i++) {
    const P = poly[i], Q = poly[(i + 1) % poly.length], gp = g(P), gq = g(Q);
    if (gp >= 0) out.push(P);
    if ((gp >= 0) !== (gq >= 0)) { const k = gp / (gp - gq); out.push([P[0] + (Q[0] - P[0]) * k, P[1] + (Q[1] - P[1]) * k]); }
  }
  return out;
}
function chamfer(poly, c) {
  if (c < 0.004) return poly;
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n], b = poly[i], d = poly[(i + 1) % n];
    const e0 = [a[0] - b[0], a[1] - b[1]], e1 = [d[0] - b[0], d[1] - b[1]], l0 = Math.hypot(...e0), l1 = Math.hypot(...e1);
    const turn = (b[0] - a[0]) * (d[1] - b[1]) - (b[1] - a[1]) * (d[0] - b[0]);
    if (l0 < 1e-6 || l1 < 1e-6 || Math.abs(turn) < 1e-6) { out.push(b); continue; }
    const cc = Math.min(c, 0.45 * Math.min(l0, l1));
    out.push([b[0] + (e0[0] / l0) * cc, b[1] + (e0[1] / l0) * cc], [b[0] + (e1[0] / l1) * cc, b[1] + (e1[1] / l1) * cc]);
  }
  return out;
}
function densify(poly, step) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function grow(poly, d) {
  const n = poly.length, s = area(poly) < 0 ? -1 : 1;
  const nrm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  return poly.map((p, i) => {
    const a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const n1 = nrm([s * (p[1] - a[1]), -s * (p[0] - a[0])]), n2 = nrm([s * (b[1] - p[1]), -s * (b[0] - p[0])]);
    const m = nrm([n1[0] + n2[0], n1[1] + n2[1]]), c = Math.max(0.5, m[0] * n1[0] + m[1] * n1[1]);
    return [p[0] + (m[0] * d) / c, p[1] + (m[1] * d) / c];
  });
}
const windowOk = (w) => {
  if (w.length < 3) return false;
  const ss = w.map((p) => p[0]), ts = w.map((p) => p[1]);
  return Math.max(...ss) - Math.min(...ss) >= 0.14 && Math.max(...ts) - Math.min(...ts) >= 0.07 && Math.abs(area(w)) >= 0.015;
};

/**
 * B: { xA, xRF, xRR, xC, W0, deck(x), deckAt(x, lat), flatW(x), detail }
 * deck(x): body centre-line height; deckAt(x, lat): body top surface height at that lateral position;
 * flatW(x): half width of the body's top surface where it starts rolling over into the side (the shoulder).
 */
export function buildCabin(P, B) {
  const { xA, xRF, xRR, xC, W0, deck, deckAt, flatW } = B;
  // tessellation: M ring points (multiple of 8 keeps the A / C corners on vertices), K wall levels, JR roof-roll rings
  const d = clamp(B.detail ?? 1, 0, 1), dl = d ** 1.5;
  const M = 8 * Math.round(lerp(2, 32, dl)), K = Math.round(lerp(2, 14, dl)), JR = d < 0.3 ? 1 : d < 0.7 ? 2 : 3;
  const zRF = P.profile[3][1], zRR = P.profile[4][1];
  const roof = (x) => {
    const t = (x - xRF) / Math.max(xRR - xRF, 0.05), tc = clamp(t, 0, 1);
    return lerp(zRF, zRR, t) + P.roofArch * 4 * tc * (1 - tc);
  };
  const rr = clamp(P.cabinR, 0.006, 0.08);
  const c = P.cabin;
  const xMid = (xA + xC) / 2;
  const center = [xMid, deck(xMid) - 0.4, 0];
  const Hw = Math.max(0.08, roof(xMid) - rr - deck(xMid));

  // Width model: the base follows the body's shoulder line (minus the ledge) along the whole cabin, so the glass house
  // grows out of the body instead of sitting on a shelf; the roof width comes from the cabin plan; a concave cove
  // (`cabinBlend`) flares the foot of the wall into the shoulder.
  const baseW = (x) => {
    const t = clamp((x - xA) / Math.max(xC - xA, 1e-3), 0, 1);
    return Math.max(0.08, Math.min(flatW(x) - P.ledge, W0 * lerp(c[0], c[3], t)));
  };
  const roofW = (x) => {
    const t = clamp((x - xRF) / Math.max(xRR - xRF, 1e-3), 0, 1);
    return Math.min(W0 * lerp(c[1], c[2], t), baseW(x));
  };
  const fb = clamp(0.07 / Hw, 0.05, 0.5);
  // the plan turns its front / rear corners under the A / C pillars: a corner arc never exceeds what the pillar covers,
  // so glass stays on the gently curved faces instead of wrapping a tight corner
  const aW = Math.max(P.aPillar, MIN_A), cW = (t) => Math.max(lerp(P.cPillar, P.cPillar * P.cTaper, t), MIN_C);
  const rCapF = 0.35 * aW, rCapR = 0.35 * Math.min(cW(0), cW(1));
  // curvature amounts are authored for a full-size cabin and shrink with its span (sagitta ~ span^2), so a small or
  // narrow glass house gets flatter instead of sharper
  const sq = (v, ref) => Math.min(1, (v / ref) ** 2);
  const wMidRoof = roofW(xMid), slantF = Math.hypot(Hw, xRF - xA), slantR = Math.hypot(Hw, xC - xRR);
  const kW = sq(wMidRoof, 0.7), kBow = sq(Hw, 0.42), kBF = sq(slantF, 0.85), kBR = sq(slantR, 0.85);
  const sideBow = Math.min(P.sideBow * kBow, bowCap(Hw, R_SIDE));
  const bulgeF = Math.min(P.glassBulge * kBF, bowCap(slantF, R_SHIELD)), bulgeR = Math.min(P.glassBulge * 0.8 * kBR, bowCap(slantR, R_SHIELD));
  const roofCrown = Math.min(P.roofCrown * kW, bowCap(2 * wMidRoof, R_ROOF));

  const widthAt = (x, f, inset) => {
    const b = baseW(x), cove = Math.max(0, Math.min(P.cabinBlend, flatW(x) - 0.006 - b));
    const t = clamp(f / fb, 0, 1);
    return Math.max(0.04, lerp(b, roofW(x), f) + sideBow * Math.sin(Math.PI * f) + cove * (1 - t) * (1 - t) - inset);
  };
  const slice = (f, inset = 0) => {
    const sn = Math.sin(Math.PI * f), cr = f ** 0.8;
    const xf = lerp(xA, xRF, f) - bulgeF * sn + inset;
    const xb = lerp(xC, xRR, f) + bulgeR * sn - inset;
    const Lx = Math.max(0.05, (xb - xf) / 2), Bw = widthAt((xf + xb) / 2, f, inset), wrap = bowCap(2 * Bw, R_WRAP);
    return {
      f, inset, xf, xb, xc: (xf + xb) / 2, Lx, B: Bw,
      rF: Math.min(lerp(P.baseRound, P.roofRound, f) * Math.min(Lx, Bw), rCapF),
      rR: Math.min(lerp(P.baseRound, P.roofRound, f) * Math.min(Lx, Bw), rCapR),
      // the wrap is a bow on the glass edge: small next to the half length so a short roof never turns into an oval
      cF: Math.min(P.wsCrown * kW * cr, 0.12 * Lx, wrap), cB: Math.min(P.blCrown * kW * cr, 0.12 * Lx, wrap),
    };
  };
  // ring point: th = 0 lateral +, th = pi/2 front (smaller x), th = -pi/2 rear. The plan is a rounded rectangle with
  // circular corners (radius = roundness x the shorter half extent) scaled to the local width, so the sides follow the
  // body's plan, the faces stay straight and the shape stays rectangular at any size.
  const pt = (sl, th, yOf) => {
    const co = Math.cos(th), sn = Math.sin(th);
    const [len, lat0] = roundedRect(Math.atan2(Math.abs(sn), Math.abs(co)), sl.Lx, sl.B, sn >= 0 ? sl.rF : sl.rR);
    const shape = Math.sign(co) * (lat0 / sl.B), u = 1 - shape * shape;
    const x = sl.xc - Math.sign(sn) * len - (sn > 0 ? sl.cF * u : sn < 0 ? -sl.cB * u : 0);
    let lat = shape * widthAt(x, sl.f, sl.inset);
    if (Math.abs(lat) < 1e-7) lat = 0;
    return [x, yOf(x, Math.abs(lat)), lat];
  };
  // every wall point stands on the body's real top surface at its own lateral position (no floating base, no skirt step)
  const wallY = (f) => (x, lat) => { const b = deckAt(x, lat); return b + f * (roof(x) - rr - b); };
  const ring = (sl, yOf) => Array.from({ length: M }, (_, i) => pt(sl, (2 * Math.PI * i) / M, yOf));

  // ---------- skin ----------
  const wall = new Mesh(center), roofMesh = new Mesh(center);
  const add = (mesh, pts) => pts.map((p) => mesh.v(p));
  let prev = add(wall, ring(slice(0), (x, lat) => deckAt(x, lat) - 0.05));
  const wallRings = [];
  for (let k = 0; k <= K; k++) {
    const f = (k / K) ** 1.4; // levels cluster at the foot where the cove turns
    const r = ring(slice(f), wallY(f));
    wallRings.push(r);
    const ids = add(wall, r); wall.band(prev, ids); prev = ids;
  }
  const roofRings = [];
  prev = add(roofMesh, wallRings[K]);
  for (let j = 1; j <= JR; j++) {
    const phi = (j / JR) * (Math.PI / 2), inset = rr * (1 - Math.cos(phi)), lift = rr * Math.sin(phi);
    const r = ring(slice(1, inset), (x) => roof(x) - rr + lift);
    roofRings.push(r);
    const ids = add(roofMesh, r); roofMesh.band(prev, ids); prev = ids;
  }
  const top = slice(1, rr), topRing = ring(top, () => 0);
  for (let m = 1; m <= JR; m++) {
    const k = 1 - m / (JR + 1);
    const r = topRing.map(([x, , lat]) => { const xs = top.xc + (x - top.xc) * k; return [xs, roof(xs) + roofCrown * (1 - k * k), lat * k]; });
    roofRings.push(r);
    const ids = add(roofMesh, r); roofMesh.band(prev, ids); prev = ids;
  }
  roofMesh.fan(prev, roofMesh.v([top.xc, roof(top.xc) + roofCrown, 0]));

  // ---------- charts: s = arclength along the level ring, t = slant height ----------
  const rows = [];
  for (let k = 0; k <= FQ; k++) {
    const f = k / FQ, sl = slice(f), yOf = wallY(f), row = new Float64Array(NQ + 1);
    let q = pt(sl, Math.PI / 2, yOf);
    for (let i = 1; i <= NQ; i++) { const p = pt(sl, Math.PI / 2 - (Math.PI * i) / NQ, yOf); row[i] = row[i - 1] + Math.hypot(p[0] - q[0], p[2] - q[2]); q = p; }
    rows.push(row);
  }
  const level = (f) => { const g = clamp(f, 0, 1) * FQ, k = Math.min(FQ - 1, Math.floor(g)); return [rows[k], rows[k + 1], g - k]; };
  const uAt = (f, i) => { const [r0, r1, a] = level(f), i0 = Math.min(NQ - 1, Math.floor(i)), b = i - i0; return lerp(lerp(r0[i0], r1[i0], a), lerp(r0[i0 + 1], r1[i0 + 1], a), b); };
  const thetaAt = (f, u) => {
    const [r0, r1, a] = level(f), at = (i) => lerp(r0[i], r1[i], a), uu = clamp(u, 0, at(NQ));
    let lo = 0, hi = NQ;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at(m) <= uu) lo = m; else hi = m; }
    return Math.PI / 2 - (Math.PI * (lo + (uu - at(lo)) / (at(hi) - at(lo) || 1))) / NQ;
  };
  const tMax = {
    side: Math.hypot(Hw, widthAt(xMid, 0, 0) - widthAt(xMid, 1, 0)),
    front: Math.hypot(Hw, xRF - xA),
    rear: Math.hypot(Hw, xC - xRR),
  };
  const chart = (face, sign = 1) => {
    const T = tMax[face];
    const at = (s, t) => {
      const f = clamp(t / T, 0, 1), sl = slice(f), yOf = wallY(f);
      if (face === 'side') { const p = pt(sl, thetaAt(f, uAt(f, NQ / 2) - s), yOf); return [p[0], p[1], sign * p[2]]; }
      const a = Math.abs(s), p = pt(sl, thetaAt(f, face === 'front' ? a : uAt(f, NQ) - a), yOf);
      return [p[0], p[1], s < 0 ? -p[2] : p[2]];
    };
    const frame = (s, t, h) => {
      const e = 0.01, p = at(s, t);
      let n = unit(cross(sub(at(s + e, t), at(s - e, t)), sub(at(s, t + e), at(s, Math.max(0, t - e)))));
      if (dot(n, sub(p, center)) < 0) n = [-n[0], -n[1], -n[2]];
      return [[p[0] + n[0] * h, p[1] + n[1] * h, p[2] + n[2] * h], n];
    };
    return { at, frame, lift: (s, t, h) => frame(s, t, h)[0], T };
  };

  // ---------- window layout ----------
  const side = chart('side'), Ts = tMax.side;
  const sAtX = (x, t) => {
    const f = clamp(t / Ts, 0, 1), sl = slice(f), yOf = wallY(f);
    let lo = -Math.PI / 2, hi = Math.PI / 2;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (pt(sl, m, yOf)[0] > x) lo = m; else hi = m; }
    const th = (lo + hi) / 2;
    return uAt(f, NQ / 2) - uAt(f, ((Math.PI / 2 - th) * NQ) / Math.PI);
  };
  const t0 = Math.min(P.sillInset, 0.15 * Ts), t1 = Math.max(t0 + 0.06, Ts - Math.min(P.headerInset, 0.22 * Ts));
  // Every glass edge and pillar is a straight line in side view through its two end points (chart lines would bow
  // wherever the ring's corner, width or bulge change with height). Widths stay true surface widths at the ends.
  const straight = (sOf) => {
    const [xa, ya] = side.at(sOf(t0), t0), [xb, yb] = side.at(sOf(t1), t1), k = (xb - xa) / (yb - ya || 1e-6);
    return (t) => {
      // x is linear in the point's real height, and height depends on x (the deck slopes): solve x = xa + (y(x) - ya) k
      // by secant steps (a plain fixed-point pass diverges on a steep fastback, where k dy/dx exceeds 1); the candidate
      // with the smallest residual wins, so a wandering step can never make it worse than the first guess
      let best = null;
      const g = (x) => { const s = sAtX(x, t), r = x - xa - (side.at(s, t)[1] - ya) * k; if (!best || Math.abs(r) < best[0]) best = [Math.abs(r), s]; return r; };
      const lo = Math.min(xa, xb) - 0.3, hi = Math.max(xa, xb) + 0.3;
      let x0 = lerp(xa, xb, (t - t0) / (t1 - t0)), x1 = x0 + 0.01, g0 = g(x0), g1 = g(x1);
      for (let i = 0; i < 12 && best[0] > 1e-6 && g1 !== g0; i++) {
        const x2 = clamp(x1 - (g1 * (x1 - x0)) / (g1 - g0), lo, hi);
        x0 = x1; g0 = g1; x1 = x2; g1 = g(x1);
      }
      return best[1];
    };
  };
  const sA = (t) => uAt(t / Ts, NQ / 2) - uAt(t / Ts, NQ / 4);
  const sC = (t) => uAt(t / Ts, NQ / 2) - uAt(t / Ts, (3 * NQ) / 4);
  const front = straight((t) => sA(t) - aW / 2);
  const rear = straight((t) => sC(t) + cW(t / Ts));
  const KS = 8, ts = Array.from({ length: KS + 1 }, (_, i) => t0 + ((t1 - t0) * i) / KS);
  const slopeF = (front(t1) - front(t0)) / (t1 - t0), slopeR = (rear(t1) - rear(t0)) / (t1 - t0);
  // side pillar centre lines: chart end points s = a + b t at the sill and header, straight in side view between
  const pillarAxes = P.pillars.map(([f, lean]) => {
    const b = P.pillarFan * lerp(slopeF, slopeR, f) - lean;
    const s0 = lerp(front(t0), rear(t0), f);
    return [s0 - b * t0, b];
  });
  const pillarFns = pillarAxes.map(([a, b]) => straight((t) => a + b * t));
  const hw = Math.max(P.pillarW, MIN_PILLAR) / 2;
  const sideWins = [];
  if (front(t0) - rear(t0) > 0.2) {
    const cuts = [null, ...pillarFns, null];
    for (let i = 0; i < cuts.length - 1; i++) {
      // the opening between the pillar ahead and the pillar behind, sampled up the glass; levels where they meet are dropped
      const span = ts.map((t) => [Math.min(front(t), cuts[i] ? cuts[i](t) - hw : Infinity), Math.max(rear(t), cuts[i + 1] ? cuts[i + 1](t) + hw : -Infinity), t])
        .filter(([sf, sr]) => sf - sr > 0.02);
      if (span.length < 2) continue;
      const w = chamfer([...span.map(([sf, , t]) => [sf, t]), ...[...span].reverse().map(([, sr, t]) => [sr, t])], 0.03 * dl);
      if (windowOk(w)) sideWins.push(w);
    }
  }
  // windshield / backlight edges are the A / C pillars' far edges, seen from the face charts (f = shared level)
  const faceWin = (face) => {
    const T = tMax[face], f0 = 0.02, f1 = T - Math.min(P.headerInset * 0.8, 0.2 * T);
    const half = (tf) => {
      const f = tf / T, t = f * Ts;
      return face === 'front' ? uAt(f, NQ / 2) - front(t) - aW : uAt(f, NQ) - uAt(f, NQ / 2) + rear(t) - cW(f) - Math.max(0.03, cW(f) / 2);
    };
    const tt = Array.from({ length: 6 }, (_, i) => f0 + ((f1 - f0) * i) / 5);
    const poly = [...tt.map((t) => [half(t), t]), ...[...tt].reverse().map((t) => [-half(t), t])];
    const w = chamfer(poly, 0.05 * dl);
    return half(f0) > 0.1 && half(f1) > 0.06 && windowOk(w) ? w : null;
  };
  const shield = faceWin('front'), backlight = faceWin('rear');

  // ---------- glass on a gasket, both lifted off the skin ----------
  const glass = new Mesh(center), gasket = new Mesh(center);
  const rec = lerp(0.02, 0.008, d);
  const solid = (mesh, ch, poly, profile) => {
    const [cs, ct] = centroid(poly);
    const ringsIds = profile.map(({ h, k = 1, out = 0 }) => {
      const base = poly.map(([s, t]) => [cs + (s - cs) * k, ct + (t - ct) * k]);
      return (out ? grow(base, out) : base).map(([s, t]) => mesh.v(...ch.frame(s, t, h)));
    });
    // skirt, pane rings and centre fan form one sheet: wind it once, decided at the centre against the skin normal
    // (per-triangle tests against an interior point flip on long panes over curved walls)
    const last = ringsIds[ringsIds.length - 1], [cp, cn] = ch.frame(cs, ct, profile[profile.length - 1].h), c = mesh.v(cp);
    const A = mesh.at(last[0]), B = mesh.at(last[1 % last.length]);
    const flip = dot(cross(sub(B, A), sub(cp, A)), cn) < 0;
    for (let i = 0; i < ringsIds.length - 1; i++) mesh.bandWound(ringsIds[i], ringsIds[i + 1], flip);
    for (let i = 0; i < last.length; i++) { const j = (i + 1) % last.length; if (flip) mesh.idx.push(last[i], c, last[j]); else mesh.idx.push(last[i], last[j], c); }
  };
  // concentric rings keep glass facets short, so a pane never sags into the curved skin between its vertices
  const rings = (poly, spacing, h) => {
    const ss = poly.map((p) => p[0]), tt = poly.map((p) => p[1]);
    const n = clamp(Math.ceil(Math.max(Math.max(...ss) - Math.min(...ss), Math.max(...tt) - Math.min(...tt)) / 2 / spacing), 1, 24);
    return Array.from({ length: n - 1 }, (_, i) => ({ h, k: 1 - (i + 1) / n }));
  };
  // glass must be finer than the skin it covers, or the skin's facets poke through it
  const base0 = wallRings[0], perim = base0.reduce((sum, p, i) => { const q = base0[(i + 1) % M]; return sum + Math.hypot(q[0] - p[0], q[2] - p[2]); }, 0);
  const step = clamp((0.6 * perim) / M, 0.03, 0.3);
  const place = (ch, w) => {
    const poly = densify(w, step);
    // at the lowest detail a window is a single flat pane: no gasket frame, no buried skirt
    // the gasket is only a frame: inside the glass edge it drops straight back below the skin, so it can never show
    // through the pane where the two tessellations disagree on a curved wall
    if (d >= 0.2) solid(gasket, ch, poly, [{ h: -0.02, out: 0.014 }, { h: rec - 0.002, out: 0.014 }, { h: rec, out: 0.008 }, { h: rec - 0.004, out: -0.004 }, { h: -0.02, out: -0.008 }]);
    solid(glass, ch, poly, [...(d >= 0.2 ? [{ h: -0.02 }] : []), { h: rec + 0.001, k: 0.998 }, ...rings(poly, Math.max(0.035, step), rec + 0.001)]);
  };
  for (const sign of [1, -1]) { const ch = chart('side', sign); for (const w of sideWins) place(ch, w); }
  if (shield) place(chart('front'), shield);
  if (backlight) place(chart('rear'), backlight);

  // ---------- views for the editors ----------
  const toXY = (s, t) => { const p = side.at(s, t); return [p[0], p[1]]; };
  const lineOf = (fn) => ts.map((t) => toXY(fn(t), t));
  const pillarLines = pillarFns.map((fn) => lineOf(fn));

  // side silhouette: ring fronts up the windshield, the crowned roof centre line, ring backs down the backlight
  const fs = Array.from({ length: 33 }, (_, i) => i / 32);
  const ends = (th) => fs.map((f) => { const p = pt(slice(f), th, wallY(f)); return [p[0], p[1]]; });
  const roofLine = Array.from({ length: 41 }, (_, i) => {
    const x = lerp(top.xc - top.Lx, top.xc + top.Lx, i / 40), k = Math.min(1, Math.abs(x - top.xc) / top.Lx);
    return [x, roof(x) + roofCrown * (1 - k * k)];
  });
  const profile = [...ends(Math.PI / 2), ...roofLine, ...ends(-Math.PI / 2).reverse()];

  // x-section of the cabin wall + roof at body station x (right half: [lateral, height])
  const sectionAt = (x) => {
    const pts = [];
    const onRing = (sl, yOf) => {
      if (x < sl.xf - 0.2 || x > sl.xb + 0.2) return null;
      let lo = -Math.PI / 2, hi = Math.PI / 2;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (pt(sl, m, yOf)[0] > x) lo = m; else hi = m; }
      const p = pt(sl, (lo + hi) / 2, yOf);
      return Math.abs(p[0] - x) < 0.01 ? [p[2], p[1]] : null;
    };
    for (let k = 0; k <= K; k++) { const q = onRing(slice(k / K), wallY(k / K)); if (q) pts.push(q); }
    for (let j = 1; j <= 3; j++) { const phi = (j / 3) * (Math.PI / 2); const q = onRing(slice(1, rr * (1 - Math.cos(phi))), (xx) => roof(xx) - rr + rr * Math.sin(phi)); if (q) pts.push(q); }
    if (pts.length) pts.push([0, roof(x) + roofCrown]);
    return pts;
  };
  return {
    wall: wall.out(), roof: roofMesh.out(), glass: glass.out(), gasket: gasket.out(),
    windows: sideWins.length, hasShield: !!shield, hasBacklight: !!backlight,
    profile, planBase: wallRings[0].map(([x, , lat]) => [x, lat]), planRoof: roofRings[JR - 1].map(([x, , lat]) => [x, lat]),
    sectionAt,
    edit: {
      t0, t1, Ts, sAtX, front, rear, pillarAxes, toXY,
      aLine: lineOf(front), cLine: lineOf(rear), pillarLines, slopeF, slopeR, sA, sC,
    },
  };
}
