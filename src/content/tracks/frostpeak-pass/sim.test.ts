import { describe, expect, it } from 'vitest';
import { rumbleLevel } from '../../../audio/rumble';
import { scenarios } from '../../../scenarios';
import { kartOnTrack } from '../../../scenarios/tracks';
import { autopilotInput } from '../../../sim/autopilot';
import { minGripAhead } from '../../../sim/ai/driver';
import { KART_IDS } from '../../../sim/data/karts';
import { hazardPose } from '../../../sim/hazards';
import { createRace } from '../../../sim/race/createRace';
import { step } from '../../../sim/step';
import { groundAt, trackGeometry } from '../../../sim/track';
import { DT, tuning } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimEvent, type SimState } from '../../../sim/types';
import { tracks } from '..';
import { SNOWBALL_LEAD_SECONDS, snowballCrossingTick } from './scenarios';
import { FROSTPEAK_PASS, SNOWBALL, SNOWBALLS, frostpeakPass } from './sim';

const geometry = trackGeometry(frostpeakPass);
const TOP = tuning.topSpeed[150];
const PERIOD_TICKS = Math.round(SNOWBALL.period / DT);
const { descent, lake, lakeIce, tunnel, hairpin } = FROSTPEAK_PASS;

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

const hazardHits = (events: SimEvent[]) =>
  events.filter((e) => e.type === 'kartHit' && e.kartId === 0 && e.kind === 'hazard');

describe('Frostpeak Pass data', () => {
  it('is registered as a real (menu) track with its own theme', () => {
    const content = tracks.get('frostpeak-pass');
    expect(content.testOnly).toBeUndefined();
    expect(content.theme?.fog).toBeDefined();
    expect(content.theme?.scenery).toBe('snow');
    expect(content.def).toBe(frostpeakPass);
  });

  it('is a valid, non-overlapping track of 1.0–1.3 km that climbs to the summit', () => {
    expect(geometry.length).toBeGreaterThan(1000);
    expect(geometry.length).toBeLessThan(1300);
    expect([...frostpeakPass.checkpoints].sort((a, b) => a - b)).toEqual(frostpeakPass.checkpoints);
    expect(frostpeakPass.checkpoints[0]).toBe(0);
    expect(Math.max(...geometry.samples.map((s) => s.y))).toBeCloseTo(FROSTPEAK_PASS.summitY, 0);
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
    expect(frostpeakPass.gridSlots).toHaveLength(8);
    for (const slot of frostpeakPass.gridSlots ?? []) {
      expect(geometry.project(geometry.pointAt(slot.t, slot.lateral)).surface).toBe('road');
      expect(slot.t).toBeGreaterThan(0.9);
    }
  });

  it('has 4 item box rows, the lake ice and 3 snowball lanes; no checkpoint the tunnel skips', () => {
    expect(frostpeakPass.itemBoxRows).toHaveLength(4);
    expect(frostpeakPass.surfaceZones).toEqual([lakeIce]);
    expect(frostpeakPass.hazards).toEqual(SNOWBALLS);
    expect(SNOWBALLS).toHaveLength(3);
    const entry = FROSTPEAK_PASS.tAt(tunnel.x0, hairpin.z - hairpin.radius);
    const exit = FROSTPEAK_PASS.tAt(tunnel.x0, hairpin.z + hairpin.radius);
    for (const t of frostpeakPass.checkpoints) expect(t > entry && t < exit).toBe(false);
  });
});

