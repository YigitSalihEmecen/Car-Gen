// Fender flares: bolt-on arch extensions, built like the headlights: a clean rigid part first, then a painted blend
// that joins it to the body.
// Part: a styled cross-section swept radially around an idealised arch curve, standing on a smooth reference surface
// (one quadratic patch fitted to the skin around the arch, lifted until it clears the skin everywhere). Creases, beads
// and the arch roll never reach the part's shape, so it cannot crumple like cloth over them.
// Blend: from the part's base edge (outer edge and both ends) a strip is walked out over the skin and lifted toward the
// base by a displacement that decays to zero, so it starts exactly on the part and lands on the body tangent: no gaps.
// On the wheel side the lip covers the body's own arch edge and a flange returns into the body. Right side, mirrored.
import { bodyMesh, mesh, lathe, mirrored, smoothLoop } from './lights.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const lod = (d, lo, hi) => Math.max(lo, Math.round(lerp(lo, hi, clamp(d, 0, 1) ** 1.5)));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const smoother = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (6 * t - 15) + 10); };
const quarter = (t) => { t = clamp(t, 0, 1); return Math.sqrt(1 - (1 - t) ** 2); };

export const FENDER_TYPES = ['None', 'Pocket', 'Riveted', 'Box'];
// te: edge thickness (rounded step off the base), land: flat strip carrying the fasteners, tier: second step,
// rL: lip roll radius, end: taper length at the ends, blend: blend width multiplier
const STYLES = [null,
  // pocket: black textured plastic, stepped edge, bolt land, a rounded tier, sloped face, generous rounded lip
  { paint: false, te: 0.006, land: 0.03, tier: 0.008, rL: 0.009, end: 0.05, blend: 1, bolt: 'hex', pitch: 0.12, face: sstep },
  // riveted widebody: body colour, thin edge, rivet land, a full convex bulge, crisp folded lip
  { paint: true, te: 0.004, land: 0.016, tier: 0, rL: 0.0035, end: 0.06, blend: 1, bolt: 'rivet', pitch: 0.075, face: (v) => Math.sin((Math.PI * v) / 2) ** 1.6 },
  // box: body colour, squared side-view outline, rises tangent off its base into a flat shoulder, wide blend
  { paint: true, te: 0, land: 0, tier: 0, rL: 0.012, end: 0.14, blend: 2.5, box: true, face: (v) => smoother(v / 0.7) },
];
const CLR = 0.002, FACING = 0.42, STEP = 0.006, LIFT = 0.15;

// least squares z = c . [1, u, v, u2, uv, v2] (normal equations, Gaussian elimination)
function fitQuad(pts) {
  const A = Array.from({ length: 6 }, () => new Array(7).fill(0));
  for (const [u, v, z] of pts) {
    const f = [1, u, v, u * u, u * v, v * v];
    for (let r = 0; r < 6; r++) { for (let c = 0; c < 6; c++) A[r][c] += f[r] * f[c]; A[r][6] += f[r] * z; }
  }
  for (let r = 0; r < 6; r++) A[r][r] += 1e-6; // keeps a short, nearly straight footprint solvable
  for (let c = 0; c < 6; c++) {
    let p = c; for (let r = c + 1; r < 6; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < 6; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let q = c; q < 7; q++) A[r][q] -= k * A[c][q]; }
  }
  return A.map((row, r) => row[6] / row[r]);
}

