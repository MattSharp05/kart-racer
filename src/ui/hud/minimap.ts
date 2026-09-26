import { trackGeometry, getTrack } from '../../sim/track';
import type { SimState } from '../../sim/types';

const NS = 'http://www.w3.org/2000/svg';
const SIZE = 100;
const PAD = 8;

/**
 * Top-down outline of the track with a dot per kart; the player's dot is bigger and yellow, and the
 * other people's (online, MK-55) are white with a ring, so they stand out from the AI.
 */
export class Minimap {
  readonly root = document.createElementNS(NS, 'svg');
  private readonly dots: SVGCircleElement[] = [];
  private trackId = '';
  private toMap: (x: number, z: number) => [number, number] = () => [0, 0];

  constructor() {
    this.root.setAttribute('class', 'hud-minimap');
    this.root.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
  }

  private build(state: SimState): boolean {
    const track = getTrack(state.trackId);
    if (track.kind !== 'spline') return false;
    const geometry = trackGeometry(track);
    const points = Array.from({ length: 120 }, (_, i) => geometry.pointAt(i / 120, 0));
    const xs = points.map((p) => p.x);
    const zs = points.map((p) => p.z);
    const minX = Math.min(...xs);
    const minZ = Math.min(...zs);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ) || 1;
    const scale = (SIZE - PAD * 2) / span;
    const offX = PAD + (SIZE - PAD * 2 - (Math.max(...xs) - minX) * scale) / 2;
    const offZ = PAD + (SIZE - PAD * 2 - (Math.max(...zs) - minZ) * scale) / 2;
    this.toMap = (x, z) => [offX + (x - minX) * scale, offZ + (z - minZ) * scale];

    this.root.replaceChildren();
    const path = document.createElementNS(NS, 'path');
    path.setAttribute(
      'd',
      `${points
        .map(
          (p, i) =>
            `${i ? 'L' : 'M'}${this.toMap(p.x, p.z)
              .map((v) => v.toFixed(1))
              .join(' ')}`,
        )
        .join('')}Z`,
    );
    path.setAttribute('class', 'hud-minimap-track');
    this.root.append(path);
    this.dots.length = 0;
    this.trackId = state.trackId;
    return true;
  }

  /** Draws every kart; `youId` (the local player) gets the bigger yellow dot. */
  update(state: SimState, youId: number): void {
    if (state.trackId !== this.trackId && !this.build(state)) {
      this.root.style.display = 'none';
      return;
    }
    this.root.style.display = '';
    // People (online players have nicknames; offline scenarios' parked karts don't) over the AI,
    // and the player last so it's drawn on top.
    const rank = (kart: SimState['karts'][number]) =>
      kart.id === youId ? 2 : kart.controller !== 'ai' && kart.name !== undefined ? 1 : 0;
    const order = [...state.karts].sort((a, b) => rank(a) - rank(b));
    order.forEach((kart, i) => {
      let dot = this.dots[i];
      if (!dot) {
        dot = document.createElementNS(NS, 'circle');
        this.root.append(dot);
        this.dots[i] = dot;
      }
      const [x, y] = this.toMap(kart.position.x, kart.position.z);
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', y.toFixed(1));
      const kind = (['ai', 'human', 'you'] as const)[rank(kart)];
      dot.setAttribute('r', kind === 'you' ? '4.5' : kind === 'human' ? '3.8' : '3');
      dot.setAttribute('class', kind === 'ai' ? 'hud-dot' : `hud-dot ${kind}`);
    });
    for (const extra of this.dots.splice(order.length)) extra.remove();
  }
}
