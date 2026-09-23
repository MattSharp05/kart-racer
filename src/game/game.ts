import { autopilotInput } from '../sim/autopilot';
import { step } from '../sim/step';
import { getTrack, trackGeometry } from '../sim/track';
import { DT } from '../sim/tuning';
import type { InputFrame, SimEvent, SimState } from '../sim/types';
import { advanceAccumulator } from './loop';

/** Reads live player inputs (keyboard, later touch), indexed by kart id. */
export type InputSource = () => InputFrame[];

/**
 * Owns the simulation: runs fixed ticks from real frame time, supports pausing,
 * manual stepping and input overrides for tests. No DOM or rendering here.
 */
export class Game {
  state: SimState;
  /** State at the previous tick, for render interpolation. */
  previousState: SimState;
  paused = false;
  /** Interpolation factor between `previousState` and `state`, 0..1. */
  alpha = 0;

  private accumulator = 0;
  private readonly overrides = new Map<number, InputFrame>();
  /** Karts driven by the centreline autopilot (tests, QA, perf runs). */
  private readonly autopiloted = new Set<number>();
  private pendingEvents: SimEvent[] = [];
  private readonly listeners: ((events: SimEvent[], state: SimState) => void)[] = [];

  constructor(
    initialState: SimState,
    private readonly readInputs: InputSource,
  ) {
    this.state = initialState;
    this.previousState = initialState;
  }

  /** Called once per animation frame with the real time elapsed. */
  frame(frameSeconds: number): void {
    if (this.paused) return;
    const result = advanceAccumulator(this.accumulator, frameSeconds, DT);
    this.accumulator = result.accumulator;
    for (let i = 0; i < result.steps; i += 1) this.tick();
    this.alpha = result.alpha;
  }

  /** Runs exactly `n` ticks now, paused or not. */
  stepTicks(n: number): void {
    for (let i = 0; i < n; i += 1) this.tick();
    this.alpha = 1;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.accumulator = 0;
  }

  /** Forces kart `kartId`'s input until cleared with `null`. */
  setInputOverride(kartId: number, frame: InputFrame | null): void {
    if (frame) this.overrides.set(kartId, frame);
    else this.overrides.delete(kartId);
  }

  /** Hands kart `kartId` to the centreline autopilot (spline tracks only) or back. */
  setAutopilot(kartId: number, enabled: boolean): void {
    if (enabled) this.autopiloted.add(kartId);
    else this.autopiloted.delete(kartId);
  }

  /** Called after every tick that emitted events (UI, audio, saving bests). */
  onEvents(listener: (events: SimEvent[], state: SimState) => void): void {
    this.listeners.push(listener);
  }

  /** Events emitted since the last call. */
  drainEvents(): SimEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private tick(): void {
    const inputs = this.readInputs().slice();
    for (const [kartId, frame] of this.overrides) inputs[kartId] = frame;
    const track = getTrack(this.state.trackId);
    if (track.kind === 'spline') {
      for (const kartId of this.autopiloted) {
        const kart = this.state.karts[kartId];
        if (kart) inputs[kartId] = autopilotInput(kart, trackGeometry(track));
      }
    }
    const result = step(this.state, inputs);
    this.previousState = this.state;
    this.state = result.state;
    this.pendingEvents.push(...result.events);
    if (result.events.length)
      for (const listener of this.listeners) listener(result.events, this.state);
  }
}
