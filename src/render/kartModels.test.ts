import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { KART_IDS } from '../sim/data/karts';
import { tuning } from '../sim/tuning';
import { PrimitiveKartFactory } from './kartModels';

describe('kart models', () => {
  it.each(KART_IDS)('%s fits inside the physics footprint (so walls never clip it)', (id) => {
    const model = new PrimitiveKartFactory().create(id);
    model.sparks.forEach((s) => (s.visible = false));
    model.flame.visible = false;
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    model.body.traverseVisible((object) => {
      if (object instanceof THREE.Mesh && object !== model.flame) box.expandByObject(object);
    });
    const tolerance = 0.01;
    expect(box.min.z).toBeGreaterThanOrEqual(-tuning.kartFront - tolerance);
    expect(box.max.z).toBeLessThanOrEqual(tuning.kartRear + tolerance);
    expect(Math.max(-box.min.x, box.max.x)).toBeLessThanOrEqual(tuning.kartHalfWidth + tolerance);
  });
});
