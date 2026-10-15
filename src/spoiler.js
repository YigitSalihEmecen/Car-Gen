// Spoilers and wings, the five most common kinds: a lip on the deck edge, a ducktail kick, a pedestal wing, a GT wing on
// swan necks, and a roof spoiler off the roof's rear edge. Deck-edge parts are swept across the car along the deck's rear
// edge, their sections standing on the deck surface itself (sunk 4 mm, so they grow out of it); wings are rigid
// cambered airfoils on uprights whose rubber feet are seated on the deck; the roof spoiler hangs off the roof's own rear
// edge. Everything is built on the right (z >= 0) and mirrored.
import { castDown } from './roof.js';
import { pushTube, roundPoly } from './kit.js';
import { bags, finish, frame, extrude, sweep, bezier, pad, lerp, clamp, lod, smooth, X, Y, Z } from './acc.js';

export const SPOILER_TYPES = ['None', 'Lip', 'Ducktail', 'Pedestal wing', 'GT wing', 'Roof spoiler'];
const quarter = (t) => Math.sqrt(1 - (1 - clamp(t, 0, 1)) ** 2);

// cambered airfoil (NACA 4-digit form): closed loop of [x, y] over a unit chord, leading edge at x = 0
function airfoil(m, p, t, n) {
  const yt = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const yc = (x) => (x < p ? (m / (p * p)) * (2 * p * x - x * x) : (m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x));
  const xs = Array.from({ length: n + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / n));
  return [...xs.slice().reverse().map((x) => [x, yc(x) + yt(x)]), ...xs.slice(1, -1).map((x) => [x, yc(x) - yt(x)])];
}

// body: { deckAt(x, lat), flatW(x), lipX, xC, W0 }; cabin: buildCabin() result
export function buildSpoiler(P, body, cabin, detail = 1) {
  const t = P.spType;
  if (!t) return null;
  const B = bags(), nCol = lod(detail, 8, 40), nS = lod(detail, 8, 28);
  const ok = t <= 2 ? deckEdge(P, body, B, t === 2, nCol, nS) : t <= 4 ? wing(P, body, B, t === 4, nCol, detail) : roofSpoiler(P, cabin, B, nCol, nS);
  return ok ? finish(B, true) : null;
}

// the deck's rear edge at a lateral position: the last x (up to the lip) where the deck's flat top still reaches it
function edgeAt(body, lat) {
  let lo = body.lipX - 0.8, hi = body.lipX;
  if (body.flatW(hi) >= lat) return hi;
  for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2; if (body.flatW(m) >= lat) lo = m; else hi = m; }
  return lo;
}

// lip / ducktail: a section on the deck at each lateral station, rising rearward to a crisp trailing edge just past the
// deck edge; the leading edge is a feather sunk into the deck; both ends roll down to nothing
function deckEdge(P, body, B, duck, nCol, nS) {
  const c = (duck ? 0.3 : 0.1) * P.spSize, h = (duck ? 0.07 : 0.028) * P.spSize, over = duck ? 0.028 : 0.012;
  const room = body.lipX - body.xC - 0.05;
  if (room < 0.06) return false;
  const cc = Math.min(c, room), latMax = Math.max(0.2, body.flatW(body.lipX - cc) * 0.97), roll = 0.06;
  const rings = [];
  for (let j = 0; j <= nCol; j++) {
    const lat = latMax * (1 - (1 - j / nCol) ** 1.6), xe = edgeAt(body, lat), k = quarter((latMax - lat) / roll);
    const ys = (s) => body.deckAt(Math.min(xe + s, xe), lat);
    const ss = Array.from({ length: nS + 1 }, (_, i) => -cc + ((cc + over) * i) / nS);
    // top: a ducktail is a concave kick, a lip a quick ramp to its edge; past the deck edge it carries on straight
    const rise = (s) => (s >= 0 ? 1 + (0.25 * s) / over : duck ? smooth((s + cc) / cc) ** 1.3 : smooth((s + cc) / (0.7 * cc)));
    const top = ss.map((s) => [xe + s, ys(s) + h * k * rise(s), lat]);
    const thick = (s) => (s < 0 ? h * k * rise(s) + 0.004 : 0.006 + 0.004 * k);
    const bottom = ss.map((s, i) => [xe + s, top[i][1] - Math.max(thick(s), 0.004), lat]);
    rings.push([...bottom, ...top.reverse()]);
  }
  pushTube(B.paint, rings, { capStart: false });
  return true;
}

