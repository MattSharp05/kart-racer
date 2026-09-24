import { MAX_PIXEL_RATIO } from './scene';

/** Frame time above this (≈ 45 fps) for `LOW_SECONDS` switches on low-quality mode. */
const LOW_FRAME_MS = 1000 / 45;
const LOW_SECONDS = 3;
/** Pixel ratio steps down when frames take longer than this, up when shorter than `FAST_MS`. */
const SLOW_MS = 1000 / 50;
const FAST_MS = 1000 / 58;
const STEP = 0.25;
const MIN_RATIO = 1;
/** How often the pixel ratio is reconsidered, s. */
const WINDOW_SECONDS = 1;

/**
 * Adaptive quality (MK-28): watches real frame times and trades resolution for frame rate.
 * Pixel ratio moves between 1 and min(devicePixelRatio, 2) in 0.25 steps; if frames stay slower
 * than 45 fps for 3 s, low-quality mode (fewer particles) switches on for the rest of the session.
 */
export class AdaptiveQuality {
  pixelRatio: number;
  lowQuality = false;
  private readonly maxRatio: number;
  private windowTime = 0;
  private windowFrames = 0;
  private slowFor = 0;

  constructor(
    devicePixelRatio: number,
    private readonly apply: (pixelRatio: number, lowQuality: boolean) => void,
  ) {
    this.maxRatio = Math.max(MIN_RATIO, Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
    this.pixelRatio = this.maxRatio;
  }

  /** Call once per rendered frame with its real duration, seconds. Pauses are ignored. */
  frame(seconds: number): void {
    if (seconds <= 0 || seconds > 0.2) return; // paused, tab hidden, or a one-off hitch
    this.windowTime += seconds;
    this.windowFrames += 1;
    if (this.windowTime < WINDOW_SECONDS) return;
    const ms = (this.windowTime / this.windowFrames) * 1000;
    this.windowTime = 0;
    this.windowFrames = 0;

    let changed = false;
    if (ms > SLOW_MS && this.pixelRatio > MIN_RATIO) {
      this.pixelRatio = Math.max(MIN_RATIO, this.pixelRatio - STEP);
      changed = true;
    } else if (ms < FAST_MS && this.pixelRatio < this.maxRatio) {
      this.pixelRatio = Math.min(this.maxRatio, this.pixelRatio + STEP);
      changed = true;
    }
    this.slowFor = ms > LOW_FRAME_MS ? this.slowFor + WINDOW_SECONDS : 0;
    if (!this.lowQuality && this.slowFor >= LOW_SECONDS) {
      this.lowQuality = true;
      changed = true;
    }
    if (changed) this.apply(this.pixelRatio, this.lowQuality);
  }
}
