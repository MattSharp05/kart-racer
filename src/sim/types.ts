import type { KartId } from './data/karts';
import type { Vec3 } from './math';
import type { EngineClass } from './tuning';

/** One player's controls for one tick. Humans and AI both produce these. */
export interface InputFrame {
  /** 0..1 */
  throttle: number;
  /** 0..1 */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  drift: boolean;
  item: boolean;
  /** Ask to be picked up and put back on the track (R key). */
  respawn?: boolean;
}

export const NEUTRAL_INPUT: Readonly<InputFrame> = Object.freeze({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  item: false,
});

export type DriftTier = 0 | 1 | 2 | 3;

export interface DriftState {
  /** 1 = drifting right, -1 = left, 0 = not drifting. */
  direction: -1 | 0 | 1;
  /** Seconds of (weighted) drift charge. */
  charge: number;
  tier: DriftTier;
}

/** A computer driver's personality and memory (MK-14). */
export interface AiState {
  /** Offset from the racing line this driver prefers, m. */
  lineOffset: number;
  /** 0.85–1.0: scales cornering speed; lower = more cautious. */
  skill: number;
  /** 0–1: how eager it is to use items and bump (items: MK-21). */
  aggression: number;
  /** Seconds spent (nearly) stopped while racing. */
  stuckTime: number;
  /** Seconds left of backing up to get unstuck. */
  recoverTime: number;
  /** Holding a drift through the current corner (MK-15). */
  drifting?: boolean;
  /** Top-speed multiplier from rubber-banding this tick (1 = none). */
  speedScale?: number;
  /** Extra sideways offset this tick, m: steering towards item boxes or around bananas (MK-21). */
  steerOffset?: number;
  /** Seconds before it may use the item it holds (seeded "thinking time", MK-21). */
  itemDelay?: number;
  /** Seconds it has been holding the current item. */
  itemHeld?: number;
}

/** Per-kart lap and checkpoint progress (MK-11). */
export interface KartRace {
  /** Current lap, 1-based. 0 = on the grid, not yet across the start line. */
  lap: number;
  /** Index into the track's checkpoints of the next one to pass (0 = the finish line). */
  nextCheckpoint: number;
  /** Lap fraction last tick, to detect crossings. */
  lastT: number;
  /** Tick the current lap started. */
  lapStartTick: number;
  /** Completed lap times, seconds. */
  lapTimes: number[];
  /** Seconds spent driving against the track direction. */
  wrongWayTime: number;
  wrongWay: boolean;
  /** Tick the kart finished the race (MK-12). */
  finishTick?: number;
  /** Countdown only: tick since which throttle has been held (for the rocket start). */
  throttleSince?: number;
  /** Seconds left of an engine stall (too-early rocket start): no drive. */
  stallTimer: number;
}

/** Race settings and timing (MK-12). */
export interface RaceInfo {
  /** Laps to finish. */
  laps: number;
  /** Tick the countdown started. */
  countdownStartTick: number;
  /** Tick of GO (countdown end); race times are measured from here. */
  goTick: number;
  /** AI speeds up when far behind the player and eases off when far ahead (MK-15). */
  rubberBand?: boolean;
}

/**
 * Who drives a kart (MK-38): a player on this device, a player elsewhere (online), or the AI. The
 * sim treats `local` and `remote` alike (it just reads their inputs); only `ai` karts get AI input.
 */
export type KartController = 'local' | 'remote' | 'ai';

export interface KartState {
  id: number;
  /** Which of the four karts this is (stats + model). */
  kartType: KartId;
  controller: KartController;
  /** Display name (online nicknames); the kart's own name is used when absent. */
  name?: string;
  position: Vec3;
  /** World-space velocity, m/s. */
  velocity: Vec3;
  /** Radians in (-π, π]; 0 faces −Z, positive turns left. */
  heading: number;
  /** Signed speed along the heading, m/s (negative when reversing). */
  speed: number;
  grounded: boolean;
  drift: DriftState;
  /** Whether the drift button was held last tick (to detect presses and releases). */
  driftHeld: boolean;
  /** Seconds of boost left (mini-turbo; later mushrooms, boost pads, rocket start). */
  boostTimer: number;
  /** Seconds since the kart last left the ground (0 while grounded). */
  airTime: number;
  /** Ramp trick state: `ready` after launching off a ramp, `done` once drift is tapped in the air. */
  trick: 'none' | 'ready' | 'done';
  race: KartRace;
  item: KartItem;
  /** Respawn (MK-13): seconds left of being carried back to the track (0 = not respawning). */
  respawnTimer: number;
  /** Seconds of invulnerability left after a respawn (blinks; items ignore the kart). */
  invulnerableTimer: number;
  /** Last lap fraction where the kart was safely on the ground — where it gets put back. */
  lastSafeT: number;
  /** Seconds spent off the track surface / off the ground edge. */
  outTime: number;
  /** Seconds until the respawn button works again. */
  respawnCooldown: number;
  /** Seconds left of a spin-out after being hit (MK-17): no control until 0. */
  spinTimer: number;
  /** Seconds of star power left (MK-20): faster, immune, knocks karts it touches. */
  starTimer: number;
  /** Seconds left shrunk by lightning (MK-20): slower, can be run over. */
  shrinkTimer: number;
  /** The AI driver's personality and memory, on karts with `controller: 'ai'` (MK-14). */
  ai?: AiState;
  /** Timed item effects on this kart (MK-52): shields, magnet pulls, ink… Oldest first. */
  effects: KartEffect[];
}

/**
 * A timed effect on a kart (MK-52), defined by an item (`ItemContent.effects`) and driven by its
 * hooks (`sim/items/effects.ts`). Plain data so it travels in the online snapshot.
 */
