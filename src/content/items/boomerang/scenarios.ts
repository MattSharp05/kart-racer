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
/** Where you are on the main straight (lap fraction)… */
const YOU_T = 0.03;
/** …and how far ahead the AI is, m, in your lane. */
export const GAP = 15;

/** Puts kart `id` on Sunny's racing line at lap fraction `t` on lap 1, at `speed`. */
function onLine(state: SimState, id: number, t: number, speed: number) {
  const kart = state.karts[id];
  if (!kart) return;
  kart.position = sunny.pointAt(t, lineOffsetAt(sunnyCircuit.aiLine ?? [], t));
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
  if (kart.ai) kart.ai.lineOffset = 0;
}

/**
 * A race 20 s in on Sunny Circuit's main straight: you holding a Boomerang, an AI `GAP` m ahead
 * in your lane, both at the same speed.
 */
export function boomerangRace(seed: number): SimState {
  const state = sunnyRace(seed, { karts: 2, ai: true });
  state.phase = 'racing';
  state.race.goTick = -Math.round(20 / DT);
  state.race.countdownStartTick = state.race.goTick - Math.round(tuning.countdownSeconds / DT);
  state.race.rubberBand = false;
  const speed = tuning.topSpeed[100] * 0.7;
  onLine(state, 0, YOU_T, speed);
  onLine(state, 1, YOU_T + GAP / sunny.length, speed);
  state.positions = [1, 0];
  const [you] = state.karts;
  if (you) giveItem(you, 'boomerang');
  return state;
}

/** Boomerang (MK-69): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-boomerang',
    group: 'Items',
    description:
      'Boomerang (MK-69): on the main straight holding it, an AI 15 m ahead in your lane. Throw it (hold brake to throw it backwards): it spins out the AI on the way out, flies about 40 m, curves back to you and you catch it for one more throw (2 max). It hits each kart once per throw and never you.',
    defaultSeed: 1,
    setup: (seed) => ({ state: boomerangRace(seed) }),
  },
];

export default scenarios;