// wings: a cambered airfoil set nose-down for downforce (inverted camber, trailing edge up), endplates, uprights
function wing(P, body, B, gt, nCol, detail) {
  const c = gt ? 0.3 : 0.2, span = Math.min((gt ? 0.82 : 0.7) * body.W0, body.flatW(body.lipX - 0.1) + (gt ? 0.04 : 0)), H = P.spH * (gt ? 1.4 : 1);
  const xf = Math.max(body.xC + 0.06, body.lipX - (gt ? 0.22 : 0.14));
  if (xf > body.lipX - 0.02) return false;
  const zf = Math.min((gt ? 0.32 : 0.58) * body.W0, body.flatW(xf) * 0.85), yDeck = body.deckAt(xf, zf), y0 = body.deckAt(xf, 0);
  const xLE = gt ? body.lipX - 0.72 * c : xf - 0.35 * c, yW = y0 + H, aoa = ((gt ? 11 : 7) * Math.PI) / 180;
  const foil = airfoil(gt ? 0.06 : 0.045, 0.42, gt ? 0.12 : 0.11, lod(detail, 6, 18)).map(([u, v]) => [u * c, -v * c]);
  // u along the chord, v the (inverted) thickness; the section turns about its leading edge, trailing edge up
  const place = ([u, v]) => { const ca = Math.cos(aoa), sa = Math.sin(aoa); return [xLE + u * ca - v * sa, yW + u * sa + v * ca]; };
  const rings = Array.from({ length: nCol + 1 }, (_, j) => { const z = (span * j) / nCol; return foil.map((q) => [...place(q), z]); });
  pushTube(gt ? B.carbon : B.paint, rings, { capStart: false });
  const surf = gt ? B.carbon : B.paint;
  // endplates: flat plates square to the span, wider than the chord
  const lo = gt ? 0.11 : 0.045, hi = gt ? 0.06 : 0.035, ex0 = gt ? 0.05 : 0.02, ex1 = gt ? 0.06 : 0.025;
  const pts = [[xLE - ex0, yW - lo * 0.5, 0.01], [xLE + c * Math.cos(aoa) + ex1, yW + c * Math.sin(aoa) - lo, 0.02], [xLE + c * Math.cos(aoa) + ex1, yW + c * Math.sin(aoa) + hi, 0.012], [xLE - ex0, yW + hi * 0.6, 0.012]];
  extrude(surf, frame([0, 0, 0], X, Y, Z), roundPoly(pts, 3), span - 0.002, span + (gt ? 0.006 : 0.005), 0.0015);
  if (gt) {
    // Gurney flap on the pressure (upper) side of the trailing edge
    const te = place([c, 0]);
    pushTube(B.carbon, [0, span - 0.004].map((z) => [[te[0] - 0.004, te[1] - 0.002, z], [te[0], te[1] - 0.002, z], [te[0], te[1] + 0.016, z], [te[0] - 0.004, te[1] + 0.016, z]]));
    // swan necks: from the deck ahead of the wing, up in front of the leading edge, over it and onto the upper surface
    const top = place(foil[Math.round(foil.length * 0.16)]);
    const path = bezier([xf, yDeck - 0.006, zf], [xf + 0.01, yDeck + 0.55 * (top[1] - yDeck), zf], [xLE - 0.05, top[1] + 0.13, zf], [top[0], top[1] - 0.004, zf], lod(detail, 10, 28));
    sweep(B.black, path, () => roundPoly([[-0.026, -0.006, 0.004], [0.026, -0.006, 0.004], [0.026, 0.006, 0.004], [-0.026, 0.006, 0.004]], 2), Z, 0.006);
    pad(B.black, [xf, yDeck, zf], [0, 1, 0], 0.04, 0.02, 0.008, 2);
  } else {
    // pedestals: tapered blades from rubber-footed bases to the wing's underside
    const under = place([0.45 * c, foil.reduce((m, [u, v]) => (Math.abs(u - 0.45 * c) < 0.06 * c ? Math.max(m, v) : m), 0)]);
    const blade = roundPoly([[xf - 0.055, yDeck - 0.006, 0.004], [xf + 0.045, yDeck - 0.006, 0.004], [under[0] + 0.03, under[1] + 0.006, 0.01], [under[0] - 0.035, under[1] + 0.006, 0.01]], 3);
    extrude(B.paint, frame([0, 0, 0], X, Y, Z), blade, zf - 0.008, zf + 0.008, 0.002);
    pad(B.rubber, [xf - 0.005, yDeck, zf], [0, 1, 0], 0.065, 0.016, 0.006, 2);
  }
  return true;
}

