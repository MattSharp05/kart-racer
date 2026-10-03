// MK8 Mode's race screens (MK-121): the pause menu and the results of an MK8 race, each in its own
// MK8 screen stack over the race (the game's `mk8Stack` router screen), with the pack's sounds and
// sprites. `src/game/flow.ts` imports this lazily when an MK8 race pauses or finishes.
import { tracks } from '../content/tracks';
import type { SimState } from '../sim/types';
import type { Router } from '../ui/router';
import { courseInfo, MUSHROOM_COURSES } from './content/cups';
import { mk8Course } from './content/courses';
import { loadMk8Course } from './courses';
import { DEFAULT_LOADOUT, raceSetup, type Mk8RaceSetup } from './flow';
import { audioPlayer, packLoader, prepareRace } from './index';
import { PackLockedError, PackNotInstalledError } from './loader';
import {
  gpStandings,
  mk8ResultRows,
  nextCourse,
  raceOfCup,
  resultChoices,
  type Mk8ResultChoice,
} from './results';
import type { SpriteSource } from './ui/kit/styleGuide';
import { pauseMenu } from './ui/screens/pause';
import { resultsScreen, type ResultsChoice } from './ui/screens/results';
import { MK8_MODES, modeInfo, type Mk8GameMode } from './ui/screens/session';
import { sprite } from './ui/sprites';
import './ui/stack';

export interface Mk8PauseHandlers {
  onContinue: () => void;
  onRestart: () => void;
  onQuit: () => void;
}

/** MK8's pause menu over a race (MK-121): Continue, Restart, Quit. Esc / B continue. */
export function showPause(
  screens: Router,
  state: SimState,
  setup: Mk8RaceSetup | undefined,
  handlers: Mk8PauseHandlers,
): void {
  screens.show('mk8Stack', {
    first: pauseMenu({ ...raceTitle(state, setup), ...handlers }),
    sounds: audioPlayer(),
    onExit: handlers.onContinue,
  });
}

export interface Mk8ResultsHandlers {
  /** The next race of the cup, its course loaded. */
  onNext: (setup: Mk8RaceSetup) => void;
  onRetry: () => void;
  onQuit: () => void;
}

/**
 * The results of a finished MK8 race (MK-121): its rows, and in a Grand Prix the standings. The
 * race from the menus (`setup`) says the mode; a scenario's race says it with its `mk8Start`
 * (`mode`: a game mode's id; VS otherwise). The Grand Prix's earlier points come with the GP
 * ticket: until then every race of a cup starts the standings from 0.
 */
export function showResults(
  screens: Router,
  state: SimState,
  localKartId: number,
  setup: Mk8RaceSetup | undefined,
  mode: string | undefined,
  handlers: Mk8ResultsHandlers,
): void {
  const race = setup ?? scenarioSetup(state, gameMode(mode));
  const gameModeId = race.mode ?? 'vs';
  const rows = mk8ResultRows(state, localKartId);
  const next = nextCourse(race);
  const choices = resultChoices(gameModeId, next !== undefined).map((id): ResultsChoice => ({
    id,
    label: choiceLabel(id, gameModeId),
    onPress: {
      next: () => void goNext(race, handlers),
      retry: handlers.onRetry,
      quit: handlers.onQuit,
    }[id],
  }));
  const { race: n, of } = raceOfCup(race);
  const title = raceTitle(state, setup);
  const gp = gameModeId === 'grand-prix';
  screens.show('mk8Stack', {
    first: resultsScreen({
      title: title.title,
      sub: gp ? `Race ${n} / ${of} · Standings` : `${modeInfo(gameModeId).label} · ${title.sub}`,
      rows,
      ...(gp ? { standings: gpStandings(rows) } : {}),
      choices,
      sprites: packSprites(),
      instant: openedPaused() || prefersReducedMotion(),
    }),
    sounds: audioPlayer(),
    onExit: handlers.onQuit,
  });
}

/** The header band: the course's name (or the track's) and the engine class. */
function raceTitle(state: SimState, setup: Mk8RaceSetup | undefined) {
  const name = setup
    ? courseInfo(setup.course).name
    : tracks.has(state.trackId)
      ? tracks.get(state.trackId).name
      : state.trackId;
  return { title: name, sub: `${state.engineClass}cc` };
}

function choiceLabel(id: Mk8ResultChoice, mode: Mk8GameMode): string {
  if (id === 'next') return mode === 'grand-prix' ? 'Next race' : 'Next course';
  return id === 'retry' ? 'Retry' : 'Quit';
}

/** A scenario's mode hint (its `mk8Start`) as a game mode, if it is one. */
function gameMode(hint: string | undefined): Mk8GameMode {
  return MK8_MODES.find((m) => m.id === hint)?.id ?? 'vs';
}

/** A scenario's race, as if picked in the menus: the Mushroom Cup's first course, its class. */
function scenarioSetup(state: SimState, mode: Mk8GameMode): Mk8RaceSetup {
  const first = MUSHROOM_COURSES[0]?.key ?? 'stadium';
  return raceSetup({
    mode,
    cup: 'mushroom',
    course: first,
    engineClass: state.engineClass,
    loadout: DEFAULT_LOADOUT,
  });
}

/** Loads the next course of the cup (a stand-in needs nothing), then races it. */
async function goNext(race: Mk8RaceSetup, handlers: Mk8ResultsHandlers): Promise<void> {
  const course = nextCourse(race);
  if (!course) return handlers.onQuit();
  const content = mk8Course(course.pack);
  try {
    if (content) await loadMk8Course(packLoader(), content);
  } catch (e) {
    // No pack here (or the site's still locked): the course's stand-in.
    if (!(e instanceof PackNotInstalledError || e instanceof PackLockedError)) throw e;
  }
  await prepareRace();
  handlers.onNext(
    raceSetup({
      ...(race.mode ? { mode: race.mode } : {}),
      cup: race.cup,
      course: course.key,
      engineClass: race.engineClass,
      loadout: race.loadout,
    }),
  );
}

/** Sprite URLs from the loaded pack's bytes; undefined without a pack (stand-in initials). */
function packSprites(): SpriteSource {
  const files = packLoader();
  const urls = new Map<string, string | undefined>();
  return (id) => {
    if (!urls.has(id)) {
      const bytes = files.file(sprite(id).file);
      urls.set(id, bytes && URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })));
    }
    return urls.get(id);
  };
}

const openedPaused = () => new URLSearchParams(location.search).get('paused') === '1';
const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
