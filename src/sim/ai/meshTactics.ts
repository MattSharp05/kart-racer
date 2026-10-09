// The AI's MK8 tactics on mesh courses (MK-128), beyond driving the line (`./meshDriver.ts`) and
// items (`./meshItems.ts`): small detours for coins, steering into a kart beside it in
// anti-gravity for a spin boost (MK-108), lining up on a glide ramp's middle, and diving or
// floating on the glider by whether there's ground to land on. Numbers in `tuning.mk8.courseAi`.
import { clamp, dot, sub, type Vec3 } from '../math';
import { meshFallLimits, raycastMesh, surfaceMask, type MeshTrackDef } from '../meshTrack';
import { routeGeometry, type RouteGeometry } from '../route';
import { tuning } from '../tuning';
import type { AiState, KartState, SimState } from '../types';

/** What a glide can come down on (and the void under a gap, which it mustn't). */
const LANDABLE_OR_VOID = surfaceMask('road', 'offroad', 'boost', 'antigrav', 'glide', 'void');
const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

/** Signed metres round the lap from `from` to `to`, in (−length/2, length/2]. */
function gap(geometry: RouteGeometry, from: number, to: number): number {
  let d = to - from;
  if (d > geometry.length / 2) d -= geometry.length;
  if (d <= -geometry.length / 2) d += geometry.length;
  return d;
}

/** The narrowest the road gets from `s` to `s + distance`, m (sampled every 2 m). */
export function minWidthAhead(geometry: RouteGeometry, s: number, distance: number): number {
  let narrowest = Infinity;
  for (let d = 0; d <= distance; d += 2)
    narrowest = Math.min(narrowest, geometry.frameAt((s + d) / geometry.length).width);
  return narrowest;
}

/** Line coins never move: their route projections, once per route. */
const coinProjections = new WeakMap<RouteGeometry, Map<number, { s: number; lateral: number }>>();

/**
 * Metres to add to the racing line this tick for a tactic (0: none): towards a kart beside it in
 * anti-gravity (a spin boost for both), else towards a coin just off its line ahead (while it has
 * room for more coins). `here`: the kart's place on the route.
 */
export function meshTacticOffset(
  kart: KartState,
  ai: AiState,
  state: SimState,
  geometry: RouteGeometry,
  here: { s: number; t: number; lateral: number },
): number {
  const cfg = tuning.mk8.courseAi;
  const line = (s: number) => geometry.racingLineAt(s) + ai.lineOffset;

  const roomy = minWidthAhead(geometry, here.s, cfg.bumpAlong * 4) >= cfg.minWidth;
  if (kart.antigrav && (kart.spinBoostTimer ?? 0) <= 0 && roomy) {
    let best: number | undefined;
    let bestDistance = Infinity;
    for (const other of state.karts) {
      if (other.id === kart.id || !other.antigrav || other.respawnTimer > 0) continue;
      const p = geometry.project(other.position, here.t);
      const along = gap(geometry, here.s, p.s);
      const across = Math.abs(p.lateral - here.lateral);
      if (Math.abs(along) > cfg.bumpAlong || across > cfg.bumpReach) continue;
      if (across < bestDistance) {
        bestDistance = across;
        best = p.lateral - line(here.s);
      }
    }
    if (best !== undefined) return clamp(best, -cfg.bumpMaxOffset, cfg.bumpMaxOffset);
  }

  const coins = state.coins;
  if (!coins?.length || (kart.coins ?? 0) >= tuning.mk8.coins.max) return 0;
  let cache = coinProjections.get(geometry);
  if (!cache) coinProjections.set(geometry, (cache = new Map()));
  let target: number | undefined;
  let nearest = Infinity;
  for (const coin of coins) {
    if (coin.respawnTimer > 0) continue;
    if (coin.ownerId === kart.id && (coin.ownerImmune ?? 0) > 0) continue;
    // A line coin's place is the same for everyone (no kart's hint: cached once, like item boxes);
    // a dropped one's is searched near this kart.
    const lineCoin = coin.life === undefined;
    let p = lineCoin ? cache.get(coin.id) : undefined;
    if (!p) {
      const full = lineCoin
        ? geometry.project(coin.position)
        : geometry.project(coin.position, here.t);
      p = { s: full.s, lateral: full.lateral };
      if (lineCoin) cache.set(coin.id, p);
    }
    const d = gap(geometry, here.s, p.s);
    if (d <= 1 || d > cfg.coinRange || d >= nearest) continue;
    const offset = p.lateral - line(p.s);
    if (Math.abs(offset) > cfg.coinDetour) continue;
    nearest = d;
    target = offset;
  }
  return target ?? 0;
}

/**
 * The lateral aim on the way to a glide ramp: its middle (0 m from the centreline) from
 * `courseAi.glideLead` m before it to its lip, or undefined elsewhere.
 */
export function glideRampLine(geometry: RouteGeometry, track: MeshTrackDef, s: number) {
  for (const zone of track.route.zones) {
    if (zone.kind !== 'glide') continue;
    const from = zone.from * geometry.length;
    const to = zone.to * geometry.length;
    const before = gap(geometry, s, from);
    const toLip = gap(geometry, s, to);
    if ((before >= 0 && before <= tuning.mk8.courseAi.glideLead) || (before < 0 && toLip > 0))
      return 0;
  }
  return undefined;
}

/**
 * The glider's pitch: dive (throttle) while there's drivable ground below to come down on, float
 * (brake) over a gap or a lake, so it stretches the flight to the far side. Ground far below the
 * route there (MK-128 revisit: Mario Kart Stadium's infield under its glide, at 3× scale) is a pit
 * to float over, not a landing: coming down in it is a fall.
 */
export function glidePitch(
  kart: KartState,
  track: MeshTrackDef,
): { throttle: number; brake: number } {
  const cfg = tuning.mk8.courseAi;
  const reach = cfg.glideGroundBelow * (track.scale ?? 1);
  const hit = raycastMesh(track.collision, kart.position, DOWN, reach, LANDABLE_OR_VOID);
  if (!hit || hit.surface === 'void') return { throttle: 0, brake: 1 };
  const geometry = routeGeometry(track.route);
  const hint = kart.race.lastT >= 0 ? kart.race.lastT : undefined;
  const frame = geometry.frameAt(geometry.project(hit.point, hint).t);
  const depth = -dot(sub(hit.point, frame.position), frame.up);
  return depth < meshFallLimits(track).depth * cfg.glideLandingDepth
    ? { throttle: 1, brake: 0 }
    : { throttle: 0, brake: 1 };
}
