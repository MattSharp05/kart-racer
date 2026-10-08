// MK8 Mode's entry point (MK-97, ADR 0009): its own chunk, imported only when the player picks MK8
// Mode on the title (or opens an `mk8-*` scenario). Registers MK8 content, loads the pack's UI
// group behind a progress bar, then shows MK8 Mode's first screen.
import { trackLoad } from '../game/pending';
import { browserStore, type KeyValueStore } from '../game/storage/store';
import { showErrorBanner } from '../ui/errorBanner';
import type { Router } from '../ui/router';
import { installMk8ItemSounds } from './audio/itemSoundSkin';
import { installMk8KartSounds } from './audio/kartSoundSkin';
import { KART_SAMPLES } from './audio/kartSounds';
import { Mk8AudioPlayer } from './audio/player';
import { installMk8Voices } from './audio/voiceSkin';
import { courseInfo } from './content/cups';
import { raceSetup, type Mk8RaceSetup } from './flow';
import { soundPath, type SoundId } from './audio/soundIds';
import { parseVoiceIndex, voiceClips, VOICES_PATH, type VoiceSoundId } from './audio/voices';
import { MK8_RACER_VIEWS } from './content/racers/render';
import {
  mk8Login,
  Mk8Loader,
  PackLockedError,
  PackNotInstalledError,
  type LoaderOptions,
} from './loader';
import { mk8Course } from './content/courses';
import { loadMk8Course } from './courses';
import { registerMk8Content } from './register';
import { mk8RoomContent } from './online';
import type { Mk8RoomContent } from '../game/roomFlow';
import {
  STAGE_DEMOS,
  buildDemo,
  demoFiles,
  type StageDemoId,
  type StageHooks,
} from './render/demos';
import { previewFiles } from './render/preview';
import { Mk8Stage } from './render/stage';
import { prepareMk8Items } from './render/items';
import { prepareRaceKarts, raceKartHooks, useRaceKartFiles } from './render/raceKarts';
import { MK8_RACERS } from './content/racers';
import type { KartState } from '../sim/types';
import { styleGuide, type SpriteSource } from './ui/kit/styleGuide';
import { Progress } from './ui/loading';
import './ui/password';
import type { PreviewHooks } from './ui/screens/characterSelect';
import { Mk8ScreenFlow } from './ui/screens';
import { installMk8Hud, type HudHooks } from './ui/hud';
import type { Mk8Context, Mk8Flow, Mk8Loadout, Mk8Screen } from './ui/screens/session';
import { sprite } from './ui/sprites';
import './ui/stack';
import './ui/stage';

/** What MK8 Mode needs from the game: the screen router, and the way back to the title. */
export interface Mk8Host {
  screens: Router;
  /** Leaves MK8 Mode for the original title screen. */
  exit(): void;
  /** The game's mute setting (M key / Settings); MK8 sounds follow it. */
  isMuted?: () => boolean;
  /** Leaves the menus for a race (MK-119: the cup/course select's choice, its course loaded). */
  startRace?: (setup: Mk8RaceSetup) => void;
  /** Where picks are remembered (MK-117); the browser's storage by default. */
  store?: KeyValueStore;
  /** Online (MK-132): the game's rooms, as MK8 rooms racing `loadout`. */
  openRoom?: (loadout: Mk8Loadout) => void;
}

declare global {
  interface Window {
    /**
     * MK8 Mode's test hooks: every sound id (and, MK-117, voice line) the player was asked to
     * play (MK-104), what the menus have chosen so far (MK-116), the model stage's demo (MK-101)
     * and the character select's 3D portrait (MK-117).
     */
    __mk8?: {
      sounds: (SoundId | VoiceSoundId)[];
      flow?: Mk8Flow;
      stage?: StageHooks;
      preview?: PreviewHooks;
      /** The race HUD (MK-127). */
      hud?: HudHooks;
      /** Racers whose pack models were built for races (MK-136). */
      raceKarts?: ReturnType<typeof raceKartHooks>;
    };
  }
}