// body: { position, N, RL, xF, xR, W0, R, Ra, wheels, archY(x - xw), floorAt(x), tyreFace }
export function buildFenders(P, body, detail = 1) {
  const St = STYLES[P.fdType];
  if (!St) return null;
  const { R, Ra, W0 } = body, nA = lod(detail, 10, 80);
  const S = { p: [], i: [], n: [] }, Bz = { p: [], i: [], n: [] }, hw = mesh(), edge = [], rim = [];
  let landed = 0, cols = 0;

  for (const xw of body.wheels) {
    const { cast, surf, walk } = bodyMesh(body, [xw - Ra - 0.5, xw + Ra + 0.5]);
    // side-view guide curve: rear flank up, over the arch, front flank down to the wrap height
    const yEnd = (xe) => { const f = body.floorAt(xe) + 0.05; return Math.min(R, Math.max(lerp(R, f, P.fdWrap), f)); };
    const g = [];
    for (let q = 0; q <= 16; q++) g.push([xw + Ra, lerp(yEnd(xw + Ra), R, q / 16)]);
    for (let q = 1; q < 96; q++) { const u = Math.cos((Math.PI * q) / 96); g.push([xw + Ra * u, body.archY(Ra * u)]); }
    for (let q = 0; q <= 16; q++) g.push([xw - Ra, lerp(R, yEnd(xw - Ra), q / 16)]);
    const gl = [0];
    for (let q = 1; q < g.length; q++) gl.push(gl[q - 1] + Math.hypot(g[q][0] - g[q - 1][0], g[q][1] - g[q - 1][1]));
    const C = [], D0 = [];
    for (let k = 0, q = 0; k < nA; k++) {
      const s = (gl[gl.length - 1] * k) / (nA - 1);
      while (q < g.length - 2 && gl[q + 1] < s) q++;
      const t = gl[q + 1] > gl[q] ? clamp((s - gl[q]) / (gl[q + 1] - gl[q]), 0, 1) : 0;
      C.push([lerp(g[q][0], g[q + 1][0], t), lerp(g[q][1], g[q + 1][1], t)]);
      const a = g[Math.max(q - 2, 0)], b = g[Math.min(q + 3, g.length - 1)];
      D0.push([b[1] - a[1], -(b[0] - a[0])]); // tangent turned outward, away from the wheel
    }
    // blurred normals: the hexagonal arch's corners would otherwise fan the part in steps
    const D = D0.map((_, k) => {
      let x = 0, y = 0;
      for (let j = -4; j <= 4; j++) { const d = D0[clamp(k + j, 0, nA - 1)], l = Math.hypot(...d) || 1, w = Math.exp(-(j * j) / 8); x += (w * d[0]) / l; y += (w * d[1]) / l; }
      const l = Math.hypot(x, y) || 1; return [x / l, y / l];
    });
    const side = (x, y) => cast([x, y, W0 + 2], [0, 0, -1]);

    // B: first point along each normal where the skin faces sideways (past the roll into the well); tH: first skin
    const good = (h, k) => h && h.n[2] > 0.3 && -(h.n[0] * D[k][0] + h.n[1] * D[k][1]) < FACING;
    const at2 = (k, t) => [C[k][0] + t * D[k][0], C[k][1] + t * D[k][1]];
    const tB = new Array(nA).fill(null), tH = new Array(nA).fill(null);
    for (let k = 0; k < nA; k++) {
      let t0 = k && tB[k - 1] !== null ? Math.max(-0.15, Math.min(tH[k - 1] ?? tB[k - 1], tB[k - 1]) - 0.03) : -0.15;
      if (t0 > -0.15 && side(...at2(k, t0))) t0 = -0.15;
      for (let t = t0; t < 0.3; t += STEP) {
        const h = side(...at2(k, t));
        if (h && tH[k] === null) tH[k] = t;
        if (!good(h, k)) continue;
        let lo = t - STEP, hi = t;
        for (let it = 0; it < 4; it++) { const m = (lo + hi) / 2; if (good(side(...at2(k, m)), k)) hi = m; else lo = m; }
        tB[k] = hi;
        break;
      }
    }
    // longest run of columns that found the body
    let k0 = 0, k1 = -1;
    for (let a = 0; a < nA;) {
      if (tB[a] === null) { a++; continue; }
      let b = a; while (b + 1 < nA && tB[b + 1] !== null) b++;
      if (b - a > k1 - k0) { k0 = a; k1 = b; }
      a = b + 1;
    }
    cols += nA;
    if (k1 - k0 < 6) continue;
    let ks = Array.from({ length: k1 - k0 + 1 }, (_, j) => k0 + j);
    // the part's inner edge is a clean, heavily smoothed offset of the arch that never moves inward of the roll
    const er = Math.max(2, Math.round(ks.length / 8));
    let tBs = smoothLoop(ks.map((k) => -tB[k]), er, true).map((v) => -v);
    const cover = Math.max(...ks.map((k, j) => tBs[j] - (tH[k] ?? tBs[j]))) + P.fdLip;

    // footprint width along each normal: constant, or out to a squared box around the wheel (box style)
    const boxIn = (x, y) => (y < R ? Math.abs(x - xw) < Ra + P.fdWidth : (Math.abs(x - xw) / (Ra + P.fdWidth)) ** 5 + ((y - R) / (Ra + 0.75 * P.fdWidth)) ** 5 < 1);
    let want = ks.map((k, j) => {
      if (!St.box) return P.fdWidth;
      const [bx, by] = at2(k, tBs[j]);
      let lo = 0, hi = 4 * P.fdWidth;
      for (let it = 0; it < 20; it++) { const m = (lo + hi) / 2; if (boxIn(bx + m * D[k][0], by + m * D[k][1])) lo = m; else hi = m; }
      return clamp(lo, 0.5 * P.fdWidth, 3 * P.fdWidth);
    });
    // sample the skin under each footprint (sideways rays); a footprint ends where the skin stops facing sideways
    const NS = 7, samples = [], fit = ks.map((k, j) => {
      let ok = 0;
      for (let i = 0; i < NS; i++) {
        const h = side(...at2(k, tBs[j] + (want[j] * i) / (NS - 1)));
        if (!h || h.n[2] < 0.25) break;
        samples.push(h.p); ok = i;
      }
      return ok / (NS - 1);
    });
    // the part ends where its footprint no longer fits (bumper corner, sill turning under) instead of pinching there;
    // between the ends a short body (a low hood over the arch) only narrows the footprint
    const top = ks.reduce((m, k, j) => (C[k][1] > C[ks[m]][1] ? j : m), 0);
    let a0 = 0, a1 = ks.length - 1;
    while (a0 < top && fit[a0] <= 0.7) a0++;
    while (a1 > top && fit[a1] <= 0.7) a1--;
    if (a1 - a0 < 6) continue;
    const pick = (arr) => arr.slice(a0, a1 + 1);
    ks = pick(ks); tBs = pick(tBs); want = pick(want);
    const reach = smoothLoop(pick(fit), er, true), n = ks.length, topJ = top - a0;
    landed += n;

    // reference surface: z = quad(x, y) fitted to the footprint, lifted so it clears every sample by CLR
    const sx = 1 / (Ra + P.fdWidth), uv = (x, y) => [(x - xw) * sx, (y - R) * sx];
    const c = fitQuad(samples.map((p) => [...uv(p[0], p[1]), p[2]]));
    const zq = (x, y) => { const [u, v] = uv(x, y); return c[0] + c[1] * u + c[2] * v + c[3] * u * u + c[4] * u * v + c[5] * v * v; };
    const off = Math.max(...samples.map((p) => p[2] - zq(p[0], p[1]))) + CLR;
    const base = (x, y) => [x, y, zq(x, y) + off];
    const nrm = (x, y) => { const [u, v] = uv(x, y); return unit([-(c[1] + 2 * c[3] * u + c[4] * v) * sx, -(c[2] + c[4] * u + 2 * c[5] * v) * sx, 1]); };

    const H = Math.max(P.fdOut + Math.max(0, body.tyreFace + 0.012 - base(...at2(ks[topJ], tBs[topJ]))[2]), St.te + St.tier + 0.01);
    const dl = gl[gl.length - 1] / (nA - 1), run = (n - 1) * dl;
    const sc = ks.map((_, j) => smoother((j * dl) / St.end) * smoother((run - j * dl) / St.end));
    const Ls = ks.map((_, j) => Math.max(reach[j] * want[j], 0.03));
    // a part point: side-view distance d in from the outer edge, b out along the reference normal
    const at = (j, d, b) => {
      const k = ks[j], t = tBs[j] + Ls[j] - d, x = C[k][0] + t * D[k][0], y = C[k][1] + t * D[k][1];
      return add(base(x, y), mul(nrm(x, y), b));
    };

    // section for column j: list of [d, b]
    const nF = lod(detail, 3, 16), nArc = lod(detail, 2, 7);
    const gapB = ks.map((k, j) => { const h = side(...at2(k, tBs[j])); return h ? Math.max(0, base(...at2(k, tBs[j]))[2] - h.p[2]) : 0; });
    const design = (j) => {
      const L = Ls[j], A = cover * sc[j], s = sc[j], Wt = L + A, kk = Math.min(1, Wt / (St.te + St.land + St.tier + 0.04));
      const te = St.te * kk, land = St.land * kk, tier = St.tier * kk * s, h = H * s, d0 = te + land;
      const rL = Math.min(St.rL, 0.7 * A + 1e-4, 0.5 * h + 1e-4), dF = Math.max(Wt - rL, d0 + 1e-3);
      return { L, Wt, te, land, tier, h, d0, rL, dF, s };
    };
    const prof = (q, d) => (q.te ? q.te * q.s * quarter(d / q.te) : 0) + q.tier * sstep((d - q.d0) / 0.01)
      + (q.h - q.te * q.s - q.tier) * St.face(clamp((d - q.d0) / (q.dF - q.d0), 0, 1));
    const section = (j) => {
      const q = design(j), rows = [];
      if (q.te) for (const f of [0, 0.15, 0.4, 0.7, 1]) rows.push([q.te * f, prof(q, q.te * f)]);
      else rows.push([0, 0]);
      if (q.land) for (const f of [0.5, 1]) rows.push([q.te + q.land * f, prof(q, q.te + q.land * f)]);
      for (let i = 1; i <= nF; i++) { const d = q.d0 + (q.dF - q.d0) * (i / nF) ** 1.25; rows.push([d, prof(q, d)]); }
      for (let i = 1; i <= nArc; i++) { const th = (Math.PI / 2) * (1 - i / nArc); rows.push([q.dF + q.rL * Math.cos(th), q.h - q.rL + q.rL * Math.sin(th)]); }
      // flange: down past the base, then back under the part into the body
      rows.push([q.Wt - 0.001, -0.004], [q.Wt - 0.008, -0.016], [q.L - 0.015, -(gapB[j] + 0.03)]);
      return rows;
    };
    const grid = ks.map((_, j) => section(j).map(([d, b]) => at(j, d, b)));
    pushGrid(S, grid, (j) => nrm(...at2(ks[j], tBs[j] + Ls[j])));

    // ---- blend: around the base edge (start end line, outer edge, end end line), walked out over the skin ----
    const T2 = (k) => [-D[k][1], D[k][0]];
    const per0 = [], nE = lod(detail, 3, 8), fan = lod(detail, 1, 4);
    for (let i = 0; i <= nE; i++) per0.push({ p: at(0, Ls[0] * (1 - i / nE), 0), o: mul(T2(ks[0]), -1) });
    for (let i = 1; i <= fan; i++) { const f = i / (fan + 1), k = ks[0], t = T2(k); per0.push({ p: at(0, 0, 0), o: [lerp(-t[0], D[k][0], f), lerp(-t[1], D[k][1], f)] }); }
    for (let j = 0; j < n; j++) per0.push({ p: at(j, 0, 0), o: D[ks[j]] });
    for (let i = 1; i <= fan; i++) { const f = i / (fan + 1), k = ks[n - 1], t = T2(k); per0.push({ p: at(n - 1, 0, 0), o: [lerp(D[k][0], t[0], f), lerp(D[k][1], t[1], f)] }); }
    for (let i = 0; i <= nE; i++) per0.push({ p: at(n - 1, Ls[n - 1] * (i / nE), 0), o: T2(ks[n - 1]) });
    const Lb = P.fdBlend * St.blend, stop = (Sm) => Sm.p[2] < 0.02 || Sm.n[1] < -0.6 || Sm.n[2] < -0.2;
    const seeds0 = per0.map(({ p }) => { const nn = nrm(p[0], p[1]); return { nn, h: cast(add(p, mul(nn, LIFT)), mul(nn, -1), 2 * LIFT) }; });
    // the blend runs over the longest stretch of the base edge with skin under it (an end line's inner corner can sit
    // over the arch opening)
    let r0 = 0, r1 = -1;
    for (let a = 0; a < seeds0.length;) {
      if (!seeds0[a].h) { a++; continue; }
      let b = a; while (b + 1 < seeds0.length && seeds0[b + 1].h) b++;
      if (b - a > r1 - r0) { r0 = a; r1 = b; }
      a = b + 1;
    }
    const outer0 = nE + 1 + fan;
    if (r0 > outer0 || r1 < outer0 + n - 1) continue;
    const perL = per0.slice(r0, r1 + 1), seeds = seeds0.slice(r0, r1 + 1);
    const paths = perL.map(({ o }, i) => walk(seeds[i].h.ci, seeds[i].h.cr, unit([o[0], o[1], 0]), Lb, stop));
    const breach = smoothLoop(paths.map((pa) => pa[pa.length - 1].s / Lb), Math.max(1, Math.round(perL.length / 24)), true);
    const nS = lod(detail, 3, clamp(Math.round(Lb / 0.006) + 6, 8, 30));
    const decay = (t) => lerp(1 - t * t * t * (t * (6 * t - 15) + 10), (1 - t) ** 3, 0.5);
    const skinAt = (i, t) => {
      const pa = paths[i], s = t * breach[i] * Lb;
      let q = 0; while (q < pa.length - 2 && pa[q + 1].s < s) q++;
      const a = pa[q], b = pa[Math.min(q + 1, pa.length - 1)], f = b.s > a.s ? clamp((s - a.s) / (b.s - a.s), 0, 1) : 0;
      return surf(lerp(a.ci, b.ci, f), lerp(a.cr, b.cr, f));
    };
    const bgrid = perL.map((_, i) => {
      const d0 = LIFT - seeds[i].h.t;
      return Array.from({ length: nS }, (_, r) => (r === 0 ? perL[i].p : add(skinAt(i, r / (nS - 1)).p, mul(seeds[i].nn, d0 * decay(r / (nS - 1))))));
    });
    // where the lift has decayed the blend is the skin: shade it with the skin's own normal
    pushGrid(Bz, bgrid, (i) => skinAt(i, 1).n, (i, r, nn) => { const w = decay(r / (nS - 1)), sn = skinAt(i, r / (nS - 1)).n; return r === nS - 1 ? sn : unit(add(mul(nn, w), mul(sn, 1 - w))); });
    for (let i = 0; i < perL.length; i++) rim.push({ p: bgrid[i][nS - 1], n: skinAt(i, 1).n });
    for (let j = 0; j < n; j++) edge.push({ part: grid[j][0], blend: bgrid[outer0 - r0 + j][0] });

    // fasteners: evenly pitched along the middle of the land, kept off the tapered ends
    if (St.bolt) {
      const dB = (j) => { const q = design(j); return q.te + q.land / 2; };
      const Q = ks.map((_, j) => at(j, dB(j), St.te * sc[j])), ql = [0];
      for (let j = 1; j < n; j++) ql.push(ql[j - 1] + Math.hypot(...sub(Q[j], Q[j - 1])));
      const len = ql[n - 1], cnt = Math.max(1, Math.round((len - 2 * St.end) / St.pitch)), segs = lod(detail, 6, 18);
      for (let b = 0; b <= cnt; b++) {
        const s = lerp(St.end, len - St.end, cnt ? b / cnt : 0.5);
        let j = 0; while (j < n - 2 && ql[j + 1] < s) j++;
        const f = clamp((s - ql[j]) / Math.max(ql[j + 1] - ql[j], 1e-9), 0, 1), cc = add(mul(Q[j], 1 - f), mul(Q[j + 1], f));
        const Nn = nrm(cc[0], cc[1]), T = unit(sub(Q[j + 1], Q[j])), U = unit(sub(T, mul(Nn, dot(T, Nn)))), V = cross(Nn, U), M = mesh();
        if (St.bolt === 'hex') {
          lathe(M, 0, 0, [[0.0095, -0.001], [0.0095, 0.0012], [0.0072, 0.0018]], segs);
          lathe(M, 0, 0, [[0.0062, 0.0014], [0.0062, 0.0048], [0.0054, 0.0058], [0, 0.006]], 6, Math.PI / 6);
        } else {
          lathe(M, 0, 0, Array.from({ length: 5 }, (_, i) => { const a = (Math.PI / 2) * (i / 4); return [0.0048 * Math.cos(a), -0.0006 + 0.0026 * Math.sin(a)]; }), segs);
        }
        const v0 = hw.p.length / 3;
        for (let i = 0; i < M.p.length; i += 3) hw.p.push(...add(cc, add(add(mul(U, M.p[i]), mul(V, M.p[i + 1])), mul(Nn, M.p[i + 2]))));
        for (const i of M.i) hw.i.push(i + v0);
      }
    }
  }
  const out = (m) => (m.p.length ? mirrored(m.p, m.i, m.n) : null);
  return { shell: out(S), blend: out(Bz), hardware: hw.p.length ? mirrored(hw.p, hw.i) : null, paint: St.paint, bright: St.bolt === 'rivet', landed, cols, edge, rim };
}

