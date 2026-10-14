# Car-gen

Asset-free parametric car generator for three.js. Every car (body, greenhouse, lamps, wheels, flares, body kit, roof
gear) is built from numbers at runtime. Nothing is loaded.

It is two things from one source tree:

- **The editor**: `index.html`, a standalone app with presets, Generate, side/top/section editors and every parameter
  as a slider. This is what GitHub Pages serves.
- **The library**: `src/index.js`, a no-build ES module a game imports to create cars (built for
  [HighRoads](https://github.com/YigitSalihEmecen/HighRoads)).

No build step anywhere: plain ES modules, `three` resolved by the page's import map.

## Run the editor

```sh
npm start            # python3 -m http.server 8642
open http://127.0.0.1:8642/
```

**GitHub Pages**: Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`. The editor is
`https://<user>.github.io/Car-gen/`. The library example is at `…/Car-gen/examples/highroads.html`.

## Layout

```
index.html          editor shell, import map, all CSS
src/
  index.js          LIBRARY ENTRY: createCar(), randomParams(), schema; no DOM
  render.js         three.js side: materials, paint shader, CarMesh (used by the editor and the library)
  params.js         parameter schema (groups, ranges, option names); drives the editor panel
  car.js            the generator: presets, sanitize, randomCar, buildCar (pure math, typed arrays, no three.js)
  cabin.js lights.js lightbar.js flares.js kit.js roof.js wheels.js   parts
  app.js            the editor only (scene, UI, orthographic editors)
examples/
  highroads.html    the library used exactly as HighRoads uses its car models
test/
  car.test.mjs      geometry suite (no three.js needed)
  lib.test.mjs      library contract (needs three: `npm run test:deps` once)
```

`app.js` is the only file that touches the DOM. Everything under it can be imported by a game.

## Use it as a library

### Getting the code into a game

The same way HighRoads takes `engine_sim`, as a git submodule:

```sh
git submodule add -b main https://github.com/YigitSalihEmecen/Car-gen.git car_gen
git submodule update --remote car_gen      # pull the latest generator
```

Then `import { createCar } from './car_gen/src/index.js'`. The host page's import map decides which three.js the
generator uses, so there is exactly one copy (three is a peer dependency).

**Live editing across both repos**: develop inside the game's `car_gen/` checkout (it is a full clone: commit and
push from there). Or replace it with a symlink to your local Car-gen clone while working. A reload of the game picks up
every change, since nothing is compiled.

### API

```js
import { createCar, randomParams, PRESETS, PARAMS } from './car_gen/src/index.js';

const car = createCar('player-42', { detail: 0.5 });   // seed (same seed = same car), preset name, or parameter object
scene.add(car.body);
for (const k of ['FL', 'FR', 'BL', 'BR']) scene.add(car.wheels[k]);
```

`createCar(input, { detail })` returns the same shape as HighRoads' `assets.loadCarModel()`:

| field | |
|---|---|
| `body` | `THREE.Group`, everything but the wheels |
| `wheels.FL/FR/BL/BR` | holder groups: origin at the axle centre, spin about local X, steer about Y |
| `metrics` | `trackHalf`, `wheelbaseHalf`, `wheelRadius`, `wheelWidth`, `bodyHeight`, `bodyHalfWidth`, `bodyHalfLength`, plus `bodyFrontZ`, `bodyRearZ`, `triangles` |
| `params` | the full parameter object (store it to rebuild the car later) |
| `setColor(c)` | main paint (hex number or CSS string) |
| `setTrimColor(c)` | second colour, shown as a contrast roof; `null` removes it |
| `setBrake(t)` | 0..1, running glow to full brake lights |
| `setHeadlights(on, flash)` | head lamps |
| `update(input)` | rebuild in place (same objects), for a garage editor |
| `dispose()` | free geometry, materials, textures |

**Frame** (HighRoads' convention): front toward −Z, +X right, +Y up, origin on the ground midway between the axles.
Place wheel holders at `(±trackHalf, wheelRadius, ±wheelbaseHalf)`, with FL at `(−, −)`. The body is not centred on the
origin when the overhangs differ; `bodyFrontZ` / `bodyRearZ` give its real extent.

Every car owns its materials, so cars can be painted and braked independently. For traffic, build a few cars and
`clone(true)` their `body` / wheels: clones share geometry and materials, like HighRoads' roster clones.

**Detail** (triangles per car, wheels included): 0 → about 10k, 0.4 → about 28k, 1 → about 75k (the editor). Build cost
is about 50–100 ms per car below 0.6, so build traffic up front or across frames.

**Schema**: `PARAMS` lists every editor parameter as `{ key, label, min, max, step, unit, group, tab, options? }`
(`SPEC` is the grouped form). A garage UI can generate its controls from it and stay in sync with the editor.
`pillarCount` is virtual: use `setPillarCount(params, n)`.

## Tests

```sh
npm run test:deps    # once: installs three for the library test (not saved)
npm test
```
