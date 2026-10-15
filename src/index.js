// Car-gen as a library. No build step: import this file from a page whose import map provides `three`, and the car
// uses the host's three.js instance (one copy, so instanceof checks and shared renderers just work).
//
//   import { createCar } from './car-gen/src/index.js';
//   const car = createCar('my-seed');          // or a preset name, or a full parameter object
//   scene.add(car.body); for (const k in car.wheels) scene.add(car.wheels[k]);
//
// createCar returns the same shape as HighRoads' assets.loadCarModel(), in the same frame: body faces -Z, origin on
// the ground midway between the axles, +X to the right; each wheel is a holder whose origin is the axle centre and
// which spins about its local X. Position holders at (+-trackHalf, wheelRadius, +-wheelbaseHalf), FL = (-, -).
import * as THREE from 'three';
import { PRESETS, randomCar, sanitize, clone, setPillarCount, buildCar, seeded, randomParams } from './car.js';
import { CarMesh, createMaterials, ACCESSORIES } from './render.js';
import { SPEC, PARAMS, OPTIONS } from './params.js';

export { PRESETS, randomCar, sanitize, clone, setPillarCount, buildCar, seeded, randomParams, CarMesh, createMaterials, SPEC, PARAMS, OPTIONS };

// lamp emissive levels, matched to HighRoads' own: dim running glow, braking / main beam, flash
const TAIL_IDLE = 0.8, TAIL_BRAKE = 5.5, HEAD_OFF = 0.5, HEAD_ON = 3.2, HEAD_FLASH = 9;
const WHEELS = ['FL', 'FR', 'BL', 'BR'];
const BOLT_ON = new RegExp(`^(${ACCESSORIES.join('|')})_`);
const parse = (input) => (input && typeof input === 'object' ? sanitize(clone(input)) : PRESETS[input] ? sanitize(clone(PRESETS[input])) : randomParams(input ?? Math.random()));

/**
 * Build a car. `input`: a parameter object (copied, never mutated), a preset name ('sedan', 'suv', ...), or any seed
 * (number / string; omitted = random). `detail` 0..1 trades triangles for smoothness; 1 is the editor's full quality.
 * Returns { body, wheels: { FL, FR, BL, BR }, metrics, params, materials, setColor, setTrimColor, setBrake,
 * setHeadlights, update, dispose }.
 */
export function createCar(input, { detail = 0.5 } = {}) {
  const view = new CarMesh({ nativeWheels: false });
  const M = view.mats;
  const body = new THREE.Group(), inner = view.body;
  // native frame (x = length, front axle at 0; z = left) -> game frame (front = -Z, +X = right): a -90 deg yaw
  inner.rotation.y = -Math.PI / 2;
  body.add(inner);
  const wheels = {}, spinners = {};
  for (const k of WHEELS) {
    wheels[k] = new THREE.Group(); // driven by the game: steer (y) and spin (x)
    spinners[k] = new THREE.Group(); // turns the generator's wheel (axle along z, face +z) to face outward along x
    spinners[k].rotation.y = k[1] === 'R' ? Math.PI / 2 : -Math.PI / 2;
    wheels[k].add(spinners[k]);
  }

  const car = {
    body, wheels, params: null, metrics: null, materials: M,

    /** Rebuild in place from new parameters (garage editing). Cheap enough for slider drags. */
    update(next) {
      const P = (car.params = typeof next === 'object' ? sanitize(clone(next)) : parse(next));
      const prevProto = view.wheelProto;
      const built = view.update(P, detail);
      inner.position.set(0, 0, -P.wheelbase / 2);
      if (view.wheelProto !== prevProto) {
        for (const k of WHEELS) { spinners[k].clear(); spinners[k].add(view.wheelProto.clone()); }
      }
      // metrics in the game frame, measured from the shell: wheels and bolt-on accessories (a mirror, a mast, a wing)
      // excluded, since a host sizes colliders and mass from them; hidden parts keep stale geometry, so skip those too
      body.updateMatrixWorld(true);
      const box = new THREE.Box3();
      for (const [name, mesh] of Object.entries(view.parts)) if (mesh.visible && !BOLT_ON.test(name)) box.expandByObject(mesh, true);
      car.metrics = {
        trackHalf: P.track / 2 + P.wheelPoke,
        wheelbaseHalf: P.wheelbase / 2,
        wheelRadius: P.wheelR,
        wheelWidth: P.tireW,
        bodyHeight: box.max.y,
        bodyHalfWidth: (box.max.x - box.min.x) / 2,
        bodyHalfLength: (box.max.z - box.min.z) / 2,
        // where the body ends fore and aft of the axle midpoint (overhangs differ, so the body is not centred)
        bodyFrontZ: box.min.z, bodyRearZ: box.max.z,
        // each exhaust mouth's centre (flames, smoke); empty with no exhaust fitted
        exhaustTips: (built.exhaust?.tips ?? []).map(([x, y, z]) => [-z, y, x - P.wheelbase / 2]),
        triangles: view.triangles() + 4 * countTris(view.wheelProto),
      };
      return car;
    },

    /** Main paint colour (hex number or CSS string). */
    setColor(c) { M.paint.color.set(c); car.params.color = '#' + M.paint.color.getHexString(); },
    /** Second colour: shown as a contrast roof. null removes it (roof back in body colour). */
    setTrimColor(c) {
      if (c == null) { car.params.contrastRoof = 0; view.parts.roof.material = M.paint; return; }
      M.trim.color.set(c); car.params.contrastRoof = 1; view.parts.roof.material = M.trim;
    },
    /** 0..1: running glow up to full brake lights. */
    setBrake(t) {
      const k = Math.max(0, Math.min(1, t)), v = TAIL_IDLE + (TAIL_BRAKE - TAIL_IDLE) * k;
      M.lamp.red.emissiveIntensity = v;
      M.lamp.tint.emissiveIntensity = 0.6 + 2 * k;
    },
    /** Head lamps off (running glow) / on, with a brief flash brighter than the beam. */
    setHeadlights(on, flash) { M.lamp.led.emissiveIntensity = flash ? HEAD_FLASH : on ? HEAD_ON : HEAD_OFF; },

    /** Frees all geometry, materials and textures. Clones made with .clone() share them: dispose once, last. */
    dispose() { view.dispose(); },
  };
  car.update(input);
  car.setBrake(0);
  car.setHeadlights(false, false);
  return car;
}

function countTris(o) {
  let n = 0;
  o?.traverse((m) => { if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
  return n;
}
