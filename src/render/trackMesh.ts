import * as THREE from 'three';
import { SUNNY_THEME, type TrackTheme } from '../content/tracks/theme';
import { swayDeckFrame } from '../sim/hazards/sway';
import type { SwayHazard } from '../sim/hazards/types';
import {
  inRange,
  type TrackGeometry,
  type TrackSample,
  type ZoneSurface,
} from '../sim/splineTrack';

const KERB_RED = new THREE.Color(0xd62828);
const KERB_WHITE = new THREE.Color(0xf8f9fa);
const LINE_DARK = new THREE.Color(0x222222);
const LINE_LIGHT = new THREE.Color(0xffffff);
const RAMP_A = new THREE.Color(0xffd60a);
const RAMP_B = new THREE.Color(0x1d1d1d);
const RAMP_STRIPE = 1;
/**
 * How each surface zone is drawn: two stripe colours and the stripe length, m (MK-49 adds ice,
 * sand and conveyors). Zones without an entry (offroad) aren't drawn.
 */
const ZONE_LOOKS: Partial<Record<ZoneSurface, { a: THREE.Color; b: THREE.Color; stripe: number }>> =
  {
    boostPad: { a: new THREE.Color(0xffb703), b: new THREE.Color(0xfb8500), stripe: 1.5 },
    ice: { a: new THREE.Color(0xd8f3ff), b: new THREE.Color(0xb8e4f5), stripe: 3 },
    sand: { a: new THREE.Color(0xe9c98f), b: new THREE.Color(0xdcb877), stripe: 4 },
    conveyor: { a: new THREE.Color(0x3a3d42), b: new THREE.Color(0xf2c230), stripe: 1 },
  };

const WALL_HEIGHT = 1.2;
const KERB_WIDTH = 0.9;
/** Kerbs only where the track bends at least this much per metre (rad/m). */
const KERB_CURVATURE = 0.01;
const KERB_STRIPE = 2;
const WALL_STRIPE = 6;
/** Small lifts so coplanar layers don't z-fight. */
const LIFT = { grass: 0.0, road: 0.03, kerb: 0.05, line: 0.06, pad: 0.06 };

/** Accumulates coloured triangles into one geometry (one draw call per material). */
class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colours: number[] = [];

  quad(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    d: THREE.Vector3,
    colour: THREE.Color,
  ) {
    // a-b-c-d counter-clockwise when seen from above/outside.
    for (const v of [a, b, c, a, c, d]) {
      this.positions.push(v.x, v.y, v.z);
      this.colours.push(colour.r, colour.g, colour.b);
    }
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colours, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}

function offset(sample: TrackSample, lateral: number, lift: number): THREE.Vector3 {
  return new THREE.Vector3(
    sample.x + sample.nx * lateral,
    sample.y + lift,
    sample.z + sample.nz * lateral,
  );
}

/** Heading change per metre around sample i. */
function curvature(geometry: TrackGeometry, i: number): number {
  const a = geometry.sample(i - 2);
  const b = geometry.sample(i + 2);
  const cross = a.tx * b.tz - a.tz * b.tx;
  return Math.abs(Math.asin(Math.max(-1, Math.min(1, cross)))) / 4;
}

/**
 * Whether a sample lies on one of the track's swaying decks (MK-61): those draw their own deck
 * (`render/hazards/sway.ts`), so the road isn't drawn under them.
 */
function onSwayDeck(decks: readonly SwayHazard[], sample: TrackSample): boolean {
  return decks.some((deck) => {
    const frame = swayDeckFrame(deck, sample);
    return frame.u >= 0 && frame.u <= 1 && Math.abs(frame.across) <= deck.halfWidth;
  });
}

/**
 * Builds road, grass verges, kerbs, walls and the start line for a spline track (ADR 0003), in the
 * track theme's palette (MK-49).
 */
