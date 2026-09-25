import { positionOf } from '../../sim/race';
import { raceTime } from '../../sim/raceFlow';
import type { ItemId, KartItem, SimEvent, SimState } from '../../sim/types';
import { formatTime, ordinal } from './format';
import { ITEM_NAMES, ITEM_ORDER, itemIcon } from './icons';
import { Minimap } from './minimap';
import './hud.css';

export { formatTime, ordinal } from './format';

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

/**
 * The race HUD (MK-24): lap top-left, timer + last lap top-right, item slot top-centre, big
 * position bottom-right, minimap bottom-left, and centre banners (countdown, GO, FINAL LAP,
 * WRONG WAY, FINISH). Only touches the DOM when something changed.
 */
export class Hud {
  private readonly root = div('hud');
  private readonly lap = div('hud-lap');
  private readonly timer = div('hud-timer');
  private readonly timerMain = div('hud-time');
  private readonly lastLap = div('hud-last-lap');
  private readonly item = div('hud-item');
  private readonly position = div('hud-position');
  private readonly centre = div('hud-centre');
  private readonly wrongWay = div('hud-wrong-way');
  private readonly minimap = new Minimap();
  private readonly screenFlash = div('hud-flash');
  private centreUntil = 0;
  private readonly shown = new Map<HTMLElement, string>();
  bestNote = '';

  constructor() {
    this.timer.append(this.timerMain, this.lastLap);
    this.wrongWay.textContent = 'WRONG WAY';
    this.root.append(
      this.lap,
      this.timer,
      this.item,
      this.position,
      this.centre,
      this.wrongWay,
      this.minimap.root,
      this.screenFlash,
    );
    document.body.append(this.root);
  }

  /** Big centre messages come from sim events (countdown numbers, GO, FINISH) for kart `kartId`. */
  onEvents(events: SimEvent[], state: SimState, kartId: number, now: number): void {
    for (const event of events) {
      if (event.type === 'countdown') this.flash(String(event.value), now, 1000);
      if (event.type === 'go') this.flash('GO!', now, 800);
      if (event.type === 'finish' && event.kartId === kartId) {
        this.flash(`FINISH! ${ordinal(event.position)}`, now, 3000);
      }
      if (event.type === 'lap' && event.kartId === kartId && event.lap === state.race.laps) {
        this.flash('FINAL LAP!', now, 1500);
      }
      if (event.type === 'lightning') this.lightningFlash();
    }
  }

  /** A white screen flash when anyone uses Lightning (MK-20). */
  private lightningFlash(): void {
    this.screenFlash.classList.remove('on');
    void this.screenFlash.offsetWidth; // restart the animation
    this.screenFlash.classList.add('on');
  }

  /** Sets text/HTML only when it changed (no layout thrash at render rate). */
  private set(el: HTMLElement, html: string): void {
    if (this.shown.get(el) === html) return;
    this.shown.set(el, html);
    el.innerHTML = html;
  }

  private show(el: HTMLElement, visible: boolean): void {
    if (el.hidden === !visible) return;
    el.hidden = !visible;
  }

  /** Draws the HUD for kart `kartId` (the local player, MK-38). */
  update(state: SimState, kartId: number, now: number, menuOpen = false): void {
    const kart = state.karts[kartId];
    const racing = state.phase !== 'free';
    if (!kart || state.trackId === 'test-pad' || menuOpen) {
      this.show(this.root, false);
      return;
    }
    this.show(this.root, true);

    const lap = Math.min(Math.max(1, kart.race.lap), state.race.laps);
    this.set(
      this.lap,
      racing
        ? `<span class="hud-label">LAP</span> ${lap}<small>/${state.race.laps}</small>`
        : `<span class="hud-label">LAP</span> ${Math.max(1, kart.race.lap)}`,
    );

    const position = positionOf(state, kart.id);
    const suffix = ordinal(position).slice(String(position).length);
    this.set(this.position, `${position}<small>${suffix}</small>`);
    this.position.dataset.position = String(position);
    this.show(this.position, state.karts.length > 1 || racing);

    this.show(this.timer, racing);
    if (racing) {
      const end = kart.race.finishTick ?? state.tick;
      this.set(this.timerMain, formatTime(raceTime(state, end)));
      const last = kart.race.lapTimes.at(-1);
      this.set(this.lastLap, last !== undefined ? `Last ${formatTime(last)}` : '');
    }

    this.show(this.wrongWay, kart.race.wrongWay);

    if (state.phase === 'countdown' && this.centre.hidden) {
      // Scenarios can start mid-countdown: show the current number.
      const left = Math.ceil((state.race.goTick - state.tick) / 60);
      if (left > 0 && left <= 3) this.flash(String(left), now, 1000);
    }
    if (now > this.centreUntil) this.show(this.centre, false);

    this.updateItem(kart.item, now);
    this.minimap.update(state, kart.id);
  }

  /** Item slot: cycles icons during the roulette, then shows the held item. */
  private updateItem(slot: KartItem, now: number): void {
    let item: ItemId | null = null;
    let rolling = false;
    if (slot.roulette) {
      item = ITEM_ORDER[Math.floor(now / 90) % ITEM_ORDER.length] ?? 'mushroom';
      rolling = true;
    } else if (slot.held) {
      item = slot.held;
    }
    this.item.classList.toggle('rolling', rolling);
    this.item.dataset.item = rolling ? 'roulette' : (item ?? '');
    // Key hint while an item is ready (QA round 2: players didn't know how to use it).
    const hint = item && !rolling ? '<span class="hud-item-key"></span>' : '';
    this.set(this.item, item ? itemIcon(item) + hint : '');
    this.item.title = item && !rolling ? ITEM_NAMES[item] : '';
  }

  private flash(text: string, now: number, ms: number): void {
    this.centre.textContent = text;
    this.shown.delete(this.centre);
    this.show(this.centre, true);
    this.centre.classList.remove('pop');
    void this.centre.offsetWidth; // restart the pop animation
    this.centre.classList.add('pop');
    this.centreUntil = now + ms;
  }
}
