import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MK8_RACERS } from '.';
import { MK8_RACER_VIEWS, mk8RacerView } from './render';
import { WEIGHT_CLASS_STATS } from './weightClass';

const folders = readdirSync(import.meta.dirname).filter((f) =>
  statSync(join(import.meta.dirname, f)).isDirectory(),
);

describe('MK8 racers (MK-101)', () => {
  it('lists every racer folder once, as `mk8-<folder>`, with a view for each', () => {
    expect(MK8_RACERS.map((r) => r.id).sort()).toEqual(folders.map((f) => `mk8-${f}`).sort());
    expect(MK8_RACER_VIEWS.map((v) => v.id).sort()).toEqual(MK8_RACERS.map((r) => r.id).sort());
    for (const folder of folders) expect(mk8RacerView(`mk8-${folder}`).model).toBe(folder);
    expect(() => mk8RacerView('mario')).toThrow(/Unknown MK8 racer/);
  });

  it('has the 12 racers in roster order with their weight classes', () => {
    const roster = [...MK8_RACERS].sort((a, b) => a.order - b.order);
    expect(roster.map((r) => `${r.name}:${r.weightClass}`)).toEqual([
      'Mario:medium',
      'Luigi:medium',
      'Peach:medium',
      'Daisy:medium',
      'Yoshi:medium',
      'Toad:light',
      'Koopa Troopa:light',
      'Shy Guy:light',
      'Donkey Kong:heavy',
      'Bowser:heavy',
      'Wario:heavy',
      'Waluigi:heavy',
    ]);
    for (const racer of MK8_RACERS) {
      expect(racer.pack).toBe('mk8');
      expect(racer.stats).toEqual(WEIGHT_CLASS_STATS[racer.weightClass]);
    }
  });

  it('gives heavier classes more weight and top speed, lighter ones more acceleration', () => {
    const { light, medium, heavy } = WEIGHT_CLASS_STATS;
    expect(light.weight).toBeLessThan(medium.weight);
    expect(medium.weight).toBeLessThan(heavy.weight);
    expect(light.speed).toBeLessThan(heavy.speed);
    expect(light.acceleration).toBeGreaterThan(heavy.acceleration);
  });
});
