import { describe, expect, it } from 'vitest';
import { testRampRoute } from '../../mk8/content/courses/test-ramp/route';
import { LAP_LENGTH, tOnA } from '../../mk8/content/courses/test-ramp/layout';
import { validateRoute } from '../../sim/routeValidation';
import { EditorModel, emptyRoute, itemBoxLaterals, pointAt, type Hit } from './model';

const flat = (x: number, y: number, z: number): Hit => ({
  point: { x, y, z },
  normal: { x: 0, y: 1, z: 0 },
});

describe('pointAt', () => {
  it('snaps to the millimetre and leaves a flat up out', () => {
    expect(pointAt(flat(1.23456, 0.0004, -2.0006), 10)).toEqual({
      x: 1.235,
      y: 0,
      z: -2.001,
      width: 10,
    });
  });

  it('keeps a tilted normal as up', () => {
    const point = pointAt({ point: { x: 0, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 2 } }, 10);
    expect(point.up).toEqual({ x: 0, y: 0, z: 1 });
  });
});

describe('EditorModel', () => {
  it('appends points to a new route, then inserts by lap position', () => {
    const model = new EditorModel(emptyRoute());
    [flat(0, 0, 0), flat(50, 0, 0), flat(50, 0, 50), flat(0, 0, 50)].forEach((h) => {
      model.addPoint(h);
      model.select(undefined);
    });
    expect(model.route.points.map((p) => [p.x, p.z])).toEqual([
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ]);
    // Between the first two points along the lap.
    expect(model.addPoint(flat(25, 0, -1))).toBe(1);
    expect(model.selected).toBe(1);
    // With a point selected, the next one goes right after it.
    expect(model.addPoint(flat(40, 0, -1))).toBe(2);
    expect(model.route.points.map((p) => p.x)).toEqual([0, 25, 40, 50, 50, 0]);
  });

  it('moves, resizes and deletes points, with undo and redo', () => {
    const model = new EditorModel(testRampRoute);
    const count = testRampRoute.points.length;
    model.movePoint(1, flat(21, 0.5, 1));
    expect(model.route.points[1]).toMatchObject({ x: 21, y: 0.5, z: 1, width: 14 });
    model.setWidth(1, 10);
    model.setRacingLine(1, -2.345);
    expect(model.route.points[1]).toMatchObject({ width: 10, racingLine: -2.35 });
    model.setRacingLine(1, 0);
    expect(model.route.points[1]?.racingLine).toBeUndefined();
    model.select(3);
    model.deletePoint(1);
    expect(model.route.points).toHaveLength(count - 1);
    expect(model.selected).toBe(2);
    model.undo();
    model.undo();
    expect(model.route.points[1]).toMatchObject({ width: 10, racingLine: -2.35 });
    model.redo();
    expect(model.route.points[1]?.racingLine).toBeUndefined();
    for (let i = 0; i < 10; i += 1) model.undo();
    expect(model.route).toEqual(testRampRoute);
  });

  it('places gates in lap order and refuses a duplicate', () => {
    const model = new EditorModel({ ...testRampRoute, checkpoints: [0, 0.5] });
    model.place('gates', flat(40, 0, 1));
    expect(model.route.checkpoints).toEqual([0, expect.any(Number), 0.5]);
    expect(model.route.checkpoints[1]).toBeCloseTo(tOnA(40), 3);
    expect(model.place('gates', flat(40, 0, 1))).toBe('A gate is already here');
  });

  it('places respawns, grid slots, item rows, coins and zones along the route', () => {
    const model = new EditorModel({
      ...testRampRoute,
      respawnPoints: [],
      gridSlots: [],
      itemBoxRows: [],
      coinLines: [],
      zones: [],
    });
    model.place('respawn', flat(70, 0, 0));
    expect(model.route.respawnPoints[0]?.t).toBeCloseTo(tOnA(70), 3);
    model.place('grid', flat(-10, 0, 3));
    expect(model.route.gridSlots[0]?.lateral).toBeCloseTo(3, 1);
    model.place('itemBoxes', flat(75, 0, 0));
    expect(model.route.itemBoxRows[0]?.laterals).toEqual([-4.5, -1.5, 1.5, 4.5]);

    expect(model.place('coins', flat(18, 0, 0))).toBe('Click the end point');
    model.place('coins', flat(26, 0, 0));
    expect(model.route.coinLines).toHaveLength(1);
    expect(model.coinSpacing(0)).toBeCloseTo(2, 1);
    model.setCoinSpacing(0, 3);
    expect(model.coinSpacing(0)).toBeCloseTo(3, 2);

    model.place('zones', flat(90, 0, 0), 'glide');
    model.place('zones', flat(100, 3, 0), 'glide');
    model.place('zones', flat(30, 0, 0), 'antigrav');
    model.place('zones', flat(60, 0, 0), 'antigrav');
    model.place('zones', flat(60, 0, 75), 'water');
    model.place('zones', flat(100, -3, 85), 'water');
    model.place('zones', flat(140, 0, -5), 'boostBumper');
    expect(model.route.zones.map((z) => z.kind)).toEqual([
      'glide',
      'antigrav',
      'water',
      'boostBumper',
    ]);
    expect(model.route.zones[2]).toEqual({
      kind: 'water',
      min: { x: 60, y: -6, z: 75 },
      max: { x: 100, y: 0, z: 85 },
    });
    expect(model.route.zones[3]).toEqual({
      kind: 'boostBumper',
      position: { x: 140, y: 0.5, z: -5 },
      radius: 1,
    });

    model.remove('zones', 0);
    expect(model.route.zones[0]?.kind).toBe('antigrav');
  });

  it('sets the racing line at the nearest point', () => {
    const model = new EditorModel(testRampRoute);
    model.place('racingLine', flat(60, 0, -3));
    expect(model.route.points[3]?.racingLine).toBeCloseTo(-3, 1);
    expect(model.selected).toBe(3);
  });

  it('needs a sampled route before placing along it', () => {
    const model = new EditorModel(emptyRoute());
    expect(model.place('gates', flat(0, 0, 0))).toMatch(/at least 4/);
  });

  it('builds a valid auto grid behind the line', () => {
    const model = new EditorModel({ ...testRampRoute, gridSlots: [] });
    model.autoGrid();
    expect(model.route.gridSlots).toHaveLength(8);
    expect(model.route.gridSlots[0]?.t).toBeCloseTo(1 - 4 / LAP_LENGTH, 3);
    expect(validateRoute(model.route).filter((i) => i.layer === 'grid')).toEqual([]);
  });

  it('spreads item boxes across the road', () => {
    expect(itemBoxLaterals(14)).toEqual([-4.5, -1.5, 1.5, 4.5]);
    expect(itemBoxLaterals(4)).toEqual([0, 0, 0, 0]);
  });
});
