// Lakitu (MK-101): floats in on his cloud for the countdown holding the start light (three red
// lamps, one per second, then green), shows the lap sign as a kart starts lap 2 and the final lap,
// and fishes karts out after a fall: he comes down over the kart, lifts it on his line while the
// sim carries it back, and drops it. `lakituPose` is a pure function of the cue (unit-tested);
// `Lakitu` draws it.
import * as THREE from 'three';
import { tuning } from '../../sim/tuning';
import { fitModel } from './racerModel';

export const LAKITU_PATH = 'models/npcs/lakitu.glb';
const TICKS_PER_SECOND = 60;

/** What Lakitu is doing; `tick` counts ticks since it started. */
export type LakituCue =
  | { kind: 'hidden' }
  | { kind: 'countdown'; tick: number }
  | { kind: 'lap'; tick: number; lap: number; final: boolean }
  | { kind: 'fishing'; tick: number };

/** Timings and placement, seconds and metres (relative to the kart, +Y up, −Z ahead). */
export const LAKITU = {
  /** Countdown: the light's three red lamps fill `tuning.countdownSeconds`; green, then he leaves. */
  goSeconds: 1,
  /** Where he hovers for the countdown and the lap sign: ahead and to the right of the kart. */
  hover: [1.6, 2.6, -5] as const,
  /** He flies this far up as he arrives and leaves. */
  flyHeight: 8,
  /** Seconds to fly in or out. */
  flySeconds: 0.4,
  /** The lap sign shows this long. */
  lapSeconds: 2.5,
  /** Fishing: his height over the kart while holding it, and the line's length. */
  fishHeight: 3.2,
  /** Shares of the respawn: coming down, holding the kart, then letting go. */
  hookAt: 0.25,
  dropAt: 0.8,
  /** How high the hooked kart swings up while carried (drawn only; the sim moves the kart). */
  carryLift: 1.2,
  /** Lakitu's height with his cloud, m. */
  height: 1.4,
} as const;

export interface LakituPose {
  visible: boolean;
  /** Where he is, relative to the kart. */
  offset: readonly [number, number, number];
  /** The start light: red lamps lit (0–3) and whether it shows green; null when he hasn't it. */
  light: { red: number; green: boolean } | null;
  /** The lap sign's text; null when he isn't holding it. */
  sign: string | null;
  /** The fishing line's length, m (0 = none). */
  line: number;
  /** Whether the kart hangs on the line, and how far it is lifted (drawn only). */
  carrying: boolean;
  lift: number;
}

const HIDDEN: LakituPose = {
  visible: false,
  offset: [0, 0, 0],
  light: null,
  sign: null,
  line: 0,
  carrying: false,
  lift: 0,
};

const smooth = (t: number) => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

/** Height above the hover point while flying in (t from 0) or out (t towards `end`), m. */
function flight(seconds: number, end: number): number {
  const arrive = 1 - smooth(seconds / LAKITU.flySeconds);
  const leave = smooth((seconds - (end - LAKITU.flySeconds)) / LAKITU.flySeconds);
  return LAKITU.flyHeight * Math.max(arrive, leave);
}

/** Total length of a cue, ticks (Lakitu is hidden after it). */
export function cueTicks(kind: Exclude<LakituCue['kind'], 'hidden'>): number {
  const seconds =
    kind === 'countdown'
      ? tuning.countdownSeconds + LAKITU.goSeconds
      : kind === 'lap'
        ? LAKITU.lapSeconds
        : tuning.respawnSeconds;
  return Math.round(seconds * TICKS_PER_SECOND);
}

/** Where Lakitu is and what he holds for `cue`. */
export function lakituPose(cue: LakituCue): LakituPose {
  if (cue.kind === 'hidden' || cue.tick < 0 || cue.tick >= cueTicks(cue.kind)) return HIDDEN;
  const seconds = cue.tick / TICKS_PER_SECOND;
  const [x, y, z] = LAKITU.hover;
  if (cue.kind === 'countdown') {
    const total = tuning.countdownSeconds + LAKITU.goSeconds;
    const perLamp = tuning.countdownSeconds / 3;
    const green = seconds >= tuning.countdownSeconds;
    const red = green ? 0 : Math.min(3, Math.floor(seconds / perLamp) + 1);
    return {
      ...HIDDEN,
      visible: true,
      offset: [x, y + flight(seconds, total), z],
      light: { red, green },
    };
  }
  if (cue.kind === 'lap') {
    const sign = cue.final ? 'FINAL LAP' : String(cue.lap);
    return {
      ...HIDDEN,
      visible: true,
      offset: [x, y + flight(seconds, LAKITU.lapSeconds), z],
      sign,
    };
  }
  // Fishing: come down over the kart, hold it, let go and fly off.
  const share = cue.tick / cueTicks('fishing');
  const above = LAKITU.fishHeight;
  if (share < LAKITU.hookAt) {
    const down = smooth(share / LAKITU.hookAt);
    return {
      ...HIDDEN,
      visible: true,
      offset: [0, above + LAKITU.flyHeight * (1 - down), 0],
      line: above * down,
    };
  }
  if (share < LAKITU.dropAt) {
    const lift =
      LAKITU.carryLift * smooth((share - LAKITU.hookAt) / (LAKITU.dropAt - LAKITU.hookAt));
    return {
      ...HIDDEN,
      visible: true,
      offset: [0, above + lift, 0],
      line: above,
      carrying: true,
      lift,
    };
  }
  const away = smooth((share - LAKITU.dropAt) / (1 - LAKITU.dropAt));
  return {
    ...HIDDEN,
    visible: true,
    offset: [0, above + LAKITU.flyHeight * away, 0],
    line: above * (1 - away),
  };
}

