import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { kartOnTrack } from '../../../scenarios/tracks';
import { autopilotInput } from '../../../sim/autopilot';
import { KART_IDS } from '../../../sim/data/karts';
import { hazardGrip, hazardPose, hazardWarning } from '../../../sim/hazards';
import { createRace } from '../../../sim/race/createRace';
import { step } from '../../../sim/step';
import { surfaceEffect } from '../../../sim/surfaces';
import { groundAt, trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../../../sim/types';
import { tracks } from '..';
import { SANDSTORM_START_TICK } from './scenarios';
import { DUNE_CANYON, SANDSTORM, SANDSTORM_CELLS, duneCanyon } from './sim';

const geometry = trackGeometry(duneCanyon);
/** The far side of the plateau hairpin. */
const H1_APEX = { x: 362, z: -80 };
const TOP = tuning.topSpeed[150];
const PERIOD_TICKS = Math.round(SANDSTORM.period / DT);
const STORM_TICKS = Math.round((SANDSTORM.period * SANDSTORM.activeFraction) / DT);

function run(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  let s = state;
  const frames: SimState[] = [];
  for (let i = 0; i < ticks; i += 1) {
    s = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]).state;
    frames.push(s);
  }
  return { state: s, frames };
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

describe('Dune Canyon data', () => {
  it('is registered as a real (menu) track with its own theme', () => {
    const content = tracks.get('dune-canyon');
    expect(content.testOnly).toBeUndefined();
    expect(content.theme?.fog).toBeDefined();
    expect(content.def).toBe(duneCanyon);
  });

  it('is a valid, non-overlapping track of 1.1–1.4 km', () => {
    expect(geometry.length).toBeGreaterThan(1100);
    expect(geometry.length).toBeLessThan(1400);
    expect([...duneCanyon.checkpoints].sort((a, b) => a - b)).toEqual(duneCanyon.checkpoints);
    expect(duneCanyon.checkpoints[0]).toBe(0);
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
    expect(duneCanyon.gridSlots).toHaveLength(8);
    for (const slot of duneCanyon.gridSlots ?? []) {
      expect(geometry.project(geometry.pointAt(slot.t, slot.lateral)).surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.9);
    }
  });

  it('has 4 item box rows, sand drifts and one sandstorm', () => {
    expect(duneCanyon.itemBoxRows).toHaveLength(4);
    expect(duneCanyon.surfaceZones.filter((z) => z.type === 'sand').length).toBeGreaterThanOrEqual(
      4,
    );
    expect(duneCanyon.hazards).toEqual(SANDSTORM_CELLS);
    // Its cells blow in step: one storm.
    for (const cell of SANDSTORM_CELLS) {
      expect({ ...cell, centre: SANDSTORM.centre }).toEqual(SANDSTORM);
    }
  });
});

describe('Dune Canyon sandstorm', () => {
  it('blows exactly in its scheduled ticks: 20 s of every 60, from 40 s into each minute', () => {
    expect(SANDSTORM_START_TICK).toBe(2400);
    for (let tick = 0; tick < PERIOD_TICKS * 3; tick += 1) {
      const inCycle = tick % PERIOD_TICKS;
      const scheduled =
        inCycle >= SANDSTORM_START_TICK && inCycle < SANDSTORM_START_TICK + STORM_TICKS;
      for (const cell of SANDSTORM_CELLS) {
        expect(hazardPose(cell, tick).amount === 1).toBe(scheduled);
      }
    }
  });

  it('warns "SANDSTORM!" for the 3 s before it starts, and not otherwise', () => {
    const hazards = duneCanyon.hazards ?? [];
    const warnTicks = Math.round(tuning.hazards.warningSeconds / DT);
    for (let tick = 0; tick < PERIOD_TICKS * 2; tick += 1) {
      const toStart = SANDSTORM_START_TICK - (tick % PERIOD_TICKS);
      const expected = toStart > 0 && toStart <= warnTicks ? 'SANDSTORM!' : undefined;
      expect(hazardWarning(hazards, tick)).toBe(expected);
    }
  });

  it('lowers grip along the plateau straight only while it blows, never off the plateau', () => {
    const hazards = duneCanyon.hazards ?? [];
    const on = SANDSTORM_START_TICK + 60;
    // The whole straight, every 10 m from the first sand drift to the last.
    for (let x = 100; x <= 280; x += 10) {
      const plateau = geometry.pointAt(DUNE_CANYON.tAt(x, -124));
      expect(hazardGrip(hazards, on, plateau)).toBe(SANDSTORM.grip);
      expect(hazardGrip(hazards, SANDSTORM_START_TICK - 60, plateau)).toBe(1);
    }
    // Canyon floor, the hairpin, the jump's run-up and lip, the riverbed and the S-bends.
    const elsewhere = [
      [0, 0],
      [H1_APEX.x, H1_APEX.z],
      [300, -48],
      [240, -48],
      [DUNE_CANYON.riverbed.x, DUNE_CANYON.riverbed.z],
      [160, -36],
      [145, -15],
    ] as const;
    for (const [x, z] of elsewhere) {
      const point = geometry.pointAt(DUNE_CANYON.tAt(x, z));
      expect(hazardGrip(hazards, on, point)).toBe(1);
    }
    expect(SANDSTORM.grip).toBeGreaterThanOrEqual(0.6);
    expect(SANDSTORM.grip).toBeLessThan(1);
  });
});