export interface KartEffect {
  /** A registered effect id. */
  kind: string;
  /** Ticks left; the effect ends (its `onExpire` runs) when this reaches 0. */
  ticksLeft: number;
  /** The kart that caused it (−1 = none). */
  by: number;
  /** The effect's own numbers (e.g. hits a shield can still block). */
  data: number[];
}

export type RacePhase = 'free' | 'countdown' | 'racing' | 'finished';

/** An item id: any id registered in `src/content/items/` (ADR 0007), validated on lookup. */
export type ItemId = string;

/** An item box on the track (MK-16): active, or waiting to reappear. */
export interface ItemBoxEntity {
  id: number;
  kind: 'itemBox';
  position: Vec3;
  /** Seconds until it reappears after being hit (0 = active). */
  respawnTimer: number;
}

/** A banana on (or flying to) the track (MK-17). */
export interface BananaEntity {
  id: number;
  kind: 'banana';
  position: Vec3;
  /** Where a thrown banana left from (for drawing its arc). */
  from: Vec3;
  /** Seconds left in the air when thrown; it can't be hit until it lands. */
  flightTimer: number;
  ownerId: number;
  /** Seconds the owner is still immune to it. */
  ownerImmune: number;
}

/** A shell on the track (MK-18 green, MK-19 red). Moves at constant speed along `direction`. */
export interface ShellEntity {
  id: number;
  kind: 'shell';
  colour: 'green' | 'red';
  position: Vec3;
  /** Travel direction on the XZ plane (unit vector). */
  direction: { x: number; z: number };
  speed: number;
  bounces: number;
  /** Seconds left before it disappears. */
  life: number;
  ownerId: number;
  /** Seconds the thrower is still immune to it. */
  ownerImmune: number;
  /** Red shells: the kart being chased (−1 = none, flies straight). */
  targetId: number;
}

/**
 * A general item entity (MK-52): a projectile or area whose behaviour (straight, homing, returning,
 * area) and collision rules come from its registered spec (`ItemContent.entities`).
 */
export interface ItemEntity {
  id: number;
  kind: 'item';
  /** The registered entity spec that drives it. */
  spec: string;
  position: Vec3;
  /** Travel direction on the XZ plane (unit vector). */
  direction: { x: number; z: number };
  /** m/s (0 for areas). */
  speed: number;
  /** Ticks since it was spawned. */
  age: number;
  ownerId: number;
  /** Homing: the kart it chases (−1 = none). */
  targetId: number;
  /** Returning: 0 = flying out, 1 = coming back. */
  returning: 0 | 1;
  bounces: number;
  /** The spec's own numbers. */
  data: number[];
}

/** Things in the world other than karts. */
export type Entity = ItemBoxEntity | BananaEntity | ShellEntity | ItemEntity;

/** What hit a kart: the item's id, or `squash` (run over while shrunk). */
export type HitKind = ItemId | 'squash';

/** A kart's item slot. */
export interface KartItem {
  held: ItemId | null;
  /** Uses left of the held item (MK-52: multi-use items; 0 when the slot is empty). */
  uses: number;
  /** Seconds left of the roulette spin (0 = not spinning). */
  roulette: number;
  /** Whether the item button was held last tick (to use items on press, not hold). */
  buttonHeld: boolean;
}

/** The whole simulation state. Plain JSON only: no classes, Maps or functions. */
export interface SimState {
  tick: number;
  rngState: number;
  phase: RacePhase;
  trackId: string;
  engineClass: EngineClass;
  karts: KartState[];
  entities: Entity[];
  /** Kart ids in race order, leader first (MK-11). */
  positions: number[];
  race: RaceInfo;
}

export type SimEvent =
  | { type: 'phaseChanged'; phase: RacePhase }
  | { type: 'checkpoint'; kartId: number; index: number }
  | { type: 'lap'; kartId: number; lap: number; lapTime?: number }
  | { type: 'positionChange'; positions: number[] }
  | { type: 'countdown'; value: 3 | 2 | 1 }
  | { type: 'go' }
  | { type: 'rocketStart'; kartId: number }
  | { type: 'stall'; kartId: number }
  | { type: 'finish'; kartId: number; position: number; time: number }
  | { type: 'respawn'; kartId: number }
  | { type: 'itemBoxHit'; kartId: number; boxId: number }
  | { type: 'itemGranted'; kartId: number; item: ItemId }
  | { type: 'itemUsed'; kartId: number; item: ItemId }
  | { type: 'kartHit'; kartId: number; by: number; kind: HitKind }
  | { type: 'star'; kartId: number }
  | { type: 'lightning'; kartId: number }
  | { type: 'wallHit'; kartId: number; strength: number }
  | { type: 'bump'; a: number; b: number; strength: number }
  | { type: 'hop'; kartId: number }
  | { type: 'driftStart'; kartId: number; direction: -1 | 1 }
  | { type: 'driftTier'; kartId: number; tier: DriftTier }
  | { type: 'driftCancel'; kartId: number }
  | { type: 'miniTurbo'; kartId: number; tier: DriftTier }
  | { type: 'boost'; kartId: number; seconds: number }
  | { type: 'boostPad'; kartId: number }
  | { type: 'launch'; kartId: number }
  | { type: 'trick'; kartId: number }
  | { type: 'land'; kartId: number; airTime: number }
  /**
   * An item's own moment (MK-52): a shield popping, ink splatting… `fx` names it; the item's view
   * maps it to a sound and, for `kartId`'s player, a screen overlay.
   */
  | { type: 'itemFx'; kartId: number; item: ItemId; fx: string };

export interface StepResult {
  state: SimState;
  events: SimEvent[];
}
