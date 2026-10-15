// Library contract (src/index.js): what a host game relies on. Needs three.js: `npm run test:deps` once.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCar, randomParams, PARAMS, PRESETS } from '../src/index.js';

// same seed, same car; different seeds, different cars
assert.deepEqual(randomParams('highroads-7'), randomParams('highroads-7'), 'seed is not deterministic');
assert.notDeepEqual(randomParams('a'), randomParams('b'), 'different seeds gave the same car');

const KEYS = ['FL', 'FR', 'BL', 'BR'];
for (const input of ['sedan', 'offroad', 'supercar', 1, 2, 3, 'seed-x', 'seed-y']) {
  const car = createCar(input, { detail: 0.3 });
  const m = car.metrics;
  // HighRoads' model shape: body group, four wheel holders, metrics, lamp and paint setters
  assert.ok(car.body.isObject3D && KEYS.every((k) => car.wheels[k]?.isObject3D), `${input}: missing body or wheels`);
  for (const f of ['setColor', 'setTrimColor', 'setBrake', 'setHeadlights', 'update', 'dispose']) assert.equal(typeof car[f], 'function', `${input}: no ${f}()`);
  for (const k of ['trackHalf', 'wheelbaseHalf', 'wheelRadius', 'wheelWidth', 'bodyHeight', 'bodyHalfWidth', 'bodyHalfLength']) assert.ok(m[k] > 0 && Number.isFinite(m[k]), `${input}: bad metric ${k}`);

  // frame: on the ground, front toward -Z, wheel axles midway, the body clears the wheel layout
  car.body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(car.body, true);
  assert.ok(Math.abs(box.min.y - car.params.clearance) < 0.12 && box.min.y > 0, `${input}: body bottom at ${box.min.y.toFixed(3)}`);
  assert.ok(-box.min.z > car.params.overhangF + m.wheelbaseHalf - 0.2, `${input}: front is not toward -Z`);
  assert.ok(box.max.z > m.wheelbaseHalf + car.params.overhangR - 0.2, `${input}: rear is not toward +Z`);
  assert.ok(Math.abs(box.max.x + box.min.x) < 0.01, `${input}: body not centred on x`);

  // a wheel placed the HighRoads way spans its own radius and width about the holder, tread outward
  const w = car.wheels.FR;
  w.position.set(m.trackHalf, m.wheelRadius, -m.wheelbaseHalf);
  w.updateMatrixWorld(true);
  const wb = new THREE.Box3().setFromObject(w, true);
  assert.ok(Math.abs(wb.min.y) < 0.03 && Math.abs(wb.max.y - 2 * m.wheelRadius) < 0.03, `${input}: wheel does not stand on the ground`);
  assert.ok(Math.abs((wb.min.z + wb.max.z) / 2 + m.wheelbaseHalf) < 0.02, `${input}: wheel not on its axle`);
  assert.ok(wb.max.x - wb.min.x < m.wheelWidth + 0.03, `${input}: wheel axle is not along X`);

  // exhaust tips: one per mouth, at the tail behind the body's rear, where the exhaust geometry ends
  const nTips = [0, 1, 2, 4][car.params.exType | 0];
  assert.equal(m.exhaustTips.length, nTips, `${input}: ${m.exhaustTips.length} exhaust tips for type ${car.params.exType}`);
  const pipes = new THREE.Box3();
  car.body.traverse((o) => { if (o.isMesh && o.visible && o.material === car.materials.acc.burnt) pipes.expandByObject(o, true); });
  for (const [x, y, z] of m.exhaustTips) assert.ok(pipes.expandByScalar(0.001).containsPoint(new THREE.Vector3(x, y, z)) && Math.abs(z - pipes.max.z) < 0.03, `${input}: exhaust tip at ${[x, y, z].map((v) => v.toFixed(2))} is not at a mouth`);

  // setters act on this car only
  car.setColor('#ff0000');
  assert.equal(car.materials.paint.color.getHexString(), 'ff0000');
  car.setBrake(1); const hi = car.materials.lamp.red.emissiveIntensity; car.setBrake(0);
  assert.ok(hi > car.materials.lamp.red.emissiveIntensity, `${input}: brake lights do not brighten`);
  car.dispose();
}

// two cars do not share paint
const a = createCar('sedan', { detail: 0 }), b = createCar('sedan', { detail: 0 });
a.setColor(0x00ff00);
assert.notEqual(b.materials.paint.color.getHexString(), '00ff00', 'cars share a paint material');

// in-place update keeps the same objects (a garage can hold references)
const body = a.body, fl = a.wheels.FL;
a.update({ ...PRESETS.suv, rimType: 3 });
assert.ok(a.body === body && a.wheels.FL === fl && a.metrics.wheelRadius === PRESETS.suv.wheelR, 'update() replaced the objects');

// metrics describe the shell: bolt-on accessories (mirrors, masts, wings, tips, plates) never resize it
const bare = { ...PRESETS.wagon, plateType: 0, exType: 0, spType: 0, mrType: 0, anType: 0, grType: 0, hdType: 0 };
const full = { ...PRESETS.wagon, plateType: 1, exType: 1, spType: 4, mrType: 1, anType: 2, anLen: 1, grType: 1, hdType: 1 };
const mb = createCar(bare, { detail: 0 }).metrics, mf = createCar(full, { detail: 0 }).metrics;
for (const k of ['bodyHeight', 'bodyHalfWidth', 'bodyFrontZ', 'bodyRearZ']) assert.ok(Math.abs(mb[k] - mf[k]) < 1e-6, `accessories changed metrics.${k}: ${mb[k]} -> ${mf[k]}`);
// a part switched off is hidden with its old geometry; it must not stay in the box
const c = createCar(full, { detail: 0 }).update(bare);
assert.ok(Math.abs(c.metrics.bodyHalfWidth - mb.bodyHalfWidth) < 1e-6, 'hidden parts still measured');

// schema covers the editor's parameters, with option names for the discrete ones
assert.ok(PARAMS.length > 90 && PARAMS.every((p) => p.key && p.label && p.min < p.max), 'parameter schema incomplete');
assert.deepEqual(PARAMS.find((p) => p.key === 'rimType').options.length, 5);
console.log(`ok library: deterministic seeds, HighRoads frame and contract, per-car materials, ${PARAMS.length} parameters`);
