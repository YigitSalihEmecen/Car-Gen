// Grilles: BMW-style twin kidneys, an Audi-style singleframe with honeycomb, a Mercedes-style wide grille with twin
// louvres and a round badge, and two classics: a chrome waterfall and a full-width egg-crate. A grille is one rigid unit
// in its own frame (u across, v up, w out of the nose): a chrome surround swept round its outline, the pattern set back
// inside it, a dark back plate, and a dark skirt from the surround's back projected onto the skin and sunk into it, so
// it seals on any nose. The frame faces the mean skin normal over the opening (upright, symmetric) and bends round a
// vertical axis to follow the nose's plan curve (one quadratic fitted to the skin), so a wide grille hugs a round nose
// instead of standing off it at the ends. It is sized to fit between the headlamp bezels and above the front plate.
import { bodyMesh, lampInner } from './lights.js';
import { roundPoly, pushTube } from './kit.js';
import { bags, finish, frame, facing, unit, sub, mul, lerp, clamp, lod } from './acc.js';

export const GRILLE_TYPES = ['None', 'Kidney', 'Singleframe', 'Twin louvre', 'Waterfall', 'Egg-crate'];
// outline per type over a unit half extent (u, v in [-1, 1]); kidneys are one of a pair centred at +u
const SHAPES = [null,
  { w: 0.075, h: 0.095, pair: 0.022, pts: [[-1, -1, 0.5], [1, -1, 0.5], [0.86, 1, 0.42], [-1, 1, 0.42]], frame: 0.011 },
  { w: 0.3, h: 0.15, pts: [[-0.84, 1, 0.06], [0.84, 1, 0.06], [1, 0.36, 0.08], [1, -0.5, 0.08], [0.76, -1, 0.06], [-0.76, -1, 0.06], [-1, -0.5, 0.08], [-1, 0.36, 0.08]], frame: 0.01 },
  { w: 0.32, h: 0.1, pts: [[-1, -1, 0.3], [1, -1, 0.3], [0.94, 1, 0.3], [-0.94, 1, 0.3]], frame: 0.012 },
  { w: 0.26, h: 0.13, pts: [[-1, -1, 0.35], [1, -1, 0.35], [1, 0.8, 0.5], [0, 1, 0], [-1, 0.8, 0.5]], frame: 0.013 },
  { w: 0.5, h: 0.1, pts: [[-1, -1, 0.12], [1, -1, 0.12], [1, 1, 0.12], [-1, 1, 0.12]], frame: 0.012 },
];

const area = (p) => p.reduce((s, q, i) => { const r = p[(i + 1) % p.length]; return s + q[0] * r[1] - r[0] * q[1]; }, 0) / 2;
// outward unit normal per vertex of a closed outline
const normals = (p) => { const s = area(p) > 0 ? 1 : -1, n = p.length; return p.map((_, i) => { const a = p[(i + n - 1) % n], b = p[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; return [(s * ty) / l, (-s * tx) / l]; }); };
const offset = (p, d) => { const n = normals(p); return p.map(([u, v], i) => [u + n[i][0] * d, v + n[i][1] * d]); };
// the polygon's extent along a vertical (u fixed) or horizontal (v fixed) line
function span(p, c, vertical) {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], [ka, kb, la, lb] = vertical ? [a[0], b[0], a[1], b[1]] : [a[1], b[1], a[0], b[0]];
    if ((ka - c) * (kb - c) > 0 || ka === kb) continue;
    const q = lerp(la, lb, (c - ka) / (kb - ka)); lo = Math.min(lo, q); hi = Math.max(hi, q);
  }
  return hi > lo ? [lo, hi] : null;
}
const inside = (p, u, v) => { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [xi, yi] = p[i], [xj, yj] = p[j]; if ((yi > v) !== (yj > v) && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) c = !c; } return c; };

