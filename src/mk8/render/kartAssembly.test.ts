import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
// `racerModel` and `kartAssembly` import each other: load them the way the game does.
import './racerModel';
import { MK8_BODIES, MK8_GLIDERS, MK8_TIRES } from '../content/parts';
import { Mk8Kart } from './kartAssembly';

const box = (x: number, y: number, z: number) =>
  new THREE.Mesh(new THREE.BoxGeometry(x, y, z), new THREE.MeshBasicMaterial());

function kart(): Mk8Kart {
  return new Mk8Kart({
    body: MK8_BODIES[0]!,
    tires: MK8_TIRES[0]!,
    glider: MK8_GLIDERS[0]!,
    models: { body: box(1.2, 0.6, 2), tire: box(0.3, 0.5, 0.5), glider: box(2, 0.2, 1) },
  });
}

const glider = (k: Mk8Kart) => k.object.getObjectByName('glider')!;

describe('MK8 kart glider (MK-106)', () => {
  it('is folded away until it glides, then unfolds sideways to its full span', () => {
    const k = kart();
    expect(k.gliderOpen).toBe(false);
    expect(k.gliderOpenness).toBe(0);
    k.setGliderOpenness(1);
    const open = glider(k).scale.clone();
    k.setGliderOpenness(0.5);
    expect(k.gliderOpen).toBe(true);
    expect(glider(k).scale.x).toBeCloseTo(open.x / 2);
    expect(glider(k).scale.y).toBeLessThan(open.y);
    k.setGliderOpenness(0);
    expect(k.gliderOpen).toBe(false);
    k.setGliderOpen(true);
    expect(glider(k).scale.x).toBeCloseTo(open.x);
  });
});