/**
 * How MK8 Mode opens: `load` (the menu button) loads the pack, then shows the MK8 title; the
 * `mk8-loading` and `mk8-not-installed` scenarios show those screens without fetching anything;
 * `ui-kit` (the `mk8-ui-kit` scenario) shows the UI kit's style guide; `password` (the
 * `mk8-password` scenario, MK-135) asks for the site's pack password first (`course-password`,
 * MK-105: then reloads the page, an MK8 course scenario opened before logging in). A `StageDemoId`
 * (MK-101's scenarios) loads those models and shows them on the 3D stage. Any other start is a
 * menu screen's (its `starts`, MK-142: `title`, `mode`, `char`, `kart`, `cc`, `cup`, `course`…):
 * that screen over the ones that lead there, with the pack's sprites if it has one and stand-ins
 * otherwise.
 */
export type Mk8Start =
  | 'load'
  | 'loading-demo'
  | 'not-installed'
  | 'ui-kit'
  | 'password'
  | 'course-password'
  | StageDemoId
  | Mk8ScreenStart;

/** A menu screen's scenario start (`Mk8Screen.starts`), checked when MK8 Mode opens. */
export type Mk8ScreenStart = string & Record<never, never>;

/** The menus' screens in flow order (`ui/screens/order.ts`). */
const screenFlow = new Mk8ScreenFlow();

// MK8 races draw MK8's HUD (MK-127) with the pack's sprites where it has them.
installMk8Hud({
  loadSprites: async () => {
    const files = packLoader();
    await loadPackIfThere(files);
    await loadFontsIfThere();
    return packSprites(files);
  },
  play: (id) => audioPlayer().play(id),
  expose: (hud) => (window.__mk8 = { sounds: [], ...window.__mk8, hud }),
});

// MK8 races' item sounds (MK-129) from the pack, over our synth's.
installMk8ItemSounds(() => audioPlayer());
// Racers' voice lines in MK8 races (MK-110), loaded when a race starts.
installMk8Voices(
  () => audioPlayer(),
  (ids) => packLoader().loadVoices(ids),
);
// MK8 racers drawn from the pack in races (MK-136), their files from the page's loader.
useRaceKartFiles(() => packLoader());
window.__mk8 = { sounds: [], ...window.__mk8, raceKarts: raceKartHooks() };
// MK8 races' engines, drift and terrain (MK-111): loaded with the race (`loadKartSounds`). Last:
// its skin wraps the others and passes their frame updates on.
installMk8KartSounds(() => audioPlayer());

/** Where the `mk8-loading` scenario holds the bar. */
const DEMO_PROGRESS = 0.5;
const LOADING_LABEL = 'Loading MK8 Mode';
const FONT_CSS = '/mk8/fonts/fonts.css';
/** The course's share of the course loading bar; the item models are the rest. */
const COURSE_SHARE = 0.8;
/** The UI font's weights MK8 Mode uses. */
const FONT_FACES = ["800 1em 'M PLUS Rounded 1c'", "900 1em 'M PLUS Rounded 1c'"];

let loader: Mk8Loader | undefined;
let player: Mk8AudioPlayer | undefined;
let muted: () => boolean = () => false;

/** The page's one loader, so files loaded once stay loaded when MK8 Mode is opened again. */
export function packLoader(options: LoaderOptions = { loadFonts }): Mk8Loader {
  loader ??= new Mk8Loader(options);
  return loader;
}

/** The page's one sampled-audio player, playing what the loader holds. */
export function audioPlayer(): Mk8AudioPlayer {
  if (!player) {
    const files = packLoader();
    player = new Mk8AudioPlayer({ file: (path) => files.file(path), isMuted: () => muted() });
    window.__mk8 = { ...window.__mk8, sounds: player.played };
  }
  return player;
}