describe('Frostpeak Pass ice', () => {
  /** Sideways distance slid in 1 s by a kart at 20 m/s whose velocity points 30° off its heading. */
  function slide(t: number, lateral: number): number {
    const state = kartOnTrack(1, 'frostpeak-pass', t, { lateral, speed: 20 });
    state.engineClass = 150;
    const kart = state.karts[0]!;
    const angle = Math.PI / 6;
    const forward = { x: -Math.sin(kart.heading), z: -Math.cos(kart.heading) };
    const right = { x: -forward.z, z: forward.x };
    kart.velocity = {
      x: 20 * (forward.x * Math.cos(angle) + right.x * Math.sin(angle)),
      y: 0,
      z: 20 * (forward.z * Math.cos(angle) + right.z * Math.sin(angle)),
    };
    const start = { ...kart.position };
    const end = run(state, 60, () => ({})).state.karts[0]!.position;
    return (end.x - start.x) * right.x + (end.z - start.z) * right.z;
  }

  it('the lake is ice across all but its outside edge, which keeps its grip', () => {
    const t = FROSTPEAK_PASS.tAt(lake.x, lake.z + lake.radius);
    expect(groundAt(frostpeakPass, geometry.pointAt(t, 0)).surface).toBe('ice');
    expect(groundAt(frostpeakPass, geometry.pointAt(t, 11)).surface).toBe('ice');
    expect(groundAt(frostpeakPass, geometry.pointAt(t, -10)).surface).toBe('road');
  });

  it('a kart on the ice keeps sliding much further than on road (grip × iceGrip)', () => {
    const onIce = slide(FROSTPEAK_PASS.tAt(lake.x, lake.z + lake.radius), 2);
    const onRoad = slide(FROSTPEAK_PASS.tAt(0, 40), 0);
    // Sideways speed decays at lateralGrip on road (≈ 1/8 s), iceGrip × that on ice.
    expect(onRoad).toBeLessThan(2);
    expect(onIce).toBeGreaterThan(onRoad * 3);
    expect(onIce).toBeGreaterThan(5);
  });

  it('the AI plans the lake with the ice grip, so it enters slower than it otherwise would', () => {
    const line = frostpeakPass.aiLine ?? [];
    const before = geometry.project(geometry.pointAt(lakeIce.from)).s - 20;
    expect(minGripAhead(geometry, line, before, tuning.ai.brakeHorizon)).toBe(
      tuning.surfaces.iceGrip,
    );
    // The valley straight has no slippery surface.
    const valley = geometry.project(geometry.pointAt(FROSTPEAK_PASS.tAt(0, 60))).s;
    expect(minGripAhead(geometry, line, valley, tuning.ai.brakeHorizon)).toBe(1);

    const entrySpeeds = (caution: number) => {
      const saved = tuning.ai.lowGripCaution;
      tuning.ai.lowGripCaution = caution;
      try {
        let s = createRace({
          trackId: 'frostpeak-pass',
          racers: Array.from({ length: 4 }, (_, i) => ({
            kartId: KART_IDS[i % KART_IDS.length]!,
            controller: 'ai' as const,
          })),
          engineClass: 150,
          itemsOn: false,
          seed: 1,
        });
        const speeds: number[] = [];
        const onIce = new Map<number, boolean>();
        // One lap and a bit.
        for (let i = 0; i < 60 * 55; i += 1) {
          s = step(s, []).state;
          for (const k of s.karts) {
            const ice = groundAt(frostpeakPass, k.position).surface === 'ice';
            if (ice && !onIce.get(k.id)) speeds.push(k.speed);
            onIce.set(k.id, ice);
          }
        }
        return Math.max(...speeds);
      } finally {
        tuning.ai.lowGripCaution = saved;
      }
    };
    const careful = entrySpeeds(tuning.ai.lowGripCaution);
    expect(careful).toBeLessThan(TOP * 0.8);
    expect(careful).toBeLessThan(entrySpeeds(0) - 3);
  });
});

