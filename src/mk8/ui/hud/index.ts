// MK8 Mode's race HUD (MK-127): installed as our HUD's skin when MK8 Mode's chunk loads, it draws
// every MK8 race (MK8's item set, or an MK8 course). The DOM is built on the first race it draws,
// which also loads the pack's UI sprites and the font (stand-ins until then, or without a pack).
import { OTHER_PLAYER_VOLUME } from '../../../audio/soundManager';
import { trackLoad } from '../../../game/pending';
import { tracks } from '../../../content/tracks';
import type { SimState } from '../../../sim/types';
import type { HudView } from '../../../ui/hud/hud';
import { setHudSkin, type HudSkin } from '../../../ui/hud/skin';
import type { SoundId } from '../../audio/soundIds';
import { MK8_ITEM_SET } from '../../content/items/id';
import type { SpriteSource } from '../kit/styleGuide';
import { Mk8Hud, type HudHooks } from './hud';

export type { HudHooks } from './hud';

export interface Mk8HudDeps {
  /** Loads what the HUD draws with (the pack's UI sprites, the font); never rejects. */
  loadSprites(): Promise<SpriteSource>;
  /** Plays an MK8 sound (the pack's, or a stand-in) at `volume` (0..1, default 1). */
  play(id: SoundId, volume?: number): void;
  /** Where the test hooks go (`window.__mk8.hud`). */
  expose?(hooks: HudHooks): void;
}

/** Whether a race is MK8 Mode's: MK8's items, or an MK8 course (a mesh track). */
export function isMk8Race(state: SimState): boolean {
  if (state.itemSet === MK8_ITEM_SET) return true;
  return tracks.has(state.trackId) && tracks.get(state.trackId).def.kind === 'mesh';
}

/**
 * Registers MK8 Mode's HUD with our HUD (once per page): each of our HUDs gets its own (MK-148:
 * one per split-screen view), all drawing with the sprites loaded the first time one is needed.
 */
export function installMk8Hud(deps: Mk8HudDeps): void {
  let sprites: Promise<SpriteSource> | undefined;
  let exposed = false;
  setHudSkin((primary): HudSkin => {
    let hud: Mk8Hud | undefined;
    const open = (): Mk8Hud => {
      if (hud) return hud;
      // P2–P4's own sounds quieter than P1's, the listener's (MK-145's mix).
      const volume = primary ? 1 : OTHER_PLAYER_VOLUME;
      const created = new Mk8Hud((id) => deps.play(id, volume), primary);
      if (view !== undefined) created.setView(view);
      hud = created;
      sprites ??= trackLoad(deps.loadSprites());
      const ready = sprites.then((loaded) => created.useSprites(loaded));
      // The test hooks are the screen's own HUD's (P1's).
      if (primary || !exposed) deps.expose?.(created.hooks(ready));
      exposed = true;
      return created;
    };
    let view: HudView | null | undefined;
    return {
      owns: isMk8Race,
      update: (state, kartId, _now, visible) => {
        if (visible) open().update(state, kartId, true);
        else hud?.update(state, kartId, false);
      },
      onEvents: (events, state, kartId) => open().onEvents(events, state, kartId),
      hide: () => hud?.hide(),
      setView: (next) => {
        view = next;
        hud?.setView(next);
      },
    };
  });
}
