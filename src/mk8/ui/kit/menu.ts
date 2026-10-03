// MK8 menu selection (MK-104): one tile selected at a time, with the pulsing yellow frame. Arrows
// move it (cursor sound), Enter confirms (decide sound); on touch a tap selects a tile and a tap
// on the selected tile confirms it. Back is the stack's (Esc, Backspace, the B button).
import type { SoundPlayer } from '../../audio/player';
import type { SoundId } from '../../audio/soundIds';
import { menuAction, nextIndex } from './nav';

export interface MenuOptions {
  items: readonly HTMLElement[];
  /** Grid width; 1 (a column) by default. */
  columns?: number;
  initial?: number;
  sounds: SoundPlayer;
  /** The selection moved (by key or tap). */
  onSelect?: (index: number) => void;
  /** OK on the selected tile. */
  onConfirm: (index: number) => void;
  /** The sound of a move; the cursor blip by default (MK-119: the course roulette). */
  moveSound?: SoundId;
  /** Whether a tile can be confirmed (MK-119: locked cups can't); no decide sound when not. */
  canConfirm?: (index: number) => boolean;
  /** OK on a tile that can't be confirmed. */
  onRefuse?: (index: number) => void;
}

export const SELECTED_CLASS = 'is-selected';

export class Menu {
  index = 0;
  /** An inactive menu ignores taps (a screen with two menus, MK-119); keys are the screen's to route. */
  active = true;
  private readonly items: readonly HTMLElement[];
  private readonly columns: number;
  private readonly sounds: SoundPlayer;
  private readonly onSelect: ((index: number) => void) | undefined;
  private readonly onConfirm: (index: number) => void;
  private readonly moveSound: SoundId;
  private readonly canConfirm: (index: number) => boolean;
  private readonly onRefuse: ((index: number) => void) | undefined;

  constructor(options: MenuOptions) {
    this.items = options.items;
    this.moveSound = options.moveSound ?? 'ui/cursor';
    this.canConfirm = options.canConfirm ?? (() => true);
    this.onRefuse = options.onRefuse;
    this.columns = options.columns ?? 1;
    this.sounds = options.sounds;
    this.onSelect = options.onSelect;
    this.onConfirm = options.onConfirm;
    this.items.forEach((item, i) => {
      // Keys go through the menu, never a focused button (Space would confirm twice).
      item.tabIndex = -1;
      item.addEventListener('mousedown', (e) => e.preventDefault());
      item.addEventListener('click', () => this.tap(i));
    });
    this.select(options.initial ?? 0, false);
  }

  /** Moves the selection to `index`; the cursor sound plays when it changes. */
  select(index: number, sound = true): void {
    const changed = index !== this.index;
    this.index = index;
    this.items.forEach((item, i) => {
      const selected = i === index;
      item.classList.toggle(SELECTED_CLASS, selected);
      if (selected) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });
    if (sound && changed) this.sounds.play(this.moveSound);
    if (changed || !sound) this.onSelect?.(index);
  }

  confirm(): void {
    if (!this.canConfirm(this.index)) {
      this.onRefuse?.(this.index);
      return;
    }
    this.sounds.play('ui/decide');
    this.onConfirm(this.index);
  }

  /** Arrow keys and Enter/Space; true when the key was the menu's. */
  handleKey(e: KeyboardEvent): boolean {
    const action = menuAction(e.key);
    if (!action || action.kind === 'back') return false;
    e.preventDefault();
    if (action.kind === 'ok') this.confirm();
    else this.select(nextIndex(this.index, action.key, this.items.length, this.columns));
    return true;
  }

  /** A tap or click: select the tile, or confirm it when it already is. */
  private tap(index: number): void {
    if (!this.active) return;
    if (index === this.index) this.confirm();
    else this.select(index);
  }
}
