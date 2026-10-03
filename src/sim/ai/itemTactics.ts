// The AI's item moments (MK-21, shared since MK-129): whether someone is lined up ahead, close
// behind, and so on. The MVP items' tactics in `./items.ts` use them, and so do later items' `aiUse`
// hooks (MK8's triple items, Crazy 8's ring). On spline tracks they read the kart's heading on the
// ground plane; on mesh tracks (MK-129), where karts drive up walls, its own forward and up.
import { dot, forwardFromHeading, sub, wrapAngleDelta, type Vec3 } from '../math';
import { positionOf } from '../race';
import { rightOf } from '../surfaceKart';
import { tuning } from '../tuning';
import type { InputFrame, KartState, SimState } from '../types';
import type { AiItemContext } from './items';

/**
 * Angle off the kart's nose to `target`, radians: on the ground plane from its heading, or in its
 * own surface plane on a mesh track.
 */
export function angleOffNose(kart: KartState, target: Vec3): number {
  if (kart.forward && kart.up) {
    const to = sub(target, kart.position);
    return Math.atan2(dot(to, rightOf(kart.forward, kart.up)), dot(to, kart.forward));
  }
  const forward = forwardFromHeading(kart.heading);
  const heading = Math.atan2(forward.x, forward.z);
  const dx = target.x - kart.position.x;
  const dz = target.z - kart.position.z;
  return wrapAngleDelta(Math.atan2(dx, dz) - heading);
}

/**
 * Whether another kart is lined up ahead within `range` m: inside ±`angle`, or within `lateral` m
 * of the nose's line when it's close (the green shell's aim).
 */
export function kartLinedUp(
  kart: KartState,
  state: SimState,
  range = tuning.ai.greenRange,
  angle = tuning.ai.greenAngle,
  lateral = tuning.ai.greenLateral,
  minRange = 1,
): boolean {
  return state.karts.some((other) => {
    if (other.id === kart.id || other.respawnTimer > 0) return false;
    const dx = other.position.x - kart.position.x;
    const dz = other.position.z - kart.position.z;
    // Heights only count on a mesh track (spline tracks compare on the ground plane, as ever).
    const d = kart.forward
      ? Math.hypot(dx, other.position.y - kart.position.y, dz)
      : Math.hypot(dx, dz);
    if (d > range || d < minRange) return false;
    const cone = Math.max(angle, Math.atan2(lateral, d));
    return Math.abs(angleOffNose(kart, other.position)) < cone;
  });
}

/** Other karts between 0 and `range` m along the lap from the kart: ahead (> 0) or behind (< 0). */
export function kartsAlongLap(
  kart: KartState,
  state: SimState,
  { geometry, aheadMetres }: AiItemContext,
  range: number,
  direction: 1 | -1,
): number {
  const myS = geometry.project(kart.position).s;
  return state.karts.filter((other) => {
    if (other.id === kart.id) return false;
    const dx = other.position.x - kart.position.x;
    const dy = kart.forward ? other.position.y - kart.position.y : 0;
    const dz = other.position.z - kart.position.z;
    if (dx * dx + dz * dz + dy * dy > range * range) return false;
    const d = direction * aheadMetres(myS, geometry.project(other.position).s);
    return d > 0 && d < range;
  }).length;
}

/** The racing line is straight enough for a boost over the next `straightLookAhead` m. */
export function onStraight({ straightAhead }: AiItemContext): boolean {
  return straightAhead(tuning.ai.straightLookAhead) < tuning.ai.straightCurvature;
}

/** Mushroom: on a straight, or having given up waiting for one. */
export function mushroomTactic(_kart: KartState, _state: SimState, ctx: AiItemContext): boolean {
  return onStraight(ctx) || ctx.giveUp;
}

/** Banana: dropped behind (the throttle let go for the tick) when someone is close behind. */
export function bananaTactic(
  kart: KartState,
  state: SimState,
  ctx: AiItemContext,
): boolean | Partial<InputFrame> {
  const behind = kartsAlongLap(kart, state, ctx, tuning.ai.bananaDropRange, -1) > 0;
  return behind || ctx.giveUp ? { throttle: 0 } : false;
}

/** Green shell: at a kart lined up ahead. */
export function greenTactic(kart: KartState, state: SimState, ctx: AiItemContext): boolean {
  return kartLinedUp(kart, state) || ctx.giveUp;
}

/** Red shell: whenever anyone is ahead. */
export function redTactic(kart: KartState, state: SimState, ctx: AiItemContext): boolean {
  return positionOf(state, kart.id) > 1 || ctx.giveUp;
}
