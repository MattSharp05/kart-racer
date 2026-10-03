// MK8 Mode's race screens (MK-121): the pause menu and the results of an MK8 race, each in its own
// MK8 screen stack over the race (the game's `mk8Stack` router screen), with the pack's sounds and
// sprites. `src/game/flow.ts` imports this lazily when an MK8 race pauses or finishes.
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import { browserStore, type KeyValueStore } from '../game/storage/store';
import type { SimState } from '../sim/types';
import type { Router } from '../ui/router';
import { courseInfo, cupInfo, MUSHROOM_COURSES } from './content/cups';
import { mk8Course } from './content/courses';
import { loadMk8Course } from './courses';
import { DEFAULT_LOADOUT, raceSetup, type Mk8RaceSetup } from './flow';
import {
  currentCourse,
  gpOver,
  gpPoints,
  gpStandingsOf,
  playerPlace,
  raceIndex,
  recordRace,
  trophyFor,
  type Mk8GrandPrix,
} from './gp/grandPrix';
import { isScriptedGp, scriptedGpFor, scriptedGrandPrix } from './gp/scripted';
import { saveTrophy } from './gp/trophies';
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
import { podiumFiles } from './render/podium';
import { confirmQuitGp } from './ui/screens/confirm';
import { pauseMenu } from './ui/screens/pause';
import { podiumScreen, type PodiumRow } from './ui/screens/podium';
import { resultsScreen, type ResultsChoice } from './ui/screens/results';
import { MK8_MODES, modeInfo, type Mk8GameMode } from './ui/screens/session';
import { sprite } from './ui/sprites';
import './ui/stack';

export interface Mk8PauseHandlers {
  onContinue: () => void;
  onRestart: () => void;
  onQuit: () => void;
  /** A scenario race's `mk8Start` (MK-130: a scripted Grand Prix's hint). */
  mode?: string | undefined;
}

/** MK8's pause menu over a race (MK-121): Continue, Restart, Quit. Esc / B continue. */
export function showPause(
  screens: Router,
  state: SimState,
  setup: Mk8RaceSetup | undefined,
  handlers: Mk8PauseHandlers,
): void {
  const race = setup ?? scriptedSetup(state, handlers.mode);
  screens.show('mk8Stack', {
    first: pauseMenu({
      ...raceTitle(state, race),
      ...handlers,
      // Mid-Grand Prix (MK-130), quitting loses the cup: asked first.
      ...(race?.gp ? { quitConfirm: confirmQuitGp(handlers.onQuit) } : {}),
    }),
    sounds: audioPlayer(),
    onExit: handlers.onContinue,
  });
}

export interface Mk8ResultsHandlers {
  /** The next race of the cup, its course loaded. */
  onNext: (setup: Mk8RaceSetup) => void;
  onRetry: () => void;
  onQuit: () => void;
  /** Where a Grand Prix's trophy is saved (MK-130); the browser's storage by default. */
  store?: KeyValueStore;
}

/**
 * The results of a finished MK8 race (MK-121): its rows, and in a Grand Prix (MK-130) the
 * standings with the cup's earlier points. The race from the menus (`setup`) says the mode; a
 * scenario's race says it with its `mk8Start` (`mode`: a game mode's id, or a scripted Grand Prix's
 * hint; VS otherwise). After a cup's last race the next choice is the podium.
 */
export function showResults(
  screens: Router,
  state: SimState,
  localKartId: number,
  setup: Mk8RaceSetup | undefined,
  mode: string | undefined,
  handlers: Mk8ResultsHandlers,
): void {
  const race = setup ?? scriptedSetup(state, mode) ?? scenarioSetup(state, gameMode(mode));
  if (race.gp && mode === 'gp-podium' && !setup) {
    showPodium(screens, recordRace(race.gp, state.positions), handlers);
    return;
  }
  const gameModeId = race.mode ?? 'vs';
  const rows = mk8ResultRows(state, localKartId);
  const gp = race.gp;
  const after = gp && recordRace(gp, state.positions);
  const next = after ? !gpOver(after) || 'podium' : nextCourse(race) !== undefined;
  const choices = resultChoices(gameModeId, next !== false)
    // A cup's last race goes on to the podium only.
    .filter((id) => !(next === 'podium' && id === 'quit'))
    .map((id): ResultsChoice => ({
      id,
      label: next === 'podium' && id === 'next' ? 'Awards' : choiceLabel(id, gameModeId),
      onPress: {
        next: () =>
          after && gpOver(after)
            ? showPodium(screens, after, handlers)
            : void goNext(race, after, handlers),
        retry: handlers.onRetry,
        quit: handlers.onQuit,
      }[id],
      ...(gp && id === 'quit' ? { confirm: confirmQuitGp(handlers.onQuit) } : {}),
    }));
  const { race: n, of } = gp ? { race: raceIndex(gp) + 1, of: gp.courses.length } : raceOfCup(race);
  const title = raceTitle(state, setup ?? (gp ? race : undefined));
  const showsStandings = gameModeId === 'grand-prix';
  const before = new Map((gp ? gpPoints(gp) : []).map((points, kartId) => [kartId, points]));
  screens.show('mk8Stack', {
    first: resultsScreen({
      title: title.title,
      sub: showsStandings
        ? `Race ${n} / ${of} · Standings`
        : `${modeInfo(gameModeId).label} · ${title.sub}`,
      rows,
      ...(showsStandings ? { standings: gpStandings(rows, before) } : {}),
      choices,
      sprites: packSprites(),
      instant: openedPaused() || prefersReducedMotion(),
    }),
    sounds: audioPlayer(),
    onExit: handlers.onQuit,
  });
}

