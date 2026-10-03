// Courses for MK8 driving scenarios (MK-99, MK-105). `main.ts` awaits `prepareMk8Scenario` before an
// `mk8-*` course scenario is set up, so the course it drives on is registered by then: the
// synthetic test ramp (built in code, no pack needed) always, and a real course (`mk8-stadium-*`:
// Mario Kart Stadium) from the pack: locally from `pnpm dev`'s `$MK8_OUT`, on the site behind its
// password (MK-135). Without the pack the scenario shows "MK8 pack not installed"; with the site's
// pack still locked, the password box (then the page reloads into the scenario).
import { tracks } from '../content/tracks';
import { mk8Course, type Mk8CourseContent } from './content/courses';
import { registerTestRamp } from './content/courses/test-ramp/register';
import { loadMk8Course } from './courses';
import { loadEditorRoute } from './editorRoute';
import { packLoader } from './index';
import { PackLockedError, PackLoadError, PackNotInstalledError } from './loader';
import { registerMk8Content } from './register';

/** How the scenario's course stands: registered, not in a pack here, or behind the password. */
export type Mk8CourseState = 'ready' | 'missing' | 'locked';

/** Course scenarios by name prefix (`mk8-<key>-…`) → the course's pack id. */
const SCENARIO_COURSES: Record<string, string> = { 'mk8-stadium-': 'mario-kart-stadium' };

/** The course `scenario` drives on, if it's a real course's scenario. */
export function scenarioCourse(scenario: string): Mk8CourseContent | undefined {
  const prefix = Object.keys(SCENARIO_COURSES).find((p) => scenario.startsWith(p));
  return prefix ? mk8Course(SCENARIO_COURSES[prefix] ?? '') : undefined;
}

/**
 * Gets the course `scenario` drives on ready: the test ramp always (cheap), and a real course from
 * the pack when it's one of that course's scenarios. `&editorRoute=1` drives the track editor's
 * unsaved route instead of the committed one (its Test drive button, MK-100).
 */
export async function prepareMk8Scenario(
  scenario: string,
  search: string,
): Promise<Mk8CourseState> {
  registerTestRamp();
  // MK8's item set and racers, for the races' setup (`createRace` looks the item set up).
  registerMk8Content();
  const course = scenarioCourse(scenario);
  if (!course || tracks.has(course.trackId)) return 'ready';
  const fromEditor = new URLSearchParams(search).get('editorRoute') === '1';
  const route = fromEditor ? loadEditorRoute(course.packId) : undefined;
  try {
    const loaded = await loadMk8Course(packLoader(), course, undefined, route ? { route } : {});
    return loaded ? 'ready' : 'missing';
  } catch (e) {
    if (e instanceof PackLockedError) return 'locked';
    if (!(e instanceof PackNotInstalledError || e instanceof PackLoadError)) console.error(e);
    return 'missing';
  }
}
