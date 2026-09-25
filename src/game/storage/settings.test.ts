import { describe, expect, it } from 'vitest';
import { readPrefs, writePrefs } from './prefs';
import { readBests } from './records';
import {
  hasSeenHowToPlay,
  LEGACY_KEYS,
  markHowToPlaySeen,
  migrate,
  readMuted,
  readSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  updateSettings,
  writeMuted,
} from './settings';
import { MemoryStore, type KeyValueStore } from './store';

/** The MK-42 profile fields, empty until the player picks a nickname. */
const NO_PROFILE = { nickname: '', colour: '', deviceId: '' };

/** A store holding what the MVP (before MK-37) saved, keys and formats exactly as it wrote them. */
function mvpStore(): MemoryStore {
  const store = new MemoryStore();
  store.set(
    'kart-racer:bests:sunny-circuit:pixie:150',
    JSON.stringify({ bestLap: 41.5, bestRace: 130.25 }),
  );
  store.set('kart-racer:muted', '1');
  store.set('kart-racer:prefs', JSON.stringify({ kart: 'pixie', engineClass: 150 }));
  store.set('kart-racer:seen-how-to-play', '1');
  return store;
}

describe('saved data from before MK-37', () => {
  it('reads bests, mute, prefs and how-to-play-seen through the new modules', () => {
    const store = mvpStore();
    expect(readBests(store, 'sunny-circuit', 'pixie', 150)).toEqual({
      bestLap: 41.5,
      bestRace: 130.25,
    });
    expect(readMuted(store)).toBe(true);
    expect(readPrefs(store)).toEqual({ kart: 'pixie', engineClass: 150 });
    expect(hasSeenHowToPlay(store)).toBe(true);
  });

  it('migrates the old setting keys into one versioned settings object, once', () => {
    const store = mvpStore();
    expect(readSettings(store)).toEqual({ muted: true, seenHowToPlay: true, ...NO_PROFILE });
    expect(JSON.parse(store.get(SETTINGS_KEY) ?? '')).toEqual({
      version: SETTINGS_VERSION,
      muted: true,
      seenHowToPlay: true,
      ...NO_PROFILE,
    });
    // After the migration the settings object wins over the legacy keys.
    store.set(LEGACY_KEYS.muted, '0');
    expect(readMuted(store)).toBe(true);
  });

  it('a first visit (nothing stored) gets the defaults', () => {
    const store = new MemoryStore();
    expect(readSettings(store)).toEqual({ muted: false, seenHowToPlay: false, ...NO_PROFILE });
    expect(readPrefs(store)).toEqual({});
  });
});

describe('settings', () => {
  it('saves changes and keeps the other fields', () => {
    const store = new MemoryStore();
    writeMuted(store, true);
    markHowToPlaySeen(store);
    expect(readSettings(store)).toEqual({ muted: true, seenHowToPlay: true, ...NO_PROFILE });
    writeMuted(store, false);
    expect(readSettings(store)).toEqual({ muted: false, seenHowToPlay: true, ...NO_PROFILE });
    expect(updateSettings(store, { muted: true })).toEqual({
      muted: true,
      seenHowToPlay: true,
      ...NO_PROFILE,
    });
  });

  it('drops unknown fields and wrong types', () => {
    const store = new MemoryStore();
    expect(migrate({ version: 1, muted: 'yes', seenHowToPlay: true, extra: 3 }, store)).toEqual({
      muted: false,
      seenHowToPlay: true,
      ...NO_PROFILE,
    });
  });

  it('survives broken storage', () => {
    for (const raw of ['{not json', '[1,2]', 'null']) {
      const broken: KeyValueStore = { get: () => raw, set: () => {} };
      expect(readSettings(broken)).toEqual({ muted: false, seenHowToPlay: false, ...NO_PROFILE });
    }
  });
});

describe('prefs', () => {
  it('round-trips the last kart and engine class', () => {
    const store = new MemoryStore();
    writePrefs(store, { kart: 'boulder', engineClass: 50 });
    expect(readPrefs(store)).toEqual({ kart: 'boulder', engineClass: 50 });
  });
});
