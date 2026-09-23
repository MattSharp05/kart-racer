import type { Vec3 } from './math';

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
  /** Radians; 0 faces −Z. */
  heading: number;
  /** Forward speed, m/s. */
  speed: number;
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
  karts: KartState[];
  entities: Entity[];
}

export type SimEvent = { type: 'phaseChanged'; phase: RacePhase };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}
