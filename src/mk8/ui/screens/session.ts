// What MK8 Mode's menus have chosen so far (MK-116): the screens write it as the player goes and
// later screens (character select, cups, the race) read it. Tests read it via `window.__mk8.flow`.
import type { KeyValueStore } from '../../../game/storage/store';
import type { EngineClass } from '../../../sim/tuning';
import type { Loadout } from '../../../sim/types';
import type { Mk8CourseKey, Mk8CupId } from '../../content/cups';
import type { Mk8RaceSetup } from '../../flow';
import type { VsRules } from '../../modes/vsRace';
import type { KartPreviewFiles } from '../../render/kartPreview';
import type { SpriteSource } from '../kit/styleGuide';
import type { Mk8ScreenFactory } from '../stack';

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
  /** VS Race settings (MK-131): items and CPU difficulty. */
  vs?: VsRules;
}

/** What every MK8 menu screen is built with. */
export interface Mk8Context {
  /** Pack sprite URLs (undefined without a pack: screens draw stand-ins). */
  sprites: SpriteSource;
  flow: Mk8Flow;
  /** Pack files on demand: the kart builder's 3D preview (MK-118). */
  files: KartPreviewFiles;
  /** Loads a course's pack files and the race's item models (progress 0–1, MK-119). */
  loadCourse(course: Mk8CourseKey, onProgress: (fraction: number) => void): Promise<void>;
  /** Leaves the menus for the race. */
  startRace(setup: Mk8RaceSetup): void;
  /** A loaded pack file's bytes (MK-117: the 3D portrait's models); undefined when not loaded. */
  packFile(path: string): ArrayBuffer | undefined;
  /** Whether 3D stages hold still (tests, `&paused=1`): only their `step` moves them. */
  frozen: boolean;
  /**
   * Loads the character select's racer models and select voice lines (MK-117), racer `first`
   * (its model id) first: `onFirst` runs once its files are in. Rejects without a pack.
   */
  loadCharacters(first: string, onFirst?: () => void): Promise<void>;
  /** Where MK8 Mode remembers picks (MK-117: the last racer; MK-118: the last loadout). */
  store: KeyValueStore;
  /**
   * The screen after screen `from` in the flow (`order.ts`, MK-142), for these choices: what OK
   * pushes. Screens never import each other.
   */
  next(from: string): Mk8ScreenFactory;
  /** Online (MK-132): the game's rooms as MK8 rooms, racing `loadout`; absent outside the game. */
  openRoom?: (loadout: Mk8Loadout) => void;
}

/**
 * An MK8 menu screen (MK-142): each screen file exports one as `screen`; `index.ts` finds them
 * and `order.ts` puts them in the flow.
 */
export interface Mk8Screen {
  /** Its place in `order.ts`. */
  id: string;
  build(ctx: Mk8Context): Mk8ScreenFactory;
  /**
   * Scenario starts (`Mk8Start`, a scenario's `mk8Start`) that open MK8 Mode on this screen, over
   * the screens before it, each with the choices made on the way.
   */
  starts?: Record<string, Mk8Flow>;
  /** Left out of the flow for these choices (the engine class in Time Trial). */
  skip?(flow: Mk8Flow): boolean;
}
