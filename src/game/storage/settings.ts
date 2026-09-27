import { readJson, type KeyValueStore } from './store';

/** Which hand holds the phone's buttons (MK-53): right = buttons right, steering left. */
export type Hand = 'right' | 'left';
export const HANDS: readonly Hand[] = ['right', 'left'];

/** How a phone steers (MK-54): dragging the steering zone, or tilting the phone. */
export type Steering = 'drag' | 'tilt';
export const STEERINGS: readonly Steering[] = ['drag', 'tilt'];

/** Tilt sensitivity (MK-54): the tilt, degrees, that gives full steering lock. */
export const TILT_SENSITIVITY = { min: 10, max: 40, default: 25 } as const;
/** The calibrated neutral tilt (MK-54) is kept within ± this many degrees. */
export const TILT_NEUTRAL_MAX = 60;

/**
 * Player settings (MK-37), stored as one versioned JSON object. A new setting adds a field with
 * its default below; a change of meaning bumps `SETTINGS_VERSION` and adds a step to `migrate()`.
 */
export interface Settings {
  /** Sound off (MK-26). */
  muted: boolean;
  /** The first-load controls guide (MK-32) has been dismissed. */
  seenHowToPlay: boolean;
  /** Player nickname (MK-42); '' until picked on first launch. Validated by `game/profile.ts`. */
  nickname: string;
  /** Player colour id (MK-42), one of `PROFILE_COLOURS`; '' until picked. */
  colour: string;
  /** Random id for this device's leaderboard rows (MK-42); '' until first generated. */
  deviceId: string;
  /** Touch layout (MK-53): which side the Drift / Item / Brake buttons are on. */
  hand: Hand;
  /** Phone steering (MK-54): drag (default) or tilt. */
  steering: Steering;
  /** Degrees of tilt for full steering lock (MK-54), `TILT_SENSITIVITY.min`–`.max`. */
  tiltSensitivity: number;
  /** The calibrated "straight ahead" tilt, degrees, right positive (MK-54). */
  tiltNeutral: number;
}

export const SETTINGS_KEY = 'kart-racer:settings';
export const SETTINGS_VERSION = 1;

const DEFAULTS: Settings = {
  muted: false,
  seenHowToPlay: false,
  nickname: '',
  colour: '',
  deviceId: '',
  hand: 'right',
  steering: 'drag',
  tiltSensitivity: TILT_SENSITIVITY.default,
  tiltNeutral: 0,
};

/** Keys the MVP stored settings under, one per setting (read once by the v0 → v1 migration). */
export const LEGACY_KEYS = {
  muted: 'kart-racer:muted',
  seenHowToPlay: 'kart-racer:seen-how-to-play',
} as const;

/**
 * Brings stored settings of any version up to `SETTINGS_VERSION`. Version 0 means "nothing under
 * `SETTINGS_KEY` yet": the MVP's separate keys are read from `store`.
 */
export function migrate(data: Record<string, unknown>, store: KeyValueStore): Settings {
  const version = storedVersion(data);
  // v0 → v1. Later versions add their step below, each taking the previous step's result.
  const v1 =
    version < 1
      ? {
          muted: store.get(LEGACY_KEYS.muted) === '1',
          seenHowToPlay: store.get(LEGACY_KEYS.seenHowToPlay) === '1',
        }
      : data;
  return sanitize(v1);
}

function storedVersion(data: Record<string, unknown>): number {
  return typeof data.version === 'number' ? data.version : 0;
}

/** Keeps only known fields of the right type; everything else falls back to the default. */
function sanitize(values: Record<string, unknown>): Settings {
  const settings = { ...DEFAULTS };
  for (const name of Object.keys(DEFAULTS) as (keyof Settings)[]) {
    const value = values[name];
    if (typeof value === typeof DEFAULTS[name]) Object.assign(settings, { [name]: value });
  }
  if (!HANDS.includes(settings.hand)) settings.hand = DEFAULTS.hand;
  if (!STEERINGS.includes(settings.steering)) settings.steering = DEFAULTS.steering;
  settings.tiltSensitivity = clampFinite(
    settings.tiltSensitivity,
    TILT_SENSITIVITY.min,
    TILT_SENSITIVITY.max,
    DEFAULTS.tiltSensitivity,
  );
  settings.tiltNeutral = clampFinite(
    settings.tiltNeutral,
    -TILT_NEUTRAL_MAX,
    TILT_NEUTRAL_MAX,
    DEFAULTS.tiltNeutral,
  );
  return settings;
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export function readSettings(store: KeyValueStore): Settings {
  const data = readJson(store, SETTINGS_KEY);
  const settings = migrate(data, store);
  // Save the migrated copy once, so the legacy keys are only read on the first load.
  if (storedVersion(data) < SETTINGS_VERSION) writeSettings(store, settings);
  return settings;
}

export function writeSettings(store: KeyValueStore, settings: Settings): void {
  store.set(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, ...settings }));
}

/** Changes some settings and saves them; returns the new settings. */
export function updateSettings(store: KeyValueStore, changes: Partial<Settings>): Settings {
  const settings = { ...readSettings(store), ...changes };
  writeSettings(store, settings);
  return settings;
}

/** Sound on/off (MK-26). */
export function readMuted(store: KeyValueStore): boolean {
  return readSettings(store).muted;
}

export function writeMuted(store: KeyValueStore, muted: boolean): void {
  updateSettings(store, { muted });
}

/** Whether the first-load controls guide (MK-32) has been dismissed before. */
export function hasSeenHowToPlay(store: KeyValueStore): boolean {
  return readSettings(store).seenHowToPlay;
}

export function markHowToPlaySeen(store: KeyValueStore): void {
  updateSettings(store, { seenHowToPlay: true });
}
