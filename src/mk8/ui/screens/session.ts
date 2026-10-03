// What MK8 Mode's menus have chosen so far (MK-116): the screens write it as the player goes and
// later screens (character select, cups, the race) read it. Tests read it via `window.__mk8.flow`.
import type { SpriteSource } from '../kit/styleGuide';

/** MK8 Mode's game modes, in the mode select's order. */
export const MK8_MODES = [
  {
    id: 'grand-prix',
    label: 'Grand Prix',
    detail: 'Race a cup of 4 courses for points',
    sprite: 'u_mushroomcup',
  },
  { id: 'vs', label: 'VS Race', detail: 'Any course, your rules', sprite: 'i_red' },
  {
    id: 'time-trial',
    label: 'Time Trial',
    detail: 'Solo, with three mushrooms',
    sprite: 'i_mushroom3',
  },
  { id: 'online', label: 'Online', detail: 'Race friends in a room', sprite: 'i_star' },
] as const;

export type Mk8GameMode = (typeof MK8_MODES)[number]['id'];

export function modeInfo(id: Mk8GameMode): (typeof MK8_MODES)[number] {
  const found = MK8_MODES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown MK8 mode: ${id}`);
  return found;
}

/** The player's choices on the way to a race. */
export interface Mk8Flow {
  mode?: Mk8GameMode;
}

/** What every MK8 menu screen is built with. */
export interface Mk8Context {
  /** Pack sprite URLs (undefined without a pack: screens draw stand-ins). */
  sprites: SpriteSource;
  flow: Mk8Flow;
}
