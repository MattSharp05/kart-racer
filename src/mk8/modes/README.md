# MK8 VS Race and Time Trial (MK-131)

Race rules by game mode, pure (no DOM), applied to a fresh race by `src/game/flow.ts`
(`applyModeRules`) before it draws. A Grand Prix (`src/mk8/gp/`) has none.

- `vsRace.ts`: the VS settings (`VsRules`: items `on` / `off` / `mushrooms` / `shells` /
  `bananas`, CPU `easy` / `normal` / `hard`). No items takes the item boxes out; "… only" sets
  `SimState.itemPool` (`ITEM_POOLS`: the family's singles and triples), which the roulette keeps to
  (`sim/items/index.ts`, weighted by the MK8 odds row, evenly when the row gives none of them);
  the CPU setting multiplies each AI's seeded skill by `tuning.mk8.vsCpu` (`src/sim/tuning/mk8/modes.ts`).
  The settings screen is `ui/screens/vsSettings.ts`; in a VS Race it takes the engine class
  screen's place (it has the class row) and the rules ride on `Mk8Flow.vs` → `Mk8RaceSetup.vs`
  (kept by Next course and Retry).
- `timeTrial.ts`: the player alone on pole (`timeTrialField`, `Mk8RaceSetup.field`), no item boxes,
  Triple Mushrooms with `tuning.mk8.timeTrial.mushrooms` uses, `SimState.timeTrial` (the HUD hides
  the position and shows the clock and lap splits under the minimap). The results save the race
  time and best lap in the game's records store (`game/storage/records.ts`) under `mk8:<course>`
  per engine class — apart from our tracks' records, and whatever track stood in for the course —
  and say "New record!" when either improves. The cup select's course cards show the best race.

Courses not drivable yet (no course folder in `content/courses/`) show "Not installed" on the
course select in every mode and can't be started. Ghosts and MK8 leaderboards are out of scope.

Scenarios (`src/scenarios/mk8/vsTimeTrial.ts`): `mk8-vs-settings`, `mk8-tt-stadium` (needs the
pack), `mk8-tt-ramp`, `mk8-tt-new-record`, `mk8-tt-slower`, `mk8-tt-courses` (test ramp / menus,
no pack). E2E: `tests/e2e/mk8VsTimeTrial.spec.ts`.
