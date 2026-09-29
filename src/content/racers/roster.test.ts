import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PrimitiveKartFactory } from '../../render/kartModels';
import { scenarios } from '../../scenarios';
import { kartPhysics } from '../../sim/kartStats';
import { vec3 } from '../../sim/math';
import { createSimState } from '../../sim/state';
import { step } from '../../sim/step';
import { DT, tuning } from '../../sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from '../../sim/types';
import { racers, type KartStats } from '.';

/** The racer roster (MK-63, MK-64): stat budget, stats reaching the physics, model size. */

const MVP = ['maple', 'pixie', 'boulder', 'swoop'];
/** Each racer's stat total may stray this far from the MVP karts' average (PRD → Karts). */
const STAT_BUDGET_TOLERANCE = 0.05;
/** Most triangles one kart model may draw (sparks and boost flame showing, drone hidden). */
const MAX_TRIANGLES = 1500;
/** Leaderboard rows store the racer id (MK-56, `submit_record()`'s check). */
const RACER_ID = /^[a-z0-9-]{1,32}$/;

const total = (stats: KartStats) =>
  stats.speed + stats.acceleration + stats.handling + stats.weight;

describe('racer roster', () => {
  it('is the MVP four, then Sprocket, Juniper, Blaze, Coral, Tundra and Nova', () => {
    expect(racers.ids()).toEqual([
      ...MVP,
      'sprocket',
      'juniper',
      'blaze',
      'coral',
      'tundra',
      'nova',
    ]);
  });

  it('fills the 10-card racer select, so racer-select-full adds no stand-ins', () => {
    scenarios.get('racer-select-full')!.setup(1);
    expect(racers.ids()).toHaveLength(10);
    expect(racers.ids().filter((id) => id.startsWith('stand-in-'))).toEqual([]);
  });

  it.each(racers.ids())('%s: 1–5 stats within the MVP stat budget, a leaderboard-safe id', (id) => {
    const mvpAverage = MVP.reduce((sum, mvp) => sum + total(racers.get(mvp).stats), 0) / MVP.length;
    const { stats } = racers.get(id);
    for (const value of Object.values(stats)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(5);
    }
    expect(Math.abs(total(stats) / mvpAverage - 1)).toBeLessThanOrEqual(STAT_BUDGET_TOLERANCE);
    expect(id).toMatch(RACER_ID);
  });

  it('Blaze out-runs Sprocket on a long straight, Sprocket gets away first', () => {
    // Side by side at the back of the test pad, full throttle.
    let state: SimState = createSimState({
      seed: 1,
      karts: [
        { kartType: 'blaze', position: { x: -3, y: 0, z: 95 } },
        { kartType: 'sprocket', position: { x: 3, y: 0, z: 95 } },
      ],
    });
    const full = { ...NEUTRAL_INPUT, throttle: 1 };
    const speeds = (s: SimState) => s.karts.map((kart) => kart.speed);
    for (let tick = 1; tick <= Math.round(6 / DT); tick += 1) {
      state = step(state, [full, full]).state;
      if (tick === Math.round(0.5 / DT)) {
        const [blaze = 0, sprocket = 0] = speeds(state);
        expect(sprocket).toBeGreaterThan(blaze);
      }
    }
    const [blaze = 0, sprocket = 0] = speeds(state);
    expect(blaze).toBeGreaterThan(sprocket);
  });

  it.each(racers.ids())('%s: the model stays under 1.5k triangles', (id) => {
    const model = new PrimitiveKartFactory().create(id);
    model.sparks.forEach((s) => (s.visible = true));
    model.flame.visible = true;
    let triangles = 0;
    model.body.traverseVisible((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      const vertices = geometry.index?.count ?? geometry.getAttribute('position').count;
      const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
      triangles += (vertices / 3) * copies;
    });
    expect(triangles).toBeLessThan(MAX_TRIANGLES);
  });

  it('Tundra is the heaviest racer and wins a head-on bump against light Pixie', () => {
    const weight = (id: string) => kartPhysics(id, 100).weight;
    for (const id of racers.ids())
      if (id !== 'tundra') expect(weight('tundra')).toBeGreaterThan(weight(id));
    // Head-on at 12 m/s each, coasting: Tundra faces −Z, Pixie +Z.
    let state = createSimState({
      seed: 1,
      karts: [
        { kartType: 'tundra', position: vec3(0, 0, 10), heading: 0, speed: 12 },
        { kartType: 'pixie', position: vec3(0, 0, -10), heading: Math.PI, speed: 12 },
      ],
    });
    let bumped = false;
    for (let tick = 0; tick < Math.round(1.5 / DT) && !bumped; tick += 1) {
      const result = step(state, [NEUTRAL_INPUT, NEUTRAL_INPUT]);
      state = result.state;
      bumped = result.events.some((e) => e.type === 'bump');
    }
    expect(bumped).toBe(true);
    const [tundra, pixie] = state.karts;
    // Tundra keeps ploughing forwards (−Z); Pixie is knocked back the way it came (also −Z), faster.
    expect(tundra!.velocity.z).toBeLessThan(0);
    expect(pixie!.velocity.z).toBeLessThan(tundra!.velocity.z);
  });

  it('Coral reaches each drift tier sooner by strongDriftCharge; everyone else charges normally', () => {
    for (const id of racers.ids()) {
      expect(kartPhysics(id, 100).driftCharge).toBe(id === 'coral' ? tuning.strongDriftCharge : 1);
    }
    expect(tuning.strongDriftCharge).toBeGreaterThan(1);
    /** Ticks from pressing drift (steering right, then neutral) to each tier. */
    const tierTicks = (kartType: string) => {
      let state = createSimState({
        seed: 1,
        karts: [{ kartType, speed: tuning.topSpeed[100] * 0.9 }],
      });
      const reached: number[] = [];
      for (let tick = 0; reached.length < 3 && tick < Math.round(4 / DT); tick += 1) {
        const input: InputFrame = {
          ...NEUTRAL_INPUT,
          throttle: 1,
          drift: true,
          steer: tick === 0 ? 1 : 0,
        };
        const result = step(state, [input]);
        state = result.state;
        if (result.events.some((e) => e.type === 'driftTier')) reached.push(tick);
      }
      return reached;
    };
    const maple = tierTicks('maple');
    const coral = tierTicks('coral');
    expect(maple).toHaveLength(3);
    expect(coral).toHaveLength(3);
    maple.forEach((ticks, i) => {
      expect(coral[i]!).toBeLessThan(ticks);
      expect(Math.abs(coral[i]! - ticks / tuning.strongDriftCharge)).toBeLessThanOrEqual(2);
    });
  });
});
