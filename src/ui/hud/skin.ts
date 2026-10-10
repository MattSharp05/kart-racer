import type { SimEvent, SimState } from '../../sim/types';
import type { HudView } from './hud';

/**
 * Another look for the race HUD (MK-127: MK8 Mode's), registered at runtime by the chunk that
 * brings it. For the races it `owns`, `Hud` hides its own pieces (keeping its screen effects and
 * warnings) and the skin draws the race instead. Each `Hud` makes its own skin (MK-148: one per
 * split-screen view).
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
  /** Hides the skin (its HUD's split-screen view isn't used now, MK-148). */
  hide(): void;
  /** Puts the skin in its HUD's split-screen view (MK-148), or on the whole screen (`null`). */
  setView?(view: HudView | null): void;
}

/**
 * Makes a HUD's skin. `primary` is the screen's own HUD (P1's): the race-wide sounds (the
 * countdown) are its alone, so split-screen views don't play them four times over.
 */
export type HudSkinFactory = (primary: boolean) => HudSkin;

let current: HudSkinFactory | undefined;

/** Registers the skin (one at a time; `undefined` removes it). */
export function setHudSkin(skin: HudSkinFactory | undefined): void {
  current = skin;
}

export function hudSkin(): HudSkinFactory | undefined {
  return current;
}
