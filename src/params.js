// Parameter schema: every slider the generator exposes, grouped. One source for the standalone app's panel and for any
// host UI (a game garage): [group, [[key, label, min, max, step, unit?], ...], tab]. `tab` is 'body' or 'attachments'.
// Discrete parameters list their option names in OPTIONS.
import { LAMP_TYPES, TAIL_TYPES } from './lights.js';
import { FENDER_TYPES } from './flares.js';
import { KIT_TYPES } from './kit.js';
import { RIM_TYPES } from './wheels.js';
import { ROOF_TYPES } from './roof.js';
import { PLATE_TYPES } from './plates.js';
import { EXHAUST_TYPES } from './exhaust.js';
import { SPOILER_TYPES } from './spoiler.js';
import { MIRROR_TYPES } from './mirrors.js';
import { ANTENNA_TYPES } from './antenna.js';
import { GRILLE_TYPES } from './grille.js';
import { HOOD_TYPES } from './hood.js';

export const SPEC = [
  ['Wheels', [['wheelR', 'Wheel radius', 0.26, 0.48, 0.005, 'm'], ['tireW', 'Tire width', 0.16, 0.34, 0.005, 'm'], ['wheelbase', 'Wheelbase', 1.8, 3.6, 0.01, 'm'], ['track', 'Track', 1.3, 1.9, 0.01, 'm'], ['wheelPoke', 'Wheel stick-out', -0.04, 0.3, 0.002, 'm'], ['camber', 'Camber', -30, 10, 0.5, 'deg'], ['archGap', 'Arch gap', 0, 0.12, 0.002, 'm']]],
  ['Chassis', [['overhangF', 'Front overhang', 0.3, 1.8, 0.01, 'm'], ['overhangR', 'Rear overhang', 0.2, 1.8, 0.01, 'm'], ['width', 'Body width', 1.5, 2.2, 0.01, 'm'],
    ['clearance', 'Ground clearance', 0.06, 0.4, 0.005, 'm'], ['chinZ', 'Front lower edge', 0.1, 0.7, 0.01, 'm'], ['tailBotZ', 'Rear lower edge', 0.1, 0.8, 0.01, 'm']]],
  ['Nose', [['planF', 'Nose plan radius', 0.04, 1, 0.01, 'm'], ['noseTaper', 'Nose face taper', 0.5, 3, 0.05], ['noseR', 'Nose edge radius', 0.01, 0.4, 0.005, 'm']]],
  ['Tail', [['tailR', 'Lip edge radius', 0.004, 0.2, 0.001, 'm'], ['tailRake', 'Face rake (undercut)', -30, 45, 1, 'deg'], ['tailCrease', 'Crease height', 0.1, 0.9, 0.01],
    ['tailCreaseR', 'Crease radius', 0.002, 0.15, 0.001, 'm'], ['tailTuck', 'Bumper tuck', 0, 65, 1, 'deg'],
    ['planR', 'Corner size', 0.04, 1, 0.01, 'm'], ['tailBox', 'Corner squareness', 2, 12, 0.1], ['tailBow', 'Face bow', 0, 0.3, 0.005, 'm'], ['tailTaper', 'Corner growth with height', 0.5, 3, 0.05]]],
  ['Surface', [['squareness', 'Section squareness', 2.2, 12, 0.1], ['edgeR', 'Shoulder radius', 0.005, 0.3, 0.005, 'm'], 
    ['bottomR', 'Sill radius', 0.005, 0.25, 0.005, 'm'], ['crown', 'Roof / hood crown', -0.02, 0.12, 0.002, 'm'], ['softness', 'Line softness', 0.002, 0.12, 0.001, 'm']]],
  ['Character', [['tension', 'Line tension', 0, 1, 0.01], ['creaseSharp', 'Crease sharpness', 0, 1, 0.01], ['ledgeSharp', 'Ledge sharpness', 0, 1, 0.01],
    ['archShape', 'Arch shape', 0, 1, 1], ['ridge', 'Center ridge', 0, 0.06, 0.001, 'm']]],
  ['Sculpt', [['crease', 'Character crease', 0, 0.03, 0.001, 'm'], ['flare', 'Front fender flare', 0, 0.15, 0.002, 'm'], ['flareR', 'Rear fender flare', 0, 0.15, 0.002, 'm'], ['fenderMelt', 'Fender blend', 1.2, 2.8, 0.05], ['archLip', 'Arch lip', 0, 0.03, 0.001, 'm'],
    ['ledge', 'Shoulder ledge', 0, 0.08, 0.002, 'm'], ['hoodDome', 'Hood dome', 0, 0.06, 0.001, 'm'], ['peakF', 'Front fender peaks', 0, 0.12, 0.002, 'm'], ['peakR', 'Rear fender peaks', 0, 0.12, 0.002, 'm']]],
  ['Greenhouse', [['pillarCount', 'Side pillars', 0, 3, 1], ['pillarFan', 'Pillar fan', 0, 1, 0.01], ['pillarW', 'Side pillar width', 0.05, 0.2, 0.005, 'm'],
    ['aPillar', 'A-pillar width', 0.06, 0.4, 0.005, 'm'], ['cPillar', 'C-pillar width', 0.07, 1.2, 0.01, 'm'], ['cTaper', 'C-pillar taper', 0.1, 2, 0.01]]],
  ['Cabin', [['cabinBlend', 'Cockpit blend', 0, 0.08, 0.001, 'm'], ['cabinR', 'Roof rail radius', 0.006, 0.08, 0.001, 'm'], ['roofRound', 'Roof corner roundness', 0.02, 0.95, 0.01], ['baseRound', 'Base corner roundness', 0.02, 0.95, 0.01], ['wsCrown', 'Windshield wrap', 0, 0.2, 0.002, 'm'],
    ['blCrown', 'Backlight wrap', 0, 0.2, 0.002, 'm'], ['glassBulge', 'Glass bulge', 0, 0.06, 0.001, 'm'], ['sideBow', 'Side glass bow', 0, 0.06, 0.001, 'm'],
    ['roofCrown', 'Roof crown', 0, 0.06, 0.001, 'm'], ['roofArch', 'Roof arch', -0.02, 0.08, 0.001, 'm'], ['sillInset', 'Window sill', 0.005, 0.12, 0.001, 'm'],
    ['headerInset', 'Window header', 0.01, 0.15, 0.001, 'm']]],
  ['Rims', [['rimType', 'Style', 0, 4, 1], ['rimRatio', 'Rim size', 0.45, 0.82, 0.01], ['spokes', 'Spokes', 3, 12, 1]]],
  ['Roof', [['rfType', 'Style', 0, 3, 1], ['rfLen', 'Length', 0.4, 1, 0.01], ['rfWidth', 'Width', 0.5, 1, 0.01], ['rfH', 'Height', 0.04, 0.16, 0.002, 'm']]],
  ['Headlights', [['hlType', 'Style', 0, 7, 1], ['hlH', 'Height', 0, 1, 0.01], ['hlZ', 'Spread', 0.3, 0.95, 0.01], ['hlDepth', 'Stand-out', -0.08, 0.1, 0.002, 'm'],
    ['hlSize', 'Size', 0.6, 1.6, 0.01], ['hlSweep', 'Sweep', -10, 40, 1, 'deg'], ['hlRake', 'Rake', -10, 35, 1, 'deg'], ['hlAngle', 'Angle (aggression)', -30, 30, 1, 'deg'],
    ['hlBlend', 'Bezel width', 0.02, 0.4, 0.002, 'm'], ['hlRound', 'Bezel roundness', 0, 1, 0.01], ['hlMelt', 'Bezel melt', 0, 1, 0.01],
    ['hlCrown', 'Bezel fullness', -0.03, 0.06, 0.001, 'm']]],
  ['Tail lights', [['tlType', 'Style', 0, 7, 1], ['tlH', 'Height', 0, 1, 0.01], ['tlZ', 'Spread', 0.3, 0.95, 0.01], ['tlDepth', 'Stand-out', -0.08, 0.1, 0.002, 'm'],
    ['tlSize', 'Size', 0.6, 1.6, 0.01], ['tlSweep', 'Sweep', -10, 40, 1, 'deg'], ['tlRake', 'Rake', -10, 35, 1, 'deg'], ['tlAngle', 'Angle (aggression)', -30, 30, 1, 'deg'],
    ['tlBlend', 'Bezel width', 0.02, 0.4, 0.002, 'm'], ['tlRound', 'Bezel roundness', 0, 1, 0.01], ['tlMelt', 'Bezel melt', 0, 1, 0.01],
    ['tlCrown', 'Bezel fullness', -0.03, 0.06, 0.001, 'm']]],
  ['Fenders', [['fdType', 'Style', 0, 3, 1], ['fdWidth', 'Width', 0.04, 0.3, 0.002, 'm'], ['fdOut', 'Stand-out', 0.01, 0.15, 0.002, 'm'],
    ['fdLip', 'Lip overhang', 0, 0.05, 0.001, 'm'], ['fdWrap', 'Wrap down', 0, 1, 0.01], ['fdBlend', 'Blend width', 0.01, 0.15, 0.002, 'm']]],
  ['Body kit', [['kitF', 'Front bumper', 0, 5, 1], ['kitS', 'Side skirts', 0, 5, 1], ['kitR', 'Rear bumper', 0, 5, 1],
    ['kitH', 'Height', 0.05, 0.25, 0.002, 'm'], ['kitDrop', 'Drop', 0, 0.08, 0.001, 'm'], ['kitOut', 'Depth', 0.5, 2, 0.01], ['kitBlend', 'Blend width', 0.01, 0.1, 0.002, 'm']]],
  ['Plates', [['plateType', 'Style', 0, 5, 1], ['plateH', 'Rear height', 0, 1, 0.01], ['plateNo', 'Number', 0, 9999, 1]]],
  ['Exhaust', [['exType', 'Style', 0, 3, 1], ['exD', 'Tip diameter', 0.05, 0.13, 0.001, 'm'], ['exOut', 'Stick-out', 0, 0.08, 0.001, 'm'], ['exSpread', 'Spread', 0.2, 0.85, 0.01]]],
  ['Spoiler', [['spType', 'Style', 0, 5, 1], ['spSize', 'Size', 0.6, 1.5, 0.01], ['spH', 'Wing height', 0.06, 0.3, 0.002, 'm']]],
  ['Mirrors', [['mrType', 'Style', 0, 3, 1], ['mrSize', 'Size', 0.7, 1.4, 0.01]]],
  ['Antenna', [['anType', 'Style', 0, 4, 1], ['anLen', 'Mast length', 0.25, 1, 0.01, 'm']]],
  ['Grille', [['grType', 'Style', 0, 5, 1], ['grSize', 'Size', 0.6, 1.4, 0.01], ['grH', 'Height', 0, 1, 0.01]]],
  ['Hood', [['hdType', 'Style', 0, 4, 1], ['hdSize', 'Size', 0.6, 1.4, 0.01]]],
  ['Trim', [['cladding', 'Cladding', 0, 0.14, 0.005, 'm']]],
  ['Finish', [['metal', 'Metallic', 0, 1, 0.01], ['rough', 'Roughness', 0.05, 0.8, 0.01]]],
];

