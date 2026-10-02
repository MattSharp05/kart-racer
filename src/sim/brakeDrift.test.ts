import { describe, expect, it } from 'vitest';
import { KART_IDS } from './data/karts';
import { isBrakeDrifting } from './drift';
import { kartPhysics } from './kartStats';
import { vec3 } from './math';
import { createRace } from './race/createRace';
import { createSimState } from './state';
import { step } from './step';
import { DT, tuning, type EngineClass } from './tuning';
import { NEUTRAL_INPUT, type InputFrame, type KartState, type SimState } from './types';

const ticks = (seconds: number) => Math.round(seconds / DT);

/** A kart on the test pad at `z`, facing −Z, at `speed`, in `engineClass`. */
function start(engineClass: EngineClass, speed: number, z = 0): SimState {
  return createSimState({
    seed: 1,
    engineClass,
    karts: [{ position: vec3(0, 0, z), speed }],
  });
}

/** Runs `n` ticks with the input `script(tick)` gives; returns every state after each tick. */
function run(state: SimState, n: number, script: (tick: number) => Partial<InputFrame>) {
  const frames: SimState[] = [];
  let s = state;
  for (let t = 0; t < n; t += 1) {
    s = step(s, [{ ...NEUTRAL_INPUT, ...script(t) }]).state;
    frames.push(s);
  }
  return frames;
}

const kart0 = (s: SimState) => {
  const kart = s.karts[0];
  if (!kart) throw new Error('no kart');
  return kart;
};

/** Distance along a run's path, m. */
function pathLength(frames: SimState[]): number {
  let length = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const a = kart0(frames[i - 1] as SimState).position;
    const b = kart0(frames[i] as SimState).position;
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return length;
}

