// The track editor's document (MK-100): the route being edited, the selected point, two-click
// tools in progress and undo history. Pure (no DOM or three), so every edit is unit-tested; the page
// (`main.ts`) turns clicks on the collision mesh into `Hit`s and calls these.
import type { Vec3 } from '../../sim/math';
import { RouteGeometry, type RouteDef, type RoutePoint, type RouteZone } from '../../sim/route';
import { ROUTE_RULES } from '../../sim/routeValidation';

export type Layer =
  'route' | 'racingLine' | 'gates' | 'respawn' | 'grid' | 'itemBoxes' | 'coins' | 'zones';
export type ZoneTool = RouteZone['kind'];
/** Layers whose items live in one list of the route (everything but the points themselves). */
export type ListLayer = Exclude<Layer, 'route' | 'racingLine'>;

/** A click on the collision mesh: where, and the surface's normal there (facing the camera). */
export interface Hit {
  point: Vec3;
  normal: Vec3;
}

/** Editor defaults. Positions snap to `snap` m, lap fractions to `tSnap`, normals to `upSnap`. */
export const EDITOR = {
  snap: 0.001,
  tSnap: 1e-5,
  lateralSnap: 0.01,
  upSnap: 1e-4,
  /** A normal this close to +Y is stored as no `up` (the default). */
  flatUp: 1e-3,
  /** Width of the first point of a new route, m. */
  defaultWidth: 14,
  /** A new respawn point covers falls this far along the lap after it. */
  respawnSpan: 0.03,
  coinCount: 5,
  itemBoxes: 4,
  /** Item boxes keep this far in from the road edge, m. */
  itemBoxEdge: 2.5,
  /** A new water box reaches this far below the lower corner clicked, m. */
  waterDepth: 3,
  bumperRadius: 1,
  /** Auto grid: two by two behind the line, first row this far back, rows apart, right side staggered, m. */
  grid: { first: 4, rowGap: 6, stagger: 3, lateral: 3 },
  maxHistory: 200,
} as const;

const round = (v: number, step: number) => {
  const r = Math.round(v / step) * step;
  // Trim float noise (0.1 + 0.2) so exports stay short.
  return Number(r.toFixed(Math.max(0, Math.ceil(-Math.log10(step)))));
};
const wrapT = (t: number) => round(((t % 1) + 1) % 1, EDITOR.tSnap) % 1;

export function emptyRoute(): RouteDef {
  return {
    points: [],
    checkpoints: [0],
    respawnPoints: [],
    gridSlots: [],
    itemBoxRows: [],
    coinLines: [],
    zones: [],
  };
}

/** A route point at a hit: position snapped, the normal as `up` unless it's flat. */
export function pointAt(hit: Hit, width: number): RoutePoint {
  const p = hit.point;
  const point: RoutePoint = {
    x: round(p.x, EDITOR.snap),
    y: round(p.y, EDITOR.snap),
    z: round(p.z, EDITOR.snap),
    width,
  };
  const n = hit.normal;
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  const up = { x: n.x / len, y: n.y / len, z: n.z / len };
  if (Math.abs(up.x) > EDITOR.flatUp || Math.abs(up.z) > EDITOR.flatUp || up.y < 0)
    point.up = {
      x: round(up.x, EDITOR.upSnap),
      y: round(up.y, EDITOR.upSnap),
      z: round(up.z, EDITOR.upSnap),
    };
  return point;
}

/** Pending first click of a two-click tool (coin lines, glide/anti-grav sections, water boxes). */
interface Pending {
  layer: Layer;
  zone?: ZoneTool;
  t: number;
  lateral: number;
  point: Vec3;
}

