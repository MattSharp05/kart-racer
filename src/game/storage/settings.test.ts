import { describe, expect, it } from 'vitest';
import { DEFAULT_BUTTON_LAYOUT, type ButtonLayout } from '../../input/buttonLayout';
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

/**
 * The MK-42 profile fields, empty until the player picks a nickname, MK-53's default hand, MK-57's
 * default button layout and MK-54's tilt defaults.
 */
const NO_PROFILE = {
  nickname: '',
  colour: '',
  deviceId: '',
  hand: 'right',
  buttons: DEFAULT_BUTTON_LAYOUT,
  steering: 'drag',
  tiltSensitivity: 25,
  tiltNeutral: 0,
};

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

  it('keeps the touch hand (MK-53); anything but left/right reads as right', () => {
    const store = new MemoryStore();
    expect(updateSettings(store, { hand: 'left' }).hand).toBe('left');
    expect(readSettings(store).hand).toBe('left');
    expect(migrate({ version: 1, hand: 'middle' }, store).hand).toBe('right');
    expect(migrate({ version: 1, hand: 1 }, store).hand).toBe('right');
  });

  it('keeps the touch button layout (MK-57); malformed parts read as the default', () => {
    const store = new MemoryStore();
    const layout: ButtonLayout = {
      scale: 1.25,
      sizes: { drift: 1.5, item: 1, brake: 0.75 },
      positions: { drift: { x: 12, y: 30 }, item: { x: 30, y: 20 }, brake: { x: 45, y: 12 } },
    };
    expect(updateSettings(store, { buttons: layout }).buttons).toEqual(layout);
    expect(readSettings(store).buttons).toEqual(layout);
    const broken = migrate(
      {
        version: 1,
        buttons: {
          scale: 9,
          sizes: { drift: 'big', item: 0.1 },
          positions: { drift: { x: 12, y: 30 } },
        },
      },
      store,
    ).buttons;
    expect(broken).toEqual({
      scale: 1.5,
      sizes: { drift: 1, item: 0.75, brake: 1 },
      positions: null,
    });
    expect(migrate({ version: 1, buttons: 'x' }, store).buttons).toEqual(DEFAULT_BUTTON_LAYOUT);
    const offScreen = migrate(
      {
        version: 1,
        buttons: { ...layout, positions: { ...layout.positions, drift: { x: -5, y: 140 } } },
      },
      store,
    ).buttons;
    expect(offScreen.positions?.drift).toEqual({ x: 0, y: 100 });
  });

  it('keeps tilt steering settings (MK-54), sanitising bad values', () => {
    const store = new MemoryStore();
    const saved = updateSettings(store, { steering: 'tilt', tiltSensitivity: 15, tiltNeutral: -8 });
    expect(saved).toMatchObject({ steering: 'tilt', tiltSensitivity: 15, tiltNeutral: -8 });
    expect(readSettings(store)).toMatchObject(saved);
    expect(migrate({ version: 1, steering: 'wheel' }, store).steering).toBe('drag');
    expect(migrate({ version: 1, tiltSensitivity: 90 }, store).tiltSensitivity).toBe(40);
    expect(migrate({ version: 1, tiltSensitivity: 2 }, store).tiltSensitivity).toBe(10);
    expect(migrate({ version: 1, tiltSensitivity: null }, store).tiltSensitivity).toBe(25);
    expect(migrate({ version: 1, tiltNeutral: 200 }, store).tiltNeutral).toBe(60);
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
