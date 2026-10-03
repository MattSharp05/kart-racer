// The track editor's 3D view (MK-100): the collision mesh coloured by surface, the course model,
// the route and everything on it as overlays, an orbit camera with WASD/QE flying, and picking.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Vec3 } from '../../sim/math';
import {
  MESH_SURFACES,
  type CollisionMesh,
  type MeshMaterialSurface,
  type MeshSurface,
} from '../../sim/meshCollision';
import { RouteGeometry, type RouteDef } from '../../sim/route';
import type { EditorModel } from './model';

export const SURFACE_COLOURS: Record<MeshMaterialSurface, number> = {
  road: 0x8a8f98,
  offroad: 0x6b8e3a,
  boost: 0xff8c1a,
  wall: 0xb84a4a,
  water: 0x3a7bd5,
  antigrav: 0x3ad5d5,
  glide: 0xc45ad5,
  void: 0x222222,
  ignore: 0xeeeeee,
};

const COLOURS = {
  route: 0xffffff,
  point: 0xffd400,
  selected: 0xff3df0,
  edge: 0x9ad0ff,
  racingLine: 0xffe066,
  gate: 0x00e676,
  finish: 0xffffff,
  respawn: 0x40c4ff,
  grid: 0xff5252,
  itemBox: 0xb388ff,
  coin: 0xffc107,
  glide: 0xc45ad5,
  antigrav: 0x3ad5d5,
  water: 0x3a7bd5,
  bumper: 0xff8c1a,
  pending: 0xff3df0,
};

/** Overlays float this far above the road along its up, m, so they don't fight the mesh. */
const LIFT = 0.15;
const HANDLE_RADIUS = 0.6;
/** Camera fly speed as a fraction of the orbit distance per second. */
const FLY_SPEED = 0.6;

export type HandleKind = 'point' | 'width' | 'racing';
export interface Handle {
  kind: HandleKind;
  index: number;
}

export interface CollisionPick {
  point: Vec3;
  normal: Vec3;
  triangle: number;
  surface: MeshSurface;
}

const v3 = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);

