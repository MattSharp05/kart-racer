import { hazardPose } from '../hazards';
import type { HazardDef, MoverHazard } from '../hazards/types';
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
