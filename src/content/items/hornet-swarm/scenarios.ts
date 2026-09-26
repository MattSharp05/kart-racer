import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { lineOffsetAt } from '../../../sim/ai/racingLine';
import { giveItem } from '../../../sim/items';
import { forwardFromHeading } from '../../../sim/math';
import { trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import type { SimState } from '../../../sim/types';
import type { Scenario } from '../../../scenarios/registry';
import { sunnyRace } from '../../../scenarios/race';

const sunny = trackGeometry(sunnyCircuit);
/** Where the back of the pack is on the main straight (lap fraction). */
const BACK_T = 0.03;
/** Gaps between karts, m, and the lanes they drive in (m off the racing line). */
export const GAP = 15;
const LANES = [0, -2.5, 2.5, 0];
/** `item-hornet-swarm-incoming`: the AI behind sets its swarm off this long after the start, s. */
export const SWARM_AFTER_SECONDS = 2;

/** Puts kart `id` on Sunny's racing line (+ `lane` m) at lap fraction `t` on lap 1, at `speed`. */
function onLine(state: SimState, id: number, t: number, lane: number, speed: number) {
  const kart = state.karts[id];
  if (!kart) return;
  kart.position = sunny.pointAt(t, lineOffsetAt(sunnyCircuit.aiLine ?? [], t) + lane);
  kart.heading = sunny.headingAt(t);
  const forward = forwardFromHeading(kart.heading);
  kart.velocity = { x: forward.x * speed, y: 0, z: forward.z * speed };
  kart.speed = speed;
  kart.race = {
    ...kart.race,
    lap: 1,
    nextCheckpoint:
      sunnyCircuit.checkpoints.filter((c) => c <= t).length % sunnyCircuit.checkpoints.length,
    lastT: t,
  };
  if (kart.ai) kart.ai.lineOffset = lane;
}

/**
 * A race 20 s in on Sunny Circuit's main straight with `karts` karts in a line, `GAP` m apart,
 * all at the same speed; `order` lists kart ids from the back. Nobody holds an item.
 */
function straightRace(seed: number, order: number[]): SimState {
  const state = sunnyRace(seed, { karts: order.length, ai: true });
  state.phase = 'racing';
  state.race.goTick = -Math.round(20 / DT);
  state.race.countdownStartTick = state.race.goTick - Math.round(tuning.countdownSeconds / DT);
  state.race.rubberBand = false;
  const speed = tuning.topSpeed[100] * 0.7;
  order.forEach((id, i) =>
    onLine(state, id, BACK_T + (i * GAP) / sunny.length, LANES[i] ?? 0, speed),
  );
  state.positions = [...order].reverse();
  return state;
}

/** You at the back holding a Hornet Swarm, three AI ahead at 15, 30 and 45 m. */
export function hornetSwarmRace(seed: number): SimState {
  const state = straightRace(seed, [0, 1, 2, 3]);
  const [you] = state.karts;
  if (you) giveItem(you, 'hornet-swarm');
  return state;
}

/** You in front, an AI 15 m behind holding a Hornet Swarm it sets off after `SWARM_AFTER_SECONDS`. */
export function hornetSwarmIncomingRace(seed: number): SimState {
  const state = straightRace(seed, [1, 0]);
  const rival = state.karts[1];
  if (rival?.ai) {
    giveItem(rival, 'hornet-swarm');
    rival.ai.itemDelay = SWARM_AFTER_SECONDS;
    rival.ai.itemHeld = 0;
  }
  return state;
}

/** Hornet Swarm (MK-67): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-hornet-swarm',
    group: 'Items',
    description:
      'Hornet Swarm (MK-67): at the back of 4 karts on the main straight holding it, the AI 15, 30 and 45 m ahead. Set it off: three hornets fly out, one per kart ahead, and each sting is a small wobble and speed loss (no spin-out). They are gone after 6 s.',
    defaultSeed: 1,
    setup: (seed) => ({ state: hornetSwarmRace(seed) }),
  },
  {
    name: 'item-hornet-swarm-incoming',
    group: 'Items',
    description:
      'Hornet Swarm (MK-67), on the receiving end: you lead, an AI 15 m behind sets a swarm off after 2 s. All three hornets chase you and the HUD shows an incoming warning next to the item slot; you get stung at most once every 0.5 s.',
    defaultSeed: 1,
    setup: (seed) => ({ state: hornetSwarmIncomingRace(seed) }),
  },
];

export default scenarios;
