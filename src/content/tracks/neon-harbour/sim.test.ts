import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { kartOnTrack } from '../../../scenarios/tracks';
import { autopilotInput } from '../../../sim/autopilot';
import { KART_IDS } from '../../../sim/data/karts';
import { hazardPose } from '../../../sim/hazards';
import { createRace } from '../../../sim/race/createRace';
import { step } from '../../../sim/step';
import { groundAt, trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { tracks } from '..';
import { TRAFFIC_MEET_SECONDS } from './scenarios';
import { NEON_HARBOUR, TRAFFIC, TRAFFIC_LANES, TRAFFIC_MOVERS, neonHarbour } from './sim';

const geometry = trackGeometry(neonHarbour);
const TOP = tuning.topSpeed[150];
const { city, warehouse, uturn, trafficX } = NEON_HARBOUR;
const PERIOD_TICKS = Math.round((TRAFFIC_MOVERS[0]?.period ?? 0) / DT);

function run(state: SimState, ticks: number, input: (s: SimState) => Partial<InputFrame>) {
  let s = state;
  const frames: SimState[] = [];
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input(s) }]);
    s = result.state;
    frames.push(s);
    events.push(...result.events);
  }
  return { state: s, frames, events };
}

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

const hazardHits = (events: SimEvent[], kartId = 0) =>
  events.filter((e) => e.type === 'kartHit' && e.kartId === kartId && e.kind === 'hazard');

/** Whether a vehicle is out on the street (not gone between its passes). */
const onStreet = (pose: { amount: number }) => pose.amount > 0;

describe('Neon Harbour data', () => {
  it('is registered as a real (menu) track with a night theme', () => {
    const content = tracks.get('neon-harbour');
    expect(content.testOnly).toBeUndefined();
    expect(content.theme?.night).toBe(true);
    expect(content.theme?.scenery).toBe('harbour');
    expect(content.def).toBe(neonHarbour);
  });

  it('is a valid, non-overlapping track of 1.0–1.3 km with a raised bridge', () => {
    expect(geometry.length).toBeGreaterThan(1000);
    expect(geometry.length).toBeLessThan(1300);
    expect([...neonHarbour.checkpoints].sort((a, b) => a - b)).toEqual(neonHarbour.checkpoints);
    expect(neonHarbour.checkpoints[0]).toBe(0);
    expect(Math.max(...geometry.samples.map((s) => s.y))).toBeCloseTo(NEON_HARBOUR.bridgeY, 0);
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
    expect(neonHarbour.gridSlots).toHaveLength(8);
    for (const slot of neonHarbour.gridSlots ?? []) {
      expect(geometry.project(geometry.pointAt(slot.t, slot.lateral)).surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.9);
    }
  });

  it('has 4 item box rows and 4 traffic vehicles; no checkpoint the warehouse skips', () => {
    expect(neonHarbour.itemBoxRows).toHaveLength(4);
    expect(neonHarbour.hazards).toEqual(TRAFFIC_MOVERS);
    expect(TRAFFIC_MOVERS).toHaveLength(4);
    const [entry, exit] = neonHarbour.wallGaps.map((gap) => gap.from);
    expect(entry).toBeDefined();
    for (const t of neonHarbour.checkpoints) expect(t > entry! && t < (exit ?? 1)).toBe(false);
  });
});

