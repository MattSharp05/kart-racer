// AI items on mesh tracks (MK-129), as on spline tracks (`./items.ts`): when to use them (the same
// tactics, judged along the route, `sim/route.ts`, with its turns as the straights test), and where
// to steer for them (round a banana it has spotted, towards an item box with a slot free). Kept
// apart from `./meshDriver.ts`, which drives (and adds `ai.steerOffset` to its line).
import { clamp } from '../math';
import type { MeshTrackDef } from '../meshTrack';
import { routeGeometry, type RouteGeometry } from '../route';
import { DT, tuning } from '../tuning';
import type { AiState, InputFrame, KartState, SimState } from '../types';
import { aiItemInput, pairChance } from './items';
import { maxTurnAhead } from './meshDriver';

/** How far either way the AI leaves its line for a box, m (as on spline tracks). */
const BOX_SEEK_MAX = 4;

/** Item boxes never move: their route projections, once per route. */
const boxProjections = new WeakMap<RouteGeometry, Map<number, { s: number; lateral: number }>>();

/** The kart's place on the route, searched near its last lap fraction. */
function hereOn(geometry: RouteGeometry, kart: KartState) {
  return geometry.project(kart.position, kart.race.lastT >= 0 ? kart.race.lastT : undefined);
}

/** Signed metres round the lap from `from` to `to`, in (−length/2, length/2]. */
function gap(geometry: RouteGeometry, from: number, to: number): number {
  let d = to - from;
  if (d > geometry.length / 2) d -= geometry.length;
  if (d <= -geometry.length / 2) d += geometry.length;
  return d;
}

/** Whether a box hit now would fill one of the kart's slots. */
function slotFree(kart: KartState): boolean {
  const { item } = kart;
  if (item.held === null && item.roulette === 0) return true;
  return item.second !== undefined && item.second.held === null && item.second.roulette === 0;
}

/**
 * Where to aim sideways this tick, m added to the racing line (`ai.steerOffset`): round the nearest
 * banana it has spotted on its line ahead, or else towards the nearest active item box ahead while
 * a slot is free. The spline tracks' `aiSteerOffset`, on the route.
 */
export function meshAiSteerOffset(
  kart: KartState,
  ai: AiState,
  state: SimState,
  track: MeshTrackDef,
): number {
  const cfg = tuning.ai;
  const geometry = routeGeometry(track.route);
  const here = hereOn(geometry, kart);
  const lineAt = (s: number) => geometry.racingLineAt(s) + ai.lineOffset;

  let dodge: number | undefined;
  let nearest = Infinity;
  for (const e of state.entities) {
    if (e.kind !== 'banana' || e.flightTimer > 0) continue;
    const dx = e.position.x - kart.position.x;
    const dy = e.position.y - kart.position.y;
    const dz = e.position.z - kart.position.z;
    if (dx * dx + dy * dy + dz * dz > cfg.dodgeRange * cfg.dodgeRange) continue;
    const p = geometry.project(e.position, here.t);
    const d = gap(geometry, here.s, p.s);
    if (d <= 0 || d > cfg.dodgeRange || d >= nearest) continue;
    const line = lineAt(p.s);
    if (Math.abs(p.lateral - line) > cfg.dodgeOffset) continue;
    const chance = clamp((ai.skill - cfg.dodgeSkillBase) * cfg.dodgeSkillGain, 0, 1);
    if (pairChance(e.id, kart.id) >= chance) continue;
    nearest = d;
    // Pass on whichever side has more road.
    dodge = p.lateral + (p.lateral > 0 ? -1 : 1) * cfg.dodgeOffset - line;
  }
  if (dodge !== undefined) return dodge;

  if (!slotFree(kart)) return 0;
  let cache = boxProjections.get(geometry);
  if (!cache) boxProjections.set(geometry, (cache = new Map()));
  let best: number | undefined;
  let bestScore = Infinity;
  for (const e of state.entities) {
    if (e.kind !== 'itemBox' || e.respawnTimer > 0) continue;
    let p = cache.get(e.id);
    if (!p) {
      const full = geometry.project(e.position);
      p = { s: full.s, lateral: full.lateral };
      cache.set(e.id, p);
    }
    const d = gap(geometry, here.s, p.s);
    if (d <= 2 || d > cfg.boxSeekRange) continue;
    const score = d + Math.abs(p.lateral - here.lateral) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = p.lateral - lineAt(p.s);
    }
  }
  return best === undefined ? 0 : clamp(best, -BOX_SEEK_MAX, BOX_SEEK_MAX);
}

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
  const here = hereOn(geometry, kart).s;
  return aiItemInput(kart, ai, state, geometry, NO_LINE, DT, (metres) =>
    maxTurnAhead(geometry, here, metres),
  );
}
