import type { ItemContent } from '..';
import { applyEffect } from '../../../sim/items/effects';
import { DT, tuning } from '../../../sim/tuning';
import type { KartState, SimState } from '../../../sim/types';
import type { AiItemContext } from '../../../sim/ai/items';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** Phasing lasts 3 s. */
export const PHASE_TICKS = 3 * S;
/** The small speed boost while phased: top speed × this. */
export const PHASE_SPEED = 1.1;
/** AI: phase when a kart or an item on the track is this close ahead, m… */
export const PHASE_AI_RANGE = 20;
/** …and within this many metres of the kart's own line sideways (in its way, MK-72). */
export const PHASE_AI_LATERAL = 3;

/**
 * Phase (MK-66): for 3 s the kart turns ghostly and a little faster. It passes through karts and
 * item entities (shells, bananas, oil…) and can't be hit or hit others (`intangible`, and its
 * `onHit` cancels every hit but a hazard's). Walls and track hazards still apply.
 * Its look and sounds are in `./render.ts`.
 */
export default {
  id: 'phase',
  name: 'Phase',
  order: 180,
  // Back positions (1st place … 8th place); balanced in MK-72 (each row sums to 1).
  odds: [0, 0, 0, 0, 0.04, 0.08, 0.1, 0.11],
  onUse: (kart, state, events) => applyEffect(kart, 'phase', PHASE_TICKS, state, events),
  // AI: phase through whatever is just ahead in its way. Having given up, on a straight (its speed
  // boost still helps), never into a bend where it's wasted (MK-72).
  aiUse: (kart, state, ctx) =>
    somethingAhead(kart, state, ctx) ||
    (ctx.giveUp && ctx.straightAhead(tuning.ai.straightLookAhead) < tuning.ai.straightCurvature),
  effects: [
    {
      id: 'phase',
      intangible: true,
      speedFactor: PHASE_SPEED,
      // Items can't hit it; hazards (and crushers) still can.
      onHit: (_kart, _effect, hit) => hit.kind !== 'hazard',
    },
  ],
} satisfies ItemContent;

/**
 * Whether another kart, or someone else's item entity on the track, is within `PHASE_AI_RANGE` m
 * ahead and `PHASE_AI_LATERAL` m of the kart sideways: something it would run into.
 */
export function somethingAhead(
  kart: KartState,
  state: SimState,
  { geometry, aheadMetres }: Pick<AiItemContext, 'geometry' | 'aheadMetres'>,
): boolean {
  const here = geometry.project(kart.position);
  const ahead = (p: { x: number; z: number; y: number }) => {
    const dx = p.x - kart.position.x;
    const dz = p.z - kart.position.z;
    if (dx * dx + dz * dz > PHASE_AI_RANGE * PHASE_AI_RANGE) return false;
    const there = geometry.project(p);
    if (Math.abs(there.lateral - here.lateral) > PHASE_AI_LATERAL) return false;
    const d = aheadMetres(here.s, there.s);
    return d > 0 && d <= PHASE_AI_RANGE;
  };
  return (
    state.karts.some((other) => other.id !== kart.id && ahead(other.position)) ||
    // Its own shells and boomerangs can't hit it on the way out: nothing to phase through.
    state.entities.some((e) => e.kind !== 'itemBox' && e.ownerId !== kart.id && ahead(e.position))
  );
}