/** Opens MK8 Mode over the game. Resolves once its first screen shows (or a load failed). */
export function start(host: Mk8Host, mode: Mk8Start = 'load'): Promise<void> {
  registerMk8Content();
  const { screens } = host;
  if (host.isMuted) muted = host.isMuted;
  let left = false;
  let banner: HTMLElement | undefined;
  const back = () => {
    left = true;
    banner?.remove();
    host.exit();
  };
  if (mode === 'ui-kit') return trackLoad(openUiKit(host, back));
  const deep = screenFlow.start(mode);
  if (deep) {
    return trackLoad(openMenus(host, back, deep.screens, { optionalPack: true, flow: deep.flow }));
  }
  if (mode in STAGE_DEMOS) {
    const id = mode as StageDemoId;
    const open = async (): Promise<void> => {
      try {
        await openStage(host, id, () => left, back);
      } catch (e) {
        if (left) return;
        banner = showErrorBanner(
          "Couldn't load the MK8 pack",
          [e instanceof Error ? e.message : String(e)],
          { label: 'Retry', onClick: () => void trackLoad(open()) },
        );
      }
    };
    return trackLoad(open());
  }
  if (mode === 'not-installed') {
    screens.show('mk8NotInstalled', { onBack: back });
    return Promise.resolve();
  }
  if (mode === 'loading-demo') {
    screens.show('mk8Loading', {
      label: LOADING_LABEL,
      progress: new Progress(DEMO_PROGRESS),
      onBack: back,
    });
    return Promise.resolve();
  }

  const load = async (): Promise<void> => {
    const progress = new Progress(0);
    screens.show('mk8Loading', { label: LOADING_LABEL, progress, onBack: back });
    try {
      await packLoader().loadUi((fraction) => progress.set(fraction));
      if (!left) await openMenus(host, back);
    } catch (e) {
      if (left) return;
      if (e instanceof PackNotInstalledError) {
        screens.show('mk8NotInstalled', { onBack: back });
        return;
      }
      if (e instanceof PackLockedError) {
        askPassword();
        return;
      }
      banner = showErrorBanner(
        "Couldn't load the MK8 pack",
        [e instanceof Error ? e.message : String(e)],
        { label: 'Retry', onClick: () => void trackLoad(load()) },
      );
    }
  };
  // The site's pack answered 401 (MK-135): the password sets the session cookie, then load again.
  const askPassword = () =>
    screens.show('mk8Password', {
      onBack: back,
      onSubmit: async (password) => {
        const result = await mk8Login(password);
        if (result === 'ok' && !left) void trackLoad(load());
        return result;
      },
    });
  if (mode === 'password') {
    askPassword();
    return Promise.resolve();
  }
  // An MK8 course scenario on the site, pack still locked (MK-105): after the password, the
  // scenario again (its course loads before the scenario is set up).
  if (mode === 'course-password') {
    screens.show('mk8Password', {
      onBack: back,
      onSubmit: async (password) => {
        const result = await mk8Login(password);
        if (result === 'ok' && !left) location.reload();
        return result;
      },
    });
    return Promise.resolve();
  }
  if (mode !== 'load') return Promise.reject(new Error(`Unknown MK8 start: ${mode}`));
  return trackLoad(load());
}

/**
 * Gets a race with MK8 items ready (MK-103): registers MK8 content (the `mk8` item set) and loads
 * the pack's item models; without a pack the race draws our items. MK-136: also the racers'
 * models in their karts, for `karts` (by default every racer in their default kart, the race's
 * field not being drawn yet); without a pack the race draws the stand-ins.
 */
export async function prepareRace(
  karts: readonly Pick<KartState, 'kartType' | 'loadout'>[] = defaultField(),
): Promise<void> {
  registerMk8Content();
  await Promise.all([prepareMk8Items(packLoader()), prepareRaceKarts(packLoader(), karts)]);
  await loadKartSounds();
}

/**
 * The karts `setup` races (MK-136: a VS Race's, Grand Prix's or Time Trial's field); without one,
 * every racer in their default kart and the player's.
 */
export function raceKartsOf(setup: Mk8RaceSetup): Pick<KartState, 'kartType' | 'loadout'>[] {
  if (!setup.field) return defaultField(setup.loadout);
  return setup.field.map((slot) => ({
    kartType: slot.kartId,
    ...(slot.loadout ? { loadout: slot.loadout } : {}),
  }));
}

/** Every MK8 racer in their default kart, plus the player's `loadout` when given. */
function defaultField(loadout?: Mk8Loadout): Pick<KartState, 'kartType' | 'loadout'>[] {
  return [
    ...MK8_RACERS.map((racer) => ({ kartType: racer.id })),
    ...(loadout ? [{ kartType: loadout.racer, loadout }] : []),
  ];
}

let kartSounds: Promise<void> | undefined;

/**
 * The bank's kart, terrain and drift sounds the pack has (MK-111), once per page; without a pack
 * our synth plays them, so this never rejects.
 */
export function loadKartSounds(): Promise<void> {
  kartSounds ??= loadIfThere(KART_SAMPLES.map(soundPath)).catch(() => undefined);
  return kartSounds;
}

