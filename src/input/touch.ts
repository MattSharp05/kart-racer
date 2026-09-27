import type { Hand } from '../game/storage/settings';
import {
  buttonScale,
  defaultButtonLayout,
  TOUCH_BUTTONS,
  type ButtonLayout,
  type TouchButtonName,
} from './buttonLayout';
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

type ButtonName = TouchButtonName;

/** The hand the controls are laid out for (MK-53), and every live set of controls to update. */
let currentHand: Hand = 'right';
/** The button sizes and positions (MK-57). */
let currentLayout: ButtonLayout = defaultButtonLayout();
const allControls = new Set<TouchControls>();

/**
 * Lays the touch controls out for `hand` (MK-53): Left mirrors them, buttons left and steering
 * right. Applies at once, mid-race too; controls created later start with it. The layout itself is
 * CSS custom properties on `.touch-controls`, switched by its `data-hand`.
 */
export function setTouchHand(hand: Hand): void {
  currentHand = hand;
  for (const controls of allControls) controls.root.dataset.hand = hand;
}

/** The hand the touch controls are laid out for (MK-53). */
export function touchHand(): Hand {
  return currentHand;
}

/**
 * Sizes and places the Drift / Item / Brake buttons (MK-57). Applies at once to every live set of
 * controls; controls created later start with it.
 */
export function setTouchLayout(layout: ButtonLayout): void {
  currentLayout = layout;
  for (const controls of allControls) applyButtonLayout(controls.root, layout);
}

/**
 * Writes `layout` onto a `.touch-controls` root (the live controls, or the button editor's
 * preview) as CSS custom properties: `--touch-<button>-scale` always, and with custom positions
 * `data-layout="custom"` plus `--touch-<button>-x` / `-y` (% of the safe area from its outer edge
 * and bottom; `touch.css` turns them into left/right for the hand).
 */
export function applyButtonLayout(root: HTMLElement, layout: ButtonLayout): void {
  for (const name of TOUCH_BUTTONS) {
    root.style.setProperty(`--touch-${name}-scale`, String(buttonScale(layout, name)));
    const position = layout.positions?.[name];
    if (position) {
      root.style.setProperty(`--touch-${name}-x`, `${position.x}%`);
      root.style.setProperty(`--touch-${name}-y`, `${position.y}%`);
    } else {
      root.style.removeProperty(`--touch-${name}-x`);
      root.style.removeProperty(`--touch-${name}-y`);
    }
  }
  if (layout.positions) root.dataset.layout = 'custom';
  else delete root.dataset.layout;
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
    applyButtonLayout(this.root, currentLayout);
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
      if (e.pointerId !== this.steerPointer) return;
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

  read(): InputFrame {
    if (!this.shown || !this.active) return NEUTRAL_INPUT;
    const braking = this.held.has('brake');
    return {
      throttle: this.engaged && !braking ? 1 : 0,
      brake: braking ? 1 : 0,
      steer: this.steer,
      drift: this.held.has('drift'),
      item: this.held.has('item'),
    };
  }
}
