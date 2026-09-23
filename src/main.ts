import { Game } from './game/game';
import { installTestApi } from './game/testApi';
import { KeyboardInput } from './input/keyboard';
import { KartRenderer } from './render/karts';
import { createScene } from './render/scene';
import { createSimState } from './sim/state';

/** Longest real frame we feed the sim, so a backgrounded tab doesn't cause a huge catch-up. */
const MAX_FRAME_SECONDS = 0.25;
const DEFAULT_SEED = 1;
const CAMERA_OFFSET = { y: 4, z: 8 };

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const { renderer, scene, camera } = createScene(canvas);
const keyboard = new KeyboardInput();
const game = new Game(createSimState({ seed: DEFAULT_SEED }), () => [keyboard.read()]);
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

installTestApi(game, render);

let lastTime: number | undefined;
renderer.setAnimationLoop((time) => {
  const frameSeconds =
    lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = time;
  game.frame(frameSeconds);
  render();
});
