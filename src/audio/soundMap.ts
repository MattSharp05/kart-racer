import type { SimEvent } from '../sim/types';

export type SoundId =
  | 'countBeep'
  | 'goBeep'
  | 'rocket'
  | 'stall'
  | 'lap'
  | 'finalLap'
  | 'finish'
  | 'respawn'
  | 'itemBox'
  | 'itemGet'
  | 'mushroom'
  | 'banana'
  | 'shell'
  | 'hit'
  | 'starOn'
  | 'zap'
  | 'wall'
  | 'bump'
  | 'hop'
  | 'driftStart'
  | 'driftTier'
  | 'fizzle'
  | 'miniTurbo'
  | 'boostPad'
  | 'launch'
  | 'trick'
  | 'land';

/**
 * Who hears a cue: `player` = only when it's about the kart you follow; `near` = anyone's, quieter
 * with distance; `all` = always (countdown, lightning).
 */
export interface SoundCue {
  id: SoundId;
  scope: 'player' | 'near' | 'all';
  /** The kart the sound comes from (for `player` / `near`). */
  kartId?: number;
  /** 0..1 loudness, default 1. */
  volume?: number;
  /** Pitch step, e.g. drift tier or lap number. */
  pitch?: number;
}

/**
 * Which sound each sim event makes (MK-26). Exhaustive over `SimEvent['type']` — a new event type
 * won't compile until it's given a sound (or explicitly `null` = silent).
 */
export function cueFor(event: SimEvent, laps = 3): SoundCue | null {
  switch (event.type) {
    case 'phaseChanged':
    case 'checkpoint':
    case 'positionChange':
      return null;
    case 'countdown':
      return { id: 'countBeep', scope: 'all' };
    case 'go':
      return { id: 'goBeep', scope: 'all' };
    case 'rocketStart':
      return { id: 'rocket', scope: 'player', kartId: event.kartId };
    case 'stall':
      return { id: 'stall', scope: 'player', kartId: event.kartId };
    case 'lap':
      if (event.lap <= 1) return null;
      return { id: event.lap === laps ? 'finalLap' : 'lap', scope: 'player', kartId: event.kartId };
    case 'finish':
      return { id: 'finish', scope: 'player', kartId: event.kartId };
    case 'respawn':
      return { id: 'respawn', scope: 'player', kartId: event.kartId };
    case 'itemBoxHit':
      return { id: 'itemBox', scope: 'near', kartId: event.kartId, volume: 0.7 };
    case 'itemGranted':
      return { id: 'itemGet', scope: 'player', kartId: event.kartId };
    case 'itemUsed':
      switch (event.item) {
        case 'mushroom':
          return { id: 'mushroom', scope: 'near', kartId: event.kartId };
        case 'banana':
          return { id: 'banana', scope: 'near', kartId: event.kartId };
        case 'green':
        case 'red':
          return { id: 'shell', scope: 'near', kartId: event.kartId };
        case 'star':
        case 'lightning':
          return null; // their own events below
      }
      return null;
    case 'kartHit':
      return { id: 'hit', scope: 'near', kartId: event.kartId };
    case 'star':
      return { id: 'starOn', scope: 'near', kartId: event.kartId };
    case 'lightning':
      return { id: 'zap', scope: 'all' };
    case 'wallHit':
      return event.strength > 4
        ? {
            id: 'wall',
            scope: 'player',
            kartId: event.kartId,
            volume: Math.min(1, event.strength / 15),
          }
        : null;
    case 'bump':
      return {
        id: 'bump',
        scope: 'near',
        kartId: event.a,
        volume: Math.min(1, event.strength / 10),
      };
    case 'hop':
      return { id: 'hop', scope: 'player', kartId: event.kartId, volume: 0.6 };
    case 'driftStart':
      return { id: 'driftStart', scope: 'player', kartId: event.kartId };
    case 'driftTier':
      return { id: 'driftTier', scope: 'player', kartId: event.kartId, pitch: event.tier };
    case 'driftCancel':
      return { id: 'fizzle', scope: 'player', kartId: event.kartId, volume: 0.6 };
    case 'miniTurbo':
      return { id: 'miniTurbo', scope: 'player', kartId: event.kartId, pitch: event.tier };
    case 'boost':
      return null; // the thing that caused it (mini-turbo, mushroom, pad, rocket) already sounds
    case 'boostPad':
      return { id: 'boostPad', scope: 'player', kartId: event.kartId };
    case 'launch':
      return { id: 'launch', scope: 'player', kartId: event.kartId };
    case 'trick':
      return { id: 'trick', scope: 'player', kartId: event.kartId };
    case 'land':
      return event.airTime > 0.3
        ? { id: 'land', scope: 'player', kartId: event.kartId, volume: Math.min(1, event.airTime) }
        : null;
    default: {
      const unhandled: never = event;
      throw new Error(`No sound mapping for ${JSON.stringify(unhandled)}`);
    }
  }
}
