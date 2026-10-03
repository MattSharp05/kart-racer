import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../game/storage/store';
import { MK8_PREFS_KEY, readMk8Prefs, writeMk8Prefs } from './prefs';

describe('MK8 prefs (MK-117)', () => {
  it('remembers the last racer under its own key', () => {
    const store = new MemoryStore();
    expect(readMk8Prefs(store)).toEqual({});
    writeMk8Prefs(store, { racer: 'mk8-luigi' });
    expect(readMk8Prefs(store)).toEqual({ racer: 'mk8-luigi' });
    expect(JSON.parse(store.get(MK8_PREFS_KEY) ?? '')).toEqual({ racer: 'mk8-luigi' });
    expect(store.get('kart-racer:prefs')).toBeNull();
  });

  it('reads broken or odd values as nothing remembered', () => {
    const store = new MemoryStore();
    store.set(MK8_PREFS_KEY, '{broken');
    expect(readMk8Prefs(store)).toEqual({});
    store.set(MK8_PREFS_KEY, JSON.stringify({ racer: 7 }));
    expect(readMk8Prefs(store)).toEqual({});
  });
});
