import type { KartId } from './data/karts';
import type { Vec3 } from './math';
import type { EngineClass } from './tuning';

/** One player's controls for one tick. Humans and AI both produce these. */
export interface InputFrame {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  drift: boolean;
  item: boolean;
  /** Ask to be picked up and put back on the track (R key). */
  respawn?: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  item: false,
});

export type DriftTier = 0 | 1 | 2 | 3;

export interface DriftState {
  /** 1 = drifting right, -1 = left, 0 = not drifting. */
  direction: -1 | 0 | 1;
  /** Seconds of (weighted) drift charge. */
  charge: number;
  tier: DriftTier;
}

/** Per-kart lap and checkpoint progress (MK-11). */
export interface KartRace {
  /** Current lap, 1-based. 0 = on the grid, not yet across the start line. */
  lap: number;
  /** Index into the track's checkpoints of the next one to pass (0 = the finish line). */
  nextCheckpoint: number;
  /** Lap fraction last tick, to detect crossings. */
  lastT: number;
  /** Tick the current lap started. */
  lapStartTick: number;
  /** Completed lap times, seconds. */
  lapTimes: number[];
  /** Seconds spent driving against the track direction. */
  wrongWayTime: number;
  wrongWay: boolean;
  /** Tick the kart finished the race (MK-12). */
  finishTick?: number;
  /** Countdown only: tick since which throttle has been held (for the rocket start). */
  throttleSince?: number;
  /** Seconds left of an engine stall (too-early rocket start): no drive. */
  stallTimer: number;
}

/** Race settings and timing (MK-12). */
export interface RaceInfo {
  /** Laps to finish. */
  laps: number;
  /** Tick the countdown started. */
  countdownStartTick: number;
  /** Tick of GO (countdown end); race times are measured from here. */
  goTick: number;
}

export interface KartState {
  id: number;
  /** Which of the four karts this is (stats + model). */
  kartType: KartId;
  position: Vec3;
  /** World-space velocity, m/s. */
  velocity: Vec3;
  /** Radians in (-π, π]; 0 faces −Z, positive turns left. */
  heading: number;
  /** Signed speed along the heading, m/s (negative when reversing). */
  speed: number;
  grounded: boolean;
  drift: DriftState;
  /** Whether the drift button was held last tick (to detect presses and releases). */
  driftHeld: boolean;
  /** Seconds of boost left (mini-turbo; later mushrooms, boost pads, rocket start). */
  boostTimer: number;
  /** Seconds since the kart last left the ground (0 while grounded). */
  airTime: number;
  /** Ramp trick state: `ready` after launching off a ramp, `done` once drift is tapped in the air. */
  trick: 'none' | 'ready' | 'done';
  race: KartRace;
  /** Respawn (MK-13): seconds left of being carried back to the track (0 = not respawning). */
  respawnTimer: number;
  /** Seconds of invulnerability left after a respawn (blinks; items ignore the kart). */
  invulnerableTimer: number;
  /** Last lap fraction where the kart was safely on the ground — where it gets put back. */
  lastSafeT: number;
  /** Seconds spent off the track surface / off the ground edge. */
  outTime: number;
  /** Seconds until the respawn button works again. */
  respawnCooldown: number;
}

export type RacePhase = 'free' | 'countdown' | 'racing' | 'finished';

/** Non-kart things in the world (item boxes, bananas, shells…). Typed properly by the items epic. */
export interface Entity {
  id: number;
  kind: string;
}

/** The whole simulation state. Plain JSON only: no classes, Maps or functions. */
export interface SimState {
  tick: number;
  rngState: number;
  phase: RacePhase;
  trackId: string;
  engineClass: EngineClass;
  karts: KartState[];
  entities: Entity[];
  /** Kart ids in race order, leader first (MK-11). */
  positions: number[];
  race: RaceInfo;
}

export type SimEvent =
  | { type: 'phaseChanged'; phase: RacePhase }
  | { type: 'checkpoint'; kartId: number; index: number }
  | { type: 'lap'; kartId: number; lap: number; lapTime?: number }
  | { type: 'positionChange'; positions: number[] }
  | { type: 'countdown'; value: 3 | 2 | 1 }
  | { type: 'go' }
  | { type: 'rocketStart'; kartId: number }
  | { type: 'stall'; kartId: number }
  | { type: 'finish'; kartId: number; position: number; time: number }
  | { type: 'respawn'; kartId: number }
  | { type: 'wallHit'; kartId: number; strength: number }
  | { type: 'bump'; a: number; b: number; strength: number }
  | { type: 'hop'; kartId: number }
  | { type: 'driftStart'; kartId: number; direction: -1 | 1 }
  | { type: 'driftTier'; kartId: number; tier: DriftTier }
  | { type: 'driftCancel'; kartId: number }
  | { type: 'miniTurbo'; kartId: number; tier: DriftTier }
  | { type: 'boost'; kartId: number; seconds: number }
  | { type: 'boostPad'; kartId: number }
  | { type: 'launch'; kartId: number }
  | { type: 'trick'; kartId: number }
  | { type: 'land'; kartId: number; airTime: number };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}
