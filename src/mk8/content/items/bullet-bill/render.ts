import * as THREE from 'three';
import type { ItemRenderer, ItemView } from '../../../../content/items/views';
import { itemSkins } from '../../../../render/itemSkins';
import type { KartState, SimState } from '../../../../sim/types';
import { MK8_ITEM_SET } from '../id';
import { mk8EntityModel } from '../../../render/items';
import { BULLET, isBullet } from './sim';

/** The bullet's length, m, and how high its axis rides above the road, m. */
const LENGTH = 2.8;
const RIDE_HEIGHT = 0.75;

/**
 * A stand-in Bullet Bill (no pack: CI, previews, production): a black shell with a rounded nose
 * facing −Z (heading 0), a grey band and fins at the back, white eyes and two white fists.
 */
export function bulletModel(): THREE.Object3D {
  const group = new THREE.Group();
  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.2, flatShading: true });
  const radius = 0.62;
  const bodyLength = LENGTH - radius;
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, bodyLength, 16),
    mat('#20202a'),
  );
  body.rotation.x = Math.PI / 2;
  body.position.z = radius / 2;
  group.add(body);
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    mat('#20202a'),
  );
  // The dome's top (+Y) turned to the front (−Z).
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = radius / 2 - bodyLength / 2;
  group.add(nose);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(radius * 1.04, radius * 1.04, 0.3, 16),
    mat('#6b6b78'),
  );
  band.rotation.x = Math.PI / 2;
  band.position.z = radius / 2 + bodyLength / 2 - 0.15;
  group.add(band);
  for (let k = 0; k < 4; k += 1) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.6), mat('#6b6b78'));
    const angle = (k * Math.PI) / 2 + Math.PI / 4;
    fin.position.set(Math.cos(angle) * (radius + 0.2), Math.sin(angle) * (radius + 0.2), 1.05);
    fin.rotation.z = angle - Math.PI / 2;
    group.add(fin);
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mat('#ffffff'));
    eye.scale.set(0.6, 1, 0.5);
    eye.position.set(side * 0.27, 0.2, -0.95);
    group.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat('#000000'));
    pupil.position.set(side * 0.25, 0.2, -1.04);
    group.add(pupil);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat('#f4f4f4'));
    fist.position.set(side * (radius + 0.18), -0.15, -0.35);
    group.add(fist);
  }
  return group;
}

/** The pack's Bullet Bill, its nose (its top, as the pack stands it) turned to the front (−Z). */
function packModel(): THREE.Object3D {
  const model = mk8EntityModel(BULLET, LENGTH);
  // Rolled half a turn about its nose too, so its eyes are on top.
  model.rotation.set(-Math.PI / 2, Math.PI, 0);
  return model;
}

/** The pack's Bullet Bill when MK8's item models are loaded (its `mk8` skin is up), else ours. */
function makeModel(pack: boolean): THREE.Object3D {
  const holder = new THREE.Group();
  holder.add(pack ? packModel() : bulletModel());
  holder.userData.pack = pack;
  return holder;
}

/**
 * Draws a Bullet Bill in place of each kart riding as one (the kart itself is drawn see-through:
 * `kartOpacity`), where the kart is drawn and turned with it (onto walls and ceilings too).
 */
export class BulletBillRenderer implements ItemRenderer {
  private readonly models = new Map<number, THREE.Object3D>();
  private readonly up = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {}

  sync(
    state: SimState,
    _time: number,
    kartModel?: (id: number) => THREE.Object3D | undefined,
  ): void {
    const on = new Set<number>();
    for (const kart of state.karts) {
      if (!isBullet(kart)) continue;
      on.add(kart.id);
      // The pack's model once it has loaded (it may load after the race starts).
      const pack = itemSkins.has(MK8_ITEM_SET);
      let model = this.models.get(kart.id);
      if (model?.userData.pack !== pack) {
        if (model) this.scene.remove(model);
        model = makeModel(pack);
        this.models.set(kart.id, model);
        this.scene.add(model);
      }
      model.visible = true;
      this.place(model, kart, kartModel?.(kart.id));
    }
    // Kept for the kart's next bullet (one model per kart at most), hidden meanwhile.
    for (const [id, model] of this.models) if (!on.has(id)) model.visible = false;
  }

  /** On the drawn kart (its interpolated pose) if there is one, else where the sim has it. */
  private place(model: THREE.Object3D, kart: KartState, drawn: THREE.Object3D | undefined): void {
    if (drawn) {
      model.position.copy(drawn.position);
      model.quaternion.copy(drawn.quaternion);
    } else {
      model.position.set(kart.position.x, kart.position.y, kart.position.z);
      model.rotation.set(0, kart.heading, 0);
    }
    this.up.set(0, 1, 0).applyQuaternion(model.quaternion);
    model.position.addScaledVector(this.up, RIDE_HEIGHT);
  }
}

/** How Bullet Bill (MK-120) looks: its HUD icon, and the bullet drawn in place of the kart. */
export default {
  id: BULLET,
  icon: '<path d="M14 18h26a14 14 0 0 1 0 28H14z" fill="#22222c"/><rect x="8" y="16" width="8" height="32" rx="2" fill="#7a7a88"/><ellipse cx="44" cy="27" rx="4" ry="6" fill="#fff"/><circle cx="45" cy="28" r="2" fill="#000"/><circle cx="30" cy="44" r="5" fill="#f4f4f4"/>',
  useSound: 'mushroom',
  renderer: BulletBillRenderer,
  // The kart vanishes under the bullet while it lasts.
  kartOpacity: () => 0,
} satisfies ItemView;
