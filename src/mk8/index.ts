// MK8 Mode's entry point (MK-97, ADR 0009): its own chunk, imported only when the player picks MK8
// Mode on the title (or opens an `mk8-*` scenario). Registers MK8 content, loads the pack's UI
// group behind a progress bar, then shows MK8 Mode's first screen.
import { trackLoad } from '../game/pending';
import { showErrorBanner } from '../ui/errorBanner';
import type { Router } from '../ui/router';
import { Mk8AudioPlayer } from './audio/player';
import type { SoundId } from './audio/soundIds';
import { Mk8Loader, PackNotInstalledError, type LoaderOptions } from './loader';
import { registerMk8Content } from './register';
import {
  STAGE_DEMOS,
  buildDemo,
  demoFiles,
  type StageDemoId,
  type StageHooks,
} from './render/demos';
import { Mk8Stage } from './render/stage';
import { prepareMk8Items } from './render/items';
import { styleGuide, type SpriteSource } from './ui/kit/styleGuide';
import { Progress } from './ui/loading';
import { modeSelect } from './ui/screens/modeSelect';
import type { Mk8Context, Mk8Flow } from './ui/screens/session';
import { titleScreen } from './ui/screens/title';
import { sprite } from './ui/sprites';
import type { Mk8ScreenFactory } from './ui/stack';
import './ui/stack';
import './ui/stage';

/** What MK8 Mode needs from the game: the screen router, and the way back to the title. */
export interface Mk8Host {
  screens: Router;
  /** Leaves MK8 Mode for the original title screen. */
  exit(): void;
  /** The game's mute setting (M key / Settings); MK8 sounds follow it. */
  isMuted?: () => boolean;
}

declare global {
  interface Window {
    /**
     * MK8 Mode's test hooks: every sound id the player was asked to play (MK-104), what the menus
     * have chosen so far (MK-116), and the model stage's demo (MK-101).
     */
    __mk8?: { sounds: SoundId[]; flow?: Mk8Flow; stage?: StageHooks };
  }
}

/**
 * How MK8 Mode opens: `load` (the menu button) loads the pack, then shows the MK8 title; the
 * `mk8-loading` and `mk8-not-installed` scenarios show those screens without fetching anything;
 * `ui-kit` (the `mk8-ui-kit` scenario) shows the UI kit's style guide, and `title` / `mode` (the
 * `mk8-ui-title` / `mk8-ui-mode` scenarios, MK-116) the title or the mode select, with the pack's
 * sprites if it has one and stand-ins otherwise. A `StageDemoId` (MK-101's scenarios) loads those
 * models and shows them on the 3D stage.
 */
export type Mk8Start =
  'load' | 'loading-demo' | 'not-installed' | 'ui-kit' | 'title' | 'mode' | StageDemoId;

/** Where the `mk8-loading` scenario holds the bar. */
const DEMO_PROGRESS = 0.5;
const LOADING_LABEL = 'Loading MK8 Mode';
const FONT_CSS = '/mk8/fonts/fonts.css';
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
  if (mode === 'title' || mode === 'mode') {
    return trackLoad(
      openMenus(host, back, mode === 'mode' ? [modeSelect] : [], { optionalPack: true }),
    );
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
  const progress = new Progress(mode === 'loading-demo' ? DEMO_PROGRESS : 0);
  screens.show('mk8Loading', { label: LOADING_LABEL, progress, onBack: back });
  if (mode === 'loading-demo') return Promise.resolve();

  const load = async (): Promise<void> => {
    try {
      await packLoader().loadUi((fraction) => progress.set(fraction));
      if (!left) await openMenus(host, back);
    } catch (e) {
      if (left) return;
      if (e instanceof PackNotInstalledError) {
        screens.show('mk8NotInstalled', { onBack: back });
        return;
      }
      banner = showErrorBanner(
        "Couldn't load the MK8 pack",
        [e instanceof Error ? e.message : String(e)],
        { label: 'Retry', onClick: () => void trackLoad(load()) },
      );
    }
  };
  return trackLoad(load());
}

/**
 * Gets a race with MK8 items ready (MK-103): registers MK8 content (the `mk8` item set) and loads
 * the pack's item models; without a pack the race draws our items.
 */
export async function prepareRace(): Promise<void> {
  registerMk8Content();
  await prepareMk8Items(packLoader());
}

/**
 * MK8 Mode's menus (MK-116): the title, and any screens over it (`then`, a scenario starting
 * deeper in). The pack is loaded by now, unless `optionalPack` (a scenario: no pack shows
 * stand-ins). Every opening starts a fresh flow.
 */
async function openMenus(
  host: Mk8Host,
  onExit: () => void,
  then: readonly ((ctx: Mk8Context) => Mk8ScreenFactory)[] = [],
  { optionalPack = false } = {},
): Promise<void> {
  const files = packLoader();
  if (optionalPack) await loadPackIfThere(files);
  await loadFontsIfThere();
  const flow: Mk8Flow = {};
  const ctx: Mk8Context = { sprites: packSprites(files), flow };
  const sounds = audioPlayer();
  if (window.__mk8) window.__mk8.flow = flow;
  host.screens.show('mk8Stack', {
    first: titleScreen(ctx),
    then: then.map((screen) => screen(ctx)),
    sounds,
    onExit,
  });
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
