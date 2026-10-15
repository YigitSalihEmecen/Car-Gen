// Parametric car body. Pure math, no three.js: returns typed arrays.
import { buildCabin, MIN_A, MIN_PILLAR, MIN_C } from './cabin.js';
import { buildHeadlights, buildTaillights, LIGHT_BAR } from './lights.js';
import { buildLightBar } from './lightbar.js';
import { buildFenders } from './flares.js';
import { buildKit } from './kit.js';
import { buildRoof } from './roof.js';
import { buildPlates } from './plates.js';
import { buildExhaust } from './exhaust.js';
import { buildSpoiler } from './spoiler.js';
import { buildMirrors } from './mirrors.js';
import { buildAntenna } from './antenna.js';
import { buildGrille } from './grille.js';
import { buildHood } from './hood.js';
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
    planF: 0.5, planR: 0.3, noseR: 0.14, tailR: 0.03, noseTaper: 1.5, tailTaper: 1.2,
    tailRake: 6, tailCrease: 0.38, tailCreaseR: 0.02, tailTuck: 28, tailBox: 4, tailBow: 0.06,
    squareness: 3.2, edgeR: 0.1, cabinR: 0.03, bottomR: 0.09, crown: 0.035, softness: 0.035,
    crease: 0.008, flare: 0.02, flareR: 0.02, fenderMelt: 2.4, archLip: 0.008, ledge: 0.03, hoodDome: 0.01, peakF: 0.0, peakR: 0.0,
    pillars: [[0.47, 0]], pillarFan: 0.15, pillarW: 0.08, aPillar: 0.09, cPillar: 0.3, cTaper: 0.55, cabinBlend: 0.025,
    baseRound: 0.5, roofRound: 0.35, wsCrown: 0.06, blCrown: 0.05, glassBulge: 0.015, sideBow: 0.012, roofCrown: 0.025, roofArch: 0.02, sillInset: 0.035, headerInset: 0.055,
    tension: 0.15, creaseSharp: 0.3, ledgeSharp: 0.3, archShape: 0, ridge: 0,
    hlType: 2, hlH: 0.72, hlZ: 0.64, hlDepth: 0, hlSize: 1, hlSweep: 20, hlRake: 15, hlAngle: 0,
    hlBlend: 0.12, hlRound: 0.6, hlMelt: 0.6, hlCrown: 0,
    tlType: 2, tlH: 0.68, tlZ: 0.66, tlDepth: 0, tlSize: 1, tlSweep: 15, tlRake: 10, tlAngle: 0, tlBlend: 0.1, tlRound: 0.6, tlMelt: 0.6, tlCrown: 0,
    fdType: 0, fdWidth: 0.1, fdOut: 0.04, fdLip: 0.012, fdWrap: 0.6, fdBlend: 0.035,
    rimType: 0, rfType: 0, rfLen: 0.8, rfWidth: 0.85, rfH: 0.07,
    plateType: 1, plateH: 0.3, plateNo: 4721, exType: 2, exD: 0.085, exOut: 0.02, exSpread: 0.55, spType: 0, spSize: 1, spH: 0.16, mrType: 1, mrSize: 1, anType: 0, anLen: 0.6, grType: 0, grSize: 1, grH: 0.5, hdType: 0, hdSize: 1,
    kitF: 0, kitS: 0, kitR: 0, kitH: 0.1, kitDrop: 0.02, kitOut: 1, kitBlend: 0.03,
    cladding: 0, contrastRoof: 0, metal: 0.45, rough: 0.32, color: '#1f3a5f',
    profile: [[-1, 0.72], [-0.72, 0.84], [0.3, 0.99], [0.56, 1.43], [0.84, 1.44], [1.13, 1.06], [1.85, 1.02], [2, 1.0]],
    belt: [[-0.7, 0.86], [0.6, 0.98], [1.8, 1.03]],
    chr: [[-0.9, 0.72], [0.5, 0.79], [1.9, 0.86]],
    plan: [[-1, 0.86], [0, 0.99], [0.5, 0.98], [1, 1.0], [2, 0.92]],
    cabin: [1, 0.8, 0.79, 1],
    secF: SEC([[0, 0.07], [0.35, 0.02], [0.7, 0.0], [1, 0.008]], [0.5, 0.42]),
    secR: SEC([[0, 0.07], [0.35, 0.02], [0.7, 0.0], [1, 0.008]], [0.5, 0.42]),
  },
  hatch: {
    wheelR: 0.31, tireW: 0.205, wheelbase: 2.45, track: 1.52, overhangF: 0.78, overhangR: 0.58, width: 1.74,
    clearance: 0.14, chinZ: 0.28, tailBotZ: 0.42, planF: 0.42, planR: 0.24, noseR: 0.12, tailR: 0.035,
    tailRake: -4, tailCrease: 0.32, tailCreaseR: 0.015, tailTuck: 34, tailBox: 3.6, tailBow: 0.05,
    cabinR: 0.03, pillars: [[0.45, 0]], cPillar: 0.32, cTaper: 0.7, contrastRoof: 1, color: '#2a54a8', spokes: 8, peakF: 0.02,
    profile: [[-1, 0.70], [-0.6, 0.84], [0.28, 0.99], [0.62, 1.48], [1.08, 1.47], [1.72, 1.03], [1.92, 0.99], [2, 0.92]],
    belt: [[-0.6, 0.88], [0.6, 1.0], [1.8, 1.08]],
    chr: [[-0.9, 0.74], [0.5, 0.8], [1.9, 0.9]],
    plan: [[-1, 0.84], [0, 0.98], [0.5, 0.97], [1, 1.0], [2, 0.94]],
    cabin: [1, 0.8, 0.8, 1],
    secR: SEC([[0, 0.06], [0.35, 0.0], [0.7, -0.01], [1, 0.0]], [0.5, 0.4]),
    hlSize: 0.92, hlSweep: 22, spType: 5, exType: 1, grType: 2, anType: 1,
  },
  coupe: {
    wheelR: 0.345, tireW: 0.265, wheelbase: 2.62, track: 1.6, overhangF: 0.98, overhangR: 0.86, width: 1.9,
    clearance: 0.12, chinZ: 0.22, tailBotZ: 0.36, planF: 0.55, planR: 0.3, noseR: 0.12, tailR: 0.016, noseTaper: 1.7,
    tailRake: 14, tailCrease: 0.38, tailCreaseR: 0.012, tailTuck: 30, tailBox: 3.2, tailBow: 0.1,
    crown: 0.04, flare: 0.045, crease: 0.01, pillars: [[0.66, 0.12]], cPillar: 0.16, flareR: 0.055, creaseSharp: 0.6, peakF: 0.03, hoodDome: 0.015,
    color: '#2f7d3b', spokes: 10, rimRatio: 0.72,
    profile: [[-1, 0.56], [-0.7, 0.68], [0.36, 0.86], [0.64, 1.25], [0.86, 1.26], [1.28, 0.96], [1.85, 0.93], [2, 0.93]],
    belt: [[-0.7, 0.72], [0.5, 0.88], [1.8, 0.95]],
    chr: [[-0.9, 0.6], [0.4, 0.7], [1.9, 0.8]],
    plan: [[-1, 0.78], [0, 0.97], [0.5, 0.94], [1, 1.0], [2, 0.9]],
    cabin: [1, 0.75, 0.73, 1],
    secF: SEC([[0, 0.09], [0.35, 0.03], [0.7, 0.0], [1, 0.012]], [0.5, 0.36]),
    secR: SEC([[0, 0.08], [0.35, 0.02], [0.7, -0.01], [1, 0.0]], [0.5, 0.34]),
    hlSweep: 26, hlRake: 25, grType: 1, spType: 1, exType: 3,
  },
  supercar: {
    wheelR: 0.35, tireW: 0.3, wheelbase: 2.7, track: 1.68, overhangF: 1.02, overhangR: 0.92, width: 2.03,
    clearance: 0.1, chinZ: 0.14, tailBotZ: 0.3, planF: 0.6, planR: 0.3, noseR: 0.08, tailR: 0.01, noseTaper: 2.0, tailTaper: 1.0,
    tailRake: 26, tailCrease: 0.4, tailCreaseR: 0.008, tailTuck: 38, tailBox: 3, tailBow: 0.14,
    squareness: 3.6, crown: 0.03, flare: 0.07, flareR: 0.1, fenderMelt: 2.8, crease: 0.012, ledge: 0.02, peakF: 0.05, peakR: 0.04,
    pillars: [], cPillar: 0.1, cTaper: 0.45, baseRound: 0.65, roofRound: 0.55, wsCrown: 0.12, blCrown: 0.08, glassBulge: 0.03, sideBow: 0.03, cabinR: 0.025, tension: 0.35, creaseSharp: 0.85, ledgeSharp: 0.6, archShape: 0.65, color: '#d0491f', spokes: 7, rimRatio: 0.74, metal: 0.25,
    profile: [[-1, 0.42], [-0.65, 0.62], [0.2, 0.8], [0.46, 1.13], [0.6, 1.14], [1.06, 0.98], [1.8, 0.96], [2, 0.98]],
    belt: [[-0.6, 0.66], [0.3, 0.76], [1.6, 0.96]],
    chr: [[-0.9, 0.42], [0.3, 0.55], [1.9, 0.75]],
    plan: [[-1, 0.72], [0, 0.96], [0.45, 0.9], [1, 1.0], [2, 0.94]],
    cabin: [1, 0.66, 0.62, 1],
    secF: SEC([[0, 0.1], [0.35, 0.05], [0.7, 0.0], [1, 0.03]], [0.5, 0.3]),
    secR: SEC([[0, 0.07], [0.35, 0.04], [0.7, 0.0], [1, 0.0]], [0.5, 0.26]),
    hlType: 3, hlH: 0.85, hlZ: 0.62, hlSweep: 30, hlRake: 35,
    tlType: 1, tlSweep: 25, tlRake: 20, exType: 3, exD: 0.075, exSpread: 0.35, mrType: 2, spType: 1,
  },
  muscle: {
    wheelR: 0.34, tireW: 0.255, wheelbase: 2.75, track: 1.56, overhangF: 1.08, overhangR: 0.98, width: 1.84,
    clearance: 0.14, chinZ: 0.3, tailBotZ: 0.4, planF: 0.32, planR: 0.16, noseR: 0.06, tailR: 0.012, noseTaper: 1.1, tailTaper: 1.0,
    tailRake: 0, tailCrease: 0.28, tailCreaseR: 0.006, tailTuck: 22, tailBox: 7, tailBow: 0.03,
    squareness: 4.5, edgeR: 0.06, cabinR: 0.022, baseRound: 0.45, roofRound: 0.3, crease: 0.014, flare: 0.04, flareR: 0.06, hoodDome: 0.03,
    pillars: [[0.8, 0.3]], cPillar: 0.22, tension: 0.5, creaseSharp: 0.9, ledgeSharp: 0.7, color: '#8f1d1d', spokes: 5, metal: 0.2,
    profile: [[-1, 0.78], [-0.72, 0.86], [0.42, 0.92], [0.62, 1.3], [0.76, 1.31], [1.36, 0.98], [1.9, 0.98], [2, 0.99]],
    belt: [[-0.7, 0.88], [0.5, 0.92], [1.8, 1.0]],
    chr: [[-0.9, 0.78], [0.5, 0.78], [1.9, 0.86]],
    plan: [[-1, 0.92], [0, 0.97], [0.55, 0.95], [1, 1.0], [2, 0.97]],
    cabin: [1, 0.76, 0.74, 1],
    secF: SEC([[0, 0.05], [0.35, 0.03], [0.75, 0.0], [1, 0.01]], [0.5, 0.42]),
    secR: SEC([[0, 0.05], [0.35, 0.02], [0.75, -0.015], [1, 0.0]], [0.5, 0.38]),
    hlType: 1, hlH: 0.62, hlZ: 0.74, hlSweep: 4, hlRake: 0,
    tlType: 1, tlSweep: 3, tlRake: 0, tlZ: 0.7, plateType: 3, grType: 5, hdType: 4, spType: 2, mrType: 3, exD: 0.095,
  },
  wagon: {
    wheelR: 0.34, wheelbase: 2.87, overhangF: 0.92, overhangR: 1.05, width: 1.86, planR: 0.24, tailR: 0.04,
    tailRake: -6, tailCrease: 0.32, tailCreaseR: 0.02, tailTuck: 30, tailBox: 4,
    cPillar: 0.1, pillars: [[0.4, 0], [0.74, 0.08]], pillarFan: 0.3, color: '#6c7178', spokes: 6,
    profile: [[-1, 0.68], [-0.7, 0.8], [0.3, 0.96], [0.58, 1.43], [1.6, 1.41], [1.92, 1.07], [1.97, 1.0], [2, 0.95]],
    belt: [[-0.7, 0.86], [0.6, 0.98], [1.8, 1.05]],
    chr: [[-0.9, 0.72], [0.5, 0.78], [1.9, 0.88]],
    plan: [[-1, 0.85], [0, 0.99], [0.5, 0.98], [1, 1.0], [2, 0.95]],
    cabin: [1, 0.8, 0.8, 1],
    tlType: 3, tlH: 0.6, grType: 3, anType: 2,
  },
  suv: {
    wheelR: 0.38, tireW: 0.255, wheelbase: 2.85, track: 1.64, overhangF: 0.92, overhangR: 1.0, width: 1.94,
    clearance: 0.21, chinZ: 0.38, tailBotZ: 0.5, planF: 0.5, planR: 0.26, noseR: 0.14, tailR: 0.05, noseTaper: 1.3,
    tailRake: -8, tailCrease: 0.3, tailCreaseR: 0.03, tailTuck: 34, tailBox: 4, tailBow: 0.05,
    cabinR: 0.035, crown: 0.03, flare: 0.03, flareR: 0.035, baseRound: 0.45, roofRound: 0.3, sideBow: 0.008, cladding: 0.05, cPillar: 0.12, pillars: [[0.42, 0], [0.76, 0.04]], pillarFan: 0.25, archShape: 0.25, tension: 0.3, color: '#e9e9e6',
    spokes: 6, metal: 0.3, hoodDome: 0.015,
    profile: [[-1, 0.88], [-0.62, 1.03], [0.3, 1.16], [0.62, 1.69], [1.55, 1.67], [1.9, 1.2], [1.97, 1.13], [2, 1.06]],
    belt: [[-0.6, 1.05], [0.6, 1.12], [1.8, 1.18]],
    chr: [[-0.9, 0.88], [0.5, 0.92], [1.9, 1.0]],
    plan: [[-1, 0.88], [0, 0.99], [0.5, 0.98], [1, 1.0], [2, 0.95]],
    cabin: [1, 0.86, 0.85, 1],
    secF: SEC([[0, 0.05], [0.35, 0.01], [0.7, 0.0], [1, 0.006]], [0.5, 0.44]),
    secR: SEC([[0, 0.05], [0.35, 0.01], [0.7, 0.0], [1, 0.006]], [0.5, 0.44]),
    hlSize: 1.1, hlSweep: 22, grType: 2, anType: 1, spType: 5, plateType: 5,
  },
  offroad: {
    fdType: 1, fdWidth: 0.11, fdOut: 0.045,
    wheelR: 0.4, tireW: 0.28, rimRatio: 0.52, spokes: 6, wheelbase: 2.5, track: 1.62, archGap: 0.06,
    overhangF: 0.72, overhangR: 0.78, width: 1.9, clearance: 0.3, chinZ: 0.52, tailBotZ: 0.52,
    planF: 0.2, planR: 0.12, noseR: 0.06, tailR: 0.02, noseTaper: 1.0, tailTaper: 1.0,
    tailRake: 0, tailCrease: 0.3, tailCreaseR: 0.004, tailTuck: 10, tailBox: 9, tailBow: 0, squareness: 6, edgeR: 0.05, cabinR: 0.018, bottomR: 0.05, baseRound: 0.18, roofRound: 0.12, wsCrown: 0.01, blCrown: 0, glassBulge: 0, sideBow: 0, roofCrown: 0.008, roofArch: 0,
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
    tlType: 3, tlSweep: 0, tlRake: 0, tlH: 0.55, tlZ: 0.74, tlSize: 0.9, grType: 4, anType: 3, mrType: 3, exType: 1,
  },
  rally: {
    wheelR: 0.33, tireW: 0.25, wheelbase: 2.5, track: 1.62, overhangF: 0.8, overhangR: 0.6, width: 1.88,
    clearance: 0.17, chinZ: 0.24, tailBotZ: 0.4, planF: 0.4, planR: 0.22, noseR: 0.1, tailR: 0.03,
    tailRake: 8, tailCrease: 0.36, tailCreaseR: 0.015, tailTuck: 30, tailBox: 3.5,
    flare: 0.1, flareR: 0.1, fenderMelt: 2.0, archLip: 0.02, cabinR: 0.03, crease: 0.012, pillars: [[0.48, 0]], peakF: 0.02, cPillar: 0.3,
    contrastRoof: 1, color: '#e3e4e2', spokes: 10, rimRatio: 0.62, metal: 0.1, rough: 0.28,
    profile: [[-1, 0.66], [-0.6, 0.8], [0.27, 0.97], [0.6, 1.42], [1.1, 1.42], [1.78, 1.04], [1.94, 1.0], [2, 0.93]],
    belt: [[-0.6, 0.86], [0.6, 0.98], [1.8, 1.08]],
    chr: [[-0.9, 0.62], [0.5, 0.7], [1.9, 0.82]],
    plan: [[-1, 0.8], [0, 1.0], [0.5, 0.92], [1, 1.0], [2, 0.9]],
    cabin: [1, 0.72, 0.72, 1],
    spType: 3, hdType: 3, mrType: 2, exType: 1, plateType: 4,
  },
  wedge: {
    wheelR: 0.34, tireW: 0.29, rimRatio: 0.7, spokes: 5, wheelbase: 2.5, track: 1.6, archGap: 0.05,
    overhangF: 1.05, overhangR: 0.78, width: 1.98, clearance: 0.11, chinZ: 0.16, tailBotZ: 0.32,
    planF: 0.22, planR: 0.14, noseR: 0.03, tailR: 0.006, noseTaper: 1.4, tailTaper: 1.0,
    tailRake: 20, tailCrease: 0.3, tailCreaseR: 0.004, tailTuck: 25, tailBox: 8, tailBow: 0,
    squareness: 7, edgeR: 0.018, cabinR: 0.012, bottomR: 0.03, crown: 0.0, softness: 0.008, tension: 1,
    baseRound: 0.2, roofRound: 0.15, wsCrown: 0.02, blCrown: 0.01, glassBulge: 0, sideBow: 0, roofCrown: 0.006, roofArch: 0,
    crease: 0.014, creaseSharp: 1, flare: 0.0, flareR: 0.0, archLip: 0.0, archShape: 1, ledge: 0.028, ledgeSharp: 1, ridge: 0.025,
    hoodDome: 0, peakF: 0, peakR: 0, pillars: [[0.72, 0.35]], aPillar: 0.07, cPillar: 0.08, cTaper: 0.5,
    color: '#d9a51a', metal: 0.2, rough: 0.3,
    profile: [[-1, 0.5], [-0.9, 0.56], [0.1, 0.78], [0.42, 1.08], [0.62, 1.09], [1.15, 0.9], [1.85, 0.9], [2, 0.86]],
    belt: [[-0.8, 0.6], [0.3, 0.76], [1.8, 0.86]],
    chr: [[-0.95, 0.45], [0.4, 0.58], [1.95, 0.72]],
    plan: [[-1, 0.82], [0, 0.97], [0.5, 0.95], [1, 1.0], [2, 0.98]],
    cabin: [1, 0.68, 0.66, 1],
    secF: SEC([[0, 0.08], [0.35, 0.05], [0.7, 0.0], [1, 0.0]], [0.5, 0.5]),
    secR: SEC([[0, 0.07], [0.35, 0.04], [0.7, 0.0], [1, 0.0]], [0.5, 0.5]),
    hlType: 3, hlH: 0.85, hlSweep: 15, hlRake: 40,
    tlSweep: 10, tlRake: 25, mrType: 2, spType: 4, exType: 2, exSpread: 0.3,
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

// archH(u): arch height fraction at |dx| = u * Ra. shape 0 = a true circle, 1 = three straight lines (flat top, two
// slanted flanks); nothing in between, a blend of the two reads as a lumpy, accidental arch
export const archH = (u, shape) => (shape >= 0.5 ? Math.min(1, (1 - u) * 2.2) : Math.sqrt(Math.max(0, 1 - u * u)));

function blur(a, sigma) {
  const r = Math.ceil(sigma * 3); if (r < 1) return a;
  const k = []; let ks = 0;
  for (let i = -r; i <= r; i++) { const w = Math.exp(-(i * i) / (2 * sigma * sigma)); k.push(w); ks += w; }
  const out = new Float64Array(a.length), n = a.length;
  for (let j = 0; j < n; j++) { let s = 0; for (let i = -r; i <= r; i++) s += a[clamp(j + i, 0, n - 1)] * k[i + r]; out[j] = s / ks; }
  return out;
}

// fender rise across the top: part of it lifts the whole hood, the rest ramps in smoothly toward the shoulder (a ramp
// over only the outer part of the hood read as a ridge pinched up along the fender line, with a valley between)
const riseLat = (u) => 0.4 + 0.6 * u * u * (3 - 2 * u);
// steepest slope of a smootherstep hill 1 - S((d / hw)^2), times its half width
const HILL_SLOPE = 2.73;

// arch flank roll as a fraction of the section's bottom radius: the lip rolls as softly down the flanks as over the top
const ARCH_ROLL = 0.6;

// open polyline [[x, z, r]] with every inner corner filleted by r (circular arcs, densely sampled); out.corners[i] is
// the [first, last] output index of inner point i's arc
function filletOpen(pts, seg = 20) {
  const out = [pts[0].slice(0, 2)];
  out.corners = [];
  for (let i = 1; i < pts.length - 1; i++) {
    out.corners[i] = [out.length, out.length];
    const [px, py, r = 0] = pts[i], [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
    const la = Math.hypot(ax - px, ay - py), lb = Math.hypot(bx - px, by - py);
    const u = [(ax - px) / (la || 1), (ay - py) / (la || 1)], v = [(bx - px) / (lb || 1), (by - py) / (lb || 1)];
    const th = Math.acos(clamp(u[0] * v[0] + u[1] * v[1], -1, 1));
    if (r <= 0 || la < 1e-6 || lb < 1e-6 || th > Math.PI - 1e-3 || th < 1e-3) { out.push([px, py]); continue; }
    out.corners[i][1] += seg;
    const d = Math.min(r / Math.tan(th / 2), 0.48 * la, 0.48 * lb), rr = d * Math.tan(th / 2);
    const bis = [u[0] + v[0], u[1] + v[1]], bl = Math.hypot(...bis), cd = rr / Math.sin(th / 2);
    const c = [px + (bis[0] / bl) * cd, py + (bis[1] / bl) * cd];
    const a1 = Math.atan2(py + u[1] * d - c[1], px + u[0] * d - c[0]);
    let da = Math.atan2(py + v[1] * d - c[1], px + v[0] * d - c[0]) - a1;
    if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= seg; k++) { const a = a1 + (da * k) / seg; out.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]); }
  }
  out.push(pts[pts.length - 1].slice(0, 2));
  return out;
}

