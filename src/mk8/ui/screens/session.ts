// What MK8 Mode's menus have chosen so far (MK-116): the screens write it as the player goes and
// later screens (character select, cups, the race) read it. Tests read it via `window.__mk8.flow`.
import type { KeyValueStore } from '../../../game/storage/store';
import type { EngineClass } from '../../../sim/tuning';
import type { Loadout } from '../../../sim/types';
import type { Mk8CourseKey, Mk8CupId } from '../../content/cups';
import type { Mk8RaceSetup } from '../../flow';
import type { PreviewFiles } from '../../render/preview';
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

/**
 * The player's kart (TDD v3 → Loadout): racer, body, tires and glider, ids from MK8's stat table
 * (`content/stats.ts`, MK-102). Character select and the kart builder fill it in; until they
 * exist it is the default one.
 */
export type Mk8Loadout = Loadout;

/** The player's choices on the way to a race. */
export interface Mk8Flow {
  mode?: Mk8GameMode;
  loadout?: Mk8Loadout;
  /** Engine class screen (MK-119). */
  engineClass?: EngineClass;
  /** Cup/course select (MK-119): the cup, and the course raced (a GP's first course). */
  cup?: Mk8CupId;
  course?: Mk8CourseKey;
}

/** What every MK8 menu screen is built with. */
export interface Mk8Context {
  /** Pack sprite URLs (undefined without a pack: screens draw stand-ins). */
  sprites: SpriteSource;
  flow: Mk8Flow;
  /** The game's prefs store: the kart builder's last loadout (MK-118). */
  store: KeyValueStore;
  /** Pack files on demand: the kart builder's 3D preview (MK-118). */
  files: PreviewFiles;
  /** Hold 3D previews still (`&paused=1`: tests and paused QA links). */
  frozen: boolean;
  /** Loads a course's pack files and the race's item models (progress 0–1, MK-119). */
  loadCourse(course: Mk8CourseKey, onProgress: (fraction: number) => void): Promise<void>;
  /** Leaves the menus for the race. */
  startRace(setup: Mk8RaceSetup): void;
}
