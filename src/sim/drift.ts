import { clamp } from './math';
import { tuning } from './tuning';
import type { DriftTier, InputFrame, KartState, SimEvent } from './types';

export const NOT_DRIFTING = { direction: 0, charge: 0, tier: 0 } as const;

/** Index of a reached tier (1–3) into the per-tier tuning arrays. */
export function tierIndex(tier: 1 | 2 | 3): 0 | 1 | 2 {
  return (tier - 1) as 0 | 1 | 2;
}

export function isDrifting(kart: KartState): boolean {
  return kart.drift.direction !== 0;
}

/** Starts (or extends) a boost. Boosts don't stack: the longer remaining time wins. */
export function applyBoost(kart: KartState, seconds: number, events: SimEvent[]): void {
  kart.boostTimer = Math.max(kart.boostTimer, seconds);
  events.push({ type: 'boost', kartId: kart.id, seconds });
}

/** Ends a drift without a reward (too slow, hit a wall…). */
export function cancelDrift(kart: KartState, events: SimEvent[]): void {
  if (!isDrifting(kart)) return;
  kart.drift = { ...NOT_DRIFTING };
  events.push({ type: 'driftCancel', kartId: kart.id });
}

/**
 * Handles the drift button for one tick, before steering: a press hops (and starts a drift if
 * steering and fast enough); a release ends the drift and awards a mini-turbo for the tier reached.
 */
export function handleDriftButton(
  kart: KartState,
  input: InputFrame,
  forwardSpeed: number,
  topSpeed: number,
  events: SimEvent[],
): void {
  const pressed = input.drift && !kart.driftHeld;
  const released = !input.drift && kart.driftHeld;
  kart.driftHeld = input.drift;

  if (pressed && kart.grounded) {
    kart.velocity = { ...kart.velocity, y: tuning.hopVelocity };
    kart.grounded = false;
    events.push({ type: 'hop', kartId: kart.id });
    const fastEnough = forwardSpeed >= tuning.driftMinSpeed * topSpeed;
    if (fastEnough && Math.abs(input.steer) >= tuning.driftSteerThreshold) {
      const direction = input.steer > 0 ? 1 : -1;
      kart.drift = { direction, charge: 0, tier: 0 };
      events.push({ type: 'driftStart', kartId: kart.id, direction });
    }
  }

  if (released && isDrifting(kart)) {
    const tier = kart.drift.tier;
    kart.drift = { ...NOT_DRIFTING };
    if (tier !== 0) {
      events.push({ type: 'miniTurbo', kartId: kart.id, tier });
      applyBoost(kart, tuning.miniTurboSeconds[tierIndex(tier)], events);
    }
  }
}

/** How strongly the player is steering into (+1) or out of (-1) the current drift. */
export function steerIntoDrift(kart: KartState, input: InputFrame): number {
  return clamp(input.steer * kart.drift.direction, -1, 1);
}

/** Drift yaw rate for this tick, rad/s (signed like normal steering: right = negative). */
export function driftYawRate(kart: KartState, input: InputFrame): number {
  const rate = tuning.driftYaw + tuning.driftYawRange * steerIntoDrift(kart, input);
  return -kart.drift.direction * rate;
}

/** Builds up mini-turbo charge and reports new tiers. */
export function chargeDrift(
  kart: KartState,
  input: InputFrame,
  dt: number,
  events: SimEvent[],
): void {
  const into = Math.max(0, steerIntoDrift(kart, input));
  const charge = kart.drift.charge + dt * (1 + tuning.driftChargeBonus * into);
  const tier = tuning.driftTiers.filter((threshold) => charge >= threshold).length as DriftTier;
  if (tier > kart.drift.tier) events.push({ type: 'driftTier', kartId: kart.id, tier });
  kart.drift = { ...kart.drift, charge, tier };
}
