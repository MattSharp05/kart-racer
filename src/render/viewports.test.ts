import { describe, expect, it } from 'vitest';
import { MAX_VIEW_ASPECT, pixelRect, splitViews, viewFov, type ViewRect } from './viewports';

const area = (rects: ViewRect[]) => rects.reduce((sum, r) => sum + r.w * r.h, 0);

describe('split-screen layouts (MK-145)', () => {
  it('one player has the whole screen', () => {
    expect(splitViews(1)).toEqual({ views: [{ x: 0, y: 0, w: 1, h: 1 }] });
  });

  it('two players: top and bottom by default, side by side as an option', () => {
    expect(splitViews(2).views).toEqual([
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ]);
    expect(splitViews(2, 'side').views).toEqual([
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ]);
  });

  it('three players: quadrants, P1 top left, the overview in the empty bottom-right one', () => {
    const { views, overview } = splitViews(3);
    expect(views.map((r) => [r.x, r.y])).toEqual([
      [0, 0],
      [0.5, 0],
      [0, 0.5],
    ]);
    expect(overview).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(area([...views, overview!])).toBe(1);
  });

  it('four players: four quadrants, no overview; the layout option only matters for two', () => {
    for (const layout of ['stacked', 'side'] as const) {
      const { views, overview } = splitViews(4, layout);
      expect(views).toHaveLength(4);
      expect(overview).toBeUndefined();
      expect(area(views)).toBe(1);
    }
  });

  it('pixel rects tile an odd-sized canvas exactly, origin bottom left', () => {
    const [top, bottom] = splitViews(2).views.map((r) => pixelRect(r, 1001, 721));
    expect(top).toEqual({ x: 0, y: 360, w: 1001, h: 361 });
    expect(bottom).toEqual({ x: 0, y: 0, w: 1001, h: 360 });
    const quads = splitViews(4).views.map((r) => pixelRect(r, 1001, 721));
    expect(quads.reduce((sum, q) => sum + q.w * q.h, 0)).toBe(1001 * 721);
  });

  it('very wide views narrow their vertical FOV to keep the horizontal one; others keep it', () => {
    expect(viewFov(62, 16 / 9)).toBe(62);
    expect(viewFov(62, MAX_VIEW_ASPECT)).toBe(62);
    const aspect = 32 / 9;
    const fov = viewFov(62, aspect);
    expect(fov).toBeLessThan(62);
    const horizontal = (v: number, a: number) => Math.atan(Math.tan((v * Math.PI) / 360) * a);
    expect(horizontal(fov, aspect)).toBeCloseTo(horizontal(62, MAX_VIEW_ASPECT), 10);
  });
});
