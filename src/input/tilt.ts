import { TILT_SENSITIVITY, type Settings } from '../game/storage/settings';
import { setTouchSteering } from './touch';

/** Tilt (degrees) around neutral that still steers straight (MK-54). */
export const TILT_DEAD_ZONE_DEG = 3;

/**
 * Seconds Tilt waits for a first motion reading before giving up (MK-87): a browser can offer
 * `deviceorientation` on a device with no gyro (a touchscreen laptop), and then nothing arrives.
 */
export const TILT_NO_READINGS_SECONDS = 2;

const DEG = 180 / Math.PI;

/** One `deviceorientation` reading, degrees (`null` when the device has no sensor). */
export interface TiltReading {
  beta: number | null;
  gamma: number | null;
}

export interface TiltOptions {
  /** Degrees of tilt for full lock. */
  sensitivity: number;
  /** The calibrated straight-ahead tilt, degrees (from `tiltAngle`). */
  neutral: number;
  /** Degrees around neutral that steer straight. */
  deadZone?: number;
}

/**
 * The screen's rotation, degrees: 0 / 90 / 180 / 270 (MK-54). `screen.orientation.angle`, else the
 * older `window.orientation` (iOS < 16.4). A landscape window that reports 0 (desktop emulation)
 * counts as 90.
 */
export function screenAngle(
  orientationAngle: number | undefined,
  legacyOrientation: number | undefined,
  landscape: boolean,
): number {
  const raw = orientationAngle ?? legacyOrientation ?? 0;
  const angle = (((Math.round(raw / 90) * 90) % 360) + 360) % 360;
  if (landscape && (angle === 0 || angle === 180)) return 90;
  return angle;
}

/**
 * How far the phone is turned like a steering wheel, degrees, right (clockwise, as the player sees
 * it) positive (MK-54). In landscape that's the tilt of the phone's long axis: `beta` (the long
 * axis's rise is sin β), with the sign set by which way round the phone is. Going through sin β
 * keeps it steady when the phone is tipped past upright and the browser flips β to 180° − β. In
 * portrait (the game asks to rotate) it's `gamma`.
 */
export function tiltAngle(reading: TiltReading, screenAngleDeg: number): number {
  const beta = reading.beta ?? 0;
  const gamma = reading.gamma ?? 0;
  const roll = Math.asin(Math.sin(beta / DEG)) * DEG;
  switch (screenAngleDeg) {
    // Top of the phone on the left: turning right lifts it, so β grows.
    case 90:
      return roll;
    case 270:
      return -roll;
    case 180:
      return -gamma;
    default:
      return gamma;
  }
}

/**
 * Wheel angle → `InputFrame.steer` (MK-54): nothing inside the dead zone around the calibrated
 * neutral, then linear up to full lock at `sensitivity` degrees, clamped to −1..1.
 */
export function steerFromTilt(angle: number, options: TiltOptions): number {
  const deadZone = options.deadZone ?? TILT_DEAD_ZONE_DEG;
  const offset = angle - options.neutral;
  const past = Math.abs(offset) - deadZone;
  if (!(past > 0)) return 0;
  const range = Math.max(options.sensitivity - deadZone, Number.EPSILON);
  return Math.sign(offset) * Math.min(1, past / range);
}

type PermissionFn = () => Promise<string>;

function permissionFn(): PermissionFn | undefined {
  const ctor = (window as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } })
    .DeviceOrientationEvent;
  return typeof ctor?.requestPermission === 'function'
    ? ctor.requestPermission.bind(ctor)
    : undefined;
}

/**
 * The answer to a motion-access request. `failed`: the browser didn't ask (not from a tap, which
 * throws on iOS; Chrome can answer `prompt`); nothing was refused.
 */
export type TiltPermission = 'granted' | 'denied' | 'failed';

/**
 * Asks for motion access (MK-54). iOS needs `DeviceOrientationEvent.requestPermission()`, which only
 * works from a tap; elsewhere there's nothing to ask, only whether the browser has the event. Once
 * granted, iOS answers again without a prompt.
 */