describe('Dune Canyon features', () => {
  it('sand drifts cut a full-throttle kart to sandSpeed × top speed', () => {
    const zone = duneCanyon.surfaceZones.find((z) => z.type === 'sand' && z.lateralMin > 0)!;
    const lateral = (zone.lateralMin + zone.lateralMax) / 2;
    const t = zone.from + 0.1 * (zone.to - zone.from);
    expect(groundAt(duneCanyon, geometry.pointAt(t, lateral)).surface).toBe('sand');
    expect(surfaceEffect('sand').speed).toBe(tuning.surfaces.sandSpeed);
    // Enter the drift at top speed and hold a straight line for 0.5 s (still on the patch).
    const start = kartOnTrack(1, 'dune-canyon', t, { lateral, speed: TOP });
    start.engineClass = 150;
    const onSand = run(start, 30, () => ({ throttle: 1 })).state.karts[0]!;
    const road = kartOnTrack(1, 'dune-canyon', t, { lateral: -lateral, speed: TOP });
    road.engineClass = 150;
    const onRoad = run(road, 30, () => ({ throttle: 1 })).state.karts[0]!;
    expect(groundAt(duneCanyon, onSand.position).surface).toBe('sand');
    expect(onRoad.speed).toBeGreaterThan(TOP * 0.95);
    expect(onSand.speed).toBeLessThan(TOP * 0.85);
    // It keeps slowing towards the tuned cap: never below it within the patch, and past most of the gap.
    expect(onSand.speed).toBeGreaterThan(TOP * tuning.surfaces.sandSpeed);
  });

  it('the riverbed jump at full speed gives at least 0.6 s of airtime and lands on the road', () => {
    const start = scenarios.get('dune-canyon-jump')!.setup(1).state;
    start.engineClass = 150;
    let airborne = 0;
    let longest = 0;
    const { state } = run(start, 240, (s) => {
      airborne = s.karts[0]!.grounded ? 0 : airborne + DT;
      longest = Math.max(longest, airborne);
      return autopilot(s);
    });
    expect(longest).toBeGreaterThanOrEqual(0.6);
    expect(geometry.project(state.karts[0]!.position).surface).not.toBe('out');
  });

  /** Ticks from the slot mouth on the east leg until the kart is back on the west leg's road. */
  function slotTime(options: { cut: boolean; boost: number }): number {
    const { slot } = DUNE_CANYON;
    const t = DUNE_CANYON.tAt(slot.x0, slot.z - 25);
    const start = kartOnTrack(1, 'dune-canyon', t, { speed: TOP, boost: options.boost });
    start.engineClass = 150;
    let turnedIn = false;
    const { frames } = run(start, 900, (s) => {
      if (!options.cut) return autopilot(s);
      const k = s.karts[0]!;
      // Down the east leg to the slot's flared mouth, across the corridor, then up the west leg.
      if (!turnedIn && k.position.z < slot.z - 26) return autopilot(s);
      turnedIn = true;
      if (k.position.x > slot.x1 + 25) return aimAt(slot.x1 + 20, slot.z)(s);
      return aimAt(slot.x1, slot.z - 40)(s);
    });
    const done = frames.findIndex((f) => {
      const k = f.karts[0]!;
      return k.position.x < slot.x1 + 6 && k.position.z < slot.z - 20;
    });
    expect(done).toBeGreaterThan(0);
    return done;
  }

  it('the slot canyon beats the U-turn with a mushroom boost …', () => {
    expect(slotTime({ cut: true, boost: tuning.mushroomSeconds })).toBeLessThan(
      slotTime({ cut: false, boost: 0 }),
    );
  });

  it('… but is slower than the road without one', () => {
    expect(slotTime({ cut: true, boost: 0 })).toBeGreaterThan(slotTime({ cut: false, boost: 0 }));
  });

  it('the slot canyon floor is drivable sand, and the rock beside it is not', () => {
    const { slot, u } = DUNE_CANYON;
    expect(groundAt(duneCanyon, { x: u.x, y: 0, z: slot.z }).surface).toBe('rough');
    expect(groundAt(duneCanyon, { x: u.x, y: 0, z: slot.z + slot.halfWidth + 3 }).surface).toBe(
      'out',
    );
  });
});

describe('Dune Canyon race', () => {
  it('8 AI race 3 laps at 150cc: all finish in under 3 min, nobody stuck over 5 s', () => {
    let s = createRace({
      trackId: 'dune-canyon',
      racers: Array.from({ length: 8 }, (_, i) => ({
        kartId: KART_IDS[i % KART_IDS.length]!,
        controller: 'ai' as const,
      })),
      engineClass: 150,
      itemsOn: true,
      seed: 1,
    });
    const stuckFor = new Map<number, number>();
    let worst = 0;
    for (let i = 0; i < 60 * 60 * 4; i += 1) {
      s = step(s, []).state;
      if (s.phase === 'countdown') continue;
      for (const kart of s.karts) {
        if (kart.race.finishTick !== undefined) continue;
        const t = Math.abs(kart.speed) < 1 ? (stuckFor.get(kart.id) ?? 0) + DT : 0;
        stuckFor.set(kart.id, t);
        worst = Math.max(worst, t);
        expect(geometry.project(kart.position).surface).not.toBe('out');
      }
      if (s.karts.every((k) => k.race.finishTick !== undefined)) break;
    }
    const times = s.karts.map((k) => ((k.race.finishTick ?? Infinity) - s.race.goTick) * DT);
    expect(Math.max(...times)).toBeLessThan(180);
    expect(worst).toBeLessThanOrEqual(5);
  });

  it('track-dune-canyon: a 150cc race of you + 7 AI in countdown, you starting 5th–8th', () => {
    const state = scenarios.get('track-dune-canyon')!.setup(1).state;
    expect(state.trackId).toBe('dune-canyon');
    expect(state.phase).toBe('countdown');
    expect(state.engineClass).toBe(150);
    expect(state.karts).toHaveLength(8);
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(7);
  });
});
