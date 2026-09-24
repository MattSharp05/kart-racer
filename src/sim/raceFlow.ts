import { aiInput, maxCurvatureAhead } from './ai/driver';
import { aiItemInput, aiSteerOffset } from './ai/items';
import { rubberBandScale } from './ai/rubberBand';
import { autopilotInput } from './autopilot';
import { applyBoost } from './drift';
import { positionOf } from './race';
import { trackGeometry, type TrackDef } from './track';
import { DT, tuning } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from './types';

/** Ticks per countdown number. */
const TICKS_PER_SECOND = Math.round(1 / DT);

/**
 * Countdown (karts held on the grid, rocket-start timing), GO, finishing, and auto-drive for
 * finished karts (MK-12). `beforeMovement` runs before karts move; `afterRace` after laps update.
 */
export function beforeMovement(
  state: SimState,
  inputs: readonly InputFrame[],
  track: TrackDef,
  events: SimEvent[],
): { inputs: InputFrame[]; frozen: boolean } {
  const resolved = state.karts.map((kart) => inputs[kart.id] ?? NEUTRAL_INPUT);

  if (state.phase === 'countdown') {
    for (const kart of state.karts) {
      const held = (resolved[kart.id]?.throttle ?? 0) > 0;
      if (!held) delete kart.race.throttleSince;
      else kart.race.throttleSince ??= state.tick;
    }
    const remaining = state.race.goTick - state.tick;
    if (remaining > 0) {
      // Announce each number on the first tick of its second: 3 at the very start, then 2, 1.
      const secondsLeft = (remaining + 1) / TICKS_PER_SECOND;
      if (Number.isInteger(secondsLeft) && secondsLeft >= 1 && secondsLeft <= 3) {
        events.push({ type: 'countdown', value: secondsLeft as 3 | 2 | 1 });
      }
      return { inputs: resolved, frozen: true };
    }
    startRace(state, events);
  }

  // Stalled karts can't drive; finished karts are driven round by the autopilot.
  const geometry = track.kind === 'spline' ? trackGeometry(track) : undefined;
  for (const kart of state.karts) {
    if (kart.race.stallTimer > 0) {
      kart.race.stallTimer = Math.max(0, kart.race.stallTimer - DT);
      resolved[kart.id] = { ...NEUTRAL_INPUT };
    } else if (kart.race.finishTick !== undefined && geometry) {
      resolved[kart.id] = autopilotInput(kart, geometry, 0.8);
    } else if (kart.ai && (kart.respawnTimer > 0 || kart.spinTimer > 0)) {
      // Being carried by the pickup drone or spinning out: not driving, so not "stuck" either.
      kart.ai.stuckTime = 0;
    } else if (kart.ai && geometry && track.kind === 'spline') {
      const line = track.aiLine ?? [];
      const racing = state.phase === 'racing';
      kart.ai.speedScale = rubberBandScale(kart, state, geometry);
      kart.ai.steerOffset = racing ? aiSteerOffset(kart, kart.ai, state, geometry, line) : 0;
      const drive = aiInput(kart, kart.ai, geometry, line, state.engineClass, racing);
      const here = geometry.project(kart.position).s;
      const items = racing
        ? aiItemInput(kart, kart.ai, state, geometry, line, DT, (m) =>
            maxCurvatureAhead(geometry, line, here, m),
          )
        : {};
      resolved[kart.id] = { ...drive, ...items };
    }
  }
  return { inputs: resolved, frozen: false };
}

function startRace(state: SimState, events: SimEvent[]): void {
  state.phase = 'racing';
  events.push({ type: 'go' }, { type: 'phaseChanged', phase: 'racing' });
  for (const kart of state.karts) {
    const since = kart.race.throttleSince;
    delete kart.race.throttleSince;
    if (since === undefined) continue;
    const heldFor = (state.race.goTick - since) * DT;
    if (heldFor <= tuning.rocketWindow + 1e-9) {
      applyBoost(kart, tuning.rocketBoostSeconds, events);
      events.push({ type: 'rocketStart', kartId: kart.id });
    } else if (heldFor > tuning.rocketEarly) {
      kart.race.stallTimer = tuning.stallSeconds;
      events.push({ type: 'stall', kartId: kart.id });
    }
  }
}

/** Marks karts that just completed the final lap as finished; the player finishing ends the race. */
export function afterRace(state: SimState, events: SimEvent[]): void {
  if (state.phase !== 'racing' && state.phase !== 'finished') return;
  for (const kart of state.karts) {
    if (kart.race.finishTick !== undefined || kart.race.lap <= state.race.laps) continue;
    kart.race.finishTick = state.tick;
    const time = raceTime(state, state.tick);
    events.push({ type: 'finish', kartId: kart.id, position: 0, time });
  }
  // Finish positions are known once positions are sorted (finished karts first, by finish tick).
  for (const event of events) {
    if (event.type === 'finish') event.position = positionOf(state, event.kartId);
  }
  if (state.phase === 'racing' && state.karts[0]?.race.finishTick !== undefined) {
    state.phase = 'finished';
    events.push({ type: 'phaseChanged', phase: 'finished' });
  }
}

/** Seconds since GO at `tick`. */
export function raceTime(state: SimState, tick = state.tick): number {
  return Math.max(0, (tick - state.race.goTick) * DT);
}

export interface ResultRow {
  kartId: number;
  position: number;
  /** Race time, s; undefined if not finished yet. */
  time?: number;
  bestLap?: number;
}

/** Final (or current) standings, leader first. */
export function raceResults(state: SimState): ResultRow[] {
  return state.positions.map((kartId, i) => {
    const kart = state.karts[kartId];
    const finish = kart?.race.finishTick;
    const laps = kart?.race.lapTimes ?? [];
    return {
      kartId,
      position: i + 1,
      ...(finish !== undefined ? { time: raceTime(state, finish) } : {}),
      ...(laps.length ? { bestLap: Math.min(...laps) } : {}),
    };
  });
}
