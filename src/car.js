// Parametric car body. Pure math, no three.js: returns typed arrays.
import { buildCabin, MIN_A, MIN_PILLAR, MIN_C } from './cabin.js';
import { buildHeadlights, buildTaillights } from './lights.js';
// Frame: x = length (front end at -overhangF, front axle at 0), y = up, z = lateral.
// Body = loft of cross sections along x. Every driving curve is smooth (PCHIP + gaussian blur),
// section corners are superellipses (zero curvature where they meet the flats), so the
// surface reads as one continuous panel. Wheel arches are cut by lifting the section floor.
//
// Three orthographic systems drive the loft:
//   side       : silhouette, beltline, character line         (s, z)
//   top        : body plan width, cabin plan width             (s, fraction of half width)
//   front/rear : section templates for body side and glass, blended front -> rear

const SEC = (body, glass) => ({ body, glass });

export const PRESETS = {
  sedan: {
    wheelR: 0.33, tireW: 0.235, rimRatio: 0.66, spokes: 5, wheelbase: 2.85, track: 1.58, archGap: 0.04, camber: 0, wheelPoke: 0,
    overhangF: 0.95, overhangR: 1.1, width: 1.86, clearance: 0.15, chinZ: 0.3, tailBotZ: 0.38,
    planF: 0.5, planR: 0.38, noseR: 0.14, tailR: 0.1, noseTaper: 1.5, tailTaper: 1.2,
    squareness: 3.2, edgeR: 0.1, cabinR: 0.03, bottomR: 0.09, crown: 0.035, softness: 0.035,
    crease: 0.008, flare: 0.02, flareR: 0.02, fenderMelt: 2.4, archLip: 0.008, ledge: 0.03, hoodDome: 0.01, peakF: 0.0, peakR: 0.0,
    pillars: [[0.47, 0]], pillarFan: 0.15, pillarW: 0.08, aPillar: 0.09, cPillar: 0.3, cTaper: 0.55, doors: 4, cabinBlend: 0.025,
    baseRound: 0.5, roofRound: 0.35, wsCrown: 0.06, blCrown: 0.05, glassBulge: 0.015, sideBow: 0.012, roofCrown: 0.025, roofArch: 0.02, sillInset: 0.035, headerInset: 0.055,
    tension: 0.15, creaseSharp: 0.3, ledgeSharp: 0.3, archShape: 0, ridge: 0,
    hlType: 2, hlH: 0.72, hlZ: 0.64, hlDepth: 0, hlSize: 1, hlSweep: 20, hlRake: 15, hlAngle: 0,
    hlBlend: 0.12, hlRound: 0.6, hlMelt: 0.6, hlCrown: 0,
    tlType: 2, tlH: 0.68, tlZ: 0.66, tlDepth: 0, tlSize: 1, tlSweep: 15, tlRake: 10, tlAngle: 0, tlBlend: 0.1, tlRound: 0.6, tlMelt: 0.6, tlCrown: 0,
    cladding: 0, gaps: 1, contrastRoof: 0, metal: 0.45, rough: 0.32, color: '#1f3a5f',
    profile: [[-1, 0.72], [-0.72, 0.84], [0.3, 0.99], [0.56, 1.43], [0.84, 1.44], [1.13, 1.06], [1.85, 1.02], [2, 0.95]],
    belt: [[-0.7, 0.86], [0.6, 0.98], [1.8, 1.03]],
    chr: [[-0.9, 0.72], [0.5, 0.79], [1.9, 0.86]],
    plan: [[-1, 0.86], [0, 0.99], [0.5, 0.98], [1, 1.0], [2, 0.92]],
    cabin: [1, 0.8, 0.79, 1],
    secF: SEC([[0, 0.07], [0.35, 0.02], [0.7, 0.0], [1, 0.008]], [0.5, 0.42]),
    secR: SEC([[0, 0.07], [0.35, 0.02], [0.7, 0.0], [1, 0.008]], [0.5, 0.42]),
  },
  hatch: {
    wheelR: 0.31, tireW: 0.205, wheelbase: 2.45, track: 1.52, overhangF: 0.78, overhangR: 0.58, width: 1.74,
    clearance: 0.14, chinZ: 0.28, tailBotZ: 0.42, planF: 0.42, planR: 0.3, noseR: 0.12, tailR: 0.08,
    cabinR: 0.03, pillars: [[0.45, 0]], cPillar: 0.32, cTaper: 0.7, contrastRoof: 1, color: '#2a54a8', spokes: 8, peakF: 0.02,
    profile: [[-1, 0.70], [-0.6, 0.84], [0.28, 0.99], [0.62, 1.48], [1.08, 1.47], [1.72, 1.03], [1.92, 0.99], [2, 0.92]],
    belt: [[-0.6, 0.88], [0.6, 1.0], [1.8, 1.08]],
    chr: [[-0.9, 0.74], [0.5, 0.8], [1.9, 0.9]],
    plan: [[-1, 0.84], [0, 0.98], [0.5, 0.97], [1, 1.0], [2, 0.94]],
    cabin: [1, 0.8, 0.8, 1],
    secR: SEC([[0, 0.06], [0.35, 0.0], [0.7, -0.01], [1, 0.0]], [0.5, 0.4]),
    hlSize: 0.92, hlSweep: 22,
  },
  coupe: {
    wheelR: 0.345, tireW: 0.265, wheelbase: 2.62, track: 1.6, overhangF: 0.98, overhangR: 0.86, width: 1.9,
    clearance: 0.12, chinZ: 0.22, tailBotZ: 0.36, planF: 0.55, planR: 0.4, noseR: 0.12, tailR: 0.1, noseTaper: 1.7,
    crown: 0.04, flare: 0.045, crease: 0.01, doors: 2, pillars: [[0.66, 0.12]], cPillar: 0.16, flareR: 0.055, creaseSharp: 0.6, peakF: 0.03, hoodDome: 0.015,
    color: '#2f7d3b', spokes: 10, rimRatio: 0.72,
    profile: [[-1, 0.56], [-0.7, 0.68], [0.36, 0.86], [0.64, 1.25], [0.86, 1.26], [1.28, 0.96], [1.85, 0.93], [2, 0.86]],
    belt: [[-0.7, 0.72], [0.5, 0.88], [1.8, 0.95]],
    chr: [[-0.9, 0.6], [0.4, 0.7], [1.9, 0.8]],
    plan: [[-1, 0.78], [0, 0.97], [0.5, 0.94], [1, 1.0], [2, 0.9]],
    cabin: [1, 0.75, 0.73, 1],
    secF: SEC([[0, 0.09], [0.35, 0.03], [0.7, 0.0], [1, 0.012]], [0.5, 0.36]),
    secR: SEC([[0, 0.08], [0.35, 0.02], [0.7, -0.01], [1, 0.0]], [0.5, 0.34]),
    hlSweep: 26, hlRake: 25,
  },
  supercar: {
    wheelR: 0.35, tireW: 0.3, wheelbase: 2.7, track: 1.68, overhangF: 1.02, overhangR: 0.92, width: 2.03,
    clearance: 0.1, chinZ: 0.14, tailBotZ: 0.3, planF: 0.6, planR: 0.45, noseR: 0.08, tailR: 0.1, noseTaper: 2.0, tailTaper: 1.0,
    squareness: 3.6, crown: 0.03, flare: 0.07, flareR: 0.1, fenderMelt: 2.8, crease: 0.012, ledge: 0.02, doors: 2, peakF: 0.05, peakR: 0.04,
    pillars: [], cPillar: 0.1, cTaper: 0.45, baseRound: 0.65, roofRound: 0.55, wsCrown: 0.12, blCrown: 0.08, glassBulge: 0.03, sideBow: 0.03, cabinR: 0.025, tension: 0.35, creaseSharp: 0.85, ledgeSharp: 0.6, archShape: 0.65, color: '#d0491f', spokes: 7, rimRatio: 0.74, metal: 0.25,
    profile: [[-1, 0.42], [-0.65, 0.62], [0.2, 0.8], [0.46, 1.13], [0.6, 1.14], [1.06, 0.98], [1.8, 0.96], [2, 0.9]],
    belt: [[-0.6, 0.66], [0.3, 0.76], [1.6, 0.96]],
    chr: [[-0.9, 0.42], [0.3, 0.55], [1.9, 0.75]],
    plan: [[-1, 0.72], [0, 0.96], [0.45, 0.9], [1, 1.0], [2, 0.94]],
    cabin: [1, 0.66, 0.62, 1],
    secF: SEC([[0, 0.1], [0.35, 0.05], [0.7, 0.0], [1, 0.03]], [0.5, 0.3]),
    secR: SEC([[0, 0.07], [0.35, 0.04], [0.7, 0.0], [1, 0.0]], [0.5, 0.26]),
    hlType: 3, hlH: 0.85, hlZ: 0.62, hlSweep: 30, hlRake: 35,
    tlType: 1, tlSweep: 25, tlRake: 20,
  },
  muscle: {
    wheelR: 0.34, tireW: 0.255, wheelbase: 2.75, track: 1.56, overhangF: 1.08, overhangR: 0.98, width: 1.84,
    clearance: 0.14, chinZ: 0.3, tailBotZ: 0.4, planF: 0.32, planR: 0.24, noseR: 0.06, tailR: 0.05, noseTaper: 1.1, tailTaper: 1.0,
    squareness: 4.5, edgeR: 0.06, cabinR: 0.022, baseRound: 0.45, roofRound: 0.3, crease: 0.014, flare: 0.04, flareR: 0.06, doors: 2, hoodDome: 0.03,
    pillars: [[0.8, 0.3]], cPillar: 0.22, tension: 0.5, creaseSharp: 0.9, ledgeSharp: 0.7, color: '#8f1d1d', spokes: 5, metal: 0.2,
    profile: [[-1, 0.78], [-0.72, 0.86], [0.42, 0.92], [0.62, 1.3], [0.76, 1.31], [1.36, 0.98], [1.9, 0.98], [2, 0.93]],
    belt: [[-0.7, 0.88], [0.5, 0.92], [1.8, 1.0]],
    chr: [[-0.9, 0.78], [0.5, 0.78], [1.9, 0.86]],
    plan: [[-1, 0.92], [0, 0.97], [0.55, 0.95], [1, 1.0], [2, 0.97]],
    cabin: [1, 0.76, 0.74, 1],
    secF: SEC([[0, 0.05], [0.35, 0.03], [0.75, 0.0], [1, 0.01]], [0.5, 0.42]),
    secR: SEC([[0, 0.05], [0.35, 0.02], [0.75, -0.015], [1, 0.0]], [0.5, 0.38]),
    hlType: 1, hlH: 0.62, hlZ: 0.74, hlSweep: 4, hlRake: 0,
    tlType: 1, tlSweep: 3, tlRake: 0, tlZ: 0.7,
  },
  wagon: {
    wheelR: 0.34, wheelbase: 2.87, overhangF: 0.92, overhangR: 1.05, width: 1.86, planR: 0.3, tailR: 0.06,
    cPillar: 0.1, pillars: [[0.4, 0], [0.74, 0.08]], pillarFan: 0.3, color: '#6c7178', spokes: 6,
    profile: [[-1, 0.68], [-0.7, 0.8], [0.3, 0.96], [0.58, 1.43], [1.6, 1.41], [1.92, 1.07], [1.97, 1.0], [2, 0.95]],
    belt: [[-0.7, 0.86], [0.6, 0.98], [1.8, 1.05]],
    chr: [[-0.9, 0.72], [0.5, 0.78], [1.9, 0.88]],
    plan: [[-1, 0.85], [0, 0.99], [0.5, 0.98], [1, 1.0], [2, 0.95]],
    cabin: [1, 0.8, 0.8, 1],
    tlType: 3, tlH: 0.6,
  },
  suv: {
    wheelR: 0.38, tireW: 0.255, wheelbase: 2.85, track: 1.64, overhangF: 0.92, overhangR: 1.0, width: 1.94,
    clearance: 0.21, chinZ: 0.38, tailBotZ: 0.5, planF: 0.5, planR: 0.3, noseR: 0.14, tailR: 0.08, noseTaper: 1.3,
    cabinR: 0.035, crown: 0.03, flare: 0.03, flareR: 0.035, baseRound: 0.45, roofRound: 0.3, sideBow: 0.008, cladding: 0.05, cPillar: 0.12, pillars: [[0.42, 0], [0.76, 0.04]], pillarFan: 0.25, archShape: 0.25, tension: 0.3, color: '#e9e9e6',
    spokes: 6, metal: 0.3, hoodDome: 0.015,
    profile: [[-1, 0.88], [-0.62, 1.03], [0.3, 1.16], [0.62, 1.69], [1.55, 1.67], [1.9, 1.2], [1.97, 1.13], [2, 1.06]],
    belt: [[-0.6, 1.05], [0.6, 1.12], [1.8, 1.18]],
    chr: [[-0.9, 0.88], [0.5, 0.92], [1.9, 1.0]],
    plan: [[-1, 0.88], [0, 0.99], [0.5, 0.98], [1, 1.0], [2, 0.95]],
    cabin: [1, 0.86, 0.85, 1],
    secF: SEC([[0, 0.05], [0.35, 0.01], [0.7, 0.0], [1, 0.006]], [0.5, 0.44]),
    secR: SEC([[0, 0.05], [0.35, 0.01], [0.7, 0.0], [1, 0.006]], [0.5, 0.44]),
    hlSize: 1.1, hlSweep: 22,
  },
  offroad: {
    wheelR: 0.4, tireW: 0.28, rimRatio: 0.52, spokes: 6, wheelbase: 2.5, track: 1.62, archGap: 0.06,
    overhangF: 0.72, overhangR: 0.78, width: 1.9, clearance: 0.3, chinZ: 0.52, tailBotZ: 0.52,
    planF: 0.2, planR: 0.16, noseR: 0.06, tailR: 0.05, noseTaper: 1.0, tailTaper: 1.0, squareness: 6, edgeR: 0.05, cabinR: 0.018, bottomR: 0.05, baseRound: 0.18, roofRound: 0.12, wsCrown: 0.01, blCrown: 0, glassBulge: 0, sideBow: 0, roofCrown: 0.008, roofArch: 0,
    crown: 0.012, softness: 0.02, crease: 0.0, flare: 0.05, flareR: 0.05, fenderMelt: 1.8, archLip: 0.0, ledge: 0.0, hoodDome: 0,
    pillars: [[0.3, 0], [0.58, 0], [0.83, 0]], pillarFan: 0, pillarW: 0.1, cPillar: 0.12, cTaper: 1, tension: 0.9, ledgeSharp: 1, archShape: 0.85, cladding: 0.1, color: '#c9682c', metal: 0.1, rough: 0.45,
    profile: [[-1, 1.08], [-0.68, 1.13], [0.24, 1.2], [0.4, 1.88], [1.86, 1.88], [1.97, 1.3], [1.99, 1.24], [2, 1.18]],
    belt: [[-0.7, 1.14], [0.6, 1.2], [1.8, 1.22]],
    chr: [[-0.9, 0.9], [0.5, 0.92], [1.9, 0.94]],
    plan: [[-1, 0.97], [0, 1.0], [0.5, 1.0], [1, 1.0], [2, 0.99]],
    cabin: [1, 0.95, 0.95, 1],
    secF: SEC([[0, 0.01], [0.35, 0.0], [0.7, 0.0], [1, 0.0]], [0.5, 0.5]),
    secR: SEC([[0, 0.01], [0.35, 0.0], [0.7, 0.0], [1, 0.0]], [0.5, 0.5]),
    hlType: 1, hlH: 0.55, hlZ: 0.7, hlSize: 1.15, hlSweep: 0, hlRake: 0,
    tlType: 3, tlSweep: 0, tlRake: 0, tlH: 0.55, tlZ: 0.74, tlSize: 0.9,
  },
  rally: {
    wheelR: 0.33, tireW: 0.25, wheelbase: 2.5, track: 1.62, overhangF: 0.8, overhangR: 0.6, width: 1.88,
    clearance: 0.17, chinZ: 0.24, tailBotZ: 0.4, planF: 0.4, planR: 0.28, noseR: 0.1, tailR: 0.07,
    flare: 0.1, flareR: 0.1, fenderMelt: 2.0, archLip: 0.02, cabinR: 0.03, crease: 0.012, doors: 2, pillars: [[0.48, 0]], peakF: 0.02, cPillar: 0.3,
    contrastRoof: 1, color: '#e3e4e2', spokes: 10, rimRatio: 0.62, metal: 0.1, rough: 0.28,
    profile: [[-1, 0.66], [-0.6, 0.8], [0.27, 0.97], [0.6, 1.42], [1.1, 1.42], [1.78, 1.04], [1.94, 1.0], [2, 0.93]],
    belt: [[-0.6, 0.86], [0.6, 0.98], [1.8, 1.08]],
    chr: [[-0.9, 0.62], [0.5, 0.7], [1.9, 0.82]],
    plan: [[-1, 0.8], [0, 1.0], [0.5, 0.92], [1, 1.0], [2, 0.9]],
    cabin: [1, 0.72, 0.72, 1],
  },
  wedge: {
    wheelR: 0.34, tireW: 0.29, rimRatio: 0.7, spokes: 5, wheelbase: 2.5, track: 1.6, archGap: 0.05,
    overhangF: 1.05, overhangR: 0.78, width: 1.98, clearance: 0.11, chinZ: 0.16, tailBotZ: 0.32,
    planF: 0.22, planR: 0.18, noseR: 0.03, tailR: 0.03, noseTaper: 1.4, tailTaper: 1.0,
    squareness: 7, edgeR: 0.018, cabinR: 0.012, bottomR: 0.03, crown: 0.0, softness: 0.008, tension: 1,
    baseRound: 0.2, roofRound: 0.15, wsCrown: 0.02, blCrown: 0.01, glassBulge: 0, sideBow: 0, roofCrown: 0.006, roofArch: 0,
    crease: 0.014, creaseSharp: 1, flare: 0.0, flareR: 0.0, archLip: 0.0, archShape: 1, ledge: 0.028, ledgeSharp: 1, ridge: 0.025,
    hoodDome: 0, peakF: 0, peakR: 0, doors: 2, pillars: [[0.72, 0.35]], aPillar: 0.07, cPillar: 0.08, cTaper: 0.5,
    color: '#d9a51a', metal: 0.2, rough: 0.3,
    profile: [[-1, 0.5], [-0.9, 0.56], [0.1, 0.78], [0.42, 1.08], [0.62, 1.09], [1.15, 0.9], [1.85, 0.9], [2, 0.86]],
    belt: [[-0.8, 0.6], [0.3, 0.76], [1.8, 0.86]],
    chr: [[-0.95, 0.45], [0.4, 0.58], [1.95, 0.72]],
    plan: [[-1, 0.82], [0, 0.97], [0.5, 0.95], [1, 1.0], [2, 0.98]],
    cabin: [1, 0.68, 0.66, 1],
    secF: SEC([[0, 0.08], [0.35, 0.05], [0.7, 0.0], [1, 0.0]], [0.5, 0.5]),
    secR: SEC([[0, 0.07], [0.35, 0.04], [0.7, 0.0], [1, 0.0]], [0.5, 0.5]),
    hlType: 3, hlH: 0.85, hlSweep: 15, hlRake: 40,
    tlSweep: 10, tlRake: 25,
  },
};
for (const k in PRESETS) if (k !== 'sedan') PRESETS[k] = { ...PRESETS.sedan, ...PRESETS[k] };

