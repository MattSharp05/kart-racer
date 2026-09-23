import { positionOf } from '../sim/race';
import { raceTime } from '../sim/raceFlow';
import type { ItemId, SimEvent, SimState } from '../sim/types';

export const ITEM_NAMES: Record<ItemId, string> = {
  mushroom: 'Mushroom',
  banana: 'Banana',
  green: 'Green shell',
  red: 'Red shell',
  star: 'Star',
  lightning: 'Lightning',
};
const ROULETTE_ORDER: ItemId[] = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];

const ORDINAL = ['th', 'st', 'nd', 'rd'];

export function ordinal(n: number): string {
  const v = n % 100;
  return `${n}${ORDINAL[(v - 20) % 10] ?? ORDINAL[v] ?? ORDINAL[0]}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

/**
 * Minimal race readouts (MK-12) until the styled HUD (MK-24): countdown, lap, position, timer,
 * wrong way and the finish banner. Results are a menu screen (MK-25).
 */
export class RaceOverlay {
  private readonly root = document.createElement('div');
  private readonly status = document.createElement('div');
  private readonly timer = document.createElement('div');
  private readonly centre = document.createElement('div');
  private readonly item = document.createElement('div');
  private centreUntil = 0;
  private lastStatus = '';
  bestNote = '';

  constructor() {
    this.root.className = 'race-overlay';
    this.status.className = 'race-status';
    this.timer.className = 'race-timer';
    this.centre.className = 'race-centre';
    this.item.className = 'race-item';
    this.root.append(this.status, this.timer, this.centre, this.item);
    document.body.append(this.root);
  }

  /** Big centre messages come from sim events (countdown numbers, GO, FINISH). */
  onEvents(events: SimEvent[], state: SimState, now: number): void {
    for (const event of events) {
      if (event.type === 'countdown') this.flash(String(event.value), now, 1000);
      if (event.type === 'go') this.flash('GO!', now, 800);
      if (event.type === 'finish' && event.kartId === 0) {
        this.flash(`FINISH! ${ordinal(event.position)}`, now, 3000);
      }
      if (event.type === 'lap' && event.kartId === 0 && event.lap === state.race.laps) {
        this.flash('FINAL LAP!', now, 1500);
      }
    }
  }

  update(state: SimState, now: number, menuOpen = false): void {
    const kart = state.karts[0];
    const racing = state.phase !== 'free';
    if (!kart || state.trackId === 'test-pad' || menuOpen) {
      this.root.hidden = true;
      return;
    }
    this.root.hidden = false;

    const lap = Math.min(Math.max(1, kart.race.lap), state.race.laps);
    const lapText = racing ? `Lap ${lap}/${state.race.laps}` : `Lap ${Math.max(1, kart.race.lap)}`;
    const text = `${lapText} · ${ordinal(positionOf(state, kart.id))}${kart.race.wrongWay ? ' · WRONG WAY' : ''}`;
    if (text !== this.lastStatus) {
      this.status.textContent = text;
      this.status.classList.toggle('wrong-way', kart.race.wrongWay);
      this.lastStatus = text;
    }

    this.timer.hidden = !racing;
    if (racing) {
      const end = kart.race.finishTick ?? state.tick;
      this.timer.textContent = formatTime(raceTime(state, end));
    }

    if (state.phase === 'countdown' && this.centre.hidden) {
      // Scenarios can start mid-countdown: show the current number.
      const left = Math.ceil((state.race.goTick - state.tick) / 60);
      if (left > 0 && left <= 3) this.flash(String(left), now, 1000);
    }
    if (now > this.centreUntil) this.centre.hidden = true;

    this.updateItem(state, now);
  }

  /** Item slot (text until the HUD's icons in MK-24); the roulette cycles through names. */
  private updateItem(state: SimState, now: number): void {
    const slot = state.karts[0]?.item;
    const text = !slot
      ? ''
      : slot.roulette > 0
        ? `🎲 ${ITEM_NAMES[ROULETTE_ORDER[Math.floor(now / 90) % ROULETTE_ORDER.length] ?? 'mushroom']}`
        : slot.held
          ? `${ITEM_NAMES[slot.held]} — press E`
          : '';
    this.item.hidden = text === '';
    if (this.item.textContent !== text) this.item.textContent = text;
  }

  private flash(text: string, now: number, ms: number): void {
    this.centre.textContent = text;
    this.centre.hidden = false;
    this.centreUntil = now + ms;
  }
}
