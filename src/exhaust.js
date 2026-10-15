// Exhaust tips: one, two (one each side) or four (a pair each side), under the tail. Each tip is a lathe: a chrome
// shell with a slight flare and a rolled lip, a heat-blued inner wall, a dark pipe running forward under the body. The
// tips sit just below the tail face's lower edge and reach out past whatever is behind them at their height (the body
// skin, found by rays, and a fitted rear bumper) by the stick-out amount, so they always read from behind.
import { bodyMesh } from './lights.js';
import { bags, finish, frame, spin, unit, clamp, lod, Y } from './acc.js';

export const EXHAUST_TYPES = ['None', 'Single', 'Dual', 'Quad'];

// body: { position, N, RL, xF, xR, W0, tail, kitMaxX(y0, y1, z0, z1) }
export function buildExhaust(P, body, detail = 1) {
  if (!P.exType) return null;
  const quad = P.exType === 3, r = (P.exD / 2) * (quad ? 0.82 : P.exType === 1 ? 1.15 : 1), segs = lod(detail, 10, 40);
  const { cast } = bodyMesh(body, 'rear'), zTk = body.tail.zTk;
  // height: tucked under the face's lower edge, above the ground
  const yc = Math.max(P.clearance + r + 0.025, Math.min(zTk - 0.35 * r, zTk + 0.01));
  const zs0 = clamp(P.exSpread, 0.2, 0.85) * body.W0;
  const zs = quad ? [zs0 - 1.15 * r, zs0 + 1.15 * r] : [zs0];
  const L = 0.13, t = Math.max(0.0035, r * 0.08), ri = r * 0.74, drop = 0.035;
  const B = bags(), tips = [];
  for (const z of zs) {
    // the rearmost thing behind the tip at its height: skin (rays across the tip's band) and a fitted rear bumper
    let xe = -Infinity;
    for (let k = -2; k <= 2; k++) { const h = cast([body.xR + 1, yc + (k / 2) * r * 0.95, z], [-1, 0, 0]); if (h) xe = Math.max(xe, h.p[0]); }
    if (xe === -Infinity) { const h = cast([body.xR + 1, zTk + 0.012, z], [-1, 0, 0]); xe = h ? h.p[0] : body.xR - 0.05; }
    xe = Math.max(xe, body.kitMaxX?.(yc - r, yc + r, z - r, z + r) ?? -Infinity) + P.exOut + 0.005;
    tips.push([xe, yc, z]);
    if (P.exType !== 1) tips.push([xe, yc, -z]);
    const fr = frame([xe, yc, z], [0, 0, 1], Y, [1, 0, 0]), dn = unit([1, -drop, 0]);
    const tip = frame(fr.O, [0, 0, 1], unit([drop, 1, 0]), dn);
    const f = r * 1.03;
    // chrome: the shell from the pipe joint, flaring to the mouth, rolled over into the lip
    spin(B.chrome, tip, 0, 0, [[r * 0.9, -L - 0.02], [r * 0.96, -L], [r, -L * 0.55], [f, -0.008], [f, -0.0022], [f - 0.0012, 0], [f - t * 0.55, 0.0004], [f - t, -0.0016]], segs);
    // the inside: heat-blued wall down to the inner pipe, then the dark pipe running forward
    spin(B.burnt, tip, 0, 0, [[f - t, -0.0016], [r - t, -0.012], [r - t, -0.045], [ri + 0.004, -0.055], [ri, -0.058]], segs);
    spin(B.dark, tip, 0, 0, [[ri, -0.058], [ri, -0.35], [0, -0.35]], segs);
    // the pipe behind the tip, hidden under the body
    spin(B.dark, tip, 0, 0, [[0, -L - 0.02], [r * 0.9, -L - 0.02], [r * 0.7, -L - 0.06], [r * 0.7, -0.75], [0, -0.75]], Math.max(8, segs >> 1));
  }
  // one tip sits on the right only; dual and quad are mirrored pairs. `tips`: each mouth's centre, for hosts
  return Object.assign(finish(B, P.exType !== 1), { tips });
}