export const clone = (p) => JSON.parse(JSON.stringify(p));

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// superellipse quarter: 0 at t=0 with vertical tangent, 1 at t>=1 with zero slope
const se = (t, m) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(1 - Math.pow(1 - t, m), 1 / m));
const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

// Fritsch-Carlson monotone cubic: smooth, never overshoots its control points
export function pchip(pts) {
  const n = pts.length, x = pts.map((p) => p[0]), y = pts.map((p) => p[1]);
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = x[i + 1] - x[i]; d[i] = (y[i + 1] - y[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (t) => {
    if (t <= x[0]) return y[0];
    if (t >= x[n - 1]) return y[n - 1];
    let i = 0; while (t > x[i + 1]) i++;
    const s = (t - x[i]) / h[i], s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h[i] * m[i + 1];
  };
}

function polyline(pts) {
  const n = pts.length;
  return (t) => {
    if (t <= pts[0][0]) return pts[0][1];
    if (t >= pts[n - 1][0]) return pts[n - 1][1];
    let i = 0; while (t > pts[i + 1][0]) i++;
    return lerp(pts[i][1], pts[i + 1][1], (t - pts[i][0]) / (pts[i + 1][0] - pts[i][0]));
  };
}

// archH(u): arch height fraction at |dx| = u * Ra. shape 0 = round, 1 = hexagonal (flat top, straight flanks)
export const archH = (u, shape) => lerp(Math.sqrt(Math.max(0, 1 - u * u)), Math.min(1, (1 - u) * 2.2), shape);

function blur(a, sigma) {
  const r = Math.ceil(sigma * 3); if (r < 1) return a;
  const k = []; let ks = 0;
  for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(w); ks += w; }
  const out = new Float64Array(a.length), n = a.length;
  for (let j = 0; j < n; j++) { let s = 0; for (let i = -r; i <= r; i++) s += a[clamp(j + i, 0, n - 1)] * k[i + r]; out[j] = s / ks; }
  return out;
}
function dilate(a, r) {
  const out = new Float64Array(a.length);
  for (let j = 0; j < a.length; j++) { let m = 0; for (let i = Math.max(0, j - r); i <= Math.min(a.length - 1, j + r); i++) m = Math.max(m, a[i]); out[j] = m; }
  return out;
}

// arch flank roll as a fraction of the section's bottom radius: the lip rolls as softly down the flanks as over the top
const ARCH_ROLL = 0.6;

export function sToX(P, s) { return s < 0 ? s * P.overhangF : s <= 1 ? s * P.wheelbase : P.wheelbase + (s - 1) * P.overhangR; }
export function xToS(P, x) { return x < 0 ? x / P.overhangF : x <= P.wheelbase ? x / P.wheelbase : 1 + (x - P.wheelbase) / P.overhangR; }

// Keep control polylines ordered and physically plausible so the solver never sees a fold.
export function sanitize(P) {
  const fix = (pts, s0, s1, gap) => {
    pts.sort((a, b) => a[0] - b[0]);
    pts.forEach((p, i) => { p[0] = clamp(p[0], s0 + i * gap, s1 - (pts.length - 1 - i) * gap); if (i) p[0] = Math.max(p[0], pts[i - 1][0] + gap); });
  };
  const pr = P.profile;
  pr[0][0] = -1; pr[pr.length - 1][0] = 2;
  fix(pr, -1, 2, 0.01);
  for (const p of pr) p[1] = clamp(p[1], P.clearance + 0.22, 2.6);
  fix(P.belt, -1, 2, 0.05); fix(P.chr, -1, 2, 0.05);
  P.plan[0][0] = -1; P.plan[P.plan.length - 1][0] = 2;
  fix(P.plan, -1, 2, 0.08);
  for (const p of P.plan) p[1] = clamp(p[1], 0.4, 1.15);
  P.cabin = P.cabin.map((c) => clamp(c, 0.3, 1));
  for (const sec of [P.secF, P.secR]) {
    const b = sec.body;
    b[0][0] = 0; b[b.length - 1][0] = 1;
    fix(b, 0, 1, 0.08);
    for (const p of b) p[1] = clamp(p[1], -0.06, 0.25);
    sec.glass = [clamp(sec.glass[0], 0.15, 0.85), clamp(sec.glass[1], 0.05, 0.95)];
  }
  P.doors = P.doors >= 3 ? 4 : 2;
  P.aPillar = Math.max(P.aPillar, MIN_A); P.pillarW = Math.max(P.pillarW, MIN_PILLAR); P.cPillar = Math.max(P.cPillar, MIN_C);
  P.hlType = clamp(Math.round(P.hlType), 0, 3);
  P.hlSweep = clamp(P.hlSweep, -10, 40); P.hlRake = clamp(P.hlRake, -10, 35); P.hlAngle = clamp(P.hlAngle, -30, 30);
  P.tlType = clamp(Math.round(P.tlType), 0, 3);
  P.tlSweep = clamp(P.tlSweep, -10, 40); P.tlRake = clamp(P.tlRake, -10, 35); P.tlAngle = clamp(P.tlAngle, -30, 30);
  P.pillars = P.pillars.slice(0, 3).sort((a, b) => a[0] - b[0]);
  P.pillars.forEach((p, i) => { p[0] = clamp(p[0], 0.08 + i * 0.12, 0.92 - (P.pillars.length - 1 - i) * 0.12); p[1] = clamp(p[1], -0.6, 0.8); });
  return P;
}

export function setPillarCount(P, n) {
  n = clamp(Math.round(n), 0, 3);
  if (n !== P.pillars.length) P.pillars = Array.from({ length: n }, (_, i) => [(i + 1) / (n + 1), 0]);
  return P;
}

// tessellation for a detail level in [0, 1]: 1 = full, 0 = PS1-grade (corners collapse to single vertices)
const lod = (d, lo, hi) => Math.max(lo, Math.round(lerp(lo, hi, clamp(d, 0, 1) ** 1.5)));
export function ringFor(detail = 1) {
  const side = lod(detail, 4, 80), chr = clamp(Math.round((side * 26) / 80), 1, side - 3);
  return { bf: lod(detail, 1, 6), bc: lod(detail, 1, 10), side, tc: lod(detail, 1, 18), tf: lod(detail, 1, 10), chr, belt: clamp(Math.round((side * 50) / 80), chr + 1, side - 2) };
}

export function buildCar(P, opts = {}) {
  const detail = opts.detail ?? 1, N = opts.stations || lod(detail, 16, 380), M = 3000;
  const R = P.wheelR, Ra = R + P.archGap, wb = P.wheelbase, W0 = P.width / 2;
  const xF = -P.overhangF, xR = wb + P.overhangR, L = xR - xF, dx = L / (M - 1);
  const wheels = [0, wb];
  const toX = (pts) => pts.map(([s, z]) => [sToX(P, s), z]);
  const sigma = Math.max(P.softness, 0.004) / dx;
  const px = (s) => sToX(P, s), pr = P.profile;
  const xHood = px(pr[1][0]), xA = px(pr[2][0]), xRF = px(pr[3][0]), xRR = px(pr[4][0]), xC = px(pr[5][0]), xDeck = px(pr[6][0]);

  const X = new Float64Array(M);
  for (let j = 0; j < M; j++) X[j] = xF + j * dx;
  const sample = (f) => Float64Array.from(X, f);

  // tension blends each smooth curve toward its control polyline; segW forces chosen segments straight
  const shaped = (pts, segW = []) => {
    const pc = pchip(pts), pl = polyline(pts);
    const w = blur(Float64Array.from(X, (x) => { let i = 0; while (i < pts.length - 2 && x > pts[i + 1][0]) i++; return Math.max(P.tension, segW[i] || 0); }), 0.05 / dx);
    return Float64Array.from(X, (x, j) => lerp(pc(x), pl(x), w[j]));
  };
  const belt = blur(shaped(toX(P.belt)), sigma * 2);
  const ix = (x) => clamp(Math.round((x - xF) / dx), 0, M - 1);
  const topRaw = shaped(toX(pr));
  const oA = topRaw[ix(xA)] - belt[ix(xA)], oC = topRaw[ix(xC)] - belt[ix(xC)];
  for (let j = ix(xA); j <= ix(xC); j++) topRaw[j] = belt[j] + lerp(oA, oC, (X[j] - xA) / Math.max(xC - xA, 1e-3));
  const top = blur(topRaw, sigma);
  const chr = blur(shaped(toX(P.chr)), sigma * 2);
  const bot = blur(sample(pchip([[xF, P.chinZ], [0, P.clearance], [wb, P.clearance], [xR, P.tailBotZ]])), sigma);
  const planW = blur(shaped(toX(P.plan)), sigma * 1.5);
  const win = (a, b) => (x) => (b - a < 1e-3 ? 0 : sstep(a, a + 0.35 * (b - a), x) * (1 - sstep(b - 0.35 * (b - a), b, x)));
  // blurred so a very short hood or deck segment never turns these windows into steps
  const hoodWin = blur(sample(win(xHood, xA)), 0.04 / dx), deckWin = blur(sample(win(xC, xDeck)), 0.04 / dx);

  // end caps in side view: rounded top/bottom edges of the nose and tail
  const plan = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const df = X[j] - xF, dr = xR - X[j];
    plan[j] = se(df / P.planF, 2.6) * se(dr / P.planR, 2.6) * planW[j];
    const rbF = P.noseR * 0.6, rbR = P.tailR * 0.6;
    top[j] -= P.noseR * (1 - se(df / P.noseR, 2.4)) + P.tailR * (1 - se(dr / P.tailR, 2.4));
    bot[j] += rbF * (1 - se(df / rbF, 2.4)) + rbR * (1 - se(dr / rbR, 2.4));
    if (top[j] < bot[j] + 0.12) { const m = (top[j] + bot[j]) / 2; top[j] = m + 0.06; bot[j] = m - 0.06; }
  }

  // wheel arch cut line, automatic fender rise where the arch would poke through, plus designed fender peaks
  const arch = new Float64Array(M), need = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    let a = -1;
    for (const xw of wheels) { const d = Math.abs(X[j] - xw); if (d < Ra) a = Math.max(a, R + Ra * archH(d / Ra, P.archShape)); }
    arch[j] = a;
    need[j] = a > 0 ? Math.max(0, a + 0.03 - (top[j] - P.crown - P.edgeR * 0.5)) : 0;
  }
  const rise = blur(dilate(need, Math.round((0.08 + 0.04 * P.fenderMelt) / dx)), (0.04 + 0.05 * P.fenderMelt) / dx);
  for (let j = 0; j < M; j++) rise[j] += P.peakF * hoodWin[j] + P.peakR * deckWin[j];
  // the arch lifts the section floor, so over the top its edge rolls with the section's bottom radius; on the steep
  // flanks only an x-blur of the lift can roll it, otherwise the lip turns into a crisp vertical edge (a streak in reflections)
  const cut = blur(Float64Array.from(bot, (b, j) => Math.max(0, arch[j] - b)), ARCH_ROLL * Math.max(P.bottomR, 0.03) / dx).map((l, j) => bot[j] + l);
  // a widely blurred floor line: features that would run into an arch (the character crease) taper out ahead of it and
  // come back after it, instead of tracing the arch edge down its slopes row by row (a staircase in reflections)
  const cutWide = blur(cut, 0.1 / dx);

  // fender volume: covers the tyre plus `flare`, extends fenderMelt * Ra fore/aft, flat-topped falloff (C1 at its rim)
  const tyreOut = P.track / 2 + P.tireW / 2 + 0.015;
  const fenderPeak = wheels.map((xw, i) => Math.max(W0 * planW[clamp(Math.round((xw - xF) / dx), 0, M - 1)], tyreOut) + (i ? P.flareR : P.flare));
  const fLx = Ra * P.fenderMelt, fLz = Ra * (0.75 + 0.3 * P.fenderMelt);
  // curvature-continuous at its rim (value, slope and curvature reach zero together): no kinked reflections where it ends
  const melt = (e) => (e >= 1 ? 0 : 1 - e * e * e * (e * (6 * e - 15) + 10));

  // station placement: equal steps of an importance length so steep features get dense rings
  // (the fender bulge counts too: a big flare changes the side width fast and was sampled into a staircase)
  const bulge = Float64Array.from(X, (x, j) => wheels.reduce((m, xw, wi) => Math.max(m, Math.max(0, fenderPeak[wi] - W0 * planW[j]) * melt(((x - xw) / fLx) ** 2)), 0));
  const cum = new Float64Array(M);
  for (let j = 1; j < M; j++) {
    cum[j] = cum[j - 1] + dx + 2.5 * Math.abs(cut[j] - cut[j - 1]) + Math.abs(top[j] - top[j - 1])
      + 2 * W0 * Math.abs(plan[j] - plan[j - 1]) + Math.abs(rise[j] - rise[j - 1]) + 4 * Math.abs(bulge[j] - bulge[j - 1]);
  }
  const at = (arr, j, f) => arr[j] + (arr[Math.min(j + 1, M - 1)] - arr[j]) * f;

  // section templates (front view / rear view): each governs its half of the car, blended under the roof
  let xSecF = lerp(xRF, xRR, 0.2), xSecR = lerp(xRF, xRR, 0.8);
  if (xSecR - xSecF < 0.4) { const c = (xSecF + xSecR) / 2; xSecF = c - 0.2; xSecR = c + 0.2; }
  const bodyF = pchip(P.secF.body), bodyR = pchip(P.secR.body);

  const ring = ringFor(detail), { bf, bc, side, tc, tf } = ring, ROWS = ring;
  const H = bf + bc + side + tc + tf, RL = 2 * H - 2;
  const tSideEnd = (bf + bc + side - 1) / (H - 1), tTop = (bf + bc + side + tc - 1) / (H - 1);
  const pos = new Float32Array(N * RL * 3), aT = new Float32Array(N * RL), aBelt = new Float32Array(N * RL), aIR = new Float32Array(N * RL * 2);
  const half = new Float64Array(H * 2);
  const outline = { x: [], top: [], side: [], bot: [], belt: [], chr: [], wmax: [], wbelt: [] };
  const deckSt = []; // per station: the body's top-surface law, so the cabin can stand exactly on it
  const sections = {};
  const e = 2 / P.squareness;

  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (cum[M - 1] * i) / (N - 1);
    while (j < M - 2 && cum[j + 1] < target) j++;
    const f = cum[j + 1] > cum[j] ? clamp((target - cum[j]) / (cum[j + 1] - cum[j]), 0, 1) : 0;
    const x = at(X, j, f), zc = at(top, j, f), zr = at(bot, j, f);
    const zbelt = at(belt, j, f), zchr = at(chr, j, f), ri = at(rise, j, f);
    const Wp = W0 * at(planW, j, f), dome = P.hoodDome * at(hoodWin, j, f);
    const ridge = P.ridge * (at(hoodWin, j, f) + at(deckWin, j, f));
    let zb = at(cut, j, f);
    const zs = zc + ri - P.crown - ridge;
    const h = Math.max(zs - zr, 0.05);
    const rt = Math.min(P.edgeR, 0.35 * h);
    const rb = Math.min(P.bottomR, 0.25 * h);
    zb = Math.min(zb, zs - rt - rb - 0.005);

    const fr = sstep(xSecF, xSecR, x);
    const spanB = Math.max(zbelt - zr, 0.1);
    // features only exist where there is room for them below the top corner; they fade out instead of being squeezed into it
    const room = zs - rt - zbelt, roomChr = Math.min(zs - rt - zchr, zchr - Math.max(zb, at(cutWide, j, f)) - rb);
    const ledge = P.ledge * sstep(0.015, 0.1, room);
    const crease = P.crease * sstep(0.02, 0.08, roomChr);
    const ins = (t) => lerp(bodyF(t), bodyR(t), fr);
    const dF = x - xF, dR = xR - x;
    const extras = (z) => {
      const dc = Math.abs(z - zchr);
      let w = crease * lerp(Math.exp(-((dc / 0.025) ** 2)), Math.max(0, 1 - dc / 0.03), P.creaseSharp);
      for (let wi = 0; wi < 2; wi++) {
        const ddx = x - wheels[wi];
        w += fender[wi] * melt((ddx / fLx) ** 2 + ((z - (R + 0.3 * Ra)) / fLz) ** 2);
      }
      // arch lip: a bead just above the real (rolled) arch edge, as strong as the arch is deep, so it ends with the arch
      if (lipAmt > 0) w += lipAmt * Math.exp(-(((z - zb - 0.03) / 0.03) ** 2));
      return w;
    };
    const fender = fenderPeak.map((pk) => Math.max(0, pk - Wp)), lipAmt = P.archLip * sstep(0, 0.08, zb - zr);
    const wShoulder = Wp - ins(1), ledgeW = lerp(0.06, 0.006, P.ledgeSharp);
    const W = (z) => {
      let w = Wp - ins(clamp((z - zr) / spanB, 0, 1)) + extras(z);
      if (z > zbelt) w -= ledge * sstep(zbelt, zbelt + ledgeW, z);
      // plan rounding radius grows with height: trapezoidal front and rear faces
      const tz = clamp((z - zr) / h, 0, 1);
      const cp = se(dF / (P.planF * lerp(1, P.noseTaper, tz)), 2.6) * se(dR / (P.planR * lerp(1, P.tailTaper, tz)), 2.6);
      return cp * Math.max(w, 0.25 * W0);
    };
    const T = (u) => zc - P.crown * u * u - ridge * u + ri * sstep(0.3, 1, u) + dome * Math.exp(-((u / 0.38) ** 2));

    // half contour in (u, z): u = lateral fraction of W(z)
    let k = 0;
    const put = (u, z) => { half[k++] = u; half[k++] = z; };
    const rbu = Math.min(rb / W(zb + rb), 0.95), rtu = Math.min(rt / W(zs - rt), 0.95);
    for (let q = 0; q < bf; q++) put((1 - rbu) * (q / bf), zb);
    for (let q = 0; q < bc; q++) { const a = -Math.PI / 2 + (Math.PI / 2) * (q / bc); put(1 - rbu + rbu * spow(Math.cos(a), e), zb + rb + rb * spow(Math.sin(a), e)); }
    // side rows are anchored on the character line and beltline so those features never alias across rows
    // the side rows span from the floor line (raised by the arch where there is one) to the shoulder: over an arch they
    // compress smoothly instead of piling onto the arch edge one by one (which folded quads across the fender)
    const lo = zb + rb, hi = zs - rt, span = hi - lo;
    // the character-line row tracks the crease only where the crease exists; where it has faded (an arch cutting up into
    // it) the row relaxes to an even spacing, so the rows below it are never squashed into a sliver over the arch.
    // The row is fully on the crease before the crease starts to grow (0.02), so a narrow bump never sits between rows.
    const kc = lerp(lo + (ROWS.chr / (side - 1)) * span, clamp(zchr, lo + 0.05 * span, hi - 0.1 * span), sstep(-0.03, 0.02, roomChr));
    const kb = clamp(zbelt, kc + 0.05 * span, hi - 0.05 * span);
    const knots = [[0, lo], [ROWS.chr, kc], [ROWS.belt, kb], [side - 1, hi]];
    for (let q = 0; q < side; q++) {
      const s = q < ROWS.chr ? 0 : q < ROWS.belt ? 1 : 2, [i0, z0] = knots[s], [i1, z1] = knots[s + 1];
      const t = (q - i0) / (i1 - i0), g = t - (0.55 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
      put(1, z0 + (z1 - z0) * g);
    }
    for (let q = 1; q <= tc; q++) { const a = (Math.PI / 2) * (q / tc); put(1 - rtu + rtu * spow(Math.cos(a), e), zs - rt + rt * spow(Math.sin(a), e)); }
    for (let q = 1; q <= tf; q++) put((1 - rtu) * (1 - q / tf), zs);

    const base = i * RL;
    let wmax = 0;
    const halfYZ = [];
    for (let q = 0; q < H; q++) {
      const u = half[2 * q];
      let z = half[2 * q + 1];
      if (q > bf + bc + side - 1) z += (T(u) - zs) * sstep(zs - rt, zs, z);
      const y = u * W(z), t = q / (H - 1);
      const set = (r, lat) => { const o = (base + r) * 3; pos[o] = x; pos[o + 1] = z; pos[o + 2] = lat; aT[base + r] = t; aBelt[base + r] = zbelt; aIR[2 * (base + r)] = i; aIR[2 * (base + r) + 1] = r; };
      set(q, y);
      if (q > 0 && q < H - 1) set(RL - q, -y);
      wmax = Math.max(wmax, y);
      halfYZ.push(y, z);
    }
    for (const [key, xs] of [['F', xSecF], ['R', xSecR]]) {
      if (!sections[key] && x >= xs) sections[key] = { x, zr, zbelt, zs, Wp, spanB, half: halfYZ };
    }
    outline.x.push(x); outline.top.push(zc + dome); outline.side.push(zs); outline.bot.push(zb); outline.belt.push(zbelt); outline.chr.push(zchr);
    outline.wmax.push(wmax); outline.wbelt.push(W(zbelt));
    const Wz = W(zs - rt);
    deckSt.push({ zc, ri, ridge, dome, Wz, flat: (1 - rtu) * Wz });
  }

  const index = new Uint32Array((N - 1) * RL * 6);
  let o = 0;
  for (let i = 0; i < N - 1; i++) for (let r = 0; r < RL; r++) {
    const a = i * RL + r, b = i * RL + ((r + 1) % RL), c = a + RL, d = b + RL;
    index[o++] = a; index[o++] = c; index[o++] = b;
    index[o++] = b; index[o++] = c; index[o++] = d;
  }

  // station lookup by x (stations are sorted)
  const ox = outline.x, station = (x) => {
    let lo = 0, hi = ox.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ox[m] <= x) lo = m; else hi = m; }
    return [lo, hi, clamp((x - ox[lo]) / Math.max(ox[hi] - ox[lo], 1e-9), 0, 1)];
  };
  // same top-surface law the loft uses: T(u) with u = lateral / top width
  const topAt = (S, lat) => {
    const u = clamp(lat / Math.max(S.Wz, 1e-3), 0, 1);
    return S.zc - P.crown * u * u - S.ridge * u + S.ri * sstep(0.3, 1, u) + S.dome * Math.exp(-((u / 0.38) ** 2));
  };
  const cabin = buildCabin(P, {
    xA, xRF, xRR, xC, W0, doorEnd: wb - Ra - 0.08, detail,
    deck: (x) => top[ix(x)],
    deckAt: (x, lat) => { const [a, b, t] = station(x); return lerp(topAt(deckSt[a], lat), topAt(deckSt[b], lat), t); },
    flatW: (x) => { const [a, b, t] = station(x); return lerp(deckSt[a].flat, deckSt[b].flat, t); },
  });

  return {
    position: pos, index, aT, aBelt, aIR, outline, sections, cabin, ring,
    lights: buildHeadlights(P, { position: pos, N, RL, xF, xR, W0 }, detail),
    tails: buildTaillights(P, { position: pos, N, RL, xF, xR, W0 }, detail),
    meta: {
      xF, xR, W0, R, Ra, wb, wheels, RL, tSideEnd, tTop, tBot: (bf + bc) / (H - 1), xA, xRF, xRR, xC,
      doorLines: cabin.doorLines,
    },
  };
}

