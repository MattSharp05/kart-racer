import { KART_IDS } from '../sim/data/karts';
import { sunnyCircuit } from '../sim/data/tracks/sunnyCircuit';
import { forwardFromHeading } from '../sim/math';
import { createSimState } from '../sim/state';
import { trackGeometry } from '../sim/track';
import { DT, tuning } from '../sim/tuning';
import type { SimState } from '../sim/types';
import type { Scenario } from './registry';

const sunny = trackGeometry(sunnyCircuit);
const COUNTDOWN_TICKS = Math.round(tuning.countdownSeconds / DT);

/** A race on Sunny Circuit from the grid, `karts` karts (player = kart 0 on pole), in countdown. */
export function sunnyRace(seed: number, karts = 1): SimState {
  const slots = sunnyCircuit.gridSlots ?? [];
  return createSimState({
    seed,
    trackId: 'sunny-circuit',
    phase: 'countdown',
    karts: Array.from({ length: karts }, (_, i) => {
      const slot = slots[i] ?? { t: 0.98, lateral: 0 };
      return {
        kartType: KART_IDS[i % KART_IDS.length] ?? 'maple',
        position: sunny.pointAt(slot.t, slot.lateral),
        heading: sunny.headingAt(slot.t),
      };
    }),
  });
}

/** Shifts the race clock so `ticksToGo` ticks remain in the countdown. */
function atCountdown(state: SimState, ticksToGo: number): SimState {
  state.race.countdownStartTick = ticksToGo - COUNTDOWN_TICKS;
  state.race.goTick = ticksToGo;
  return state;
}

/** Puts the race mid-way: GO happened `secondsAgo` ago. */
function racingSince(state: SimState, secondsAgo: number): SimState {
  state.phase = 'racing';
  state.race.goTick = -Math.round(secondsAgo / DT);
  state.race.countdownStartTick = state.race.goTick - COUNTDOWN_TICKS;
  return state;
}

export const raceScenarios: Scenario[] = [
  {
    name: 'race-countdown',
    group: 'Race',
    description:
      'A solo 3-lap race on Sunny Circuit, starting with 3-2-1-GO. Hold W in the last moment for a rocket start.',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyRace(seed) }),
  },
  {
    name: 'race-rocket-window',
    group: 'Race',
    description: '0.2 s before GO (use with &paused=1): press W now for a rocket start.',
    defaultSeed: 1,
    setup: (seed) => ({ state: atCountdown(sunnyRace(seed), Math.round(0.2 / DT)) }),
  },
  {
    name: 'race-final-straight',
    group: 'Race',
    description: 'Final lap, 100 m before the finish line. Cross it to finish the race.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed), 150);
      const t = 1 - 100 / sunny.length;
      const kart = state.karts[0];
      if (kart) {
        kart.position = sunny.pointAt(t);
        kart.heading = sunny.headingAt(t);
        const speed = tuning.topSpeed[100] * 0.9;
        const forward = forwardFromHeading(kart.heading);
        kart.velocity = { x: forward.x * speed, y: 0, z: forward.z * speed };
        kart.speed = speed;
        kart.race = {
          ...kart.race,
          lap: state.race.laps,
          nextCheckpoint: 0,
          lastT: t,
          lapStartTick: -Math.round(48 / DT),
          lapTimes: [52.4, 49.8],
        };
      }
      return { state };
    },
  },
  {
    name: 'race-finished',
    group: 'Race',
    description: 'Race just finished in 3rd place, with the results list showing.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed, 8), 160);
      state.phase = 'finished';
      // Two karts finished before the player; the rest are still racing.
      const finishTicks = new Map([
        [3, -Math.round(6 / DT)],
        [5, -Math.round(3 / DT)],
        [0, 0],
      ]);
      state.karts.forEach((kart, i) => {
        const t = 0.02 + i * 0.005;
        kart.position = sunny.pointAt(t, (i % 2 ? 1 : -1) * 3);
        kart.heading = sunny.headingAt(t);
        const finishTick = finishTicks.get(kart.id);
        kart.race = {
          ...kart.race,
          lap: finishTick !== undefined ? state.race.laps + 1 : state.race.laps,
          nextCheckpoint: 1,
          lastT: t,
          lapTimes: [53.1 - i * 0.2, 51.9 - i * 0.1, 50.7],
          ...(finishTick !== undefined ? { finishTick } : {}),
        };
      });
      state.positions = [3, 5, 0, 1, 2, 4, 6, 7];
      return { state };
    },
  },
];
