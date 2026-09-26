import { hazardPose } from '../hazards';
import type { HazardDef, MoverHazard, PeriodicHazard } from '../hazards/types';
import type { TrackGeometry } from '../splineTrack';
import { DT, tuning } from '../tuning';
import type { AiState, KartState } from '../types';
import { lineOffsetAt } from './racingLine';

/** The prediction looks at the movers every this many ticks. */
const PREDICT_TICKS = 6;
/** Sideways positions the AI considers driving at are this far apart, m. */
const LANE_STEP = 1;
/** …and keep this far inside the road's edges, m. */
const EDGE_MARGIN = 1.5;
/** Predict as if moving at least this fast, m/s (a kart pulling away still looks ahead). */
const MIN_SPEED = 5;

const isMover = (hazard: HazardDef): hazard is MoverHazard => hazard.kind === 'mover';

/** A track's movers, found once per track (the AI asks for every kart, every tick). */
const moversByTrack = new WeakMap<TrackGeometry, MoverHazard[]>();
function trackMovers(geometry: TrackGeometry): MoverHazard[] {
  let movers = moversByTrack.get(geometry);
  if (!movers) {
    movers = (geometry.def.hazards ?? []).filter(isMover);
    moversByTrack.set(geometry, movers);
  }
  return movers;
}

/**
 * Where to aim sideways to miss a moving hazard (MK-60: night traffic), or `undefined` when the
 * racing line is clear. Movers' poses are a pure function of the tick, so the AI can see exactly
 * where each one will be: it follows its line ahead at its current speed for
 * `tuning.ai.hazardDodgeSeconds`, and if a mover would be in the way, it picks the sideways position
 * (across the road) that stays clear longest, nearest where it is now. Returns metres to add to its
 * racing-line offset (`AiState.steerOffset`). Deterministic; does nothing on tracks without movers.
 */
export function hazardDodgeOffset(
  kart: KartState,
  ai: AiState,
  tick: number,
  geometry: TrackGeometry,
  line: readonly number[],
): number | undefined {
  const cfg = tuning.ai;
  const movers = trackMovers(geometry);
  if (!movers.length) return undefined;
  const range = cfg.hazardDodgeRange;
  const near = movers.filter((mover) => {
    const pose = hazardPose(mover, tick);
    return (pose.x - kart.position.x) ** 2 + (pose.z - kart.position.z) ** 2 < range * range;
  });
  if (!near.length) return undefined;

  const here = geometry.project(kart.position);
  const speed = Math.max(kart.speed, MIN_SPEED);
  const lineAt = (t: number) => lineOffsetAt(line, t) + ai.lineOffset;
  const half = here.width / 2 - EDGE_MARGIN;
  const lanes: number[] = [];
  for (let lateral = -half; lateral <= half + 1e-6; lateral += LANE_STEP) lanes.push(lateral);
  // The step each sideways position is first blocked at (Infinity: clear), and the line's own.
  const blocked = lanes.map(() => Infinity);
  let lineBlocked = Infinity;

  const steps = Math.round(cfg.hazardDodgeSeconds / (DT * PREDICT_TICKS));
  for (let k = 0; k <= steps; k += 1) {
    const s = here.s + speed * k * PREDICT_TICKS * DT;
    const t = (((s / geometry.length) % 1) + 1) % 1;
    const centre = geometry.pointAt(t);
    const tangent = geometry.tangentAt(t);
    for (const mover of near) {
      const pose = hazardPose(mover, tick + k * PREDICT_TICKS);
      // Switched off, or far below the road (driving back under it): out of reach.
      if (pose.amount === 0 || centre.y - pose.y > tuning.hazards.clearance) continue;
      const dx = pose.x - centre.x;
      const dz = pose.z - centre.z;
      const reach = mover.radius + tuning.hazards.kartRadius + cfg.hazardDodgeMargin;
      if (Math.abs(dx * tangent.x + dz * tangent.z) > reach) continue;
      // Sideways offset of the mover from the centreline (the right-normal is (−tz, tx)).
      const lateral = -dx * tangent.z + dz * tangent.x;
      if (lineBlocked === Infinity && Math.abs(lineAt(t) - lateral) < reach) lineBlocked = k;
      lanes.forEach((lane, j) => {
        if (blocked[j] === Infinity && Math.abs(lane - lateral) < reach) blocked[j] = k;
      });
    }
  }
  if (lineBlocked === Infinity) return undefined;

  // Clear longest; of those, the nearest to where the kart is now (so it doesn't swap sides).
  let best: number | undefined;
  let bestBlocked = lineBlocked;
  let bestShift = Infinity;
  lanes.forEach((lane, j) => {
    const at = blocked[j] ?? 0;
    const shift = Math.abs(lane - here.lateral);
    if (at > bestBlocked || (at === bestBlocked && shift < bestShift)) {
      best = lane;
      bestBlocked = at;
      bestShift = shift;
    }
  });
  if (best === undefined) return undefined;
  // The offset applies at the point the AI steers at, a little way ahead.
  const aim = cfg.lookAheadBase + Math.max(0, kart.speed) * cfg.lookAheadPerSpeed;
  return best - lineAt((here.s + aim) / geometry.length);
}