/**
 * The podium after a Grand Prix (MK-130): the final standings' top 3 on the steps over the last
 * course's award background, and the player's trophy, saved for the cup and class.
 */
export function showPodium(
  screens: Router,
  gp: Mk8GrandPrix,
  handlers: Pick<Mk8ResultsHandlers, 'onQuit' | 'store'>,
): void {
  const standings = gpStandingsOf(gp);
  const place = playerPlace(gp);
  const trophy = trophyFor(place);
  if (trophy) saveTrophy(handlers.store ?? browserStore(), gp.cup, gp.engineClass, trophy);
  const rows = standings.map((row): PodiumRow => {
    const entrant = gp.entrants[row.entrant];
    const racer = entrant?.racer ?? '';
    return {
      racer,
      loadout: entrant?.loadout ?? DEFAULT_LOADOUT,
      name: racers.has(racer) ? racers.get(racer).name : racer,
      place: row.place,
      total: row.total,
      you: row.entrant === 0,
    };
  });
  const last = gp.courses[gp.courses.length - 1] ?? 'stadium';
  const files = packLoader();
  screens.show('mk8Stack', {
    first: podiumScreen({
      title: cupInfo(gp.cup).name,
      sub: `${gp.engineClass}cc`,
      standings: rows,
      place,
      trophy,
      background: packSprites()(`bg_${last}`),
      load: () => loadIfInPack(podiumFiles(rows.slice(0, 3))),
      file: (path) => files.file(path),
      frozen: openedPaused(),
      onDone: handlers.onQuit,
    }),
    sounds: audioPlayer(),
    onExit: handlers.onQuit,
  });
}

/** Loads the files the pack has of `paths`; nothing without a pack. */
async function loadIfInPack(paths: readonly string[]): Promise<void> {
  const files = packLoader();
  try {
    const manifest = await files.loadManifest();
    const has = new Set(manifest.files.map((e) => e.path));
    await files.loadFiles(paths.filter((path) => has.has(path)));
  } catch (e) {
    if (!(e instanceof PackNotInstalledError || e instanceof PackLockedError)) throw e;
  }
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

/**
 * A scripted Grand Prix scenario's race (MK-130, its `mk8Start` hint): the cup so far, this race
 * on the course it stands for.
 */
function scriptedSetup(state: SimState, hint: string | undefined): Mk8RaceSetup | undefined {
  if (!isScriptedGp(hint)) return undefined;
  const gp = scriptedGpFor(hint);
  const loadout = gp.entrants[0]?.loadout ?? DEFAULT_LOADOUT;
  return raceSetup(
    { mode: 'grand-prix', cup: gp.cup, engineClass: state.engineClass, loadout },
    { ...gp, engineClass: state.engineClass },
  );
}

/**
 * A scenario's race, as if picked in the menus: the Mushroom Cup's first course, its class. A
 * Grand Prix's is the scripted cup's race 1 (MK-130: all 4 courses, MK-121's field).
 */
function scenarioSetup(state: SimState, mode: Mk8GameMode): Mk8RaceSetup {
  const first = MUSHROOM_COURSES[0]?.key ?? 'stadium';
  return raceSetup(
    {
      mode,
      cup: 'mushroom',
      course: first,
      engineClass: state.engineClass,
      loadout: DEFAULT_LOADOUT,
    },
    mode === 'grand-prix' ? { ...scriptedGrandPrix(0), engineClass: state.engineClass } : undefined,
  );
}

/**
 * Loads the next course of the cup (a stand-in needs nothing), then races it. A Grand Prix's next
 * race (`gp`: the cup with this race recorded) is its current course, on the new grid.
 */
async function goNext(
  race: Mk8RaceSetup,
  gp: Mk8GrandPrix | undefined,
  handlers: Mk8ResultsHandlers,
): Promise<void> {
  const key = gp ? currentCourse(gp) : nextCourse(race)?.key;
  if (!key) return handlers.onQuit();
  const content = mk8Course(courseInfo(key).pack);
  try {
    if (content) await loadMk8Course(packLoader(), content);
  } catch (e) {
    // No pack here (or the site's still locked): the course's stand-in.
    if (!(e instanceof PackNotInstalledError || e instanceof PackLockedError)) throw e;
  }
  await prepareRace();
  handlers.onNext(
    raceSetup(
      {
        ...(race.mode ? { mode: race.mode } : {}),
        cup: race.cup,
        course: key,
        engineClass: race.engineClass,
        loadout: race.loadout,
      },
      gp,
    ),
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
