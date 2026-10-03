# MK8 scenarios (MK-142)

MK8 Mode's scenarios (`/dev` → MK8 Mode), one file per feature area. Every `*.ts` here (not
`index.ts`, not tests) default-exports a `Scenario[]`, and `index.ts` collects them with
`import.meta.glob`, so a new group is a new file and nothing else. Helpers shared between groups
live in `lib/` (not collected). Scenario names never change: tickets link to them
(`index.test.ts` keeps the list).

- Opening MK8 Mode somewhere: `setup: openMk8('<start>')` (`lib/menus.ts`), a start from
  `Mk8Start` (`src/mk8/index.ts`) or a menu screen's `starts` (`src/mk8/ui/screens/`).
- Driving an MK8 course: set `mk8Course` (the course's pack id, or the test ramp's id) and build
  the state with `onCourse` (`lib/courses.ts`); `main.ts` registers the course before setup.

Example, a new `src/scenarios/mk8/gliders.ts`:

```ts
// Gliding (MK-xxx) on Mario Kart Stadium's glide ramp.
import type { Scenario } from '../registry';
import { courseAntigrav, onCourse } from './lib/courses';
import { MK8_STADIUM_ID } from './stadium';

const scenarios: Scenario[] = [
  {
    name: 'mk8-stadium-glide',
    group: 'MK8 Mode',
    description: 'Rolling onto the glide ramp: the glider opens.',
    defaultSeed: 1,
    mk8Course: 'mario-kart-stadium',
    setup: onCourse(MK8_STADIUM_ID, (track, seed) => courseAntigrav(track, seed, 10)),
  },
];
export default scenarios;
```
