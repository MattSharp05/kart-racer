import { afterEach, describe, expect, it } from 'vitest';
import { itemSets } from '../content/items';
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import { MK8_ITEM_SET } from './content/items';
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

  it('registers no courses or racers yet: their tickets add to the lists', () => {
    const before = [tracks.ids(), racers.ids()];
    registerMk8Content();
    expect([tracks.ids(), racers.ids()]).toEqual(before);
    expect(MK8_CONTENT.tracks).toEqual([]);
  });

  it('registers the mk8 item set (MK-103), once', () => {
    registerMk8Content();
    registerMk8Content();
    expect(itemSets.get(MK8_ITEM_SET).slots).toBe(2);
  });
});
