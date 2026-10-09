import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { racers } from '../content/racers';
import { defaultLoadout } from './content/parts';
import { MK8_RACERS } from './content/racers';
import { DEFAULT_LOADOUT, raceSetup } from './flow';
import {
  flowPlayers,
  nextPicker,
  otherLoadouts,
  pickingSlot,
  setSlotLoadout,
  slotLoadout,
} from './localPlayers';
import { vsField, vsSeed } from './modes/vsField';
import { registerMk8Content } from './register';
import type { Mk8Flow } from './ui/screens/session';

const luigi = defaultLoadout('mk8-luigi');
const peach = defaultLoadout('mk8-peach');
const yoshi = defaultLoadout('mk8-yoshi');

// MK-148: a VS Race for 2–4 people on one screen, each picking a racer and kart in turn.
describe('MK8 local multiplayer picks (MK-148)', () => {
  it('counts players in a VS Race only, 1–4', () => {
    expect(flowPlayers({ mode: 'vs', players: 3 })).toBe(3);
    expect(flowPlayers({ mode: 'vs' })).toBe(1);
    expect(flowPlayers({ mode: 'vs', players: 9 })).toBe(4);
    expect(flowPlayers({ mode: 'vs', players: 0 })).toBe(1);
    expect(flowPlayers({ mode: 'grand-prix', players: 3 })).toBe(1);
    expect(flowPlayers({ mode: 'time-trial', players: 2 })).toBe(1);
  });

  it('keeps P1’s pick as the loadout and P2–P4’s by slot', () => {
    const flow: Mk8Flow = { mode: 'vs', players: 3 };
    expect(pickingSlot(flow)).toBe(0);
    setSlotLoadout(flow, 0, DEFAULT_LOADOUT);
    setSlotLoadout(flow, 2, peach);
    setSlotLoadout(flow, 1, luigi);
    expect(flow.loadout).toEqual(DEFAULT_LOADOUT);
    expect(flow.others).toEqual([luigi, peach]);
    expect(slotLoadout(flow, 0)).toEqual(DEFAULT_LOADOUT);
    expect(slotLoadout(flow, 2)).toEqual(peach);
    expect(slotLoadout(flow, 3)).toBeUndefined();
  });

  it('hands each kart builder’s OK to the next player until the last one', () => {
    const flow: Mk8Flow = { mode: 'vs', players: 3 };
    expect(nextPicker(flow, 0)).toBe(1);
    expect(nextPicker(flow, 1)).toBe(2);
    expect(nextPicker(flow, 2)).toBeUndefined();
    expect(nextPicker({ mode: 'grand-prix', players: 3 }, 0)).toBeUndefined();
  });

  it('fills in a player who hasn’t picked (a scenario starting late)', () => {
    const flow: Mk8Flow = { mode: 'vs', players: 3, others: [luigi] };
    expect(otherLoadouts(flow, () => yoshi)).toEqual([luigi, yoshi]);
    expect(otherLoadouts({ mode: 'vs' }, () => yoshi)).toEqual([]);
  });
});

describe('MK8 VS Race field with several players (MK-148)', () => {
  beforeEach(() => registerMk8Content());
  afterEach(() => {
    for (const racer of MK8_RACERS) racers.unregister(racer.id);
  });

  it('is the same as a solo race’s with no other players', () => {
    const seed = vsSeed('stadium', 150, 'mk8-mario');
    expect(vsField('mk8-mario', DEFAULT_LOADOUT, seed, [])).toEqual(
      vsField('mk8-mario', DEFAULT_LOADOUT, seed),
    );
  });

  it('seats the players in karts 0–3 on the back half of the grid, CPUs filling the rest', () => {
    const humans = [
      { kartId: 'mk8-luigi', loadout: luigi },
      { kartId: 'mk8-peach', loadout: peach },
      { kartId: 'mk8-yoshi', loadout: yoshi },
    ];
    const field = vsField('mk8-mario', DEFAULT_LOADOUT, 7, humans)!;
    expect(field).toHaveLength(8);
    expect(field.slice(0, 4).map((s) => [s.kartId, s.controller])).toEqual([
      ['mk8-mario', 'local'],
      ['mk8-luigi', 'local'],
      ['mk8-peach', 'local'],
      ['mk8-yoshi', 'local'],
    ]);
    expect(field[2]?.loadout).toEqual(peach);
    expect(
      field
        .slice(0, 4)
        .map((s) => s.gridSlot)
        .sort(),
    ).toEqual([4, 5, 6, 7]);
    const cpus = field.slice(4);
    expect(cpus.every((s) => s.controller === 'ai')).toBe(true);
    // No CPU is one of the players' racers, and nobody shares a grid slot.
    const players = new Set(['mk8-mario', 'mk8-luigi', 'mk8-peach', 'mk8-yoshi']);
    expect(cpus.some((s) => players.has(s.kartId))).toBe(false);
    expect(new Set(field.map((s) => s.gridSlot)).size).toBe(8);
  });

  it('is what a VS Race for 2 from the menus races, P2 in their pick; Next course keeps it', () => {
    const setup = raceSetup({
      mode: 'vs',
      course: 'stadium',
      loadout: DEFAULT_LOADOUT,
      players: 2,
      others: [luigi],
    });
    expect(setup.players).toBe(2);
    expect(setup.others).toEqual([luigi]);
    expect(setup.field?.filter((s) => s.controller === 'local').map((s) => s.loadout)).toEqual([
      DEFAULT_LOADOUT,
      luigi,
    ]);
    expect(setup.field).toHaveLength(8);
  });

  it('races a Grand Prix or a solo VS Race with one player', () => {
    const gp = raceSetup({ mode: 'grand-prix', loadout: DEFAULT_LOADOUT, players: 3 });
    expect(gp.players).toBeUndefined();
    expect(gp.field?.filter((s) => s.controller === 'local')).toHaveLength(1);
    const solo = raceSetup({ mode: 'vs', course: 'stadium', loadout: DEFAULT_LOADOUT });
    expect(solo.players).toBeUndefined();
    expect(solo.field?.filter((s) => s.controller === 'local')).toHaveLength(1);
  });
});