// append a (columns x rows) grid to mesh M with outward normals; `ref(j)` orients it, `shade(j, r, n)` may adjust a normal
function pushGrid(M, grid, ref, shade) {
  const n = grid.length, nR = grid[0].length, o = M.p.length / 3;
  const raw = (j, r) => cross(sub(grid[Math.min(j + 1, n - 1)][r], grid[Math.max(j - 1, 0)][r]), sub(grid[j][Math.min(r + 1, nR - 1)], grid[j][Math.max(r - 1, 0)]));
  const flip = grid.reduce((acc, _, j) => acc + dot(raw(j, Math.min(1, nR - 1)), ref(j)), 0) < 0 ? -1 : 1;
  for (let j = 0; j < n; j++) for (let r = 0; r < nR; r++) {
    M.p.push(...grid[j][r]);
    const nn = mul(unit(raw(j, r)), flip);
    M.n.push(...(shade ? shade(j, r, nn) : nn));
  }
  for (let j = 0; j < n - 1; j++) for (let r = 0; r < nR - 1; r++) {
    const a = o + j * nR + r, b = a + nR;
    if (flip > 0) M.i.push(a, b, a + 1, b, b + 1, a + 1);
    else M.i.push(a, a + 1, b, b, a + 1, b + 1);
  }
}
