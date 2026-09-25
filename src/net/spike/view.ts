import { forwardFromHeading } from '../../sim/math';
import { getTrack, trackGeometry } from '../../sim/track';
import type { SimState } from '../../sim/types';

const KART_COLOURS = [
  '#e63946',
  '#1d7ff2',
  '#f4a261',
  '#2a9d8f',
  '#8e7dbe',
  '#e9c46a',
  '#6c757d',
  '#a3b18a',
];
const MARGIN_PX = 24;
const KART_RADIUS_PX = 5;
const HEADING_LINE_PX = 12;

/**
 * Throwaway top-down view for the spike (the real renderer can't be used from `src/net`).
 * Draws the road, every kart as a dot with a heading tick, and rings the local kart.
 */
export class SpikeView {
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D context');
    this.ctx = ctx;
  }

  /** `leftInset`: pixels on the left kept free for the stats panel. */
  draw(state: SimState, localKart: number, leftInset = 0): void {
    const { canvas, ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
    if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#5a9e4b';
    ctx.fillRect(0, 0, width, height);

    const track = getTrack(state.trackId);
    if (track.kind !== 'spline') return;
    const samples = trackGeometry(track).samples;
    const xs = samples.map((s) => s.x);
    const zs = samples.map((s) => s.z);
    const minX = Math.min(...xs);
    const minZ = Math.min(...zs);
    // Pad by half the road width so the road (not just its centreline) fits.
    const road = Math.max(...samples.map((s) => s.width)) / 2;
    const spanX = Math.max(...xs) - minX + 2 * road;
    const spanZ = Math.max(...zs) - minZ + 2 * road;
    const scale = Math.min(
      (width - leftInset - 2 * MARGIN_PX) / spanX,
      (height - 2 * MARGIN_PX) / spanZ,
    );
    const left = leftInset + MARGIN_PX + (width - leftInset - 2 * MARGIN_PX - spanX * scale) / 2;
    const px = (x: number) => left + (x - minX + road) * scale;
    const pz = (z: number) => MARGIN_PX + (z - minZ + road) * scale;

    ctx.strokeStyle = '#555';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (samples[0]?.width ?? 10) * scale;
    ctx.beginPath();
    samples.forEach((s, i) =>
      i === 0 ? ctx.moveTo(px(s.x), pz(s.z)) : ctx.lineTo(px(s.x), pz(s.z)),
    );
    ctx.closePath();
    ctx.stroke();

    for (const kart of state.karts) {
      const x = px(kart.position.x);
      const z = pz(kart.position.z);
      ctx.fillStyle = KART_COLOURS[kart.id % KART_COLOURS.length] ?? '#fff';
      ctx.beginPath();
      ctx.arc(x, z, KART_RADIUS_PX, 0, Math.PI * 2);
      ctx.fill();
      const forward = forwardFromHeading(kart.heading);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, z);
      ctx.lineTo(x + forward.x * HEADING_LINE_PX, z + forward.z * HEADING_LINE_PX);
      ctx.stroke();
      if (kart.id === localKart) {
        ctx.strokeStyle = '#ffeb3b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, z, KART_RADIUS_PX + 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
}
