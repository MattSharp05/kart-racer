import * as THREE from 'three';

export const MAX_PIXEL_RATIO = 2;
const SKY_COLOUR = 0x87ceeb;
/** The untouched lights (a track theme sets its own): sky/ground fill and the sun. */
const FILL = { sky: 0xffffff, ground: 0x4a7a3a, intensity: 1.2 };
const SUN = { colour: 0xffffff, intensity: 1.5 };

export interface SceneContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize: () => void;
}

/** Creates the renderer, scene, camera and lights, and keeps them sized to the window. Track visuals are added separately. */
export function createScene(canvas: HTMLCanvasElement): SceneContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
  camera.position.set(0, 4, 8);
  camera.lookAt(0, 0.5, 0);

  scene.add(new THREE.HemisphereLight());
  const sun = new THREE.DirectionalLight();
  sun.position.set(10, 20, 5);
  scene.add(sun);
  defaultLook(scene);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, resize };
}

/** The plain sky and lights (no track theme): the test pad's look, and the base a theme replaces. */
export function defaultLook(scene: THREE.Scene): void {
  scene.background = new THREE.Color(SKY_COLOUR);
  scene.fog = null;
  scene.traverse((object) => {
    if (object instanceof THREE.HemisphereLight) {
      object.color.set(FILL.sky);
      object.groundColor.set(FILL.ground);
      object.intensity = FILL.intensity;
    } else if (object instanceof THREE.DirectionalLight) {
      object.color.set(SUN.colour);
      object.intensity = SUN.intensity;
    }
  });
}
