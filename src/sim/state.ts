import type { KartId } from './data/karts';
import { forwardFromHeading, orthonormal, scale, vec3 } from './math';
import { routeGeometry } from './route';
import { seedRng } from './rng';
import type { EngineClass } from './tuning';
import { getTrack, trackGeometry } from './track';
import { DT, tuning } from './tuning';
import type { KartController, KartState, Loadout, RacePhase, SimState } from './types';

export interface KartSpawn {
  kartType?: KartId;
  /** Default `local`. */
  controller?: KartController;
  name?: string;
  position?: KartState['position'];
  heading?: number;
  /** Initial forward speed, m/s. */
  speed?: number;
  /**
   * Mesh tracks (MK-99): the kart's up (unit), e.g. −Y to start on a ceiling. Its facing is then
   * `heading`'s direction laid into that plane. Absent: +Y, set on the kart's first step.
   */
  up?: KartState['position'];
  /** MK8 Mode's kart parts (MK-102): physics from MK8's stat table. */
  loadout?: Loadout;
}

export interface InitialStateOptions {
  seed: number;
  /** `free` = free drive (no race); `countdown` = a race that starts with 3-2-1-GO. */
  phase?: RacePhase;
  laps?: number;
  trackId?: string;
  engineClass?: EngineClass;
  karts?: KartSpawn[];
  /** Item boxes on tracks that have them (default true). */
  itemsOn?: boolean;
  /** A registered item set (MK-103: `mk8`); default the original game's items. */
  itemSet?: string;
  /** Item slots per kart (MK-103): 2 adds `item.second` (the item set's `slots`). Default 1. */
  itemSlots?: 1 | 2;
}

/** Builds a fresh SimState. With no karts given, places one kart at the origin facing −Z. */
export function createSimState({
  seed,
  phase = 'free',
  laps = tuning.raceLaps,
  trackId = 'test-pad',
  engineClass = 100,
  karts = [{}],
  itemsOn = true,
  itemSet,
  itemSlots = 1,
}: InitialStateOptions): SimState {
  return {
    tick: 0,
    rngState: seedRng(seed),
    phase,
    trackId,
    engineClass,
    karts: karts.map((spawn, id) => {
      const heading = spawn.heading ?? 0;
      const speed = spawn.speed ?? 0;
      return {
        id,
        kartType: spawn.kartType ?? 'maple',
        controller: spawn.controller ?? 'local',
        ...(spawn.name !== undefined ? { name: spawn.name } : {}),
        position: spawn.position ?? vec3(),
        velocity: scale(forwardFromHeading(heading), speed),
        heading,
        speed,
        grounded: true,
        drift: { direction: 0, charge: 0, tier: 0 },
        driftHeld: false,
        boostTimer: 0,
        airTime: 0,
        trick: 'none',
        race: {
          lap: 0,
          nextCheckpoint: 0,
          lastT: -1,
          lapStartTick: 0,
          lapTimes: [],
          wrongWayTime: 0,
          wrongWay: false,
          stallTimer: 0,
        },
        item: {
          held: null,
          uses: 0,
          roulette: 0,
          buttonHeld: false,
          ...(itemSlots === 2 ? { second: { held: null, uses: 0, roulette: 0 } } : {}),
        },
        respawnTimer: 0,
        invulnerableTimer: 0,
        lastSafeT: -1,
        outTime: 0,
        respawnCooldown: 0,
        spinTimer: 0,
        starTimer: 0,
        shrinkTimer: 0,
        effects: [],
        ...(spawn.up
          ? {
              up: { ...spawn.up },
              forward: orthonormal(forwardFromHeading(heading), spawn.up),
              gravityDir: { x: -spawn.up.x, y: -spawn.up.y, z: -spawn.up.z },
              antigrav: false,
            }
          : {}),
        ...(spawn.loadout ? { loadout: { ...spawn.loadout } } : {}),
      };
    }),
    entities: itemsOn ? itemBoxesFor(trackId) : [],
    positions: karts.map((_, id) => id),
    race: {
      laps,
      countdownStartTick: 0,
      goTick: phase === 'countdown' ? Math.round(tuning.countdownSeconds / DT) : 0,
    },
    ...(itemSet !== undefined ? { itemSet } : {}),
  };
}

/** One active item box per lateral slot on each of the track's item-box rows. */
function itemBoxesFor(trackId: string): SimState['entities'] {
  const track = getTrack(trackId);
  if (track.kind === 'arena') return [];
  // Mesh tracks (MK-105): the route's rows, on the road surface.
  const pointAt =
    track.kind === 'spline'
      ? (t: number, lateral: number) => trackGeometry(track).pointAt(t, lateral)
      : (t: number, lateral: number) => routeGeometry(track.route).frameAt(t, lateral).position;
  const rows = (track.kind === 'spline' ? track.itemBoxRows : track.route.itemBoxRows) ?? [];
  let id = 0;
  return rows.flatMap((row) =>
    row.laterals.map((lateral) => ({
      id: id++,
      kind: 'itemBox' as const,
      position: pointAt(row.t, lateral),
      respawnTimer: 0,
    })),
  );
}
