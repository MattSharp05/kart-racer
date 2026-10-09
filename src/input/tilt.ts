import { TILT_SENSITIVITY, type Settings } from '../game/storage/settings';
import { setTouchSteering } from './touch';
import { ReadingWatch, screenAngle, steerFromTilt, tiltAngle, type TiltReading } from './tiltMath';

export * from './tiltMath';

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
