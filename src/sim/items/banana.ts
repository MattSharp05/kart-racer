import { add, forwardFromHeading, lerp, scale } from '../math';
import { getTrack, groundAt } from '../track';
import { tuning } from '../tuning';
import type { BananaEntity, InputFrame, KartState, SimEvent, SimState } from '../types';
import { isIntangible } from './effects';
import { tryHit } from './hit';

/** Next unused entity id (deterministic: one more than the highest so far). */
export function nextEntityId(state: SimState): number {
  return state.entities.reduce((max, e) => Math.max(max, e.id), -1) + 1;
}

/**
 * Uses a banana: thrown ~20 m forward in an arc while accelerating (↑/W held), otherwise dropped
 * 2 m behind. The oldest banana goes once there are too many.
 */
export function useBanana(kart: KartState, state: SimState, input: InputFrame): void {
  const forward = forwardFromHeading(kart.heading);
  const thrown = input.throttle > 0;
  const distance = thrown ? tuning.bananaThrowDistance : -tuning.bananaDropDistance;
  const spot = add(kart.position, scale(forward, distance));
  const ground = groundAt(getTrack(state.trackId), spot);
  const position = { ...spot, y: ground.surface === 'out' ? kart.position.y : ground.height };
  state.entities.push({
    id: nextEntityId(state),
    kind: 'banana',
    position,
    from: { ...kart.position },
    flightTimer: thrown ? tuning.bananaFlightSeconds : 0,
    ownerId: kart.id,
    ownerImmune: tuning.bananaOwnerImmuneSeconds,
  });
  const bananas = state.entities.filter((e) => e.kind === 'banana');
  if (bananas.length > tuning.maxBananas) {
    const oldest = bananas[0];
    state.entities = state.entities.filter((e) => e !== oldest);
  }
}

/** Where a banana is drawn: on its arc while flying, else where it sits. */
export function bananaDrawPosition(banana: BananaEntity) {
  if (banana.flightTimer === 0) return banana.position;
  const f = 1 - banana.flightTimer / tuning.bananaFlightSeconds;
  const p = lerp(banana.from, banana.position, f);
  return { ...p, y: p.y + 4 * f * (1 - f) * 3 };
}

/** Bananas land, and any kart touching one is hit (the banana disappears). */
export function updateBananas(state: SimState, dt: number, events: SimEvent[]): void {
  const gone = new Set<number>();
  for (const banana of state.entities) {
    if (banana.kind !== 'banana') continue;
    banana.flightTimer = Math.max(0, banana.flightTimer - dt);
    banana.ownerImmune = Math.max(0, banana.ownerImmune - dt);
    if (banana.flightTimer > 0) continue;
    for (const kart of state.karts) {
      if (kart.id === banana.ownerId && banana.ownerImmune > 0) continue;
      // A phased kart (MK-66) drives through without using it up.
      if (isIntangible(kart)) continue;
      const dx = kart.position.x - banana.position.x;
      const dz = kart.position.z - banana.position.z;
      if (Math.hypot(dx, dz) > tuning.bananaRadius) continue;
      if (Math.abs(kart.position.y - banana.position.y) > 2) continue;
      // Invulnerable karts pass straight through without using it up; a shield (MK-52) uses it up.
      if (tryHit(kart, banana.ownerId, 'banana', events) !== 'immune') {
        gone.add(banana.id);
        break;
      }
    }
  }
  if (gone.size) state.entities = state.entities.filter((e) => !gone.has(e.id));
}