// body: { position, N, RL, xF, xR, W0 }; plateTop: top of the front plate's holder (y) or null
export function buildGrille(P, body, plateTop, detail = 1) {
  const S = SHAPES[P.grType];
  if (!S) return null;
  const seg = lod(detail, 2, 5), { cast } = bodyMesh(body, 'front');
  // room: between the lamp bezels, between the plate (or chin) and the hood's leading edge
  const inner = lampInner(P, body.W0) ?? 0.75 * body.W0, zMax = clamp(inner - 0.03, 0.12, 0.9 * body.W0);
  const yLo = Math.max(P.chinZ + 0.05, plateTop != null ? plateTop + 0.025 : -Infinity), yHi = P.profile[1][1] - 0.05;
  if (yHi - yLo < 0.07) return null;
  const k = P.grSize, fw = S.frame;
  let hw = S.w * k, hh = Math.min(S.h * k, 0.5 * (yHi - yLo) - fw);
  const reach = S.pair != null ? S.pair * k + 2 * hw : hw;
  if (reach + fw > zMax) { const f = (zMax - fw) / (reach + fw); hw *= f; }
  if (hh < 0.03 || hw < 0.04) return null;
  const yc = lerp(yLo + hh + fw, yHi - hh - fw, P.grH);
  const cu = S.pair != null ? S.pair * k + hw : 0;
  const outline = (side) => roundPoly(S.pts.map(([u, v, r]) => [side * (cu + u * hw), v * hh, r * Math.min(hw, hh)]), seg).filter((q, i, a) => Math.hypot(q[0] - a[(i + 1) % a.length][0], q[1] - a[(i + 1) % a.length][1]) > 1e-6);
  const shapes = S.pair != null ? [outline(1), outline(-1)] : [outline(1)];
  const probe = (y, z) => cast([body.xF - 1, y, z + 1e-4], [1, 0, 0]);
  const c0 = probe(yc, 0);
  if (!c0) return null;
  // plane: mean skin normal over the opening, upright and symmetric
  let n = [0, 0, 0];
  for (const fu of [-1, -0.5, 0, 0.5, 1]) for (const fv of [-1, 0, 1]) { const h = probe(yc + fv * hh, fu * (cu + hw)); if (h) n = [n[0] + h.n[0], n[1] + h.n[1], n[2] + h.n[2]]; }
  n = unit([n[0], clamp(n[1], -0.6, 0.6), 0]);
  if (n[0] > -0.4) n = unit([-1, n[1], 0]);
  const fr0 = facing(c0.p, n);
  const depth = (u, v) => { const h = cast(fr0.at(u, v, 0.4), mul(n, -1), 1); return h ? 0.4 - h.t : null; };
  // bend: skin depth along the opening's centre line fitted as d0 + c u^2 (least squares, symmetric)
  const us = [0, 0.3, 0.6, 1].map((f) => f * (cu + hw)), ds = us.map((u) => [depth(u, 0), depth(-u, 0)]);
  const qd = []; us.forEach((u, i) => ds[i].forEach((d) => { if (d !== null) qd.push([u * u, d]); }));
  const mq = qd.reduce((a, [q]) => a + q, 0) / Math.max(qd.length, 1), md = qd.reduce((a, [, d]) => a + d, 0) / Math.max(qd.length, 1);
  const vq = qd.reduce((a, [q]) => a + (q - mq) ** 2, 0), cc = vq > 1e-12 ? Math.min(0, qd.reduce((a, [q, d]) => a + (q - mq) * (d - md), 0) / vq) : 0;
  const bend = (u) => cc * u * u;
  // stand-off: the surround's back clears the skin everywhere round every outline
  let wb = -Infinity;
  const pad = 0.018;
  for (const sh of shapes) {
    for (const [u, v] of offset(sh, fw)) { const d = depth(u, v); if (d !== null) wb = Math.max(wb, d - bend(u)); }
    // ...and the back plate clears the skin across the whole opening (a round nose bulges inside it)
    const us2 = sh.map((q) => q[0]), vs2 = sh.map((q) => q[1]);
    for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) {
      const u = lerp(Math.min(...us2), Math.max(...us2), i / 6), v = lerp(Math.min(...vs2), Math.max(...vs2), j / 4);
      if (!inside(sh, u, v)) continue;
      const d = depth(u, v); if (d !== null) wb = Math.max(wb, d - bend(u) + pad + 0.012 - 0.006);
    }
  }
  if (!Number.isFinite(wb)) return null;
  const fr = facing(fr0.at(0, 0, wb + 0.006), n), at = (u, v, w) => fr.at(u, v, w + bend(u));
  const B = bags();
  const ring = (pts) => pts.map(([u, v, w]) => at(u, v, w));
  for (const sh of shapes) {
    const nn = normals(sh), N = sh.length;
    // surround: a rounded chrome rim swept round the outline, its inner edge stepping back into the opening
    const sec = roundPoly([[-0.003, -0.024, 0], [-0.003, 0.004, 0.002], [fw * 0.25, 0.011, 0.003], [fw * 0.85, 0.01, 0.003], [fw, 0.002, 0.002], [fw, -0.006, 0]], 2);
    pushTube(B.chrome, sh.map(([u, v], i) => ring(sec.map(([o, w]) => [u + nn[i][0] * o, v + nn[i][1] * o, w]))), { wrap: true });
    // skirt: from the surround's back to the skin, sunk into it
    const back = offset(sh, fw * 0.8), skin = back.map(([u, v]) => { const h = cast(at(u, v, -0.006), mul(n, -1), 0.4); return h ? sub(h.p, mul(n, 0.005)) : at(u, v, -0.1); });
    pushTube(B.dark, [ring(back.map(([u, v]) => [u, v, -0.0065])), skin]);
    // back plate inside the opening
    // (columns across the opening, so the plate follows the bend: flat caps would cut chords behind the skin)
    const ins = offset(sh, -0.001), iu = ins.map((q) => q[0]), ua = Math.min(...iu), ub = Math.max(...iu), nc = lod(detail, 6, 40), cols = [];
    for (let i = 0; i <= nc; i++) { const u = lerp(ua + 1e-4, ub - 1e-4, i / nc), sp = span(ins, u, true); if (sp) cols.push([[u, sp[0], -pad - 0.006], [u, sp[1], -pad - 0.006], [u, sp[1], -pad], [u, sp[0], -pad]]); }
    if (cols.length > 1) pushTube(B.dark, cols.map(ring));
    pattern(P.grType, B, sh, at, hw, hh, cu, N, detail);
  }
  return finish(B);
}

