# MK8 Grand Prix (MK-130)

A cup's races one after another for points, then the podium.

- `grandPrix.ts` (pure, unit tested): the cup state `Mk8GrandPrix` — its courses, its 8 entrants
  (you first, then 7 MK8 racers in their default karts picked by a seed from cup + class + your
  racer) and each race's finishing order. Kart id = entrant index in every race, so a race's
  `state.positions` are entrant indices. Points are MK8's 15-12-10-9-8-7-6-5 (`results.ts`'s
  `pointsFor`); the standings sort by points, a tie going to the better place in the last race.
  The grid is the reverse of the standings (you start last in race 1).
- Courses are data-driven: `gpCourses(cup)` keeps the cup's courses that have drivable content
  (`src/mk8/content/courses/`), so courses not merged yet are skipped and a cup runs from its first
  course on (Mario Kart Stadium, Water Park since MK-122, Sweet Sweet Canyon since MK-123). The cup select tags the skipped ones
  "Not installed" in a Grand Prix.
- `trophies.ts`: the best trophy per cup and engine class, in its own storage key
  (`kart-racer:mk8-trophies`); the cup select shows it as a badge on the cup.
- `scripted.ts`: the scripted 150cc Mushroom Cup the `mk8-gp-*` scenarios use (all 4 courses,
  MK-121's field), named by each scenario's `mk8Start` hint.

How it flows: `raceSetup(flow, gp?)` (`src/mk8/flow.ts`) starts a cup on a Grand Prix's first race
and puts `gp` + `field` (the karts and their grid slots) on the race setup; the game races that
field (`RaceConfig.racers`). `raceScreens.ts` shows the results with the cup's earlier points,
records the race, and goes on to the next course (`Next race`) or, after the last, the podium
(`Awards`: `ui/screens/podium.ts` over `render/podium.ts`). Quitting mid-cup (pause menu or
results) asks first (`ui/screens/confirm.ts`).

Scenarios (`src/scenarios/mk8/grandPrix.ts`, test ramp, no pack): `mk8-gp-race2`,
`mk8-gp-standings`, `mk8-gp-podium`. Real-pack notes: the podium picks the trophies model's node
whose name has `mushroom`/`kinoko` (else the whole model) — check against a local pack.
