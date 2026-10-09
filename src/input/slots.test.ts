import { describe, expect, it, vi } from 'vitest';
import { NEUTRAL_INPUT } from '../sim/types';
import { MAX_PLAYERS, PlayerSlots, playerLabel } from './slots';
import { TestSource, type InputSource, type InputSourceProvider } from './sources';

describe('PlayerSlots (MK-144)', () => {
  it('binds a source per slot and frees the one it replaces', () => {
    const slots = new PlayerSlots();
    const first: InputSource = {
      kind: 'x',
      label: 'X',
      read: () => NEUTRAL_INPUT,
      dispose: vi.fn(),
    };
    const second = new TestSource();
    const changed = vi.fn();
    slots.onChange(changed);
    slots.bind(1, first);
    slots.bind(1, second);
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(slots.source(1)).toBe(second);
    slots.unbind(1);
    expect(slots.source(1)).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(3);
  });

  it('has 4 slots, P1–P4', () => {
    const slots = new PlayerSlots();
    expect(MAX_PLAYERS).toBe(4);
    expect(() => slots.bind(MAX_PLAYERS, new TestSource())).toThrow();
    expect(() => slots.bind(-1, new TestSource())).toThrow();
    expect(playerLabel(0)).toBe('P1');
    expect(playerLabel(3)).toBe('P4');
  });

  it('fills empty slots from the providers, else with a self-driving stand-in', () => {
    const slots = new PlayerSlots();
    const phone = new TestSource({ label: 'Phone' });
    const provider: InputSourceProvider = {
      id: 'phone',
      claim: (slot) => (slot === 2 ? phone : null),
    };
    const p1 = new TestSource();
    slots.bind(0, p1);
    slots.fill(3, [provider]);
    expect(slots.source(0)).toBe(p1);
    expect(slots.isStandIn(1)).toBe(true);
    expect(slots.source(1)?.autopilot).toBe(true);
    expect(slots.source(1)?.label).toBe('Auto');
    expect(slots.source(2)).toBe(phone);
    expect(slots.source(3)).toBeUndefined();
  });

  it('swaps a stand-in for a provider’s source on a later race, keeps real ones', () => {
    const slots = new PlayerSlots();
    slots.fill(2, []);
    const phone = new TestSource({ label: 'Phone' });
    slots.fill(2, [{ id: 'phone', claim: () => phone }]);
    expect(slots.source(1)).toBe(phone);
    const other = new TestSource();
    slots.fill(2, [{ id: 'other', claim: () => other }]);
    expect(slots.source(1)).toBe(phone);
  });

  it('reports the first slot that pressed pause and drains every press', () => {
    const slots = new PlayerSlots();
    const sources = [0, 1, 2].map(() => new TestSource());
    sources.forEach((source, slot) => slots.bind(slot, source));
    expect(slots.takePause(3)).toBe(-1);
    sources[2]?.pressPause();
    sources[1]?.pressPause();
    expect(slots.takePause(3)).toBe(1);
    expect(slots.takePause(3)).toBe(-1);
    // Slots past the race's players don't count.
    sources[2]?.pressPause();
    expect(slots.takePause(2)).toBe(-1);
  });
});

describe('TestSource', () => {
  it('reads what was set, over a neutral frame', () => {
    const source = new TestSource();
    expect(source.read()).toEqual(NEUTRAL_INPUT);
    source.set({ steer: -1, drift: true });
    expect(source.read()).toEqual({ ...NEUTRAL_INPUT, steer: -1, drift: true });
  });
});
