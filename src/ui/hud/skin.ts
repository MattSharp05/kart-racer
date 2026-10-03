import type { SimEvent, SimState } from '../../sim/types';

/**
 * Another look for the race HUD (MK-127: MK8 Mode's), registered at runtime by the chunk that
 * brings it. For the races it `owns`, `Hud` hides its own pieces (keeping its screen effects and
 * warnings) and the skin draws the race instead.
 */
export interface HudSkin {
  /** Whether this race is the skin's to draw. */
  owns(state: SimState): boolean;
  /**
   * Called every frame the HUD updates; `visible` is false when the skin doesn't own the race or
   * the HUD is hidden (a menu, no kart), so it hides itself.
   */
  update(state: SimState, kartId: number, now: number, visible: boolean): void;
  /** The race's events for kart `kartId` (sounds, banners); only in races it owns. */
  onEvents(events: SimEvent[], state: SimState, kartId: number, now: number): void;
}

let current: HudSkin | undefined;

/** Registers the skin (one at a time; `undefined` removes it). */
export function setHudSkin(skin: HudSkin | undefined): void {
  current = skin;
}

export function hudSkin(): HudSkin | undefined {
  return current;
}
