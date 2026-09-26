import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PrimitiveKartFactory } from '../../render/kartModels';
import { createSimState } from '../../sim/state';
import { step } from '../../sim/step';
import { DT } from '../../sim/tuning';
import { NEUTRAL_INPUT, type SimState } from '../../sim/types';
import { racers, type KartStats } from '.';

/** The racer roster (MK-63): stat budget, stats reaching the physics, model size. */

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
  it('includes Sprocket, Juniper and Blaze after the MVP four', () => {
    expect(racers.ids()).toEqual([...MVP, 'sprocket', 'juniper', 'blaze']);
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
});
