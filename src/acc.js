// Shared tools for the bolt-on accessories (plates, exhaust, spoilers, mirrors, antennas, grilles, hood parts). Same
// approach as the lamps, flares and roof gear: every part is rigid, modelled in its own frame (u across, v up, w out of
// its face), posed in the car frame, and seated on the skin by rays: pads and skirts sink a few millimetres into it.
// Parts are closed sweeps (pushTube rings with capped ends) and closed lathes; normals are left to the renderer, so a
// repeated ring point (a zero-radius roundPoly corner) is a crisp edge and everything else shades smooth.
import { mirrored, lathe } from './lights.js';
import { roundPoly, pushTube } from './kit.js';

export const ACC_MATS = ['paint', 'chrome', 'black', 'plastic', 'rubber', 'metal', 'carbon', 'dark', 'mirror', 'plate', 'plateY', 'ink', 'inkG', 'band', 'red', 'amber', 'burnt'];

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lod = (d, lo, hi) => Math.max(lo, Math.round(lerp(lo, hi, clamp(d, 0, 1) ** 1.5)));
export const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
export const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

export const bags = () => Object.fromEntries(ACC_MATS.map((k) => [k, { p: [], i: [], n: [] }]));
// meshes per material; `mirror` builds the right half and adds its reflection across the centre line
export function finish(B, mirror = false) {
  const o = {};
  for (const k in B) if (B[k].p.length) o[k] = mirror ? mirrored(B[k].p, B[k].i) : { position: new Float32Array(B[k].p), index: new Uint32Array(B[k].i) };
  return o;
}
// several finished sets into one (mirrored pairs plus single, one-sided parts)
export function merge(...sets) {
  const o = {};
  for (const s of sets) for (const k in s || {}) {
    const a = o[k], b = s[k];
    if (!a) { o[k] = b; continue; }
    const n = a.position.length / 3, P = new Float32Array(a.position.length + b.position.length), I = new Uint32Array(a.index.length + b.index.length);
    P.set(a.position); P.set(b.position, a.position.length); I.set(a.index); for (let i = 0; i < b.index.length; i++) I[a.index.length + i] = b.index[i] + n;
    o[k] = { position: P, index: I };
  }
  return o;
}

// a right-handed local frame; at(u, v, w) -> car frame
export const frame = (O, U, V, W) => ({ O, U, V, W, at: (u, v, w) => add(O, add(mul(U, u), add(mul(V, v), mul(W, w)))) });
// frame facing along F (w), with u across (perpendicular to F and up) and v up-ish
export function facing(O, F, up = Y) {
  const W = unit(F), U = unit(cross(up, W)), V = cross(W, U);
  return frame(O, U, V, W);
}

// 2D rounded rectangle (half extents a, b, corner radius r) as a closed [u, v] list
export const rrect = (a, b, r, seg) => roundPoly([[-a, -b, r], [a, -b, r], [a, b, r], [-a, b, r]], seg);
// a closed 2D outline scaled toward its centroid by k
const shrink = (poly, k) => {
  const c = poly.reduce((s, p) => [s[0] + p[0] / poly.length, s[1] + p[1] / poly.length], [0, 0]);
  return poly.map(([u, v]) => [c[0] + (u - c[0]) * k, c[1] + (v - c[1]) * k]);
};
// slab: a 2D outline (u, v) extruded along w from w0 to w1; bevel rounds both faces' edges inward by that much
export function extrude(M, fr, poly, w0, w1, bevel = 0) {
  const ext = Math.max(...poly.map(([u, v]) => Math.hypot(u, v))) || 1, k = 1 - Math.min(bevel / ext, 0.3);
  const ws = bevel > 0 ? [[w0, k], [w0 + bevel * 0.3, 1 - (1 - k) * 0.25], [w0 + bevel, 1], [w1 - bevel, 1], [w1 - bevel * 0.3, 1 - (1 - k) * 0.25], [w1, k]] : [[w0, 1], [w1, 1]];
  pushTube(M, ws.map(([w, kk]) => shrink(poly, kk).map(([u, v]) => fr.at(u, v, w))));
}
// loft of rings, each ring [[u, v, w]] in the frame
export const loft = (M, fr, rings, opts) => pushTube(M, rings.map((r) => r.map((p) => fr.at(...p))), opts);
// lathe in a frame: profile [[radius, w]] round the frame's w axis through (cu, cv); start and end on the axis to close it
export function spin(M, fr, cu, cv, prof, segs, phase = 0) {
  const L = { p: [], i: [] };
  lathe(L, cu, cv, prof, segs, phase);
  const o = M.p.length / 3;
  for (let i = 0; i < L.p.length; i += 3) M.p.push(...fr.at(L.p[i], L.p[i + 1], L.p[i + 2]));
  for (const i of L.i) M.i.push(i + o);
}
// sweep a 2D section [[a, b]] (a across the path's side, b along `up`) along a 3D path; capped, rounded ends
export function sweep(M, path, section, up = Y, roll = 0) {
  const n = path.length, L = [0];
  for (let i = 1; i < n; i++) L.push(L[i - 1] + Math.hypot(...sub(path[i], path[i - 1])));
  const rings = path.map((p, i) => {
    const T = unit(sub(path[Math.min(i + 1, n - 1)], path[Math.max(i - 1, 0)]));
    let A = cross(up, T); if (Math.hypot(...A) < 1e-6) A = cross(X, T);
    A = unit(A); const B = cross(T, A);
    const d = Math.min(L[i], L[n - 1] - L[i]), k = roll > 0 ? 1 - 0.35 * (1 - Math.sqrt(1 - (1 - Math.min(d / roll, 1)) ** 2)) : 1;
    return section(i / (n - 1)).map(([a, b]) => add(p, add(mul(A, a * k), mul(B, b * k))));
  });
  pushTube(M, rings);
}
// cubic Bezier sampled into n + 1 points
export const bezier = (p0, p1, p2, p3, n) => Array.from({ length: n + 1 }, (_, i) => {
  const t = i / n, s = 1 - t;
  return [0, 1, 2].map((a) => s * s * s * p0[a] + 3 * s * s * t * p1[a] + 3 * s * t * t * p2[a] + t * t * t * p3[a]);
});
// a rubber pad: a rounded-rect ring tilted to the skin normal n at p and sunk `sink` into it, closed slab of height h
export function pad(M, p, n, a, b, h, seg, along = X, sink = 0.004) {
  const W = unit(n), U = unit(sub(along, mul(W, dot(along, W)))), fr = frame(p, U, cross(W, U), W);
  extrude(M, fr, rrect(a, b, Math.min(a, b) * 0.6, seg), -sink, h, Math.min(0.002, h / 3));
}
