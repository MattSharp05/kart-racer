import type { InputSource, InputSourceProvider } from './sources';
import { TestSource } from './sources/testSource';

/** Most people in one local race (MK-144): one screen, up to 4 views (MK-145). */
export const MAX_PLAYERS = 4;

/**
 * The local players' controllers (MK-144): slot 0 is P1, slot 3 is P4. Each slot has at most one
 * source; the session drives slot `i`'s kart with it. Split-screen (MK-145) gives each slot its own
 * view; the phone pairing (MK-146) binds a phone to a slot.
 */
export class PlayerSlots {
  private readonly sources: (InputSource | undefined)[] = [];
  /** Sources this class made as stand-ins (replaced when a provider has a real one). */
  private readonly standIns = new Set<InputSource>();
  private readonly listeners: (() => void)[] = [];

  /** Binds `source` to `slot`, replacing (and freeing) what was there. */
  bind(slot: number, source: InputSource): void {
    checkSlot(slot);
    const old = this.sources[slot];
    if (old === source) return;
    this.release(old);
    this.sources[slot] = source;
    this.changed();
  }

  /** Empties `slot`, freeing its source. */
  unbind(slot: number): void {
    checkSlot(slot);
    const old = this.sources[slot];
    if (!old) return;
    this.release(old);
    this.sources[slot] = undefined;
    this.changed();
  }

  /** The source bound to `slot`, if any. */
  source(slot: number): InputSource | undefined {
    return this.sources[slot];
  }

  /** Whether `slot`'s source is the "Auto" stand-in, not a real controller. */
  isStandIn(slot: number): boolean {
    const source = this.sources[slot];
    return source !== undefined && this.standIns.has(source);
  }

  /**
   * Gives every slot below `players` a source: what it has, else the first provider's, else an
   * "Auto" stand-in (which a provider's source replaces on a later race).
   */
  fill(players: number, providers: readonly InputSourceProvider[]): void {
    for (let slot = 0; slot < Math.min(players, MAX_PLAYERS); slot += 1) {
      if (this.sources[slot] && !this.isStandIn(slot)) continue;
      const claimed = providers.reduce<InputSource | null>(
        (found, provider) => found ?? provider.claim(slot),
        null,
      );
      if (claimed) this.bind(slot, claimed);
      else if (!this.sources[slot]) {
        const standIn = new TestSource({ autopilot: true });
        this.standIns.add(standIn);
        this.bind(slot, standIn);
      }
    }
  }

  /** The first slot below `players` whose pause was pressed since the last call, else -1. */
  takePause(players: number): number {
    let paused = -1;
    // Every source's press is taken, so one held over from earlier can't pause later.
    for (let slot = 0; slot < Math.min(players, MAX_PLAYERS); slot += 1) {
      if (this.sources[slot]?.takePause?.() && paused < 0) paused = slot;
    }
    return paused;
  }

  /** Called whenever a slot's source changes (the setup screen's controller list). */
  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private release(source: InputSource | undefined): void {
    if (!source) return;
    this.standIns.delete(source);
    source.dispose?.();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}

/** "P1" … "P4" for slot 0 … 3. */
export function playerLabel(slot: number): string {
  return `P${slot + 1}`;
}

/**
 * Each player's colour, P1 to P4 (MK-145): their split-screen view's label and frame. Distinct for
 * colour-blind players too (red/blue/green/yellow differ in lightness).
 */
export const PLAYER_COLOURS: readonly string[] = ['#e63946', '#2f7fe0', '#2a9d4b', '#e0a800'];

/** Player `slot`'s colour. */
export function playerSlotColour(slot: number): string {
  return PLAYER_COLOURS[slot % PLAYER_COLOURS.length] ?? '#ffffff';
}

function checkSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_PLAYERS) {
    throw new Error(`No player slot ${slot} (0–${MAX_PLAYERS - 1})`);
  }
}
