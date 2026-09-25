import { DT, tuning } from '../sim/tuning';
import type { SimState } from '../sim/types';
import { NET } from './config';

/**
 * Render smoothing for online clients (MK-45, ADR 0005). Pure: no three, no DOM. The renderer
 * hands each kart's interpolated pose to `NetSmoother.adjust`, which moves it to where it should be
 * drawn. The sim state itself is never touched.
 */

/** A drawn kart pose (world metres, heading in radians). Mutated in place by `adjust`. */
export interface KartPose {
  x: number;
  y: number;
  z: number;
  heading: number;
}

/**
 * How far a reconcile moved kart `kartId`: where the old prediction had it minus where the new one
 * has it, at the same tick. Drawing `new + delta` shows the kart where it was.
 */
export interface Correction {
  kartId: number;
  dx: number;
  dy: number;
  dz: number;
  dHeading: number;
}

interface Offset {
  x: number;
  y: number;
  z: number;
  heading: number;
  /** Part of the offset that arrived with tick `freshTick` (see `adjust`). */
  fresh: { x: number; y: number; z: number; heading: number };
  freshTick: number;
  /** Seconds left until the offset reaches zero. */
  remaining: number;
}

/**
 * Keeps a visual offset per kart that hides reconciliation (render error smoothing). A correction
 * adds its delta to the kart's offset, which then shrinks linearly to exactly zero over
 * `tuning.net.smoothingSeconds` of real time (each new correction restarts the countdown for what's
 * left). A correction larger than `tuning.net.snapDistance` (a respawn, a hit the client didn't
 * foresee) clears the offset instead: the kart snaps.
 */
export class CorrectionSmoother {
  private readonly offsets = new Map<number, Offset>();

  /** Adds corrections that first show in the state of tick `tick` (the game's newest state). */
  correct(corrections: readonly Correction[], tick: number): void {
    const { smoothingSeconds, snapDistance } = tuning.net;
    for (const c of corrections) {
      const size = Math.hypot(c.dx, c.dy, c.dz);
      if (size > snapDistance) {
        this.offsets.delete(c.kartId);
        continue;
      }
      const offset = this.offsets.get(c.kartId) ?? newOffset();
      if (offset.freshTick !== tick) {
        offset.fresh = { x: 0, y: 0, z: 0, heading: 0 };
        offset.freshTick = tick;
      }
      offset.x += c.dx;
      offset.y += c.dy;
      offset.z += c.dz;
      offset.heading = wrapAngle(offset.heading + c.dHeading);
      offset.fresh.x += c.dx;
      offset.fresh.y += c.dy;
      offset.fresh.z += c.dz;
      offset.fresh.heading += c.dHeading;
      offset.remaining = smoothingSeconds;
      if (Math.hypot(offset.x, offset.y, offset.z) > snapDistance) this.offsets.delete(c.kartId);
      else this.offsets.set(c.kartId, offset);
    }
  }

  /** Shrinks every offset by `seconds` of real (render) time. */
  frame(seconds: number): void {
    if (seconds <= 0) return;
    for (const [kartId, offset] of this.offsets) {
      if (seconds >= offset.remaining) {
        this.offsets.delete(kartId);
        continue;
      }
      const keep = (offset.remaining - seconds) / offset.remaining;
      offset.remaining -= seconds;
      offset.x *= keep;
      offset.y *= keep;
      offset.z *= keep;
      offset.heading *= keep;
      offset.fresh.x *= keep;
      offset.fresh.y *= keep;
      offset.fresh.z *= keep;
      offset.fresh.heading *= keep;
    }
  }

  /**
   * Moves `pose` (kart `kartId` interpolated `alpha` of the way from tick `tick - 1` to `tick`) by
   * its offset. The part of the offset that arrived with tick `tick` only weighs `alpha`: the
   * previous tick's state, which the pose starts from, didn't have that correction in it yet.
   */
  adjust(kartId: number, pose: KartPose, tick: number, alpha: number): void {
    const offset = this.offsets.get(kartId);
    if (!offset) return;
    const pending = offset.freshTick === tick ? 1 - alpha : 0;
    pose.x += offset.x - offset.fresh.x * pending;
    pose.y += offset.y - offset.fresh.y * pending;
    pose.z += offset.z - offset.fresh.z * pending;
    pose.heading += offset.heading - offset.fresh.heading * pending;
  }

  /** Size of kart `kartId`'s current offset, m (0 when none). */
  offsetSize(kartId: number): number {
    const offset = this.offsets.get(kartId);
    return offset ? Math.hypot(offset.x, offset.y, offset.z) : 0;
  }

  clear(): void {
    this.offsets.clear();
  }
}

interface SnapshotPoses {
  tick: number;
  poses: KartPose[];
}

/**
 * The fallback for other players' karts (`tuning.net.remoteKarts = 'interpolate'`): draw them from
 * the host's snapshots, `tuning.net.interpolationSeconds` behind the newest, instead of predicting
 * them. Always smooth and always right, just in the past.
 */
export class SnapshotInterpolator {
  private readonly buffer: SnapshotPoses[] = [];

  /** Keeps the karts' poses of an authoritative snapshot state (the newest last). */
  push(state: SimState): void {
    const last = this.buffer[this.buffer.length - 1];
    if (last && state.tick <= last.tick) return;
    this.buffer.push({
      tick: state.tick,
      poses: state.karts.map((k) => ({ ...k.position, heading: k.heading })),
    });
    if (this.buffer.length > NET.interpolationBuffer) this.buffer.shift();
  }

