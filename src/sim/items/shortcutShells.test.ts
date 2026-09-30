import { describe, expect, it } from 'vitest';
import { CANOPY_RUSH } from '../../content/tracks/canopy-rush/sim';
import { COG_WORKS } from '../../content/tracks/cog-works/sim';
import { scenarios } from '../../scenarios';
import { shellShot } from '../../scenarios/tracks';
import type { Vec3 } from '../math';
import { step } from '../step';
import { DT } from '../tuning';
import { hasEffect } from './effects';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../types';

const redShot = (trackId: string, from: Vec3, at: Vec3, item: 'red' | 'green' = 'red') =>
  shellShot(1, trackId, from, at, item);

/** Fires on tick 0 and runs `seconds`; the kartHit events, and how long the shell lasted, s. */
function fire(state: SimState, seconds: number) {
  const hits: SimEvent[] = [];
  let s = state;
  let lasted = 0;
  for (let i = 0; i < Math.round(seconds / DT); i += 1) {
    const r = step(s, [{ ...NEUTRAL_INPUT, item: i === 0 }, NEUTRAL_INPUT]);
    s = r.state;
    for (const e of r.events) if (e.type === 'kartHit') hits.push(e);
    if (s.entities.some((e) => e.kind === 'shell')) lasted = (i + 1) * DT;
  }
  return { hits, lasted };
}

const { catwalk, backZ, floorY } = COG_WORKS;
const on = (x: number, z: number, y: number): Vec3 => ({ x, y, z });

describe('red shells on shortcuts (MK-62 QA round 2)', () => {
  it.each(['cog-works-catwalk-red', 'canopy-ruins-red'])(
    '%s: firing hits the kart ahead on the shortcut',
    (name) => {
      const { hits } = fire(scenarios.get(name)!.setup(1).state, 8);
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatchObject({ kartId: 1, by: 0, kind: 'red' });
    },
  );

  it('Cog Works: fired along the catwalk, it hits the kart ahead on the catwalk', () => {
    const state = redShot(
      'cog-works',
      on(catwalk.x0 - 8, backZ, floorY),
      on(catwalk.x0 - 70, backZ, floorY),
    );
    const { hits } = fire(state, 5);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kartId: 1, by: 0, kind: 'red' });
  });

  it('Cog Works: fired on the catwalk at a kart past its end, it follows the catwalk and hits', () => {
    const state = redShot(
      'cog-works',
      on(catwalk.x0 - 8, backZ, floorY),
      on(COG_WORKS.home.x - 4, backZ, floorY),
    );
    const { hits } = fire(state, 8);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kartId: 1, kind: 'red' });
  });

  it('Cog Works: a green shell fired along the catwalk keeps going', () => {
    const state = redShot(
      'cog-works',
      on(catwalk.x0 - 8, backZ, floorY),
      on(catwalk.x0 - 90, backZ, floorY),
      'green',
    );
    const { hits, lasted } = fire(state, 3);
    expect(lasted).toBeGreaterThan(1.5);
    expect(hits).toHaveLength(1);
  });

  it('Canopy Rush: fired down the ruins, it hits the kart ahead in the ruins', () => {
    const path = CANOPY_RUSH.ruinsPath;
    const from = path[4]!;
    const at = path[7]!;
    const { hits } = fire(
      redShot('canopy-rush', on(from.x, from.z, from.y), on(at.x, at.z, at.y)),
      8,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kartId: 1, kind: 'red' });
  });

  it('Canopy Rush: fired in the ruins at a kart back on the road past them, it hits', () => {
    const path = CANOPY_RUSH.ruinsPath;
    const from = path[6]!;
    const end = path.at(-1)!;
    const at = on(end.x - 15, end.z, end.y);
    const { hits } = fire(redShot('canopy-rush', on(from.x, from.z, from.y), at), 8);
    expect(hits).toHaveLength(1);
  });

  it('Cog Works: a homing item entity (hornet swarm) follows the catwalk and stings the kart ahead', () => {
    const state = redShot(
      'cog-works',
      on(catwalk.x0 - 8, backZ, floorY),
      on(catwalk.x0 - 90, backZ, floorY),
    );
    state.karts[0]!.item.held = 'hornet-swarm';
    let s = state;
    let stung = false;
    for (let i = 0; i < Math.round(6 / DT) && !stung; i += 1) {
      s = step(s, [{ ...NEUTRAL_INPUT, item: i === 0 }, NEUTRAL_INPUT]).state;
      stung = hasEffect(s.karts[1]!, 'hornet-swarm');
    }
    expect(stung).toBe(true);
  });
});
