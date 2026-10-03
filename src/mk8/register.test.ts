import { afterEach, describe, expect, it } from 'vitest';
import { gameRacers, racers } from '../content/racers';
import { tracks } from '../content/tracks';
import { MK8_CONTENT, registerMk8Content } from './register';

describe('MK8 content registration (MK-97)', () => {
  afterEach(() => {
    tracks.unregister('mk8-fixture');
    racers.unregister('mk8-fixture');
  });

  it('adds MK8 content to the shared registries, and opening MK8 Mode twice is fine', () => {
    const track = { ...tracks.get('test-oval'), id: 'mk8-fixture' };
    const racer = { ...racers.list()[0]!, id: 'mk8-fixture' };
    const content = { tracks: [track], racers: [racer], items: [] };
    registerMk8Content(content);
    registerMk8Content(content);
    expect(tracks.get('mk8-fixture')).toBe(track);
    expect(racers.get('mk8-fixture')).toBe(racer);
  });

  it("registers the 12 MK8 racers (MK-101), which the original game's lists leave out", () => {
    const game = gameRacers();
    registerMk8Content();
    try {
      expect(MK8_CONTENT.racers).toHaveLength(12);
      for (const racer of MK8_CONTENT.racers) expect(racers.get(racer.id)).toBe(racer);
      expect(gameRacers()).toEqual(game);
      expect(MK8_CONTENT.tracks).toEqual([]);
    } finally {
      for (const racer of MK8_CONTENT.racers) racers.unregister(racer.id);
    }
  });
});
