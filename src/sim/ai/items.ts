import { clamp, forwardFromHeading, wrapAngleDelta } from '../math';
import { positionOf } from '../race';
import { rngRange } from '../rng';
import type { TrackGeometry } from '../splineTrack';
import { tuning } from '../tuning';
import type { AiState, InputFrame, KartState, SimState } from '../types';
import { lineOffsetAt } from './racingLine';

/** Deterministic 0..1 from two ids (the same banana is always spotted — or missed — by the same AI). */
function pairChance(a: number, b: number): number {
  const x = Math.sin(a * 91.345 + b * 47.853 + 3.1) * 24634.6345;
  return x - Math.floor(x);
}

/** Signed metres along the lap from `fromS` to `toS`, in (−length/2, length/2]. */
function aheadMetres(geometry: TrackGeometry, fromS: number, toS: number): number {
  let d = toS - fromS;
  if (d > geometry.length / 2) d -= geometry.length;
  if (d <= -geometry.length / 2) d += geometry.length;
  return d;
}

/**
 * Where to aim sideways this tick (MK-21): around a banana it has spotted on its line, or towards an
 * item box when its slot is empty. Sets `ai.steerOffset` (m, added to its racing-line offset).
 */
/**
 * Item boxes never move, so their track projections are worked out once per track (the AI checks
 * them for every kart, every tick).
 */
const boxProjections = new WeakMap<
  TrackGeometry,
  Map<number, { s: number; t: number; lateral: number }>
>();
function boxProjection(
  geometry: TrackGeometry,
  id: number,
  position: { x: number; y: number; z: number },
) {
  let cache = boxProjections.get(geometry);
  if (!cache) {
    cache = new Map();
    boxProjections.set(geometry, cache);
  }
  let p = cache.get(id);
  if (!p) {
    const full = geometry.project(position);
    p = { s: full.s, t: full.t, lateral: full.lateral };
    cache.set(id, p);
  }
  return p;
}

export function aiSteerOffset(
  kart: KartState,
  ai: AiState,
  state: SimState,
  geometry: TrackGeometry,
  line: readonly number[],
): number {
  const cfg = tuning.ai;
  const here = geometry.project(kart.position);
  const myLateral = here.lateral;
  const myS = here.s;

  // Dodge: the nearest banana ahead near where we're going, if we noticed it.
  let dodge: number | undefined;
  let nearest = Infinity;
  for (const e of state.entities) {
    if (e.kind !== 'banana' || e.flightTimer > 0) continue;
    // Cheap distance check first: most bananas are nowhere near.
    const dx = e.position.x - kart.position.x;
    const dz = e.position.z - kart.position.z;
    if (dx * dx + dz * dz > cfg.dodgeRange * cfg.dodgeRange) continue;
    const p = geometry.project(e.position);
    const d = aheadMetres(geometry, myS, p.s);
    if (d <= 0 || d > cfg.dodgeRange || d >= nearest) continue;
    const lineHere = lineOffsetAt(line, p.t) + ai.lineOffset;
    if (Math.abs(p.lateral - lineHere) > cfg.dodgeOffset) continue;
    const chance = clamp((ai.skill - cfg.dodgeSkillBase) * cfg.dodgeSkillGain, 0, 1);
    if (pairChance(e.id, kart.id) >= chance) continue;
    nearest = d;
    // Pass on whichever side has more road.
    const side = p.lateral > 0 ? -1 : 1;
    dodge = p.lateral + side * cfg.dodgeOffset - lineHere;
  }
  if (dodge !== undefined) return dodge;

  // Box seeking with an empty slot: steer towards the nearest active box on the row ahead.
  if (kart.item.held === null && kart.item.roulette === 0) {
    let best: number | undefined;
    let bestD = Infinity;
    for (const e of state.entities) {
      if (e.kind !== 'itemBox' || e.respawnTimer > 0) continue;
      const p = boxProjection(geometry, e.id, e.position);
      const d = aheadMetres(geometry, myS, p.s);
      if (d <= 2 || d > cfg.boxSeekRange) continue;
      const score = d + Math.abs(p.lateral - myLateral) * 2;
      if (score < bestD) {
        bestD = score;
        best = p.lateral - (lineOffsetAt(line, p.t) + ai.lineOffset);
      }
    }
    if (best !== undefined) return clamp(best, -4, 4);
  }
  return 0;
}