describe('Neon Harbour traffic', () => {
  it('is a pure function of the tick: the same poses every time, and in two identical races', () => {
    // Asked in any order, any number of times: the same pose for the same tick.
    const ticks = Array.from({ length: 60 }, (_, i) => i * 37);
    const forwards = ticks.map((tick) => TRAFFIC_MOVERS.map((v) => hazardPose(v, tick)));
    const backwards = [...ticks]
      .reverse()
      .map((tick) => TRAFFIC_MOVERS.map((v) => hazardPose(v, tick)))
      .reverse();
    expect(backwards).toEqual(forwards);
    const race = () =>
      run(scenarios.get('track-neon-harbour')!.setup(1).state, 60 * 30, () => ({}));
    const a = race();
    const b = race();
    expect(a.state).toEqual(b.state);
  });

  it('drives towards the racers along its lane on the city street, then is gone for a while', () => {
    for (const vehicle of TRAFFIC_MOVERS) {
      const lanes = TRAFFIC_LANES.map((lateral) => city.z - lateral);
      let up = 0;
      for (let tick = 0; tick < PERIOD_TICKS; tick += 1) {
        const pose = hazardPose(vehicle, tick);
        if (!onStreet(pose)) continue;
        up += 1;
        // In one of the two lanes, within the city block, facing east (+X): oncoming.
        expect(lanes.some((z) => Math.abs(pose.z - z) < 0.01)).toBe(true);
        expect(pose.x).toBeGreaterThan(trafficX.rise - TRAFFIC.ramp);
        expect(pose.x).toBeLessThan(trafficX.sink + TRAFFIC.ramp);
        if (pose.y === 0) expect(Math.abs(pose.heading + Math.PI / 2)).toBeLessThan(0.01);
      }
      // Out on the street for a good part of its period, and gone for the rest.
      expect(up / PERIOD_TICKS).toBeGreaterThan(0.4);
      expect(up / PERIOD_TICKS).toBeLessThan(0.6);
    }
  });

  it('always leaves a gap: vehicles in the two lanes are never within 40 m of each other', () => {
    for (let tick = 0; tick < PERIOD_TICKS; tick += 1) {
      const up = TRAFFIC_MOVERS.map((vehicle) => hazardPose(vehicle, tick)).filter(onStreet);
      for (const a of up) {
        for (const b of up) {
          if (a === b) continue;
          if (a.z !== b.z) expect(Math.abs(a.x - b.x)).toBeGreaterThan(40);
          // And in the same lane, even further apart.
          else expect(Math.abs(a.x - b.x)).toBeGreaterThan(80);
        }
      }
    }
  });

  it('a vehicle driving into a parked kart spins it out, and only a vehicle out on the street hits', () => {
    const lane = TRAFFIC_LANES[0];
    let s = kartOnTrack(1, 'neon-harbour', NEON_HARBOUR.tAt(160, city.z), { lateral: lane });
    let hits = 0;
    for (let i = 0; i < PERIOD_TICKS; i += 1) {
      const result = step(s, [NEUTRAL_INPUT]);
      s = result.state;
      const kart = s.karts[0]!;
      for (const hit of hazardHits(result.events)) {
        expect(hit).toBeDefined();
        hits += 1;
        // Hit by a vehicle you can see, right there: its roof is above the road.
        const hitter = TRAFFIC_MOVERS.map((vehicle) => hazardPose(vehicle, s.tick)).find(
          (p) => onStreet(p) && Math.hypot(p.x - kart.position.x, p.z - kart.position.z) < 4,
        );
        expect(hitter).toBeDefined();
        expect(hitter!.y).toBeGreaterThan(-TRAFFIC.depth);
        expect(kart.spinTimer).toBeGreaterThan(0);
      }
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('neon-harbour-traffic: holding W gets you hit; changing lanes misses', () => {
    const ticks = Math.round((TRAFFIC_MEET_SECONDS + 1) / DT);
    const hold = run(scenarios.get('neon-harbour-traffic')!.setup(1).state, ticks, () => ({
      throttle: 1,
    }));
    expect(hazardHits(hold.events)).toHaveLength(1);
    const swerve = run(scenarios.get('neon-harbour-traffic')!.setup(1).state, ticks, (s) =>
      s.karts[0]!.position.x > 185
        ? aimAt(140, city.z - TRAFFIC_LANES[1])(s)
        : aimAt(100, city.z - TRAFFIC_LANES[1])(s),
    );
    expect(hazardHits(swerve.events)).toHaveLength(0);
  });
});

describe('Neon Harbour warehouse', () => {
  const middle = (warehouse.cutZ0 + warehouse.cutZ1) / 2;

  /** Ticks from the south-going leg, round the U-turn or through the warehouse, to the quay. */
  function lapOfTheUTurn(options: { cut: boolean; boost: number }): number {
    const start = kartOnTrack(1, 'neon-harbour', NEON_HARBOUR.tAt(80, 150), {
      speed: TOP,
      boost: options.boost,
    });
    start.engineClass = 150;
    let turnedIn = false;
    const { frames } = run(start, 900, (s) => {
      const k = s.karts[0]!;
      if (!options.cut) return autopilotInput(k, geometry);
      // Turn in early towards the east door, straight through, then north up the quay.
      if (!turnedIn && k.position.z < middle - 45) return autopilotInput(k, geometry);
      turnedIn = true;
      if (k.position.x > warehouse.x1 + 2) return aimAt(warehouse.x1, middle)(s);
      if (k.position.x > 12) return aimAt(-10, middle)(s);
      return aimAt(0, middle - 40)(s);
    });
    const done = frames.findIndex((f) => {
      const k = f.karts[0]!;
      return k.position.x < 2 && k.position.z < middle - 20;
    });
    expect(done).toBeGreaterThan(0);
    return done;
  }

  it('the warehouse beats the U-turn with a mushroom boost …', () => {
    expect(lapOfTheUTurn({ cut: true, boost: tuning.mushroomSeconds })).toBeLessThan(
      lapOfTheUTurn({ cut: false, boost: 0 }) * 0.75,
    );
  });

  it('… but is slower than the road without one', () => {
    expect(lapOfTheUTurn({ cut: true, boost: 0 })).toBeGreaterThan(
      lapOfTheUTurn({ cut: false, boost: 0 }),
    );
  });

  it('the warehouse floor is drivable (cluttered, `rough`), and the building either side is not', () => {
    const inside = { x: (warehouse.x0 + warehouse.x1) / 2, y: 0, z: middle };
    expect(groundAt(neonHarbour, inside)).toEqual({ height: 0, surface: 'rough' });
    expect(groundAt(neonHarbour, { ...inside, z: warehouse.cutZ0 - 4 }).surface).toBe('out');
    expect(groundAt(neonHarbour, { ...inside, z: warehouse.cutZ1 + 4 }).surface).toBe('out');
  });

  it('neon-harbour-warehouse: holding W with the boost carries you through to the quay', () => {
    const start = scenarios.get('neon-harbour-warehouse')!.setup(1).state;
    const { frames } = run(start, 150, () => ({ throttle: 1 }));
    const surfaces = new Set(
      frames.map((f) => groundAt(neonHarbour, f.karts[0]!.position).surface),
    );
    expect(surfaces.has('rough')).toBe(true);
    expect(surfaces.has('out')).toBe(false);
    const end = frames.at(-1)!.karts[0]!.position;
    expect(Math.abs(end.x - (uturn.x - uturn.radius))).toBeLessThan(10);
  });
});

describe('Neon Harbour race', () => {
  it('8 AI race 3 laps at 150cc: all finish under 3 min, nobody stuck, under 1 traffic hit each', () => {
    let s = createRace({
      trackId: 'neon-harbour',
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
    let hits = 0;
    for (let i = 0; i < 60 * 60 * 4; i += 1) {
      const result = step(s, []);
      s = result.state;
      hits += result.events.filter((e) => e.type === 'kartHit' && e.kind === 'hazard').length;
      if (s.phase === 'countdown') continue;
      for (const kart of s.karts) {
        if (kart.race.finishTick !== undefined) continue;
        const t = Math.abs(kart.speed) < 1 ? (stuckFor.get(kart.id) ?? 0) + DT : 0;
        stuckFor.set(kart.id, t);
        worst = Math.max(worst, t);
      }
      if (s.karts.every((k) => k.race.finishTick !== undefined)) break;
    }
    const times = s.karts.map((k) => ((k.race.finishTick ?? Infinity) - s.race.goTick) * DT);
    expect(Math.max(...times)).toBeLessThan(180);
    expect(worst).toBeLessThanOrEqual(5);
    expect(hits / s.karts.length).toBeLessThan(1);
  });

  it('track-neon-harbour: a 150cc race of you + 7 AI in countdown, you starting 5th–8th', () => {
    const state = scenarios.get('track-neon-harbour')!.setup(1).state;
    expect(state.trackId).toBe('neon-harbour');
    expect(state.phase).toBe('countdown');
    expect(state.engineClass).toBe(150);
    expect(state.karts).toHaveLength(8);
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(7);
    const player = state.karts.find((k) => k.controller === 'local')!;
    const back = (neonHarbour.gridSlots ?? [])
      .slice(4)
      .map((slot) => geometry.pointAt(slot.t, slot.lateral));
    expect(
      back.some((p) => Math.hypot(p.x - player.position.x, p.z - player.position.z) < 0.5),
    ).toBe(true);
  });
});
