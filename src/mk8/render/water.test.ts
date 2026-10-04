import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { applyWater, rippleSlopes, setWaterTime, waterClock } from './water';

const WATER = {
  materials: ['water'],
  colour: 0x3080e0,
  opacity: 0.6,
  flow: 0.5,
  scale: 4,
  reflection: 0.5,
  sky: 0xcfe9ff,
};

describe('MK8 water (MK-125)', () => {
  it('ripple slopes are deterministic, centred and use the whole range', () => {
    const a = rippleSlopes(32);
    expect(a).toEqual(rippleSlopes(32));
    const reds = Array.from({ length: 32 * 32 }, (_, i) => a[i * 4] ?? 0);
    const mean = reds.reduce((s, v) => s + v, 0) / reds.length;
    expect(Math.abs(mean - 127.5)).toBeLessThan(8);
    expect(Math.min(...reds)).toBeLessThan(10);
    expect(Math.max(...reds)).toBeGreaterThan(245);
  });

  it('swaps only the named materials, once per source material (model copies share it)', () => {
    const water = new THREE.MeshStandardMaterial({ name: 'water' });
    const road = new THREE.MeshStandardMaterial({ name: 'road' });
    const box = new THREE.BoxGeometry();
    const model = new THREE.Group();
    model.add(new THREE.Mesh(box, water), new THREE.Mesh(box, road));
    const copy = model.clone();
    expect(applyWater([model], WATER)).toBe(1);
    expect(applyWater([copy], WATER)).toBe(1);
    const swapped = (root: THREE.Object3D) => (root.children[0] as THREE.Mesh).material;
    expect(swapped(model)).toBe(swapped(copy));
    expect((swapped(model) as THREE.Material).userData.mk8Water).toBe(true);
    expect((model.children[1] as THREE.Mesh).material).toBe(road);
    // A second pass over an already swapped model changes nothing.
    expect(applyWater([model], WATER)).toBe(0);
  });

  it('ripples drift with the tick: flow m/s over the ripple size', () => {
    setWaterTime(120, WATER, 60);
    expect(waterClock()).toBeCloseTo((2 * 0.5) / 4);
  });
});