const LIGHT_SIZE = { width: 0.5, height: 1.2, depth: 0.25, lamp: 0.13 } as const;
const LAMP_OFF = 0x222222;
const LAMP_RED = 0xff2a1a;
const LAMP_GREEN = 0x2bff5a;
const SIGN_SIZE = { width: 1.3, height: 0.8 } as const;
const SIGN_PX = { width: 256, height: 160 } as const;
/** Where he holds the light and the sign, relative to him (he faces −Z). */
const HOLD: readonly [number, number, number] = [0.6, 0.6, -0.3];

/** Lakitu with his start light, lap sign and fishing line. */
export class Lakitu {
  readonly object = new THREE.Group();
  readonly lamps: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly light = new THREE.Group();
  private readonly sign: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly signCanvas = document.createElement('canvas');
  private readonly signTexture: THREE.CanvasTexture;
  private signText = '';
  private readonly line: THREE.Line;
  private readonly linePositions: THREE.BufferAttribute;
  /** The pose last drawn (test hooks read it). */
  current: LakituPose = HIDDEN;

  constructor(model: THREE.Object3D) {
    this.object.name = 'lakitu';
    this.object.visible = false;
    this.object.add(fitModel(model, 'y', LAKITU.height));

    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(LIGHT_SIZE.width, LIGHT_SIZE.height, LIGHT_SIZE.depth),
      new THREE.MeshLambertMaterial({ color: 0x303030 }),
    );
    this.light.add(housing);
    const lampGeometry = new THREE.SphereGeometry(LIGHT_SIZE.lamp, 12, 8);
    for (let i = 0; i < 3; i++) {
      const lamp = new THREE.Mesh(lampGeometry, new THREE.MeshBasicMaterial({ color: LAMP_OFF }));
      lamp.position.set(0, ((1 - i) * LIGHT_SIZE.height) / 3.4, -LIGHT_SIZE.depth / 2);
      this.lamps.push(lamp);
      this.light.add(lamp);
    }
    this.light.position.set(...HOLD);
    this.light.name = 'lakitu-light';
    this.object.add(this.light);

    this.signCanvas.width = SIGN_PX.width;
    this.signCanvas.height = SIGN_PX.height;
    this.signTexture = new THREE.CanvasTexture(this.signCanvas);
    this.signTexture.colorSpace = THREE.SRGBColorSpace;
    this.sign = new THREE.Mesh(
      new THREE.PlaneGeometry(SIGN_SIZE.width, SIGN_SIZE.height),
      new THREE.MeshBasicMaterial({ map: this.signTexture, side: THREE.DoubleSide }),
    );
    this.sign.position.set(...HOLD);
    // Planes face +Z; he faces −Z (towards the kart).
    this.sign.rotation.y = Math.PI;
    this.sign.name = 'lakitu-sign';
    this.object.add(this.sign);

    this.linePositions = new THREE.BufferAttribute(new Float32Array(6), 3);
    const lineGeometry = new THREE.BufferGeometry().setAttribute('position', this.linePositions);
    this.line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xf0f0f0 }));
    this.line.name = 'lakitu-line';
    this.line.frustumCulled = false;
    this.object.add(this.line);
  }

  /** Draws `pose` at `kart` (the kart's position; `heading` turns the hover offset with it). */
  update(pose: LakituPose, kart: THREE.Vector3, heading: number): void {
    this.current = pose;
    this.object.visible = pose.visible;
    if (!pose.visible) return;
    const [x, y, z] = pose.offset;
    const offset = new THREE.Vector3(x, y, z).applyAxisAngle(UP, heading);
    this.object.position.copy(kart).add(offset);
    // Turned round to face the kart.
    this.object.rotation.y = heading + Math.PI;

    this.light.visible = pose.light !== null;
    if (pose.light) {
      const { red, green } = pose.light;
      this.lamps.forEach((lamp, i) =>
        lamp.material.color.setHex(green ? LAMP_GREEN : i < red ? LAMP_RED : LAMP_OFF),
      );
    }

    this.sign.visible = pose.sign !== null;
    if (pose.sign !== null && pose.sign !== this.signText) this.drawSign(pose.sign);

    this.line.visible = pose.line > 0;
    // The line hangs straight down from his rod.
    this.linePositions.setXYZ(0, 0, 0, 0);
    this.linePositions.setXYZ(1, 0, -pose.line, 0);
    this.linePositions.needsUpdate = true;
  }

  private drawSign(text: string): void {
    this.signText = text;
    const ctx = this.signCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = SIGN_PX;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#1b1b1b';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, width - 10, height - 10);
    ctx.fillStyle = '#e4002b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const big = text.length <= 2;
    ctx.font = `900 ${big ? 110 : 38}px 'M PLUS Rounded 1c', sans-serif`;
    ctx.fillText(text, width / 2, height / 2 + 4);
    this.signTexture.needsUpdate = true;
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.signTexture.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
