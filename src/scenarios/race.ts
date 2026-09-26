import { KART_IDS, type KartId } from '../sim/data/karts';
import { lineOffsetAt } from '../sim/ai/racingLine';
import { sunnyCircuit } from '../content/tracks/sunny-circuit/sim';
import { forwardFromHeading } from '../sim/math';
import { allAiRace, raceTrackIds } from '../sim/items/balance';
import { createRace, raceSetupRng, type RacerSlot } from '../sim/race/createRace';
import { raceTime } from '../sim/raceFlow';
import { step } from '../sim/step';
import { trackGeometry } from '../sim/track';
import { rngInt, rngPick } from '../sim/rng';
import { DT, tuning, type EngineClass } from '../sim/tuning';
import { NEUTRAL_INPUT, type SimState } from '../sim/types';
import { recordStorage } from '../game/storage/records';
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
 * A race on Sunny Circuit from the grid, in countdown: a thin wrapper around `createRace` (MK-38).
 * Player = kart 0 (`local`). With AI, the grid order is shuffled (seeded) and the player starts
 * 5th–8th, as in a real race; otherwise the player is on pole and the others are parked dummies
 * (`remote`: they only move when a test drives them).
 */
export function sunnyRace(seed: number, options: RaceOptions | number = {}): SimState {
  const {
    karts = 1,
    ai = false,
    engineClass = 100,
    playerKart = 'maple',
  } = typeof options === 'number' ? { karts: options } : options;
  const rng = raceSetupRng(seed);
  const playerSlot = ai && karts >= 5 ? rngInt(rng, 4, Math.min(7, karts - 1)) : 0;
  const otherSlots = Array.from({ length: karts }, (_, i) => i).filter((i) => i !== playerSlot);
  const racers = Array.from({ length: karts }, (_, i): RacerSlot => {
    if (i === 0) return { kartId: playerKart, controller: 'local', gridSlot: playerSlot };
    return {
      kartId: ai ? rngPick(rng, KART_IDS) : (KART_IDS[i % KART_IDS.length] ?? 'maple'),
      controller: ai ? 'ai' : 'remote',
      gridSlot: otherSlots[i - 1] ?? i,
    };
  });
  return createRace({
    trackId: sunnyCircuit.id,
    racers,
    engineClass,
    itemsOn: true,
    seed,
    rng,
  });
}

/** 8 karts on Sunny's grid in order, with the local player in slot 3 and AI everywhere else. */
export function localKart3Race(seed: number): SimState {
  return createRace({
    trackId: sunnyCircuit.id,
    racers: Array.from({ length: 8 }, (_, i): RacerSlot => ({
      kartId: KART_IDS[i % KART_IDS.length] ?? 'maple',
      controller: i === 3 ? 'local' : 'ai',
    })),
    engineClass: 100,
    itemsOn: true,
    seed,
  });
}

/** Puts kart `id` at lap fraction `t` on lap `lap`, moving along the track at `speed`. */
function placeOnLap(
  state: SimState,
  id: number,
  t: number,
  lap: number,
  lateral: number,
  speed: number,
) {
  const kart = state.karts[id];
  if (!kart) return;
  const wrapped = ((t % 1) + 1) % 1;
  kart.position = sunny.pointAt(wrapped, lateral);
  kart.heading = sunny.headingAt(wrapped);
  const forward = forwardFromHeading(kart.heading);
  kart.velocity = { x: forward.x * speed, y: 0, z: forward.z * speed };
  kart.speed = speed;
  kart.race = {
    ...kart.race,
    lap,
    nextCheckpoint:
      sunnyCircuit.checkpoints.filter((c) => c <= wrapped).length % sunnyCircuit.checkpoints.length,
    lastT: wrapped,
  };
}

