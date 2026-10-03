import { describe, expect, it } from 'vitest';
import { scenarios } from '../../../scenarios';
import { STAGE_DEMOS } from '../../render/demos';
import { flowScreens, Mk8ScreenFlow } from './index';
import { MK8_MODES, type Mk8Screen } from './session';

const ids = (screens: Mk8Screen[]) => screens.map((s) => s.id);

describe('MK8 screen flow (MK-142)', () => {
  const flow = new Mk8ScreenFlow();

  it('finds every screen file, in order.ts’s order', () => {
    expect(ids(flowScreens())).toEqual(['title', 'mode', 'char', 'kart', 'cc', 'cup']);
    expect(flow.first().id).toBe('title');
  });

  it('goes title → mode → character → kart → engine class → cups', () => {
    const gp = { mode: 'grand-prix' } as const;
    expect(flow.next('title', gp).id).toBe('mode');
    expect(flow.next('mode', gp).id).toBe('char');
    expect(flow.next('char', gp).id).toBe('kart');
    expect(flow.next('kart', gp).id).toBe('cc');
    expect(flow.next('cc', gp).id).toBe('cup');
    expect(() => flow.next('cup', gp)).toThrow(/nothing comes after/);
  });

  it('skips the engine class in Time Trial', () => {
    expect(flow.next('kart', { mode: 'time-trial' }).id).toBe('cup');
  });

  it('opens scenario starts over the screens that lead there, with their choices', () => {
    expect(flow.start('title')).toEqual({ flow: {}, screens: [] });
    expect(ids(flow.start('mode')?.screens ?? [])).toEqual(['mode']);
    expect(ids(flow.start('kart')?.screens ?? [])).toEqual(['mode', 'char', 'kart']);
    expect(flow.start('cup')?.flow).toEqual({ mode: 'grand-prix', engineClass: 150 });
    const course = flow.start('course');
    expect(course?.flow).toEqual({ mode: 'vs', engineClass: 150 });
    expect(ids(course?.screens ?? [])).toEqual(['mode', 'char', 'kart', 'cc', 'cup']);
    expect(flow.start('load')).toBeUndefined();
    expect(flow.start('constructor')).toBeUndefined();
  });

  it('rejects screens missing from order.ts, or listed without a file', () => {
    const screen = (id: string): Mk8Screen => ({ id, build: () => () => ({}) as never });
    expect(() => flowScreens({ a: screen('a'), x: screen('x') }, ['a'])).toThrow(/isn't in order/);
    expect(() => flowScreens({ a: screen('a') }, ['a', 'b'])).toThrow(/no screen file/);
    expect(ids(flowScreens({ b: screen('b'), a: screen('a'), s: undefined }, ['a', 'b']))).toEqual([
      'a',
      'b',
    ]);
  });

  it('knows every MK8 Mode start a scenario uses', () => {
    const fixed = [
      'load',
      'loading-demo',
      'not-installed',
      'ui-kit',
      'password',
      'course-password',
    ];
    const known = new Set([...fixed, ...Object.keys(STAGE_DEMOS), ...flow.starts()]);
    expect(known.size).toBe(fixed.length + Object.keys(STAGE_DEMOS).length + flow.starts().length);
    // A race scenario's `mk8Start` is its MK8 mode (MK-121: the results' mode).
    for (const mode of MK8_MODES) known.add(mode.id);
    for (const scenario of scenarios.list()) {
      const setup = scenario.setup(scenario.defaultSeed);
      if (setup.mk8Start) expect(known, scenario.name).toContain(setup.mk8Start);
      if (setup.screen === 'mk8' && !setup.mk8Start) expect(scenario.name).toBe('mk8-mode');
    }
  });
});
