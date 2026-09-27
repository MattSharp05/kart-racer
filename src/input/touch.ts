import type { Hand, Steering } from '../game/storage/settings';
import { NEUTRAL_INPUT, type InputFrame } from '../sim/types';
import { isTextEntry } from './keyboard';
import './touch.css';

/** Drag distance (px) for full steering lock. */
export const STEER_MAX_PX = 60;

/** Horizontal drag from where the thumb went down → steer −1..1 (analog, full at `max` px). */
export function steerFromDrag(dx: number, max = STEER_MAX_PX): number {
  if (max <= 0) return 0;
  return Math.max(-1, Math.min(1, dx / max));
}

/** Whether this looks like a touch-first device. */
export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}

type ButtonName = 'drift' | 'item' | 'brake';

/** The hand (MK-53) and steering (MK-54) the controls follow, and every live set to update. */
let currentHand: Hand = 'right';
let currentSteering: Steering = 'drag';
const allControls = new Set<TouchControls>();

/**
 * Drag or tilt steering (MK-54). With tilt the drag stick is hidden and dragging doesn't steer
 * (`input/tilt.ts` does); the buttons stay, and a tap on the zone still starts the auto-accelerate,
 * so the player picks when to go (throttle held too long before GO stalls). Applies at once.
 */
export function setTouchSteering(steering: Steering): void {
  currentSteering = steering;
  for (const controls of allControls) controls.root.dataset.steering = steering;
}

/**
 * Lays the touch controls out for `hand` (MK-53): Left mirrors them, buttons left and steering
 * right. Applies at once, mid-race too; controls created later start with it. The layout itself is
 * CSS custom properties on `.touch-controls`, switched by its `data-hand`.
 */
export function setTouchHand(hand: Hand): void {
  currentHand = hand;
  for (const controls of allControls) controls.root.dataset.hand = hand;
}

/** How the touch controls steer (MK-54). */
export function touchSteering(): Steering {
  return currentSteering;
}

/** The hand the touch controls are laid out for (MK-53). */
export function touchHand(): Hand {
  return currentHand;
}

/**
 * On-screen controls for phones and tablets (MK-23): a steering zone for one thumb, and
 * Drift / Item / Brake buttons for the other (right-handed by default; see `setTouchHand`). Auto-accelerates once the player has touched the
 * controls. Hidden on keyboard devices, and as soon as a key is pressed.
 */
export class TouchControls {
  readonly root = document.createElement('div');
  private readonly stick = document.createElement('div');
  private readonly held = new Set<ButtonName>();
  private steerPointer: number | undefined;
  private steerStartX = 0;
  private steer = 0;
  private engaged = false;
  private shown = false;
  /** Set false while a menu is open: no auto-accelerate, controls hidden. */
  active = true;

  constructor() {
    this.root.className = 'touch-controls';
    this.root.dataset.hand = currentHand;
    this.root.dataset.steering = currentSteering;
    this.root.hidden = true;
    allControls.add(this);

    const zone = document.createElement('div');
    zone.className = 'touch-steer';
    this.stick.className = 'touch-stick';
    zone.append(this.stick);
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engaged = true;
      this.steerPointer = e.pointerId;
      this.steerStartX = e.clientX;
      this.steer = 0;
      zone.setPointerCapture?.(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.steerPointer || currentSteering === 'tilt') return;
      this.steer = steerFromDrag(e.clientX - this.steerStartX);
      this.stick.style.transform = `translateX(${this.steer * STEER_MAX_PX}px)`;
    });
    const endSteer = (e: PointerEvent) => {
      if (e.pointerId !== this.steerPointer) return;
      this.steerPointer = undefined;
      this.steer = 0;
      this.stick.style.transform = '';
    };
    zone.addEventListener('pointerup', endSteer);
    zone.addEventListener('pointercancel', endSteer);

    const buttons = document.createElement('div');
    buttons.className = 'touch-buttons';
    buttons.append(
      this.button('brake', 'Brake'),
      this.button('item', 'Item'),
      this.button('drift', 'Drift'),
    );
    this.root.append(zone, buttons);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    document.body.append(this.root);

    if (isTouchDevice()) this.show();
    window.addEventListener('touchstart', () => this.show(), { passive: true });
    // A phone's on-screen keyboard sends keydown too: typing a name doesn't hide the controls.
    window.addEventListener('keydown', (e) => {
      if (!isTextEntry(e.target)) this.hide();
    });
  }

  private button(name: ButtonName, label: string): HTMLButtonElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `touch-button touch-${name}`;
    el.textContent = label;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.engaged = true;
      this.held.add(name);
      el.classList.add('down');
    });
    const release = () => {
      this.held.delete(name);
      el.classList.remove('down');
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', release);
    return el;
  }

  private show(): void {
    this.shown = true;
    this.root.hidden = !this.active;
    document.body.classList.add('touch');
  }

  private hide(): void {
    this.shown = false;
    document.body.classList.remove('touch');
    this.engaged = false;
    this.held.clear();
    this.root.hidden = true;
  }

  /** Called when menus open/close. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.root.hidden = !(this.shown && active);
    if (!active) this.held.clear();
  }

  /** Whether the controls are on screen and driving (not hidden, no menu open). */
  get live(): boolean {
    return this.shown && this.active;
  }

  read(): InputFrame {
    if (!this.live) return NEUTRAL_INPUT;
    const braking = this.held.has('brake');
    return {
      throttle: this.engaged && !braking ? 1 : 0,
      brake: braking ? 1 : 0,
      steer: currentSteering === 'tilt' ? 0 : this.steer,
      drift: this.held.has('drift'),
      item: this.held.has('item'),
    };
  }
}
