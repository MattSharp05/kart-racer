// MK8 races' kart sounds (MK-111, ADR 0012): engines per kart body, drift sparks by tier colour,
// terrain under the wheels, walls, jumps, landings, water, coins and boost pads, from the bank
// (`./soundIds.ts`: MK8's kart and terrain packs, MK8 Deluxe's common sounds). Every kart event
// maps to a bank sound, explicitly to our synth's (`SYNTH`: the bank has nothing fitting), or to
// silence (another sound covers it). Pure data and functions: `./kartSoundSkin.ts` plays the
// events, `./mixer.ts` the engine and terrain loops.
import { tracks } from '../../content/tracks';
import { getTrack, groundAt } from '../../sim/track';
import type { KartState, SimEvent, SimState } from '../../sim/types';
import { KART_BODIES, SOUND_IDS, TERRAINS, type SoundId } from './soundIds';

/** Our synth's sound plays (`src/audio/soundMap.ts`): the bank has no fitting MK8 sound. */
export const SYNTH = 'synth';

/** A bank sound, our synth's (`SYNTH`), or none (`null`: another sound covers it). */
export type KartSound = SoundId | typeof SYNTH | null;

export type KartBody = (typeof KART_BODIES)[number];
export type Terrain = (typeof TERRAINS)[number];

/** Who hears a kart sound: as in `src/audio/soundMap.ts`. */
export interface KartCue {
  sound: KartSound;
  scope: 'player' | 'near';
  kartId: number;
  /** 0–1, default 1. */
  volume?: number;
}

/** The kart events this table answers for (a unit test checks every one maps). */
export const KART_EVENTS = [
  'rocketStart',
  'stall',
  'wallHit',
  'bump',
  'hop',
  'driftStart',
  'driftTier',
  'driftCancel',
  'miniTurbo',
  'boost',
  'boostPad',
  'launch',
  'trick',
  'land',
  'glideOpen',
  'glideClose',
  'coin',
  'waterEnter',
  'waterExit',
  'spinBoost',
] as const satisfies readonly SimEvent['type'][];

/** Wall hits softer than this make no sound (as our synth's), m/s. */
export const WALL_MIN_STRENGTH = 4;
/** A wall hit this hard is at full volume, m/s. */
export const WALL_FULL_STRENGTH = 15;
/** Landings after less air time than this make no sound (as our synth's), s. */
export const LAND_MIN_AIR = 0.3;

/** The body a kart's engine sounds like: its loadout's, else the Standard Kart. */
export function kartBody(kart: KartState): KartBody {
  const body = kart.loadout?.body;
  return (KART_BODIES as readonly string[]).includes(body ?? '')
    ? (body as KartBody)
    : 'standard-kart';
}

/** Off-road on each MK8 course (the default is grass). */
export const OFFROAD_TERRAIN: Readonly<Record<string, Terrain>> = {
  'mk8-canyon': 'sand',
  'mk8-ruins': 'dirt',
};

/**
 * The terrain under a kart (its running loop, landing and slip sounds); undefined in the air. In
 * water it is water, on anti-gravity metal; otherwise the ground's surface.
 */
export function kartTerrain(state: SimState, kart: KartState): Terrain | undefined {
  if (!kart.grounded) return undefined;
  if (kart.inWater) return 'water';
  if (kart.antigrav) return 'metal';
  if (!tracks.has(state.trackId)) return 'asphalt';
  const ground = groundAt(getTrack(state.trackId), kart.position);
  switch (ground.surface) {
    case 'offroad':
    case 'rough':
      return OFFROAD_TERRAIN[state.trackId] ?? 'grass';
    case 'sand':
      return 'sand';
    case 'out':
      return 'dirt';
    default:
      return 'asphalt';
  }
}

/** Playback rate of the engine's accelerate loop at its lowest and highest. */
export const ENGINE_RATE = { min: 0.7, max: 1.6 } as const;
/** Speed (share of top speed) at which the engine is at its highest pitch (boosts go past top). */
const ENGINE_TOP_RATIO = 1.3;

