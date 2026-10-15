// License plates, front and rear. A rigid flat plate (pressed: embossed rim, raised characters, national details) in a
// black holder, posed like the lamps: the plane follows the average skin normal over the plate's footprint (kept
// upright and symmetric), stands just proud of the most protruding skin point, and a holder skirt is projected from the
// plate's back onto the skin and sunk into it, so a plate on a curved bumper never floats. Plate frame: u to the viewer's
// right, v up, w out of the face (w = 0 at the plate's back).
import { bodyMesh } from './lights.js';
import { roundPoly, pushTube } from './kit.js';
import { bags, finish, merge, facing, rrect, extrude, loft, spin, add, sub, mul, unit, lerp, clamp, lod, Y } from './acc.js';

export const PLATE_TYPES = ['None', 'EU', 'UK', 'US', 'Japan', 'Square'];
// w, h: plate size; text: per-line [character height, centre v as a fraction of the half height]; band: EU strip
const KINDS = [null,
  { w: 0.52, h: 0.11, r: 0.008, band: 'D', lines: [[0.075, 0]] },
  { w: 0.52, h: 0.111, r: 0.006, band: 'UK', yellowRear: true, lines: [[0.079, 0]] },
  { w: 0.305, h: 0.152, r: 0.012, header: true, holes: 4, lines: [[0.07, -0.12]] },
  { w: 0.33, h: 0.165, r: 0.01, green: true, rivets: true, lines: [[0.03, 0.62], [0.074, -0.36]] },
  { w: 0.34, h: 0.2, r: 0.01, band: 'D', lines: [[0.068, 0.45], [0.068, -0.45]] },
];

// plate font on a 4 x 6 grid: strokes as polylines (a pressed DIN-like face: straight strokes, square ends)
const G = {
  0: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]], 1: [[[1, 5], [2, 6], [2, 0]], [[1, 0], [3, 0]]],
  2: [[[0, 6], [4, 6], [4, 3], [0, 3], [0, 0], [4, 0]]], 3: [[[0, 6], [4, 6], [4, 0], [0, 0]], [[1, 3], [4, 3]]],
  4: [[[0, 6], [0, 2], [4, 2]], [[3, 4], [3, 0]]], 5: [[[4, 6], [0, 6], [0, 3], [4, 3], [4, 0], [0, 0]]],
  6: [[[4, 6], [0, 6], [0, 0], [4, 0], [4, 3], [0, 3]]], 7: [[[0, 6], [4, 6], [1.5, 0]]],
  8: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[0, 3], [4, 3]]], 9: [[[4, 3], [0, 3], [0, 6], [4, 6], [4, 0], [0, 0]]],
  A: [[[0, 0], [0, 4], [2, 6], [4, 4], [4, 0]], [[0, 2.5], [4, 2.5]]], B: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 4], [3, 3], [0, 3]], [[3, 3], [4, 2], [4, 1], [3, 0], [0, 0]]],
  C: [[[4, 6], [0, 6], [0, 0], [4, 0]]], D: [[[0, 0], [0, 6], [3, 6], [4, 5], [4, 1], [3, 0], [0, 0]]],
  E: [[[4, 6], [0, 6], [0, 0], [4, 0]], [[0, 3], [3, 3]]], F: [[[4, 6], [0, 6], [0, 0]], [[0, 3], [3, 3]]],
  G: [[[4, 6], [0, 6], [0, 0], [4, 0], [4, 3], [2, 3]]], H: [[[0, 0], [0, 6]], [[4, 0], [4, 6]], [[0, 3], [4, 3]]],
  J: [[[4, 6], [4, 0], [0, 0], [0, 2]]], K: [[[0, 0], [0, 6]], [[4, 6], [0, 2.5]], [[1.3, 3.6], [4, 0]]],
  L: [[[0, 6], [0, 0], [4, 0]]], M: [[[0, 0], [0, 6], [2, 3], [4, 6], [4, 0]]], N: [[[0, 0], [0, 6], [4, 0], [4, 6]]],
  P: [[[0, 0], [0, 6], [4, 6], [4, 3], [0, 3]]], R: [[[0, 0], [0, 6], [4, 6], [4, 3], [0, 3]], [[1.5, 3], [4, 0]]],
  S: [[[4, 6], [0, 6], [0, 3], [4, 3], [4, 0], [0, 0]]], T: [[[0, 6], [4, 6]], [[2, 6], [2, 0]]],
  U: [[[0, 6], [0, 0], [4, 0], [4, 6]]], V: [[[0, 6], [2, 0], [4, 6]]], W: [[[0, 6], [0, 0], [2, 3], [4, 0], [4, 6]]],
  X: [[[0, 0], [4, 6]], [[0, 6], [4, 0]]], Y: [[[0, 6], [2, 3], [4, 6]], [[2, 3], [2, 0]]], Z: [[[0, 6], [4, 6], [0, 0], [4, 0]]],
  O: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]]], I: [[[2, 0], [2, 6]], [[1, 0], [3, 0]], [[1, 6], [3, 6]]],
  Q: [[[0, 0], [4, 0], [4, 6], [0, 6], [0, 0]], [[2.6, 1.4], [4.2, -0.4]]], '-': [[[0.8, 3], [3.2, 3]]],
};
const ADV = 5.4, SPACE = 3;
const LET = 'ABCDEFGHJKLMNPRSTUVWXYZ';

