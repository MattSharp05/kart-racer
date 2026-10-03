// MK8 Mode's race HUD (MK-127): installed as our HUD's skin when MK8 Mode's chunk loads, it draws
// every MK8 race (MK8's item set, or an MK8 course). The DOM is built on the first race it draws,
// which also loads the pack's UI sprites and the font (stand-ins until then, or without a pack).
import { trackLoad } from '../../../game/pending';
import { tracks } from '../../../content/tracks';
import type { SimState } from '../../../sim/types';
import { setHudSkin, type HudSkin } from '../../../ui/hud/skin';
import type { SoundId } from '../../audio/soundIds';
import { MK8_ITEM_SET } from '../../content/items/id';
import type { SpriteSource } from '../kit/styleGuide';
import { Mk8Hud, type HudHooks } from './hud';

export type { HudHooks } from './hud';

export interface Mk8HudDeps {
  /** Loads what the HUD draws with (the pack's UI sprites, the font); never rejects. */
  loadSprites(): Promise<SpriteSource>;
  /** Plays an MK8 sound (the pack's, or a stand-in). */
  play(id: SoundId): void;
  /** Where the test hooks go (`window.__mk8.hud`). */
  expose?(hooks: HudHooks): void;
}

/** Whether a race is MK8 Mode's: MK8's items, or an MK8 course (a mesh track). */
export function isMk8Race(state: SimState): boolean {
  if (state.itemSet === MK8_ITEM_SET) return true;
  return tracks.has(state.trackId) && tracks.get(state.trackId).def.kind === 'mesh';
}

/** Registers MK8 Mode's HUD with our HUD (once per page). */
export function installMk8Hud(deps: Mk8HudDeps): void {
  let hud: Mk8Hud | undefined;
  const open = (): Mk8Hud => {
    if (hud) return hud;
    const created = new Mk8Hud((id) => deps.play(id));
    hud = created;
    const ready = trackLoad(deps.loadSprites()).then((sprites) => created.useSprites(sprites));
    deps.expose?.(created.hooks(ready));
    return created;
  };
  const skin: HudSkin = {
    owns: isMk8Race,
    update: (state, kartId, _now, visible) => {
      if (visible) open().update(state, kartId, true);
      else hud?.update(state, kartId, false);
    },
    onEvents: (events, state, kartId) => open().onEvents(events, state, kartId),
  };
  setHudSkin(skin);
}
