// Procedural racer motion (MK-101): the MK8 racer models have skeletons but no animations, so the
// lean into turns, bob, landing squash, look-back, hit spin and trick pose are computed here from
// what the sim already knows. Pure (no three), so it is unit-tested; `racerModel.ts` applies it.
import type { InputFrame, KartState } from '../../sim/types';

/** Tunables of the motion, radians and seconds unless noted. */
export const MOTION = {
  /** Lean at full steer and full speed. */
  maxLean: 0.32,
  /** Speed share (of top speed) from which a full steer gives the full lean. */
  fullLeanSpeed: 0.5,
  /** How fast the lean follows the steering, 1/s (exponential approach). */
  leanRate: 10,
  /** Bob spring stiffness, 1/s², and damping, 1/s. */
  bobStiffness: 260,
  bobDamping: 14,
  /** Downward bob speed a landing gives, per m/s it landed at. */
  bobKickPerLanding: 0.25,
  /** Squash per m/s of landing speed (0.1 = 10 % shorter), and its cap. */
  squashPerLanding: 0.04,
  maxSquash: 0.3,
  /** How fast the squash springs back, 1/s. */
  squashRecovery: 9,
  /** Landings slower than this (m/s down) don't squash or bob (driving over seams). */
  minLanding: 1,
  /** How far the head (or driver) turns to look back at a shell. */
  lookBack: 1.6,
  lookRate: 8,
  /** Hit spin speed, rad/s, and how fast it settles back to facing forward, 1/s. */
  spinRate: 4 * Math.PI,
  spinSettle: 12,
  /** A trick's full turn takes this long. */
  trickSeconds: 0.45,
} as const;

/** What the motion reads each frame. */
export interface MotionInput {
  /** −1 (left) … 1 (right), as `InputFrame.steer`. */
  steer: number;
  /** |speed| ÷ top speed, 0–1. */
  speedShare: number;
  grounded: boolean;
  /** Vertical velocity, m/s (negative falling). */
  verticalSpeed: number;
  /** Spinning out after a hit. */
  spinning: boolean;
  /** A ramp trick was done (`KartState.trick === 'done'`) and the kart is in the air. */
  trick: boolean;
  /** A shell is homing in from behind. */
  shellBehind: boolean;
}

/** The pose `racerModel.ts` draws, plus the memory the next step needs. */
export interface MotionState {
  /** Roll into the turn, radians: positive leans right. */
  lean: number;
  /** Vertical offset of kart and driver, metres, and its speed. */
  bob: number;
  bobSpeed: number;
  /** 0 = normal; 0.2 = 20 % shorter and a little wider. */
  squash: number;
  /** Head turn to look back, radians (positive over the right shoulder). */
  look: number;
  /** Hit spin about +Y, radians (0 = facing forward). */
  spin: number;
  /** Trick progress 0–1 while one plays (0 = none). */
  trick: number;
  wasGrounded: boolean;
  lastVerticalSpeed: number;
}

export const REST_MOTION: Readonly<MotionState> = Object.freeze({
  lean: 0,
  bob: 0,
  bobSpeed: 0,
  squash: 0,
  look: 0,
  spin: 0,
  trick: 0,
  wasGrounded: true,
  lastVerticalSpeed: 0,
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Share of the way an exponential approach at `rate` covers in `dt`. */
const approach = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const TURN = 2 * Math.PI;

/** The lean the steering asks for: follows the steer's sign, 0 going straight or standing still. */
export function targetLean(steer: number, speedShare: number): number {
  const speed = clamp(speedShare / MOTION.fullLeanSpeed, 0, 1);
  return clamp(steer, -1, 1) * speed * MOTION.maxLean;
}

/** Advances the motion by `dt` seconds. */
export function stepMotion(prev: MotionState, input: MotionInput, dt: number): MotionState {
  const lean =
    prev.lean +
    (targetLean(input.steer, input.speedShare) - prev.lean) * approach(MOTION.leanRate, dt);

  // Landing: the speed it fell at just before touching down.
  const landing = input.grounded && !prev.wasGrounded ? Math.max(0, -prev.lastVerticalSpeed) : 0;
  const impact = landing >= MOTION.minLanding ? landing : 0;

  let bobSpeed = prev.bobSpeed - impact * MOTION.bobKickPerLanding;
  bobSpeed += (-MOTION.bobStiffness * prev.bob - MOTION.bobDamping * bobSpeed) * dt;
  const bob = prev.bob + bobSpeed * dt;

  const squashed = Math.max(
    prev.squash,
    Math.min(MOTION.maxSquash, impact * MOTION.squashPerLanding),
  );
  const squash = squashed * (1 - approach(MOTION.squashRecovery, dt));

  const lookTarget = input.shellBehind ? MOTION.lookBack : 0;
  const look = prev.look + (lookTarget - prev.look) * approach(MOTION.lookRate, dt);

  let spin: number;
  if (input.spinning) spin = (prev.spin + MOTION.spinRate * dt) % TURN;
  else {
    // Settle the short way round to facing forward.
    const offset = (((prev.spin % TURN) + TURN + Math.PI) % TURN) - Math.PI;
    spin = offset * (1 - approach(MOTION.spinSettle, dt));
  }

  let trick = 0;
  if (input.trick && !input.grounded) {
    // Held at the end of the turn (a full turn looks like none) until the kart lands.
    trick = Math.min(1, prev.trick + dt / MOTION.trickSeconds);
  }

  return {
    lean,
    bob,
    bobSpeed,
    squash,
    look,
    spin,
    trick,
    wasGrounded: input.grounded,
    lastVerticalSpeed: input.verticalSpeed,
  };
}

/** The rotation a trick adds, radians about the kart's forward axis: one eased full roll. */
export function trickRoll(progress: number): number {
  const t = clamp(progress, 0, 1);
  return t >= 1 ? 0 : TURN * (t * t * (3 - 2 * t));
}

/** Motion input from a sim kart, its steering this tick and its class's top speed. */
export function motionInput(
  kart: Pick<KartState, 'speed' | 'grounded' | 'velocity' | 'spinTimer' | 'trick'>,
  input: Pick<InputFrame, 'steer'> | undefined,
  topSpeed: number,
  shellBehind = false,
): MotionInput {
  return {
    steer: input?.steer ?? 0,
    speedShare: topSpeed > 0 ? Math.abs(kart.speed) / topSpeed : 0,
    grounded: kart.grounded,
    verticalSpeed: kart.velocity.y,
    spinning: kart.spinTimer > 0,
    trick: kart.trick === 'done' && !kart.grounded,
    shellBehind,
  };
}
