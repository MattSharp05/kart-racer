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
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  item: false,
});

export interface KartState {
  id: number;
  position: Vec3;
  /** World-space velocity, m/s. */
  velocity: Vec3;
  /** Radians in (-π, π]; 0 faces −Z, positive turns left. */
  heading: number;
  /** Signed speed along the heading, m/s (negative when reversing). */
  speed: number;
  grounded: boolean;
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
}

export type SimEvent =
  | { type: 'phaseChanged'; phase: RacePhase }
  | { type: 'wallHit'; kartId: number; strength: number };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}