// a slab between two (u, v) points, width t across, depth from w0 to w1 (a bar of a grille pattern)
function bar(M, at, a, b, t, w0, w1, r = 0.001) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], q = [-d[1], d[0]];
  const sec = roundPoly([[-t / 2, w0, 0], [t / 2, w0, 0], [t / 2, w1, r], [-t / 2, w1, r]], 1);
  // subdivided, so a long bar follows the bend instead of cutting a chord behind it
  const n = Math.max(1, Math.ceil(L / 0.025));
  pushTube(M, Array.from({ length: n + 1 }, (_, i) => [lerp(a[0], b[0], i / n), lerp(a[1], b[1], i / n)]).map((p) => sec.map(([x, w]) => at(p[0] + q[0] * x, p[1] + q[1] * x, w))));
}

function pattern(type, B, sh, at, hw, hh, cu, N, detail) {
  const inn = offset(sh, -0.002), us = inn.map((p) => p[0]), vs = inn.map((p) => p[1]);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  if (type === 1) {
    // kidney: vertical slats, chrome-faced
    const n = 7;
    for (let i = 1; i < n; i++) { const u = lerp(u0, u1, i / n), s = span(inn, u, true); if (s) bar(B.chrome, at, [u, s[0]], [u, s[1]], 0.0045, -0.018, -0.003); }
  } else if (type === 2) {
    // honeycomb: hex cells as thin black rims, only where they lie inside the opening
    const r = Math.max(0.012, 0.016 * (hw / 0.3) ** 0.3), dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let j = 0, v = v0; v <= v1; j++, v = v0 + j * dy) for (let u = u0 + (j % 2 ? dx / 2 : 0); u <= u1; u += dx) {
      if (!inside(inn, u, v)) continue;
      const hex = Array.from({ length: 6 }, (_, k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [u + r * 0.94 * Math.cos(a), v + r * 0.94 * Math.sin(a)]; });
      if (!hex.every(([a, b]) => inside(inn, a, b))) continue;
      const nh = normals(hex), sec = roundPoly([[-0.0016, -0.016, 0], [0.0016, -0.016, 0], [0.0016, -0.004, 0.0008], [-0.0016, -0.004, 0.0008]], 1);
      pushTube(B.black, hex.map(([a, b], k) => sec.map(([o, w]) => at(a + nh[k][0] * o, b + nh[k][1] * o, w))), { wrap: true });
    }
  } else if (type === 3) {
    // twin louvres: two chrome blades across, a round badge in the middle
    for (const f of [-0.3, 0.3]) {
      const v = lerp(v0, v1, 0.5 + f), s = span(inn, v, false);
      if (!s) continue;
      const sec = roundPoly([[-0.009, -0.016, 0], [0.008, -0.016, 0], [0.006, -0.002, 0.003], [-0.004, 0.001, 0.004]], 2);
      const nl = Math.max(2, Math.ceil((s[1] - s[0]) / 0.025));
      pushTube(B.chrome, Array.from({ length: nl + 1 }, (_, i) => lerp(s[0] + 0.002, s[1] - 0.002, i / nl)).map((u) => sec.map(([dv, w]) => at(u, v + dv, w))));
    }
    const R = Math.min(0.045, 0.42 * (v1 - v0)), segs = lod(detail, 16, 40);
    const torus = (rc, rt, w0) => Array.from({ length: segs }, (_, i) => { const a = (2 * Math.PI * i) / segs; return Array.from({ length: 10 }, (_, j) => { const b = (2 * Math.PI * j) / 10; return at((rc + rt * Math.cos(b)) * Math.cos(a), (rc + rt * Math.cos(b)) * Math.sin(a), w0 + rt * Math.sin(b)); }); });
    pushTube(B.chrome, torus(R, 0.004, 0.004), { wrap: true });
    const disc = Array.from({ length: segs }, (_, i) => { const a = (2 * Math.PI * i) / segs; return [R * 0.86 * Math.cos(a), R * 0.86 * Math.sin(a)]; });
    pushTube(B.chrome, [[-0.006, 1], [0.004, 1], [0.007, 0.6]].map(([w, s]) => disc.map(([u, v]) => at(u * s, v * s, w))));
  } else if (type === 4) {
    // waterfall: dense vertical chrome bars under a header bar
    const n = Math.max(8, Math.round((u1 - u0) / 0.018));
    for (let i = 1; i < n; i++) { const u = lerp(u0, u1, i / n), s = span(inn, u, true); if (s) bar(B.chrome, at, [u, s[0]], [u, s[1] - 0.012], 0.004, -0.016, 0.001, 0.0015); }
    const sh2 = span(inn, v1 - 0.016, false);
    if (sh2) bar(B.chrome, at, [sh2[0], v1 - 0.016], [sh2[1], v1 - 0.016], 0.012, -0.016, 0.004, 0.003);
  } else if (type === 5) {
    // egg-crate: a chrome grid, the horizontals proud of the verticals
    for (const f of [0.25, 0.5, 0.75]) { const v = lerp(v0, v1, f), s = span(inn, v, false); if (s) bar(B.chrome, at, [s[0], v], [s[1], v], 0.0045, -0.016, 0.002, 0.0015); }
    const n = Math.max(4, Math.round((u1 - u0) / 0.06));
    for (let i = 1; i < n; i++) { const u = lerp(u0, u1, i / n), s = span(inn, u, true); if (s) bar(B.chrome, at, [u, s[0]], [u, s[1]], 0.004, -0.016, -0.002, 0.0015); }
  }
}
