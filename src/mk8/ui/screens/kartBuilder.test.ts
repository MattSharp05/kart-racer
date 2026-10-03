import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../../game/storage/store';
import { MK8_BODIES, MK8_GLIDERS, MK8_TIRES, defaultLoadout } from '../../content/parts';
import { BODY_POINTS, GLIDER_POINTS, TIRE_POINTS } from '../../content/stats';
import { saveLoadout } from '../../loadoutPrefs';
import { kartPreviewFiles } from '../../render/kartPreview';
import {
  FIRST_RACER,
  KART_COLUMNS,
  SHOWN_STATS,
  STAT_MAX,
  barPercent,
  startingLoadout,
  turnReel,
} from './kartBuilder';

describe('MK8 kart builder (MK-118)', () => {
  it('has a reel per part kind, each part in the stat table', () => {
    expect(KART_COLUMNS.map((c) => c.label)).toEqual(['Body', 'Tires', 'Glider']);
    expect(KART_COLUMNS.map((c) => c.parts)).toEqual([MK8_BODIES, MK8_TIRES, MK8_GLIDERS]);
    const tables = [BODY_POINTS, TIRE_POINTS, GLIDER_POINTS];
    KART_COLUMNS.forEach((column, i) => {
      for (const part of column.parts) {
        expect(part.kind).toBe(column.kind);
        expect(Object.hasOwn(tables[i] ?? {}, part.id), part.id).toBe(true);
      }
    });
    expect(SHOWN_STATS.map((s) => s.stat)).toEqual([
      'speed',
      'acceleration',
      'weight',
      'handling',
      'traction',
    ]);
  });

  it('turns reels round both ways', () => {
    expect(turnReel(0, 1, 6)).toBe(1);
    expect(turnReel(5, 1, 6)).toBe(0);
    expect(turnReel(0, -1, 6)).toBe(5);
    expect(turnReel(2, -7, 3)).toBe(1);
  });

  it('draws a bar as its share of MK8 scale', () => {
    expect(barPercent(STAT_MAX)).toBe(100);
    expect(barPercent(0.75)).toBeCloseTo((0.75 / 5.75) * 100);
    expect(barPercent(9)).toBe(100);
    expect(barPercent(-1)).toBe(0);
  });

  it('opens on the chosen racer in the last saved parts, or Mario in his default kart', () => {
    const store = new MemoryStore();
    expect(startingLoadout({ flow: {}, store })).toEqual(defaultLoadout(FIRST_RACER));
    const saved = {
      racer: 'mk8-toad',
      body: 'pipe-frame',
      tires: 'slim-tires',
      glider: 'cloud-glider',
    };
    saveLoadout(store, saved);
    // The last racer, when none was chosen on the way here.
    expect(startingLoadout({ flow: {}, store })).toEqual(saved);
    // Character select's racer keeps the saved kart (as MK8 does).
    expect(startingLoadout({ flow: { loadout: defaultLoadout('mk8-bowser') }, store })).toEqual({
      ...saved,
      racer: 'mk8-bowser',
    });
  });

  it("previews from the racer's model and the kart's parts", () => {
    expect(kartPreviewFiles(defaultLoadout('mk8-mario'))).toEqual([
      'models/racers/mario.glb',
      'models/karts/bodies/standard-kart.glb',
      'models/karts/tires/standard-tires.glb',
      'models/karts/gliders/paper-glider.glb',
    ]);
  });
});
