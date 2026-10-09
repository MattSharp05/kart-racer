import {
  ReadingWatch,
  screenAngle,
  steerFromTilt,
  tiltAngle,
  type TiltReading,
} from '../../input/tiltMath';
import { REMOTE_PAD } from '../config';

/**
 * The phone controller's steering (MK-147): tilt, holding the phone sideways like a remote in a
 * wheel (the default), or touch (the D-pad's left and right). The choice and the calibrated level
 * are saved on the phone.
 */

export type SteeringMode = 'tilt' | 'touch';

export interface PadPrefs {
  steering: SteeringMode;
  /** The calibrated "level" wheel angle, degrees, right positive. */
  neutral: number;
}

export const DEFAULT_PAD_PREFS: Readonly<PadPrefs> = Object.freeze({
  steering: 'tilt',
  neutral: 0,
});

/** Where the page keeps its prefs (`localStorage`, apart from the game's settings). */
export const PAD_PREFS_KEY = 'kart-racer:remote-pad';

/** Stored prefs, or the defaults for anything missing or broken. */
export function parsePadPrefs(raw: string | null): PadPrefs {
  let stored: Partial<Record<keyof PadPrefs, unknown>> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    // Unreadable: the defaults.
  }
  return {
    steering: stored.steering === 'touch' ? 'touch' : 'tilt',
    neutral: typeof stored.neutral === 'number' ? calibratedNeutral(stored.neutral) : 0,
  };
}

/** The prefs saved in `storage` (the defaults when there's no storage, e.g. private mode). */
export function loadPadPrefs(storage: Storage | null): PadPrefs {
  try {
    return parsePadPrefs(storage?.getItem(PAD_PREFS_KEY) ?? null);
  } catch {
    return { ...DEFAULT_PAD_PREFS };
  }
}

export function savePadPrefs(storage: Storage | null, prefs: PadPrefs): void {
  try {
    storage?.setItem(PAD_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Full or blocked: the choice lasts until the page closes.
  }
}

/** A "Level" tap at wheel angle `angle`: the new neutral, kept within the allowed range. */
export function calibratedNeutral(angle: number): number {
  if (!Number.isFinite(angle)) return 0;
  const max = REMOTE_PAD.tiltNeutralMaxDeg;
  return Math.max(-max, Math.min(max, angle));
}

/**
 * Wheel angle → steer −1..1 (MK-147): nothing within `REMOTE_PAD.tiltDeadZoneDeg` of the calibrated
 * level, then linear to full lock at `REMOTE_PAD.tiltSensitivityDeg`.
 */
export function padSteer(angle: number, neutral: number): number {
  return steerFromTilt(angle, {
    sensitivity: REMOTE_PAD.tiltSensitivityDeg,
    deadZone: REMOTE_PAD.tiltDeadZoneDeg,
    neutral,
  });
}

/**
 * The phone's motion sensor (MK-147): keeps the latest `deviceorientation` reading while on and
 * turns it into a wheel angle for however the phone is held right now.
 */
export class TiltSensor {
  private reading: TiltReading | null = null;
  private listening = false;
  private readonly watch = new ReadingWatch();

  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    this.reading = { beta: e.beta, gamma: e.gamma };
    this.watch.saw(this.reading);
  };

  /** Starts listening; `onNone` runs if no reading comes within `REMOTE_PAD.noReadingSeconds`. */
  start(onNone: () => void): void {
    if (!this.listening) window.addEventListener('deviceorientation', this.onOrientation);
    this.listening = true;
    this.watch.start(onNone, REMOTE_PAD.noReadingSeconds);
  }

  stop(): void {
    window.removeEventListener('deviceorientation', this.onOrientation);
    this.listening = false;
    this.reading = null;
    this.watch.reset();
  }

  /** The wheel angle, degrees, right positive; null before a reading. */
  angle(): number | null {
    if (!this.reading || this.reading.beta === null) return null;
    const angle = screenAngle(
      screen.orientation?.angle,
      (window as { orientation?: number }).orientation,
      window.innerWidth > window.innerHeight,
    );
    return tiltAngle(this.reading, angle);
  }
}