export function createSplineTrackMesh(
  geometry: TrackGeometry,
  palette: TrackTheme['palette'] = SUNNY_THEME.palette,
): THREE.Group {
  const colours = {
    road: new THREE.Color(palette.road),
    verge: new THREE.Color(palette.verge),
    wallA: new THREE.Color(palette.wallA),
    wallB: new THREE.Color(palette.wallB),
    /** Deep grass on shortcuts: darker than the verges so it reads as slower. */
    infield: new THREE.Color(palette.infield),
  };
  const group = new THREE.Group();
  const ground = new MeshBuilder();
  const walls = new MeshBuilder();
  const n = geometry.samples.length;
  const grassOuter = geometry.def.offroadWidth;
  const decks = (geometry.def.hazards ?? []).filter(
    (hazard): hazard is SwayHazard => hazard.kind === 'sway',
  );

  for (let i = 0; i < n; i += 1) {
    const a = geometry.sample(i);
    const b = geometry.sample(i + 1);
    const half = (s: TrackSample) => s.width / 2;
    const wallA = half(a) + grassOuter;
    const wallB = half(b) + grassOuter;
    // Swaying decks draw themselves (walls: a deck has none, so there's nothing else to draw).
    if (decks.length && onSwayDeck(decks, a) && onSwayDeck(decks, b)) continue;

    // Grass verges (left and right), then road on top.
    ground.quad(
      offset(a, -wallA, LIFT.grass),
      offset(b, -wallB, LIFT.grass),
      offset(b, -half(b), LIFT.grass),
      offset(a, -half(a), LIFT.grass),
      colours.verge,
    );
    ground.quad(
      offset(a, half(a), LIFT.grass),
      offset(b, half(b), LIFT.grass),
      offset(b, wallB, LIFT.grass),
      offset(a, wallA, LIFT.grass),
      colours.verge,
    );
    ground.quad(
      offset(a, -half(a), LIFT.road),
      offset(b, -half(b), LIFT.road),
      offset(b, half(b), LIFT.road),
      offset(a, half(a), LIFT.road),
      colours.road,
    );

    // Red/white kerbs on bends.
    if (curvature(geometry, i) > KERB_CURVATURE) {
      const colour = Math.floor(a.s / KERB_STRIPE) % 2 === 0 ? KERB_RED : KERB_WHITE;
      for (const side of [-1, 1]) {
        const inner = (s: TrackSample) => side * (half(s) - KERB_WIDTH / 2);
        const outer = (s: TrackSample) => side * (half(s) + KERB_WIDTH / 2);
        const [l0, l1] = side < 0 ? [outer, inner] : [inner, outer];
        ground.quad(
          offset(a, l0(a), LIFT.kerb),
          offset(b, l0(b), LIFT.kerb),
          offset(b, l1(b), LIFT.kerb),
          offset(a, l1(a), LIFT.kerb),
          colour,
        );
      }
    }

    // Surface zones (boost pads: orange/yellow stripes…); ramps: yellow/black hazard stripes.
    const tA = a.s / geometry.length;
    for (const zone of geometry.def.surfaceZones) {
      const look = ZONE_LOOKS[zone.type];
      if (!look || !inRange(tA, zone)) continue;
      const colour = Math.floor(a.s / look.stripe) % 2 === 0 ? look.a : look.b;
      ground.quad(
        offset(a, zone.lateralMin, LIFT.pad),
        offset(b, zone.lateralMin, LIFT.pad),
        offset(b, zone.lateralMax, LIFT.pad),
        offset(a, zone.lateralMax, LIFT.pad),
        colour,
      );
    }
    if (geometry.def.ramps?.some((ramp) => inRange(tA, ramp))) {
      const colour = Math.floor(a.s / RAMP_STRIPE) % 2 === 0 ? RAMP_A : RAMP_B;
      ground.quad(
        offset(a, -half(a), LIFT.pad),
        offset(b, -half(b), LIFT.pad),
        offset(b, half(b), LIFT.pad),
        offset(a, half(a), LIFT.pad),
        colour,
      );
    }

    // Walls (skipped at gaps), striped so speed is readable.
    const wallColour = Math.floor(a.s / WALL_STRIPE) % 2 === 0 ? colours.wallA : colours.wallB;
    const t = a.s / geometry.length;
    for (const side of [-1, 1] as const) {
      if (!geometry.hasWall(t, side === 1 ? 'right' : 'left')) continue;
      const lat = side * wallA;
      const latB = side * wallB;
      const bottomA = offset(a, lat, 0);
      const bottomB = offset(b, latB, 0);
      const topA = offset(a, lat, WALL_HEIGHT);
      const topB = offset(b, latB, WALL_HEIGHT);
      walls.quad(bottomA, bottomB, topB, topA, wallColour);
    }
  }

  // Chequered start/finish line across the road at t = 0.
  const start = geometry.sample(0);
  const next = geometry.sample(2);
  const cells = Math.round(start.width);
  for (let row = 0; row < 2; row += 1) {
    for (let c = 0; c < cells; c += 1) {
      const l0 = -start.width / 2 + (c * start.width) / cells;
      const l1 = l0 + start.width / cells;
      const f0 = row / 2;
      const f1 = (row + 1) / 2;
      const at = (f: number, l: number) =>
        new THREE.Vector3(
          start.x + (next.x - start.x) * f + start.nx * l,
          start.y + LIFT.line,
          start.z + (next.z - start.z) * f + start.nz * l,
        );
      ground.quad(
        at(f0, l0),
        at(f1, l0),
        at(f1, l1),
        at(f0, l1),
        (c + row) % 2 ? LINE_DARK : LINE_LIGHT,
      );
    }
  }

  // Drivable infields (shortcuts): deep grass, or road (MK-61), triangulated (outlines may be concave).
  for (const cut of geometry.def.shortcuts ?? []) {
    const outline = cut.polygon.map((v) => new THREE.Vector2(v.x, v.z));
    const colour = cut.surface === 'road' ? colours.road : colours.infield;
    const at = (v: THREE.Vector2) => new THREE.Vector3(v.x, cut.y + LIFT.grass, v.y);
    for (const [i = 0, j = 0, k = 0] of THREE.ShapeUtils.triangulateShape(outline, [])) {
      const [p1, p2, p3] = [outline[i], outline[j], outline[k]];
      if (p1 && p2 && p3) ground.quad(at(p1), at(p2), at(p3), at(p3), colour);
    }
  }

  group.add(
    new THREE.Mesh(
      ground.build(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    ),
  );
  group.add(
    new THREE.Mesh(
      walls.build(),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    ),
  );

  // Terrain under and around the track so there's no void at the edges.
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const terrain = new THREE.Mesh(
    new THREE.PlaneGeometry(size.x + 400, size.z + 400),
    new THREE.MeshLambertMaterial({ color: palette.terrain }),
  );
  terrain.rotation.x = -Math.PI / 2;
  terrain.position.set(centre.x, bounds.min.y - 0.05, centre.z);
  group.add(terrain);

  return group;
}
