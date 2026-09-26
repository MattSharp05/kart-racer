import { describe, expect, it } from 'vitest';
import { scenarios } from '../../scenarios';
import { ALL_ITEMS_SKIP_SECONDS, allItemsRace } from '../../scenarios/race';
import { raceTime } from '../raceFlow';
import { allAiRace, raceItemStats, raceTrackIds } from './balance';

describe('item balance simulation (MK-72)', () => {
  it('races on every race track, not the test fixtures', () => {
    expect(raceTrackIds()).toEqual([
      'sunny-circuit',
      'dune-canyon',
      'frostpeak-pass',
      'neon-harbour',
      'canopy-rush',
      'cog-works',
    ]);
  });

  it('an all-AI race: 8 AI karts with items on, on a seeded grid', () => {
    const state = allAiRace(3, 'cog-works');
    expect(state.karts).toHaveLength(8);
    expect(state.karts.every((kart) => kart.controller === 'ai' && kart.ai)).toBe(true);
    expect(state.entities.some((e) => e.kind === 'itemBox')).toBe(true);
    expect(allAiRace(3, 'cog-works')).toEqual(state);
    expect(allAiRace(4, 'cog-works').karts.map((k) => k.position)).not.toEqual(
      state.karts.map((k) => k.position),
    );
  });

  it('counts item uses and hits, and lead changes, over a short race', { timeout: 60_000 }, () => {
    const stats = raceItemStats(allAiRace(1, 'sunny-circuit'), 1, 45);
    const uses = Object.values(stats.used).reduce((a, b) => a + b, 0);
    expect(uses).toBeGreaterThan(0);
    expect(Object.values(stats.hits).every((n) => n > 0)).toBe(true);
    expect(stats.leadChanges).toBeGreaterThanOrEqual(0);
    // Cut off at 45 s: nobody has done 3 laps yet.
    expect(stats.finishers).toBe(0);
    expect(stats.finishSpread).toBe(0);
  });

  it('race-all-items: fast-forwarded into the race, the seed picks the track', () => {
    const state = allItemsRace(2);
    expect(state.trackId).toBe('dune-canyon');
    expect(state.phase).toBe('racing');
    expect(raceTime(state)).toBeGreaterThanOrEqual(ALL_ITEMS_SKIP_SECONDS);
    expect(allItemsRace(7).trackId).toBe('sunny-circuit');
    const setup = scenarios.get('race-all-items')!.setup(1);
    expect(setup.state.karts.every((kart) => kart.controller === 'ai')).toBe(true);
    expect(setup.follow).toBe(setup.state.positions[3]);
  });
});