// roof spoiler: a blade off the roof's rear edge, angled down over the backlight, with side fins at its ends
function roofSpoiler(P, cabin, B, nCol, nS) {
  const out = cabin?.planRoof, roof = cabin?.roof;
  if (!out || !roof?.index?.length) return false;
  const latMax = Math.max(...out.map((q) => Math.abs(q[1]))) * 0.9, xMid = out.reduce((s, q) => s + q[0], 0) / out.length;
  // rear edge: the outline's rearmost x at each lateral position
  const rearX = (lat) => {
    let x = -Infinity;
    for (let i = 0; i < out.length; i++) {
      const [ax, az] = out[i], [bx, bz] = out[(i + 1) % out.length];
      if ((Math.abs(az) - lat) * (Math.abs(bz) - lat) <= 0 && az !== bz && ax > xMid) x = Math.max(x, lerp(ax, bx, (lat - Math.abs(az)) / (Math.abs(bz) - Math.abs(az))));
    }
    return x;
  };
  const c1 = 0.07, c2 = 0.22 * P.spSize, drop = Math.tan((3 * Math.PI) / 180), roll = 0.05, rings = [];
  let fin = null;
  for (let j = 0; j <= nCol; j++) {
    const lat = latMax * (1 - (1 - j / nCol) ** 1.6), xr = rearX(Math.min(lat, latMax)), k = quarter((latMax - lat) / roll);
    const h = castDown(roof, xr - 0.03, lat);
    if (!h || !Number.isFinite(xr)) return false;
    const yr = h.y, ss = Array.from({ length: nS + 1 }, (_, i) => -c1 + ((c1 + c2) * i) / nS);
    const topY = (s) => (s <= 0 ? yr + 0.024 * k * smooth((s + c1) / c1) - 0.002 : yr + 0.024 * k - drop * s);
    const thick = (s) => (s <= 0 ? 0.024 * k * smooth((s + c1) / c1) + 0.006 : lerp(0.024 * k + 0.006, 0.008, s / c2));
    const top = ss.map((s) => [xr + s, topY(s), lat]), bottom = ss.map((s, i) => [xr + s, top[i][1] - thick(s), lat]);
    rings.push([...bottom, ...top.reverse()]);
    if (j === nCol - 2) fin = { xr, yr, lat, topY };
  }
  pushTube(B.paint, rings, { capStart: false });
  // side fins: plates hanging from the blade's ends down the backlight's edges
  const { xr, yr, lat, topY } = fin;
  extrude(B.paint, frame([0, 0, 0], X, Y, Z), roundPoly([[xr - 0.02, yr + 0.006, 0.006], [xr + c2, topY(c2) + 0.004, 0.006], [xr + c2 * 0.55, yr - 0.1, 0.02]], 3), lat - 0.004, lat + 0.004, 0.0015);
  return true;
}