describe('Frostpeak Pass snowballs', () => {
  it('each lane rolls one snowball per period, a third of a period apart, over its lane only', () => {
    const crossings = SNOWBALLS.map((ball) => snowballCrossingTick(ball));
    const third = PERIOD_TICKS / 3;
    expect((crossings[1]! - crossings[0]! + PERIOD_TICKS) % PERIOD_TICKS).toBeCloseTo(third, -1);
    expect((crossings[2]! - crossings[1]! + PERIOD_TICKS) % PERIOD_TICKS).toBeCloseTo(third, -1);
    SNOWBALLS.forEach((ball, i) => {
      const lane = descent.lanes[i]!;
      const laneT = FROSTPEAK_PASS.tAt(lane, descent.z);
      let active = 0;
      for (let tick = 0; tick < PERIOD_TICKS; tick += 1) {
        const pose = hazardPose(ball, tick);
        if (pose.amount === 0) continue;
        active += 1;
        expect(pose.x).toBe(lane);
        // Wherever it touches the track (road or verge), that's the descent at its own lane.
        const where = geometry.project(pose);
        if (where.surface !== 'out')
          expect(Math.abs(where.t - laneT) * geometry.length).toBeLessThan(3);
      }
      // Rolling for part of the period only, and gone for the rest.
      expect(active).toBeGreaterThan(PERIOD_TICKS * 0.3);
      expect(active).toBeLessThan(PERIOD_TICKS * 0.9);
    });
  });

  it('is in sight on the slope for at least 2 s before it reaches the road', () => {
    for (const ball of SNOWBALLS) {
      const roadEdge = descent.z - 8;
      let rolling = 0;
      // A period in, so the whole run is after tick 0.
      for (let tick = PERIOD_TICKS + snowballCrossingTick(ball); tick > 0; tick -= 1) {
        const pose = hazardPose(ball, tick);
        if (pose.amount === 0) break;
        if (pose.z < roadEdge - SNOWBALL.radius) rolling += 1;
      }
      expect(rolling * DT).toBeGreaterThanOrEqual(2);
    }
  });

  it('a snowball rolling over a parked kart spins it out, once', () => {
    const [ball] = SNOWBALLS;
    const lane = descent.lanes[0]!;
    const state = kartOnTrack(1, 'frostpeak-pass', FROSTPEAK_PASS.tAt(lane, descent.z));
    const cross = snowballCrossingTick(ball!);
    state.tick = PERIOD_TICKS + cross - 60;
    const { frames, events } = run(state, 120, () => ({}));
    expect(hazardHits(events)).toHaveLength(1);
    const hitAt = frames.findIndex((f) => f.karts[0]!.spinTimer > 0);
    expect(hitAt).toBeGreaterThan(30);
    expect(hitAt).toBeLessThan(75);
  });

  it('nothing is hit in the gap between two snowballs', () => {
    const [ball] = SNOWBALLS;
    const lane = descent.lanes[0]!;
    const state = kartOnTrack(1, 'frostpeak-pass', FROSTPEAK_PASS.tAt(lane, descent.z));
    // The gap between two snowballs (with a margin each side).
    const gap: number[] = [];
    for (let tick = PERIOD_TICKS; tick < PERIOD_TICKS * 2; tick += 1) {
      if (hazardPose(ball!, tick).amount === 0) gap.push(tick);
    }
    expect(gap.length).toBeGreaterThan(60);
    state.tick = gap[0]! + 5;
    expect(hazardHits(run(state, gap.length - 10, () => ({})).events)).toHaveLength(0);
  });

  it('frostpeak-snowballs: holding W gets you run over; braking lets it roll past', () => {
    const setup = () => {
      const state = scenarios.get('frostpeak-snowballs')!.setup(1).state;
      state.engineClass = 150;
      return state;
    };
    const held = run(setup(), Math.round((SNOWBALL_LEAD_SECONDS + 1.5) / DT), () => ({
      throttle: 1,
    }));
    expect(hazardHits(held.events)).toHaveLength(1);
    const braked = run(setup(), Math.round((SNOWBALL_LEAD_SECONDS + 1.5) / DT), () => ({
      brake: 1,
    }));
    expect(hazardHits(braked.events)).toHaveLength(0);
  });

  it('rumbles for a kart near a rolling snowball, and not when none is near', () => {
    const state = scenarios.get('frostpeak-snowballs')!.setup(1).state;
    expect(rumbleLevel(state, 0)).toBeGreaterThan(0);
    const valley = kartOnTrack(1, 'frostpeak-pass', FROSTPEAK_PASS.tAt(0, 60));
    valley.tick = state.tick;
    expect(rumbleLevel(valley, 0)).toBe(0);
  });
});

