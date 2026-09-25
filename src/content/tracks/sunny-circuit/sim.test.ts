import { describe, expect, it } from 'vitest';
import { kartOnTrack, sunnyStart } from '../../../scenarios/tracks';
import { scenarios } from '../../../scenarios';
import { autopilotInput } from '../../../sim/autopilot';
import { step } from '../../../sim/step';
import { groundAt, trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { SUNNY_INFIELD, sunnyCircuit } from './sim';

const geometry = trackGeometry(sunnyCircuit);
const TOP = tuning.topSpeed[100];

function run(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  const frames: SimState[] = [];
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]);
    s = result.state;
    frames.push(s);
    events.push(...result.events);
  }
  return { frames, events, state: s };
}

const autopilot = (s: SimState) => autopilotInput(s.karts[0]!, geometry);

/** Steers straight at (x, z) at full throttle. */
function aimAt(x: number, z: number) {
  return (s: SimState): Partial<InputFrame> => {
    const k = s.karts[0]!;
    const desired = Math.atan2(-(x - k.position.x), -(z - k.position.z));
    let error = desired - k.heading;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    return { throttle: 1, steer: Math.max(-1, Math.min(1, -error * 3)) };
  };
}

describe('Sunny Circuit data', () => {
  it('is a valid, non-overlapping track of 1.1–1.4 km', () => {
    expect(geometry.length).toBeGreaterThan(1100);
    expect(geometry.length).toBeLessThan(1400);
    expect(sunnyCircuit.points.every((p) => p.width > 8)).toBe(true);
    expect(sunnyCircuit.checkpoints[0]).toBe(0);
    expect([...sunnyCircuit.checkpoints].sort((a, b) => a - b)).toEqual(sunnyCircuit.checkpoints);
    // No self-intersection: parts of the track that aren't neighbours stay further apart than
    // both of their walls (so walls never overlap).
    const n = geometry.samples.length;
    const minGap = 2 * geometry.wallOffset(16);
    for (let i = 0; i < n; i += 4) {
      for (let j = i + 80; j < n; j += 4) {
        if (n - (j - i) < 80) continue;
        const a = geometry.sample(i);
        const b = geometry.sample(j);
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(minGap);
      }
    }
  });

  it('puts all 8 grid slots on the road, behind the line', () => {
    expect(sunnyCircuit.gridSlots).toHaveLength(8);
    for (const slot of sunnyCircuit.gridSlots ?? []) {
      expect(geometry.project(geometry.pointAt(slot.t, slot.lateral)).surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.9);
    }
  });

  it('has 3 item box rows and 2–3 boost pads', () => {
    expect(sunnyCircuit.itemBoxRows).toHaveLength(3);
    const pads = sunnyCircuit.surfaceZones.filter((z) => z.type === 'boostPad');
    expect(pads.length).toBeGreaterThanOrEqual(2);
    expect(pads.length).toBeLessThanOrEqual(3);
  });
});

