import * as THREE from 'three';
import { routeGeometry } from '../sim/route';
import { getTrack } from '../sim/track';
import type { CoinEntity, SimState } from '../sim/types';

const RADIUS = 0.45;
const THICKNESS = 0.1;
/** The coin's centre above its spot on the road, m. */
const HOVER = 0.75;
/** Turns per second. */
const SPIN = 0.9;
const GOLD = 0xffc62a;
/** Sparkle: particles per pickup, how long they live (s), how fast they fly (m/s). */
const SPARKS = 10;
const SPARK_LIFE = 0.45;
const SPARK_SPEED = 3;
const MAX_SPARKS = 160;
/** A dropped coin gone with more life than this left was taken, not timed out, s. */
const TAKEN_LIFE = 0.1;

interface Seen {
  position: CoinEntity['position'];
  respawnTimer: number;
  life: number | undefined;
}

interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  born: number;
}

/**
 * Coins (MK-109): every coin there now as a spinning gold disc (one instanced draw), and a gold
 * sparkle where one was taken (one points draw). Nothing is made on tracks without coins.
 */
export class CoinRenderer {
  private mesh: THREE.InstancedMesh | undefined;
  private sparkPoints: THREE.Points | undefined;
  private readonly dummy = new THREE.Object3D();
  private seen = new Map<number, Seen>();
  private lastTick = -1;
  private sparks: Spark[] = [];
  /** Each coin's road up (from the route, so coins on banked or anti-gravity road stand on it). */
  private readonly ups = new Map<number, { at: CoinEntity['position']; up: THREE.Vector3 }>();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly tilt = new THREE.Quaternion();
  private readonly spin = new THREE.Quaternion();

  constructor(private readonly scene: THREE.Scene) {}

  sync(state: SimState, time: number): void {
    const coins = state.coins ?? [];
    if (this.mesh) this.mesh.visible = coins.length > 0;
    if (coins.length === 0 && !this.mesh) return;
    // A new race or a rewind: forget what was seen (no sparkles for it).
    if (state.tick < this.lastTick) {
      this.seen.clear();
      this.ups.clear();
    }
    if (state.tick !== this.lastTick) this.watchPickups(coins, time);
    this.lastTick = state.tick;

    const shown = coins.filter((coin) => coin.respawnTimer === 0);
    const mesh = this.ensureMesh(shown.length);
    shown.forEach((coin, i) => {
      const up = this.upOf(state.trackId, coin);
      this.dummy.position.set(coin.position.x, coin.position.y, coin.position.z);
      this.dummy.position.addScaledVector(up, HOVER);
      this.tilt.setFromUnitVectors(this.yAxis, up);
      this.spin.setFromAxisAngle(this.yAxis, time * SPIN * 2 * Math.PI + coin.id * 0.7);
      this.dummy.quaternion.copy(this.tilt).multiply(this.spin);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
    });
    mesh.count = shown.length;
    mesh.instanceMatrix.needsUpdate = true;
    this.drawSparks(time);
  }

  /** The road's up at `coin` (world +Y off mesh tracks), worked out once per coin spot. */
  private upOf(trackId: string, coin: CoinEntity): THREE.Vector3 {
    const known = this.ups.get(coin.id);
    // States are cloned each tick, so compare the spot, not the object.
    const p = coin.position;
    if (known && known.at.x === p.x && known.at.y === p.y && known.at.z === p.z) return known.up;
    const up = new THREE.Vector3(0, 1, 0);
    const track = getTrack(trackId);
    if (track.kind === 'mesh') {
      const geometry = routeGeometry(track.route);
      const frame = geometry.frameAt(geometry.project(coin.position).t);
      up.set(frame.up.x, frame.up.y, frame.up.z).normalize();
    }
    this.ups.set(coin.id, { at: { ...p }, up });
    return up;
  }

  /** Coins taken since last tick get a sparkle where they were. */
  private watchPickups(coins: readonly CoinEntity[], time: number): void {
    const next = new Map<number, Seen>();
    for (const coin of coins) {
      const before = this.seen.get(coin.id);
      if (before && before.respawnTimer === 0 && coin.respawnTimer > 0) this.burst(coin, time);
      next.set(coin.id, {
        position: coin.position,
        respawnTimer: coin.respawnTimer,
        life: coin.life,
      });
    }
    for (const [id, before] of this.seen) {
      if (!next.has(id) && before.life !== undefined && before.life > TAKEN_LIFE)
        this.burst(before, time);
    }
    this.seen = next;
  }

  private burst(coin: Pick<CoinEntity, 'position' | 'id'> | Seen, time: number): void {
    const { x, y, z } = coin.position;
    for (let k = 0; k < SPARKS; k += 1) {
      const a = (2 * Math.PI * k) / SPARKS;
      const up = 0.5 + 0.5 * Math.sin(k * 2.3);
      this.sparks.push({
        x,
        y: y + HOVER,
        z,
        vx: Math.cos(a) * SPARK_SPEED,
        vy: up * SPARK_SPEED,
        vz: Math.sin(a) * SPARK_SPEED,
        born: time,
      });
    }
    if (this.sparks.length > MAX_SPARKS) this.sparks.splice(0, this.sparks.length - MAX_SPARKS);
  }

  private drawSparks(time: number): void {
    this.sparks = this.sparks.filter((s) => time - s.born < SPARK_LIFE && time >= s.born);
    if (this.sparks.length === 0 && !this.sparkPoints) return;
    const points = this.ensureSparks();
    const position = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.sparks.forEach((s, i) => {
      const t = time - s.born;
      position.setXYZ(i, s.x + s.vx * t, s.y + s.vy * t, s.z + s.vz * t);
    });
    points.geometry.setDrawRange(0, this.sparks.length);
    points.visible = this.sparks.length > 0;
    position.needsUpdate = true;
  }

  private ensureMesh(count: number): THREE.InstancedMesh {
    if (this.mesh && this.mesh.instanceMatrix.count >= count) return this.mesh;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    // Standing on its edge (the cylinder's axis along X), with a lighter rim.
    const geometry = new THREE.CylinderGeometry(RADIUS, RADIUS, THICKNESS, 20);
    geometry.rotateZ(Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({
      color: GOLD,
      emissive: GOLD,
      emissiveIntensity: 0.35,
    });
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(count, 16) * 2);
    this.mesh.name = 'coins';
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    return this.mesh;
  }

  private ensureSparks(): THREE.Points {
    if (this.sparkPoints) return this.sparkPoints;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    this.sparkPoints = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xfff1a8,
        size: 0.22,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.sparkPoints.name = 'coin-sparks';
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);
    return this.sparkPoints;
  }
}
