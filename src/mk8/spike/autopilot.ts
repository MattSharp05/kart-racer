// MK-92 spike: follows the synthetic course's centreline (for tests, the bench and `&auto=1`).
import type { InputFrame } from '../../sim/types';
import type { CourseSample } from './course';
import { rightOf, type SpikeKart } from './kart';
import { dot, sub } from './vec';

export const AUTOPILOT = {
  /** Look-ahead along the centreline, in samples. */
  lookAhead: 12,
  /** Nearest-sample search window ahead of the last one. */
  window: 40,
  /** Steer per metre of lateral offset at the look-ahead point (normalised by distance). */
  gain: 2.5,
} as const;

export class Autopilot {
  index = 0;
  /** Whole laps completed (index wrapped past the start). */
  laps = 0;

  constructor(private readonly samples: CourseSample[]) {}

  /** The current sample (nearest to the kart, searching ahead only). */
  get sample(): CourseSample | undefined {
    return this.samples[this.index];
  }

  /** Jumps to the sample nearest the kart anywhere on the course (taking over mid-lap). */
  relocate(k: SpikeKart): void {
    let bestD = Infinity;
    this.samples.forEach((s, i) => {
      const d = sub(k.pos, s.c);
      if (dot(d, d) < bestD) {
        bestD = dot(d, d);
        this.index = i;
      }
    });
  }

  input(k: SpikeKart): InputFrame {
    const n = this.samples.length;
    let best = this.index;
    let bestD = Infinity;
    for (let i = 0; i < AUTOPILOT.window; i++) {
      const j = (this.index + i) % n;
      const s = this.samples[j];
      if (!s) continue;
      const d = sub(k.pos, s.c);
      const dist = dot(d, d);
      if (dist < bestD) {
        bestD = dist;
        best = j;
      }
    }
    if (best < this.index) this.laps++;
    this.index = best;
    const target = this.samples[(best + AUTOPILOT.lookAhead) % n];
    if (!target) return { throttle: 1, brake: 0, steer: 0, drift: false, item: false };
    const to = sub(target.c, k.pos);
    const ahead = Math.max(1, dot(to, k.forward));
    const steer = Math.max(-1, Math.min(1, (AUTOPILOT.gain * dot(to, rightOf(k))) / ahead));
    return { throttle: 1, brake: 0, steer, drift: false, item: false };
  }
}