/** A crusher and where it sits on the lap: along the road (`s`), across it, and its extent. */
interface CrusherSpot {
  def: PeriodicHazard;
  s: number;
  lateral: number;
  /** Half its footprint along and across the road, m. */
  along: number;
  across: number;
}

const isCrusher = (hazard: HazardDef): hazard is PeriodicHazard => hazard.kind === 'periodic';

/** A track's crushers, measured once per track. */
const crushersByTrack = new WeakMap<TrackGeometry, CrusherSpot[]>();
function trackCrushers(geometry: TrackGeometry): CrusherSpot[] {
  let spots = crushersByTrack.get(geometry);
  if (!spots) {
    spots = (geometry.def.hazards ?? []).filter(isCrusher).map((def) => {
      const at = geometry.project(def.centre);
      // The footprint turned to the road: its heading against the road's (heading 0 faces −Z).
      const angle = def.heading - Math.atan2(-at.tangent.x, -at.tangent.z);
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      return {
        def,
        s: at.s,
        lateral: at.lateral,
        along: def.halfLength * cos + def.halfWidth * sin,
        across: def.halfWidth * cos + def.halfLength * sin,
      };
    });
    crushersByTrack.set(geometry, spots);
  }
  return spots;
}

/** Whether `def` stays fully open from `tick + from` s to `tick + to` s. */
function openThroughout(def: PeriodicHazard, tick: number, from: number, to: number): boolean {
  for (let k = Math.floor(from / DT); k <= Math.ceil(to / DT); k += 2) {
    if (hazardPose(def, tick + k).amount > 0) return false;
  }
  return true;
}

/**
 * The fastest the AI should go to time the next crusher on its way (MK-62: pistons), or Infinity
 * when it can carry on. Crusher poses are a pure function of the tick, so the AI knows when each one
 * will be down: if at its speed it would be under the next one while it's moving or down, it slows
 * to arrive as it opens (the first moment it can cross, at `crusherPassSpeed` or better, while it
 * stays open). Once at the footprint it's committed and goes. Deterministic; does nothing on
 * tracks without crushers.
 */
export function crusherSpeedLimit(kart: KartState, tick: number, geometry: TrackGeometry): number {
  const spots = trackCrushers(geometry);
  if (!spots.length) return Infinity;
  const cfg = tuning.ai;
  const here = geometry.project(kart.position);
  // The nearest crusher ahead (not yet passed) whose footprint covers where the kart is across.
  let next: CrusherSpot | undefined;
  let distance = Infinity;
  for (const spot of spots) {
    const reach = spot.along + tuning.hazards.kartRadius + cfg.crusherMargin;
    const ahead = (((spot.s - here.s) % geometry.length) + geometry.length) % geometry.length;
    const d = ahead > geometry.length - reach ? ahead - geometry.length : ahead;
    if (d > cfg.crusherLookAhead || d + reach <= 0 || d >= distance) continue;
    if (Math.abs(here.lateral - spot.lateral) > spot.across + tuning.hazards.kartRadius) continue;
    next = spot;
    distance = d;
  }
  if (!next) return Infinity;
  const reach = next.along + tuning.hazards.kartRadius + cfg.crusherMargin;
  const enter = distance - reach;
  // Committed: under it or at its edge, the way out is forwards.
  if (enter <= 0) return Infinity;
  const width = 2 * reach;
  const speed = Math.max(kart.speed, MIN_SPEED);
  const pass = Math.max(speed, cfg.crusherPassSpeed);
  if (openThroughout(next.def, tick, enter / speed, enter / speed + width / pass)) return Infinity;
  // Later: the first arrival (checked every PREDICT_TICKS, up to two cycles out) that crosses clear.
  const horizon = 2 * next.def.period;
  for (let at = enter / speed; at <= horizon; at += PREDICT_TICKS * DT) {
    const arrive = enter / at;
    if (openThroughout(next.def, tick, at, at + width / Math.max(arrive, cfg.crusherPassSpeed))) {
      return arrive;
    }
  }
  return Infinity;
}