/** Lap 2 with the player `gap` m ahead (+) or behind (−) a pack of 7 AI. */
function gapRace(seed: number, gap: number): SimState {
  const state = racingSince(sunnyRace(seed, { karts: 8, ai: true }), 60);
  const packT = 0.6;
  const speed = tuning.topSpeed[100] * 0.8;
  placeOnLap(state, 0, packT + gap / sunny.length, 2, 0, speed);
  for (let id = 1; id < 8; id += 1) {
    placeOnLap(state, id, packT - (id - 1) * (8 / sunny.length), 2, ((id % 3) - 1) * 3, speed);
  }
  const ai = Array.from({ length: 7 }, (_, i) => i + 1);
  state.positions = gap > 0 ? [0, ...ai] : [...ai, 0];
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

/** Final lap, 100 m before the finish line, with laps of 52.4 s and 49.8 s behind. */
function finalStraight(seed: number): SimState {
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
  return state;
}

/** `race-all-items` skips this far into the race (s after GO), so items are already flying. */
export const ALL_ITEMS_SKIP_SECONDS = 20;

/**
 * The item balance race (MK-72): 8 AI with items on, on race track `(seed − 1) mod 6` (seed 1 =
 * the first), fast-forwarded `ALL_ITEMS_SKIP_SECONDS` into the race. Nobody is yours to drive.
 */
export function allItemsRace(seed: number): SimState {
  const trackIds = raceTrackIds();
  const trackId = trackIds[(((seed - 1) % trackIds.length) + trackIds.length) % trackIds.length];
  let state = allAiRace(seed, trackId ?? sunnyCircuit.id);
  while (state.phase !== 'racing' || raceTime(state) < ALL_ITEMS_SKIP_SECONDS) {
    state = step(state, [NEUTRAL_INPUT]).state;
  }
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
    setup: (seed) => ({ state: finalStraight(seed) }),
  },
  {
    name: 'records-has-best',
    group: 'Race',
    description:
      'race-final-straight on a profile with saved records (race 2:40.000, lap 0:48.000). Cross the line: a new race record, the lap record stands.',
    defaultSeed: 1,
    setup: (seed) => {
      const state = finalStraight(seed);
      return {
        state,
        storage: recordStorage(state.trackId, state.engineClass, {
          race: { time: 160, kart: 'boulder', date: '2026-09-01' },
          lap: { time: 48, kart: 'swoop', date: '2026-09-01' },
        }),
      };
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
  {
    name: 'ai-drift-corner',
    group: 'Race',
    description:
      'Three AI racers at speed approaching the hairpin; the camera follows the first. Watch them drift through (MK-15).',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed, { karts: 4, ai: true }), 30);
      state.race.rubberBand = false;
      const speed = tuning.topSpeed[100] * 0.85;
      placeOnLap(state, 0, 0.25, 2, 0, 0);
      [1, 2, 3].forEach((id, i) =>
        placeOnLap(state, id, 0.345 - i * (10 / sunny.length), 1, (i - 1) * 2.5, speed),
      );
      state.positions = [1, 2, 3, 0];
      return { state, follow: 1 };
    },
  },
  {
    name: 'ai-holding-green',
    group: 'Race',
    description:
      'An AI holding a Green shell, lined up right behind you on the straight. It fires as soon as it has thought about it (MK-21).',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed, { karts: 2, ai: true }), 20);
      state.race.rubberBand = false;
      const speed = tuning.topSpeed[100] * 0.7;
      // Both on the racing line, the AI 20 m back and about to fire.
      const line = sunnyCircuit.aiLine ?? [];
      const tYou = 0.03;
      const tAi = tYou - 20 / sunny.length;
      placeOnLap(state, 0, tYou, 1, lineOffsetAt(line, tYou), speed);
      placeOnLap(state, 1, tAi, 1, lineOffsetAt(line, tAi), speed);
      const ai = state.karts[1];
      if (ai?.ai) {
        ai.item.held = 'green';
        ai.ai.lineOffset = 0;
        ai.ai.aggression = 1;
        ai.ai.itemDelay = 0.4;
      }
      state.positions = [0, 1];
      return { state, follow: 1 };
    },
  },
  {
    name: 'ai-banana-dodge',
    group: 'Race',
    description:
      'A banana on the racing line ahead of 3 AI on the main straight; skilled drivers steer round it (MK-21).',
    defaultSeed: 1,
    setup: (seed) => {
      const state = racingSince(sunnyRace(seed, { karts: 4, ai: true }), 20);
      state.race.rubberBand = false;
      const speed = tuning.topSpeed[100] * 0.8;
      placeOnLap(state, 0, 0.5, 1, 0, 0);
      [1, 2, 3].forEach((id, i) =>
        placeOnLap(state, id, 0.02 - i * (9 / sunny.length), 1, 0, speed),
      );
      const t = 0.02 + 40 / sunny.length;
      const position = sunny.pointAt(t, lineOffsetAt(sunnyCircuit.aiLine ?? [], t));
      state.entities.push({
        id: 1000,
        kind: 'banana',
        position,
        from: position,
        flightTimer: 0,
        ownerId: -1,
        ownerImmune: 0,
      });
      state.positions = [1, 2, 3, 0];
      return { state, follow: 1 };
    },
  },
  {
    name: 'race-player-far-ahead',
    group: 'Race',
    description:
      'Lap 2: you are 400 m ahead of all 7 AI, who get up to +8% speed to catch up (rubber-banding, MK-15).',
    defaultSeed: 1,
    setup: (seed) => ({ state: gapRace(seed, 400) }),
  },
  {
    name: 'race-player-far-behind',
    group: 'Race',
    description:
      'Lap 2: you are 400 m behind all 7 AI, who ease off by up to 10% (rubber-banding, MK-15).',
    defaultSeed: 1,
    setup: (seed) => ({ state: gapRace(seed, -400) }),
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
    name: 'race-all-items',
    group: 'Race',
    description: `Watch 8 AI race with all 14 items (MK-72), fast-forwarded ${ALL_ITEMS_SKIP_SECONDS} s in; the camera follows 4th place. Seed 1–6 picks the track (Sunny, Dune, Frostpeak, Neon, Canopy, Cog).`,
    defaultSeed: 1,
    setup: (seed) => {
      const state = allItemsRace(seed);
      return { state, follow: state.positions[3] ?? 0 };
    },
  },
  {
    name: 'race-local-kart-3',
    group: 'Race',
    description:
      'You drive kart 3 (4th on the grid) against 7 AI: the camera, HUD, minimap and sound follow kart 3, not kart 0 (MK-38).',
    defaultSeed: 1,
    setup: (seed) => ({ state: localKart3Race(seed) }),
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
