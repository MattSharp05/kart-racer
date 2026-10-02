// MK-92 anti-gravity spike page: `/?spike=antigrav`. Loads the synthetic course (or, with
// `&course=<id>`, a real course's `collision.bin` from `pnpm mk8:build`), draws the collision
// coloured by surface and drives one surface-frame kart with keyboard or touch.
// `&auto=1` drives on the autopilot (synthetic course only); `&paused=1` starts paused for tests.
// Prototype code: not the game, and not built on the game loop.
import * as THREE from 'three';
import { PlayerInput } from '../../input/playerInput';
import { Autopilot } from './autopilot';
import {
  CollisionWorld,
  collisionFromObj,
  guessMaterials,
  readCollision,
  SURFACES,
  type CollisionMesh,
} from './collision';
import { syntheticCourse, SYNTHETIC_COURSE_ID, type SyntheticCourse } from './course';
import { makeKart, probeGround, rightOf, speedOf, stepKart, SPIKE_TUNING } from './kart';
import { parseObj } from './obj';
import { addScaled, type V3 } from './vec';
import './spike.css';

/** Short names for real courses (`&course=stadium`). */
const COURSE_ALIASES: Record<string, string> = { stadium: 'mario-kart-stadium' };

const SURFACE_COLOURS: Record<string, number> = {
  road: 0x6b6f78,
  offroad: 0x4f9a3a,
  boost: 0xff9b1a,
  wall: 0xd8d8e0,
  water: 0x2f7fd8,
  antigrav: 0x2ad4ff,
  glide: 0xc070ff,
  void: 0x000000,
};

interface Loaded {
  mesh: CollisionMesh;
  course: SyntheticCourse | null;
  label: string;
}

/** Where `pnpm dev` serves `pnpm mk8:build`'s output (`$MK8_OUT` at `/mk8/`, vite.config.ts). */
const collisionUrl = (id: string) => `/mk8/models/courses/${id}/collision.bin`;

async function loadCourse(courseParam: string | null): Promise<Loaded> {
  if (courseParam && courseParam !== SYNTHETIC_COURSE_ID) {
    const id = COURSE_ALIASES[courseParam] ?? courseParam;
    const response = await fetch(collisionUrl(id));
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || type.includes('text/html'))
      throw new Error(
        `No collision for "${id}" at ${collisionUrl(id)}. Put the course OBJ in .mk8-raw/models/${id}/, ` +
          'run `pnpm mk8:build`, and open this page under `pnpm dev`.',
      );
    return {
      mesh: readCollision(new Uint8Array(await response.arrayBuffer())),
      course: null,
      label: id,
    };
  }
  const course = syntheticCourse();
  const obj = parseObj(course.obj);
  return {
    mesh: collisionFromObj(obj, guessMaterials(obj.materials)),
    course,
    label: SYNTHETIC_COURSE_ID,
  };
}

/** A real course has no route yet: start above the road triangle nearest the mesh's centre. */
function realStart(world: CollisionWorld): { position: V3; forward: V3; up: V3 } {
  const { gridMin, gridDims, cellSize, positions, surfaces } = world.mesh;
  const centre: V3 = [0, 1, 2].map(
    (a) => (gridMin[a] ?? 0) + ((gridDims[a] ?? 0) * cellSize) / 2,
  ) as V3;
  const road = SURFACES.indexOf('road');
  let best = 0;
  let bestD = Infinity;
  for (let t = 0; t < surfaces.length; t++) {
    if (surfaces[t] !== road) continue;
    const dx = (positions[t * 9] ?? 0) - centre[0];
    const dz = (positions[t * 9 + 2] ?? 0) - centre[2];
    if (dx * dx + dz * dz < bestD) {
      bestD = dx * dx + dz * dz;
      best = t;
    }
  }
  const p = positions.subarray(best * 9, best * 9 + 9);
  const position: V3 = [
    ((p[0] ?? 0) + (p[3] ?? 0) + (p[6] ?? 0)) / 3,
    ((p[1] ?? 0) + (p[4] ?? 0) + (p[7] ?? 0)) / 3 + 1,
    ((p[2] ?? 0) + (p[5] ?? 0) + (p[8] ?? 0)) / 3,
  ];
  return { position, forward: [1, 0, 0], up: [0, 1, 0] };
}

