// Antennas: a shark fin and a plain mast in the middle of the roof, a chrome telescopic mast on the hood corner by the
// cowl, a whip on the rear deck. Each stands on its own base, seated like the roof gear's feet: the base is tilted to
// the skin normal at its spot (a ray down onto the cabin roof, or the body's top surface) and sunk into it; above the
// base everything is rigid. Fins and roof masts sit on the centre line; hood and rear masts on the right side only.
import { castDown } from './roof.js';
import { bags, finish, frame, loft, spin, unit, sub, cross, add, mul, lerp, clamp, lod, Y } from './acc.js';

export const ANTENNA_TYPES = ['None', 'Shark fin', 'Roof mast', 'Hood mast', 'Rear mast'];

// surface normal of a height field y(x, z) by central differences
const normalOf = (yAt, x, z, e = 0.01) => unit([-(yAt(x + e, z) - yAt(x - e, z)) / (2 * e), 1, -(yAt(x, z + e) - yAt(x, z - e)) / (2 * e)]);
// a base frame on the skin: w along the skin normal, u along the car's length projected onto the tangent plane
const baseFrame = (p, n) => { const W = n, U = unit(sub([1, 0, 0], mul(W, W[0]))); return frame(p, U, cross(W, U), W); };

// body: { deckAt(x, lat), flatW(x), xHood, xA, lipX, W0 }; cabin: buildCabin() result
export function buildAntenna(P, body, cabin, detail = 1) {
  const t = P.anType;
  if (!t) return null;
  const B = bags(), segs = lod(detail, 8, 24), roof = cabin?.roof, out = cabin?.planRoof;
  const onRoof = (x, z) => { if (!roof?.index?.length) return null; const h = castDown(roof, x, z); if (!h) return null; const hy = (xx, zz) => castDown(roof, xx, zz)?.y ?? h.y; return { p: [x, h.y, z], n: normalOf(hy, x, z) }; };
  const onBody = (x, z) => ({ p: [x, body.deckAt(x, z), z], n: normalOf(body.deckAt, x, z) });
  const rx0 = out ? Math.min(...out.map((q) => q[0])) : 0, rx1 = out ? Math.max(...out.map((q) => q[0])) : 0;
  const L = P.anLen;

  if (t === 1) {
    // shark fin: teardrop sections, swept back as they rise, rounded on top; a rubber gasket under it
    const s = onRoof(lerp(rx0, rx1, 0.78), 0);
    if (!s) return null;
    const fr = baseFrame(s.p, s.n), len = 0.17, hgt = 0.065, wid = 0.03, nH = lod(detail, 6, 16), M = 24;
    const rings = Array.from({ length: nH + 1 }, (_, i) => {
      const f = i / nH, k = Math.sqrt(1 - f ** 2.6), l = len * lerp(1, 0.32, f ** 0.9), sh = len * 0.48 * f ** 1.1, h = -0.004 + (hgt + 0.004) * f;
      return Array.from({ length: M }, (_, j) => {
        const a = (2 * Math.PI * j) / M, c = Math.cos(a), sn = Math.sin(a);
        // teardrop in plan: round nose at -u, tapered tail at +u
        const u = c < 0 ? -0.32 * l * Math.abs(c) ** 0.9 : 0.68 * l * c, w2 = wid * k * Math.max(0.12, 1 - Math.max(0, c) ** 1.6 * 0.85) * sn;
        return [u + sh - 0.1 * l, w2, h];
      });
    });
    loft(B.black, frame(fr.O, fr.U, fr.W, cross(fr.U, fr.W)), rings.map((r) => r.map(([u, l, h]) => [u, h, l])));
    loft(B.rubber, fr, [0, 1].map((k) => Array.from({ length: M }, (_, j) => { const a = (2 * Math.PI * j) / M, c = Math.cos(a); return [(c < 0 ? -0.33 * len * Math.abs(c) ** 0.9 : 0.7 * len * c) - 0.1 * len, (wid + 0.004) * Math.sin(a) * Math.max(0.2, 1 - Math.max(0, c) ** 1.6 * 0.8), -0.004 + k * 0.007]; })));
  } else if (t === 2 || t === 4) {
    // whip mast: a base boot, a ferrule, a tapering rod raked back, a tip ferrule
    // the rear whip stands on the deck; a body without one (wagon, hatch, SUV) carries it at the roof's rear corner
    const deck = body.lipX - body.xC > 0.25, zr = out ? 0.6 * Math.max(...out.map((q) => Math.abs(q[1]))) : 0;
    const s = t === 2 ? onRoof(lerp(rx0, rx1, 0.5), 0) : deck ? onBody(body.lipX - 0.16, Math.min(0.72 * body.W0, body.flatW(body.lipX - 0.16) * 0.8)) : onRoof(rx1 - 0.12, zr);
    if (!s) return null;
    whip(B, baseFrame(s.p, s.n), L * (t === 2 ? 0.8 : 1), t === 2 ? 0.42 : 0.3, segs);
  } else {
    // power mast on the hood corner by the cowl: chrome bezel, three telescoping chrome sections, a ball tip
    const x = body.xA - 0.12, z = Math.min(0.8 * body.W0, body.flatW(x) * 0.88), s = onBody(x, z);
    const fr = baseFrame(s.p, [0, 1, 0]), up = frame(s.p, [1, 0, 0], [0, 0, 1], [0, 1, 0]);
    spin(B.chrome, fr, 0, 0, [[0, 0.004], [0.006, 0.0045], [0.011, 0.003], [0.013, 0], [0.013, -0.006], [0, -0.006]], segs);
    const parts = [[0.0042, 0.36], [0.0032, 0.33], [0.0022, 0.3]].map(([r, l]) => [r, l * L]);
    let w = 0;
    for (const [r, l] of parts) { spin(B.chrome, up, 0, 0, [[0, w - 0.01], [r, w - 0.01], [r, w + l - 0.004], [r * 1.25, w + l - 0.002], [r * 1.25, w + l], [0, w + l]], Math.max(6, segs >> 1)); w += l - 0.012; }
    spin(B.chrome, up, 0, 0, Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (i / 8 - 0.5); return [0.0042 * Math.cos(a), w + 0.003 + 0.0042 * Math.sin(a)]; }), 8);
  }
  return finish(B, false);
}

// a whip: rubber boot on the base, black rod raked back by `rake` (rad) in the car's length direction
function whip(B, fr, L, rake, segs) {
  spin(B.black, fr, 0, 0, [[0, 0.03], [0.006, 0.03], [0.009, 0.022], [0.012, 0.008], [0.016, 0.002], [0.016, -0.005], [0, -0.005]], segs);
  const axis = frame(fr.at(0, 0, 0.028), fr.U, fr.V, unit(add(mul(fr.W, Math.cos(rake)), mul(fr.U, Math.sin(rake)))));
  spin(B.black, axis, 0, 0, [[0, -0.01], [0.0035, -0.01], [0.0024, L * 0.6], [0.0016, L], [0.0028, L + 0.002], [0.0028, L + 0.012], [0, L + 0.014]], Math.max(6, segs >> 1));
  spin(B.chrome, axis, 0, 0, [[0, -0.004], [0.0046, -0.004], [0.0046, 0.012], [0.0036, 0.016], [0, 0.016]], Math.max(6, segs >> 1));
}
