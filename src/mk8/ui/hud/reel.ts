// The item roulette's reel (MK-127): what an item slot shows, frame by frame. A pure state machine
// over the slot's sim state, so it can't show anything but the sim's item once the spin ends: the
// sim picks the item when `roulette` reaches 0, and the reel lands on `held`. The spin is a
// function of the sim's time left, so a paused race always draws the same frame.
import { tuning } from '../../../sim/tuning';
import type { ItemId } from '../../../sim/types';

/** Timings, seconds and ticks. */
export const REEL = {
  /** Icons scrolled per second at full speed (MK8 flicks through about 12). */
  itemsPerSecond: 12,
  /** The reel slows down over the spin's last this many seconds. */
  slowSeconds: 0.4,
  /** The landing bounce, ticks. */
  landTicks: 18,
} as const;

/** What a slot is doing. */
export type ReelState = 'empty' | 'spinning' | 'landing' | 'held';

export interface ReelFrame {
  state: ReelState;
  /** The icon in the window: the reel's (spinning) or the slot's item. */
  item: ItemId | null;
  /** Spinning: the icon scrolling in after `item`. */
  next: ItemId | null;
  /** Spinning: how far `next` has scrolled in, 0–1. */
  offset: number;
  /** Uses left of the held item (0 while spinning or empty). */
  uses: number;
  /** Landing: the bounce's progress, 0–1 (1 otherwise). */
  land: number;
  /** The spin started this frame (the roulette sound). */
  started: boolean;
  /** The reel landed this frame (the decide sound). */
  landed: boolean;
}

/** The slot fields the reel reads (a `KartItem` or an `ItemSlot`). */
export interface SlotLike {
  held: ItemId | null;
  uses: number;
  roulette: number;
}

/** Icons scrolled `elapsed` s into a spin of `total` s: steady, then easing to a stop. */
export function scrolled(elapsed: number, total: number = tuning.rouletteSeconds): number {
  const rate = REEL.itemsPerSecond;
  const slowFrom = Math.max(0, total - REEL.slowSeconds);
  const e = Math.min(Math.max(0, elapsed), total);
  if (e <= slowFrom) return rate * e;
  const span = total - slowFrom;
  const u = (e - slowFrom) / span;
  // Speed falls linearly to zero: the distance is the integral of rate × (1 − u).
  return rate * slowFrom + rate * span * (u - (u * u) / 2);
}

export class Reel {
  private spinning = false;
  private landedTick = Number.NEGATIVE_INFINITY;

  /** The frame for `slot` at sim tick `tick`; `pool` = the icons the reel flicks through. */
  update(slot: SlotLike, tick: number, pool: readonly ItemId[]): ReelFrame {
    if (slot.roulette > 0) {
      const started = !this.spinning;
      this.spinning = true;
      const p = scrolled(tuning.rouletteSeconds - slot.roulette);
      const n = pool.length;
      const i = Math.floor(p);
      return {
        state: 'spinning',
        item: n ? (pool[i % n] ?? null) : null,
        next: n ? (pool[(i + 1) % n] ?? null) : null,
        offset: p - i,
        uses: 0,
        land: 1,
        started,
        landed: false,
      };
    }
    const landed = this.spinning && slot.held !== null;
    this.spinning = false;
    if (landed) this.landedTick = tick;
    if (slot.held === null) {
      this.landedTick = Number.NEGATIVE_INFINITY;
      return { ...EMPTY };
    }
    const land = Math.min(1, Math.max(0, (tick - this.landedTick) / REEL.landTicks));
    return {
      state: land < 1 ? 'landing' : 'held',
      item: slot.held,
      next: null,
      offset: 0,
      uses: slot.uses,
      land,
      started: false,
      landed,
    };
  }
}

const EMPTY: ReelFrame = {
  state: 'empty',
  item: null,
  next: null,
  offset: 0,
  uses: 0,
  land: 1,
  started: false,
  landed: false,
};

/** The landing bounce's scale at progress `t` (0–1): overshoots big, settles at 1. */
export function bounceScale(t: number): number {
  if (t >= 1) return 1;
  const decay = 1 - t;
  return 1 + 0.45 * decay * Math.cos(t * Math.PI * 2.5);
}
