import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Game } from './game';
import { installTestApi } from './testApi';

describe('test API step (MK-77)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function install() {
    vi.stubGlobal('window', new EventTarget());
    const calls: string[] = [];
    const game = {
      state: { tick: 0 },
      stepTicks: (n: number) => calls.push(`step ${n}`),
    } as unknown as Game;
    const api = installTestApi(
      game,
      { before: () => calls.push('before'), after: () => calls.push('after') },
      undefined,
      () => ({ calls: 0, triangles: 0 }),
      () => 0,
    );
    return { api, calls };
  }

  it('syncs the scene before the ticks and shows it after', () => {
    const { api, calls } = install();
    api.step(2);
    expect(calls).toEqual(['before', 'step 2', 'after']);
  });

  it('render: false touches neither', () => {
    const { api, calls } = install();
    api.step(3, { render: false });
    expect(calls).toEqual(['step 3']);
  });
});
