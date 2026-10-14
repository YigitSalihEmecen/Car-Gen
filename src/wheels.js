// Wheels: tyre, barrel, brake and one of five rim faces. Every part is a closed solid: a lathe of a closed profile loop
// (corners marked sharp get split normals, everything else is smooth) or a bevelled extrusion.
// Wheel frame: z = axle, outward face at +z.

export const RIM_TYPES = ['Spoke', 'Mesh', 'Pancake', 'Turbofan', 'Deep dish'];

const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// solid of revolution of a closed (r, z) loop; points [r, z, sharp]
function lathe(THREE, prof, segs, phase = 0) {
  let area = 0;
  for (let i = 0; i < prof.length; i++) { const a = prof[i], b = prof[(i + 1) % prof.length]; area += a[0] * b[1] - b[0] * a[1]; }
  const sgn = area >= 0 ? 1 : -1, n = prof.length;
  const segN = (i) => { const a = prof[i], b = prof[(i + 1) % n], dr = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dr, dz) || 1; return [(sgn * dz) / l, (-sgn * dr) / l]; };
  const rows = []; // [r, z, nr, nz]
  for (let i = 0; i < n; i++) {
    const [r, z, sharp] = prof[i], nIn = segN((i + n - 1) % n), nOut = segN(i);
    if (sharp) { rows.push([r, z, ...nIn], [r, z, ...nOut]); continue; }
    const m = [nIn[0] + nOut[0], nIn[1] + nOut[1]], l = Math.hypot(...m) || 1;
    rows.push([r, z, m[0] / l, m[1] / l]);
  }
  rows.push(rows[0]); // close the loop (a sharp first point's first row already carries the incoming normal)
  const pos = [], nrm = [], idx = [], R = rows.length;
  for (let j = 0; j <= segs; j++) {
    const th = phase + (TAU * j) / segs, c = Math.cos(th), s = Math.sin(th);
    for (const [r, z, nr, nz] of rows) { pos.push(r * c, r * s, z); nrm.push(nr * c, nr * s, nz); }
  }
  for (let j = 0; j < segs; j++) for (let i = 0; i < R - 1; i++) {
    const a = j * R + i, b = a + 1, c = a + R, d = c + 1;
    // wind each triangle to agree with its vertex normal
    for (const [p, q, w] of [[a, c, b], [b, c, d]]) {
      const P0 = pos.slice(3 * p, 3 * p + 3), P1 = pos.slice(3 * q, 3 * q + 3), P2 = pos.slice(3 * w, 3 * w + 3);
      const u = [P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]], v = [P2[0] - P0[0], P2[1] - P0[1], P2[2] - P0[2]];
      const fn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const nn = [nrm[3 * p] + nrm[3 * q] + nrm[3 * w], nrm[3 * p + 1] + nrm[3 * q + 1] + nrm[3 * w + 1], nrm[3 * p + 2] + nrm[3 * q + 2] + nrm[3 * w + 2]];
      if (fn[0] * nn[0] + fn[1] * nn[1] + fn[2] * nn[2] >= 0) idx.push(p, q, w); else idx.push(p, w, q);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
const extrude = (THREE, pts, depth, bevel, curve = 6) => {
  const shape = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2, curveSegments: curve });
};
// a small hex nut / bolt head standing on z = 0, axis +z
const nut = (s) => [[0, -0.003], [s, -0.003, 1], [s, s * 1.1, 1], [s * 0.82, s * 1.45], [0, s * 1.5]];
// merge closed geometries sharing one material into one, keeping their normals
const merge = (THREE, list) => {
  const gs = list.map((g) => (g.index ? g : g.toNonIndexed()));
  const nv = gs.reduce((s, g) => s + g.attributes.position.count, 0), ni = gs.reduce((s, g) => s + (g.index ? g.index.count : g.attributes.position.count), 0);
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of gs) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, ov * 3); nrm.set(g.attributes.normal.array, ov * 3);
    if (g.index) for (let k = 0; k < g.index.count; k++) idx[oi++] = g.index.array[k] + ov; else for (let k = 0; k < c; k++) idx[oi++] = k + ov;
    ov += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
};
const placed = (g, x, y, z, rz = 0) => { g.rotateZ(rz); g.translate(x, y, z); return g; };

