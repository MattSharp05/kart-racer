import { sunnyCircuit } from '../../tracks/sunny-circuit/sim';
import { lineOffsetAt } from '../../../sim/ai/racingLine';
import { giveItem } from '../../../sim/items';
import { nextEntityId } from '../../../sim/items/banana';
import { forwardFromHeading } from '../../../sim/math';
import { trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import type { SimState } from '../../../sim/types';
import type { Scenario } from '../../../scenarios/registry';
import { sunnyRace } from '../../../scenarios/race';

const sunny = trackGeometry(sunnyCircuit);
/** Where you are on the main straight (lap fraction). */
const YOU_T = 0.03;
/** A banana lies this far ahead of you on your line, and a stopped kart sits further on, m. */
export const BANANA_AHEAD = 15;
export const KART_AHEAD = 30;

/** A point on Sunny's racing line `metres` along the lap from lap fraction `YOU_T`. */
function lineAt(metres: number) {
  const t = YOU_T + metres / sunny.length;
  return { t, position: sunny.pointAt(t, lineOffsetAt(sunnyCircuit.aiLine ?? [], t)) };
}

/**
 * A race 20 s in on Sunny Circuit's main straight: you, holding Phase, rolling towards a banana
 * `BANANA_AHEAD` m ahead and a stopped kart `KART_AHEAD` m ahead, both on your line.
 */
export function phaseRace(seed: number): SimState {
  const state = sunnyRace(seed, { karts: 2 });
  state.phase = 'racing';
  state.race.goTick = -Math.round(20 / DT);
  state.race.countdownStartTick = state.race.goTick - Math.round(tuning.countdownSeconds / DT);
  const [you, parked] = state.karts;
  const speed = tuning.topSpeed[100] * 0.7;
  const place = (kart: typeof you, metres: number, v: number) => {
    if (!kart) return;
    const { t, position } = lineAt(metres);
    kart.position = position;
    kart.heading = sunny.headingAt(t);
    const forward = forwardFromHeading(kart.heading);
    kart.velocity = { x: forward.x * v, y: 0, z: forward.z * v };
    kart.speed = v;
    kart.race = {
      ...kart.race,
      lap: 1,
      nextCheckpoint:
        sunnyCircuit.checkpoints.filter((c) => c <= t).length % sunnyCircuit.checkpoints.length,
      lastT: t,
    };
  };
  place(you, 0, speed);
  place(parked, KART_AHEAD, 0);
  state.positions = [1, 0];
  if (you) giveItem(you, 'phase');
  const banana = lineAt(BANANA_AHEAD).position;
  state.entities.push({
    id: nextEntityId(state),
    kind: 'banana',
    position: banana,
    from: banana,
    flightTimer: 0,
    ownerId: 1,
    ownerImmune: 0,
  });
  return state;
}

/** Phase (MK-66): registered from this folder (`content/items/scenarios.ts`). */
const scenarios: Scenario[] = [
  {
    name: 'item-phase',
    group: 'Items',
    description:
      'Phase (MK-66): rolling down the main straight holding it, a banana 15 m ahead and a stopped kart 30 m ahead, both on your line. Phase and hold throttle: you turn ghostly, drive through both untouched (the banana stays), a little faster, for 3 s.',
    defaultSeed: 1,
    setup: (seed) => ({ state: phaseRace(seed) }),
  },
];

export default scenarios;
