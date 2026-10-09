// MK8 Mode's race HUD (MK-127, screen 8 of the mockup): the glossy item box top-left with its
// roulette and the smaller second slot, the minimap with racer heads top-right, coins and lap
// bottom-left, the big position bottom-right, the countdown and Lakitu's light and lap sign. A
// DOM layer that only reads the sim state; it draws over our HUD's screen effects (`Hud` hides
// its own pieces in races this skin owns). Animations run on sim ticks, so a paused race always
// draws the same frame.
import { racerViews } from '../../../content/racers/render';
import { homingOn } from '../../../sim/items/entities';
import { positionOf } from '../../../sim/race';
import type { ItemId, KartState, SimEvent, SimState } from '../../../sim/types';
import { formatTime, ordinal } from '../../../ui/hud/format';
import type { HudView } from '../../../ui/hud/hud';
import { raceClock } from '../../modes/timeTrial';
import type { SoundId } from '../../audio/soundIds';
import { lakituPose, LAKITU } from '../../render/lakitu';
import type { SpriteSource } from '../kit/styleGuide';
import { countdownSince, countdownText, hudSounds, lakituCue } from './cues';
import {
  COIN_SPRITE,
  hasItemSvg,
  headSprite,
  itemIconUrl,
  itemSvg,
  REEL_ITEMS,
  showsCount,
} from './icons';
import { headAt, mapProjection, type MapProjection } from './map';
import { bounceScale, Reel, type ReelFrame } from './reel';
import './hud.css';

/** The minimap's viewBox side and the margin round the course, map units. */
const MAP_SIZE = 190;
const MAP_PAD = 16;
/** Coins pulse and the position pops for this many ticks after a change. */
const POP_TICKS = 18;
/** A countdown number's pop, s. */
const COUNTDOWN_POP_SECONDS = 0.35;
/** Frame-time samples kept for the perf hook. */
const PERF_SAMPLES = 120;
/** The mockup's screen, px: `--u` is one of its pixels (MK-148: of the view's, split-screen). */
const MOCKUP_WIDTH = 1280;
const MOCKUP_HEIGHT = 720;
/** Sounds of the whole race, not one player's: only the screen's own HUD plays them (MK-148). */
const RACE_WIDE_SOUNDS: readonly SoundId[] = ['race/countdown', 'race/go'];

function div(className: string, parent?: HTMLElement): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  parent?.append(el);
  return el;
}

/** The racer a kart is (its MK8 loadout's, or its own). */
function racerOf(kart: KartState): string {
  return kart.loadout?.racer ?? kart.kartType;
}

/** One item slot: the round window and its reel of two icon cells. */
class SlotView {
  readonly root: HTMLDivElement;
  private readonly reel: HTMLDivElement;
  private readonly cells: [HTMLDivElement, HTMLDivElement];
  private readonly count: HTMLDivElement;
  private readonly reelState = new Reel();
  private shown = '';

  constructor(className: string) {
    this.root = div(`mk8-hud-slot ${className}`);
    this.reel = div('mk8-hud-reel', this.root);
    this.cells = [div('mk8-hud-cell', this.reel), div('mk8-hud-cell', this.reel)];
    this.count = div('mk8-hud-count', this.root);
  }

  /** Forgets what it drew (new sprites): the next update redraws the icons. */
  redraw(): void {
    this.shown = '';
  }

  /** Draws the slot; returns its frame (the HUD plays the roulette's sounds from it). */
  update(
    slot: { held: ItemId | null; uses: number; roulette: number },
    tick: number,
    sprites: SpriteSource,
  ): ReelFrame {
    const frame = this.reelState.update(slot, tick, REEL_ITEMS);
    const spinning = frame.state === 'spinning';
    this.root.dataset.state = frame.state;
    this.root.dataset.item = spinning ? 'roulette' : (frame.item ?? '');
    this.root.dataset.uses = spinning ? '' : String(frame.uses);
    const key = `${frame.item}|${frame.next}|${frame.uses}|${spinning}`;
    if (key !== this.shown) {
      this.shown = key;
      const [a, b] = this.cells;
      const drawn =
        setIcon(a, frame.item, spinning ? 1 : frame.uses, sprites) &&
        setIcon(b, spinning ? frame.next : null, 1, sprites);
      // An icon that isn't there yet (MK8's item looks still loading): try again next frame.
      if (!drawn) this.shown = '';
      const counted = !spinning && frame.item !== null && showsCount(frame.item, frame.uses);
      this.count.textContent = counted ? `×${frame.uses}` : '';
    }
    // Spinning: the next icon scrolls down into the window; landing: a bounce.
    this.reel.style.setProperty('--reel', frame.offset.toFixed(3));
    this.reel.style.setProperty('--land', bounceScale(frame.land).toFixed(3));
    return frame;
  }
}