const ATTACH = new Set(['Rims', 'Roof', 'Headlights', 'Tail lights', 'Fenders', 'Body kit', 'Plates', 'Exhaust', 'Spoiler', 'Mirrors', 'Antenna', 'Grille', 'Hood']);
export const TAB = (group) => (ATTACH.has(group) ? 'attachments' : 'body');

export const OPTIONS = {
  hlType: LAMP_TYPES, tlType: TAIL_TYPES, fdType: FENDER_TYPES, rimType: RIM_TYPES, rfType: ROOF_TYPES, plateType: PLATE_TYPES, exType: EXHAUST_TYPES, spType: SPOILER_TYPES, mrType: MIRROR_TYPES, anType: ANTENNA_TYPES, grType: GRILLE_TYPES, hdType: HOOD_TYPES,
  archShape: ['Round', 'Angular'], kitF: KIT_TYPES, kitS: KIT_TYPES, kitR: KIT_TYPES,
};

// flat list: { key, label, min, max, step, unit, group, tab, options? }. `pillarCount` is virtual (P.pillars.length,
// set with setPillarCount); everything else is a plain number on the parameter object
export const PARAMS = SPEC.flatMap(([group, rows]) => rows.map(([key, label, min, max, step, unit = '']) => ({
  key, label, min, max, step, unit, group, tab: TAB(group), ...(OPTIONS[key] ? { options: OPTIONS[key] } : {}),
})));
