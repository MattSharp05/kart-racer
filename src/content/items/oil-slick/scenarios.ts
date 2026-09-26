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
/** Where you are on the main straight (lap fraction). */
const YOU_T = 0.03;
/** How far behind you the AI follows, m. */
export const FOLLOWER_GAP = 12;

/** Puts kart `id` on Sunny's racing line at lap fraction `t` on lap 1, moving at `speed`. */
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
}

/**
 * A race 20 s in on Sunny Circuit's main straight: you, holding an Oil Slick, with an AI following
 * `FOLLOWER_GAP` m behind on the same line at the same speed.
 */
export function oilSlickRace(seed: number): SimState {
  const state = sunnyRace(seed, { karts: 2, ai: true });
  state.phase = 'racing';
  state.race.goTick = -Math.round(20 / DT);
  state.race.countdownStartTick = state.race.goTick - Math.round(tuning.countdownSeconds / DT);
  state.race.rubberBand = false;
  const speed = tuning.topSpeed[100] * 0.7;
  onLine(state, 0, YOU_T, speed);
  onLine(state, 1, YOU_T - FOLLOWER_GAP / sunny.length, speed);
  const ai = state.karts[1]?.ai;
  if (ai) ai.lineOffset = 0;
  state.positions = [0, 1];
  const [you] = state.karts;
  if (you) giveItem(you, 'oil-slick');
  return state;
}

/** Oil Slick (MK-65): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-oil-slick',
    group: 'Items',
    description:
      'Oil Slick (MK-65): racing down the main straight holding it, an AI 12 m behind you. Drop it: the AI drives through, slides for a second (no spin-out) and recovers. The puddle lasts 15 s.',
    defaultSeed: 1,
    setup: (seed) => ({ state: oilSlickRace(seed) }),
  },
  {
    name: 'item-oil-slick-watch',
    group: 'Items',
    description:
      'Oil Slick (MK-65), watched from the AI behind you: hold throttle and drop the slick, and the camera shows the AI hitting it and sliding.',
    defaultSeed: 1,
    setup: (seed) => ({ state: oilSlickRace(seed), follow: 1 }),
  },
];

export default scenarios;
