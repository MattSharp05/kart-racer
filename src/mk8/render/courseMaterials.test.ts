import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { classifyAlpha, fixCourseMaterials, type AlphaReader } from './courseMaterials';

/** RGBA texels: `clear` share at alpha 0, `partial` at 128, the rest at 255. */
function texels(clear: number, partial: number, count = 1000): Uint8Array {
  const data = new Uint8Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const a = i < clear * count ? 0 : i < (clear + partial) * count ? 128 : 255;
    data.set([200, 100, 50, a], i * 4);
  }
  return data;
}

/** A material as GLTFLoader makes a glTF `BLEND` one, with a texture whose image is `name`. */
function blended(name: string, opacity = 1): THREE.MeshStandardMaterial {
  const map = new THREE.Texture({ name, width: 4, height: 4 });
  return new THREE.MeshStandardMaterial({
    name,
    map,
    opacity,
    transparent: true,
    depthWrite: false,
  });
}

describe('course materials (MK-105 revisit: the road hid nothing behind it)', () => {
  it('sorts textures by how they use alpha', () => {
    expect(classifyAlpha(texels(0, 0))).toBe('opaque');
    // A road whose alpha is a mask for something else (in-between, never clear): solid.
    expect(classifyAlpha(texels(0, 0.06))).toBe('opaque');
    expect(classifyAlpha(texels(0.4, 0.05))).toBe('cutout');
    expect(classifyAlpha(texels(0.05, 0.8))).toBe('blend');
    expect(classifyAlpha(texels(0.3, 0.3))).toBe('blend');
    expect(classifyAlpha(new Uint8Array(0))).toBe('opaque');
  });

  it('draws solid what only claims to be see-through, writing depth, and keeps real glass blended', () => {
    const alpha: Record<string, Uint8Array> = {
      road: texels(0, 0),
      flowers: texels(0.5, 0.02),
      glass: texels(0, 0.9),
    };
    const read: AlphaReader = (image) => alpha[(image as { name: string }).name] ?? null;
    const road = blended('road');
    const flowers = blended('flowers');
    const glass = blended('glass');
    const faint = blended('road', 0.5);
    const unreadable = blended('unknown');
    const plain = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false });
    const solid = new THREE.MeshStandardMaterial();
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    for (const m of [road, road, flowers, glass, faint, unreadable, plain, solid])
      root.add(new THREE.Mesh(geometry, m));

    const stats = fixCourseMaterials(root, read);

    expect(stats).toEqual({ opaque: 2, cutout: 2, blend: 2 });
    for (const m of [road, plain]) {
      expect(m).toMatchObject({ transparent: false, depthWrite: true, alphaTest: 0 });
    }
    // Cut out: solid, its clear texels dropped (and a texture it can't read is treated so).
    for (const m of [flowers, unreadable]) {
      expect(m).toMatchObject({ transparent: false, depthWrite: true, alphaTest: 0.5 });
    }
    for (const m of [glass, faint])
      expect(m).toMatchObject({ transparent: true, depthWrite: false });
    expect(solid).toMatchObject({ transparent: false, alphaTest: 0 });
  });

  it('draws the ground named by the course’s map solid, whatever its alpha (MK-123 round 2)', () => {
    // A layered road keeps a blend weight in alpha: sorted by alpha it would be blended or cut out.
    const read: AlphaReader = () => texels(0.4, 0.5);
    const road = blended('ck_spongeMulti01');
    const masked = new THREE.MeshStandardMaterial({ name: 'ck_candy01', alphaTest: 0.5 });
    const soda = blended('ef_juicenear');
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry();
    for (const m of [road, masked, soda]) root.add(new THREE.Mesh(geometry, m));

    const stats = fixCourseMaterials(root, read, new Set(['ck_spongeMulti01', 'ck_candy01']));

    expect(stats).toEqual({ opaque: 1, cutout: 0, blend: 1 });
    for (const m of [road, masked])
      expect(m).toMatchObject({ transparent: false, depthWrite: true, alphaTest: 0 });
    expect(soda).toMatchObject({ transparent: true, depthWrite: false });
  });
});
