import * as THREE from 'three';
import { createScene } from './render/scene';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Missing #game canvas');

const { renderer, scene, camera } = createScene(canvas);

// Placeholder until the game loop and karts arrive (MK-2, MK-5).
const box = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshLambertMaterial({ color: 0xe63946 }),
);
box.position.y = 0.5;
scene.add(box);

renderer.setAnimationLoop((time) => {
  box.rotation.y = time / 1000;
  renderer.render(scene, camera);
});
