import { REMOTE } from './config';

/** Smoothed round-trip time from Ping/Pong pairs (MK-146), ms; null before the first Pong. */
export class RttMeter {
  rttMs: number | null = null;
  private lastPing = -Infinity;

  /** Whether it's time to send another Ping at `now` (and notes that one is sent). */
  due(now: number): boolean {
    if (now - this.lastPing < REMOTE.pingEveryMs) return false;
    this.lastPing = now;
    return true;
  }

  /** A Pong came back carrying the `sentAt` of our Ping. */
  pong(sentAt: number, now: number): void {
    const sample = Math.max(0, now - sentAt);
    this.rttMs =
      this.rttMs === null ? sample : this.rttMs + (sample - this.rttMs) * REMOTE.rttSmoothing;
  }
}