  /** The newest snapshot tick kept (-1 when none). */
  get newestTick(): number {
    return this.buffer[this.buffer.length - 1]?.tick ?? -1;
  }

  /**
   * Kart `kartId`'s pose at (fractional) host tick `tick`, interpolated between the snapshots
   * around it; held at the oldest/newest one outside the buffer. False when there's no snapshot.
   */
  sample(kartId: number, tick: number, out: KartPose): boolean {
    const buffer = this.buffer;
    let after = buffer.findIndex((s) => s.tick >= tick);
    if (after < 0) after = buffer.length - 1;
    const b = buffer[after]?.poses[kartId];
    if (!b) return false;
    const before = buffer[after - 1];
    const a = before?.poses[kartId];
    const bTick = buffer[after]?.tick ?? tick;
    if (!a || !before || tick >= bTick) {
      Object.assign(out, b);
      return true;
    }
    const t = Math.max(0, Math.min(1, (tick - before.tick) / (bTick - before.tick)));
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.heading = a.heading + wrapAngle(b.heading - a.heading) * t;
    return true;
  }

  clear(): void {
    this.buffer.length = 0;
  }
}

/** Where a client's race gets drawn from: the prediction, smoothed, and maybe the snapshots. */
export interface NetViewSource {
  /** The kart this client drives (never interpolated). */
  readonly kartId: number;
  /** Ticks between the prediction and the newest snapshot (the client's lead). */
  leadTicks(): number;
}

/**
 * Everything a client's renderer applies to kart poses (the `KartPoseFilter` the world asks):
 * correction smoothing for every kart, and for other players' karts, snapshot interpolation when
 * `tuning.net.remoteKarts` is `interpolate`.
 */
export class NetSmoother {
  readonly corrections = new CorrectionSmoother();
  readonly snapshots = new SnapshotInterpolator();
  /** Humans other than this client (interpolated in `interpolate` mode; AI karts stay predicted). */
  remoteKarts: ReadonlySet<number> = new Set();
  private readonly sampled: KartPose = { x: 0, y: 0, z: 0, heading: 0 };
  /** Host tick interpolated karts are drawn at: advances with real time, eased to its target. */
  private clock = Number.NaN;
  private clockSynced = false;

  /** Tick of the state `update` saw last (-1: none yet). */
  private lastTick = -1;

  constructor(private readonly source: NetViewSource) {}

  /**
   * Takes the client's newest state (once per game tick) with the reconciles since the last one.
   * Each game tick should advance the prediction by exactly one tick; when the client's clock eased
   * (held a tick, or ran an extra one) the karts would stop or skip a tick's distance on screen,
   * so that shift is blended out like a correction too.
   */
  update(state: SimState, corrections: readonly Correction[]): void {
    const shift = this.lastTick < 0 ? 0 : state.tick - this.lastTick - 1;
    this.lastTick = state.tick;
    if (shift === 0) {
      this.corrections.correct(corrections, state.tick);
      return;
    }
    const all = [...corrections];
    for (const kart of state.karts) {
      // Drawn `shift` ticks further along than it should be: pull it back by that motion.
      const back = -shift * DT;
      all.push({
        kartId: kart.id,
        dx: kart.velocity.x * back,
        dy: kart.velocity.y * back,
        dz: kart.velocity.z * back,
        dHeading: 0,
      });
    }
    this.corrections.correct(all, state.tick);
  }

  frame(seconds: number): void {
    this.corrections.frame(seconds);
    this.clock += seconds / DT;
    this.clockSynced = false;
  }

  adjust(kartId: number, pose: KartPose, tick: number, alpha: number): void {
    if (tuning.net.remoteKarts === 'interpolate' && this.remoteKarts.has(kartId)) {
      if (this.snapshots.sample(kartId, this.interpolationTick(tick, alpha), this.sampled)) {
        Object.assign(pose, this.sampled);
        return;
      }
    }
    this.corrections.adjust(kartId, pose, tick, alpha);
  }

  /**
   * The host tick to draw interpolated karts at: `interpolationSeconds` behind the newest
   * snapshot, i.e. behind the prediction by the lead plus that delay. The lead moves in whole
   * ticks as the RTT estimate changes, so the clock runs on real time and only eases towards it
   * (jumping when far off), or remote karts would hop a tick's distance at each change.
   */
  private interpolationTick(tick: number, alpha: number): number {
    if (this.clockSynced) return this.clock;
    const delay = tuning.net.interpolationSeconds / DT;
    const target = tick - 1 + alpha - this.source.leadTicks() - delay;
    const drift = target - this.clock;
    if (!Number.isFinite(drift) || Math.abs(drift) > NET.interpolationJumpTicks)
      this.clock = target;
    else this.clock += drift * NET.interpolationEase;
    this.clockSynced = true;
    return this.clock;
  }
}

function newOffset(): Offset {
  return {
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    fresh: { x: 0, y: 0, z: 0, heading: 0 },
    freshTick: -1,
    remaining: 0,
  };
}

/** `angle` in (-π, π]. */
export function wrapAngle(angle: number): number {
  const turn = Math.PI * 2;
  let a = angle % turn;
  if (a > Math.PI) a -= turn;
  if (a <= -Math.PI) a += turn;
  return a;
}