export async function requestTiltPermission(): Promise<TiltPermission> {
  const request = permissionFn();
  if (!request) return 'DeviceOrientationEvent' in window ? 'granted' : 'denied';
  try {
    const answer = await request();
    return answer === 'granted' || answer === 'denied' ? answer : 'failed';
  } catch {
    return 'failed';
  }
}

/** Whether this browser needs a tap to allow motion access (iOS). */
export function tiltNeedsPermission(): boolean {
  return permissionFn() !== undefined;
}

/**
 * Waits for a first real motion reading (MK-87): `start` arms it, a reading with a `beta` (a device
 * with no sensor sends nulls, or nothing) disarms it, and if none comes in time `onNone` runs once.
 */
export class ReadingWatch {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private seen = false;

  /** Arms the watch, unless a reading already came. */
  start(onNone: () => void, seconds = TILT_NO_READINGS_SECONDS): void {
    this.stop();
    if (this.seen) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      onNone();
    }, seconds * 1000);
  }

  /** A reading arrived. */
  saw(reading: TiltReading): void {
    if (reading.beta === null) return;
    this.seen = true;
    this.stop();
  }

  /** Disarms the watch and forgets any reading (tilt turned off). */
  reset(): void {
    this.stop();
    this.seen = false;
  }

  get waiting(): boolean {
    return this.timer !== undefined;
  }

  private stop(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/**
 * Tilt steering (MK-54): listens to `deviceorientation` while on, and turns the latest reading into
 * a steer value with the saved sensitivity and neutral. The phone's orientation is read on every
 * event, so turning the phone round mid-race keeps right as right.
 */
export class TiltInput {
  private enabled = false;
  private reading: TiltReading | undefined;
  private readonly watch = new ReadingWatch();
  sensitivity: number = TILT_SENSITIVITY.default;
  neutral = 0;

  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    this.reading = { beta: e.beta, gamma: e.gamma };
    this.watch.saw(this.reading);
  };

  /** Starts or stops listening. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reading = undefined;
    this.watch.reset();
    if (enabled) window.addEventListener('deviceorientation', this.onOrientation);
    else window.removeEventListener('deviceorientation', this.onOrientation);
  }

  /**
   * While on, runs `onNone` if no motion reading arrives within `TILT_NO_READINGS_SECONDS`
   * (MK-87). Call it once motion access is allowed; a no-op once a reading has come.
   */
  expectReadings(onNone: () => void): void {
    if (this.enabled) this.watch.start(onNone);
  }

  get on(): boolean {
    return this.enabled;
  }

  /** The current wheel angle, degrees (0 before the first reading). */
  angle(): number {
    return this.reading ? tiltAngle(this.reading, currentScreenAngle()) : 0;
  }

  /** Steer −1..1 from the latest reading; 0 while off or before any reading. */
  steer(): number {
    if (!this.enabled || !this.reading) return 0;
    return steerFromTilt(this.angle(), { sensitivity: this.sensitivity, neutral: this.neutral });
  }
}

function currentScreenAngle(): number {
  return screenAngle(
    screen.orientation?.angle,
    (window as { orientation?: number }).orientation,
    window.innerWidth > window.innerHeight,
  );
}

/** The tilt source the player's controls read (MK-54); `applySteering` sets it up. */
export const tilt = new TiltInput();

/**
 * Applies the saved steering settings (MK-54) at once, mid-race too: tilt listens or not, with the
 * saved sensitivity and neutral, and the touch controls hide or show the drag zone.
 */
export function applySteering(
  settings: Pick<Settings, 'steering' | 'tiltSensitivity' | 'tiltNeutral'>,
): void {
  tilt.sensitivity = settings.tiltSensitivity;
  tilt.neutral = settings.tiltNeutral;
  tilt.setEnabled(settings.steering === 'tilt');
  setTouchSteering(settings.steering);
}
