/**
 * Custom touch button layout (MK-57): one size for all buttons, a size per button, and (once the
 * player has moved one) where each button sits. Positions are percentages of the safe area,
 * measured from its bottom and from its **outer** edge (the side the buttons are on: right for a
 * right hand, left for a left hand), so a layout fits any phone, either landscape direction, and
 * mirrors with the Hand setting (MK-53).
 */

export type TouchButtonName = 'drift' | 'item' | 'brake';
export const TOUCH_BUTTONS: readonly TouchButtonName[] = ['drift', 'item', 'brake'];

/** A button's centre: % of the safe area's width from its outer edge, % of its height from the bottom. */
export interface ButtonPosition {
  x: number;
  y: number;
}

export interface ButtonLayout {
  /** Size of every button, 1 = the default look. */
  scale: number;
  /** Each button's own size on top of `scale` (long-press in the editor). */
  sizes: Record<TouchButtonName, number>;
  /** Where each button sits; null keeps the default arrangement. */
  positions: Record<TouchButtonName, ButtonPosition> | null;
}

export const BUTTON_SIZE_MIN = 0.75;
export const BUTTON_SIZE_MAX = 1.5;
/** Space kept between two buttons, and between a button and the screen edge (px). */
export const BUTTON_GAP_PX = 8;
/** Push-apart passes when a size change makes buttons touch. */
const SEPARATE_PASSES = 24;

export const DEFAULT_BUTTON_LAYOUT: ButtonLayout = {
  scale: 1,
  sizes: { drift: 1, item: 1, brake: 1 },
  positions: null,
};

export function defaultButtonLayout(): ButtonLayout {
  return { ...DEFAULT_BUTTON_LAYOUT, sizes: { ...DEFAULT_BUTTON_LAYOUT.sizes } };
}

export function clampSize(size: number): number {
  return Math.max(BUTTON_SIZE_MIN, Math.min(BUTTON_SIZE_MAX, size));
}

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** A stored layout, checked field by field: anything missing or malformed reads as the default. */
export function sanitizeButtonLayout(value: unknown): ButtonLayout {
  const layout = defaultButtonLayout();
  if (typeof value !== 'object' || value === null) return layout;
  const data = value as Record<string, unknown>;
  if (isNumber(data.scale)) layout.scale = clampSize(data.scale);
  const sizes = data.sizes as Record<string, unknown> | undefined;
  for (const name of TOUCH_BUTTONS) {
    const size = sizes?.[name];
    if (isNumber(size)) layout.sizes[name] = clampSize(size);
  }
  const positions = data.positions as Record<string, Partial<ButtonPosition>> | null | undefined;
  if (
    positions &&
    TOUCH_BUTTONS.every((n) => isNumber(positions[n]?.x) && isNumber(positions[n]?.y))
  ) {
    layout.positions = { drift: { x: 0, y: 0 }, item: { x: 0, y: 0 }, brake: { x: 0, y: 0 } };
    for (const name of TOUCH_BUTTONS) {
      const { x, y } = positions[name] as ButtonPosition;
      layout.positions[name] = { x: clampPercent(x), y: clampPercent(y) };
    }
  }
  return layout;
}

/** A button's size relative to the default look: the overall size times its own. */
export function buttonScale(layout: ButtonLayout, name: TouchButtonName): number {
  return layout.scale * layout.sizes[name];
}

// Geometry, in px inside the safe area: x from its outer edge, y from its bottom. Buttons are round.

export interface ButtonCircle {
  x: number;
  y: number;
  r: number;
}

export interface Area {
  width: number;
  height: number;
}

/** Keeps a button fully inside the area, `BUTTON_GAP_PX` from each edge (centred if it can't fit). */
export function clampOnScreen(button: ButtonCircle, area: Area): ButtonCircle {
  const axis = (value: number, length: number) => {
    const min = button.r + BUTTON_GAP_PX;
    const max = length - button.r - BUTTON_GAP_PX;
    return min > max ? length / 2 : Math.max(min, Math.min(max, value));
  };
  return { ...button, x: axis(button.x, area.width), y: axis(button.y, area.height) };
}

/** Whether two buttons are closer than `BUTTON_GAP_PX` edge to edge. */
export function overlaps(a: ButtonCircle, b: ButtonCircle): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + BUTTON_GAP_PX;
}

/**
 * Where a dragged button lands: `target` kept on screen, or null (snap back to where the drag
 * began) when it would sit on another button.
 */
export function dropButton(
  target: ButtonCircle,
  others: readonly ButtonCircle[],
  area: Area,
): ButtonCircle | null {
  const placed = clampOnScreen(target, area);
  return others.some((other) => overlaps(placed, other)) ? null : placed;
}

/**
 * Pushes buttons apart (after a size change) and keeps them on screen. Each touching pair moves
 * apart along the line between their centres, half each, until nothing touches or the passes run
 * out (a screen too small for all three at this size).
 */
export function separateButtons(
  buttons: Record<TouchButtonName, ButtonCircle>,
  area: Area,
): Record<TouchButtonName, ButtonCircle> {
  const out = {
    drift: clampOnScreen(buttons.drift, area),
    item: clampOnScreen(buttons.item, area),
    brake: clampOnScreen(buttons.brake, area),
  };
  for (let pass = 0; pass < SEPARATE_PASSES; pass++) {
    let moved = false;
    for (const [i, nameA] of TOUCH_BUTTONS.entries()) {
      for (const nameB of TOUCH_BUTTONS.slice(i + 1)) {
        const a = out[nameA];
        const b = out[nameB];
        if (!overlaps(a, b)) continue;
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        // Same centre: push sideways.
        const [ux, uy] = dist > 0 ? [(b.x - a.x) / dist, (b.y - a.y) / dist] : [1, 0];
        // A hair more than needed, so rounding doesn't leave them touching.
        const push = (a.r + b.r + BUTTON_GAP_PX - dist) / 2 + 0.5;
        out[nameA] = clampOnScreen({ ...a, x: a.x - ux * push, y: a.y - uy * push }, area);
        out[nameB] = clampOnScreen({ ...b, x: b.x + ux * push, y: b.y + uy * push }, area);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/** px (from the outer edge and bottom) → the stored percentages. */
export function toPosition(button: ButtonCircle, area: Area): ButtonPosition {
  return {
    x: clampPercent((button.x / area.width) * 100),
    y: clampPercent((button.y / area.height) * 100),
  };
}

/** The stored percentages → px centre in `area`. */
export function fromPosition(position: ButtonPosition, r: number, area: Area): ButtonCircle {
  return { x: (position.x / 100) * area.width, y: (position.y / 100) * area.height, r };
}