describe('Frostpeak Pass tunnel', () => {
  /** Ticks from 25 m before the tunnel on the entry leg until back on the exit leg's road. */
  function tunnelTime(options: { cut: boolean; boost: number }): number {
    const entry = hairpin.z - hairpin.radius;
    const exit = hairpin.z + hairpin.radius;
    const middle = (tunnel.x0 + tunnel.x1) / 2;
    const start = kartOnTrack(1, 'frostpeak-pass', FROSTPEAK_PASS.tAt(tunnel.x0 - 25, entry), {
      speed: TOP,
      boost: options.boost,
    });
    start.engineClass = 150;
    let turnedIn = false;
    const { frames } = run(start, 900, (s) => {
      if (!options.cut) return autopilot(s);
      const k = s.karts[0]!;
      // Up the entry leg to the flared mouth, through the tunnel, then down the exit leg.
      if (!turnedIn && k.position.x < tunnel.x0 - 30) return autopilot(s);
      turnedIn = true;
      if (k.position.z < tunnel.z0) return aimAt(middle, (tunnel.z0 + tunnel.z1) / 2)(s);
      if (k.position.z < exit - 22) return aimAt(middle, exit)(s);
      return aimAt(tunnel.x0 - 40, exit)(s);
    });
    const done = frames.findIndex((f) => {
      const k = f.karts[0]!;
      return k.position.x < tunnel.x0 - 20 && k.position.z > exit - 16;
    });
    expect(done).toBeGreaterThan(0);
    return done;
  }

  it('the tunnel beats the summit hairpin with a mushroom boost …', () => {
    expect(tunnelTime({ cut: true, boost: tuning.mushroomSeconds })).toBeLessThan(
      tunnelTime({ cut: false, boost: 0 }) * 0.75,
    );
  });

  it('… but is slower than the road without one', () => {
    expect(tunnelTime({ cut: true, boost: 0 })).toBeGreaterThan(
      tunnelTime({ cut: false, boost: 0 }),
    );
  });

  it('the tunnel floor is drivable deep snow on the summit, and the snowbank beside it is not', () => {
    const middle = { x: (tunnel.x0 + tunnel.x1) / 2, y: 0, z: hairpin.z };
    expect(groundAt(frostpeakPass, middle)).toEqual({
      height: FROSTPEAK_PASS.summitY,
      surface: 'rough',
    });
    expect(groundAt(frostpeakPass, { ...middle, x: tunnel.x1 + 4 }).surface).toBe('out');
    expect(groundAt(frostpeakPass, { ...middle, x: tunnel.x0 - 4 }).surface).toBe('out');
  });

  it('frostpeak-tunnel: holding W with the boost carries you through onto the exit leg', () => {
    const start = scenarios.get('frostpeak-tunnel')!.setup(1).state;
    start.engineClass = 150;
    const exit = hairpin.z + hairpin.radius;
    const { frames } = run(start, 240, (s) =>
      s.karts[0]!.position.z < exit - 20
        ? aimAt((tunnel.x0 + tunnel.x1) / 2, exit)(s)
        : aimAt(tunnel.x0 - 40, exit)(s),
    );
    const surfaces = new Set(
      frames.map((f) => groundAt(frostpeakPass, f.karts[0]!.position).surface),
    );
    expect(surfaces.has('rough')).toBe(true);
    expect(surfaces.has('out')).toBe(false);
    const end = frames.at(-1)!.karts[0]!.position;
    expect(Math.abs(end.z - exit)).toBeLessThan(10);
  });
});

describe('Frostpeak Pass race', () => {
  it('8 AI race 3 laps at 150cc: all finish in under 3 min, nobody stuck over 5 s', () => {
    let s = createRace({
      trackId: 'frostpeak-pass',
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

  it('track-frostpeak-pass: a 150cc race of you + 7 AI in countdown, you starting 5th–8th', () => {
    const state = scenarios.get('track-frostpeak-pass')!.setup(1).state;
    expect(state.trackId).toBe('frostpeak-pass');
    expect(state.phase).toBe('countdown');
    expect(state.engineClass).toBe(150);
    expect(state.karts).toHaveLength(8);
    expect(state.karts.filter((k) => k.controller === 'ai')).toHaveLength(7);
    const player = state.karts.find((k) => k.controller === 'local')!;
    const slots = frostpeakPass.gridSlots ?? [];
    const pole = slots[0]!;
    // Grid slots 5–8 are the back two rows.
    const back = slots.slice(4).map((slot) => geometry.pointAt(slot.t, slot.lateral));
    expect(
      back.some((p) => Math.hypot(p.x - player.position.x, p.z - player.position.z) < 0.5),
    ).toBe(true);
    expect(pole).toBeDefined();
  });
});