/**
 * MK8 Mode's menus (MK-116): the title, and any screens over it (`then`, a scenario starting
 * deeper in). The pack is loaded by now, unless `optionalPack` (a scenario: no pack shows
 * stand-ins). Every opening starts a fresh flow (a scenario's `flow`: the choices made on the
 * way to its screen).
 */
async function openMenus(
  host: Mk8Host,
  onExit: () => void,
  then: readonly Mk8Screen[] = [],
  { optionalPack = false, flow: start = {} as Mk8Flow } = {},
): Promise<void> {
  const files = packLoader();
  if (optionalPack) await loadPackIfThere(files);
  await loadFontsIfThere();
  const flow: Mk8Flow = { ...start };
  const ctx: Mk8Context = {
    sprites: packSprites(files),
    flow,
    files: { load: (paths) => files.loadFiles(paths), file: (path) => files.file(path) },
    loadCourse: (course, onProgress) =>
      loadCourse(files, courseInfo(course).pack, onProgress, () => menuRaceKarts(flow)),
    startRace: (setup) => host.startRace?.(setup),
    packFile: (path) => files.file(path),
    frozen: openedPaused(),
    loadCharacters: (first, onFirst) => loadCharacters(files, first, onFirst),
    store: host.store ?? browserStore(),
    next: (from) => screenFlow.next(from, flow).build(ctx),
    ...(host.openRoom ? { openRoom: host.openRoom } : {}),
  };
  const sounds = audioPlayer();
  if (window.__mk8) window.__mk8.flow = flow;
  host.screens.show('mk8Stack', {
    first: screenFlow.first().build(ctx),
    then: then.map((screen) => screen.build(ctx)),
    sounds,
    onExit,
  });
}

/**
 * A course's pack files, then the race's item models (MK-119), on one bar. A course with content
 * (MK-105: Mario Kart Stadium) registers its track and model; without a pack (or a locked one, or
 * a course not drivable yet) there is nothing to load and the race runs on the course's stand-in
 * track with our item models.
 */
async function loadCourse(
  files: Mk8Loader,
  pack: string,
  onProgress: (fraction: number) => void,
  karts: () => Pick<KartState, 'kartType' | 'loadout'>[] = () => defaultField(),
): Promise<void> {
  const content = mk8Course(pack);
  try {
    if (content) await loadMk8Course(files, content, (f) => onProgress(f * COURSE_SHARE));
    else await files.loadCourse(pack, (f) => onProgress(f * COURSE_SHARE));
  } catch (e) {
    // No pack here, or (MK-135) the site's pack still locked: the stand-in.
    if (!(e instanceof PackNotInstalledError || e instanceof PackLockedError)) throw e;
  }
  onProgress(COURSE_SHARE);
  // After the course: its own track registered, the setup's field is the race's (MK-136).
  await prepareRace(karts());
  onProgress(1);
}

/** The karts the race the menus' choices make will race; every racer when it can't be made. */
function menuRaceKarts(flow: Mk8Flow): Pick<KartState, 'kartType' | 'loadout'>[] {
  try {
    return raceKartsOf(raceSetup(flow));
  } catch {
    return defaultField(flow.loadout);
  }
}

/**
 * The character select's files (MK-117): the voice index, then racer `first`'s model, kart and
 * select voice lines (then `onFirst`), then every other racer's. Files the pack hasn't got are skipped (the
 * portrait stays 2D, the voice silent); no pack rejects.
 */
async function loadCharacters(
  files: Mk8Loader,
  first: string,
  onFirst?: () => void,
): Promise<void> {
  const manifest = await files.loadManifest();
  const has = new Set(manifest.files.map((e) => e.path));
  const inPack = (paths: string[]) => [...new Set(paths)].filter((path) => has.has(path));
  await files.loadFiles(inPack([VOICES_PATH]));
  const indexBytes = files.file(VOICES_PATH);
  const index = indexBytes ? parseVoiceIndex(indexBytes) : undefined;
  const filesOf = (models: string[]) => [
    ...models.flatMap((model) => previewFiles({ model })),
    ...(index ? voiceClips(index, models, 'select') : []),
  ];
  const others = MK8_RACER_VIEWS.map((v) => v.model).filter((model) => model !== first);
  await files.loadFiles(inPack(filesOf([first])));
  onFirst?.();
  await files.loadFiles(inPack(filesOf(others)));
}

