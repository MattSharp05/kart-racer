import { Game } from './game/game';
import { parseLaunchParams } from './game/launchParams';
import { installTestApi } from './game/testApi';
import { PlayerInput } from './input/playerInput';
import { ChaseCamera, LineupCamera } from './render/camera';
import { KartRenderer } from './render/karts';
import { createScene } from './render/scene';
import { createTrackView, overviewCamera } from './render/trackView';
import { scenarios } from './scenarios';
import type { ScenarioView } from './scenarios/registry';
import { sunnyStart } from './scenarios/tracks';
import { isKartId, KART_IDS } from './sim/data/karts';
import { getTrack } from './sim/track';
import { tuning } from './sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './sim/types';
import { showErrorBanner } from './ui/errorBanner';
import { RaceOverlay } from './ui/raceOverlay';
import { browserStore, recordBests } from './game/storage';
import { raceTime } from './sim/raceFlow';

/** Longest real frame we feed the sim, so a backgrounded tab doesn't cause a huge catch-up. */
const MAX_FRAME_SECONDS = 0.25;
const DEFAULT_SEED = 1;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = parseLaunchParams(window.location.search);

/** Resolves the starting state from the URL: a named scenario, or free-drive on the test pad. */
function initialState(): {
  state: SimState;
  scenario?: string;
  view?: ScenarioView;
  follow?: number;
} {
  if (params.scenario) {
    const scenario = scenarios.get(params.scenario);
    if (scenario) {
      const setup = scenario.setup(params.seed ?? scenario.defaultSeed);
      return {
        state: setup.state,
        scenario: scenario.name,
        view: setup.view ?? 'chase',
        follow: setup.follow ?? 0,
      };
    }
    showErrorBanner(
      `Unknown scenario "${params.scenario}". Valid scenarios:`,
      scenarios.list().map((s) => s.name),
    );
  }
  // No scenario: free drive on Sunny Circuit.
  return { state: sunnyStart(params.seed ?? DEFAULT_SEED) };
}

const { renderer, scene, camera } = createScene(canvas);

const launch = initialState();
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

const track = getTrack(launch.state.trackId);
createTrackView(scene, track);
const overview = launch.view === 'overview' ? overviewCamera(camera, track) : false;
const lineup = launch.view === 'lineup' ? new LineupCamera(camera) : undefined;
const karts = new KartRenderer(scene);
const chaseCamera = new ChaseCamera(camera);
const raceOverlay = new RaceOverlay();
const store = browserStore();
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
  }
});

/** Updates karts and camera for this frame, then draws (unless `draw` is false). */
function render(frameSeconds: number, snapCamera = false, draw = true): void {
  karts.sync(game.previousState, game.state, game.alpha, [playerInput]);
  const followId = launch.follow ?? 0;
  const player = karts.kart(followId);
  const kart = game.state.karts[followId];
  if (lineup) {
    lineup.update(game.paused ? 0 : frameSeconds);
  } else if (player && kart && !overview) {
    const speedRatio = Math.abs(kart.speed) / tuning.topSpeed[game.state.engineClass];
    chaseCamera.update(player, speedRatio, frameSeconds, 0, snapCamera);
  }
  raceOverlay.update(game.state, performance.now());
  if (draw) renderer.render(scene, camera);
}

/**
 * While paused, keep drawing only until the camera has settled, then stop: redrawing an unchanged
 * scene every frame wastes battery (and makes software-rendered CI browsers crawl).
 */
const SETTLE_FRAMES = 30;
let framesSinceChange = 0;
const markChanged = () => (framesSinceChange = 0);
window.addEventListener('resize', markChanged);

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

if (params.tune) {
  void import('./dev/tuningPanel').then(({ openTuningPanel }) => openTuningPanel());
}

let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const frameSeconds =
    lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;
  game.frame(frameSeconds);
  if (!game.paused) markChanged();
  if (framesSinceChange > SETTLE_FRAMES) return;
  framesSinceChange += 1;
  render(frameSeconds);
});