/** Total heading change over a run, rad (unwrapped). */
function turned(frames: SimState[]): number {
  let total = 0;
  for (let i = 1; i < frames.length; i += 1) {
    let d = kart0(frames[i] as SimState).heading - kart0(frames[i - 1] as SimState).heading;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.abs(total);
}

/**
 * Starts a drift to the right at `engineClass` (90% of top speed, throttle held), then holds it
 * for `seconds` with neutral in-drift steer, braking or not. Returns the frames of the held part.
 */
function heldDrift(engineClass: EngineClass, brake: boolean, seconds = 1) {
  const top = tuning.topSpeed[engineClass];
  // Hop + drift start, and land, before measuring.
  const setup = run(start(engineClass, top * 0.9), ticks(0.5), (t) => ({
    throttle: 1,
    drift: true,
    steer: t === 0 ? 1 : 0,
  }));
  const from = setup[setup.length - 1] as SimState;
  expect(kart0(from).drift.direction).toBe(1);
  const frames = run(from, ticks(seconds), () => ({
    throttle: 1,
    drift: true,
    brake: brake ? 1 : 0,
  }));
  return { from, frames };
}

describe('200cc engine class (MK-96)', () => {
  it('createRace accepts 200cc and the race runs', () => {
    let state = createRace({
      trackId: 'sunny-circuit',
      racers: KART_IDS.slice(0, 4).map((kartId, i) => ({
        kartId,
        controller: i === 0 ? 'local' : 'ai',
      })),
      engineClass: 200,
      itemsOn: true,
      seed: 3,
    });
    expect(state.engineClass).toBe(200);
    for (let t = 0; t < ticks(8); t += 1) state = step(state, [NEUTRAL_INPUT]).state;
    expect(state.phase).toBe('racing');
    expect(state.karts.slice(1).some((kart) => kart.speed > tuning.topSpeed[150])).toBe(true);
  });

  it.each(KART_IDS)('top speed at 200cc is 1.3–1.4× 150cc for %s', (kartId) => {
    const ratio = kartPhysics(kartId, 200).topSpeed / kartPhysics(kartId, 150).topSpeed;
    expect(ratio).toBeGreaterThanOrEqual(1.3);
    expect(ratio).toBeLessThanOrEqual(1.4);
  });

  it('a kart driven flat out reaches 1.3–1.4× the 150cc speed, and gets there as quickly', () => {
    // From rest at the +Z end of the pad, 4 s of throttle (~99% of top speed).
    const speedAfter = (cc: EngineClass) => {
      const frames = run(start(cc, 0, 95), ticks(4), () => ({ throttle: 1 }));
      return kart0(frames[frames.length - 1] as SimState).speed;
    };
    const ratio = speedAfter(200) / speedAfter(150);
    expect(ratio).toBeGreaterThanOrEqual(1.3);
    expect(ratio).toBeLessThanOrEqual(1.4);
  });
});

describe('brake-drift (MK-96)', () => {
  it('only counts at 200cc, while drifting, with brake held', () => {
    const drifting: KartState = {
      ...kart0(start(200, 30)),
      drift: { direction: 1, charge: 0, tier: 0 },
    };
    const braking = { ...NEUTRAL_INPUT, brake: 1 };
    expect(isBrakeDrifting(drifting, braking, 200)).toBe(true);
    expect(isBrakeDrifting(drifting, NEUTRAL_INPUT, 200)).toBe(false);
    expect(isBrakeDrifting(kart0(start(200, 30)), braking, 200)).toBe(false);
    for (const cc of [50, 100, 150] as const) {
      expect(isBrakeDrifting(drifting, braking, cc)).toBe(false);
    }
  });

  it('brake held in a 200cc drift gives a tighter path with < 10% speed loss over 1 s', () => {
    const plain = heldDrift(200, false);
    const braked = heldDrift(200, true);
    // Tighter: more heading change, and a smaller radius (path length / heading change).
    expect(turned(braked.frames)).toBeGreaterThan(turned(plain.frames) * 1.2);
    const radius = (r: typeof plain) => pathLength(r.frames) / turned(r.frames);
    expect(radius(braked)).toBeLessThan(radius(plain) * 0.85);
    // Still drifting, and the speed mostly kept.
    const end = kart0(braked.frames[braked.frames.length - 1] as SimState);
    expect(end.drift.direction).toBe(1);
    const before = kart0(braked.from).speed;
    expect(end.speed).toBeGreaterThan(before * 0.9);
    expect(end.speed).toBeLessThan(kart0(plain.frames[plain.frames.length - 1] as SimState).speed);
  });

  it('keeps charging the mini-turbo while brake-drifting', () => {
    const plain = heldDrift(200, false);
    const braked = heldDrift(200, true);
    const charge = (r: typeof plain) =>
      kart0(r.frames[r.frames.length - 1] as SimState).drift.charge;
    expect(charge(braked)).toBeCloseTo(charge(plain), 6);
    expect(kart0(braked.frames[braked.frames.length - 1] as SimState).drift.tier).toBe(1);
  });

  it.each([50, 100, 150] as const)(
    'brake in a %icc drift behaves as before: brakes hard, no tighter turn',
    (cc) => {
      const plain = heldDrift(cc, false, 0.25);
      const braked = heldDrift(cc, true, 0.25);
      // Same drift yaw per tick while it lasts…
      const yaw = (r: typeof plain, i: number) =>
        kart0(r.frames[i] as SimState).heading -
        kart0((i === 0 ? r.from : r.frames[i - 1]) as SimState).heading;
      for (let i = 0; i < 5; i += 1) expect(yaw(braked, i)).toBeCloseTo(yaw(plain, i), 9);
      // …and the brake bites at full braking deceleration.
      const before = kart0(braked.from).speed;
      const after = kart0(braked.frames[4] as SimState).speed;
      expect(before - after).toBeGreaterThan(tuning.brakeDecel * 5 * DT * 0.9);
    },
  );

  it('brake at 200cc without a drift still brakes normally', () => {
    const top = tuning.topSpeed[200];
    const frames = run(start(200, top * 0.9), ticks(0.5), () => ({ brake: 1 }));
    const after = kart0(frames[frames.length - 1] as SimState).speed;
    expect(after).toBeCloseTo(top * 0.9 - tuning.brakeDecel * 0.5, 1);
  });
});