function courseMeshObject(mesh: CollisionMesh): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  const colours = new Float32Array(mesh.positions.length);
  const colour = new THREE.Color();
  for (let t = 0; t < mesh.surfaces.length; t++) {
    colour.setHex(SURFACE_COLOURS[SURFACES[mesh.surfaces[t] ?? 0] ?? 'road'] ?? 0xffffff);
    // Every other triangle a touch darker, so the tessellation (and the edges the kart crosses) shows.
    if (t % 2) colour.multiplyScalar(0.88);
    for (let v = 0; v < 3; v++) colours.set([colour.r, colour.g, colour.b], t * 9 + v * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.computeVertexNormals();
  return new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      flatShading: true,
    }),
  );
}

function kartObject(): THREE.Group {
  const kart = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.45, 2.1),
    new THREE.MeshLambertMaterial({ color: 0xe8322f }),
  );
  body.position.y = 0.1;
  const seat = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.5, 0.6),
    new THREE.MeshLambertMaterial({ color: 0x222222 }),
  );
  seat.position.set(0, 0.45, 0.35);
  kart.add(body, seat);
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12).rotateZ(Math.PI / 2);
  const tyre = new THREE.MeshLambertMaterial({ color: 0x151515 });
  for (const [x, z] of [
    [0.75, -0.75],
    [-0.75, -0.75],
    [0.75, 0.75],
    [-0.75, 0.75],
  ] as const) {
    const w = new THREE.Mesh(wheel, tyre);
    w.position.set(x, -0.13, z);
    kart.add(w);
  }
  return kart;
}

function hud(): HTMLElement {
  const el = document.createElement('pre');
  el.className = 'antigrav-hud';
  el.setAttribute('data-testid', 'antigrav-hud');
  document.body.append(el);
  return el;
}

const fmtV = (v: V3) => v.map((n) => n.toFixed(2).padStart(5)).join(' ');

