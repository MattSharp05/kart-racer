import { KART_IDS, type KartId } from '../sim/data/karts';
import { sunnyCircuit } from '../sim/data/tracks/sunnyCircuit';
import { forwardFromHeading } from '../sim/math';
import { createSimState } from '../sim/state';
import { trackGeometry } from '../sim/track';
import { rngInt, rngPick, rngRange, seedRng } from '../sim/rng';
import { DT, tuning, type EngineClass } from '../sim/tuning';
import type { SimState } from '../sim/types';
import type { Scenario } from './registry';

const sunny = trackGeometry(sunnyCircuit);
const COUNTDOWN_TICKS = Math.round(tuning.countdownSeconds / DT);

export interface RaceOptions {
  /** Total karts (player + AI). */
  karts?: number;
  /** Fill the other slots with AI drivers (MK-14). Without it they're parked dummies. */
  ai?: boolean;
  engineClass?: EngineClass;
  playerKart?: KartId;
}

/**
 * A race on Sunny Circuit from the grid, in countdown. Player = kart 0. With AI, the grid order is
 * shuffled (seeded) and the player starts 5th–8th, as in a real race; otherwise the player is on pole.
 */
export function sunnyRace(seed: number, options: RaceOptions | number = {}): SimState {
  const {
    karts = 1,
    ai = false,
    engineClass = 100,
    playerKart = 'maple',
  } = typeof options === 'number' ? { karts: options } : options;
  const rng = { rngState: seedRng(seed * 7919 + 13) };
  const slots = sunnyCircuit.gridSlots ?? [];
  const playerSlot = ai && karts >= 5 ? rngInt(rng, 4, Math.min(7, karts - 1)) : 0;
  const otherSlots = Array.from({ length: karts }, (_, i) => i).filter((i) => i !== playerSlot);
  const state = createSimState({
    seed,
    trackId: 'sunny-circuit',
    phase: 'countdown',
    engineClass,
    karts: Array.from({ length: karts }, (_, i) => {
      const slotIndex = i === 0 ? playerSlot : (otherSlots[i - 1] ?? i);
      const slot = slots[slotIndex] ?? { t: 0.98, lateral: 0 };
      const kartType =
        i === 0
          ? playerKart
          : ai
            ? rngPick(rng, KART_IDS)
            : (KART_IDS[i % KART_IDS.length] ?? 'maple');
      return {
        kartType,
        position: sunny.pointAt(slot.t, slot.lateral),
        heading: sunny.headingAt(slot.t),
      };
    }),
  });
  if (ai) {
    const cfg = tuning.ai;
    const skillMin = engineClass === 150 ? cfg.skillMin150 : cfg.skillMin;
    for (const kart of state.karts.slice(1)) {
      kart.ai = {
        lineOffset: rngRange(rng, -cfg.lineOffsetMax, cfg.lineOffsetMax),
        skill: rngRange(rng, skillMin, cfg.skillMax),
        aggression: rngRange(rng, 0, 1),
        stuckTime: 0,
        recoverTime: 0,
      };
    }
  }
  return state;
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
      const state = racingSince(sunnyRace(seed, { karts: 8 }), 160);
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
  {
    name: 'hud-mid-race',
    group: 'Race',
    description: 'Lap 2, 4th place, holding a Red shell, with 7 AI racers around you (HUD check).',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed, { karts: 8, ai: true }), 70);
      // Leader furthest round the lap; the player is 4th.
      const order = [3, 5, 1, 0, 2, 4, 6, 7];
      order.forEach((id, place) => {
        const kart = state.karts[id];
        if (!kart) return;
        const t = 0.3 - place * (9 / sunny.length);
        kart.position = sunny.pointAt(t, (place % 2 ? 1 : -1) * 2.5);
        kart.heading = sunny.headingAt(t);
        kart.race = {
          ...kart.race,
          lap: 2,
          nextCheckpoint:
            sunnyCircuit.checkpoints.filter((c) => c <= t).length % sunnyCircuit.checkpoints.length,
          lastT: t,
          lapStartTick: -Math.round(17 / DT),
          lapTimes: [52.9],
        };
      });
      state.positions = order;
      const player = state.karts[0];
      if (player) player.item.held = 'red';
      return { state };
    },
  },
  ...([50, 100, 150] as const).map((cc): Scenario => ({
    name: `race-full-${cc}cc`,
    group: 'Race',
    description: `Full ${cc}cc race: you + 7 AI racers on Sunny Circuit, from the countdown.`,
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyRace(seed, { karts: 8, ai: true, engineClass: cc }) }),
  })),
  {
    name: 'ai-watch',
    group: 'Race',
    description:
      'Spectate: the camera follows the first AI racer while you sit out (autopilot parks you).',
    defaultSeed: 1,
    setup: (seed) => ({ state: sunnyRace(seed, { karts: 8, ai: true }), follow: 1 }),
  },
  {
    name: 'ai-stuck',
    group: 'Race',
    description:
      'An AI kart wedged nose-first against the outer wall mid-race — watch it back out.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed, { karts: 2, ai: true }), 10);
      const ai = state.karts[1];
      if (ai) {
        const t = 0.05;
        const wallSide = sunny.pointAt(t, sunny.wallOffset(16) - 1.6);
        ai.position = wallSide;
        ai.heading = sunny.headingAt(t) - Math.PI / 2; // facing straight into the right-hand wall
        ai.race = { ...ai.race, lap: 1, nextCheckpoint: 1, lastT: t };
      }
      return { state, follow: 1 };
    },
  },
];
