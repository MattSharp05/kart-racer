import { Game } from './game/game';
import { parseLaunchParams } from './game/launchParams';
import { installTestApi } from './game/testApi';
import { KeyboardInput } from './input/keyboard';
import { ChaseCamera } from './render/camera';
import { KartRenderer } from './render/karts';
import { createScene } from './render/scene';
import { createTrackView } from './render/trackView';
import { scenarios } from './scenarios';
import { createSimState } from './sim/state';
import { getTrack } from './sim/track';
import { tuning } from './sim/tuning';
import { NEUTRAL_INPUT, type InputFrame, type SimState } from './sim/types';
import { showErrorBanner } from './ui/errorBanner';

/** Longest real frame we feed the sim, so a backgrounded tab doesn't cause a huge catch-up. */
const MAX_FRAME_SECONDS = 0.25;
const DEFAULT_SEED = 1;

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const params = parseLaunchParams(window.location.search);

/** Resolves the starting state from the URL: a named scenario, or free-drive on the test pad. */
function initialState(): { state: SimState; scenario?: string } {
  if (params.scenario) {
    const scenario = scenarios.get(params.scenario);
    if (scenario) {
      return {
        state: scenario.setup(params.seed ?? scenario.defaultSeed).state,
        scenario: scenario.name,
      };
    }
    showErrorBanner(
      `Unknown scenario "${params.scenario}". Valid scenarios:`,
      scenarios.list().map((s) => s.name),
    );
  }
  return { state: createSimState({ seed: params.seed ?? DEFAULT_SEED }) };
}

const { renderer, scene, camera } = createScene(canvas);
const keyboard = new KeyboardInput();
const launch = initialState();

let playerInput: InputFrame = NEUTRAL_INPUT;
const game = new Game(launch.state, () => {
  playerInput = keyboard.read();
  return [playerInput];
});
if (params.paused) game.pause();

createTrackView(scene, getTrack(launch.state.trackId));
const karts = new KartRenderer(scene);
const chaseCamera = new ChaseCamera(camera);

function render(frameSeconds: number): void {
  karts.sync(game.previousState, game.state, game.alpha, [playerInput]);
  const player = karts.player;
  const kart = game.state.karts[0];
  if (player && kart) {
    const speedRatio = Math.abs(kart.speed) / tuning.topSpeed[game.state.engineClass];
    chaseCamera.update(player, speedRatio, frameSeconds);
  }
  renderer.render(scene, camera);
}

installTestApi(game, () => render(0), launch.scenario);

if (params.tune) {
  void import('./dev/tuningPanel').then(({ openTuningPanel }) => openTuningPanel());
}

let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const frameSeconds =
    lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;
  game.frame(frameSeconds);
  render(frameSeconds);
});
