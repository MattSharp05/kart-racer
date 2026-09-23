import { describe, expect, it } from 'vitest';
import { scenarios } from './index';
import { ScenarioRegistry, type Scenario } from './registry';

const stub = (name: string): Scenario => ({
  name,
  group: 'Test',
  description: '',
  defaultSeed: 1,
  setup: () => {
    throw new Error('unused');
  },
});

describe('ScenarioRegistry', () => {
  it('rejects duplicate names', () => {
    const registry = new ScenarioRegistry();
    registry.register(stub('a'));
    expect(() => registry.register(stub('a'))).toThrow(/Duplicate/);
  });

  it('returns undefined for unknown names', () => {
    expect(new ScenarioRegistry().get('nope')).toBeUndefined();
  });

  it.each(scenarios.list().map((s) => s.name))('%s is deterministic for a given seed', (name) => {
    const scenario = scenarios.get(name);
    expect(scenario).toBeDefined();
    if (!scenario) return;
    expect(scenario.setup(5)).toEqual(scenario.setup(5));
  });

  it('includes the basic scenarios', () => {
    expect(scenarios.get('empty')).toBeDefined();
    expect(scenarios.get('moving')?.setup(1).state.karts[0]?.speed).toBeGreaterThan(0);
  });
});