// deterministic registration text per plate kind
function texts(kind, n) {
  let s = (n * 2654435761) >>> 0;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const L = () => LET[Math.floor(r() * LET.length)], D = () => String(Math.floor(r() * 10));
  if (kind === 1) return [`${L()}${L()} ${L()}${L()} ${D()}${D()}${D()}`];
  if (kind === 2) return [`${L()}${L()}${D()}${D()} ${L()}${L()}${L()}`];
  if (kind === 3) return [`${D()}${L()}${L()}${L()}${D()}${D()}${D()}`];
  if (kind === 4) return [`${D()}${D()}${D()}`, `${D()}${D()}-${D()}${D()}`];
  return [`${L()}${L()} ${D()}${D()}`, `${L()}${D()}${D()}${D()}`];
}
const lineWidth = (t) => [...t].reduce((w, c) => w + (c === ' ' ? SPACE : ADV), -1.4);

// raised strokes of one text line, centred at (cu, cv), cap height hc, on the face at w0, raised by ht; the glyphs are
// condensed (plate faces run about 0.6 wide to tall) and squeezed further if the line would not fit in maxW
function letter(M, fr, text, cu, cv, hc, w0, ht, maxW = Infinity) {
  const k = hc / 6, kx = Math.min(0.62 * k, maxW / lineWidth(text)), sw = 0.8 * Math.min(k, kx / 0.62);
  let u = cu - (lineWidth(text) * kx) / 2;
  for (const ch of text) {
    if (ch === ' ') { u += SPACE * kx; continue; }
    for (const line of G[ch] || []) for (let i = 0; i < line.length - 1; i++) {
      const a = [u + line[i][0] * kx, cv + (line[i][1] - 3) * k], b = [u + line[i + 1][0] * kx, cv + (line[i + 1][1] - 3) * k];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, d = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], q = [-d[1], d[0]];
      const sec = roundPoly([[-sw / 2, 0, 0], [sw / 2, 0, 0], [sw / 2, ht, ht * 0.4], [-sw / 2, ht, ht * 0.4]], 1);
      const ring = (p) => sec.map(([x, y]) => fr.at(p[0] + q[0] * x, p[1] + q[1] * x, w0 + y));
      pushTube(M, [ring([a[0] - (d[0] * sw) / 2, a[1] - (d[1] * sw) / 2]), ring([b[0] + (d[0] * sw) / 2, b[1] + (d[1] * sw) / 2])]);
    }
    u += ADV * kx;
  }
}

