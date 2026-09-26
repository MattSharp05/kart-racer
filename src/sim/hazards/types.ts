import type { Vec3 } from '../math';

/** What touching a hazard does to a kart: a push back, a spin-out, or a squash (flattened, long spin). */
export type HazardEffect = 'bump' | 'spin' | 'squash';

interface HazardBase {
  /** Overrides the kind's default effect. */
  effect?: HazardEffect;
  /** Start offset as a fraction of the period (0..1), so copies of one hazard can run out of step. */
  phase?: number;
}

/**
 * Travels round a closed `path` at constant speed, once per `period` s (a car); or, with
 * `activeFraction`, along an open path now and then (a snowball rolling across the road).
 */
export interface MoverHazard extends HazardBase {
  kind: 'mover';
  /**
   * World space, at ground level under the mover. A closed loop (the last point joins back to the
   * first), or an open path start → end when `activeFraction` is set.
   */
  path: Vec3[];
  period: number;
  /** Collider radius, m. */
  radius: number;
  /**
   * Open path (MK-59): travelled start → end during this share of each period, then gone (no
   * contact, not drawn) until the next. Absent: a closed loop, always there.
   */
  activeFraction?: number;
  /**
   * Render and audio only (MK-59): drawn as a ball of this colour rolling along its path, with a
   * shadow under it, rumbling as it rolls (a snowball, a boulder). Absent: a traffic kart.
   */
  rolling?: number;
  /**
   * Render only (MK-60): drawn as a road vehicle with a body of this colour, headlights and tail
   * lights (a truck: longer, with a box on the back). Absent: a traffic kart.
   */
  vehicle?: { body: number; truck?: boolean };
}

/** A bar spinning about `centre` (a swinging bridge beam, a windmill sail). */
export interface RotatorHazard extends HazardBase {
  kind: 'rotator';
  centre: Vec3;
  /** Half the bar's length (it reaches this far each side of the centre), m. */
  armLength: number;
  armWidth: number;
  /** Seconds per turn; negative turns clockwise seen from above. */
  period: number;
}

/**
 * A block that opens and closes on a timer (a crusher). Open, then drops, stays closed for
 * `closedFraction` of the period, then rises (`tuning.hazards.crusherMoveFraction` each way).
 */
export interface PeriodicHazard extends HazardBase {
  kind: 'periodic';
  centre: Vec3;
  /** Footprint half sizes across (local X) and along (local Z) its heading, m. */
  halfWidth: number;
  halfLength: number;
  heading: number;
  period: number;
  closedFraction: number;
}

/** An area that switches on for part of each period (a sandstorm): changes grip and visibility. */
export interface ZoneEffectHazard extends HazardBase {
  kind: 'zoneEffect';
  centre: Vec3;
  radius: number;
  period: number;
  /** Share of the period it's on, starting at the period's start. */
  activeFraction: number;
  /** Sideways grip × this inside while on. */
  grip: number;
  /** Render only: fog distance inside while on, m. */
  visibility: number;
  /** HUD warning shown `tuning.hazards.warningSeconds` before it switches on (e.g. a sandstorm). */
  warning?: string;
  /** Render only: colour of the dust blowing inside while on (no dust when absent). */
  dust?: number;
}

/**
 * A swaying deck (MK-61: a rope bridge): a straight strip from `from` to `to` that leans from side
 * to side on a timer, pushing karts on it sideways. It is anchored at both ends, so the sway (and
 * the push) is strongest mid-span and fades to nothing at the anchors. Scripted, not physics: the
 * lean is a sine of the tick. The track surface under it is drawn by its view instead.
 */
export interface SwayHazard extends HazardBase {
  kind: 'sway';
  /** The deck's centreline ends, world space, at deck level. */
  from: Vec3;
  to: Vec3;
  /** Half the deck's width (the push acts on karts within it), m. */
  halfWidth: number;
  /** Seconds per full sway (right, back, left, back). */
  period: number;
  /** Peak sideways push mid-span, m/s² (towards the side the deck leans to). */
  push: number;
}

/** A hazard in a track's `hazards[]` (MK-49). Adding a kind adds a member here and a file next to it. */
export type HazardDef =
  MoverHazard | RotatorHazard | PeriodicHazard | ZoneEffectHazard | SwayHazard;

/** Where a hazard is and what it's doing at one moment: a pure function of the tick. */
export interface HazardPose {
  x: number;
  y: number;
  z: number;
  /** Facing (movers) or rotation (rotators, crushers), radians, like a kart's heading. */
  heading: number;
  /**
   * 0..1: how closed a crusher is, how strong a zone is (1 = on). Movers and rotators: 1. Sway
   * decks: −1..1, how far and which way it leans mid-span (positive = to its right).
   */
  amount: number;
}

/** A kart touching a hazard: the push-out direction (unit, XZ, away from the hazard) and depth. */
export interface HazardContact {
  nx: number;
  nz: number;
  depth: number;
  /** Overrides the hazard's effect for this contact (e.g. the side of a closed crusher bumps). */
  effect?: HazardEffect;
}

/**
 * The behaviour of one hazard kind (registered in `hazards/index.ts`). Written as methods so a
 * kind for one def type fits the registry of all of them.
 */
export interface HazardKind<D extends HazardDef = HazardDef> {
  /** The `kind` string its defs carry. */
  id: D['kind'];
  defaultEffect: HazardEffect;
  /** Pose at `ticks` (may be fractional: the renderer draws between ticks). Pure. */
  pose(def: D, ticks: number): HazardPose;
  /** Whether a kart centred at `position` with radius `radius` touches it. */
  contact?(def: D, pose: HazardPose, position: Vec3, radius: number): HazardContact | undefined;
  /** Sideways push on a kart on the ground at `position` (swaying decks), m/s², world XZ. */
  push?(def: D, pose: HazardPose, position: Vec3): { x: number; z: number } | undefined;
  /** Sideways grip multiplier at `position` (zone effects). */
  grip?(def: D, pose: HazardPose, position: Vec3): number;
  /** Seconds until it next switches on (0 while on), for hazards with a HUD warning. */
  secondsUntilOn?(def: D, ticks: number): number;
  /** The HUD warning text, if it has one. */
  warning?(def: D): string | undefined;
}
