import { describe, expect, it } from 'vitest';
import { scenarios } from '../../scenarios';
import { sunnyRace } from '../../scenarios/race';
import { sunnyCircuit } from '../../content/tracks/sunny-circuit/sim';
import { step } from '../step';
import { trackGeometry } from '../track';
import { NEUTRAL_INPUT, type ItemId, type SimEvent, type SimState } from '../types';
import { lineOffsetAt } from './racingLine';

const geometry = trackGeometry(sunnyCircuit);
const line = sunnyCircuit.aiLine ?? [];
const setup = (name: string) => scenarios.get(name)!.setup(1).state;

function run(state: SimState, ticks: number, stop?: (s: SimState, e: SimEvent[]) => boolean) {
  const events: SimEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i += 1) {
    const r = step(s, [NEUTRAL_INPUT]);
    s = r.state;
    events.push(...r.events);
    if (stop?.(s, r.events)) break;
  }
  return { state: s, events };
}

describe('AI item use', () => {
  it(
    'in 5 headless 3-lap races, the AI uses every item type at least once',
    { timeout: 120_000 },
    () => {
      const used = new Set<ItemId>();
      for (let seed = 1; seed <= 5; seed += 1) {
        const state = sunnyRace(seed, { karts: 8, ai: true });
        state.karts[0]!.position = geometry.pointAt(0.5, -geometry.wallOffset(16) + 1);
        state.race.rubberBand = false;
        const { events } = run(state, 60 * 60 * 4, (s) =>
          s.karts.slice(1).every((k) => k.race.finishTick !== undefined),
        );
        for (const e of events) if (e.type === 'itemUsed' && e.kartId > 0) used.add(e.item);
      }
      expect([...used].sort()).toEqual([
        'banana',
        'bubble-shield',
        'green',
        'lightning',
        'mushroom',
        'oil-slick',
        'phase',
        'red',
        'star',
        'turbo-trio',
      ]);
    },
  );

  it('an AI holding a banana with a kart 10 m behind drops it within 3 s', () => {
    const state = setup('ai-holding-green');
    // Swap roles: the AI (kart 1) leads with a banana, the player is 10 m behind.
    const ai = state.karts[1]!;
    const player = state.karts[0]!;
    [ai.position, player.position] = [
      player.position,
      geometry.pointAt(0.03 - 10 / geometry.length, 0),
    ];
    ai.item.held = 'banana';
    state.positions = [1, 0];
    const { events, state: s } = run(state, 180, (_s, e) =>
      e.some((x) => x.type === 'itemUsed' && x.kartId === 1),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'itemUsed', kartId: 1, item: 'banana' }),
    );
    // Dropped behind, not thrown ahead.
    const banana = s.entities.find((e) => e.kind === 'banana');
    expect(banana).toBeDefined();
    expect(geometry.project(banana!.position).s).toBeLessThan(
      geometry.project(s.karts[1]!.position).s,
    );
  });

  it('ai-holding-green: the AI fires its green shell at the kart ahead', () => {
    const { events } = run(setup('ai-holding-green'), 180);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'itemUsed', kartId: 1, item: 'green' }),
    );
  });

  it('skilled AI avoid a banana on their line far more often than weak ones', () => {
    const avoidRate = (skill: number) => {
      let avoided = 0;
      const trials = 20;
      for (let trial = 0; trial < trials; trial += 1) {
        const state = sunnyRace(1, { karts: 2, ai: true });
        state.phase = 'racing';
        state.race.goTick = -600;
        state.race.rubberBand = false;
        const kart = state.karts[1]!;
        kart.ai!.skill = skill;
        kart.ai!.lineOffset = 0;
        const t0 = 0.02;
        kart.position = geometry.pointAt(t0, lineOffsetAt(line, t0));
        kart.heading = geometry.headingAt(t0);
        kart.speed = 18;
        const t = t0 + 40 / geometry.length;
        const position = geometry.pointAt(t, lineOffsetAt(line, t));
        state.karts[0]!.position = geometry.pointAt(0.5, -geometry.wallOffset(16) + 1);
        state.entities.push({
          id: 5000 + trial,
          kind: 'banana',
          position,
          from: position,
          flightTimer: 0,
          ownerId: -1,
          ownerImmune: 0,
        });
        const { events } = run(state, 240);
        if (!events.some((e) => e.type === 'kartHit' && e.kartId === 1)) avoided += 1;
      }
      return avoided / trials;
    };
    expect(avoidRate(1.0)).toBeGreaterThanOrEqual(0.7);
    expect(avoidRate(0.86)).toBeLessThan(0.5);
  });
});