export class EditorScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 20000);
  readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private collisionMesh: THREE.Mesh | undefined;
  private collisionData: CollisionMesh | undefined;
  private model: THREE.Group | undefined;
  private readonly modelMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private readonly overlays = new THREE.Group();
  private handles: THREE.Object3D[] = [];
  private readonly keys = new Set<string>();
  private lastFrame = performance.now();

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.append(this.renderer.domElement);
    this.scene.background = new THREE.Color(0x1d2330);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(0.4, 1, 0.3);
    this.scene.add(sun, this.overlays);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement))
        this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.fly(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** WASD moves along the view (flattened), Q/E down/up; Shift is faster. */
  private fly(dt: number): void {
    if (this.keys.size === 0) return;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const move = new THREE.Vector3();
    if (this.keys.has('KeyW')) move.add(forward);
    if (this.keys.has('KeyS')) move.sub(forward);
    if (this.keys.has('KeyD')) move.add(right);
    if (this.keys.has('KeyA')) move.sub(right);
    if (this.keys.has('KeyE')) move.y += 1;
    if (this.keys.has('KeyQ')) move.y -= 1;
    if (move.lengthSq() === 0) return;
    const distance = this.camera.position.distanceTo(this.controls.target);
    const speed = FLY_SPEED * Math.max(10, distance) * (this.keys.has('ShiftLeft') ? 3 : 1);
    move.normalize().multiplyScalar(speed * dt);
    this.camera.position.add(move);
    this.controls.target.add(move);
  }

  // --- Course ---

  setCollision(mesh: CollisionMesh): void {
    this.collisionData = mesh;
    const positions = new Float32Array(mesh.positions);
    const colours = new Float32Array(positions.length);
    const colour = new THREE.Color();
    for (let t = 0; t < mesh.surfaces.length; t += 1) {
      colour.setHex(SURFACE_COLOURS[MESH_SURFACES[mesh.surfaces[t] ?? 0] ?? 'road']);
      for (let k = 0; k < 3; k += 1) colour.toArray(colours, t * 9 + k * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    this.collisionMesh = new THREE.Mesh(
      geometry,
      new THREE.MeshLambertMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      }),
    );
    this.scene.add(this.collisionMesh);
    this.frameAll();
  }

  setModel(model: THREE.Group): void {
    this.model = model;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) this.modelMaterials.set(o, o.material);
    });
    this.scene.add(model);
  }

  get hasModel(): boolean {
    return this.model !== undefined;
  }

  setCollisionVisible(visible: boolean): void {
    if (this.collisionMesh) this.collisionMesh.visible = visible;
  }

  setModelVisible(visible: boolean): void {
    if (this.model) this.model.visible = visible;
  }

  /** Colours the course model by each material's surface (`surfaceOf`), or back to its textures. */
  colourModel(surfaceOf: ((material: string) => MeshMaterialSurface) | undefined): void {
    for (const [mesh, original] of this.modelMaterials) {
      if (!surfaceOf) {
        mesh.material = original;
        continue;
      }
      const list = Array.isArray(original) ? original : [original];
      const tinted = list.map(
        (m) =>
          new THREE.MeshLambertMaterial({
            color: SURFACE_COLOURS[surfaceOf(m.name)],
            side: THREE.DoubleSide,
          }),
      );
      mesh.material = Array.isArray(original) ? tinted : (tinted[0] as THREE.Material);
    }
  }

  /** Frames the whole collision mesh from above at an angle. */
  frameAll(): void {
    const box = this.collisionMesh?.geometry.boundingBox;
    if (!box) return;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    this.lookAt(centre, size * 0.8, 'angled');
  }

  /** Points the camera at `target` from `distance` m, straight down or at an angle. */
  lookAt(target: Vec3, distance: number, view: 'top' | 'angled' = 'angled'): void {
    this.controls.target.copy(v3(target));
    const offset =
      view === 'top'
        ? new THREE.Vector3(0, distance, 0.001)
        : new THREE.Vector3(0, distance * 0.6, distance * 0.8);
    this.camera.position.copy(v3(target)).add(offset);
    this.camera.far = Math.max(2000, distance * 20);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  // --- Picking ---

  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  /** The collision triangle under the pointer, with its normal turned towards the camera. */
  pickCollision(clientX: number, clientY: number): CollisionPick | undefined {
    if (!this.collisionMesh || !this.collisionData) return undefined;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hit = this.raycaster.intersectObject(this.collisionMesh, false)[0];
    if (!hit || hit.faceIndex === undefined || hit.faceIndex === null || !hit.face)
      return undefined;
    const normal = hit.face.normal.clone();
    if (normal.dot(this.raycaster.ray.direction) > 0) normal.negate();
    const code = this.collisionData.surfaces[hit.faceIndex] ?? 0;
    return {
      point: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
      normal: { x: normal.x, y: normal.y, z: normal.z },
      triangle: hit.faceIndex,
      surface: MESH_SURFACES[code] ?? 'road',
    };
  }

  /** The course model's material under the pointer. */
  pickMaterial(clientX: number, clientY: number): string | undefined {
    if (!this.model?.visible) return undefined;
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hit = this.raycaster.intersectObject(this.model, true)[0];
    if (!hit || !(hit.object instanceof THREE.Mesh)) return undefined;
    const original = this.modelMaterials.get(hit.object) ?? hit.object.material;
    const list = Array.isArray(original) ? original : [original];
    const index = hit.face?.materialIndex ?? 0;
    return (list[index] ?? list[0])?.name;
  }

  pickHandle(clientX: number, clientY: number): Handle | undefined {
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hit = this.raycaster.intersectObjects(this.handles, false)[0];
    return hit?.object.userData.handle as Handle | undefined;
  }

  /** Where world point `p` is on screen, in client pixels (tests click through this). */
  screenOf(p: Vec3): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const v = v3(p).project(this.camera);
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
    };
  }

  // --- Overlays ---

  /** Rebuilds the route overlays from the model. */
  drawRoute(model: EditorModel): void {
    for (const child of [...this.overlays.children]) {
      this.overlays.remove(child);
      child.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.handles = [];
    const { route, selected } = model;
    const geometry = model.geometry();

    route.points.forEach((p, i) => {
      const colour = i === selected ? COLOURS.selected : i === 0 ? COLOURS.finish : COLOURS.point;
      const lift = p.up ?? { x: 0, y: 1, z: 0 };
      const at = { x: p.x + lift.x * LIFT, y: p.y + lift.y * LIFT, z: p.z + lift.z * LIFT };
      this.handle(at, colour, { kind: 'point', index: i }, i === selected ? 1.4 : 1);
    });

    if (!geometry) {
      // Too few points to sample: a straight polyline through them.
      if (route.points.length > 1)
        this.line(
          route.points.map((p) => ({ x: p.x, y: p.y + LIFT, z: p.z })),
          COLOURS.route,
          false,
        );
      return;
    }
    const along = (t: number, lateral: number) => {
      const f = geometry.frameAt(t, lateral);
      return {
        x: f.position.x + f.up.x * LIFT,
        y: f.position.y + f.up.y * LIFT,
        z: f.position.z + f.up.z * LIFT,
      };
    };
    const n = geometry.samples.length;
    const ts = Array.from({ length: n }, (_, i) => i / n);
    this.line(
      ts.map((t) => along(t, 0)),
      COLOURS.route,
      true,
    );
    this.line(
      ts.map((t) => along(t, -geometry.frameAt(t).width / 2)),
      COLOURS.edge,
      true,
    );
    this.line(
      ts.map((t) => along(t, geometry.frameAt(t).width / 2)),
      COLOURS.edge,
      true,
    );
    this.drawRacingLine(route, geometry);

    if (selected !== undefined) {
      const frame = model.frameAtPoint(selected);
      const point = route.points[selected];
      if (frame && point) {
        const t = geometry.project(point).t;
        this.handle(along(t, -point.width / 2), COLOURS.edge, { kind: 'width', index: selected });
        this.handle(along(t, point.width / 2), COLOURS.edge, { kind: 'width', index: selected });
        this.handle(
          along(t, point.racingLine ?? 0),
          COLOURS.racingLine,
          {
            kind: 'racing',
            index: selected,
          },
          0.8,
        );
      }
    }

    route.checkpoints.forEach((t, i) => {
      const w = geometry.frameAt(t).width / 2 + 1;
      this.line([along(t, -w), along(t, w)], i === 0 ? COLOURS.finish : COLOURS.gate, false);
      const post = along(t, -w);
      this.line([post, { ...post, y: post.y + 4 }], i === 0 ? COLOURS.finish : COLOURS.gate, false);
    });
    route.respawnPoints.forEach((r) => {
      this.marker(along(r.t, 0), COLOURS.respawn, 'cone');
      this.line(
        this.span(r.from, r.to).map((t) => along(t, 0.5)),
        COLOURS.respawn,
        false,
      );
    });
    route.gridSlots.forEach((g) => this.marker(along(g.t, g.lateral), COLOURS.grid, 'box'));
    route.itemBoxRows.forEach((row) =>
      row.laterals.forEach((l) => this.marker(along(row.t, l), COLOURS.itemBox, 'box')),
    );
    route.coinLines.forEach((line) => {
      for (let k = 0; k < line.count; k += 1) {
        const f = line.count > 1 ? k / (line.count - 1) : 0;
        const span = ((line.to - line.from + 1) % 1) * f;
        this.marker(along(line.from + span, line.lateral), COLOURS.coin, 'coin');
      }
    });
    route.zones.forEach((zone) => {
      if (zone.kind === 'glide' || zone.kind === 'antigrav') {
        const colour = zone.kind === 'glide' ? COLOURS.glide : COLOURS.antigrav;
        const ts = this.span(zone.from, zone.to);
        for (const side of [-1, 1])
          this.line(
            ts.map((t) => along(t, side * (geometry.frameAt(t).width / 2 - 0.5))),
            colour,
            false,
          );
      } else if (zone.kind === 'water') {
        const box = new THREE.Box3(v3(zone.min), v3(zone.max));
        this.overlays.add(new THREE.Box3Helper(box, COLOURS.water));
      } else {
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(zone.radius, 16, 8),
          new THREE.MeshBasicMaterial({ color: COLOURS.bumper, wireframe: true }),
        );
        sphere.position.copy(v3(zone.position));
        this.overlays.add(sphere);
      }
    });
    if (model.pending) this.marker(model.pending.point, COLOURS.pending, 'cone');
  }

  /** The racing line: each point moved sideways by its offset, through the same spline. */
  private drawRacingLine(route: RouteDef, geometry: RouteGeometry): void {
    if (!route.points.some((p) => p.racingLine)) return;
    const shifted = route.points.map((p) => {
      const f = geometry.frameAt(geometry.project(p).t);
      const o = p.racingLine ?? 0;
      return { ...p, x: p.x + f.right.x * o, y: p.y + f.right.y * o, z: p.z + f.right.z * o };
    });
    const line = new RouteGeometry({ ...route, points: shifted });
    this.line(
      line.samples.map((s) => ({
        x: s.position.x + s.up.x * LIFT * 2,
        y: s.position.y + s.up.y * LIFT * 2,
        z: s.position.z + s.up.z * LIFT * 2,
      })),
      COLOURS.racingLine,
      true,
    );
  }

  /** Lap fractions from `from` to `to` (across the line if needed), every 0.2 %. */
  private span(from: number, to: number): number[] {
    const length = (to - from + 1) % 1;
    const steps = Math.max(1, Math.ceil(length / 0.002));
    return Array.from({ length: steps + 1 }, (_, i) => from + (length * i) / steps);
  }

  private line(points: Vec3[], colour: number, closed: boolean): void {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(v3));
    const material = new THREE.LineBasicMaterial({ color: colour });
    this.overlays.add(
      closed ? new THREE.LineLoop(geometry, material) : new THREE.Line(geometry, material),
    );
  }

  private handle(at: Vec3, colour: number, handle: Handle, scale = 1): void {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(HANDLE_RADIUS * scale, 12, 8),
      new THREE.MeshBasicMaterial({ color: colour, depthTest: false }),
    );
    mesh.position.copy(v3(at));
    mesh.renderOrder = 10;
    mesh.userData.handle = handle;
    this.overlays.add(mesh);
    this.handles.push(mesh);
  }

  private marker(at: Vec3, colour: number, shape: 'box' | 'cone' | 'coin'): void {
    const geometry =
      shape === 'box'
        ? new THREE.BoxGeometry(1, 1, 1)
        : shape === 'cone'
          ? new THREE.ConeGeometry(0.6, 2, 12)
          : new THREE.CylinderGeometry(0.4, 0.4, 0.1, 12).rotateX(Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: colour }));
    mesh.position.copy(v3(at));
    mesh.position.y += shape === 'cone' ? 1 : 0.5;
    this.overlays.add(mesh);
  }
}
