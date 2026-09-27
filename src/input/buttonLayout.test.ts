import { describe, expect, it } from 'vitest';
import {
  BUTTON_GAP_PX,
  clampOnScreen,
  DEFAULT_BUTTON_LAYOUT,
  dropButton,
  fromPosition,
  overlaps,
  sanitizeButtonLayout,
  separateButtons,
  toPosition,
  TOUCH_BUTTONS,
  type ButtonCircle,
} from './buttonLayout';

/** An iPhone in landscape (px). */
const AREA = { width: 844, height: 390 };

function onScreen(b: ButtonCircle): boolean {
  return (
    b.x - b.r >= BUTTON_GAP_PX - 1e-9 &&
    b.x + b.r <= AREA.width - BUTTON_GAP_PX + 1e-9 &&
    b.y - b.r >= BUTTON_GAP_PX - 1e-9 &&
    b.y + b.r <= AREA.height - BUTTON_GAP_PX + 1e-9
  );
}

describe('button layout (MK-57)', () => {
  it('clamping keeps a button on screen, whichever edge it was dragged past', () => {
    for (const [x, y] of [
      [-100, 50],
      [2000, 50],
      [300, -40],
      [300, 900],
      [-5, -5],
      [9999, 9999],
    ] as const) {
      const clamped = clampOnScreen({ x, y, r: 42 }, AREA);
      expect(onScreen(clamped), `${x},${y}`).toBe(true);
    }
    // Already on screen: left alone.
    expect(clampOnScreen({ x: 200, y: 150, r: 42 }, AREA)).toEqual({ x: 200, y: 150, r: 42 });
  });

  it('a drop on another button snaps back (null); a drop in free space stays, on screen', () => {
    const others = [
      { x: 60, y: 60, r: 30 },
      { x: 150, y: 60, r: 30 },
    ];
    expect(dropButton({ x: 70, y: 70, r: 42 }, others, AREA)).toBeNull();
    // Touching counts too: closer than the gap edge to edge.
    expect(
      dropButton({ x: 60, y: 60 + 30 + 42 + BUTTON_GAP_PX - 1, r: 42 }, others, AREA),
    ).toBeNull();
    expect(dropButton({ x: 400, y: 200, r: 42 }, others, AREA)).toEqual({ x: 400, y: 200, r: 42 });
    // Dropped off the screen: brought back on it.
    const placed = dropButton({ x: 400, y: -200, r: 42 }, others, AREA);
    expect(placed && onScreen(placed)).toBe(true);
  });

  it('separating pushes grown buttons apart and keeps them on screen', () => {
    // The default corner arrangement at 150%, and three buttons dropped on one spot.
    const cases = [
      {
        drift: { x: 60, y: 60, r: 63 },
        item: { x: 150, y: 140, r: 45 },
        brake: { x: 150, y: 50, r: 45 },
      },
      {
        drift: { x: 0, y: 0, r: 63 },
        item: { x: 0, y: 0, r: 45 },
        brake: { x: 0, y: 0, r: 45 },
      },
    ];
    for (const buttons of cases) {
      const out = separateButtons(buttons, AREA);
      for (const name of TOUCH_BUTTONS) expect(onScreen(out[name]), name).toBe(true);
      expect(overlaps(out.drift, out.item)).toBe(false);
      expect(overlaps(out.drift, out.brake)).toBe(false);
      expect(overlaps(out.item, out.brake)).toBe(false);
    }
  });

  it('positions are percentages of the safe area, and round-trip through px', () => {
    const b = { x: 211, y: 97.5, r: 30 };
    const position = toPosition(b, AREA);
    expect(position).toEqual({ x: 25, y: 25 });
    // Another phone: the same place relative to its screen.
    expect(fromPosition(position, 30, { width: 932, height: 430 })).toEqual({
      x: 233,
      y: 107.5,
      r: 30,
    });
  });

  it('stored layouts are checked: sizes clamped to 75–150 %, bad positions read as default', () => {
    expect(sanitizeButtonLayout(undefined)).toEqual(DEFAULT_BUTTON_LAYOUT);
    expect(sanitizeButtonLayout({ scale: 0.2, sizes: { item: 3 } })).toEqual({
      ...DEFAULT_BUTTON_LAYOUT,
      scale: 0.75,
      sizes: { drift: 1, item: 1.5, brake: 1 },
    });
    expect(
      sanitizeButtonLayout({ positions: { drift: { x: 1, y: 2 }, item: { x: 3, y: 4 } } })
        .positions,
    ).toBeNull();
  });
});
