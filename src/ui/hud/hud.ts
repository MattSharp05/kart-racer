import { itemSets } from '../../content/items/registries';
import { hazardWarning, trackHazards } from '../../sim/hazards';
import { availableItems } from '../../sim/items';
import { homingOn } from '../../sim/items/entities';
import { positionOf } from '../../sim/race';
import { raceTime } from '../../sim/raceFlow';
import { getTrack } from '../../sim/track';
import type { ItemId, ItemSlot, KartItem, SimEvent, SimState } from '../../sim/types';
import { formatTime, ordinal } from './format';
import { iconShowsUses, itemIcon, itemName } from './icons';
import { Minimap } from './minimap';
import { ScreenEffects } from './screenEffects';
import { hudSkin, type HudSkin, type HudSkinFactory } from './skin';
import './hud.css';

export { formatTime, ordinal } from './format';

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

/**
 * Where a split-screen player's HUD sits (MK-145): its view's rect (fractions of the screen from
 * the top left), the player's label ("P2") and slot colour. `compact` for quarter views.
 */
export interface HudView {
  rect: { x: number; y: number; w: number; h: number };
  label: string;
  colour: string;
  compact: boolean;
}

/** The icons the roulette cycles: the race's item set's (MK-103), once it is registered. */
function rouletteItems(state: SimState): ItemId[] {
  return state.itemSet !== undefined && itemSets.has(state.itemSet)
    ? availableItems(state.itemSet)
    : availableItems();
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
  /** The second slot (MK-103), in races that have one (MK8). */
  private readonly item2 = div('hud-item2');
  private readonly position = div('hud-position');
  private readonly centre = div('hud-centre');
  /** An online race still connecting (MK-73): who it waits for, in place of the countdown. */
  private readonly waitingLine = div('hud-waiting');
  private readonly wrongWay = div('hud-wrong-way');
  /** A hazard about to start, e.g. "SANDSTORM!" (MK-58). */
  private readonly hazard = div('hud-hazard-warning');
  /** Something homing on you (a red shell, hornets…), next to the item slot (MK-67). */
  private readonly incoming = div('hud-incoming');
  private readonly minimap = new Minimap();
  private readonly screenFlash = div('hud-flash');
  private readonly screenEffects = new ScreenEffects();
  /** The player's label on a split-screen view (MK-145). */
  private readonly player = div('hud-player');
  /** Coins (MK-109 tracks) on a split-screen view (MK-145). */
  private readonly coins = div('hud-coins');
  /** The split-screen view this HUD draws in (MK-145); null = the whole screen. */
  private view: HudView | null = null;
  private centreUntil = 0;
  /**
   * Set while an online race waits for its players to connect (MK-73), e.g. "Connecting to Sam…":
   * shown instead of the countdown, which stands still on 3 until then.
   */
  waiting: string | null = null;
  private readonly shown = new Map<HTMLElement, string>();
  /** This HUD's skin (MK-127), made from the registered factory the first time it's asked for. */
  private skinMade: { factory: HudSkinFactory; skin: HudSkin } | undefined;

  /**
   * `primary` is the screen's own HUD (P1's): only it shows the online waiting line. Split-screen
   * views of P2–P4 (MK-145) aren't primary; each has its own skin in its view (MK-148).
   */
  constructor(private readonly primary = true) {
    this.timer.append(this.timerMain, this.lastLap);
    this.wrongWay.textContent = 'WRONG WAY';
    this.incoming.hidden = true;
    this.item2.hidden = true;
    this.player.hidden = true;
    this.coins.hidden = true;
    // Outside the kart HUD: a client has no kart until the host's Start arrives.
    this.waitingLine.hidden = true;
    if (primary) document.body.append(this.waitingLine);
    this.root.append(
      this.player,
      this.coins,
      this.lap,
      this.timer,
      this.item,
      this.item2,
      this.incoming,
      this.position,
      this.centre,
      this.wrongWay,
      this.hazard,
      this.minimap.root,
      this.screenEffects.root,
      this.screenFlash,
    );
    document.body.append(this.root);
  }

  /**
   * Puts this HUD in a split-screen view (MK-145), labelled with its player, or back on the whole
   * screen (`null`).
   */
  setView(view: HudView | null): void {
    const same =
      view === this.view ||
      (view !== null &&
        this.view !== null &&
        view.label === this.view.label &&
        view.colour === this.view.colour &&
        view.compact === this.view.compact &&
        sameRect(view.rect, this.view.rect));
    if (same) return;
    this.view = view;
    this.skinMade?.skin.setView?.(view);
    const style = this.root.style;
    this.root.classList.toggle('hud-view', view !== null);
    this.root.classList.toggle('hud-compact', view?.compact === true);
    this.show(this.player, view !== null);
    if (!view) {
      style.removeProperty('left');
      style.removeProperty('top');
      style.removeProperty('width');
      style.removeProperty('height');
      style.removeProperty('--player-colour');
      delete this.root.dataset.player;
      return;
    }
    const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;
    style.left = percent(view.rect.x);
    style.top = percent(view.rect.y);
    style.width = percent(view.rect.w);
    style.height = percent(view.rect.h);
    style.setProperty('--player-colour', view.colour);
    this.root.dataset.player = view.label;
    this.player.textContent = view.label;
  }

  /** Hides this HUD (a split-screen view no player uses now, MK-145), and its skin. */
  hide(): void {
    this.show(this.root, false);
    this.skinMade?.skin.hide();
  }

  /** This HUD's skin, if one is registered (made on first use, in this HUD's view). */
  private skin(): HudSkin | undefined {
    const factory = hudSkin();
    if (!factory) return undefined;
    if (this.skinMade?.factory !== factory) {
      const skin = factory(this.primary);
      skin.setView?.(this.view);
      this.skinMade = { factory, skin };
    }
    return this.skinMade.skin;
  }

  /** Big centre messages come from sim events (countdown numbers, GO, FINISH) for kart `kartId`. */
  onEvents(events: SimEvent[], state: SimState, kartId: number, now: number): void {
    const skin = this.skin();
    if (skin?.owns(state)) skin.onEvents(events, state, kartId, now);
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
    this.screenEffects.onEvents(events, kartId, now);
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
    // Text, not HTML: it holds players' nicknames.
    if (this.waitingLine.textContent !== (this.waiting ?? '')) {
      this.waitingLine.textContent = this.waiting ?? '';
    }
    this.show(this.waitingLine, this.waiting !== null && !menuOpen);
    const kart = state.karts[kartId];
    const racing = state.phase !== 'free';
    const hidden = !kart || state.trackId === 'test-pad' || menuOpen;
    // Another HUD's race (MK-127: MK8 Mode's): it draws the race; ours keeps its effects and warnings.
    const skin = this.skin();
    const skinned = skin?.owns(state) === true;
    skin?.update(state, kartId, now, skinned && !hidden);
    if (hidden) {
      this.show(this.root, false);
      return;
    }
    this.show(this.root, true);
    this.root.classList.toggle('hud-skinned', skinned);

    this.show(this.wrongWay, kart.race.wrongWay);
    const warning = hazardWarning(trackHazards(getTrack(state.trackId)), state.tick);
    this.set(this.hazard, warning ?? '');
    this.show(this.hazard, warning !== undefined);
    if (skinned) {
      this.screenEffects.update(kart, now);
      return;
    }

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

    if (this.waiting !== null) this.show(this.centre, false);
    else if (state.phase === 'countdown' && this.centre.hidden) {
      // Scenarios can start mid-countdown: show the current number.
      const left = Math.ceil((state.race.goTick - state.tick) / 60);
      if (left > 0 && left <= 3) this.flash(String(left), now, 1000);
    }
    if (now > this.centreUntil) this.show(this.centre, false);

    const roulette = () => rouletteItems(state);
    this.updateItem(kart.item, now, roulette);
    this.updateSecondSlot(kart.item.second, now, roulette);
    this.updateIncoming(state, kart.id);
    // Split views show coins where the track has them (MK-145; MK8 Mode's own HUD shows them alone).
    const coins = this.view !== null && kart.coins !== undefined;
    this.show(this.coins, coins);
    if (coins) this.set(this.coins, `<span class="hud-coin"></span>${kart.coins ?? 0}`);
    this.minimap.update(state, kart.id);
    this.screenEffects.update(kart, now);
  }

  /** Item slot: cycles icons during the roulette, then shows the held item. */
  private updateItem(slot: KartItem, now: number, roulette: () => ItemId[]): void {
    let item: ItemId | null = null;
    let rolling = false;
    if (slot.roulette) {
      const all = roulette();
      item = all[Math.floor(now / 90) % all.length] ?? null;
      rolling = true;
    } else if (slot.held) {
      item = slot.held;
    }
    this.item.classList.toggle('rolling', rolling);
    this.item.dataset.item = rolling ? 'roulette' : (item ?? '');
    // Key hint while an item is ready (QA round 2: players didn't know how to use it).
    const hint = item && !rolling ? '<span class="hud-item-key"></span>' : '';
    // Uses left of a multi-use item (MK-52): drawn by its icon if it can (MK-65), else a badge.
    const ready = item !== null && !rolling;
    const drawsUses = item !== null && !rolling && iconShowsUses(item);
    const uses =
      ready && !drawsUses && slot.uses > 1
        ? `<span class="hud-item-uses">×${slot.uses}</span>`
        : '';
    this.item.dataset.uses = ready ? String(slot.uses) : '';
    this.set(this.item, item ? itemIcon(item, ready ? slot.uses : undefined) + hint + uses : '');
    this.item.title = item && !rolling ? itemName(item) : '';
  }

  /** Slot 2 (MK-103): the same, smaller, with no key hint; hidden in one-slot races. */
  private updateSecondSlot(
    slot: ItemSlot | undefined,
    now: number,
    roulette: () => ItemId[],
  ): void {
    this.show(this.item2, slot !== undefined);
    if (!slot) return;
    const rolling = slot.roulette > 0;
    const all = rolling ? roulette() : [];
    const item = rolling ? (all[Math.floor(now / 90) % all.length] ?? null) : slot.held;
    this.item2.classList.toggle('rolling', rolling);
    this.item2.dataset.item = rolling ? 'roulette' : (item ?? '');
    this.set(this.item2, item ? itemIcon(item, rolling ? undefined : slot.uses) : '');
    this.item2.title = item && !rolling ? itemName(item) : '';
  }

  /** The incoming warning: the icon of each item chasing the kart, with a blinking "!". */
  private updateIncoming(state: SimState, kartId: number): void {
    const chasing = homingOn(state, kartId);
    this.incoming.dataset.items = chasing.join(' ');
    this.set(
      this.incoming,
      chasing.length
        ? `<span class="hud-incoming-alert">!</span>${chasing.map((item) => itemIcon(item)).join('')}`
        : '',
    );
    this.show(this.incoming, chasing.length > 0);
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

function sameRect(a: HudView['rect'], b: HudView['rect']): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}
