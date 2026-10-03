import { describe, expect, it } from 'vitest';
import { testRampRoute } from './content/courses/test-ramp/route';
import {
  clearEditorRoute,
  editorRouteKey,
  loadEditorRoute,
  saveEditorRoute,
  testDriveUrl,
} from './editorRoute';

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (k) => items.get(k) ?? null,
    key: (i) => [...items.keys()][i] ?? null,
    removeItem: (k) => void items.delete(k),
    setItem: (k, v) => void items.set(k, v),
  };
}

describe('editor route handoff', () => {
  it('saves, loads and clears a route per course', () => {
    const storage = memoryStorage();
    expect(loadEditorRoute('test-ramp', storage)).toBeUndefined();
    saveEditorRoute('test-ramp', testRampRoute, storage);
    expect(loadEditorRoute('test-ramp', storage)).toEqual(testRampRoute);
    expect(loadEditorRoute('other', storage)).toBeUndefined();
    clearEditorRoute('test-ramp', storage);
    expect(loadEditorRoute('test-ramp', storage)).toBeUndefined();
  });

  it('ignores broken or foreign data', () => {
    const storage = memoryStorage();
    storage.setItem(editorRouteKey('a'), '{not json');
    storage.setItem(editorRouteKey('b'), JSON.stringify({ points: [] }));
    expect(loadEditorRoute('a', storage)).toBeUndefined();
    expect(loadEditorRoute('b', storage)).toBeUndefined();
  });

  it('links the course free-drive scenario', () => {
    expect(testDriveUrl('test-ramp')).toBe('/?scenario=mk8-test-ramp-free&editorRoute=1');
  });
});