export class EditorModel {
  route: RouteDef;
  /** Selected route point. */
  selected: number | undefined;
  pending: Pending | undefined;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private cachedGeometry: RouteGeometry | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(route: RouteDef = emptyRoute()) {
    this.route = structuredClone(route);
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  /** Sampled route, once it has enough points. */
  geometry(): RouteGeometry | undefined {
    if (this.route.points.length < ROUTE_RULES.minPoints) return undefined;
    this.cachedGeometry ??= new RouteGeometry(this.route);
    return this.cachedGeometry;
  }

  /** Lap fraction and lateral offset of a world point (snapped), when the route can be sampled. */
  locate(point: Vec3): { t: number; lateral: number } | undefined {
    const projection = this.geometry()?.project(point);
    if (!projection) return undefined;
    return { t: wrapT(projection.t), lateral: round(projection.lateral, EDITOR.lateralSnap) };
  }

  /**
   * Runs `change` as one undoable edit. `record: false` folds it into the last edit (a drag records
   * one snapshot when it starts, `checkpoint()`, then moves without filling the history).
   */
  edit(change: (route: RouteDef) => void, record = true): void {
    if (record) this.checkpoint();
    change(this.route);
    this.changed();
  }

  /** Records the current route as an undo step. */
  checkpoint(): void {
    this.undoStack.push(JSON.stringify(this.route));
    if (this.undoStack.length > EDITOR.maxHistory) this.undoStack.shift();
    this.redoStack = [];
  }

  /** Replaces the whole route (loading a draft or a file); undoable. */
  load(route: RouteDef): void {
    this.edit((r) => Object.assign(r, structuredClone(route)));
    this.selected = undefined;
    this.pending = undefined;
  }

  undo(): void {
    const previous = this.undoStack.pop();
    if (previous === undefined) return;
    this.redoStack.push(JSON.stringify(this.route));
    this.restore(previous);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (next === undefined) return;
    this.undoStack.push(JSON.stringify(this.route));
    this.restore(next);
  }

  private restore(json: string): void {
    this.route = JSON.parse(json) as RouteDef;
    if (this.selected !== undefined && this.selected >= this.route.points.length)
      this.selected = undefined;
    this.changed();
  }

  private changed(): void {
    this.cachedGeometry = undefined;
    for (const listener of this.listeners) listener();
  }

  select(index: number | undefined): void {
    this.selected = index;
    this.changed();
  }

  // --- Route points ---

  /**
   * Adds a point at `hit`: after the selected point, or (nothing selected) where it falls along
   * the lap, or at the end while the route is too short to sample. Selects it; returns its index.
   */
  addPoint(hit: Hit): number {
    const { points } = this.route;
    const neighbour = points[this.selected ?? points.length - 1];
    const point = pointAt(hit, neighbour?.width ?? EDITOR.defaultWidth);
    let index = points.length;
    if (this.selected !== undefined) index = this.selected + 1;
    else {
      const geometry = this.geometry();
      const t = geometry?.project(hit.point).t;
      if (geometry && t !== undefined) {
        const after = points.findIndex((p, i) => i > 0 && geometry.project(p).t > t);
        if (after > 0) index = after;
      }
    }
    this.edit((r) => r.points.splice(index, 0, point));
    this.selected = index;
    return index;
  }

  movePoint(index: number, hit: Hit, record = true): void {
    const old = this.route.points[index];
    if (!old) return;
    const moved = pointAt(hit, old.width);
    if (old.racingLine !== undefined) moved.racingLine = old.racingLine;
    this.edit((r) => (r.points[index] = moved), record);
  }

  deletePoint(index: number): void {
    if (!this.route.points[index]) return;
    this.edit((r) => r.points.splice(index, 1));
    if (this.selected !== undefined && this.selected >= index)
      this.selected = this.selected === index ? undefined : this.selected - 1;
  }

  setWidth(index: number, width: number, record = true): void {
    if (!this.route.points[index] || !(width > 0)) return;
    this.edit((r) => {
      const point = r.points[index];
      if (point) point.width = round(width, EDITOR.lateralSnap);
    }, record);
  }

  setRacingLine(index: number, offset: number, record = true): void {
    if (!this.route.points[index]) return;
    this.edit((r) => {
      const point = r.points[index];
      if (!point) return;
      const value = round(offset, EDITOR.lateralSnap);
      if (value === 0) delete point.racingLine;
      else point.racingLine = value;
    }, record);
  }

  /** Lap fraction and frame at route point `index` (for its width and racing-line handles). */
  frameAtPoint(index: number) {
    const point = this.route.points[index];
    const geometry = this.geometry();
    if (!point || !geometry) return undefined;
    return geometry.frameAt(geometry.project(point).t);
  }

  // --- Everything placed along the route ---

  /**
   * What a click does on `layer` (besides the route itself): returns a status line for the page.
   * Things placed along the route need it sampled first (4 points).
   */
  place(layer: Layer, hit: Hit, zone: ZoneTool = 'glide'): string {
    if (layer === 'route') {
      const index = this.addPoint(hit);
      return `Added point ${index + 1}`;
    }
    const at = this.locate(hit.point);
    if (!at) return `Place at least ${ROUTE_RULES.minPoints} route points first`;
    const { t, lateral } = at;
    switch (layer) {
      case 'racingLine': {
        const index = this.nearestPoint(t);
        if (index === undefined) return 'No route points';
        this.setRacingLine(index, lateral);
        this.selected = index;
        return `Racing line at point ${index + 1}: ${lateral} m`;
      }
      case 'gates': {
        const { checkpoints } = this.route;
        if (checkpoints.some((c) => Math.abs(c - t) < EDITOR.tSnap))
          return 'A gate is already here';
        const index = checkpoints.findIndex((c) => c > t);
        this.edit((r) => r.checkpoints.splice(index < 0 ? checkpoints.length : index, 0, t));
        return `Gate at t ${t}`;
      }
      case 'respawn':
        this.edit((r) =>
          r.respawnPoints.push({
            from: t,
            to: Math.min(wrapT(t + EDITOR.respawnSpan), 0.99999),
            t,
          }),
        );
        return `Respawn point at t ${t}`;
      case 'grid':
        if (this.route.gridSlots.length >= ROUTE_RULES.gridSlots)
          return `The grid already has ${ROUTE_RULES.gridSlots} slots`;
        this.edit((r) => r.gridSlots.push({ t, lateral }));
        return `Grid slot ${this.route.gridSlots.length}`;
      case 'itemBoxes': {
        const width = this.geometry()?.frameAt(t).width ?? EDITOR.defaultWidth;
        this.edit((r) => r.itemBoxRows.push({ t, laterals: itemBoxLaterals(width) }));
        return `Item box row at t ${t}`;
      }
      case 'coins':
      case 'zones':
        return this.placeTwoClick(layer, hit, t, lateral, zone);
    }
  }

  private placeTwoClick(
    layer: 'coins' | 'zones',
    hit: Hit,
    t: number,
    lateral: number,
    zone: ZoneTool,
  ): string {
    if (layer === 'zones' && zone === 'boostBumper') {
      const r = EDITOR.bumperRadius;
      const n = hit.normal;
      const position = {
        x: round(hit.point.x + (n.x * r) / 2, EDITOR.snap),
        y: round(hit.point.y + (n.y * r) / 2, EDITOR.snap),
        z: round(hit.point.z + (n.z * r) / 2, EDITOR.snap),
      };
      this.edit((route) => route.zones.push({ kind: 'boostBumper', position, radius: r }));
      return 'Boost bumper placed';
    }
    const first = this.pending;
    if (!first || first.layer !== layer || (layer === 'zones' && first.zone !== zone)) {
      this.pending = {
        layer,
        t,
        lateral,
        point: hit.point,
        ...(layer === 'zones' ? { zone } : {}),
      };
      this.changed();
      return 'Click the end point';
    }
    this.pending = undefined;
    if (layer === 'coins') {
      const line = { from: first.t, to: t, lateral: first.lateral, count: EDITOR.coinCount };
      this.edit((r) => r.coinLines.push(line));
      return `Coin line, ${line.count} coins`;
    }
    if (zone === 'water') {
      const a = first.point;
      const b = hit.point;
      const min = {
        x: round(Math.min(a.x, b.x), EDITOR.snap),
        y: round(Math.min(a.y, b.y) - EDITOR.waterDepth, EDITOR.snap),
        z: round(Math.min(a.z, b.z), EDITOR.snap),
      };
      const max = {
        x: round(Math.max(a.x, b.x), EDITOR.snap),
        y: round(Math.max(a.y, b.y), EDITOR.snap),
        z: round(Math.max(a.z, b.z), EDITOR.snap),
      };
      this.edit((r) => r.zones.push({ kind: 'water', min, max }));
      return 'Water box placed';
    }
    const kind = zone === 'antigrav' ? 'antigrav' : 'glide';
    this.edit((r) => r.zones.push({ kind, from: first.t, to: t }));
    return `${kind === 'glide' ? 'Glide ramp' : 'Anti-gravity section'} placed`;
  }

  cancelPending(): void {
    if (!this.pending) return;
    this.pending = undefined;
    this.changed();
  }

  /** Route point closest along the lap to `t`. */
  nearestPoint(t: number): number | undefined {
    const geometry = this.geometry();
    if (!geometry) return undefined;
    let best: number | undefined;
    let bestD = Infinity;
    this.route.points.forEach((p, i) => {
      const d = Math.abs(geometry.project(p).t - t);
      const wrapped = Math.min(d, 1 - d);
      if (wrapped < bestD) {
        bestD = wrapped;
        best = i;
      }
    });
    return best;
  }

  /** Removes item `index` of a list layer. */
  remove(layer: ListLayer, index: number): void {
    const list = listOf(this.route, layer) as unknown[];
    if (index < 0 || index >= list.length) return;
    this.edit((r) => (listOf(r, layer) as unknown[]).splice(index, 1));
  }

  /** Replaces item `index` of a list layer (the side panel's fields). */
  update<L extends ListLayer>(layer: L, index: number, value: ListItem<L>): void {
    if (index < 0 || index >= listOf(this.route, layer).length) return;
    this.edit((r) => ((listOf(r, layer) as ListItem<L>[])[index] = value));
  }

  /** Eight slots two by two behind the start line (replaces the grid). */
  autoGrid(): void {
    const length = this.geometry()?.length;
    if (!length) return;
    const { first, rowGap, stagger, lateral } = EDITOR.grid;
    const rows = ROUTE_RULES.gridSlots / 2;
    this.edit((r) => {
      r.gridSlots = Array.from({ length: rows }, (_, row) => row).flatMap((row) =>
        [-lateral, lateral].map((side) => ({
          t: wrapT(1 - (first + row * rowGap + (side > 0 ? stagger : 0)) / length),
          lateral: side,
        })),
      );
    });
  }

  /** Metres between coins of line `index`. */
  coinSpacing(index: number): number | undefined {
    const line = this.route.coinLines[index];
    const length = this.geometry()?.length;
    if (!line || !length || line.count < 2) return undefined;
    return (wrapT(line.to - line.from) * length) / (line.count - 1);
  }

  /** Keeps the line's start and count and moves its end so coins are `spacing` m apart. */
  setCoinSpacing(index: number, spacing: number): void {
    const line = this.route.coinLines[index];
    const length = this.geometry()?.length;
    if (!line || !length || line.count < 2 || !(spacing > 0)) return;
    this.update('coins', index, {
      ...line,
      to: wrapT(line.from + (spacing * (line.count - 1)) / length),
    });
  }
}

type ListItem<L extends ListLayer> = L extends 'gates'
  ? number
  : L extends 'respawn'
    ? RouteDef['respawnPoints'][number]
    : L extends 'grid'
      ? RouteDef['gridSlots'][number]
      : L extends 'itemBoxes'
        ? RouteDef['itemBoxRows'][number]
        : L extends 'coins'
          ? RouteDef['coinLines'][number]
          : RouteZone;

export function listOf(route: RouteDef, layer: ListLayer): readonly unknown[] {
  switch (layer) {
    case 'gates':
      return route.checkpoints;
    case 'respawn':
      return route.respawnPoints;
    case 'grid':
      return route.gridSlots;
    case 'itemBoxes':
      return route.itemBoxRows;
    case 'coins':
      return route.coinLines;
    case 'zones':
      return route.zones;
  }
}

/** `EDITOR.itemBoxes` boxes evenly across a road `width` m wide. */
export function itemBoxLaterals(width: number): number[] {
  const n: number = EDITOR.itemBoxes;
  const half = Math.max(0, width / 2 - EDITOR.itemBoxEdge);
  return Array.from({ length: n }, (_, i) =>
    round(n === 1 ? 0 : -half + (2 * half * i) / (n - 1), EDITOR.lateralSnap),
  );
}
