import { beforeAll, describe, expect, it } from 'vitest';
import { tracks } from '../../../../content/tracks';
import { BULLET_ITEM, mk8Bullet, mk8BulletRide } from '../../../../scenarios/mk8/bulletBill';
import { step } from '../../../../sim/step';
import { getTrack } from '../../../../sim/track';
import { groundAt, type MeshTrackDef } from '../../../../sim/meshTrack';
import { TICK_RATE, tuning } from '../../../../sim/tuning';
import type { RouteDef, RoutePoint } from '../../../../sim/route';
import {
  NEUTRAL_INPUT,
  type InputFrame,
  type SimEvent,
  type SimState,
} from '../../../../sim/types';
import { registerMk8Content } from '../../../register';
import { testRampTrack } from '../../courses/test-ramp';
import { TEST_RAMP_LAYOUT } from '../../courses/test-ramp';
import { registerTestRamp } from '../../courses/test-ramp/register';
import { BULLET, BulletData, isBullet } from './sim';

/** A copy of the test ramp whose route climbs the tunnel's anti-gravity wall and comes back down. */
const WALL_ID = 'mk8-test-ramp-wall';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
  if (tracks.has(WALL_ID)) return;
  const ramp = testRampTrack();
  const { tunnel, roadHalfWidth } = TEST_RAMP_LAYOUT;
  // On the wall (z = 7, facing −Z) from x 45 to 70, halfway up; on the floor either side.
  const wall: RoutePoint[] = [45, 55, 65, 70].map((x) => ({
    x,
    y: tunnel.height / 2,
    z: roadHalfWidth,
    up: { x: 0, y: 0, z: -1 },
    width: tunnel.height - 1,
  }));
  const points = ramp.route.points.flatMap((p) =>
    p.z === 0 && p.y === 0 && p.x > tunnel.from && p.x < tunnel.to ? [] : [p],
  );
  const at = points.findIndex((p) => p.z === 0 && p.x >= tunnel.to);
  points.splice(at, 0, ...wall);
  const route: RouteDef = { ...ramp.route, points };
  const def: MeshTrackDef = { ...ramp, id: WALL_ID, route };
  tracks.register({ id: WALL_ID, name: 'Wall ramp', order: 1001, def, testOnly: true });
});

const ticks = (seconds: number) => Math.round(seconds * TICK_RATE);

/** Steps `n` ticks, the player with `input`, everyone else idle; collects events. */
function run(state: SimState, n: number, input: Partial<InputFrame> = {}) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < n; i += 1) {
    const inputs = s.karts.map((k) =>
      k.id === 0 ? { ...NEUTRAL_INPUT, ...input } : NEUTRAL_INPUT,
    );
    const result = step(s, inputs);
    s = result.state;
    events.push(...result.events);
  }
  return { state: s, events };
}

/** Presses and releases the item button (2 ticks). */
function fire(state: SimState) {
  const down = run(state, 1, { item: true });
  const up = run(down.state, 1);
  return { state: up.state, events: [...down.events, ...up.events] };
}

const hitsBy = (events: SimEvent[]) =>
  events.flatMap((e) => (e.type === 'kartHit' && e.kind === BULLET ? [e.kartId] : []));

