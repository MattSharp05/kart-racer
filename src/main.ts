import * as THREE from 'three';
import { Game } from './game/game';
import { parseLaunchParams } from './game/launchParams';
import { browserStore, readPrefs, recordBests, writePrefs } from './game/storage';
import { installTestApi } from './game/testApi';
import { PlayerInput } from './input/playerInput';
import { ChaseCamera, LineupCamera } from './render/camera';
import { ItemBoxRenderer } from './render/itemBoxes';
import { KartRenderer } from './render/karts';
import { createScene } from './render/scene';
import { createTrackView, overviewCamera } from './render/trackView';
import { scenarios } from './scenarios';
import { attractMode, sunnyLineup } from './scenarios/menus';
import { sunnyRace } from './scenarios/race';
import type { MenuScreen, ScenarioView } from './scenarios/registry';
import { isKartId, KART_IDS, KARTS, type KartId } from './sim/data/karts';
import { raceResults, raceTime } from './sim/raceFlow';
import { getTrack } from './sim/track';
import { tuning, type EngineClass } from './sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type ItemId, type SimState } from './sim/types';
import { showErrorBanner } from './ui/errorBanner';
import { createPauseButton, Menus } from './ui/menus';
import { RaceOverlay } from './ui/raceOverlay';
import { RotatePrompt } from './ui/rotatePrompt';

/** Longest real frame we feed the sim, so a backgrounded tab doesn't cause a huge catch-up. */
const MAX_FRAME_SECONDS = 0.25;
const DEFAULT_SEED = 1;
/** Pause between the player finishing and the results screen, ms. */
const RESULTS_DELAY_MS = 2500;
const AI_RACERS = 7;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = parseLaunchParams(window.location.search);
const store = browserStore();
const prefs = readPrefs(store);
let chosenKart: KartId = prefs.kart && isKartId(prefs.kart) ? prefs.kart : 'maple';
let chosenCc: EngineClass = ([50, 100, 150] as const).find((cc) => cc === prefs.engineClass) ?? 100;
let raceCount = 0;

interface Launch {
  state: SimState;
  scenario?: string;
  view?: ScenarioView;
  follow?: number;
  screen?: MenuScreen;
}

/** Resolves the starting state from the URL: a named scenario, or the title screen. */
function initialState(): Launch {
  if (params.scenario) {
    const scenario = scenarios.get(params.scenario);
    if (scenario) {
      const setup = scenario.setup(params.seed ?? scenario.defaultSeed);
      return {
        state: setup.state,
        scenario: scenario.name,
        view: setup.view ?? 'chase',
        follow: setup.follow ?? 0,
        ...(setup.screen ? { screen: setup.screen } : {}),
      };
    }
    showErrorBanner(
      `Unknown scenario "${params.scenario}". Valid scenarios:`,
      scenarios.list().map((s) => s.name),
    );
  }
  return { state: attractMode(params.seed ?? DEFAULT_SEED), screen: 'title' };
}

const { renderer, scene, camera } = createScene(canvas);
const launch = initialState();
if (params.item) {
  const player = launch.state.karts[0];
  const valid = ['mushroom', 'banana', 'green', 'red', 'star', 'lightning'];
  if (player && valid.includes(params.item)) player.item.held = params.item as ItemId;
  else showErrorBanner(`Unknown item "${params.item}". Valid items:`, valid);
}
if (params.kart) {
  const player = launch.state.karts[0];
  if (player && isKartId(params.kart)) player.kartType = params.kart;
  else showErrorBanner(`Unknown kart "${params.kart}". Valid karts:`, KART_IDS);
}

let playerInput: InputFrame = NEUTRAL_INPUT;
const controls = new PlayerInput();
const game = new Game(launch.state, () => {
  playerInput = controls.read();
  return [playerInput];
});
if (params.paused) game.pause();

// Menus and races all happen on the launch track (Sunny Circuit, unless a scenario says otherwise).
const track = getTrack(launch.state.trackId);
createTrackView(scene, track);
let view: ScenarioView = launch.view ?? 'chase';
let followId = launch.follow ?? 0;
if (view === 'overview') overviewCamera(camera, track);
const lineup = new LineupCamera(camera);
const karts = new KartRenderer(scene);
const chaseCamera = new ChaseCamera(camera);
const itemBoxes = new ItemBoxRenderer(scene);
const raceOverlay = new RaceOverlay();
const menus = new Menus();
let resultsTimer: number | undefined;

// ---- Screens -------------------------------------------------------------------------------

/** Replaces the running state (new race, menu background) and rebuilds the karts. */
function load(state: SimState, nextView: ScenarioView, follow = 0): void {
  window.clearTimeout(resultsTimer);
  game.reset(state);
  karts.reset();
  view = nextView;
  followId = follow;
  raceOverlay.bestNote = '';
  markChanged();
}

function showTitle(): void {
  load(attractMode(DEFAULT_SEED + raceCount), 'chase');
  // An AI race runs behind the title; the "player" kart drives itself too.
  game.setAutopilot(0, true);
  game.resume();
  pauseButton.hidden = true;
  menus.showTitle(showKartSelect);
}

function focusLineupKart(kart: KartId, snap = false): void {
  const index = KART_IDS.indexOf(kart);
  const model = karts.kart(index);
  const position = game.state.karts[index]?.position;
  if (position) {
    lineup.focus(
      model?.position ?? new THREE.Vector3(position.x, position.y, position.z),
      true,
      snap,
    );
  }
  markChanged();
}

