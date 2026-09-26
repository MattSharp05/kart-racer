import { itemEffects } from '../../content/items/registries';
import type { HitKind, KartEffect, KartState, SimEvent, SimState } from '../types';

/** A hit about to land on a kart (`hitKart`), as effects see it. */
export interface IncomingHit {
  /** The kart it came from (−1 = none). */
  by: number;
  kind: HitKind;
  /**
   * A crushing hit (a crusher coming down, MK-62): shields can't stop it, so an effect that only
   * guards against items and bumps lets it through.
   */
  crush?: boolean;
}

/**
 * A timed kart effect (MK-52): shields, phasing, magnet pulls, ink… An item lists its effects in
 * `ItemContent.effects`; `applyEffect` puts one on a kart, which then lives in `kart.effects` (plain
 * data, sent in snapshots) and runs these hooks. All hooks mutate the tick's state.
 */
export interface EffectContent {
  /** Global id; by convention the item's id, or `<item>-<name>` when an item has several. */
  id: string;
  order?: number;
  /** When it's put on a kart (also when re-applied, which restarts it). */
  onApply?(kart: KartState, effect: KartEffect, state: SimState, events: SimEvent[]): void;
  /** Every tick while it lasts, before item entities move. */
  onTick?(
    kart: KartState,
    effect: KartEffect,
    state: SimState,
    dt: number,
    events: SimEvent[],
  ): void;
  /**
   * A hit is about to land on the kart: return true to cancel it (a shield). To end the effect as
   * well, set `effect.ticksLeft = 0`; it expires (and `onExpire` runs) on the next tick.
   */
  onHit?(kart: KartState, effect: KartEffect, hit: IncomingHit, events: SimEvent[]): boolean;
  /**
   * While it lasts the kart is a ghost to other karts and to item entities (Phase, MK-66): no
   * kart-vs-kart bumps, shells, bananas and item entities pass through it (and aren't used up),
   * and it can't knock others over (star, squash). Walls, hazards and item boxes still apply.
   */
  intangible?: boolean;
  /**
   * While it lasts the kart's top speed is multiplied by this (Phase's small boost, MK-66), or by
   * what this function returns each tick (a pull that grows as it closes in: Magnet, MK-68).
   */
  speedFactor?: number | ((kart: KartState, effect: KartEffect) => number);
  /**
   * While it lasts an AI driver drives worse (Ink Cloud, MK-68): `steer` is added to its steering
   * (−1…1) and it looks `lookAhead`× as far down the racing line. The effect keeps any randomness
   * in its own `data`, drawn from the seeded RNG. Players' karts ignore it.
   */
  aiDriving?(kart: KartState, effect: KartEffect): AiDriving;
  /** When it runs out or is ended with `endEffect`. */
  onExpire?(kart: KartState, effect: KartEffect, state: SimState, events: SimEvent[]): void;
}

/** How a kart effect changes an AI driver's steering (`EffectContent.aiDriving`). */
export interface AiDriving {
  steer?: number;
  lookAhead?: number;
}

export interface EffectOptions {
  /** The kart that caused it (default −1). */
  by?: number;
  /** The effect's own numbers (default none). */
  data?: number[];
}

/**
 * Puts effect `kind` on `kart` for `ticks` ticks and runs its `onApply`. A kart has at most one
 * effect of each kind: applying it again replaces the old one (without `onExpire`).
 */
export function applyEffect(
  kart: KartState,
  kind: string,
  ticks: number,
  state: SimState,
  events: SimEvent[],
  { by = -1, data = [] }: EffectOptions = {},
): KartEffect {
  const def = itemEffects.get(kind);
  const effect: KartEffect = { kind, ticksLeft: ticks, by, data: [...data] };
  kart.effects = [...kart.effects.filter((e) => e.kind !== kind), effect];
  def.onApply?.(kart, effect, state, events);
  return effect;
}

/** The kart's effect of `kind`, if it has one. */
export function getEffect(kart: KartState, kind: string): KartEffect | undefined {
  return kart.effects.find((e) => e.kind === kind);
}

export function hasEffect(kart: KartState, kind: string): boolean {
  return getEffect(kart, kind) !== undefined;
}

/** Ends the kart's effect of `kind` now (its `onExpire` runs). Does nothing if it has none. */
export function endEffect(
  kart: KartState,
  kind: string,
  state: SimState,
  events: SimEvent[],
): void {
  const effect = getEffect(kart, kind);
  if (!effect) return;
  kart.effects = kart.effects.filter((e) => e !== effect);
  itemEffects.get(kind).onExpire?.(kart, effect, state, events);
}

/** Runs every kart's effects for one tick, then expires those that ran out. */
export function updateEffects(state: SimState, dt: number, events: SimEvent[]): void {
  for (const kart of state.karts) {
    if (kart.effects.length === 0) continue;
    for (const effect of [...kart.effects]) {
      // A hook earlier in the loop may have ended it.
      if (!kart.effects.includes(effect) || effect.ticksLeft <= 0) continue;
      itemEffects.get(effect.kind).onTick?.(kart, effect, state, dt, events);
      effect.ticksLeft -= 1;
    }
    for (const effect of kart.effects.filter((e) => e.ticksLeft <= 0)) {
      endEffect(kart, effect.kind, state, events);
    }
  }
}

/** Asks the kart's effects about a hit; true when one of them cancels it (`hitKart`). */
export function effectsBlockHit(kart: KartState, hit: IncomingHit, events: SimEvent[]): boolean {
  for (const effect of kart.effects) {
    if (effect.ticksLeft <= 0) continue;
    if (itemEffects.get(effect.kind).onHit?.(kart, effect, hit, events)) return true;
  }
  return false;
}

/** Whether one of the kart's effects makes it intangible (`EffectContent.intangible`). */
export function isIntangible(kart: KartState): boolean {
  for (const effect of kart.effects) {
    if (effect.ticksLeft > 0 && itemEffects.get(effect.kind).intangible) return true;
  }
  return false;
}

/** The product of the kart's effects' `speedFactor`s (1 = none). */
export function effectsSpeedFactor(kart: KartState): number {
  let factor = 1;
  for (const effect of kart.effects) {
    if (effect.ticksLeft <= 0) continue;
    const speedFactor = itemEffects.get(effect.kind).speedFactor ?? 1;
    factor *= typeof speedFactor === 'number' ? speedFactor : speedFactor(kart, effect);
  }
  return factor;
}

/** The kart's effects' `aiDriving`, combined: steering nudges add, look-ahead factors multiply. */
export function effectsAiDriving(kart: KartState): Required<AiDriving> {
  const driving = { steer: 0, lookAhead: 1 };
  for (const effect of kart.effects) {
    if (effect.ticksLeft <= 0) continue;
    const change = itemEffects.get(effect.kind).aiDriving?.(kart, effect);
    if (!change) continue;
    driving.steer += change.steer ?? 0;
    driving.lookAhead *= change.lookAhead ?? 1;
  }
  return driving;
}