// plate body: a pressed sheet with a raised rim, face at w = FACE
const FACE = 0.0011;
function sheet(M, fr, a, b, r, seg) {
  const out = rrect(a, b, r, seg);
  extrude(M, fr, out, 0, FACE, 0.0003);
  // the pressed rim: a bead swept round the edge, 3 mm in
  const n = out.length, bead = roundPoly([[-0.0056, FACE - 0.0002, 0], [-0.0045, FACE + 0.0008, 0.0006], [-0.0014, FACE + 0.0008, 0.0006], [-0.0003, FACE - 0.0002, 0]], 2);
  loft(M, fr, out.map(([u, v], i) => {
    const [pu, pv] = out[(i + n - 1) % n], [qu, qv] = out[(i + 1) % n], l = Math.hypot(qu - pu, qv - pv) || 1, nu = (qv - pv) / l, nv = -(qu - pu) / l;
    return bead.map(([o, w]) => [u + nu * o, v + nv * o, w]);
  }), { wrap: true });
}

// one plate, end 'front' | 'rear'. body: { position, N, RL, xF, xR, W0, tail }
function plate(P, body, end, detail, slot) {
  const K = KINDS[P.plateType], rear = end === 'rear', sx = rear ? 1 : -1, a = K.w / 2, b = K.h / 2;
  const { cast } = bodyMesh(body, end);
  const [lo, hi] = rear ? [body.tail.zTk + b + 0.03, body.tail.zLip - P.tailR - b - 0.04] : [P.chinZ + b + 0.03, P.profile[1][1] - b - 0.08];
  const yc = hi > lo ? lerp(lo, hi, rear ? P.plateH : 0.25) : (lo + hi) / 2;
  const probe = (y, z) => cast([rear ? body.xR + 1 : body.xF - 1, y, z + 1e-4], [-sx, 0, 0]);
  const c0 = probe(yc, 0);
  if (!c0) return null;
  // plane: the mean skin normal over the footprint, upright and symmetric
  let n = [0, 0, 0], cnt = 0;
  for (const fu of [-0.9, -0.45, 0, 0.45, 0.9]) for (const fv of [-0.8, 0, 0.8]) { const h = probe(yc + fv * b, fu * a); if (h) { n = add(n, h.n); cnt++; } }
  if (cnt < 10) return null;
  n = unit([n[0], clamp(n[1], -0.5, 0.5), 0]);
  if (n[0] * sx < 0.5) n = unit([sx, n[1], 0]);
  const fr0 = facing(c0.p, n), m = 0.009, seg = lod(detail, 1, 4);
  // stand off the most protruding skin point under the holder; the skirt reaches back to the skin
  const outline = rrect(a + m, b + m, K.r + m, seg + 1);
  const depth = (u, v) => { const h = cast(fr0.at(u, v, 0.4), mul(n, -1), 1); return h ? 0.4 - h.t : null; };
  const ds = outline.map(([u, v]) => depth(u, v)), inner = [[0, 0], [a * 0.6, 0], [-a * 0.6, 0]].map(([u, v]) => depth(u, v));
  if (ds.filter((d) => d !== null).length < 0.8 * ds.length) return null;
  const wb = Math.max(...ds.filter((d) => d !== null), ...inner.filter((d) => d !== null)) + 0.004;
  const fr = facing(fr0.at(0, 0, wb), n), B = bags(), face = rear && K.yellowRear ? 'plateY' : 'plate';
  // holder: a black frame round the plate edge (lips over it by 2 mm), a skirt from its back to the skin
  const N2 = outline.length;
  const ring2 = outline.map(([u, v], i) => { const [pu, pv] = outline[(i + N2 - 1) % N2], [qu, qv] = outline[(i + 1) % N2], tx = qu - pu, ty = qv - pv, l = Math.hypot(tx, ty) || 1; return [u, v, ty / l, -tx / l]; });
  const sec = roundPoly([[-m - 0.002, -0.004, 0], [0.001, -0.004, 0], [0.002, 0.003, 0.002], [0, 0.0048, 0.0015], [-m - 0.0025, 0.0042, 0.0015], [-m - 0.003, FACE + 0.0002, 0]], 2);
  loft(B.black, fr, ring2.map(([u, v, nu, nv]) => sec.map(([o, w]) => [u + nu * o, v + nv * o, w])), { wrap: true });
  const back = ring2.map(([u, v, nu, nv]) => [u + nu * 0.001, v + nv * 0.001]);
  const skin = back.map(([u, v], i) => { const h = cast(fr.at(u, v, -0.003), mul(n, -1), 0.3); return h ? sub(sub(h.p, fr.O), mul(n, 0.004)) : null; });
  if (skin.every(Boolean)) {
    const toLocal = (p) => [p[0] * fr.U[0] + p[1] * fr.U[1] + p[2] * fr.U[2], p[0] * fr.V[0] + p[1] * fr.V[1] + p[2] * fr.V[2], p[0] * fr.W[0] + p[1] * fr.W[1] + p[2] * fr.W[2]];
    loft(B.black, fr, [back.map(([u, v]) => [u, v, -0.0035]), skin.map(toLocal)]);
  }
  // the plate: pressed sheet, characters, national details
  sheet(B[face], fr, a, b, K.r, seg);
  const ink = K.green ? 'inkG' : 'ink', lines = texts(P.plateType, (P.plateNo | 0) + slot);
  const band = K.band ? 0.046 : 0, cu = band / 2;
  if (K.band) {
    extrude(B.band, fr, rrect(band / 2 - 0.002, b - 0.0062, 0.003, 1).map(([u, v]) => [u - a + 0.0062 + band / 2, v]), FACE - 0.0002, FACE + 0.0004, 0.0002);
    for (let s = 0; s < 12; s++) { const t = (s / 12) * Math.PI * 2, uu = -a + 0.0062 + band / 2 + 0.012 * Math.cos(t), vv = b * 0.35 + 0.012 * Math.sin(t); spin(B.amber, fr, uu, vv, [[0, FACE + 0.0008], [0.0017, FACE + 0.0006], [0.0017, FACE + 0.0002], [0, FACE + 0.0002]], 6); }
    letter(B.plate, fr, K.band, -a + 0.0062 + band / 2, -b * 0.45, Math.min(0.022, b * 0.42), FACE + 0.0003, 0.0007);
  }
  K.lines.forEach(([hc, fv], i) => letter(B[ink], fr, lines[i] || lines[0], cu, fv * (b - 0.01) + (K.header ? -0.008 : 0), hc, FACE - 0.0002, 0.0012, 2 * a - band - 0.03));
  if (K.header) {
    letter(B.red, fr, 'GOLDEN STATE', 0, b - 0.024, 0.017, FACE - 0.0002, 0.0008, 2 * a - 0.11);
    extrude(B.red, fr, rrect(0.018, 0.01, 0.002, 1).map(([u, v]) => [u - a + 0.04, v + b - 0.026]), FACE, FACE + 0.0005, 0.0002);
    extrude(B.amber, fr, rrect(0.018, 0.01, 0.002, 1).map(([u, v]) => [u + a - 0.04, v + b - 0.026]), FACE, FACE + 0.0005, 0.0002);
  }
  // fixings: chrome screws (two on the top strip, four on a US plate), or the Japanese plate's capped rivets
  const pins = K.holes === 4 ? [[-1, 1], [1, 1], [-1, -1], [1, -1]].map(([su, sv]) => [su * (a - 0.035), sv * (b - 0.017)]) : [[-1, 1], [1, 1]].map(([su]) => [su * a * 0.62, b - 0.011]);
  for (const [u, v] of pins) spin(K.rivets ? B[face] : B.chrome, fr, u, v, [[0, FACE + 0.0032], [0.0035, FACE + 0.0026], [0.0052, FACE + 0.001], [0.0055, FACE], [0, FACE]], 12);
  return { meshes: finish(B), rect: { y0: yc - b - m, y1: yc + b + m, half: a + m } };
}

/** Front and rear plates, or null. body: { position, N, RL, xF, xR, W0, tail } */
export function buildPlates(P, body, detail = 1) {
  if (!P.plateType || !KINDS[P.plateType]) return null;
  const r = plate(P, body, 'rear', detail, 0), f = plate(P, body, 'front', detail, 7);
  if (!r && !f) return null;
  return { ...merge(r?.meshes, f?.meshes), front: f?.rect || null, rear: r?.rect || null };
}