export async function run(): Promise<never> {
  const params = new URLSearchParams(window.location.search);
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('Missing #game canvas');
  document.body.classList.add('antigrav-spike');
  const info = hud();
  info.textContent = 'Loading collision…';

  const started = performance.now();
  let loaded: Loaded;
  try {
    loaded = await loadCourse(params.get('course'));
  } catch (error) {
    info.textContent = String(error instanceof Error ? error.message : error);
    return new Promise<never>(() => {});
  }
  const world = new CollisionWorld(loaded.mesh);
  const loadMs = performance.now() - started;
  const start = loaded.course?.start ?? realStart(world);
  let kart = makeKart(start.position, start.forward, start.up);
  const pilot = loaded.course ? new Autopilot(loaded.course.samples) : null;
  let auto = params.get('auto') === '1' && pilot !== null;
  let paused = params.get('paused') === '1';
  const input = new PlayerInput();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd4ff);
  scene.fog = new THREE.Fog(0x9fd4ff, 150, 600);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(80, 200, 60);
  scene.add(sun);
  scene.add(courseMeshObject(loaded.mesh));
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3d6e35 }),
  );
  ground.position.y = (loaded.mesh.gridMin[1] ?? 0) - 25;
  scene.add(ground);
  const kartMesh = kartObject();
  scene.add(kartMesh);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 2000);
  const camUp = new THREE.Vector3(0, 1, 0);
  const camPos = new THREE.Vector3();
  let camReady = false;

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // Ground query cost: the 5-ray probe for 8 karts, timed every tick (the kart's own + 7 copies).
  const queryMs: number[] = [];
  const timeQuery = () => {
    const t0 = performance.now();
    for (let i = 0; i < 8; i++) probeGround(world, kart);
    queryMs.push(performance.now() - t0);
    if (queryMs.length > 120) queryMs.shift();
  };

  const step = () => {
    const frame = auto && pilot ? pilot.input(kart) : input.read();
    if (frame.respawn) {
      kart = makeKart(start.position, start.forward, start.up);
      if (pilot) pilot.index = 0;
    }
    stepKart(world, kart, frame);
    timeQuery();
  };

  const draw = () => {
    const right = rightOf(kart);
    const back: V3 = [-kart.forward[0], -kart.forward[1], -kart.forward[2]];
    kartMesh.position.set(...kart.pos);
    kartMesh.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(...right),
        new THREE.Vector3(...kart.up),
        new THREE.Vector3(...back),
      ),
    );
    // Chase camera in the kart's frame; its up follows the kart's up (smoothed), so the world
    // rolls round you in anti-gravity.
    const target = new THREE.Vector3(
      ...addScaled(addScaled(kart.pos, kart.up, 2.6), kart.forward, -7.5),
    );
    const up = new THREE.Vector3(...kart.up);
    if (!camReady) {
      camPos.copy(target);
      camUp.copy(up);
      camReady = true;
    }
    camPos.lerp(target, 0.25);
    camUp.lerp(up, 0.12).normalize();
    camera.position.copy(camPos);
    camera.up.copy(camUp);
    camera.lookAt(
      new THREE.Vector3(...addScaled(addScaled(kart.pos, kart.up, 1), kart.forward, 4)),
    );
    renderer.render(scene, camera);

    const mean = queryMs.reduce((a, b) => a + b, 0) / Math.max(1, queryMs.length);
    info.textContent = [
      `course   ${loaded.label}  (${loaded.mesh.surfaces.length} triangles, loaded in ${loadMs.toFixed(0)} ms)`,
      `speed    ${speedOf(kart).toFixed(1).padStart(5)} m/s  (150cc top ${SPIKE_TUNING.topSpeed})`,
      `up       ${fmtV(kart.up)}`,
      `surface  ${kart.grounded ? kart.surface : 'air'}${kart.antigrav ? '  · ANTI-GRAVITY' : ''}`,
      `query    ${mean.toFixed(3)} ms / tick for 8 karts (5 rays each)`,
      `respawns ${kart.respawns}${auto ? '  · autopilot' : ''}${paused ? '  · paused' : ''}`,
      'keys: arrows/WASD drive · R restart · P autopilot',
    ].join('\n');
  };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyP' && pilot) {
      auto = !auto;
      pilot.index = 0;
    }
  });

  // Test hook (tests/e2e/antigravSpike.spec.ts).
  (window as unknown as { __antigrav: unknown }).__antigrav = {
    loadMs,
    triangles: loaded.mesh.surfaces.length,
    pause: () => (paused = true),
    setAuto: (on: boolean) => (auto = on && pilot !== null),
    step: (ticks: number) => {
      for (let i = 0; i < ticks; i++) step();
      draw();
    },
    state: () => ({
      pos: kart.pos,
      up: kart.up,
      speed: speedOf(kart),
      grounded: kart.grounded,
      surface: kart.surface,
      antigrav: kart.antigrav,
      respawns: kart.respawns,
      laps: pilot?.laps ?? 0,
      section: pilot?.sample?.section ?? null,
      queryMs: queryMs.reduce((a, b) => a + b, 0) / Math.max(1, queryMs.length),
    }),
  };

  draw();
  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc = Math.min(acc + (now - last) / 1000, 0.25);
    last = now;
    // Paused (tests), the page draws only when `__antigrav.step` moves the kart.
    if (!paused) {
      while (acc >= SPIKE_TUNING.dt) {
        step();
        acc -= SPIKE_TUNING.dt;
      }
      draw();
    } else acc = 0;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return new Promise<never>(() => {});
}