// Tail: the rear end as an engineered side profile at the centre line instead of a vertical cut rolled over at the top.
// Deck -> lip edge (tailR) -> upper face (tailRake: positive undercuts the lip) -> crease (tailCreaseR) -> lower face
// (tailTuck) -> floor, every corner its own fillet. (A bumper standing proud of the face is a part: see kit.js.) Kept unimodal in x (one rearmost point), so every station
// is one closed section: its top and bottom come from the filleted profile, and each height gets its own plan slice
// (tailCap) whose rear end follows the sharp face line. Returns the profile shifted so its rearmost point is at xR.
export const TAIL_MIN_GAP = 0.08;
function tailProfile(P, { xR, wb, Ra, xBack, topAt, botAt }) {
  const zLip = topAt(xR), zTk = Math.min(botAt(xR), zLip - 0.1);
  // a face leaning out by a few degrees reads as vertical, and a near-vertical face that is not the rearmost cannot be
  // cut into stations cleanly: it snaps to vertical
  const rake = P.tailRake < 0 && P.tailRake > -6 ? 0 : P.tailRake;
  const zC = lerp(zTk, zLip, clamp(P.tailCrease, 0.1, 0.9)), tu = Math.tan((rake * Math.PI) / 180), tl = Math.tan((P.tailTuck * Math.PI) / 180);
  // the face may not recede past the rear arch
  const minX = -(xR - (wb + Ra + TAIL_MIN_GAP)), cx = (x) => Math.max(x, minX);
  const L = [0, zLip, P.tailR], A = [cx(-(zLip - zC) * tu), zC, P.tailCreaseR];
  const face = [L, A, [cx(A[0] - (zC - zTk) * tl), zTk, Math.min(P.bottomR, 0.08)]];
  // unimodal: moving away from the rearmost vertex, x never grows again
  let pk = 0; face.forEach((p, i) => { if (p[0] > face[pk][0]) pk = i; });
  for (let i = pk - 1; i >= 0; i--) face[i][0] = Math.min(face[i][0], face[i + 1][0]);
  for (let i = pk + 1; i < face.length; i++) face[i][0] = Math.min(face[i][0], face[i - 1][0]);
  const T = face[face.length - 1];
  const Ld = clamp(0.5 * (xR + face[0][0] - xBack), 0.03, 0.35), Lf = clamp(0.5 * (xR + T[0] - wb - Ra), 0.03, 0.3);
  // the reference points sit where the deck / floor really are: read them at their final x (the face's rearmost vertex
  // lands on xR; the fillets move it by millimetres only)
  const s0 = xR - Math.max(...face.map((p) => p[0]));
  const deck = [face[0][0] - Ld, topAt(face[0][0] - Ld + s0)], floor = [T[0] - Lf, Math.min(botAt(T[0] - Lf + s0), zTk - 0.005)];
  const dense = filletOpen([deck, ...face, floor]);
  const shift = xR - Math.max(...dense.map((p) => p[0]));
  for (const p of dense) p[0] += shift;
  const sharp = face.map(([x, z]) => [x + shift, z]);
  // crossings of the vertical line at x with the profile: [lowest, highest] z, or null past its end
  const span = (x) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < dense.length - 1; i++) {
      const [ax, az] = dense[i], [bx, bz] = dense[i + 1];
      if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
      const z = lerp(az, bz, (x - ax) / (bx - ax));
      lo = Math.min(lo, z); hi = Math.max(hi, z);
    }
    return hi >= lo ? [lo, hi] : null;
  };
  // the face's rearmost x at height z: the filleted profile between the rearmost points of the lip and tuck rolls, held
  // constant above / below them. Plan slices end on the face, so the face is rounded in plan by the slices; the two rolls
  // run straight across (rounded only by the station top / bottom), so no section ever pinches to a point at its edge
  const peak = ([a, b]) => { let k = a; for (let q = a; q <= b; q++) if (dense[q][0] > dense[k][0]) k = q; return k; };
  const fc = dense.slice(peak(dense.corners[1]), peak(dense.corners[face.length]) + 1), fz0 = Math.min(...fc.map((p) => p[1])), fz1 = Math.max(...fc.map((p) => p[1])), NZ = 256;
  const table = Float64Array.from({ length: NZ }, (_, k) => {
    const z = lerp(fz0, fz1, k / (NZ - 1));
    let best = -Infinity;
    for (let i = 0; i < fc.length - 1; i++) {
      const [ax, az] = fc[i], [bx, bz] = fc[i + 1];
      if ((az - z) * (bz - z) > 0) continue;
      best = Math.max(best, az === bz ? Math.max(ax, bx) : lerp(ax, bx, (z - az) / (bz - az)));
    }
    return best;
  });
  for (let k = 1; k < NZ; k++) if (table[k] === -Infinity) table[k] = table[k - 1];
  for (let k = NZ - 2; k >= 0; k--) if (table[k] === -Infinity) table[k] = table[k + 1];
  const xRef = (z) => { const f = clamp((z - fz0) / Math.max(fz1 - fz0, 1e-9), 0, 1) * (NZ - 1), k = Math.min(Math.floor(f), NZ - 2); return lerp(table[k], table[k + 1], f - k); };
  return { dense, sharp, span, xRef, xTop: deck[0] + shift, xBot: floor[0] + shift, zLip, zTk };
}
// plan slice of the tail at one height: half-width fraction at distance d ahead of the face line. The outline is a
// bowed face (depth `bow` at the corners) running into a superellipse corner of size D, exponent m (2 = round, 10 = box)
function tailCap(d, D, m, bow) {
  if (d <= 0) return 0;
  if (d >= D + bow) return 1;
  let lo = 0, hi = 1;
  for (let k = 0; k < 18; k++) { const u = (lo + hi) / 2; if (se((d - bow * u * u) / D, m) > u) lo = u; else hi = u; }
  return (lo + hi) / 2;
}