/**
 * Whether the AI uses its item this tick (MK-21), and how. Each new item gets a seeded thinking
 * delay (shorter for aggressive drivers); then it waits for the right moment:
 * Mushroom on a straight, Banana when someone is close behind, Green when someone is lined up
 * ahead, Red when anyone is ahead, Star/Lightning soon. After `itemGiveUp` s it uses it anyway.
 */
export function aiItemInput(
  kart: KartState,
  ai: AiState,
  state: SimState,
  geometry: TrackGeometry,
  line: readonly number[],
  dt: number,
  straightAhead: (metres: number) => number,
): Partial<InputFrame> {
  const cfg = tuning.ai;
  const item = kart.item.held;
  if (item === null || kart.item.roulette > 0) {
    ai.itemDelay = undefined;
    ai.itemHeld = 0;
    return {};
  }
  if (ai.itemDelay === undefined) {
    const power = item === 'star' || item === 'lightning';
    const [min, max] = power
      ? [cfg.powerDelayMin, cfg.powerDelayMax]
      : [cfg.itemDelayMin, cfg.itemDelayMax];
    // Aggressive drivers think less: scale the upper end by (1 − aggression / 2).
    ai.itemDelay = rngRange(state, min, min + (max - min) * (1 - ai.aggression / 2));
    ai.itemHeld = 0;
  }
  ai.itemHeld = (ai.itemHeld ?? 0) + dt;
  if (ai.itemDelay > 0) {
    ai.itemDelay = Math.max(0, ai.itemDelay - dt);
    return {};
  }
  // Pressing on consecutive ticks counts as one press; let go every other tick so it re-triggers.
  if (kart.item.buttonHeld) return {};
  const giveUp = (ai.itemHeld ?? 0) > cfg.itemGiveUp;
  const use = (extra: Partial<InputFrame> = {}): Partial<InputFrame> => ({ item: true, ...extra });

  switch (item) {
    case 'star':
    case 'lightning':
      return use();
    case 'mushroom':
      return straightAhead(cfg.straightLookAhead) < cfg.straightCurvature || giveUp ? use() : {};
    case 'banana': {
      const myS = geometry.project(kart.position).s;
      const range = cfg.bananaDropRange;
      const behind = state.karts.some((other) => {
        if (other.id === kart.id) return false;
        const dx = other.position.x - kart.position.x;
        const dz = other.position.z - kart.position.z;
        if (dx * dx + dz * dz > range * range) return false;
        const d = -aheadMetres(geometry, myS, geometry.project(other.position).s);
        return d > 0 && d < range;
      });
      // Let go of the throttle for this tick so it's dropped behind, not thrown.
      return behind || giveUp ? use({ throttle: 0 }) : {};
    }
    case 'green': {
      const forward = forwardFromHeading(kart.heading);
      const heading = Math.atan2(forward.x, forward.z);
      const target = state.karts.some((other) => {
        if (other.id === kart.id || other.respawnTimer > 0) return false;
        const dx = other.position.x - kart.position.x;
        const dz = other.position.z - kart.position.z;
        const d = Math.hypot(dx, dz);
        if (d > cfg.greenRange || d < 1) return false;
        // Lined up: within ±10°, or within about a kart's width when it's close.
        const cone = Math.max(cfg.greenAngle, Math.atan2(cfg.greenLateral, d));
        return Math.abs(wrapAngleDelta(Math.atan2(dx, dz) - heading)) < cone;
      });
      return target || giveUp ? use() : {};
    }
    case 'red':
      return positionOf(state, kart.id) > 1 || giveUp ? use() : {};
    default:
      // Items without their own tactic here (content added later, ADR 0007): use after the delay.
      return use();
  }
}
