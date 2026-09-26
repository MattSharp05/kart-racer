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
const FOLLOWER_GAP = 12;
/** The AI behind fires its red shell this long after the scenario starts, s. */
export const SHELL_AFTER_SECONDS = 3;

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
 * A race 20 s in on Sunny Circuit's main straight: you, holding a Bubble Shield, with an AI
 * `FOLLOWER_GAP` m behind holding a red shell that it fires after `SHELL_AFTER_SECONDS`.
 */
export function bubbleShieldRace(seed: number): SimState {
  const state = sunnyRace(seed, { karts: 2, ai: true });
  state.phase = 'racing';
  state.race.goTick = -Math.round(20 / DT);
  state.race.countdownStartTick = state.race.goTick - Math.round(tuning.countdownSeconds / DT);
  state.race.rubberBand = false;
  const speed = tuning.topSpeed[100] * 0.7;
  onLine(state, 0, YOU_T, speed);
  onLine(state, 1, YOU_T - FOLLOWER_GAP / sunny.length, speed);
  state.positions = [0, 1];
  const [you, rival] = state.karts;
  if (you) giveItem(you, 'bubble-shield');
  if (rival?.ai) {
    rival.ai.lineOffset = 0;
    giveItem(rival, 'red');
    rival.ai.itemDelay = SHELL_AFTER_SECONDS;
    rival.ai.itemHeld = 0;
  }
  return state;
}

/** Bubble Shield (MK-66): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-bubble-shield',
    group: 'Items',
    description:
      'Bubble Shield (MK-66): racing down the main straight holding it, an AI 12 m behind with a red shell it fires after 3 s. Raise the bubble first: the shell pops it and you keep driving, no spin-out.',
    defaultSeed: 1,
    setup: (seed) => ({ state: bubbleShieldRace(seed) }),
  },
];

export default scenarios;
