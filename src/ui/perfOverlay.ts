import type { KartState } from '../sim/types';

/**
 * A mesh-track kart's pose (MK-99): where it is, its up, its yaw in degrees (what `&yaw=` takes)
 * and whether it's in anti-gravity, so a start on a real course can be noted as `&at=…&yaw=…`.
 */
export function poseLine(kart: KartState | undefined): string | undefined {
  if (!kart?.up) return undefined;
  const p = kart.position;
  const u = kart.up;
  const yaw = Math.round((kart.heading * 180) / Math.PI);
  return (
    `at ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}  yaw ${yaw}\n` +
    `up ${u.x.toFixed(2)} ${u.y.toFixed(2)} ${u.z.toFixed(2)}${kart.antigrav ? '  ANTI-GRAV' : ''}`
  );
}

/** `?perf=1` (MK-28): fps, frame time, draw calls, triangles, sim step time and render quality. */
export class PerfOverlay {
  private readonly root = document.createElement('pre');
  private frames = 0;
  private time = 0;
  private simMs = 0;
  private lastText = '';

  /** `pose`: an extra line or two, e.g. `poseLine` of the followed kart on a mesh track (MK-99). */
  constructor(private readonly pose: () => string | undefined = () => undefined) {
    this.root.className = 'perf-overlay';
    document.body.append(this.root);
  }

  /** Once per rendered frame. */
  frame(
    seconds: number,
    simMs: number,
    info: { calls: number; triangles: number },
    quality: { pixelRatio: number; lowQuality: boolean },
  ): void {
    this.frames += 1;
    this.time += seconds;
    this.simMs = Math.max(this.simMs * 0.9, simMs);
    if (this.time < 0.5) return;
    const fps = this.frames / this.time;
    const text = [
      `${fps.toFixed(0)} fps  ${((this.time / this.frames) * 1000).toFixed(1)} ms`,
      `draw calls ${info.calls}  tris ${(info.triangles / 1000).toFixed(1)}k`,
      `sim ${this.simMs.toFixed(2)} ms`,
      `pixel ratio ${quality.pixelRatio}${quality.lowQuality ? '  LOW' : ''}`,
      ...[this.pose()].filter((line) => line !== undefined),
    ].join('\n');
    this.frames = 0;
    this.time = 0;
    if (text !== this.lastText) {
      this.root.textContent = text;
      this.lastText = text;
    }
  }
}
