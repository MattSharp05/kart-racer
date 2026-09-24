/** `?perf=1` (MK-28): fps, frame time, draw calls, triangles, sim step time and render quality. */
export class PerfOverlay {
  private readonly root = document.createElement('pre');
  private frames = 0;
  private time = 0;
  private simMs = 0;
  private lastText = '';

  constructor() {
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
    ].join('\n');
    this.frames = 0;
    this.time = 0;
    if (text !== this.lastText) {
      this.root.textContent = text;
      this.lastText = text;
    }
  }
}
