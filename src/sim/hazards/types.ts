import type { Vec3 } from '../math';

/** What touching a hazard does to a kart: a push back, a spin-out, or a squash (flattened, long spin). */
export type HazardEffect = 'bump' | 'spin' | 'squash';

interface HazardBase {
  /** Overrides the kind's default effect. */
  effect?: HazardEffect;
  /** Start offset as a fraction of the period (0..1), so copies of one hazard can run out of step. */
  phase?: number;
}

/** Travels round a closed `path` at constant speed, once per `period` s (a car, a rolling snowball). */
export interface MoverHazard extends HazardBase {
  kind: 'mover';
  /** Closed loop, world space (the last point joins back to the first). */
  path: Vec3[];
  period: number;
  /** Collider radius, m. */
  radius: number;
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

/** A hazard in a track's `hazards[]` (MK-49). Adding a kind adds a member here and a file next to it. */
export type HazardDef = MoverHazard | RotatorHazard | PeriodicHazard | ZoneEffectHazard;

/** Where a hazard is and what it's doing at one moment: a pure function of the tick. */
export interface HazardPose {
  x: number;
  y: number;
  z: number;
  /** Facing (movers) or rotation (rotators, crushers), radians, like a kart's heading. */
  heading: number;
  /** 0..1: how closed a crusher is, how strong a zone is (1 = on). Movers and rotators: 1. */
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
  /** Sideways grip multiplier at `position` (zone effects). */
  grip?(def: D, pose: HazardPose, position: Vec3): number;
  /** Seconds until it next switches on (0 while on), for hazards with a HUD warning. */
  secondsUntilOn?(def: D, ticks: number): number;
  /** The HUD warning text, if it has one. */
  warning?(def: D): string | undefined;
}
