# MK-92 spike: anti-gravity on a mesh course

Prototype, not production code. `/?spike=antigrav` (listed on `/dev`) drives one surface-frame
kart on a mesh course with keyboard or touch; `P` toggles an autopilot, `R` restarts.

**Changed scope:** the real Mario Kart Stadium mesh wasn't available to the spike, so it runs on a
**synthetic anti-gravity course** generated in code (`course.ts`) and written as OBJ text, so it
goes through the same OBJ → collision path as a real course. Nothing was downloaded and no
Nintendo asset is committed. The real-mesh checks are deferred (end of this file).

| File                           | What                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `course.ts`                    | Synthetic course → OBJ text + centreline                                                                                                                    |
| `obj.ts`                       | Minimal OBJ reader (positions, faces, `usemtl`)                                                                                                             |
| `collision.ts`                 | Collision mesh from OBJ triangles (byte-identical to the MK-93 pipeline); ray and wall queries now call `src/sim/meshTrack.ts` (MK-98)                      |
| `kart.ts`                      | Surface-frame kart step                                                                                                                                     |
| `frame.ts`                     | Question 4: heading → forward on a surface                                                                                                                  |
| `autopilot.ts`, `bench.ts`     | Centreline follower; drive stats and query timings                                                                                                          |
| `main.ts`, `spike.css`         | The page                                                                                                                                                    |
| `scripts/antigravSpike.lab.ts` | `pnpm mk8:spike-report`: prints every number below                                                                                                          |
| `tools/mk8/collisionFormat.ts` | The browser-safe half of `tools/mk8/collision.ts` (guesses, `collision.bin` writer); surfaces, grid and reader moved to `src/sim/meshCollision.ts` in MK-98 |

## The synthetic course

A 651 m loop: straight A with a **barrel roll** (the road twists 360° around the straight's axis
over 200 m, radius 12 m: up the wall, along the ceiling, down the other wall), a flat 180° turn, a
straight back with two dash panels, and a 180° turn **banked to 80°** (a wall ride). The roll and
the banked turn are anti-gravity. 14 m road, 5 m verges, guard rails, plus decoration: trees, a
crowd stand and a sky dome. `detail` scales the tessellation (2 = 4× the triangles).

## Answers

### 1. Material names → surfaces (real-mesh check deferred)

Proposed rules (`SURFACE_RULES` in `tools/mk8/collisionFormat.ts`, used for the material map stub
by `pnpm mk8:build`), first match wins on the lower-cased name:

| Pattern                                                                          | Surface    |
| -------------------------------------------------------------------------------- | ---------- |
| `sky cloud tree leaf crowd audience flag banner light effect fx deco shadow ^bg` | `ignore`   |
| `water sea river lake pool`                                                      | `water`    |
| `dash boost`                                                                     | `boost`    |
| `wall fence rail barrier guard`                                                  | `wall`     |
| `grass dirt sand mud gravel offroad rough`                                       | `offroad`  |
| `anti.?grav zero.?g` (new in MK-92)                                              | `antigrav` |
| `glide jump`                                                                     | `glide`    |
| anything else                                                                    | `road`     |

On the synthetic course they map all 11 materials correctly (`collision.test.ts`). The order
matters: `Wall_AntiGrav_Rail` must be a wall and `Grass_Verge_AG` offroad, so `antigrav` comes
after `wall` and `offroad`. Two things the rules can't know and the per-course map
(`tools/mk8/materials/<id>.json`) must fix by hand: anti-gravity sections whose road material
isn't named for it (MK8's real names are unknown until the mesh is in), and scenery with a
neutral name (it falls back to `road`, so it becomes drivable). **Deferred:** listing Stadium's
real materials and checking these rules against them.

### 2. Triangle counts and query cost

| Course                       | Raw    | After dropping decoration | In `collision.bin`       | `collision.bin` |
| ---------------------------- | ------ | ------------------------- | ------------------------ | --------------- |
| Spike course (detail 1)      | 23,596 | 16,084                    | 16,084 (under the cap)   | 0.81 MB         |
| Dense (detail 2), simplified | 65,332 | 57,820                    | 29,586 (cap 25k: missed) | 1.37 MB         |

Ground query: the kart's 5 rays along −up (4 wheels + centre), 8 karts per tick, timed in Node
over one recorded lap with the karts spread round it (`pnpm mk8:spike-report`, fastest of 5
rounds; Linux cloud container):

| Course | Grid cell | Mean ms / tick | p99 ms | Triangles tested per kart | File    |
| ------ | --------- | -------------- | ------ | ------------------------- | ------- |
| Spike  | 8 m       | 0.168          | 0.274  | 448                       | 0.68 MB |
| Spike  | **4 m**   | **0.074**      | 0.118  | 160                       | 0.81 MB |
| Spike  | 2 m       | 0.056          | 0.170  | 72                        | 1.56 MB |
| Dense  | 8 m       | 0.301          | 0.374  | 689                       | 1.22 MB |
| Dense  | **4 m**   | **0.137**      | 0.248  | 236                       | 1.37 MB |
| Dense  | 2 m       | 0.078          | 0.172  | 99                        | 2.19 MB |

The whole kart step (ground + walls + physics) for 8 karts is 0.13 ms (spike) / 0.16 ms (dense)
at 4 m. **8 m cells (the MK-93 default) were at the limit on the dense mesh, so the pipeline
default is now 4 m** (`COLLISION_DEFAULTS.cellSize`): half the cost for ~10–20 % more bytes.
`groundQuery.perf.test.ts` held both courses under 0.3 ms in `pnpm test:perf`; MK-98 replaced it with
`src/sim/meshTrack.perf.test.ts` (the production queries, 8 karts × ground + wall).

