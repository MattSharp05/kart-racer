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

/**
 * On-screen controls for phones and tablets (MK-23): a steering zone for the left thumb, and
 * Drift / Item / Brake buttons for the right. Auto-accelerates once the player has touched the
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
    this.root.hidden = true;

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
