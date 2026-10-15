// Full-width light bar (the 'Light bar' head / tail light style): one continuous LED strip across the nose or tail.
// A rigid planar lamp that wide would float off or bury into the curved end, so the strip is swept along the body
// instead, like the kit: the guide is the end's plan outline at the lamp height (rays fanned from inside the car),
// smoothed, and the section stands on the smoothed skin normal. Section: a dark housing set into the skin with a clear
// lens over an emissive core; ends are rounded caps; built for the right half and mirrored across the centre line.
import { bodyMesh, mirrored } from './lights.js';
import { roundPoly, pushTube } from './kit.js';

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
const blur = (a, s) => a.map((_, i) => { let w = 0, v = 0; for (let k = -3 * s; k <= 3 * s; k++) { const e = Math.exp(-(k * k) / (2 * s * s)); v += e * a[clamp(i + k, 0, a.length - 1)]; w += e; } return v / w; });

// returns { housing, core, lens } (right half mirrored) or null; end: 'front' | 'rear'
export function buildLightBar(P, body, detail = 1, end = 'front') {
  const rear = end === 'rear', Q = (k) => P[(rear ? 'tl' : 'hl') + k], sx = rear ? 1 : -1;
  const [zLo, zHi] = rear ? (body.tailFace || [P.tailBotZ, P.profile[6][1]]) : [P.chinZ, P.profile[1][1]];
  const y = lerp(zLo, zHi, Q('H')), hb = 0.009 * Q('Size');
  const { cast } = bodyMesh(body, end);
  // fan of rays from inside the car at the bar height; the bar wraps round the corners until the skin has turned away
  // by the Spread-controlled angle
  // (0.1 mm off the centre line: a ray exactly on it can slip through the seam between the mirrored halves)
  const C = [rear ? body.xR - 0.9 : body.xF + 0.9, y, 1e-4], F = [sx, 0, 0], facing = Math.cos(lerp(0.35, 1.25, clamp((Q('Z') - 0.3) / 0.65, 0, 1)));
  const K = 120, hits = [];
  for (let k = 0; k < K; k++) {
    const th = (Math.PI / 2) * (k / (K - 1)), d = [sx * Math.cos(th), 0, Math.sin(th)], h = cast(add(C, mul(d, 3)), mul(d, -1));
    // measured in plan: a raked nose or tail still faces forward / back however steeply it slopes
    if (!h || dot(unit([h.n[0], 0, h.n[2]]), F) < facing) break;
    hits.push(h);
  }
  if (hits.length < 12) return null;
  // smooth the outline and its normals, then resample by arc length
  const s = Math.max(2, Math.round(hits.length / 30));
  const px = blur(hits.map((h) => h.p[0]), s), pz = blur(hits.map((h) => h.p[2]), s);
  const nx = blur(hits.map((h) => h.n[0]), 2 * s), ny = blur(hits.map((h) => h.n[1]), 2 * s), nz = blur(hits.map((h) => h.n[2]), 2 * s);
  pz[0] = 0; nz[0] = 0;
  const cl = [0];
  for (let i = 1; i < hits.length; i++) cl.push(cl[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]));
  const L = cl[cl.length - 1] - 0.01, roll = Math.min(0.012, 1.2 * hb), n = lod(detail, 12, 90);
  const us = new Set();
  for (let i = 0; i <= n; i++) us.add((L * i) / n);
  for (const f of [0.1, 0.3, 0.55, 0.8]) us.add(L - roll * f);
  const cols = [...us].sort((a, b) => a - b);
  const at = (sv) => {
    let i = 0; while (i < cl.length - 2 && cl[i + 1] < sv) i++;
    const t = clamp((sv - cl[i]) / Math.max(cl[i + 1] - cl[i], 1e-9), 0, 1);
    const G = [lerp(px[i], px[i + 1], t), y, lerp(pz[i], pz[i + 1], t)], N = unit([lerp(nx[i], nx[i + 1], t), lerp(ny[i], ny[i + 1], t), lerp(nz[i], nz[i + 1], t)]);
    const T = unit([px[i + 1] - px[i], 0, pz[i + 1] - pz[i]]), V = unit(cross(N, T));
    return { G, N, V: V[1] < 0 ? mul(V, -1) : V };
  };
  const seg = lod(detail, 1, 4);
  const sweep = (sec) => {
    const rings = cols.map((sv) => {
      const { G, N, V } = at(sv), poly = roundPoly(sec, seg), ext = Math.max(...poly.map(([, v]) => Math.abs(v)));
      const k = 1 - (1 - quarter((L - sv) / roll)) * Math.min(0.45, roll / Math.max(ext, 1e-4));
      // the first ring lies exactly on the centre plane so the mirrored halves weld into one closed strip
      return poly.map(([o, v]) => { const q = add(add(G, mul(N, o)), mul(V, v * k)); if (sv === 0) q[2] = 0; return q; });
    });
    const M = { p: [], i: [], n: [] };
    pushTube(M, rings, { capStart: false, sym: true });
    return mirrored(M.p, M.i, M.n);
  };
  const box = (o0, o1, v, r) => [[o0, -v, 0], [o1, -v, r], [o1, v, r], [o0, v, 0]];
  return {
    housing: sweep(box(-0.014, 0.0032, hb + 0.004, 0.003)),
    core: sweep(box(-0.002, 0.0046, hb * 0.38, 0.0012)),
    lens: sweep(box(0.0018, 0.0064, hb + 0.0015, 0.0028)),
  };
}
