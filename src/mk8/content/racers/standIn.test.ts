import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { racers } from '../../../content/racers';
import { racerViews } from '../../../content/racers/render';
import { KartRenderer } from '../../../render/karts';
import { alternateColours, PrimitiveKartFactory } from '../../../render/kartModels';
import { createSimState } from '../../../sim/state';
import { MK8_CONTENT, registerMk8Content } from '../../register';
import { MK8_RACERS } from './index';
import { MK8_RACER_STAND_INS, STAND_IN_COLOURS } from './standIn';

const ORIGINAL_VIEWS = racerViews.list();

describe('MK8 racers in a race (MK-138)', () => {
  afterEach(() => {
    for (const racer of MK8_RACERS) {
      racers.unregister(racer.id);
      racerViews.unregister(racer.id);
    }
  });

  it('every MK8 racer has its own stand-in paint', () => {
    expect(Object.keys(STAND_IN_COLOURS).sort()).toEqual(MK8_RACERS.map((r) => r.id).sort());
    expect(MK8_RACER_STAND_INS.map((v) => v.id)).toEqual(MK8_RACERS.map((r) => r.id));
    expect(new Set(MK8_RACER_STAND_INS.map((v) => v.colours.body)).size).toBe(12);
  });

  it('opening MK8 Mode gives every MK8 racer a kart model', () => {
    const factory = new PrimitiveKartFactory();
    expect(() => factory.create('mk8-mario')).toThrow(/Unknown racer view: mk8-mario/);
    registerMk8Content();
    registerMk8Content();
    for (const racer of MK8_RACERS) {
      const model = factory.create(racer.id, alternateColours(racer.id, 1));
      expect(model.wheels).toHaveLength(4);
    }
  });

  it('draws a race of MK8 karts without throwing, and builds each model once', () => {
    registerMk8Content();
    const state = createSimState({
      seed: 1,
      karts: MK8_RACERS.slice(0, 8).map((r, i) => ({
        kartType: r.id,
        position: { x: i * 3, y: 0, z: 0 },
      })),
    });
    const scene = new THREE.Scene();
    const karts = new KartRenderer(scene);
    for (let frame = 0; frame < 3; frame += 1) karts.sync(state, state, 0.5);
    expect(scene.children).toHaveLength(8);
    for (let i = 0; i < 8; i += 1) expect(karts.kart(i)).toBeDefined();
  });

  it("leaves the original game's racer views as they were", () => {
    registerMk8Content(MK8_CONTENT);
    expect(racerViews.list().filter((v) => !v.id.startsWith('mk8-'))).toEqual(ORIGINAL_VIEWS);
    for (const view of ORIGINAL_VIEWS) expect(racerViews.get(view.id)).toBe(view);
  });
});
