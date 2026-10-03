// AI item use on mesh tracks (MK-129): the same item tactics as on spline tracks (`./items.ts`),
// with the route (`sim/route.ts`) as the lap the karts are judged along and its turns as the
// straights test. Kept apart from `./meshDriver.ts`, which steers.
import type { MeshTrackDef } from '../meshTrack';
import { routeGeometry } from '../route';
import { DT } from '../tuning';
import type { AiState, InputFrame, KartState, SimState } from '../types';
import { aiItemInput } from './items';
import { maxTurnAhead } from './meshDriver';

/** No racing line offsets on a route (the route carries its own racing line). */
const NO_LINE: readonly number[] = [];

/** The item button (and any pedal it needs) for an AI kart on a mesh track this tick. */
export function meshAiItemInput(
  kart: KartState,
  ai: AiState,
  state: SimState,
  track: MeshTrackDef,
): Partial<InputFrame> {
  const geometry = routeGeometry(track.route);
  const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
  const here = geometry.project(kart.position, hint).s;
  return aiItemInput(kart, ai, state, geometry, NO_LINE, DT, (metres) =>
    maxTurnAhead(geometry, here, metres),
  );
}
