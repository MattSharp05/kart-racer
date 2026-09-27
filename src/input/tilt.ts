import { TILT_SENSITIVITY, type Settings } from '../game/storage/settings';
import { setTouchSteering } from './touch';

/** Tilt (degrees) around neutral that still steers straight (MK-54). */
export const TILT_DEAD_ZONE_DEG = 3;

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

type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>;

function permissionFn(): PermissionFn | undefined {
  const ctor = (window as { DeviceOrientationEvent?: { requestPermission?: PermissionFn } })
    .DeviceOrientationEvent;
  return typeof ctor?.requestPermission === 'function'
    ? ctor.requestPermission.bind(ctor)
    : undefined;
}

/** The answer to a motion-access request: `failed` = the browser wouldn't ask (not from a tap). */
export type TiltPermission = 'granted' | 'denied' | 'failed';

/**
 * Asks for motion access (MK-54). iOS needs `DeviceOrientationEvent.requestPermission()`, which only
 * works from a tap (anything else throws: `failed`, nothing was refused); elsewhere there's nothing
 * to ask, only whether the browser has the event. Once granted, iOS answers again without a prompt.
 */
export async function requestTiltPermission(): Promise<TiltPermission> {
  const request = permissionFn();
  if (!request) return 'DeviceOrientationEvent' in window ? 'granted' : 'denied';
  try {
    return (await request()) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'failed';
  }
}

/** Whether this browser needs a tap to allow motion access (iOS). */
export function tiltNeedsPermission(): boolean {
  return permissionFn() !== undefined;
}

/**
 * Tilt steering (MK-54): listens to `deviceorientation` while on, and turns the latest reading into
 * a steer value with the saved sensitivity and neutral. The phone's orientation is read on every
 * event, so turning the phone round mid-race keeps right as right.
 */
export class TiltInput {
  private enabled = false;
  private reading: TiltReading | undefined;
  sensitivity: number = TILT_SENSITIVITY.default;
  neutral = 0;

  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    this.reading = { beta: e.beta, gamma: e.gamma };
  };

  /** Starts or stops listening. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reading = undefined;
    if (enabled) window.addEventListener('deviceorientation', this.onOrientation);
    else window.removeEventListener('deviceorientation', this.onOrientation);
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