export function makeWheel(THREE, P, detail, M) {
  const R = P.wheelR, h = P.tireW / 2, rr = R * P.rimRatio;
  const dl = detail ** 1.5, seg = (lo, hi) => Math.max(lo, Math.round(lerp(lo, hi, dl)));
  const S = seg(12, 72), n = Math.max(3, Math.round(P.spokes)), z0 = h * 0.45;
  const parts = { rubber: [], rim: [], dark: [], chrome: [], caliper: [] };

  // tyre: tread, shoulders and sidewalls, closed through the beads seated on the rim
  parts.rubber.push(lathe(THREE, [[rr, -h * 0.9, 1], [lerp(rr, R, 0.5), -h], [R - 0.03, -h * 0.97], [R - 0.006, -h * 0.82], [R, -h * 0.5], [R, h * 0.5],
    [R - 0.006, h * 0.82], [R - 0.03, h * 0.97], [lerp(rr, R, 0.5), h], [rr, h * 0.9, 1], [rr * 0.985, h * 0.82, 1], [rr * 0.985, -h * 0.82, 1]], S));
  // barrel: a thin closed shell inside the tyre
  parts.dark.push(lathe(THREE, [[rr * 0.985, -h * 0.85, 1], [rr * 0.985, z0 - 0.01, 1], [rr * 0.955, z0 - 0.01, 1], [rr * 0.955, -h * 0.85, 1]], S));
  // brake: disc on its hat, an arc caliper hugging the disc edge; behind the spokes (deep-dish spokes sit far back)
  const type = Math.round(P.rimType ?? 0), dd = Math.min(0.05, h * 0.5), zB = type === 4 ? z0 - dd - 0.06 : -0.008;
  parts.dark.push(lathe(THREE, [[rr * 0.3, zB - 0.011, 1], [rr * 0.74, zB - 0.011, 1], [rr * 0.74, zB + 0.011, 1], [rr * 0.42, zB + 0.011, 1], [rr * 0.4, zB + 0.026, 1], [rr * 0.3, zB + 0.026, 1]], S));
  const arc = (r0, r1, a0, a1, k = 8) => [...Array.from({ length: k + 1 }, (_, i) => { const a = lerp(a0, a1, i / k); return [r1 * Math.cos(a), r1 * Math.sin(a)]; }),
    ...Array.from({ length: k + 1 }, (_, i) => { const a = lerp(a1, a0, i / k); return [r0 * Math.cos(a), r0 * Math.sin(a)]; })];
  const cal = extrude(THREE, arc(rr * 0.6, rr * 0.8, 2.2, 2.85), 0.026, 0.005, 2);
  cal.translate(0, 0, zB - 0.006); parts.caliper.push(cal);

  const lugs = (zb, r = rr * 0.2) => { for (let i = 0; i < 5; i++) { const a = (TAU * i) / 5; parts.chrome.push(placed(lathe(THREE, nut(0.0095), 6), r * Math.cos(a), r * Math.sin(a), zb)); } };
  if (type === 0) {
    // spoke: one bevelled plate with sector windows between n spokes, a lip ring and a centre cap
    const r1 = rr * 0.36, r2 = rr * 0.86, sw = Math.min(0.012 + 0.06 / n, rr * 0.18);
    const shape = new THREE.Shape(); shape.absarc(0, 0, rr * 0.95, 0, TAU, false);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, ao = sw / r2, ai = sw / r1;
      if (a1 - a0 - 2 * ai < 0.05) continue;
      const hole = new THREE.Path(); hole.absarc(0, 0, r2, a0 + ao, a1 - ao, false); hole.absarc(0, 0, r1, a1 - ai, a0 + ai, true);
      shape.holes.push(hole);
    }
    const face = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.007, bevelSegments: detail > 0.7 ? 3 : 1, curveSegments: seg(4, 48) });
    face.translate(0, 0, z0 - 0.03); parts.rim.push(face);
    parts.rim.push(lathe(THREE, [[rr * 0.93, z0 - 0.02, 1], [rr * 1.0, z0, 1], [rr * 1.02, z0 - 0.008], [rr * 0.99, z0 - 0.03, 1]], S));
    parts.chrome.push(lathe(THREE, [[0, z0 + 0.006], [rr * 0.11, z0 + 0.004], [rr * 0.13, z0 - 0.01, 1], [0, z0 - 0.01]], seg(8, 32)));
    lugs(z0 - 0.006, rr * 0.22);
  } else if (type === 1) {
    // mesh (BBS style): crossed thin spokes, a polished stepped outer lip with rivets, raised centre hub
    const pairs = Math.max(8, n * 2), r1 = rr * 0.3, r2 = rr * 0.9, d = Math.PI / pairs * 0.9;
    for (let i = 0; i < pairs; i++) for (const sgn of [1, -1]) {
      const a = (TAU * i) / pairs, b = a + sgn * d, w1 = 0.006, w2 = 0.0045;
      const p0 = [r1 * Math.cos(a), r1 * Math.sin(a)], p1 = [r2 * Math.cos(b), r2 * Math.sin(b)];
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l;
      const sp = extrude(THREE, [[p0[0] + nx * w1, p0[1] + ny * w1], [p1[0] + nx * w2, p1[1] + ny * w2], [p1[0] - nx * w2, p1[1] - ny * w2], [p0[0] - nx * w1, p0[1] - ny * w1]], 0.012, 0.0025, 1);
      sp.translate(0, 0, z0 - 0.024 - (sgn > 0 ? 0 : 0.004)); parts.rim.push(sp);
    }
    parts.rim.push(lathe(THREE, [[rr * 0.86, z0 - 0.03, 1], [rr * 0.86, z0 - 0.012], [rr * 0.9, z0 - 0.008, 1], [rr * 0.9, z0 - 0.03, 1]], S));
    parts.chrome.push(lathe(THREE, [[rr * 0.89, z0 - 0.012, 1], [rr * 0.9, z0 - 0.004], [rr * 0.95, z0 - 0.002], [rr * 0.955, z0 + 0.004, 1], [rr * 1.02, z0 + 0.004, 1],
      [rr * 1.03, z0 - 0.006], [rr * 1.0, z0 - 0.026, 1], [rr * 0.89, z0 - 0.026, 1]], S));
    const nr = Math.round(lerp(16, 30, dl));
    for (let i = 0; i < nr; i++) { const a = (TAU * i) / nr; parts.chrome.push(placed(lathe(THREE, [[0, 0], [0.0042, 0, 1], [0.0042, 0.0012], [0.003, 0.0026], [0, 0.003]], 8), rr * 0.925 * Math.cos(a), rr * 0.925 * Math.sin(a), z0 - 0.002)); }
    parts.rim.push(lathe(THREE, [[0, z0 - 0.006], [rr * 0.25, z0 - 0.006], [rr * 0.33, z0 - 0.02], [rr * 0.33, z0 - 0.034, 1], [0, z0 - 0.034]], seg(10, 40)));
    parts.chrome.push(lathe(THREE, [[0, z0 + 0.006], [rr * 0.09, z0 + 0.004], [rr * 0.1, z0 - 0.008, 1], [0, z0 - 0.008]], seg(8, 32)));
    lugs(z0 - 0.007, rr * 0.18);
  } else if (type === 2) {
    // pancake: a closed aero disc, dished toward the middle, two V grooves, a rolled rim edge and a domed cap
    parts.rim.push(lathe(THREE, [[0, z0 + 0.01], [rr * 0.12, z0 + 0.009], [rr * 0.14, z0 + 0.002, 1], [rr * 0.3, z0 - 0.006], [rr * 0.5, z0 - 0.002],
      [rr * 0.555, z0, 1], [rr * 0.57, z0 - 0.005, 1], [rr * 0.585, z0, 1], [rr * 0.76, z0 + 0.003], [rr * 0.805, z0 + 0.004, 1], [rr * 0.82, z0 - 0.002, 1],
      [rr * 0.835, z0 + 0.004, 1], [rr * 0.94, z0 + 0.006], [rr * 0.99, z0 + 0.002], [rr * 1.02, z0 - 0.008], [rr * 1.0, z0 - 0.026, 1], [0, z0 - 0.026]], S));
    parts.chrome.push(lathe(THREE, [[0, z0 + 0.018], [rr * 0.06, z0 + 0.016], [rr * 0.1, z0 + 0.008], [rr * 0.11, z0 + 0.002, 1], [0, z0 + 0.002]], seg(10, 36)));
    const nb = 10;
    for (let i = 0; i < nb; i++) { const a = (TAU * i) / nb + 0.3; parts.chrome.push(placed(lathe(THREE, nut(0.0055), 6), rr * 0.9 * Math.cos(a), rr * 0.9 * Math.sin(a), z0 + 0.004)); }
  } else if (type === 3) {
    // turbofan: curved blades swept between the hub and a flat outer ring
    const blades = Math.max(10, n * 2), r1 = rr * 0.3, r2 = rr * 0.82, sweep = 0.55, curve = 10;
    for (let i = 0; i < blades; i++) {
      const a = (TAU * i) / blades, left = [], right = [];
      for (let k = 0; k <= curve; k++) {
        const t = k / curve, r = lerp(r1, r2, t), phi = a + sweep * t ** 1.3, w = lerp(0.008, 0.016, t) / r;
        left.push([r * Math.cos(phi + w), r * Math.sin(phi + w)]); right.push([r * Math.cos(phi - w), r * Math.sin(phi - w)]);
      }
      const bl = extrude(THREE, [...left, ...right.reverse()], 0.016, 0.003, 1);
      bl.translate(0, 0, z0 - 0.03); parts.rim.push(bl);
    }
    parts.rim.push(lathe(THREE, [[rr * 0.8, z0 - 0.032, 1], [rr * 0.8, z0 - 0.006], [rr * 0.84, z0, 1], [rr * 1.0, z0, 1], [rr * 1.025, z0 - 0.008], [rr * 1.0, z0 - 0.032, 1]], S));
    parts.rim.push(lathe(THREE, [[0, z0 - 0.004], [rr * 0.26, z0 - 0.006], [rr * 0.32, z0 - 0.016], [rr * 0.32, z0 - 0.034, 1], [0, z0 - 0.034]], seg(10, 40)));
    parts.chrome.push(lathe(THREE, [[0, z0 + 0.008], [rr * 0.08, z0 + 0.006], [rr * 0.095, z0 - 0.006, 1], [0, z0 - 0.006]], seg(8, 32)));
    lugs(z0 - 0.005, rr * 0.18);
  } else {
    // deep dish: a polished stepped lip falling into a deep dish, star spokes recessed at its floor, bolts round the lip
    const r3 = rr * 0.8;
    parts.chrome.push(lathe(THREE, [[r3, z0 - dd - 0.004, 1], [rr * 0.92, z0 - 0.014], [rr * 0.94, z0 - 0.003, 1], [rr * 1.02, z0, 1], [rr * 1.035, z0 - 0.012, 1],
      [rr * 0.98, z0 - 0.024, 1], [r3 - 0.004, z0 - dd - 0.016, 1]], S));
    const r1 = rr * 0.3, r2 = r3, sw = Math.min(0.016 + 0.06 / n, rr * 0.2);
    const shape = new THREE.Shape(); shape.absarc(0, 0, r3 + 0.004, 0, TAU, false);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, ao = sw / r2, ai = sw / r1;
      if (a1 - a0 - 2 * ai < 0.05) continue;
      const hole = new THREE.Path(); hole.absarc(0, 0, r2 - 0.012, a0 + ao, a1 - ao, false); hole.absarc(0, 0, r1, a1 - ai, a0 + ai, true);
      shape.holes.push(hole);
    }
    const star = new THREE.ExtrudeGeometry(shape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: detail > 0.7 ? 3 : 1, curveSegments: seg(4, 48) });
    star.translate(0, 0, z0 - dd - 0.022); parts.rim.push(star);
    const nb = Math.round(lerp(14, 24, dl));
    for (let i = 0; i < nb; i++) { const a = (TAU * i) / nb; parts.chrome.push(placed(lathe(THREE, nut(0.0042), 6), rr * 0.975 * Math.cos(a), rr * 0.975 * Math.sin(a), z0 - 0.0005, a)); }
    parts.chrome.push(lathe(THREE, [[0, z0 - dd + 0.006], [rr * 0.1, z0 - dd + 0.004], [rr * 0.12, z0 - dd - 0.01, 1], [0, z0 - dd - 0.01]], seg(8, 32)));
    lugs(z0 - dd - 0.007, rr * 0.2);
  }

  const g = new THREE.Group();
  const mat = { rubber: M.rubber, rim: M.rim, dark: M.dark, chrome: M.chrome, caliper: M.caliper };
  for (const k in parts) if (parts[k].length) { const m = new THREE.Mesh(merge(THREE, parts[k]), mat[k]); m.castShadow = true; g.add(m); }
  return g;
}
