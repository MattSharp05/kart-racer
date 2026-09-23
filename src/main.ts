import { Game } from './game/game';
import { parseLaunchParams } from './game/launchParams';
import { installTestApi } from './game/testApi';
import { KeyboardInput } from './input/keyboard';
import { KartRenderer } from './render/karts';
import { createScene } from './render/scene';
import { scenarios } from './scenarios';
import { createSimState } from './sim/state';
import type { SimState } from './sim/types';
import { showErrorBanner } from './ui/errorBanner';

/** Longest real frame we feed the sim, so a backgrounded tab doesn't cause a huge catch-up. */
const MAX_FRAME_SECONDS = 0.25;
const DEFAULT_SEED = 1;
const CAMERA_OFFSET = { y: 4, z: 8 };

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

/** Resolves the starting state from the URL: a named scenario, or free-drive by default. */
function initialState(): { state: SimState; scenario?: string; paused: boolean } {
  const params = parseLaunchParams(window.location.search);
  if (params.scenario) {
    const scenario = scenarios.get(params.scenario);
    if (scenario) {
      return {
        state: scenario.setup(params.seed ?? scenario.defaultSeed).state,
        scenario: scenario.name,
        paused: params.paused,
      };
    }
    showErrorBanner(
      `Unknown scenario "${params.scenario}". Valid scenarios:`,
      scenarios.list().map((s) => s.name),
    );
  }
  return { state: createSimState({ seed: params.seed ?? DEFAULT_SEED }), paused: params.paused };
}

const { renderer, scene, camera } = createScene(canvas);
const keyboard = new KeyboardInput();
const launch = initialState();
const game = new Game(launch.state, () => [keyboard.read()]);
if (launch.paused) game.pause();
const karts = new KartRenderer(scene);

function render(): void {
  karts.sync(game.previousState, game.state, game.alpha);
  const focus = karts.focus;
  if (focus) {
    // Temporary follow camera; the real chase camera is MK-5.
    camera.position.set(focus.x, focus.y + CAMERA_OFFSET.y, focus.z + CAMERA_OFFSET.z);
    camera.lookAt(focus);
  }
  renderer.render(scene, camera);
}

installTestApi(game, render, launch.scenario);

let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const frameSeconds =
    lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;
  game.frame(frameSeconds);
  render();
});
