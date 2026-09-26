import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { kartOnTrack } from '../../../scenarios/tracks';
import { autopilotInput } from '../../../sim/autopilot';
import { KART_IDS } from '../../../sim/data/karts';
import { HAZARD_HITTER, hazardKinds, hazardPose } from '../../../sim/hazards';
import { createRace } from '../../../sim/race/createRace';
import { routeProgress } from '../../../sim/routes';
import { insidePolygon } from '../../../sim/splineTrack';
import { step } from '../../../sim/step';
import { groundAt, trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { tracks } from '..';
import { CRUSHERS_START_TICK } from './scenarios';
import { BELTS, CATWALK_ROUTE, COG_WORKS, CRUSHER, PISTONS, cogWorks } from './sim';

const geometry = trackGeometry(cogWorks);
const { tAt, pistonX, gauntletZ, backZ, catwalk } = COG_WORKS;
const CYCLE = Math.round(CRUSHER.period / DT);

function run(
  state: SimState,
  ticks: number,
  input: (s: SimState, i: number) => Partial<InputFrame>,
) {
  let s = state;
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const result = step(s, [{ ...NEUTRAL_INPUT, ...input(s, i) }]);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

const squashes = (events: SimEvent[], kartId = 0) =>
  events.filter((e) => e.type === 'kartHit' && e.kartId === kartId && e.by === HAZARD_HITTER);
const respawns = (events: SimEvent[], kartId = 0) =>
  events.filter((e) => e.type === 'respawn' && e.kartId === kartId);

/** A kart at 150cc top speed at `t`, `lateral` m off the centreline. */
function kartAt(t: number, lateral = 0) {
  const state = kartOnTrack(1, cogWorks.id, t, { lateral, speed: tuning.topSpeed[150] });
  state.engineClass = 150;
  return state;
}

/** Keeps a kart on its lane: steers towards `lateral` m off the centreline. */
function holdLane(s: SimState, lateral: number): Partial<InputFrame> {
  const kart = s.karts[0]!;
  const p = geometry.project(kart.position);
  const heading = geometry.headingAt(p.t);
  const error = Math.atan2(Math.sin(kart.heading - heading), Math.cos(kart.heading - heading));
  // Positive steer turns right (toward +lateral).
  return { throttle: 1, steer: Math.max(-1, Math.min(1, (lateral - p.lateral) * 0.3 + error * 2)) };
}

describe('Cog Works data', () => {
  it('is registered as a real (menu) track with its own factory theme', () => {
    const content = tracks.get('cog-works');
    expect(content.testOnly).toBeUndefined();
    expect(content.theme?.fog).toBeDefined();
    expect(content.theme?.scenery).toBe('factory');
    expect(content.def).toBe(cogWorks);
  });

  it('is a valid, non-overlapping track of 1.0–1.3 km', () => {
    expect(geometry.length).toBeGreaterThan(1000);
    expect(geometry.length).toBeLessThan(1300);
    expect([...cogWorks.checkpoints].sort((a, b) => a - b)).toEqual(cogWorks.checkpoints);
    expect(cogWorks.checkpoints[0]).toBe(0);
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

  it('puts all 8 grid slots on the road behind the line, and 4 item rows round the lap', () => {
    expect(cogWorks.gridSlots).toHaveLength(8);
    for (const slot of cogWorks.gridSlots ?? []) {
      expect(geometry.project(geometry.pointAt(slot.t, slot.lateral)).surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.9);
    }
    expect(cogWorks.itemBoxRows).toHaveLength(4);
  });

  it('has 3 road-wide pistons on the gauntlet, and two belts on the conveyor straight', () => {
    expect(cogWorks.hazards).toEqual(PISTONS);
    expect(PISTONS).toHaveLength(3);
    for (const [i, piston] of PISTONS.entries()) {
      expect(piston.kind).toBe('periodic');
      expect(piston.centre).toMatchObject({ x: pistonX[i], z: gauntletZ });
      const at = geometry.project(piston.centre);
      // Covers the road and its verges, wall to wall: no way round.
      expect(piston.halfWidth).toBeGreaterThanOrEqual(geometry.wallOffset(at.width) - 0.5);
      expect(Math.abs(at.lateral)).toBeLessThan(0.5);
    }
    expect(cogWorks.surfaceZones).toEqual([BELTS.forward, BELTS.backward]);
    const mid = (BELTS.forward.from + BELTS.forward.to) / 2;
    expect(groundAt(cogWorks, geometry.pointAt(mid, -4)).surface).toBe('conveyor');
    expect(groundAt(cogWorks, geometry.pointAt(mid, 4)).surface).toBe('conveyor');
    // The belts are the conveyor straight's only surface; the gauntlet is plain road.
    expect(groundAt(cogWorks, geometry.pointAt(tAt(pistonX[0], gauntletZ), 0)).surface).toBe(
      'road',
    );
  });

  it('the catwalk is a narrow floor across the furnace, with the pit either side', () => {
    const middle = { x: (catwalk.x0 + catwalk.x1) / 2, y: 0, z: backZ };
    expect(insidePolygon(middle.x, middle.z, [...COG_WORKS.catwalkFloor])).toBe(true);
    expect(groundAt(cogWorks, middle)).toEqual({ height: 0, surface: 'road' });
    for (const side of [-1, 1]) {
      const beside = { ...middle, z: backZ + side * (catwalk.halfWidth + 1.5) };
      expect(groundAt(cogWorks, beside).surface).toBe('out');
    }
  });
});

describe('Cog Works conveyor belts', () => {
  /** Ground speed (m/s) over a second of a kart holding W in `lane` m, once it's on the belt. */
  function groundSpeed(t: number, lane: number) {
    const start = kartAt(t, lane);
    const { state: on } = run(start, 30, (s) => holdLane(s, lane));
    const from = on.karts[0]!.position;
    const { state: end } = run(on, 60, (s) => holdLane(s, lane));
    const to = end.karts[0]!.position;
    return Math.hypot(to.x - from.x, to.z - from.z);
  }

  it('the forward belt adds its speed to yours, the backward one takes it off', () => {
    const onBelt = BELTS.forward.from + 12 / COG_WORKS.length;
    // The same lanes on the start straight, with no belt.
    const road = groundSpeed(tAt(0, 90), -4);
    expect(road).toBeCloseTo(tuning.topSpeed[150], 0);
    const belt = tuning.surfaces.conveyorSpeed;
    expect(groundSpeed(onBelt, -4) - road).toBeCloseTo(belt, 0);
    expect(groundSpeed(onBelt, 4) - road).toBeCloseTo(-belt, 0);
  });

  it('cog-works-conveyor: starts at top speed in the backward lane, just before the belts', () => {
    const state = scenarios.get('cog-works-conveyor')!.setup(1).state;
    expect(state.engineClass).toBe(150);
    const p = geometry.project(state.karts[0]!.position);
    expect(p.lateral).toBeGreaterThan(BELTS.backward.lateralMin);
    expect(p.t).toBeLessThan(BELTS.backward.from);
    expect((BELTS.backward.from - p.t) * COG_WORKS.length).toBeLessThan(15);
  });

  it('the AI line runs down the forward lane', () => {
    const line = cogWorks.aiLine ?? [];
    const n = line.length;
    for (let i = Math.ceil(BELTS.forward.from * n); i < BELTS.forward.to * n; i += 1) {
      expect(line[i]).toBeLessThan(BELTS.forward.lateralMax);
    }
  });
});

describe('Cog Works crushers', () => {
  const periodic = hazardKinds.get('periodic');

  it('each piston drops, stays down and rises on an exact tick every 3 s; the same every run', () => {
    const [first] = PISTONS;
    const amount = (tick: number) => hazardPose(first!, tick).amount;
    const move = tuning.hazards.crusherMoveFraction;
    const dropAt = Math.round((1 - CRUSHER.closedFraction - 2 * move) * CYCLE);
    const downAt = dropAt + Math.round(move * CYCLE);
    const upAt = CYCLE - Math.round(move * CYCLE);
    // Open until the drop tick, moving from it (float rounding aside).
    expect(amount(dropAt - 1)).toBe(0);
    expect(amount(dropAt)).toBeCloseTo(0, 6);
    expect(amount(dropAt + 1)).toBeGreaterThan(0.05);
    expect(amount(downAt)).toBe(1);
    expect(amount(upAt - 1)).toBe(1);
    expect(amount(upAt)).toBeCloseTo(1, 6);
    expect(amount(upAt + 1)).toBeLessThan(0.95);
    expect(amount(CYCLE)).toBe(0);
    for (const tick of [0, 37, dropAt + 5, downAt + 20, upAt + 3]) {
      expect(amount(tick + 7 * CYCLE)).toBeCloseTo(amount(tick), 9);
    }
    // Its warning lamp lights half a second before it drops.
    const warning = Math.round(tuning.hazards.crusherWarningSeconds / DT);
    expect(periodic.secondsUntilOn?.(first!, dropAt - warning)).toBeCloseTo(0.5, 6);
    expect(periodic.secondsUntilOn?.(first!, dropAt)).toBeCloseTo(0, 6);
    expect(periodic.secondsUntilOn?.(first!, downAt)).toBe(0);
  });

  it('drop one after another, a third of a cycle (1 s) apart, in the driving order', () => {
    const offset = CYCLE / 3;
    for (const tick of [0, 50, 100, 150]) {
      expect(hazardPose(PISTONS[1]!, tick + offset).amount).toBeCloseTo(
        hazardPose(PISTONS[0]!, tick).amount,
        9,
      );
      expect(hazardPose(PISTONS[2]!, tick + offset).amount).toBeCloseTo(
        hazardPose(PISTONS[1]!, tick).amount,
        9,
      );
    }
  });

  it('cog-works-crushers: holding W, the first piston squashes you (a short stop)', () => {
    const state = scenarios.get('cog-works-crushers')!.setup(1).state;
    expect(state.engineClass).toBe(150);
    expect(state.tick).toBe(CRUSHERS_START_TICK);
    const { state: end, events } = run(state, 120, (s) => ({
      throttle: 1,
      steer: autopilotInput(s.karts[0]!, geometry).steer,
    }));
    const hits = squashes(events);
    expect(hits).toHaveLength(1);
    const kart = end.karts[0]!;
    expect(Math.abs(kart.position.x - pistonX[0])).toBeLessThan(4);
    expect(kart.spinTimer).toBeGreaterThan(0);
  });

  it('cog-works-crushers: braking until it lifts, then going, rides the wave through all three', () => {
    const state = scenarios.get('cog-works-crushers')!.setup(1).state;
    const { state: end, events } = run(state, 360, (s, i) => ({
      throttle: i < 80 ? 0 : 1,
      brake: i < 80 ? 1 : 0,
      steer: autopilotInput(s.karts[0]!, geometry).steer,
    }));
    expect(squashes(events)).toHaveLength(0);
    expect(events.filter((e) => e.type === 'wallHit')).toHaveLength(0);
    expect(end.karts[0]!.position.x).toBeGreaterThan(pistonX[2] + 10);
  });
});

describe('Cog Works catwalk', () => {
  it('counts as lap progress across the furnace, and saves over 1.5 s on the road', () => {
    // Along the catwalk, progress runs smoothly from where it leaves to where it rejoins.
    let last = -1;
    for (let x = catwalk.x0 - 20; x > catwalk.x1 + 20; x -= 10) {
      const position = { x, y: 0, z: backZ };
      const route = routeProgress(geometry, position, geometry.project(position));
      expect(route).toBeDefined();
      expect(route!.t).toBeGreaterThan(last);
      last = route!.t;
    }
    // The catwalk is much shorter than the detour it skips.
    const [a, b] = CATWALK_ROUTE.path;
    const across = Math.hypot(b!.x - a!.x, b!.z - a!.z);
    const detour = (COG_WORKS.detour.to - COG_WORKS.detour.from) * COG_WORKS.length;
    expect((detour - across) / tuning.topSpeed[150]).toBeGreaterThan(1.5);
  });

  it('driving straight across at top speed, you stay on and come back onto the road', () => {
    const start = kartAt(tAt(catwalk.x0 + 30, backZ));
    const { state: end, events } = run(start, 420, () => ({ throttle: 1 }));
    expect(respawns(events)).toHaveLength(0);
    const kart = end.karts[0]!;
    expect(kart.position.x).toBeLessThan(catwalk.x1 - 10);
    expect(geometry.project(kart.position).surface).not.toBe('out');
  });

  it('falling off the catwalk puts you back where it leaves the road', () => {
    const start = kartAt(tAt(catwalk.x0 + 30, backZ));
    // Veer off the catwalk's side into the furnace.
    const { state: end, events } = run(start, 150, (_, i) => ({
      throttle: 1,
      steer: i > 40 ? 0.6 : 0,
    }));
    expect(respawns(events)).toHaveLength(1);
    expect(geometry.project(end.karts[0]!.position).t).toBeCloseTo(COG_WORKS.detour.from, 3);
  });
});

describe('Cog Works AI race', () => {
  it('8 AI race 3 laps at 150cc: all finish in under 3 min, under 1 squash each on average', () => {
    let s = createRace({
      trackId: 'cog-works',
      racers: Array.from({ length: 8 }, (_, i) => ({
        kartId: KART_IDS[i % KART_IDS.length]!,
        controller: 'ai' as const,
      })),
      engineClass: 150,
      itemsOn: true,
      seed: 1,
    });
    let crushed = 0;
    let falls = 0;
    const stuckFor = new Map<number, number>();
    const onCatwalk = new Set<number>();
    let worst = 0;
    for (let i = 0; i < 60 * 60 * 4; i += 1) {
      const result = step(s, []);
      s = result.state;
      for (const e of result.events) {
        if (e.type === 'kartHit' && e.by === HAZARD_HITTER) crushed += 1;
        if (e.type === 'respawn') falls += 1;
      }
      if (s.phase === 'countdown') continue;
      for (const kart of s.karts) {
        if (kart.race.finishTick !== undefined) continue;
        const t = Math.abs(kart.speed) < 1 ? (stuckFor.get(kart.id) ?? 0) + DT : 0;
        stuckFor.set(kart.id, t);
        worst = Math.max(worst, t);
        if (routeProgress(geometry, kart.position, geometry.project(kart.position))) {
          onCatwalk.add(kart.id);
        }
      }
      if (s.karts.every((k) => k.race.finishTick !== undefined)) break;
    }
    const times = s.karts.map((k) => ((k.race.finishTick ?? Infinity) - s.race.goTick) * DT);
    expect(Math.max(...times)).toBeLessThan(180);
    expect(crushed / s.karts.length).toBeLessThan(1);
    expect(falls).toBeLessThan(s.karts.length);
    expect(worst).toBeLessThanOrEqual(5);
    expect(onCatwalk.size).toBeGreaterThan(0);
  });

  it('track-cog-works: a 150cc race of you + 7 AI in countdown, you starting 5th–8th', () => {
    const state = scenarios.get('track-cog-works')!.setup(1).state;
    expect(state.trackId).toBe('cog-works');
    expect(state.phase).toBe('countdown');
    expect(state.engineClass).toBe(150);
    expect(state.karts).toHaveLength(8);
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(7);
    const player = state.karts.find((k) => k.controller === 'local')!;
    const slots = cogWorks.gridSlots ?? [];
    const back = slots.slice(4).map((slot) => geometry.pointAt(slot.t, slot.lateral));
    expect(
      back.some((p) => Math.hypot(p.x - player.position.x, p.z - player.position.z) < 0.5),
    ).toBe(true);
  });
});