Finding: the pipeline's simplifier didn't reach the 25k cap (57,820 → 29,586) because it
simplifies each surface separately with `LockBorder`, and a ribbon road is mostly border. The
mesh-tracks ticket should either accept "about 30k" or drop `LockBorder` for interior strips.

### 3. Staying stuck through anti-gravity at 150cc

Yes, on both the spike course and the simplified dense one: 2 autopilot laps at full throttle,
0 respawns, 0 ticks off the ground on anti-gravity, upside down (`up.y` = −1.000) through the
roll at 27.8 m/s (150cc top speed is 28), up to 80° on the banked turn. No edge jitter: `up`
turns at most 1.5°/tick (2.5° on the simplified mesh, whose triangles are bigger) and the ride
height stays within 3 cm. What made it work:

- **Four wheel rays, averaged normal, eased `up`** (rate 14/s). Face normals alone are enough;
  `collision.bin` needs no vertex normals or adjacency.
- **Anti-gravity is a mode, not a triangle property:** set on `antigrav` ground, kept on offroad
  and walls (verges and rails in a section aren't anti-gravity material), cleared on plain road or
  a dash panel. While on, gravity is −up and the kart can't slide down a bank.
- **A longer ground snap in anti-gravity** (1.5 m vs 0.5 m) so it holds through convex bits, and
  a 0.35 s grace in the air where gravity stays −up.
- Without anti-gravity, ground steeper than 50° doesn't hold the kart (it falls off the same 80°
  bank, `kart.test.ts`).

Manual: Matthew drives it to judge whether it _feels_ like anti-gravity.

### 4. Existing tracks bit-identical with up = +Y

Only if `heading` stays the state on existing tracks. `frame.test.ts` shows:

- forward = (shortest rotation from +Y to `up`) · `forwardFromHeading(heading)` is **bit-identical**
  to the sim at up = +Y (20,000 headings, `Object.is` per component): the rotation is exactly the
  identity there.
- But that frame **flips upside down**: near up = −Y the shortest rotation is undefined, and two
  surfaces 0.1° apart give opposite forwards for the same heading. So a heading-in-the-plane state
  can't drive the barrel roll's ceiling.
- Integrating a `forward` vector instead (what this kart does) works upside down but is not
  bit-identical to integrating `heading` (same direction to 1e-13, different bits).

Proposed approach: mesh tracks keep `forward: Vec3` (+ `up`) as kart state and run the
surface-frame step; spline and arena tracks keep `heading` and today's step untouched, dispatched
on `track.kind`. Existing tracks are then identical by construction, and the existing determinism
and cross-engine state-hash tests are the regression guard (`src/sim/` is untouched by this spike,
and `pnpm test` passes).

## Proposed ADR amendments (ADRs 0010/0011 are in PR #110; not edited here)

**ADR 0010 (mesh tracks):**

- Grid cell 4 m by default (was implicit 8 m in MK-93): measured above.
- Simplification target is soft: per-surface simplification with locked borders lands ~20 % over
  25k on ribbon-heavy roads.
- Add the `antigrav` (and decoration) name rules to the material stub; per-course maps still
  needed.
- The collision builder is split: `tools/mk8/collisionFormat.ts` is browser- and sim-safe (grid,
  format, guesses) and the future `sim/meshTrack.ts` reader must match it (as the spike's does,
  byte for byte).
- 8-kart ground query measured at 0.07–0.14 ms (Node), well inside 0.3 ms.

**ADR 0011 (surface-frame physics):**

- Replace "`heading` stays as the yaw within the surface plane" with: mesh-track karts store
  `forward` + `up`; spline/arena karts keep `heading` and the current code path (question 4).
- Anti-gravity is a latched mode (set by `antigrav` ground, cleared by plain road), not per
  triangle; add `antigrav: boolean` to `KartState`.
- `up` = average of the four wheel-ray normals, eased at a tuning rate (14/s in the spike);
  ground snap distance per mode (0.5 m / 1.5 m); air grace 0.35 s.
- "Slopes steeper than a tuning limit act as walls" → steeper than 50° without anti-gravity, the
  kart loses the ground and falls (it isn't pushed back like a wall).
- Online: `up` octahedral quantisation still fine; `forward` needs the same (2 × 16 bits).

## Follow-ups for the planned tickets

- **Mesh tracks (done in MK-98):** port `CollisionWorld.raycast`/`wallContacts` into `sim/meshTrack.ts` without
  closures (fixed iteration order is already there: cells, then ascending triangle). Start a real
  course from the route, not `realStart` (the spike's guess: the road triangle nearest the mesh
  centre).
- **Surface-frame physics:** port `kart.ts`'s grounded/air/anti-gravity logic onto the real kart
  step (drift, boosts, items) for `kind: 'mesh'` only; keep the four-ray average.

## Deferred until the real mesh is provided

Run with the course in `.mk8-raw/models/mario-kart-stadium/` (OBJ + MTL), `pnpm mk8:build`, then
`pnpm dev` and `/?spike=antigrav&course=stadium` (the dev server serves `.mk8-out/` at `/mk8/`;
no code change needed). Still to check there:

1. Stadium's real material list and the mapping (question 1).
2. Stadium's triangle counts before/after and its `collision.bin` size.
3. "Loads Stadium collision in < 5 s" (the synthetic course loads in well under a second).
4. Driving Stadium's own anti-gravity section at 150cc (the real course has no route yet, so the
   kart starts on the road triangle nearest the mesh centre and is driven by hand).
5. The 8-kart query cost on Stadium's mesh (the bench needs recorded poses; drive it on the page
   and read the HUD's `query` line, or extend `bench.ts`).
