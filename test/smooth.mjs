// Surface fairness probe: angle between vertex normals of neighbouring stations along each mesh row.
// A staircase/pinch shows up as a large angle jump on rows above the beltline (greenhouse and roof edge).
import { buildCar } from '../src/car.js';

export function normals(position, index) {
  const n = new Float64Array(position.length);
  for (let f = 0; f < index.length; f += 3) {
    const [a, b, c] = [index[f] * 3, index[f + 1] * 3, index[f + 2] * 3];
    const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
    const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { n[v] += nx; n[v + 1] += ny; n[v + 2] += nz; }
  }
  for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
  return n;
}

// worst zigzag (degrees) of the normal along each row, for rows from the beltline anchor up to the roof centre:
// angle between n_i and the mean of its station neighbours. A crease that bends consistently scores low,
// a staircase or pinch (normals flip back and forth) scores high.
export function upperFairness(P, opts) {
  const g = buildCar(P, opts), { position: p, index, outline, meta } = g, N = outline.x.length;
  // arch cut walls are intentional hard edges: skip the band right above each wheel opening
  const nearArch = (x, z) => meta.wheels.some((w) => Math.abs(x - w) < meta.Ra + 0.12) && z < meta.R + meta.Ra + P.bottomR + 0.06;
  const { bf, bc, side, tc, tf, belt } = g.ring, H = bf + bc + side + tc + tf, RL = 2 * H - 2;
  const n = normals(p, index);
  let worst = 0, at = null;
  for (let q = bf + bc + belt; q < H; q++) for (let i = 1; i < N - 1; i++) {
    // the end caps (sections collapsing to the nose / tail tip) have no surface to be fair
    if (outline.wmax[i] < 0.03 || outline.x[i] > meta.xTail) continue;
    const a = ((i - 1) * RL + q) * 3, b = (i * RL + q) * 3, c = ((i + 1) * RL + q) * 3;
    if ([a, b, c].some((v) => nearArch(p[v], p[v + 1]))) continue;
    const mx = n[a] + n[c], my = n[a + 1] + n[c + 1], mz = n[a + 2] + n[c + 2], ml = Math.hypot(mx, my, mz) || 1;
    const ang = Math.acos(Math.min(1, (n[b] * mx + n[b + 1] * my + n[b + 2] * mz) / ml)) * 180 / Math.PI;
    if (ang > worst) { worst = ang; at = { x: +p[b].toFixed(3), z: +p[b + 1].toFixed(3), row: q }; }
  }
  return { worst, at };
}