/** The engine loop's playback rate at `speed`: rises with speed, never falls (m/s). */
export function engineRate(speed: number, topSpeed: number): number {
  const ratio = topSpeed > 0 ? Math.min(ENGINE_TOP_RATIO, Math.abs(speed) / topSpeed) : 0;
  return ENGINE_RATE.min + ((ENGINE_RATE.max - ENGINE_RATE.min) * ratio) / ENGINE_TOP_RATIO;
}

const SPARKS: Record<1 | 2 | 3, SoundId> = {
  1: 'drift/blue',
  2: 'drift/orange',
  3: 'drift/purple',
};

/**
 * The sound `event` makes in an MK8 race, or undefined when it isn't a kart event (items, the
 * race's own: ours or MK-129's play them).
 */
export function kartCue(event: SimEvent, state: SimState): KartCue | undefined {
  const kartOf = (id: number) => state.karts[id];
  const body = (id: number): KartBody => {
    const kart = kartOf(id);
    return kart ? kartBody(kart) : 'standard-kart';
  };
  switch (event.type) {
    case 'rocketStart':
      return { sound: `kart/${body(event.kartId)}/boost`, scope: 'player', kartId: event.kartId };
    case 'wallHit': {
      if (event.strength <= WALL_MIN_STRENGTH)
        return { sound: null, scope: 'player', kartId: event.kartId };
      const material = kartOf(event.kartId)?.antigrav ? 'metal' : 'concrete';
      return {
        sound: `terrain/wall/${material}`,
        scope: 'player',
        kartId: event.kartId,
        volume: Math.min(1, event.strength / WALL_FULL_STRENGTH),
      };
    }
    case 'driftStart':
      return { sound: 'drift/start', scope: 'player', kartId: event.kartId };
    case 'driftTier':
      return {
        sound: event.tier === 0 ? null : SPARKS[event.tier],
        scope: 'player',
        kartId: event.kartId,
      };
    case 'miniTurbo':
      return {
        sound: `kart/${body(event.kartId)}/mini-turbo`,
        scope: 'player',
        kartId: event.kartId,
      };
    case 'spinBoost':
      return {
        sound: `kart/${body(event.kartId)}/mini-turbo`,
        scope: 'near',
        kartId: event.kartId,
      };
    case 'boost':
      // The thing that caused it (mini-turbo, mushroom, pad, rocket start) already sounds.
      return { sound: null, scope: 'player', kartId: event.kartId };
    case 'boostPad':
      return { sound: `kart/${body(event.kartId)}/boost`, scope: 'player', kartId: event.kartId };
    case 'land': {
      const kart = kartOf(event.kartId);
      const terrain = kart ? (kartTerrain(state, kart) ?? 'asphalt') : 'asphalt';
      return event.airTime > LAND_MIN_AIR
        ? {
            sound: `terrain/${terrain}/land`,
            scope: 'player',
            kartId: event.kartId,
            volume: Math.min(1, event.airTime),
          }
        : { sound: null, scope: 'player', kartId: event.kartId };
    }
    case 'waterEnter':
    case 'waterExit':
      return { sound: 'terrain/water/land', scope: 'near', kartId: event.kartId };
    case 'coin':
      return { sound: 'items/coin-get', scope: 'player', kartId: event.kartId };
    // No MK8 sound in the bank for these: our synth's (glider and stall: MK8 Deluxe's common
    // pack has them, for a later bank).
    case 'stall':
    case 'hop':
    case 'driftCancel':
    case 'launch':
    case 'trick':
    case 'glideOpen':
    case 'glideClose':
      return { sound: SYNTH, scope: 'player', kartId: event.kartId };
    case 'bump':
      return { sound: SYNTH, scope: 'near', kartId: event.a };
    default:
      return undefined;
  }
}

/** Every bank sound MK8 races' karts play (events and loops): the files loaded for a race. */
export const KART_SAMPLES: readonly SoundId[] = SOUND_IDS.filter(
  (id) => id.startsWith('kart/') || id.startsWith('terrain/') || id.startsWith('drift/'),
);
