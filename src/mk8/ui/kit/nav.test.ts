import { describe, expect, it } from 'vitest';
import { menuAction, nextIndex } from './nav';

describe('nextIndex', () => {
  // 4 × 2 grid of 8: 0 1 2 3 / 4 5 6 7
  it('moves within a grid and stops at the edges', () => {
    expect(nextIndex(1, 'ArrowRight', 8, 4)).toBe(2);
    expect(nextIndex(3, 'ArrowRight', 8, 4)).toBe(3);
    expect(nextIndex(4, 'ArrowLeft', 8, 4)).toBe(4);
    expect(nextIndex(1, 'ArrowDown', 8, 4)).toBe(5);
    expect(nextIndex(5, 'ArrowDown', 8, 4)).toBe(5);
    expect(nextIndex(6, 'ArrowUp', 8, 4)).toBe(2);
    expect(nextIndex(2, 'ArrowUp', 8, 4)).toBe(2);
  });

  it('down into a short last row lands on its last tile', () => {
    // 0 1 2 3 / 4 5
    expect(nextIndex(3, 'ArrowDown', 6, 4)).toBe(5);
    expect(nextIndex(5, 'ArrowRight', 6, 4)).toBe(5);
  });

  it('a column moves up and down only', () => {
    expect(nextIndex(0, 'ArrowDown', 3, 1)).toBe(1);
    expect(nextIndex(2, 'ArrowDown', 3, 1)).toBe(2);
    expect(nextIndex(1, 'ArrowRight', 3, 1)).toBe(1);
    expect(nextIndex(0, 'ArrowUp', 3, 1)).toBe(0);
  });

  it('an empty menu stays at 0', () => {
    expect(nextIndex(0, 'ArrowDown', 0, 4)).toBe(0);
  });
});

describe('menuAction', () => {
  it('maps keys to move / OK / Back', () => {
    expect(menuAction('ArrowUp')).toEqual({ kind: 'move', key: 'ArrowUp' });
    expect(menuAction('Enter')).toEqual({ kind: 'ok' });
    expect(menuAction(' ')).toEqual({ kind: 'ok' });
    expect(menuAction('Escape')).toEqual({ kind: 'back' });
    expect(menuAction('Backspace')).toEqual({ kind: 'back' });
    expect(menuAction('m')).toBeUndefined();
  });
});