/**
 * Puts `item`'s icon (the pack's sprite, else our SVG) in `cell`; false when it has neither yet.
 */
function setIcon(
  cell: HTMLElement,
  item: ItemId | null,
  uses: number,
  sprites: SpriteSource,
): boolean {
  if (item === null) {
    cell.replaceChildren();
    return true;
  }
  const url = itemIconUrl(item, uses, sprites);
  if (url) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = url;
    cell.replaceChildren(img);
    return true;
  }
  cell.innerHTML = itemSvg(item, uses);
  return hasItemSvg(item);
}

/** Test hooks (`window.__mk8.hud`). */
export interface HudHooks {
  /** Mean time `update` took over the last frames, ms. */
  frameMs(): number;
  /** Resolves once the pack's sprites and the font are loaded (or known missing). */
  ready: Promise<void>;
}

export class Mk8Hud {
  readonly root = div('mk8-hud');
  private readonly item = new SlotView('mk8-hud-item');
  private readonly item2 = new SlotView('mk8-hud-item2');
  private readonly map = div('mk8-hud-map');
  private readonly mapImage = document.createElement('img');
  private readonly mapSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly mapPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  private readonly heads: HTMLDivElement[] = [];
  private readonly incoming = div('mk8-hud-incoming');
  private readonly coins = div('mk8-hud-coins');
  private readonly coinIcon = div('mk8-hud-coin', this.coins);
  private readonly coinCount = document.createElement('span');
  private readonly lap = div('mk8-hud-lap');
  private readonly position = div('mk8-hud-position');
  /** A Time Trial's clock and lap splits (MK-131), under the minimap. */
  private readonly timer = div('mk8-hud-timer');
  private readonly countdown = div('mk8-hud-countdown');
  private readonly lakitu = div('mk8-hud-lakitu');
  private readonly light = div('mk8-hud-light', this.lakitu);
  private readonly lamps = [0, 1, 2].map(() => div('mk8-hud-lamp', this.light));
  private readonly sign = div('mk8-hud-sign', this.lakitu);
  /** The player's label on a split-screen view (MK-148), in their colour. */
  private readonly player = div('mk8-hud-player');
  private projection: MapProjection | null = null;
  private trackId = '';
  private lastPosition = 0;
  private positionTick = Number.NEGATIVE_INFINITY;
  private lastCoins = -1;
  private coinTick = Number.NEGATIVE_INFINITY;
  private readonly text = new Map<HTMLElement, string>();
  private readonly samples: number[] = [];
  private sprites: SpriteSource = () => undefined;

  /**
   * `primary`: the screen's own HUD (P1's), which plays the race-wide sounds; split-screen views'
   * HUDs (MK-148) play only their own player's.
   */
  constructor(
    private readonly play: (id: SoundId) => void,
    private readonly primary = true,
  ) {
    this.mapImage.className = 'mk8-hud-map-sprite';
    this.mapImage.alt = '';
    this.mapImage.hidden = true;
    this.mapSvg.setAttribute('viewBox', `0 0 ${MAP_SIZE} ${MAP_SIZE}`);
    this.mapSvg.setAttribute('class', 'mk8-hud-map-course');
    this.mapPath.setAttribute('class', 'mk8-hud-map-road');
    this.mapSvg.append(this.mapPath);
    this.map.append(this.mapImage, this.mapSvg);
    this.coins.append(Object.assign(document.createElement('span'), { textContent: '×' }));
    this.coins.append(this.coinCount);
    this.coinCount.className = 'mk8-hud-coin-count';
    this.root.append(
      this.item.root,
      this.item2.root,
      this.map,
      this.incoming,
      this.coins,
      this.lap,
      this.position,
      this.timer,
      this.lakitu,
      this.countdown,
      this.player,
    );
    this.player.hidden = true;
    this.root.hidden = true;
    document.body.append(this.root);
  }

  /** Switches to the pack's sprites (once loaded): redraws every icon. */
  useSprites(sprites: SpriteSource): void {
    this.sprites = sprites;
    this.item.redraw();
    this.item2.redraw();
    this.trackId = '';
    this.text.clear();
    for (const head of this.heads.splice(0)) head.remove();
    const coin = sprites(COIN_SPRITE);
    this.coinIcon.replaceChildren();
    if (coin)
      this.coinIcon.append(Object.assign(document.createElement('img'), { src: coin, alt: '' }));
    this.coinIcon.classList.toggle('stand-in', !coin);
  }