const lerpDeep = (a, b, t) => (typeof a === 'number' ? lerp(a, b, t)
  : Array.isArray(a) ? (b && b.length === a.length ? a.map((v, i) => lerpDeep(v, b[i], t)) : clone(a))
  : a && typeof a === 'object' ? Object.fromEntries(Object.keys(a).map((k) => [k, lerpDeep(a[k], b[k], t)]))
  : a);

export function randomCar(rng = Math.random) {
  const keys = Object.keys(PRESETS);
  const pick = () => PRESETS[keys[Math.floor(rng() * keys.length)]];
  const a = pick(), b = pick(), t = rng();
  const P = lerpDeep(clone(a), b, t);
  const r = (amt) => (rng() * 2 - 1) * amt;
  ['wheelbase', 'overhangF', 'overhangR', 'width', 'flare', 'flareR', 'fenderMelt', 'crease', 'edgeR', 'noseTaper', 'roofRound', 'wsCrown', 'sideBow'].forEach((k) => { P[k] *= 1 + r(0.12); });
  P.pillars = P.pillars.map(([f, lean]) => [f + r(0.04), lean + r(0.08)]);
  const lift = r(0.08);
  P.profile.forEach((p, i) => { if (i > 0 && i < 7) p[0] += r(0.04); if (i >= 3 && i <= 4) p[1] += lift; });
  P.plan.forEach((p) => { p[1] += r(0.04); });
  P.cabin = P.cabin.map((c) => c + r(0.04));
  for (const sec of [P.secF, P.secR]) { sec.body.forEach((p) => { p[1] += r(0.012); }); sec.glass[1] += r(0.08); }
  P.peakF = Math.max(0, P.peakF + r(0.02)); P.peakR = Math.max(0, P.peakR + r(0.02));
  P.spokes = Math.round(P.spokes);
  P.doors = rng() < 0.5 ? 2 : 4;
  P.contrastRoof = rng() < 0.3 ? 1 : 0;
  P.color = ['#1f3a5f', '#8f1d1d', '#e9e9e6', '#2f7d3b', '#d0491f', '#6c7178', '#1b1c1e', '#c9a227', '#2a54a8'][Math.floor(rng() * 9)];
  return sanitize(P);
}
