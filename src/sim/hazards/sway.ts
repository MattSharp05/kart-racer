import type { Vec3 } from '../math';
import { tuning } from '../tuning';
import { cyclePhase } from './shapes';
import type { HazardKind, SwayHazard } from './types';

/** Where `position` is on a sway deck: `u` 0..1 from `from` to `to`, `across` m to its right. */
export function swayDeckFrame(def: SwayHazard, position: Vec3) {
  const dx = def.to.x - def.from.x;
  const dz = def.to.z - def.from.z;
  const length = Math.hypot(dx, dz) || 1;
  const ux = dx / length;
  const uz = dz / length;
  const px = position.x - def.from.x;
  const pz = position.z - def.from.z;
  // Right of the direction of travel from→to (heading 0 faces −Z, its right is +X).
  const right = { x: -uz, z: ux };
  const u = (px * ux + pz * uz) / length;
  return {
    u,
    across: px * right.x + pz * right.z,
    right,
    y: def.from.y + (def.to.y - def.from.y) * Math.min(1, Math.max(0, u)),
  };
}

/**
 * How far along its span the sway reaches at `u` (0..1 from anchor to anchor): nothing at the
 * anchors, full mid-span.
 */
export function swaySpan(u: number): number {
  return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
}

/**
 * A rope bridge swaying on a timer (MK-61). Its lean (`amount`, −1..1, positive = to its right) is
 * a sine of the tick; karts on the deck are pushed towards the side it leans to, hardest mid-span.
 * It never touches karts (no contact): falling off the edge is the track's business.
 */
const sway: HazardKind<SwayHazard> = {
  id: 'sway',
  defaultEffect: 'bump',
  pose(def, ticks) {
    const lean = Math.sin(2 * Math.PI * cyclePhase(ticks, def.period, def.phase));
    return {
      x: (def.from.x + def.to.x) / 2,
      y: (def.from.y + def.to.y) / 2,
      z: (def.from.z + def.to.z) / 2,
      heading: Math.atan2(-(def.to.x - def.from.x), -(def.to.z - def.from.z)),
      amount: lean,
    };
  },
  push(def, pose, position) {
    const deck = swayDeckFrame(def, position);
    if (Math.abs(deck.across) > def.halfWidth) return undefined;
    if (Math.abs(position.y - deck.y) > tuning.hazards.clearance) return undefined;
    const strength = def.push * pose.amount * swaySpan(deck.u);
    if (strength === 0) return undefined;
    return { x: deck.right.x * strength, z: deck.right.z * strength };
  },
};

export default sway;