describe('Sunny Circuit features', () => {
  it('stays on the ground driving down the hill crest (no airborne flicker)', () => {
    const crest = geometry.project({ x: 175, y: 0, z: -190 }).t;
    const start = kartOnTrack(1, 'sunny-circuit', crest, { speed: TOP });
    const { frames, events } = run(start, 90, autopilot);
    expect(events.filter((e) => e.type === 'land')).toHaveLength(0);
    expect(frames.every((f) => f.karts[0]!.grounded)).toBe(true);
  });

  it('a boost pad gives a 1.0 s boost', () => {
    const start = scenarios.get('sunny-boost-pad')!.setup(1).state;
    const { frames, events } = run(start, 120, autopilot);
    expect(events.filter((e) => e.type === 'boostPad')).toHaveLength(1);
    expect(Math.max(...frames.map((f) => f.karts[0]!.boostTimer))).toBeCloseTo(
      tuning.boostPadSeconds,
      1,
    );
  });

  it('the jump at full speed gives at least 0.6 s of airtime and lands on the road', () => {
    const start = scenarios.get('sunny-jump')!.setup(1).state;
    const { events, frames } = run(start, 200, autopilot);
    const land = events.find((e) => e.type === 'land' && e.airTime > 0.3);
    expect(land && land.type === 'land' ? land.airTime : 0).toBeGreaterThanOrEqual(0.6);
    expect(events.some((e) => e.type === 'launch')).toBe(true);
    const after = frames.at(-1)!.karts[0]!;
    expect(geometry.project(after.position).surface).not.toBe('out');
  });

  it('tapping drift in the air off the ramp gives a trick boost on landing', () => {
    const start = scenarios.get('sunny-jump')!.setup(1).state;
    let tapped = 0;
    const { events } = run(start, 200, (s) => {
      // Tap drift for a few ticks right after the real ramp launch.
      const tap = s.karts[0]!.trick === 'ready' && tapped < 3;
      if (tap) tapped += 1;
      return { ...autopilot(s), drift: tap };
    });
    expect(events.some((e) => e.type === 'trick')).toBe(true);
    expect(events).toContainEqual({ type: 'boost', kartId: 0, seconds: tuning.trickBoostSeconds });
  });

  /** Ticks from the top of the U-turn until the kart is past the infield on the return straight. */
  function uTurnTime(options: { cut: boolean; boost: number }): number {
    const top = geometry.project({ x: SUNNY_INFIELD.x + 20, y: 0, z: -75 }).t;
    const start = kartOnTrack(1, 'sunny-circuit', top, { speed: TOP, boost: options.boost });
    const finishX = SUNNY_INFIELD.x + 20;
    let crossedInfield = false;
    const { frames } = run(start, 900, (s) => {
      if (!options.cut) return autopilot(s);
      const k = s.karts[0]!;
      if (!crossedInfield && k.position.z > SUNNY_INFIELD.z + SUNNY_INFIELD.radius) {
        crossedInfield = true;
      }
      return crossedInfield ? aimAt(finishX + 30, -5)(s) : aimAt(SUNNY_INFIELD.x, -2)(s);
    });
    const done = frames.findIndex((f) => {
      const k = f.karts[0]!;
      return k.position.z > -20 && k.position.x > finishX;
    });
    expect(done).toBeGreaterThan(0);
    return done;
  }

  it('the infield shortcut beats the road line with a boost (mushroom-length) …', () => {
    expect(uTurnTime({ cut: true, boost: 1.5 })).toBeLessThan(uTurnTime({ cut: false, boost: 0 }));
  });

  it('… but is slower than the road without one', () => {
    expect(uTurnTime({ cut: true, boost: 0 })).toBeGreaterThan(uTurnTime({ cut: false, boost: 0 }));
  });

  it('the shortcut infield is drivable grass, not a void', () => {
    expect(groundAt(sunnyCircuit, { x: SUNNY_INFIELD.x, y: 0, z: SUNNY_INFIELD.z })).toEqual({
      height: 0,
      surface: 'rough',
    });
  });

  // Note: at 100cc (24 m/s) 1.33 km can't be lapped in 35–45 s as MK-10 also hoped; flagged for QA.
  it('an autopilot lap from the grid takes 45–60 s and never leaves the track', () => {
    const start = sunnyStart(1);
    let lastS = geometry.project(start.karts[0]!.position).s;
    let travelled = 0;
    let ticks = 0;
    let s = start;
    while (travelled < geometry.length && ticks < 5000) {
      s = step(s, [autopilot(s)]).state;
      ticks += 1;
      const p = geometry.project(s.karts[0]!.position);
      expect(p.surface).not.toBe('out');
      let ds = p.s - lastS;
      if (ds < -geometry.length / 2) ds += geometry.length;
      travelled += ds;
      lastS = p.s;
    }
    const seconds = ticks * DT;
    expect(seconds).toBeGreaterThan(45);
    expect(seconds).toBeLessThan(60);
  });
});
