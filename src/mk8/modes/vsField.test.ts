import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { racers } from '../../content/racers';
import { KART_IDS } from '../../sim/data/karts';
import { MK8_RACERS } from '../content/racers';
import { DEFAULT_LOADOUT, raceSetup } from '../flow';
import { registerMk8Content } from '../register';
import { vsField, vsSeed } from './vsField';

// MK-136: "when we race … we get the default ones from kart racer": a VS Race's CPUs were picked
// from the original game's racers. They are MK8 racers now.
describe('MK8 VS Race field (MK-136)', () => {
  beforeEach(() => registerMk8Content());
  afterEach(() => {
    for (const racer of MK8_RACERS) racers.unregister(racer.id);
  });

  it('races the player against 7 other MK8 racers in their default karts, the player in slots 5–8', () => {
    const field = vsField('mk8-mario', DEFAULT_LOADOUT, vsSeed('stadium', 150, 'mk8-mario'))!;
    expect(field).toHaveLength(8);
    expect(field[0]).toMatchObject({
      kartId: 'mk8-mario',
      controller: 'local',
      loadout: DEFAULT_LOADOUT,
    });
    expect(field[0]!.gridSlot).toBeGreaterThanOrEqual(4);
    const cpus = field.slice(1);
    const ids = cpus.map((s) => s.kartId);
    expect(new Set(ids).size).toBe(7);
    for (const slot of cpus) {
      expect(slot.controller).toBe('ai');
      expect(MK8_RACERS.some((r) => r.id === slot.kartId)).toBe(true);
      expect(KART_IDS).not.toContain(slot.kartId);
      expect(slot.loadout?.racer).toBe(slot.kartId);
    }
    expect(ids).not.toContain('mk8-mario');
    expect(new Set(field.map((s) => s.gridSlot)).size).toBe(8);
  });

  it('is the same for the same picks and differs by course', () => {
    const a = vsField('mk8-mario', undefined, vsSeed('stadium', 150, 'mk8-mario'));
    expect(vsField('mk8-mario', undefined, vsSeed('stadium', 150, 'mk8-mario'))).toEqual(a);
    expect(vsField('mk8-mario', undefined, vsSeed('canyon', 150, 'mk8-mario'))).not.toEqual(a);
  });

  it('is what a VS Race from the menus races (not a Grand Prix or Time Trial)', () => {
    const vs = raceSetup({ mode: 'vs', course: 'stadium', loadout: DEFAULT_LOADOUT });
    expect(vs.field?.slice(1).every((s) => s.kartId.startsWith('mk8-'))).toBe(true);
    expect(raceSetup({ mode: 'time-trial', course: 'stadium' }).field).toHaveLength(1);
  });
});
