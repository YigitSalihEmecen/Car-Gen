// Door mirrors, three styles: a modern body-colour housing on a flat stalk, a carbon racing bullet on twin rods, a
// classic round chrome head on a chrome stalk. Mounted on the door just behind the A-pillar base and under the
// shoulder: a ray from outside finds the skin there, the mount plate is seated on it (tilted to its normal, sunk into
// it), and the rigid mirror stands off it. Housing frame: u outward (toed in a little), v up, w rearward (the glass
// faces w). Built on the right side and mirrored.
import { bodyMesh } from './lights.js';
import { pushTube } from './kit.js';
import { tube } from './roof.js';
import { bags, finish, frame, extrude, loft, spin, sweep, pad, rrect, bezier, add, mul, unit, cross, lerp, clamp, lod, Y } from './acc.js';

export const MIRROR_TYPES = ['None', 'Modern', 'Racing', 'Classic'];
const quarter = (t) => Math.sqrt(1 - (1 - clamp(t, 0, 1)) ** 2);
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// body: { position, N, RL, xF, xR, W0, xA, sideZ(x) }
export function buildMirrors(P, body, detail = 1) {
  const t = P.mrType;
  if (!t) return null;
  const xm = body.xA + Math.max(P.aPillar, 0.08) + 0.07, ym = body.sideZ(xm) - 0.06;
  const { cast } = bodyMesh(body, [xm - 0.4, xm + 0.4]);
  const h = cast([xm, ym, body.W0 + 1], [0, 0, -1]);
  if (!h || h.n[2] < 0.3) return null;
  const B = bags(), segs = lod(detail, 10, 36), nU = lod(detail, 6, 18), s = P.mrSize;
  // every head clears the body's widest point near it (the driver looks past the shoulder and fender, not into them)
  const out = (d) => Math.max(d, body.widthAt(xm) + 0.05 - h.p[2]);
  const toe = (8 * Math.PI) / 180, U = [Math.sin(toe), 0, Math.cos(toe)], Wb = [Math.cos(toe), 0, -Math.sin(toe)];
  if (t === 1) {
    // housing: front bulge, near-flat back for the glass, a teardrop from inboard (lower) to a rounded outboard end
    const Lz = 0.2 * s, dxF = 0.06 * s, dxB = 0.014 * s, dy = 0.062 * s, C = add(h.p, [0.035, 0.085 * s, out(0.12 * s)]);
    const fr = frame(C, U, Y, Wb), n = 2 / 3.2, M = 28;
    const ring = (u) => {
      const k = quarter((Lz - u) / (0.06 * s)) * lerp(0.86, 1, quarter(u / (0.03 * s))), yy = dy * lerp(0.78, 1, u / Lz);
      return Array.from({ length: M }, (_, i) => { const a = (2 * Math.PI * i) / M, c = Math.cos(a); return [u, yy * k * spow(Math.sin(a), n) + 0.006 * (u / Lz), (c > 0 ? dxB : -dxF) * k * Math.abs(c) ** n]; });
    };
    loft(B.paint, fr, Array.from({ length: nU + 1 }, (_, i) => ring(Lz * (1 - (1 - i / nU) ** 1.3))));
    // glass in a dark gasket on the back face
    const gp = (a, b) => rrect(a, b, Math.min(a, b) * 0.35, 3).map(([u, v]) => [u + Lz * 0.5, v + 0.004]);
    extrude(B.dark, frame(C, U, Y, Wb), gp(Lz * 0.44, dy * 0.8), dxB * 0.4, dxB + 0.0016, 0.0008);
    extrude(B.mirror, frame(C, U, Y, Wb), gp(Lz * 0.41, dy * 0.72), dxB * 0.5, dxB + 0.0026, 0.0006);
    // a repeater strip along the housing's outboard front
    extrude(B.amber, frame(add(C, mul(Wb, -dxF * 0.55)), U, Y, mul(Wb, -1)), rrect(0.03 * s, 0.005, 0.0045, 2).map(([u, v]) => [u + Lz * 0.72, v - dy * 0.35]), 0, 0.012, 0.002);
    // flat aero stalk from a sail plate on the door to the housing's inboard end
    const base = add(h.p, mul(h.n, 0.004)), tip = fr.at(0.02, -0.01, -0.01);
    sweep(B.black, bezier(base, add(base, [0.02, 0.03, 0.04]), add(tip, [-0.01, -0.02, -0.04]), tip, 8), () => rrect(0.032, 0.008, 0.006, 2), [1, 0, 0], 0.01);
    pad(B.black, h.p, h.n, 0.05, 0.03, 0.012, 2, [1, 0.2, 0]);
  } else if (t === 2) {
    // racing bullet: a teardrop pointing forward, flat glass at its back, on two thin rods
    const L = 0.15 * s, rz = 0.055 * s, ry = 0.034 * s, C = add(h.p, [0.04, 0.06 * s, out(0.14 * s)]);
    const fr = frame(C, U, Y, Wb), M = 24, nW = lod(detail, 8, 20);
    const rings = Array.from({ length: nW + 1 }, (_, i) => {
      const w = lerp(-L, 0.004, i / nW), f = (w + L) / L, k = w > -0.006 ? quarter((0.006 - w) / 0.012) * 0.25 + 0.75 : Math.sqrt(Math.max(0, 1 - (1 - f) ** 2.4));
      return Array.from({ length: M }, (_, j) => { const a = (2 * Math.PI * j) / M; return [rz * k * Math.cos(a), ry * k * Math.sin(a), w]; });
    });
    loft(B.carbon, fr, rings);
    spin(B.dark, fr, 0, 0, [[0, 0.0045], [rz * 0.86, 0.0045], [rz * 0.86, -0.004]].map(([r, w]) => [r, w]), M);
    const ellipse = (a, b) => Array.from({ length: M }, (_, j) => { const q = (2 * Math.PI * j) / M; return [a * Math.cos(q), b * Math.sin(q)]; });
    extrude(B.mirror, fr, ellipse(rz * 0.8, ry * 0.76), 0.001, 0.0056, 0.0008);
    for (const dw of [-0.05, -0.1]) {
      const end = fr.at(-rz * 0.5, -ry * 0.6, dw * s), st = add(h.p, [0.04 + dw * 0.25, 0.01, 0]);
      tube(B.carbon, bezier(add(st, mul(h.n, -0.004)), add(st, [0, 0.03, 0.04]), add(end, [0, -0.02, -0.03]), end, 8), 0.0055, 10, false);
    }
    pad(B.carbon, h.p, h.n, 0.045, 0.014, 0.008, 2);
  } else {
    // classic: a chrome cup with a convex glass, a chrome stalk with a ball joint, a domed chrome base on the door
    const R = 0.056 * s, C = add(h.p, [0.02, 0.13 * s, out(0.11 * s)]), fr = frame(C, U, Y, Wb);
    spin(B.chrome, fr, 0, 0, [[0, -0.034], [R * 0.55, -0.032], [R * 0.9, -0.022], [R, -0.008], [R * 1.02, 0.002], [R * 0.98, 0.006], [R * 0.93, 0.004], [R * 0.93, 0]], segs);
    spin(B.mirror, fr, 0, 0, [[R * 0.93, 0.0005], [R * 0.6, 0.0035], [0, 0.0045]], segs);
    const joint = fr.at(0, 0, -0.04), base = add(h.p, mul(h.n, 0.006));
    tube(B.chrome, bezier(base, add(base, [0.01, 0.05, 0.03]), add(joint, [0, -0.05, -0.01]), joint, 10), 0.0065, 12, false);
    spin(B.chrome, frame(joint, U, Y, Wb), 0, 0, Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (i / 8 - 0.5); return [0.011 * Math.cos(a), 0.011 * Math.sin(a)]; }), 12);
    spin(B.chrome, frame(add(h.p, mul(h.n, -0.004)), unit(cross(h.n, Y)), Y, h.n), 0, 0, [[0, 0.016], [0.012, 0.013], [0.019, 0.005], [0.021, 0], [0, 0]], segs);
  }
  return finish(B, true);
}
