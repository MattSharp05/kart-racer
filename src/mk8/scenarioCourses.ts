// Courses for MK8 driving scenarios (MK-99, MK-105). `main.ts` awaits `prepareMk8Scenario` before a
// scenario with an `mk8Course` is set up, so the course it drives on is registered by then: the
// synthetic test ramp (built in code, no pack needed) always, and a real course (its pack id, e.g.
// `mario-kart-stadium` for the `mk8-stadium-*` scenarios) from the pack: locally from `pnpm dev`'s
// `$MK8_OUT`, on the site behind its password (MK-135). Without the pack the scenario shows "MK8 pack not installed"; with the site's
// pack still locked, the password box (then the page reloads into the scenario).
import { tracks } from '../content/tracks';
import { mk8Course } from './content/courses';
import { registerTestRamp } from './content/courses/test-ramp/register';
import { loadMk8Course } from './courses';
import { loadEditorRoute } from './editorRoute';
import { packLoader } from './index';
import { PackLockedError, PackLoadError, PackNotInstalledError } from './loader';
import { registerMk8Content } from './register';

/** How the scenario's course stands: registered, not in a pack here, or behind the password. */
export type Mk8CourseState = 'ready' | 'missing' | 'locked';

/**
 * Gets a scenario's course ready (`course`: its `mk8Course`): the test ramp always (cheap), and a
 * real course from the pack when `course` is an MK8 course's pack id. `&editorRoute=1` drives the
 * track editor's unsaved route instead of the committed one (its Test drive button, MK-100).
 */
export async function prepareMk8Scenario(course: string, search: string): Promise<Mk8CourseState> {
  registerTestRamp();
  // MK8's item set and racers, for the races' setup (`createRace` looks the item set up).
  registerMk8Content();
  const content = mk8Course(course);
  if (!content || tracks.has(content.trackId)) return 'ready';
  const fromEditor = new URLSearchParams(search).get('editorRoute') === '1';
  const route = fromEditor ? loadEditorRoute(content.packId) : undefined;
  try {
    const loaded = await loadMk8Course(packLoader(), content, undefined, route ? { route } : {});
    return loaded ? 'ready' : 'missing';
  } catch (e) {
    if (e instanceof PackLockedError) return 'locked';
    if (!(e instanceof PackNotInstalledError || e instanceof PackLoadError)) console.error(e);
    return 'missing';
  }
}