export const PLAN_MIN = 0.72, ROOF_MIN = 0.5;
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
  for (const p of P.plan) p[1] = clamp(p[1], PLAN_MIN, 1.15);
  P.fenderMelt = clamp(P.fenderMelt, 1.2, 2.8);
  P.archShape = P.archShape >= 0.5 ? 1 : 0;
  // the roof is never shorter than the wedge's (0.5 m): a shorter one pinches the greenhouse into artifacts. It grows
  // rearward into the backlight, then forward if the backlight has no room left
  const sx = (i) => sToX(P, pr[i][0]);
  if (sx(4) - sx(3) < ROOF_MIN) {
    pr[4][0] = Math.min(xToS(P, sx(3) + ROOF_MIN), pr[5][0] - 0.03);
    if (sx(4) - sx(3) < ROOF_MIN) pr[3][0] = Math.max(xToS(P, sx(4) - ROOF_MIN), pr[2][0] + 0.03);
  }
  P.cabin = P.cabin.map((c) => clamp(c, 0.3, 1));
  for (const sec of [P.secF, P.secR]) {
    const b = sec.body;
    b[0][0] = 0; b[b.length - 1][0] = 1;
    fix(b, 0, 1, 0.08);
    for (const p of b) p[1] = clamp(p[1], -0.06, 0.25);
    sec.glass = [clamp(sec.glass[0], 0.15, 0.85), clamp(sec.glass[1], 0.05, 0.95)];
  }
  P.aPillar = Math.max(P.aPillar, MIN_A); P.pillarW = Math.max(P.pillarW, MIN_PILLAR); P.cPillar = Math.max(P.cPillar, MIN_C);
  P.hlType = clamp(Math.round(P.hlType), 0, 7);
  P.hlSweep = clamp(P.hlSweep, -10, 40); P.hlRake = clamp(P.hlRake, -10, 35); P.hlAngle = clamp(P.hlAngle, -30, 30);
  P.tlType = clamp(Math.round(P.tlType), 0, 7);
  P.tlSweep = clamp(P.tlSweep, -10, 40); P.tlRake = clamp(P.tlRake, -10, 35); P.tlAngle = clamp(P.tlAngle, -30, 30);
  P.tailRake = clamp(P.tailRake ?? 0, -30, 45); P.tailCrease = clamp(P.tailCrease ?? 0.45, 0.1, 0.9); P.tailCreaseR = clamp(P.tailCreaseR ?? 0.02, 0.002, 0.15);
  P.tailTuck = clamp(P.tailTuck ?? 25, 0, 65); P.tailBox = clamp(P.tailBox ?? 2.6, 2, 12); P.tailBow = clamp(P.tailBow ?? 0, 0, 0.3);
  P.tailR = clamp(P.tailR, 0.004, 0.4);
  P.fdType = clamp(Math.round(P.fdType ?? 0), 0, 3);
  P.fdWidth = clamp(P.fdWidth ?? 0.1, 0.04, 0.3); P.fdOut = clamp(P.fdOut ?? 0.04, 0.01, 0.15); P.fdLip = clamp(P.fdLip ?? 0.012, 0, 0.05); P.fdWrap = clamp(P.fdWrap ?? 0.6, 0, 1);
  P.fdBlend = clamp(P.fdBlend ?? 0.035, 0.01, 0.15);
  for (const k of ['kitF', 'kitS', 'kitR']) P[k] = clamp(Math.round(P[k] ?? 0), 0, 5);
  P.rimType = clamp(Math.round(P.rimType ?? 0), 0, 4); P.rfType = clamp(Math.round(P.rfType ?? 0), 0, 3);
  P.rfLen = clamp(P.rfLen ?? 0.8, 0.4, 1); P.rfWidth = clamp(P.rfWidth ?? 0.85, 0.5, 1); P.rfH = clamp(P.rfH ?? 0.07, 0.04, 0.16);
  P.kitH = clamp(P.kitH ?? 0.1, 0.05, 0.25); P.kitDrop = clamp(P.kitDrop ?? 0.02, 0, 0.08); P.kitOut = clamp(P.kitOut ?? 1, 0.5, 2); P.kitBlend = clamp(P.kitBlend ?? 0.03, 0.01, 0.1);
  P.plateType = clamp(Math.round(P.plateType ?? 0), 0, 5); P.plateH = clamp(P.plateH ?? 0.3, 0, 1); P.plateNo = clamp(Math.round(P.plateNo ?? 0), 0, 9999);
  P.exType = clamp(Math.round(P.exType ?? 0), 0, 3); P.exD = clamp(P.exD ?? 0.085, 0.05, 0.13); P.exOut = clamp(P.exOut ?? 0.02, 0, 0.08); P.exSpread = clamp(P.exSpread ?? 0.55, 0.2, 0.85);
  P.spType = clamp(Math.round(P.spType ?? 0), 0, 5); P.spSize = clamp(P.spSize ?? 1, 0.6, 1.5); P.spH = clamp(P.spH ?? 0.16, 0.06, 0.3);
  P.mrType = clamp(Math.round(P.mrType ?? 0), 0, 3); P.mrSize = clamp(P.mrSize ?? 1, 0.7, 1.4);
  P.anType = clamp(Math.round(P.anType ?? 0), 0, 4); P.anLen = clamp(P.anLen ?? 0.6, 0.25, 1);
  P.grType = clamp(Math.round(P.grType ?? 0), 0, 5); P.grSize = clamp(P.grSize ?? 1, 0.6, 1.4); P.grH = clamp(P.grH ?? 0.5, 0, 1);
  P.hdType = clamp(Math.round(P.hdType ?? 0), 0, 4); P.hdSize = clamp(P.hdSize ?? 1, 0.6, 1.4);
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

  // tail: top and bottom lines from the engineered rear profile; nose: rounded top / bottom edges in side view
  const tail = tailProfile(P, { xR, wb, Ra, xBack: xC, topAt: (x) => top[ix(x)], botAt: (x) => bot[ix(x)] });
  const tailD = (z) => P.planR * lerp(1, P.tailTaper, clamp((z - tail.zTk) / Math.max(tail.zLip - tail.zTk, 0.05), 0, 1));
  // a face dead flat in plan cannot be sliced into stations (every slice near the tip is full width): 15 mm of bow minimum
  const bowT = Math.max(P.tailBow, 0.015), capR = (x, z) => tailCap(tail.xRef(z) - x, tailD(z), P.tailBox, bowT);
  const zMid = (tail.zLip + tail.zTk) / 2, xTail = Math.min(tail.xTop, tail.xBot);
  // how far ahead of xR the plan slices can still narrow the body
  const tailReach = xR - Math.min(...tail.sharp.map((p) => p[0])) + P.planR * Math.max(1, P.tailTaper) + Math.max(P.tailBow, 0.015) + 1e-3;
  const plan = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const df = X[j] - xF, rbF = P.noseR * 0.6;
    plan[j] = se(df / P.planF, 2.6) * capR(X[j], zMid) * planW[j];
    top[j] -= P.noseR * (1 - se(df / P.noseR, 2.4));
    bot[j] += rbF * (1 - se(df / rbF, 2.4));
    const s = X[j] >= xTail ? tail.span(Math.min(X[j], xR - 1e-9)) : null;
    if (s && X[j] >= tail.xTop) top[j] = s[1];
    if (s && X[j] >= tail.xBot) bot[j] = s[0];
    if (X[j] < xTail && top[j] < bot[j] + 0.12) { const m = (top[j] + bot[j]) / 2; top[j] = m + 0.06; bot[j] = m - 0.06; }
  }

  // where a station's top / bottom lies on the tail face (not on the deck or the floor), the shoulder / sill radius is
  // meaningless: the section edge there is the face itself, and a corner fillet would fold the face along a crease
  const xLipEnd = tail.sharp[0][0] - 2 * P.tailR;
  const kTop = blur(Float64Array.from(X, (x, j) => (x < xLipEnd ? 1 : 1 - sstep(0.005, 0.04, tail.zLip - top[j]))), 0.01 / dx);
  const kBot = blur(Float64Array.from(X, (x, j) => (x < tail.xBot ? 1 : 1 - sstep(0.005, 0.04, bot[j] - tail.zTk))), 0.01 / dx);

  // wheel arch cut line, automatic fender rise where the arch would poke through, plus designed fender peaks
  const arch = new Float64Array(M), need = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    let a = -1;
    for (const xw of wheels) { const d = Math.abs(X[j] - xw); if (d < Ra) a = Math.max(a, R + Ra * archH(d / Ra, P.archShape)); }
    arch[j] = a;
    need[j] = a > 0 ? Math.max(0, a + 0.03 - (top[j] - P.crown - P.edgeR * 0.5)) : 0;
  }
  // the rise is the upper envelope of smooth hills, one per sample that needs height: a round, G2 fender crown. Each
  // hill is as wide as its height demands, so the climb never exceeds RISE_SLOPE: a tall lift spreads over the hood and
  // cowl instead of being pinched up over the wheel
  const RISE_SLOPE = 0.5, rise = new Float64Array(M), hw0 = (0.22 + 0.12 * P.fenderMelt) / dx;
  // ...except toward the cabin: a hill never reaches past the windshield base (front wheels) or the deck start (rear),
  // where lifting the deck would bend the pillars standing on it
  const xMidCab = (xA + xC) / 2;
  for (let j = 0; j < M; j++) if (need[j] > 0) {
    const hw = Math.max(hw0, (HILL_SLOPE * need[j]) / RISE_SLOPE / dx);
    const front = X[j] < xMidCab, hwB = front ? hw : Math.min(hw, Math.max(0.1 / dx, (X[j] - xC) / dx)), hwA = front ? Math.min(hw, Math.max(0.1 / dx, (xA - X[j]) / dx)) : hw;
    for (let i = Math.max(0, Math.floor(j - hwB)); i <= Math.min(M - 1, Math.ceil(j + hwA)); i++) {
      const e = ((i - j) / (i < j ? hwB : hwA)) ** 2;
      if (e < 1) rise[i] = Math.max(rise[i], need[j] * (1 - e * e * e * (e * (6 * e - 15) + 10)));
    }
  }
  // designed fender peaks: the same kind of hill, centred on each wheel (a hood-length window ended in a fold at the
  // windshield base and another at the nose), never reaching past the
  // windshield base (rear wheels: deck start), like the automatic hills
  const hwP = Ra * (1.6 + 0.5 * P.fenderMelt), hill = (d, back, fwd) => { const e = (d / (d < 0 ? back : fwd)) ** 2; return e >= 1 ? 0 : 1 - e * e * e * (e * (6 * e - 15) + 10); };
  const hpF = Math.min(hwP, Math.max(0.3, xA)), hpR = Math.min(hwP, Math.max(0.3, wb - xC));
  for (let j = 0; j < M; j++) {
    const off = 1 - sstep(xA - 0.25, xA, X[j]) * (1 - sstep(xC, xC + 0.25, X[j])); // nothing under the glass house
    rise[j] += off * (P.peakF * hill(X[j], hwP, hpF) + P.peakR * hill(X[j] - wb, hpR, hwP));
  }
  // wide hills would reach the nose / tail tip, where the end rounding collapses the section: fade out over the ends
  for (let j = 0; j < M; j++) rise[j] *= sstep(0, 0.06, X[j] - xF) * sstep(0, 0.06, xR - X[j]);
  // the arch lifts the section floor, so over the top its edge rolls with the section's bottom radius; on the steep
  // flanks only an x-blur of the lift can roll it, otherwise the lip turns into a crisp vertical edge (a streak in reflections)
  const cut = blur(Float64Array.from(bot, (b, j) => Math.max(0, arch[j] - b)), ARCH_ROLL * Math.max(P.bottomR, 0.03) / dx).map((l, j) => bot[j] + l);
  // a widely blurred floor line: features that would run into an arch (the character crease) taper out ahead of it and
  // come back after it, instead of tracing the arch edge down its slopes row by row (a staircase in reflections)
  const cutWide = blur(cut, 0.1 / dx);
  // the same line dilated before blurring: never below the real cut, and smooth, so features above an arch fade out
  // gradually ahead of and behind it (the sharp cut switched them off at the arch flank: a vertical seam down the side)
  const cutSoft = (() => { const r = Math.round(0.12 / dx), d = Float64Array.from(cut, (_, j) => { let m = -Infinity; for (let i = Math.max(0, j - r); i <= Math.min(M - 1, j + r); i++) m = Math.max(m, cut[i]); return m; }); return blur(d, 0.08 / dx); })();
  // corner budget: over an arch the side may be shorter than the shoulder radius plus the arch roll. Rather than slice
  // the arch top flat (a rectangular arch, and a side wall collapsed to nothing, which crumples everything sitting on
  // it), both radii shrink there, smoothly along x, leaving at least SIDE_MIN of real side wall
  const SIDE_MIN = 0.03;
  const cornerK = blur(Float64Array.from(X, (_, j) => {
    const zsj = top[j] + rise[j] - P.crown - P.ridge * (hoodWin[j] + deckWin[j]), hj = Math.max(zsj - bot[j], 0.05);
    const want = Math.min(P.edgeR, 0.35 * hj) + Math.min(P.bottomR, 0.25 * hj);
    return clamp((zsj - cut[j] - SIDE_MIN) / Math.max(want, 1e-4), 0.12, 1);
  }).map((v, j, a) => { const r = Math.round(0.15 / dx); let m = v; for (let i = Math.max(0, j - r); i <= Math.min(M - 1, j + r); i++) m = Math.min(m, a[i]); return m; }), 0.15 / dx);

  // feature fades along the car: the ledge and the character crease only exist where the side has room for them. The
  // room is measured per x, turned into a 0..1 amount, then blurred widely, so a feature eases in over a few decimetres
  // ahead of / behind an arch (switching it per station formed a fold where the arch ended). Rows snap onto a feature
  // well before it is visible (snapK), so a feature never falls between two rows
  // (eroded before the blur: the eased amount never exceeds the room actually there, so a feature is never pushed into a
  // spot where its rows cannot follow it)
  const erode = (a, rad) => { const r = Math.round(rad / dx); return Float64Array.from(a, (_, j) => { let m = Infinity; for (let i = Math.max(0, j - r); i <= Math.min(M - 1, j + r); i++) m = Math.min(m, a[i]); return m; }); };
  const fadeK = (lineArr, lo, hi) => blur(erode(Float64Array.from(X, (_, j) => {
    const zsj = top[j] + rise[j] - P.crown - P.ridge * (hoodWin[j] + deckWin[j]), hj = Math.max(zsj - bot[j], 0.05);
    const rt = Math.min(P.edgeR, 0.35 * hj) * cornerK[j], rb = Math.min(P.bottomR, 0.25 * hj) * cornerK[j], fl = Math.max(cut[j], cutSoft[j]) + rb;
    return sstep(lo, hi, Math.min(zsj - rt - lineArr[j], lineArr[j] - fl));
  }), 0.24), 0.08 / dx);
  const ledgeK = fadeK(belt, 0.03, 0.1), creaseK = fadeK(chr, 0.02, 0.08);
  const snapK = (k) => sstep(0, 0.25, k);

  // fender volume: a band that follows the arch (round or angular), pushing the side out by the bulge amount right at the
  // lip and fading radially outward over fD (set by fenderMelt), flat at the lip and curvature-continuous where it ends.
  // An ellipsoid centred over the wheel ignored the arch: its rim cut across the shoulder as a ridge and its fore/aft
  // falloff left dents ahead of the arch
  const tyreOut = P.track / 2 + P.tireW / 2 + 0.015;
  // one bulge amount per wheel, measured at the wheel: away from it the bulge only fades (measured against the local plan
  // width it grew wherever the nose or tail tapered, a hump fighting the taper with a dent behind it)
  const fenderAmt = wheels.map((xw, i) => { const wp = W0 * planW[clamp(Math.round((xw - xF) / dx), 0, M - 1)]; return Math.max(wp, tyreOut) - wp + (i ? P.flareR : P.flare); });
  // falloff width per wheel: fenderMelt sets it, but never narrower than 3.5x the bulge, so the flank never slopes more
  // than about 0.55 (a big bulge on a short falloff read as a pinched, near-vertical wall round the arch)
  const fD = fenderAmt.map((a) => Math.max(Ra * (P.fenderMelt - 0.8) * 0.5, 0.5 * Ra, 3.5 * a));
  // curvature-continuous at its rim (value, slope and curvature reach zero together): no kinked reflections where it ends
  const melt = (e) => (e <= 0 ? 1 : e >= 1 ? 0 : 1 - e * e * e * (e * (6 * e - 15) + 10));
  // how far (dx, dz) from the wheel centre lies outside the arch, as a smooth superellipse metric: a circle for round
  // arches, a squared ring with rounded corners for angular ones (an exact distance to the angular outline creases at its
  // corners, and those creases showed as ridges on the fender). Below the centre the arch drops vertically
  const pE = P.archShape < 0.5 ? 2 : 4;
  const archOut = (ddx, ddz) => {
    const ax = Math.abs(ddx) / Ra, az = Math.max(ddz, 0) / Ra;
    return Ra * ((ax ** pE + az ** pE) ** (1 / pE) - 1);
  };
  const fenderAt = (wi, ddx, z) => fenderAmt[wi] * melt(archOut(ddx, z - R) / fD[wi]);

  // station placement: equal steps of an importance length so steep features get dense rings
  // (the fender bulge counts too: a big flare changes the side width fast and was sampled into a staircase)
  // the band fades over a different x range at each height (it hugs the arch), so its x profile is taken at several
  const bulgeAt = (z) => Float64Array.from(X, (x) => wheels.reduce((m, xw, wi) => Math.max(m, fenderAt(wi, x - xw, z)), 0));
  const bulges = [R - 0.6 * Ra, R, R + 0.6 * Ra, R + Ra].map(bulgeAt);
  const cum = new Float64Array(M);
  // capped density: the plan rounding has a vertical tangent at the nose and tail tips, which would otherwise pile
  // stations into a fraction of a millimetre there (degenerate quads, flipping normals)
  // crisp edges (the tail lip, tuck and creases) also need stations by how far the side profile turns, not only by how
  // far it climbs: a 2 cm lip turning 90 degrees otherwise got two or three stations and read as facets
  const turn = (a, j) => (j < 1 || j > M - 2 ? 0 : Math.abs(Math.atan2(a[j + 1] - a[j], dx) - Math.atan2(a[j] - a[j - 1], dx)));
  // the tail face is sliced nearly edge-on: a section there widens like the square root of the distance past the face, at
  // whatever height the face is. Stations follow the fastest widening over the face's height (its own, higher cap)
  const tailZ = Array.from({ length: 10 }, (_, k) => lerp(tail.zTk, tail.zLip, (k + 0.5) / 10));
  const capPrev = tailZ.map(() => 1);
  for (let j = 1; j < M; j++) {
    let wide = 0;
    if (xR - X[j] < tailReach) tailZ.forEach((z, k) => { const c = capR(X[j], z); wide = Math.max(wide, Math.abs(c - capPrev[k])); capPrev[k] = c; });
    const featT = Math.min(W0 * wide, 100 * dx), feat = 2.5 * Math.abs(cut[j] - cut[j - 1]) + Math.abs(top[j] - top[j - 1]) + 0.2 * (turn(top, j) + turn(bot, j))
      + 2 * W0 * Math.abs(plan[j] - plan[j - 1]) + Math.abs(rise[j] - rise[j - 1]) + 4 * bulges.reduce((m, bz) => Math.max(m, Math.abs(bz[j] - bz[j - 1])), 0);
    cum[j] = cum[j - 1] + dx + featT + Math.min(feat, 30 * dx);
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

  // station positions: equal importance steps up to the tail tip zone, then KT stations closing quadratically on the tip.
  // The face near its rearmost point widens like the square root of the distance, so quadratic steps add equal width
  const KT = lod(detail, 2, 6), ET = Math.min(0.006, 0.25 * P.overhangR), cutAt = (x) => { const g = clamp((x - xF) / dx, 0, M - 1), q = Math.min(Math.floor(g), M - 2); return lerp(cum[q], cum[q + 1], g - q); };
  const stX = [];
  for (let i = 0, q = 0, cE = cutAt(xR - ET); i < N - KT; i++) {
    const target = (cE * i) / (N - KT - 1);
    while (q < M - 2 && cum[q + 1] < target) q++;
    stX.push(at(X, q, cum[q + 1] > cum[q] ? clamp((target - cum[q]) / (cum[q + 1] - cum[q]), 0, 1) : 0));
  }
  for (let k = 1; k <= KT; k++) stX.push(xR - ET * (1 - k / KT) ** 2);
  for (let i = 0; i < N; i++) {
    const g = clamp((stX[i] - xF) / dx, 0, M - 1), j = Math.min(Math.floor(g), M - 2), f = g - j;
    const x = stX[i];
    let zc = at(top, j, f), zr = at(bot, j, f);
    const zbelt = at(belt, j, f), zchr = at(chr, j, f), ri = at(rise, j, f);
    const Wp = W0 * at(planW, j, f), dome = P.hoodDome * at(hoodWin, j, f);
    const ridge = P.ridge * (at(hoodWin, j, f) + at(deckWin, j, f));
    let zb = at(cut, j, f);
    // on the tail the top / bottom come straight from the profile (the fine grid is too coarse at the tip)
    const sp = x >= xTail ? tail.span(Math.min(x, xR - 1e-9)) : null;
    if (sp && x >= tail.xTop) zc = sp[1];
    if (sp && x >= tail.xBot) { zb += sp[0] - zr; zr = sp[0]; }
    // near the tail tip a section shrinks to nothing: the crown and ridge are lateral shapes, so they shrink with the
    // section's width, and no absolute minimum height applies (the tip sections stay scaled copies of each other)
    const inTail = xR - x < tailReach, cw = inTail ? capR(x, zc) : 1, crownE = P.crown * cw * cw, ridgeE = ridge * cw;
    const zs = zc + ri - crownE - ridgeE;
    const h = inTail ? Math.max(zs - zr, 1e-4) : Math.max(zs - zr, 0.05);
    // over the tail face a section's top / bottom corner is the lip / tuck edge seen end-on (already rounded in side
    // view), not the shoulder / sill: the radius blends from the body's to the tail's as the plan slice narrows
    const kC = at(cornerK, j, f), sm = (c) => c * c * (3 - 2 * c);
    const cT = inTail ? sm(capR(x, zs)) : 1, cB = inTail ? sm(capR(x, zr + 0.02)) : 1;
    const rt = lerp(Math.min(P.tailR, P.edgeR), Math.min(P.edgeR, 0.35 * h), cT) * kC * at(kTop, j, f);
    const rb = lerp(Math.min(P.bottomR, 0.08, 0.25 * h), Math.min(P.bottomR, 0.25 * h), cB) * kC * at(kBot, j, f);
    zb = Math.min(zb, zs - rt - rb - (inTail ? 0 : 0.005));

    const fr = sstep(xSecF, xSecR, x);
    const spanB = Math.max(zbelt - zr, 0.1);
    // a feature grows only as fast as its rows snap onto it, so rows never sweep across a visible step or bead
    const kL = at(ledgeK, j, f), kCr = at(creaseK, j, f), ledge = P.ledge * kL * snapK(kL);
    const crease = P.crease * kCr * snapK(kCr);
    const ins = (t) => lerp(bodyF(t), bodyR(t), fr);
    const dF = x - xF, dR = xR - x;
    const extras = (z) => {
      const dc = Math.abs(z - zchr);
      let w = crease * lerp(Math.exp(-((dc / 0.025) ** 2)), Math.max(0, 1 - dc / 0.03), P.creaseSharp);
      for (let wi = 0; wi < 2; wi++) w += fenderAt(wi, x - wheels[wi], z);
      // arch lip: a bead just above the real (rolled) arch edge, as strong as the arch is deep, so it ends with the arch
      if (lipAmt > 0) w += lipAmt * Math.exp(-(((z - zb - 0.03) / 0.03) ** 2));
      return w;
    };
    const lipAmt = P.archLip * sstep(0, 0.08, zb - zr);
    const wShoulder = Wp - ins(1), ledgeW = lerp(0.06, 0.012, P.ledgeSharp);
    // zCap: height at which the tail's plan slice is read (the top rows use their height before the crown is added, so the
    // whole crowned deck ends on one slice instead of its lower edges collapsing onto a face that has already receded)
    const W = (z, zCap = z) => {
      let w = Wp - ins(clamp((z - zr) / spanB, 0, 1)) + extras(z);
      if (z > zbelt) w -= ledge * sstep(zbelt, zbelt + ledgeW, z);
      // plan rounding radius grows with height: trapezoidal front and rear faces
      const tz = clamp((z - zr) / h, 0, 1);
      const cp = se(dF / (P.planF * lerp(1, P.noseTaper, tz)), 2.6) * (dR < tailReach ? capR(x, zCap) : 1);
      return cp * Math.max(w, 0.25 * W0);
    };
    const T = (u) => zc - crownE * u * u - ridgeE * u + ri * riseLat(u) + dome * Math.exp(-((u / 0.38) ** 2));

    // half contour in (u, z): u = lateral fraction of W(z)
    let k = 0;
    const put = (u, z) => { half[k++] = u; half[k++] = z; };
    const ratio = (r, w) => (w > 1e-9 ? Math.min(r / w, 0.95) : 0.95), rbu = ratio(rb, W(zb + rb)), rtu = ratio(rt, W(zs - rt));
    for (let q = 0; q < bf; q++) put((1 - rbu) * (q / bf), zb);
    for (let q = 0; q < bc; q++) { const a = -Math.PI / 2 + (Math.PI / 2) * (q / bc); put(1 - rbu + rbu * spow(Math.cos(a), e), zb + rb + rb * spow(Math.sin(a), e)); }
    // side rows are anchored on the character line and beltline so those features never alias across rows
    // the side rows span from the floor line (raised by the arch where there is one) to the shoulder: over an arch they
    // compress smoothly instead of piling onto the arch edge one by one (which folded quads across the fender)
    const lo = zb + rb, hi = zs - rt, span = hi - lo;
    // the character-line row tracks the crease only where the crease exists; where it has faded (an arch cutting up into
    // it) the row relaxes to an even spacing, so the rows below it are never squashed into a sliver over the arch.
    // The row is fully on the crease before the crease starts to grow (0.02), so a narrow bump never sits between rows.
    let kc = lerp(lo + (ROWS.chr / (side - 1)) * span, clamp(zchr, lo + 0.05 * span, hi - 0.1 * span), snapK(kCr));

    // the belt row sits on the ledge line wherever the ledge exists (fully before it starts to grow), evenly spaced elsewhere
    let kb = lerp(kc + ((ROWS.belt - ROWS.chr) / (side - 1 - ROWS.chr)) * (hi - kc), clamp(zbelt, kc + 0.05 * span, hi - 0.05 * span), snapK(kL));
    // the ledge step itself gets LS rows of its own (from the belt row to the top of the step), so a sharp ledge is
    // always resolved by the same rows instead of falling between them in a staircase along the car
    const LS = Math.max(1, Math.round(side / 20)), iL = Math.min(ROWS.belt + LS, side - 2);
    const kl = lerp(kb + ((iL - ROWS.belt) / (side - 1 - ROWS.belt)) * (hi - kb), Math.min(kb + ledgeW, (kb + hi) / 2), snapK(kL));
    const knots = [[0, lo], [ROWS.chr, kc], [ROWS.belt, kb], [iL, kl], [side - 1, hi]];
    // rows gather toward a knot only while its feature is there: where it has faded (over the tail face, where every row
    // fans out from the lip) the clustering left a line of skewed triangles along the knot row
    const sc = snapK(kCr), sl = snapK(kL), amp = [sc, Math.max(sc, sl), 0, sl];
    for (let q = 0, s = 0; q < side; q++) {
      while (s < knots.length - 2 && q >= knots[s + 1][0]) s++;
      const [i0, z0] = knots[s], [i1, z1] = knots[s + 1];
      const t = (q - i0) / (i1 - i0), g = t - (amp[s] * 0.55 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI);
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
      const z0 = z;
      if (q > bf + bc + side - 1) z += (T(u) - zs) * sstep(zs - Math.max(rt, 1e-6), zs, z);
      const y = u * W(z, z0), t = q / (H - 1);
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
    deckSt.push({ zc, ri, ridge: ridgeE, crown: crownE, dome, Wz, flat: (1 - rtu) * Wz });
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
    return S.zc - S.crown * u * u - S.ridge * u + S.ri * riseLat(u) + S.dome * Math.exp(-((u / 0.38) ** 2));
  };
  // the upper tail face: from its lowest point (crease, or the top of a bumper step) to the lip, inset off both edges
  const tailFace = [tail.sharp[1][1] + P.tailCreaseR + 0.01, tail.zLip - P.tailR - 0.01];
  if (tailFace[1] - tailFace[0] < 0.12) tailFace[0] = tailFace[1] - 0.12;
  // the body's top surface as functions of (x, lateral): what the cabin stands on, and what deck-mounted parts sit on
  const deckAt = (x, lat) => { const [a, b, t] = station(x); return lerp(topAt(deckSt[a], lat), topAt(deckSt[b], lat), t); };
  const flatW = (x) => { const [a, b, t] = station(x); return lerp(deckSt[a].flat, deckSt[b].flat, t); };
  const cabin = buildCabin(P, { xA, xRF, xRR, xC, W0, detail, deck: (x) => top[ix(x)], deckAt, flatW });

  const kit = buildKit(P, { position: pos, N, RL, xF, xR, W0, R, Ra, wb, floorAt: (x) => bot[ix(x)], floorMin: bot.reduce((m, v) => Math.min(m, v), Infinity), fenderGap: P.fdType ? P.fdWidth : 0, rearFloor: tail.zTk }, detail);
  // rearmost point of the fitted kit inside a box (y, z ranges, right half), for parts that must clear it
  const kitMaxX = (y0, y1, z0, z1) => {
    let m = -Infinity;
    for (const k in kit) {
      const q = kit[k]?.position;
      if (!q || !kit[k].index) continue;
      for (let i = 0; i < q.length; i += 3) if (q[i + 1] >= y0 && q[i + 1] <= y1 && q[i + 2] >= z0 && q[i + 2] <= z1) m = Math.max(m, q[i]);
    }
    return m;
  };
  // the deck's rear edge: where the lip roll starts at the centre line (tailR ahead of the lip's vertex)
  const accBody = { position: pos, N, RL, xF, xR, W0, tail, kitMaxX, deckAt, flatW, xHood, xA, xC, xDeck, lipX: tail.sharp[0][0] - P.tailR, beltZ: (x) => belt[ix(x)], sideZ: (x) => outline.side[station(x)[0]], widthAt: (x) => Math.max(...[-0.1, 0, 0.1].map((d) => outline.wmax[station(x + d)[0]])) };
  const plates = buildPlates(P, accBody, detail);
  return {
    position: pos, index, aT, aBelt, aIR, outline, sections, cabin, ring,
    lights: buildHeadlights(P, { position: pos, N, RL, xF, xR, W0 }, detail),
    tails: buildTaillights(P, { position: pos, N, RL, xF, xR, W0, tailFace, faceRake: Math.max(0, P.tailRake) }, detail),
    bars: { front: P.hlType === LIGHT_BAR ? buildLightBar(P, { position: pos, N, RL, xF, xR }, detail, 'front') : null, rear: P.tlType === LIGHT_BAR ? buildLightBar(P, { position: pos, N, RL, xF, xR, tailFace }, detail, 'rear') : null },
    fenders: buildFenders(P, {
      position: pos, N, RL, xF, xR, W0, R, Ra, wheels, tyreFace: P.track / 2 + P.wheelPoke + P.tireW / 2,
      archY: (d) => R + Ra * archH(Math.min(Math.abs(d) / Ra, 1), P.archShape), floorAt: (x) => bot[ix(x)],
    }, detail),
    kit,
    rack: buildRoof(P, cabin, detail),
    plates,
    grille: buildGrille(P, accBody, plates?.front ? plates.front.y1 : null, detail),
    exhaust: buildExhaust(P, accBody, detail),
    spoiler: buildSpoiler(P, accBody, cabin, detail),
    mirrors: buildMirrors(P, accBody, detail),
    antenna: buildAntenna(P, accBody, cabin, detail),
    hood: buildHood(P, accBody, detail),
    meta: {
      xF, xR, W0, R, Ra, wb, wheels, RL, tSideEnd, tTop, tBot: (bf + bc) / (H - 1), xA, xRF, xRR, xC, xTail,
      tail: { profile: tail.dense, face: tail.sharp, zLip: tail.zLip, zTk: tail.zTk, xRef: tail.xRef },
    },
  };
}

const lerpDeep = (a, b, t) => (typeof a === 'number' ? lerp(a, b, t)
  : Array.isArray(a) ? (b && b.length === a.length ? a.map((v, i) => lerpDeep(v, b[i], t)) : clone(a))
  : a && typeof a === 'object' ? Object.fromEntries(Object.keys(a).map((k) => [k, lerpDeep(a[k], b[k], t)]))
  : a);

// Free randomisation: every parameter gets its own draw, so a car is no longer one preset class with noise.
// RANDOM: plausible range per scalar (narrower than the sliders, so random cars stay buildable and car-like)
const RANDOM = {
  wheelR: [0.29, 0.42], tireW: [0.19, 0.31], rimRatio: [0.5, 0.8], wheelbase: [2.3, 3.1], track: [1.45, 1.72], wheelPoke: [-0.01, 0.05],
  camber: [-6, 1], archGap: [0.02, 0.07], overhangF: [0.6, 1.15], overhangR: [0.5, 1.15], width: [1.72, 2.05], clearance: [0.1, 0.3],
  chinZ: [0.22, 0.55], tailBotZ: [0.28, 0.6], planF: [0.2, 0.8], planR: [0.1, 0.5], noseR: [0.04, 0.25], tailR: [0.006, 0.08],
  tailRake: [-10, 32], tailCrease: [0.25, 0.62], tailCreaseR: [0.004, 0.05], tailTuck: [5, 45], tailBox: [2.4, 8], tailBow: [0, 0.16],
  noseTaper: [0.8, 2.2], tailTaper: [0.8, 1.8], squareness: [2.6, 6], edgeR: [0.03, 0.16], cabinR: [0.015, 0.045], bottomR: [0.03, 0.15],
  crown: [0, 0.06], softness: [0.01, 0.06], tension: [0, 0.9], creaseSharp: [0, 1], ledgeSharp: [0, 1],
  crease: [0, 0.018], flare: [0, 0.08], flareR: [0, 0.1], fenderMelt: [1.6, 2.8], archLip: [0, 0.02], ledge: [0, 0.04], hoodDome: [0, 0.03],
  peakF: [0, 0.05], peakR: [0, 0.05], pillarFan: [0, 0.4], pillarW: [0.06, 0.12], aPillar: [0.08, 0.16], cPillar: [0.1, 0.5], cTaper: [0.4, 1.2],
  cabinBlend: [0.01, 0.04], baseRound: [0.3, 0.7], roofRound: [0.2, 0.6], wsCrown: [0.02, 0.14], blCrown: [0.02, 0.1], glassBulge: [0, 0.03],
  sideBow: [0, 0.03], roofCrown: [0.01, 0.04], roofArch: [0, 0.04], sillInset: [0.02, 0.06], headerInset: [0.03, 0.08],
  hlH: [0.4, 0.9], hlZ: [0.45, 0.85], hlDepth: [-0.02, 0.03], hlSize: [0.75, 1.3], hlSweep: [0, 35], hlRake: [0, 30], hlAngle: [-15, 25],
  hlBlend: [0.04, 0.25], hlRound: [0.2, 1], hlMelt: [0.2, 1], hlCrown: [-0.01, 0.03],
  tlH: [0.4, 0.9], tlZ: [0.45, 0.85], tlDepth: [-0.02, 0.03], tlSize: [0.75, 1.3], tlSweep: [0, 35], tlRake: [0, 30], tlAngle: [-15, 25],
  tlBlend: [0.04, 0.25], tlRound: [0.2, 1], tlMelt: [0.2, 1], tlCrown: [-0.01, 0.03],
  fdWidth: [0.07, 0.16], fdOut: [0.025, 0.08], fdLip: [0.005, 0.025], fdWrap: [0.3, 0.9], fdBlend: [0.02, 0.06],
  kitH: [0.07, 0.16], kitDrop: [0, 0.05], kitOut: [0.7, 1.6], kitBlend: [0.02, 0.05], metal: [0, 0.8], rough: [0.1, 0.5],
  rfLen: [0.55, 1], rfWidth: [0.7, 1], rfH: [0.05, 0.12],
  plateH: [0.15, 0.5], exD: [0.06, 0.11], exOut: [0.005, 0.04], exSpread: [0.4, 0.7], spSize: [0.8, 1.25], spH: [0.1, 0.24],
  mrSize: [0.85, 1.15], anLen: [0.4, 0.8], grSize: [0.8, 1.2], grH: [0.3, 0.7], hdSize: [0.85, 1.2],
};
const FREE = 0.75; // chance a scalar is drawn fresh from its range instead of nudged from the blended base

export function randomCar(rng = Math.random) {
  const keys = Object.keys(PRESETS), pick = (a) => a[Math.floor(rng() * a.length)];
  const u = (a, b) => a + (b - a) * rng(), j = (amt) => (rng() * 2 - 1) * amt, chance = (p) => rng() < p;
  // proportions and section shapes start from a random mix of one to three presets
  let P = clone(PRESETS[pick(keys)]);
  for (let n = Math.floor(rng() * 3); n > 0; n--) P = lerpDeep(P, PRESETS[pick(keys)], rng());
  for (const [k, [lo, hi]] of Object.entries(RANDOM)) P[k] = chance(FREE) ? u(lo, hi) : clamp(P[k] + j(0.15 * (hi - lo)), lo, hi);
  // features that are usually off stay off more often than not
  for (const k of ['ridge', 'cladding']) P[k] = chance(0.25) ? u(0.01, k === 'ridge' ? 0.03 : 0.1) : 0;

  // side view: hood, windshield base, roof and deck heights each move on their own; the roof moves as one piece
  const pr = P.profile, lift = u(-0.18, 0.22);
  pr.forEach((p, i) => { if (i > 0 && i < 7) p[0] += j(0.07); });
  pr[0][1] += j(0.1); pr[1][1] += j(0.12); pr[2][1] += j(0.08);
  pr[3][1] += lift + j(0.04); pr[4][1] += lift + j(0.04);
  pr[5][1] += j(0.1); pr[6][1] += j(0.1); pr[7][1] += j(0.08);
  // roof length: anything from a short bubble to a long wagon roof
  pr[4][0] = pr[3][0] + u(0.12, 1.1) * (pr[5][0] - pr[3][0]) * 0.85;
  P.belt.forEach((p) => { p[1] += j(0.07); }); P.chr.forEach((p) => { p[1] += j(0.07); });
  P.plan.forEach((p) => { p[1] += j(0.07); });
  P.cabin = P.cabin.map((c) => c + j(0.09));
  for (const sec of [P.secF, P.secR]) { sec.body.forEach((p) => { p[1] += j(0.025); }); sec.glass = [u(0.3, 0.7), u(0.22, 0.6)]; }
  const np = Math.floor(rng() * 4);
  P.pillars = Array.from({ length: np }, (_, i) => [(i + 1) / (np + 1) + j(0.05), j(0.15)]);

  // discrete choices, each on its own
  P.spokes = 3 + Math.floor(rng() * 10);
  P.hlType = chance(0.05) ? 0 : 1 + Math.floor(rng() * 7);
  P.tlType = chance(0.05) ? 0 : 1 + Math.floor(rng() * 7);
  P.fdType = chance(0.55) ? 0 : 1 + Math.floor(rng() * 3);
  P.archShape = chance(0.3) ? 1 : 0;
  P.rimType = Math.floor(rng() * 5);
  P.rfType = chance(0.65) ? 0 : 1 + Math.floor(rng() * 3);
  // body kit: none, one matching set, or pieces mixed from different sets
  const kit = rng(), set = 1 + Math.floor(rng() * 5);
  for (const k of ['kitF', 'kitS', 'kitR']) P[k] = kit < 0.4 ? 0 : kit < 0.75 ? set : (chance(0.25) ? 0 : 1 + Math.floor(rng() * 5));
  // accessories: plates and mirrors nearly always, the rest now and then
  P.plateType = chance(0.1) ? 0 : 1 + Math.floor(rng() * 5); P.plateNo = Math.floor(rng() * 10000);
  P.exType = chance(0.15) ? 0 : 1 + Math.floor(rng() * 3);
  P.spType = chance(0.6) ? 0 : 1 + Math.floor(rng() * 5);
  P.mrType = chance(0.08) ? 0 : 1 + Math.floor(rng() * 3);
  P.anType = chance(0.55) ? 0 : 1 + Math.floor(rng() * 4);
  P.grType = chance(0.35) ? 0 : 1 + Math.floor(rng() * 5);
  P.hdType = chance(0.75) ? 0 : 1 + Math.floor(rng() * 4);
  // a stance build now and then: wheels pushed out, tops leaning in
  if (chance(0.12)) { P.wheelPoke = u(0.06, 0.2); P.camber = u(-18, -8); }
  P.contrastRoof = chance(0.3) ? 1 : 0;
  const hsl = (h, s, l) => { const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
  P.color = chance(0.35) ? pick(['#1f3a5f', '#8f1d1d', '#e9e9e6', '#2f7d3b', '#d0491f', '#6c7178', '#1b1c1e', '#c9a227', '#2a54a8'])
    : hsl(u(0, 360), chance(0.2) ? u(0, 0.12) : u(0.35, 0.85), u(0.18, 0.62));
  sanitize(P);
  // free draws can pair big wheels with a short overhang (the arch eats the nose), or a high lower edge with a low nose
  // or tail; keep room ahead of / behind the arches and a real end face for the edge radius to round
  const Ra = P.wheelR + P.archGap, prf = P.profile, last = prf.length - 1;
  // windshield base and deck clear the arch tops, so the automatic fender rise forms peaks beside the cabin, never under
  // its glass
  prf[2][1] = Math.max(prf[2][1], P.wheelR + Ra + 0.04); prf[5][1] = Math.max(prf[5][1], P.wheelR + Ra + 0.04);
  for (const i of [3, 4]) prf[i][1] = Math.max(prf[i][1], Math.max(prf[2][1], prf[5][1]) + 0.3); // a real greenhouse
  prf[1][1] = Math.max(prf[1][1], prf[2][1] - 0.2); // the cabin stands on the cowl: no steep climb up to the windshield
  prf[0][1] = Math.min(prf[0][1], prf[1][1] - 0.02); // the nose falls away
  prf[last][1] = prf[last - 1][1] + u(-0.08, 0.04); // the tail: a falling deck, a level one or a ducktail kick
  P.overhangF = Math.max(P.overhangF, Ra + 0.42); P.overhangR = Math.max(P.overhangR, Ra + 0.3);
  const fN = prf[0][1], fT = prf[last][1];
  P.chinZ = clamp(P.chinZ, P.clearance + 0.04, fN - 0.22); P.noseR = Math.min(P.noseR, 0.4 * (fN - P.chinZ));
  P.tailBotZ = clamp(P.tailBotZ, P.clearance + 0.04, fT - 0.22); P.tailR = Math.min(P.tailR, 0.4 * (fT - P.tailBotZ));
  return P;
}

/** Deterministic PRNG from a number or string seed (mulberry32): same seed, same sequence. */
export function seeded(seed) {
  let h = 2166136261 >>> 0;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parameters for a seed: the same free randomisation as the app's Generate button, but reproducible. */
export const randomParams = (seed) => randomCar(seeded(seed));
