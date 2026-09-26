import { describe, expect, it } from 'vitest';
import { tracks } from '../../content/tracks';
import { sunnyRace } from '../../scenarios/race';
import { recordText } from './trackCard';

describe('track card (MK-50)', () => {
  it('shows the best race and lap, or that there is no record yet', () => {
    expect(
      recordText({ race: { time: 160, kart: 'boulder' }, lap: { time: 48, kart: 'swoop' } }),
    ).toEqual(['Race 2:40.000', 'Lap 0:48.000']);
    expect(recordText({ lap: { time: 61.5, kart: 'maple' } })).toEqual(['Lap 1:01.500']);
    expect(recordText({})).toEqual(['No record yet']);
  });

  it('every menu track has a hazard line and a spline to outline', () => {
    const offered = tracks.list().filter((t) => !t.testOnly);
    expect(offered.length).toBeGreaterThanOrEqual(6);
    for (const track of offered) {
      expect(track.hazard, track.id).toBeTruthy();
      expect(track.def.kind, track.id).toBe('spline');
    }
  });

  it('a menu race can start on any menu track', () => {
    for (const track of tracks.list().filter((t) => !t.testOnly)) {
      const state = sunnyRace(1, { karts: 8, ai: true, trackId: track.id });
      expect(state.trackId).toBe(track.id);
      expect(state.karts).toHaveLength(8);
    }
  });
});