describe('Bullet Bill (MK-120)', () => {
  it('keeps the scenarios’ copy of its id in step', () => {
    expect(BULLET_ITEM).toBe(BULLET);
  });

  it('rides the route from last place, hitting the karts in its path', () => {
    const fired = fire(mk8Bullet(1));
    expect(isBullet(fired.state.karts[0]!)).toBe(true);
    // Steering and braking are ignored: it rides on regardless.
    const ridden = run(fired.state, ticks(tuning.mk8.bulletTime), { steer: 1, brake: 1 });
    const events = [...fired.events, ...ridden.events];
    expect(new Set(hitsBy(events))).toEqual(new Set([1, 2, 3, 4]));
    const player = ridden.state.karts[0]!;
    // ~285 m on: well into turn B, past every kart it hit.
    expect(player.position.z).toBeGreaterThan(10);
    expect(ridden.state.positions.indexOf(0)).toBeLessThan(3);
    // Kart 5 was beside the line, out of reach.
    expect(hitsBy(events)).not.toContain(5);
  });

  it("can't be hit, and blocks using the second item meanwhile", () => {
    const fired = fire(mk8Bullet(1));
    const s = fired.state;
    s.karts[0]!.item.held = 'mushroom';
    s.karts[0]!.item.uses = 1;
    const pressed = run(s, 2, { item: true });
    expect(pressed.state.karts[0]!.item.held).toBe('mushroom');
    expect(pressed.events.some((e) => e.type === 'itemUsed' && e.kartId === 0)).toBe(false);
    // Held through the end of the bullet, it isn't used either: it takes a fresh press.
    const held = run(pressed.state, ticks(tuning.mk8.bulletTime), { item: true });
    expect(isBullet(held.state.karts[0]!)).toBe(false);
    expect(held.state.karts[0]!.item.held).toBe('mushroom');
    const again = fire(run(held.state, 1).state);
    expect(again.events).toContainEqual({ type: 'itemUsed', kartId: 0, item: 'mushroom' });
  });

  it('follows the anti-gravity wall without falling off', () => {
    let { state } = fire(mk8Bullet(1, WALL_ID));
    let onWall = 0;
    let lowest = Infinity;
    for (let i = 0; i < ticks(3); i += 1) {
      state = run(state, 1).state;
      const kart = state.karts[0]!;
      expect(kart.respawnTimer).toBe(0);
      lowest = Math.min(lowest, kart.position.y);
      if (kart.position.x > 50 && kart.position.x < 65) {
        onWall += 1;
        // On the wall's face, standing out from it.
        expect(kart.position.z).toBeCloseTo(TEST_RAMP_LAYOUT.roadHalfWidth, 1);
        expect(kart.position.y).toBeGreaterThan(1);
        expect(kart.up!.z).toBeLessThan(-0.95);
        expect(kart.antigrav).toBe(true);
      }
    }
    expect(onWall).toBeGreaterThan(10);
    expect(lowest).toBeGreaterThan(-0.5);
    // Back on the floor past the tunnel, still riding.
    const kart = state.karts[0]!;
    expect(kart.position.x).toBeGreaterThan(TEST_RAMP_LAYOUT.tunnel.to);
    expect(isBullet(kart)).toBe(true);
  });

  it('flies over the gap, and ending there leaves the kart on the road beyond it', () => {
    const { gap } = TEST_RAMP_LAYOUT;
    let { state } = fire(mk8Bullet(1));
    while (state.karts[0]!.position.x < (gap.from + gap.to) / 2) state = run(state, 1).state;
    const over = state.karts[0]!;
    expect(over.respawnTimer).toBe(0);
    // End it now, over the void.
    over.effects.find((e) => e.kind === BULLET)!.ticksLeft = 1;
    const ended = run(state, 1);
    const kart = ended.state.karts[0]!;
    expect(isBullet(kart)).toBe(false);
    expect(kart.position.x).toBeGreaterThanOrEqual(gap.to);
    const track = getTrack('mk8-test-ramp') as MeshTrackDef;
    expect(groundAt(track.collision, kart.position, kart.up!)?.surface).toBe('road');
    expect(kart.boostTimer).toBeGreaterThan(0);
    expect(ended.events.some((e) => e.type === 'boost' && e.kartId === 0)).toBe(true);

    // Control is back: it steers, stays on the road and isn't picked up by Lakitu.
    const heading = kart.heading;
    const steered = run(ended.state, ticks(0.25), { throttle: 1, steer: -1 });
    expect(steered.state.karts[0]!.heading).toBeGreaterThan(heading + 0.1);
    const driven = run(steered.state, ticks(1), { throttle: 1 });
    const after = driven.state.karts[0]!;
    expect(after.respawnTimer).toBe(0);
    expect(after.grounded).toBe(true);
  });

  it('ends on the road where it is when that is safe, with control back', () => {
    const fired = fire(mk8Bullet(1));
    const ridden = run(fired.state, ticks(tuning.mk8.bulletTime) + 1);
    const kart = ridden.state.karts[0]!;
    expect(isBullet(kart)).toBe(false);
    const track = getTrack('mk8-test-ramp') as MeshTrackDef;
    expect(groundAt(track.collision, kart.position, kart.up!)?.surface).toBe('road');
    const braked = run(ridden.state, ticks(1), { brake: 1 });
    expect(braked.state.karts[0]!.speed).toBeLessThan(kart.speed / 2);
  });

  it('rides on from the mid-ride scenario', () => {
    const start = mk8BulletRide(1);
    const ridden = run(start, ticks(1));
    const kart = ridden.state.karts[0]!;
    expect(isBullet(kart)).toBe(true);
    expect(kart.position.x).toBeGreaterThan(start.karts[0]!.position.x + 40);
    expect(hitsBy(ridden.events)).toContain(3);
  });

  it('keeps its place on the lap in the effect data (snapshots carry it)', () => {
    const fired = fire(mk8Bullet(1));
    const effect = run(fired.state, 30).state.karts[0]!.effects.find((e) => e.kind === BULLET)!;
    expect(effect.data[BulletData.s]).toBeGreaterThan(0);
    expect(effect.data).toHaveLength(2);
  });
});
