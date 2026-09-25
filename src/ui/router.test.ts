import { describe, expect, it } from 'vitest';
import { registerScreen, Router, type ScreenHost } from './router';

declare module './router' {
  interface ScreenProps {
    'test-a': { label: string };
    'test-b': { label: string };
    'test-c': { label: string };
  }
}

/** Records what the router draws; a panel is a plain object standing in for the DOM element. */
function fakeHost() {
  const log: string[] = [];
  const host: ScreenHost = {
    open: (name) => {
      log.push(`open ${name}`);
      return {} as HTMLElement;
    },
    close: () => {
      log.push('close');
    },
  };
  return { host, log };
}

const mounted: string[] = [];
let refreshes = 0;
const keys: string[] = [];
for (const name of ['test-a', 'test-b', 'test-c'] as const) {
  registerScreen(name, (_panel, props) => {
    mounted.push(`${name}:${props.label}`);
    return {
      refresh: () => (refreshes += 1),
      onKey: (e) => keys.push(`${name}:${e.key}`),
    };
  });
}

describe('screen router (MK-37)', () => {
  it('shows registered screens with their props and tracks the current one', () => {
    mounted.length = 0;
    const { host, log } = fakeHost();
    const router = new Router(host);
    expect(router.current).toBe('none');
    router.show('test-a', { label: 'one' });
    router.show('test-b', { label: 'two' });
    expect(router.current).toBe('test-b');
    expect(mounted).toEqual(['test-a:one', 'test-b:two']);
    expect(log).toEqual(['open test-a', 'open test-b']);
  });

  it('back() re-shows the previous screen with its props, and stops at the first', () => {
    mounted.length = 0;
    const router = new Router(fakeHost().host);
    router.show('test-a', { label: 'one' });
    router.show('test-b', { label: 'two' });
    router.show('test-c', { label: 'three' });
    expect(router.back()).toBe(true);
    expect(router.current).toBe('test-b');
    expect(router.back()).toBe(true);
    expect(router.current).toBe('test-a');
    expect(router.back()).toBe(false);
    expect(router.current).toBe('test-a');
    expect(mounted).toEqual([
      'test-a:one',
      'test-b:two',
      'test-c:three',
      'test-b:two',
      'test-a:one',
    ]);
  });

  it('showing a screen already in the stack goes back to it instead of growing the stack', () => {
    const router = new Router(fakeHost().host);
    router.show('test-a', { label: 'one' });
    router.show('test-b', { label: 'two' });
    router.show('test-a', { label: 'again' });
    expect(router.back()).toBe(false);
  });

  it('hide() closes the overlay and clears the stack', () => {
    const { host, log } = fakeHost();
    const router = new Router(host);
    router.show('test-a', { label: 'one' });
    router.show('test-b', { label: 'two' });
    router.hide();
    expect(router.current).toBe('none');
    expect(log.at(-1)).toBe('close');
    expect(router.back()).toBe(false);
  });

  it('refresh() reaches the current screen only while one is shown', () => {
    refreshes = 0;
    const router = new Router(fakeHost().host);
    router.refresh();
    router.show('test-a', { label: 'one' });
    router.refresh();
    router.hide();
    router.refresh();
    expect(refreshes).toBe(1);
  });

  it('handleKey() goes to the current screen only', () => {
    keys.length = 0;
    const router = new Router(fakeHost().host);
    const press = (key: string) => router.handleKey({ key } as KeyboardEvent);
    press('Enter');
    router.show('test-a', { label: 'one' });
    press('Escape');
    router.show('test-b', { label: 'two' });
    press('ArrowLeft');
    router.hide();
    press('Enter');
    expect(keys).toEqual(['test-a:Escape', 'test-b:ArrowLeft']);
  });

  it('throws for a screen nobody registered', () => {
    const router = new Router(fakeHost().host);
    // @ts-expect-error: not a registered screen name
    expect(() => router.show('nope', {})).toThrow(/Unknown screen "nope"/);
  });
});
