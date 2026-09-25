import { describe, expect, it } from 'vitest';
import { isTextEntry } from './keyboard';

describe('isTextEntry (MK-42)', () => {
  it('is true for text fields, so typing a nickname is not driving', () => {
    expect(isTextEntry({ tagName: 'INPUT' } as unknown as EventTarget)).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' } as unknown as EventTarget)).toBe(true);
  });

  it('is false for the page and buttons', () => {
    expect(isTextEntry(null)).toBe(false);
    expect(isTextEntry({ tagName: 'BODY' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntry({ tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
    expect(isTextEntry({} as EventTarget)).toBe(false);
  });
});