function showKartSelect(): void {
  if (menus.current !== 'ccSelect') load(sunnyLineup(DEFAULT_SEED), 'lineup');
  pauseButton.hidden = true;
  game.resume();
  focusLineupKart(chosenKart, true);
  menus.showKartSelect(chosenKart, {
    onChange: (kart) => focusLineupKart(kart),
    onChoose: (kart) => {
      chosenKart = kart;
      showCcSelect();
    },
    onBack: showTitle,
  });
}

function showCcSelect(): void {
  menus.showCcSelect(chosenCc, {
    onChoose: (cc) => {
      chosenCc = cc;
      writePrefs(store, { kart: chosenKart, engineClass: chosenCc });
      startRace();
    },
    onBack: showKartSelect,
  });
}

function startRace(): void {
  raceCount += 1;
  menus.hide();
  load(
    sunnyRace(DEFAULT_SEED + raceCount, {
      karts: 1 + AI_RACERS,
      ai: true,
      engineClass: chosenCc,
      playerKart: chosenKart,
    }),
    'chase',
  );
  game.resume();
  pauseButton.hidden = false;
}

function pauseRace(): void {
  if (menus.current !== 'none' || game.state.phase === 'finished') return;
  game.pause();
  menus.showPause({
    onResume: resumeRace,
    onRestart: startRace,
    onQuit: showTitle,
  });
}

function resumeRace(): void {
  menus.hide();
  game.resume();
}

function showResults(): void {
  const state = game.state;
  const rows = raceResults(state).map((row) => {
    const kart = state.karts[row.kartId];
    return {
      position: row.position,
      name: kart ? KARTS[kart.kartType].name : '?',
      you: row.kartId === 0,
      ...(row.time !== undefined ? { time: row.time } : {}),
    };
  });
  pauseButton.hidden = true;
  menus.showResults(rows, raceOverlay.bestNote, {
    onAgain: startRace,
    onChangeKart: showKartSelect,
    onMenu: showTitle,
  });
}

const pauseButton = createPauseButton(pauseRace);
pauseButton.hidden = launch.screen !== undefined || launch.state.phase === 'free';
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menus.current === 'none' && !pauseButton.hidden) pauseRace();
});

game.onEvents((events, state) => {
  raceOverlay.onEvents(events, state, performance.now());
  const finished = events.find((e) => e.type === 'finish' && e.kartId === 0);
  const player = state.karts[0];
  if (finished && player) {
    const bests = recordBests(
      store,
      state.trackId,
      player.kartType,
      state.engineClass,
      player.race.lapTimes,
      raceTime(state, player.race.finishTick),
    );
    raceOverlay.bestNote = [
      bests.newBestRace && 'New best race time!',
      bests.newBestLap && 'New best lap!',
    ]
      .filter(Boolean)
      .join(' ');
    resultsTimer = window.setTimeout(showResults, RESULTS_DELAY_MS);
  }
});

// ---- Rendering ------------------------------------------------------------------------------

/** Updates karts and camera for this frame, then draws (unless `draw` is false). */
function render(frameSeconds: number, snapCamera = false, draw = true): void {
  karts.sync(game.previousState, game.state, game.alpha, [playerInput]);
  itemBoxes.sync(game.state, game.state.tick / 60);
  const followed = karts.kart(followId);
  const kart = game.state.karts[followId];
  if (view === 'lineup') {
    lineup.update(game.paused ? 0 : frameSeconds);
  } else if (followed && kart && view === 'chase') {
    const speedRatio = Math.abs(kart.speed) / tuning.topSpeed[game.state.engineClass];
    chaseCamera.update(followed, speedRatio, frameSeconds, 0, snapCamera);
  }
  raceOverlay.update(game.state, performance.now(), menus.current !== 'none');
  controls.touch.setActive(menus.current === 'none' && !rotatePrompt.shown);
  if (draw) renderer.render(scene, camera);
}

/**
 * While paused, keep drawing only until the camera has settled, then stop: redrawing an unchanged
 * scene every frame wastes battery (and makes software-rendered CI browsers crawl).
 */
const SETTLE_FRAMES = 30;
let framesSinceChange = 0;
function markChanged(): void {
  framesSinceChange = 0;
}
window.addEventListener('resize', markChanged);

// Phones: landscape only. Portrait shows a prompt and pauses the game until rotated back.
const rotatePrompt = new RotatePrompt(
  () => {
    if (game.paused) return false;
    game.pause();
    return true;
  },
  () => game.resume(),
);
rotatePrompt.onChange = markChanged;

installTestApi(
  game,
  () => {
    // Test/QA fast-forward: snap the scene and camera now; the next animation frame draws it.
    render(0, true, false);
    markChanged();
  },
  launch.scenario,
  () => ({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  }),
);

// Open the launch screen (menus or a direct race).
switch (launch.screen) {
  case 'title':
    menus.showTitle(showKartSelect);
    game.setAutopilot(0, true);
    break;
  case 'kartSelect':
    showKartSelect();
    break;
  case 'ccSelect':
    focusLineupKart(chosenKart, true);
    showCcSelect();
    break;
  case 'paused':
    pauseButton.hidden = false;
    pauseRace();
    break;
  default:
    if (launch.state.phase === 'finished') resultsTimer = window.setTimeout(showResults, 300);
}

if (params.tune) {
  void import('./dev/tuningPanel').then(({ openTuningPanel }) => openTuningPanel());
}

let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const frameSeconds =
    lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;
  game.frame(frameSeconds);
  if (!game.paused || view === 'lineup') markChanged();
  if (framesSinceChange > SETTLE_FRAMES) return;
  framesSinceChange += 1;
  render(frameSeconds);
});
