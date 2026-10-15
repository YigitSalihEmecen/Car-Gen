// Three.js side of the generator: materials (including the paint shader that masks wheel wells and cuts the lamp
// openings), and CarMesh, which turns a buildCar() result into meshes. Shared by the standalone app (app.js) and the
// library entry (index.js), so both render identically. Everything is per instance: each CarMesh owns its materials
// and paint uniforms, so several cars can live in one scene. Native frame: x = length (front axle at 0), y = up,
// z = lateral; index.js re-poses it for games.
import * as THREE from 'three';
import { buildCar, sanitize } from './car.js';
import { KIT_SWEEP, KIT_LATHE } from './kit.js';
import { makeWheel } from './wheels.js';
import { ROOF_PARTS } from './roof.js';
import { ACC_MATS } from './acc.js';

// accessory groups in a buildCar() result; each is { [material key]: mesh } (see acc.js)
export const ACCESSORIES = ['plates', 'exhaust', 'spoiler', 'mirrors', 'antenna', 'grille', 'hood'];

const HOLE_MAX = 256; // per lamp pair; the texture holds the headlight polygon, then the tail-light polygon

function makePaint() {
  const U = {
    uT: { value: new THREE.Vector4() }, uEnds: { value: new THREE.Vector4() },
    uWheel: { value: new THREE.Vector4() }, uOpt: { value: new THREE.Vector4() },
    uZebra: { value: 0 },
    uHPoly: { value: new THREE.DataTexture(new Float32Array(HOLE_MAX * 8), HOLE_MAX * 2, 1, THREE.RGBAFormat, THREE.FloatType) },
    uHN: { value: 0 }, uHBox: { value: new THREE.Vector4() }, uTN: { value: 0 }, uTBox: { value: new THREE.Vector4() }, uRL: { value: 0 },
    uH3: { value: [new THREE.Vector3(), new THREE.Vector3()] }, uT3: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  };
  const paint = new THREE.MeshPhysicalMaterial({ clearcoat: 1, clearcoatRoughness: 0.06 });
  paint.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aT; attribute float aBelt; attribute vec2 aIR;
        varying vec3 vOP; varying vec3 vON; varying float vT; varying float vBelt; varying vec2 vIR;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vOP = position; vON = normal; vT = aT; vBelt = aBelt; vIR = aIR;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vOP; varying vec3 vON; varying float vT; varying float vBelt; varying vec2 vIR;
        uniform vec4 uT, uEnds, uWheel, uOpt; uniform float uZebra;
        uniform sampler2D uHPoly; uniform int uHN, uTN; uniform vec4 uHBox, uTBox; uniform float uRL; uniform vec3 uH3[2], uT3[2];
        // even-odd test against a lamp bezel edge, a polygon in the body's (station, ring) coordinates
        bool inPoly(vec2 p, int off, int n, vec4 box) {
          if (n == 0 || any(lessThan(p, box.xy)) || any(greaterThan(p, box.zw))) return false;
          bool inside = false;
          for (int k = 0; k < ${HOLE_MAX}; k++) {
            if (k >= n) break;
            vec2 a = texelFetch(uHPoly, ivec2(off + k, 0), 0).xy, b = texelFetch(uHPoly, ivec2(off + (k + 1) % n, 0), 0).xy;
            if ((a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
          }
          return inside;
        }
        bool in3(vec3 q, vec3 lo, vec3 hi) { return all(greaterThanEqual(q, lo)) && all(lessThanEqual(q, hi)); }
        bool inHole(vec2 p) {
          vec3 q = vec3(vOP.x, vOP.y, abs(vOP.z));
          return (in3(q, uH3[0], uH3[1]) && inPoly(p, 0, uHN, uHBox)) || (in3(q, uT3[0], uT3[1]) && inPoly(p, ${HOLE_MAX}, uTN, uTBox));
        }
        float aaw(float v){ return fwidth(v) * 0.75 + 1e-5; }
        float above(float v, float a){ float w = aaw(v); return smoothstep(a - w, a + w, v); }
        float archH(float u){ return sqrt(max(1.0 - u * u, 0.0)); }
        float inArch(float dx, float y, float ra){ float u = abs(dx) / ra; return (1.0 - above(u, 1.0)) * (1.0 - above(y, uWheel.z + ra * archH(min(u, 1.0)))); }
        float inArches(float x, float y, float ra){ return max(inArch(x, y, ra), inArch(x - uWheel.y, y, ra)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // lamp openings: the skin under each bezel is cut away (left side folds onto the right: ring r <-> RL - r)
        if (uHN + uTN > 0 && vT < 1.5 && inHole(vec2(vIR.x, vIR.y > 0.5 * uRL ? uRL - vIR.y : vIR.y))) discard;
        float x = vOP.x, y = vOP.y;
        // wheel wells, underbody, cladding
        float well = inArches(x, y, uWheel.w + 0.004) * (1.0 - above(vT, uT.z));
        // only true undersides: tucked and undercut tail faces lean down too, but stay painted
        float under = smoothstep(-0.7, -0.88, vON.y) * (1.0 - above(vT, 1.5));
        float clad = uOpt.x > 0.001 ? max((inArches(x, y, uWheel.w + uOpt.x) - inArches(x, y, uWheel.w - 0.01)) * (1.0 - above(y, vBelt - 0.08)), 1.0 - above(y, uEnds.w + uOpt.x * 1.5)) : 0.0;
        float trim = max(well, max(under, clad));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.04, 0.045), trim);
        float mPaint = 1.0 - trim;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.75, trim);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor *= mPaint;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        material.clearcoat *= 1.0 - trim;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        if (uZebra > 0.5) {
          vec3 r = reflect(normalize(vViewPosition), normalize(normal));
          float k = r.y * 26.0;
          float s = clamp(0.5 + sin(k) / (fwidth(k) * 1.6 + 1e-4), 0.0, 1.0);
          gl_FragColor = vec4(vec3(mix(0.06, 0.95, s)), 1.0);
        }`);
  };
  return { paint, U };
}

// every material one car uses; per instance so paint colour, brake and head lamps are per car
export function createMaterials() {
  const { paint, U } = makePaint();
  const std = (o) => new THREE.MeshStandardMaterial(o), phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const lamp = {
    red: std({ color: 0xff2a1a, emissive: 0xff1208, emissiveIntensity: 1.4, roughness: 0.35 }),
    tint: phys({ color: 0xd0170f, emissive: 0x500000, metalness: 0, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide }),
    white: std({ color: 0xf2f2f2, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.2 }),
    housing: std({ color: 0x1a1c1f, metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide }),
    chrome: std({ color: 0xe6e8ea, metalness: 1, roughness: 0.12, side: THREE.DoubleSide }),
    glass: phys({ color: 0x1b2430, metalness: 0.2, roughness: 0.05, clearcoat: 1 }),
    led: std({ color: 0xffffff, emissive: 0xeaf2ff, emissiveIntensity: 1.6 }),
    amber: std({ color: 0xff9a2e, emissive: 0xff7a10, emissiveIntensity: 0.35, roughness: 0.3 }),
    // plain transparency (not transmission): the transmission pass only sees opaque objects, so a red lens behind would vanish
    lens: phys({ roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }),
  };
  const plastic = std({ color: 0x17181a, roughness: 0.82, metalness: 0 });
  const bolt = std({ color: 0x2b2d30, metalness: 0.7, roughness: 0.42, side: THREE.DoubleSide });
  const rubber = std({ color: 0x161718, roughness: 0.88 });
  return {
    paint, U, lamp, plastic, bolt, rubber,
    rim: std({ color: 0xc8cbce, metalness: 1, roughness: 0.22 }),
    darkMetal: std({ color: 0x2a2c2f, metalness: 0.8, roughness: 0.5 }),
    caliper: std({ color: 0xd9541e, roughness: 0.4 }),
    glass: phys({ color: 0x0b0e12, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02 }),
    gasket: std({ color: 0x0c0d0e, roughness: 0.6 }),
    // the contrast roof; doubles as the car's second colour
    trim: phys({ color: 0x121314, metalness: 0.3, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 }),
    rivet: std({ color: 0xd4d7da, metalness: 1, roughness: 0.25, side: THREE.DoubleSide }),
    kit: {
      plastic, bolt, chrome: lamp.chrome,
      carbon: phys({ color: 0x15171a, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }),
      metal: std({ color: 0xb4b8bd, metalness: 1, roughness: 0.34 }),
      accent: std({ color: 0xc4211a, metalness: 0.2, roughness: 0.4, side: THREE.DoubleSide }),
      dark: std({ color: 0x0b0b0c, roughness: 0.9, side: THREE.DoubleSide }),
      bright: lamp.chrome, rubber,
    },
    // accessories: 'paint' is the body paint (set per update); the rest are their own finishes
    acc: {
      chrome: lamp.chrome, plastic, rubber, dark: std({ color: 0x0b0b0c, roughness: 0.9, side: THREE.DoubleSide }),
      black: phys({ color: 0x0c0d0f, metalness: 0.1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
      metal: std({ color: 0xb9bdc2, metalness: 1, roughness: 0.3 }),
      carbon: phys({ color: 0x15171a, metalness: 0.25, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }),
      mirror: std({ color: 0xdfe6ee, metalness: 1, roughness: 0.03 }),
      plate: std({ color: 0xf2f2ee, roughness: 0.38 }), plateY: std({ color: 0xf2c418, roughness: 0.38 }),
      ink: std({ color: 0x121315, roughness: 0.5 }), inkG: std({ color: 0x1d5a2c, roughness: 0.5 }),
      band: std({ color: 0x1c3f9c, roughness: 0.45 }), red: std({ color: 0xb3121a, roughness: 0.4 }),
      amber: lamp.amber, burnt: std({ color: 0x5a4c7c, metalness: 1, roughness: 0.28, side: THREE.DoubleSide }),
    },
    roof: {
      plastic, rubber, lens: lamp.lens, led: lamp.led, chrome: lamp.chrome,
      metal: std({ color: 0xc3c7cc, metalness: 1, roughness: 0.3 }),
      box: phys({ color: 0x23262a, metalness: 0.1, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
      frame: std({ color: 0x1c1d1f, metalness: 0.45, roughness: 0.55 }),
    },
  };
}

/**
 * One generated car as three.js meshes. `body` holds everything but the wheels; `group` holds body + the four wheels
 * posed in the native frame (set `nativeWheels: false` to pose wheels yourself from `wheelProto`). update() reuses
 * meshes across rebuilds, so it is cheap enough to call on every slider move.
 */
export class CarMesh {
  constructor({ nativeWheels = true, materials } = {}) {
    this.mats = materials || createMaterials();
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.nativeWheels = nativeWheels;
    this.parts = {};
    this.wheelKey = '';
    this.wheelProto = null;
    this.wheelGroup = null;
    this.built = null;
  }

  // aT given = painted part (paint shader reads aT / aBelt): 1 keeps body-only masks off, 2 also skips the lamp cut
  _part(name, data, mat, aT) {
    let mesh = this.parts[name];
    if (!data?.index.length) { if (mesh) mesh.visible = false; return; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.position, 3));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    if (aT !== undefined) {
      const n = data.position.length / 3;
      g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(n).fill(aT), 1));
      g.setAttribute('aBelt', new THREE.BufferAttribute(new Float32Array(n), 1));
      g.setAttribute('aIR', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    }
    if (data.normal) g.setAttribute('normal', new THREE.BufferAttribute(data.normal, 3)); else g.computeVertexNormals();
    if (mesh) { mesh.geometry.dispose(); mesh.geometry = g; mesh.material = mat; mesh.visible = true; }
    else { mesh = this.parts[name] = new THREE.Mesh(g, mat); mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; this.body.add(mesh); }
    mesh.renderOrder = mat === this.mats.lamp.lens ? 2 : mat === this.mats.lamp.tint ? 1 : 0;
  }

  /** Rebuild from parameters (sanitised in place). Returns the buildCar() result. */
  update(P, detail = 1) {
    sanitize(P);
    const built = this.built = buildCar(P, { detail }), M = this.mats, U = M.U, m = built.meta;
    this._part('body', { position: built.position, index: built.index }, M.paint);
    const bodyGeo = this.parts.body.geometry;
    bodyGeo.setAttribute('aT', new THREE.BufferAttribute(built.aT, 1));
    bodyGeo.setAttribute('aBelt', new THREE.BufferAttribute(built.aBelt, 1));
    bodyGeo.setAttribute('aIR', new THREE.BufferAttribute(built.aIR, 2));

    U.uT.value.set(m.tSideEnd, m.tTop, m.tBot, 0);
    U.uEnds.value.set(m.xF, m.xR, m.W0, P.clearance);
    U.uWheel.value.set(0, m.wb, m.R, m.Ra);
    U.uOpt.value.set(P.cladding, P.contrastRoof, 0, 0);
    M.paint.color.set(P.color);
    M.paint.metalness = P.metal; M.paint.roughness = P.rough;
    // lacquer only on a glossy finish: a full clearcoat over matte paint still mirrors the sky
    M.paint.clearcoat = Math.max(0, 1 - P.rough / 0.6);

    // cabin: painted wall, roof (paint or the contrast colour), glass on gaskets
    const cab = built.cabin;
    this._part('wall', cab.wall, M.paint, 1);
    this._part('roof', cab.roof, P.contrastRoof ? M.trim : M.paint, 1);
    this._part('gasket', cab.gasket, M.gasket);
    this._part('glass', cab.glass, M.glass);

    // head and tail lights: lamp internals plus painted bezels; the paint shader cuts each bezel's footprint from the skin
    U.uRL.value = m.RL;
    const tex = U.uHPoly.value;
    for (const [key, set, nU, boxU, off] of [['front', built.lights, 'uHN', 'uHBox', 0], ['rear', built.tails, 'uTN', 'uTBox', HOLE_MAX]]) {
      const hole = set?.hole;
      U[nU].value = hole ? Math.min(hole.n, HOLE_MAX) : 0;
      if (hole) {
        for (let i = 0; i < U[nU].value; i++) tex.image.data.set([hole.poly[2 * i], hole.poly[2 * i + 1]], 4 * (off + i));
        U[boxU].value.set(...hole.box);
        U[key === 'front' ? 'uH3' : 'uT3'].value[0].set(...hole.box3.slice(0, 3));
        U[key === 'front' ? 'uH3' : 'uT3'].value[1].set(...hole.box3.slice(3));
      }
      this._part(`bezel_${key}`, set?.bezel, M.paint, 2);
      for (const k in M.lamp) this._part(`lamp_${key}_${k}`, set?.[k], M.lamp[k]);
    }
    tex.needsUpdate = true;
    // full-width light bars: dark housing, emissive core (white front, red rear), clear lens over it
    for (const [key, bar, core] of [['front', built.bars.front, M.lamp.led], ['rear', built.bars.rear, M.lamp.red]]) {
      this._part(`bar_${key}_housing`, bar?.housing, M.lamp.housing);
      this._part(`bar_${key}_core`, bar?.core, core);
      this._part(`bar_${key}_lens`, bar?.lens, M.lamp.lens);
    }

    // fender flares: painted styles use the body paint (masks off), the pocket style is black plastic
    const fd = built.fenders;
    this._part('flares', fd?.shell, fd?.paint ? M.paint : M.plastic, fd?.paint ? 2 : undefined);
    this._part('flare_blend', fd?.blend, M.paint, 2);
    this._part('flare_hw', fd?.hardware, fd?.bright ? M.rivet : M.bolt);

    // body kit: painted parts and the blend use the body paint; trim parts get their own materials
    const kit = built.kit;
    this._part('kit_blend', kit?.blend, M.paint, 2);
    for (const k of KIT_SWEEP) this._part(`kit_${k}`, kit?.[k], k === 'paint' ? M.paint : M.kit[k], k === 'paint' ? 2 : undefined);
    for (const k of KIT_LATHE) this._part(`kit_${k}`, kit?.[k], M.kit[k]);

    // roof attachment: swept parts carry normals, lathed details get computed ones
    const rack = built.rack;
    for (const k of ROOF_PARTS) { this._part(`roof_${k}`, rack?.[k], M.roof[k]); this._part(`roof_${k}_l`, rack?.[`${k}_l`], M.roof[k]); }

    // accessories: painted parts use the body paint with body-only masks off
    for (const g of ACCESSORIES) for (const k of ACC_MATS) {
      const paint = k === 'paint';
      this._part(`${g}_${k}`, built[g]?.[k], paint ? M.paint : M.acc[k], paint ? 2 : undefined);
    }

    // wheels: rebuilt only when their shape changes
    const key = [P.wheelR, P.tireW, P.rimRatio, P.spokes, P.rimType, detail].join();
    if (key !== this.wheelKey) {
      this.wheelProto?.traverse((o) => o.geometry?.dispose());
      this.wheelProto = makeWheel(THREE, P, detail, { rubber: M.rubber, rim: M.rim, dark: M.darkMetal, chrome: M.lamp.chrome, caliper: M.caliper });
      this.wheelKey = key;
      if (this.nativeWheels) {
        if (this.wheelGroup) this.group.remove(this.wheelGroup);
        this.wheelGroup = new THREE.Group();
        for (let i = 0; i < 4; i++) this.wheelGroup.add(this.wheelProto.clone());
        this.group.add(this.wheelGroup);
      }
    }
    if (this.nativeWheels) {
      // camber tilts each wheel about its hub (negative = tops lean in), lifted so the low tyre shoulder stays on the
      // ground; stick-out pushes the wheels out past the body without touching the track the fenders are shaped around
      const cam = (P.camber * Math.PI) / 180, hubY = P.wheelR * Math.cos(cam) + (P.tireW / 2) * Math.abs(Math.sin(cam));
      this.wheelGroup.children.forEach((w, i) => {
        const left = i % 2 === 1;
        w.position.set(i < 2 ? 0 : P.wheelbase, hubY, (left ? -1 : 1) * (P.track / 2 + P.wheelPoke));
        w.rotation.set(left ? -cam : cam, left ? Math.PI : 0, 0);
      });
    }
    return built;
  }

  triangles() {
    let n = 0;
    this.group.traverse((o) => { if (o.isMesh && o.visible) n += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
    return n;
  }

  /** Frees every geometry, material and texture this car created. */
  dispose() {
    const seen = new Set();
    const free = (o) => { if (o && !seen.has(o)) { seen.add(o); o.dispose(); } };
    this.group.traverse((o) => free(o.geometry));
    this.wheelProto?.traverse((o) => free(o.geometry));
    const walk = (v) => { if (v?.isMaterial) free(v); else if (v && typeof v === 'object' && !v.isTexture && !v.isVector4) for (const k in v) if (k !== 'U') walk(v[k]); };
    walk(this.mats);
    free(this.mats.U.uHPoly.value);
  }
}
