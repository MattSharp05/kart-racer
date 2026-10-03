// Track editor → game handoff (MK-100). The editor keeps its unsaved route for a course in
// localStorage under one key: it restores it as a draft after a reload, and its Test drive button
// opens `?scenario=mk8-<course>-free&editorRoute=1`, whose scenario drives on this route instead of
// the committed `route.ts`.
import type { RouteDef } from '../sim/route';

export const editorRouteKey = (courseId: string): string => `mk8-track-editor:route:${courseId}`;

/** Scenario names of courses whose short key isn't their pack id (`mk8-stadium-*`, `mk8-waterpark-*`, `mk8-canyon-*`). */
const SCENARIO_KEYS: Record<string, string> = {
  'mario-kart-stadium': 'stadium',
  'water-park': 'waterpark',
  'sweet-sweet-canyon': 'canyon',
};

/** The free-drive scenario link for a course, using the editor's unsaved route. */
export const testDriveUrl = (courseId: string): string =>
  `/?scenario=mk8-${SCENARIO_KEYS[courseId] ?? courseId}-free&editorRoute=1`;

const LISTS = [
  'points',
  'checkpoints',
  'respawnPoints',
  'gridSlots',
  'itemBoxRows',
  'coinLines',
  'zones',
] as const;

function isRoute(value: unknown): value is RouteDef {
  if (typeof value !== 'object' || value === null) return false;
  return LISTS.every((list) => Array.isArray((value as Record<string, unknown>)[list]));
}

export function saveEditorRoute(courseId: string, route: RouteDef, storage?: Storage): void {
  try {
    (storage ?? localStorage).setItem(editorRouteKey(courseId), JSON.stringify(route));
  } catch {
    // Storage full or blocked: the draft just isn't kept.
  }
}

/** The editor's unsaved route for `courseId`, if there is one. */
export function loadEditorRoute(courseId: string, storage?: Storage): RouteDef | undefined {
  try {
    const raw = (storage ?? localStorage).getItem(editorRouteKey(courseId));
    const value: unknown = raw ? JSON.parse(raw) : undefined;
    return isRoute(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function clearEditorRoute(courseId: string, storage?: Storage): void {
  try {
    (storage ?? localStorage).removeItem(editorRouteKey(courseId));
  } catch {
    // Nothing to clear.
  }
}
