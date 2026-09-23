import { positionOf } from '../sim/race';
import type { SimState } from '../sim/types';

/** Minimal race readout until the real HUD (MK-24): lap, position, wrong-way warning. */
export class RaceDebugOverlay {
  private readonly el = document.createElement('div');
  private last = '';

  constructor() {
    this.el.className = 'race-debug';
    this.el.setAttribute('aria-live', 'polite');
    document.body.append(this.el);
  }

  update(state: SimState): void {
    const kart = state.karts[0];
    if (!kart || state.trackId === 'test-pad') {
      this.el.hidden = true;
      return;
    }
    const lap = Math.max(1, kart.race.lap);
    const text = `Lap ${lap} · ${positionOf(state, kart.id)}/${state.karts.length}${kart.race.wrongWay ? ' · WRONG WAY' : ''}`;
    if (text === this.last) return;
    this.last = text;
    this.el.hidden = false;
    this.el.textContent = text;
    this.el.classList.toggle('wrong-way', kart.race.wrongWay);
  }
}