  hooks(ready: Promise<void>): HudHooks {
    return {
      frameMs: () =>
        this.samples.length ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length : 0,
      ready,
    };
  }

  onEvents(events: SimEvent[], state: SimState, kartId: number): void {
    for (const id of hudSounds(events, state, kartId)) {
      if (this.primary || !RACE_WIDE_SOUNDS.includes(id)) this.play(id);
    }
  }

  /**
   * Puts the HUD in a split-screen view (MK-148): its rect, sized from the view as the mockup's
   * screen, labelled with the player in their colour; `null` is the whole screen again.
   */
  setView(view: HudView | null): void {
    const style = this.root.style;
    this.root.classList.toggle('mk8-hud-view', view !== null);
    this.root.classList.toggle('mk8-hud-compact', view?.compact === true);
    this.player.hidden = view === null;
    if (!view) {
      for (const p of ['left', 'top', 'width', 'height', '--u', '--player-colour']) {
        style.removeProperty(p);
      }
      delete this.root.dataset.player;
      return;
    }
    const { x, y, w, h } = view.rect;
    const percent = (fraction: number) => `${(fraction * 100).toFixed(3)}%`;
    style.left = percent(x);
    style.top = percent(y);
    style.width = percent(w);
    style.height = percent(h);
    style.setProperty(
      '--u',
      `min(calc(100vw * ${w} / ${MOCKUP_WIDTH}), calc(100vh * ${h} / ${MOCKUP_HEIGHT}))`,
    );
    style.setProperty('--player-colour', view.colour);
    this.root.dataset.player = view.label;
    this.player.textContent = view.label;
  }

  hide(): void {
    this.root.hidden = true;
  }

  update(state: SimState, kartId: number, visible: boolean): void {
    const kart = state.karts[kartId];
    if (!visible || !kart) {
      this.root.hidden = true;
      return;
    }
    const start = performance.now();
    this.root.hidden = false;
    const tick = state.tick;
    const racing = state.phase !== 'free';

    const first = this.item.update(kart.item, tick, this.sprites);
    this.item2.root.hidden = kart.item.second === undefined;
    const second = kart.item.second && this.item2.update(kart.item.second, tick, this.sprites);
    if (first.started || second?.started) this.play('race/item-roulette');
    if (first.landed || second?.landed) this.play('race/item-decide');

    this.updateCoins(kart, tick);
    this.lap.hidden = !racing;
    if (racing) {
      const lap = Math.min(Math.max(1, kart.race.lap), state.race.laps);
      this.set(this.lap, `${lap}<small>/${state.race.laps}</small>`);
    }
    this.updatePosition(state, kart, tick);
    this.updateTimer(state, kart);
    this.updateMap(state, kart.id);
    this.updateIncoming(state, kart.id);
    this.updateLakitu(state, kart);

    this.samples.push(performance.now() - start);
    if (this.samples.length > PERF_SAMPLES) this.samples.shift();
  }

  /** Sets HTML only when it changed. */
  private set(el: HTMLElement, html: string): void {
    if (this.text.get(el) === html) return;
    this.text.set(el, html);
    el.innerHTML = html;
  }

  private updateCoins(kart: KartState, tick: number): void {
    const coins = kart.coins ?? 0;
    if (this.lastCoins >= 0 && coins > this.lastCoins) this.coinTick = tick;
    this.lastCoins = coins;
    this.coins.dataset.coins = String(coins);
    if (this.coinCount.textContent !== String(coins)) this.coinCount.textContent = String(coins);
    this.coins.style.setProperty(
      '--pulse',
      bounceScale((tick - this.coinTick) / POP_TICKS).toFixed(3),
    );
  }

  /** A Time Trial's race time (frozen at the finish) over each finished lap's split. */
  private updateTimer(state: SimState, kart: KartState): void {
    this.timer.hidden = !state.timeTrial;
    if (!state.timeTrial) return;
    const splits = kart.race.lapTimes
      .map((t, i) => `<li><small>${i + 1}</small>${formatTime(t)}</li>`)
      .join('');
    this.set(
      this.timer,
      `<b class="mk8-hud-clock">${formatTime(raceClock(state, kart.id))}</b><ol>${splits}</ol>`,
    );
  }