/** Loads the files of `paths` the pack has (MK-111); rejects without a pack. */
async function loadIfThere(paths: readonly string[]): Promise<void> {
  const files = packLoader();
  const manifest = await files.loadManifest();
  const has = new Set(manifest.files.map((e) => e.path));
  await files.loadFiles(paths.filter((path) => has.has(path)));
}

async function loadPackIfThere(files: Mk8Loader): Promise<void> {
  try {
    await files.loadUi();
  } catch {
    // No pack (CI, previews, production): stand-ins and synthesized sounds.
  }
}

async function loadFontsIfThere(): Promise<void> {
  try {
    await loadFonts();
  } catch {
    // The fallback fonts in kit.css.
  }
}

/** The style guide (MK-104): over the pack's sprites when there is a pack, stand-ins otherwise. */
async function openUiKit(host: Mk8Host, onExit: () => void): Promise<void> {
  const files = packLoader();
  await loadPackIfThere(files);
  await loadFontsIfThere();
  host.screens.show('mk8Stack', {
    first: styleGuide(packSprites(files)),
    sounds: audioPlayer(),
    onExit,
  });
}

/** Whether the page was opened paused (`&paused=1`): the stage then holds still for tests. */
const openedPaused = () => new URLSearchParams(location.search).get('paused') === '1';

/**
 * A model scenario (MK-101): loads its racer, kart and Lakitu models behind the loading bar, then
 * shows them on the 3D stage. No pack → "not installed", as the menu button does; other failures
 * (a file missing or unreadable) throw, for the caller's Retry banner.
 */
async function openStage(
  host: Mk8Host,
  id: StageDemoId,
  hasLeft: () => boolean,
  onBack: () => void,
): Promise<void> {
  const { screens } = host;
  const progress = new Progress(0);
  screens.show('mk8Loading', { label: LOADING_LABEL, progress, onBack });
  const files = packLoader();
  try {
    await files.loadFiles(demoFiles(id), (fraction) => progress.set(fraction));
  } catch (e) {
    if (hasLeft()) return;
    if (e instanceof PackNotInstalledError) {
      screens.show('mk8NotInstalled', { onBack });
      return;
    }
    throw e;
  }
  if (hasLeft()) return;
  const stage = new Mk8Stage(openedPaused());
  const overlay = document.createElement('div');
  let built: Awaited<ReturnType<typeof buildDemo>>;
  try {
    built = await buildDemo(id, stage, (path) => files.file(path), overlay);
  } catch (e) {
    stage.dispose();
    throw e;
  }
  if (hasLeft()) {
    built.dispose();
    stage.dispose();
    return;
  }
  screens.show('mk8Stage', {
    title: STAGE_DEMOS[id].title,
    mount: (el) => {
      el.append(stage.canvas, overlay);
      stage.start(built.demo);
      window.__mk8 = { sounds: [], ...window.__mk8, stage: built.hooks };
      return () => {
        if (window.__mk8?.stage === built.hooks) delete window.__mk8.stage;
        built.dispose();
        stage.dispose();
        overlay.remove();
      };
    },
    onBack,
  });
}

/** Sprite URLs from the loaded pack's bytes (no second fetch); undefined when it hasn't got one. */
function packSprites(files: Mk8Loader): SpriteSource {
  const urls = new Map<string, string | undefined>();
  return (id) => {
    if (!urls.has(id)) {
      const bytes = files.file(sprite(id).file);
      urls.set(id, bytes && URL.createObjectURL(new Blob([bytes], { type: 'image/webp' })));
    }
    return urls.get(id);
  };
}

/** Loads the OFL UI font from `public/mk8/fonts/` (shipped with the game, not part of the pack). */
async function loadFonts(): Promise<void> {
  if (!document.querySelector(`link[href="${FONT_CSS}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = FONT_CSS;
    const loaded = new Promise<void>((resolve, reject) => {
      link.onload = () => resolve();
      link.onerror = () => {
        link.remove();
        reject(new Error(`Couldn't load ${FONT_CSS}`));
      };
    });
    document.head.append(link);
    await loaded;
  }
  await Promise.all(FONT_FACES.map((face) => document.fonts.load(face)));
}

/** MK8 rooms (MK-132): MK8 Mode's courses, racers and karts for the game's room lobby. */
export function roomContent(local: boolean): Mk8RoomContent {
  return mk8RoomContent(packLoader(), { local });
}
