import { describe, expect, it } from 'vitest';
import { PREFS_KEY, readPrefs, writePrefs } from '../game/storage/prefs';
import { MemoryStore } from '../game/storage/store';
import { defaultLoadout } from './content/parts';
import { saveLoadout, savedLoadout, savedRacer } from './loadoutPrefs';

describe('saved MK8 loadout (MK-102)', () => {
  it("is the racer's default until one is saved", () => {
    const store = new MemoryStore();
    expect(savedLoadout(store, 'mk8-peach')).toEqual(defaultLoadout('mk8-peach'));
    expect(savedRacer(store)).toBeUndefined();
  });

  it('remembers the last loadout, keeps the parts for another racer and the other prefs', () => {
    const store = new MemoryStore();
    writePrefs(store, { kart: 'maple', engineClass: 150, track: 'sunny-circuit' });
    const loadout = {
      racer: 'mk8-wario',
      body: 'mach-8',
      tires: 'monster-tires',
      glider: 'cloud-glider',
    };
    saveLoadout(store, loadout);
    expect(savedRacer(store)).toBe('mk8-wario');
    expect(savedLoadout(store, 'mk8-wario')).toEqual(loadout);
    expect(savedLoadout(store, 'mk8-toad')).toEqual({ ...loadout, racer: 'mk8-toad' });
    expect(readPrefs(store)).toMatchObject({ kart: 'maple', engineClass: 150 });
  });

  it('a corrupt or outdated save falls back part by part', () => {
    const store = new MemoryStore();
    store.set(
      PREFS_KEY,
      JSON.stringify({ mk8Loadout: { racer: 3, body: 'gone', tires: 'slim-tires' } }),
    );
    expect(savedRacer(store)).toBeUndefined();
    store.set(
      PREFS_KEY,
      JSON.stringify({ mk8Loadout: { racer: 'mk8-rosalina', tires: 'slim-tires' } }),
    );
    expect(savedRacer(store)).toBeUndefined();
    expect(savedLoadout(store, 'mk8-mario')).toEqual({
      ...defaultLoadout('mk8-mario'),
      tires: 'slim-tires',
    });
  });
});