  private updatePosition(state: SimState, kart: KartState, tick: number): void {
    const position = positionOf(state, kart.id);
    // Alone against the clock (a Time Trial, or free drive) there's no place to show.
    this.position.hidden =
      position < 1 ||
      state.timeTrial === true ||
      (state.phase === 'free' && state.karts.length < 2);
    if (this.lastPosition > 0 && position !== this.lastPosition) {
      this.positionTick = tick;
      if (position < this.lastPosition && state.phase === 'racing') this.play('race/rank-up');
    }
    this.lastPosition = position;
    const suffix = ordinal(position).slice(String(position).length);
    this.set(this.position, `${position}<small>${suffix}</small>`);
    this.position.dataset.position = String(position);
    const pop = bounceScale((tick - this.positionTick) / POP_TICKS);
    this.position.style.setProperty('--pop', pop.toFixed(3));
  }

  private updateMap(state: SimState, youId: number): void {
    if (state.trackId !== this.trackId) {
      this.trackId = state.trackId;
      this.projection = mapProjection(state.trackId, MAP_SIZE, MAP_PAD);
      this.mapPath.setAttribute('d', this.projection?.path ?? '');
    }
    const projection = this.projection;
    this.map.hidden = projection === null;
    if (!projection) return;
    // The player's head last, so it's drawn on top.
    const order = [...state.karts].sort((a, b) => Number(a.id === youId) - Number(b.id === youId));
    order.forEach((kart, i) => {
      const head = this.head(i);
      const racer = racerOf(kart);
      if (head.dataset.racer !== racer) this.drawHead(head, racer);
      head.classList.toggle('you', kart.id === youId);
      head.dataset.kart = String(kart.id);
      const [x, y] = headAt(projection, state.trackId, kart);
      head.style.left = `${((x / MAP_SIZE) * 100).toFixed(2)}%`;
      head.style.top = `${((y / MAP_SIZE) * 100).toFixed(2)}%`;
    });
    for (const extra of this.heads.splice(order.length)) extra.remove();
  }

  private head(i: number): HTMLDivElement {
    let head = this.heads[i];
    if (!head) {
      head = div('mk8-hud-head', this.map);
      this.heads[i] = head;
    }
    return head;
  }

  /** A racer's head: MK8's icon with the pack, else a disc in the racer's paint. */
  private drawHead(head: HTMLDivElement, racer: string): void {
    head.dataset.racer = racer;
    const id = headSprite(racer);
    const url = id === undefined ? undefined : this.sprites(id);
    head.replaceChildren();
    head.style.background = '';
    if (url) {
      head.append(Object.assign(document.createElement('img'), { src: url, alt: '' }));
    } else if (racerViews.has(racer)) {
      const { body, accent } = racerViews.get(racer).colours;
      const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
      head.style.background = `linear-gradient(135deg, ${hex(body)} 55%, ${hex(accent)} 55%)`;
    }
  }

  /** Items homing on the player (red shells, the Spiny Shell…): their icons, blinking. */
  private updateIncoming(state: SimState, kartId: number): void {
    const chasing = homingOn(state, kartId);
    this.incoming.hidden = chasing.length === 0;
    this.incoming.dataset.items = chasing.join(' ');
    const key = chasing.join(' ');
    if (this.text.get(this.incoming) === key) return;
    this.text.set(this.incoming, key);
    this.incoming.replaceChildren(
      ...chasing.map((item) => {
        const cell = div('mk8-hud-warning');
        setIcon(cell, item, 1, this.sprites);
        return cell;
      }),
    );
  }

  /** Lakitu's start light and lap sign, and the big countdown numbers. */
  private updateLakitu(state: SimState, kart: KartState): void {
    const pose = lakituPose(lakituCue(state, kart));
    this.lakitu.hidden = !pose.visible;
    if (pose.visible) {
      // Dropping in and flying off: his height over the hover point, as a share of the flight.
      const lift = (pose.offset[1] - LAKITU.hover[1]) / LAKITU.flyHeight;
      this.lakitu.style.setProperty('--lift', lift.toFixed(3));
      this.light.hidden = pose.light === null;
      this.sign.hidden = pose.sign === null;
      if (pose.light) {
        const { red, green } = pose.light;
        this.lamps.forEach((lamp, i) => {
          lamp.dataset.on = green ? 'green' : i < red ? 'red' : '';
        });
      }
      if (pose.sign !== null) {
        this.set(this.sign, pose.sign === 'FINAL LAP' ? 'FINAL<br>LAP' : pose.sign);
        this.sign.dataset.sign = pose.sign;
      }
    }
    const text = countdownText(state);
    this.countdown.hidden = text === null;
    if (text !== null && this.countdown.textContent !== text) this.countdown.textContent = text;
    this.countdown.dataset.text = text ?? '';
    // Each number pops in as it appears.
    const pop = bounceScale(countdownSince(state) / COUNTDOWN_POP_SECONDS);
    this.countdown.style.setProperty('--pop', pop.toFixed(3));
  }
}
