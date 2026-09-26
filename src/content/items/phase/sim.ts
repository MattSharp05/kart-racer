import type { ItemContent } from '..';
import { applyEffect } from '../../../sim/items/effects';
import { DT } from '../../../sim/tuning';
import type { KartState, SimState } from '../../../sim/types';
import type { AiItemContext } from '../../../sim/ai/items';

/** Ticks per second (the sim runs at 60 Hz). */
const S = Math.round(1 / DT);

/** Phasing lasts 3 s. */
export const PHASE_TICKS = 3 * S;
/** The small speed boost while phased: top speed × this. */
export const PHASE_SPEED = 1.1;
/** AI: phase when a kart or an item on the track is this close ahead, m. */
export const PHASE_AI_RANGE = 20;

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
  // Back positions (1st place … 8th place); relative weights, the balance pass (MK-72) tunes them.
  odds: [0, 0, 0, 0, 0.05, 0.1, 0.15, 0.2],
  onUse: (kart, state, events) => applyEffect(kart, 'phase', PHASE_TICKS, state, events),
  // AI: phase through whatever is just ahead.
  aiUse: (kart, state, ctx) => somethingAhead(kart, state, ctx),
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

/** Whether another kart, or an item entity on the track, is within `PHASE_AI_RANGE` m ahead. */
function somethingAhead(
  kart: KartState,
  state: SimState,
  { geometry, aheadMetres }: AiItemContext,
): boolean {
  const myS = geometry.project(kart.position).s;
  const ahead = (p: { x: number; z: number; y: number }) => {
    const dx = p.x - kart.position.x;
    const dz = p.z - kart.position.z;
    if (dx * dx + dz * dz > PHASE_AI_RANGE * PHASE_AI_RANGE) return false;
    const d = aheadMetres(myS, geometry.project(p).s);
    return d > 0 && d <= PHASE_AI_RANGE;
  };
  return (
    state.karts.some((other) => other.id !== kart.id && ahead(other.position)) ||
    state.entities.some((e) => e.kind !== 'itemBox' && ahead(e.position))
  );
}
