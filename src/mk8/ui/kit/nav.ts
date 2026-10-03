// MK8 menu navigation (MK-104): which tile the cursor lands on for an arrow key, in a grid read
// left to right, top to bottom. Pure, so it is unit tested without a DOM.

export type NavKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export function isNavKey(key: string): key is NavKey {
  return key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown';
}

/** What a key does in an MK8 menu: move, OK (A), Back (B), or nothing. */
export type MenuAction = { kind: 'move'; key: NavKey } | { kind: 'ok' } | { kind: 'back' };

export function menuAction(key: string): MenuAction | undefined {
  if (isNavKey(key)) return { kind: 'move', key };
  if (key === 'Enter' || key === ' ') return { kind: 'ok' };
  if (key === 'Escape' || key === 'Backspace') return { kind: 'back' };
  return undefined;
}

/**
 * The index the cursor moves to from `index` in a grid of `count` tiles, `columns` wide. Moves
 * stop at the edges (no wrap, like MK8's grids); down into a short last row lands on its last tile.
 */
export function nextIndex(index: number, key: NavKey, count: number, columns: number): number {
  if (count <= 0) return 0;
  const cols = Math.max(1, Math.min(columns, count));
  const col = index % cols;
  switch (key) {
    case 'ArrowLeft':
      return col > 0 ? index - 1 : index;
    case 'ArrowRight':
      return col < cols - 1 && index + 1 < count ? index + 1 : index;
    case 'ArrowUp':
      return index - cols >= 0 ? index - cols : index;
    case 'ArrowDown': {
      const lastRowStart = Math.floor((count - 1) / cols) * cols;
      if (index >= lastRowStart) return index;
      return Math.min(index + cols, count - 1);
    }
  }
}
