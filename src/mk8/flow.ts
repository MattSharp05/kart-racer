// What MK8 Mode's menus hand the game when the player starts a race (MK-119): the course's track,
// the engine class, the player's loadout and MK8's item set. MK8 courses and racers register
// with their own tickets (MK-105, MK-101); until a course's track is registered the race runs on
// its stand-in (one of our tracks), and a racer that isn't registered drives as our default one.
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import type { KartId } from '../sim/data/karts';
import type { RacerSlot } from '../sim/race/createRace';
import type { EngineClass } from '../sim/tuning';
import { MK8_ITEM_SET } from './content/items/id';
import { defaultLoadout } from './content/parts';
import { MK8_RACERS } from './content/racers';
import { isKnownLoadout } from './content/stats';
import { courseInfo, cupInfo, type Mk8CourseKey, type Mk8CupId } from './content/cups';
import {
  currentCourse,
  gpSeed,
  gridSlots,
  startGrandPrix,
  type Mk8GrandPrix,
} from './gp/grandPrix';
import { timeTrialField } from './modes/timeTrial';
import { flowPlayers, otherLoadouts } from './localPlayers';
import { vsField, vsSeed, type VsHuman } from './modes/vsField';
import { DEFAULT_VS_RULES, type VsRules } from './modes/vsRace';
import type { Mk8Flow, Mk8GameMode, Mk8Loadout } from './ui/screens/session';

/** The kart before character select and the kart builder pick one (MK8's defaults, MK-102). */
export const DEFAULT_LOADOUT: Mk8Loadout = defaultLoadout('mk8-mario');

/** MK8's racers in roster order. */
const MK8_RACER_IDS = [...MK8_RACERS].sort((a, b) => a.order - b.order).map((r) => r.id);

/** Engine class the menus start on (the mockup's, and MK8's usual pick). */
export const DEFAULT_ENGINE_CLASS: EngineClass = 150;

/** Our racer the player drives while their MK8 racer isn't registered. */
export const STAND_IN_RACER: KartId = 'maple';

export interface Mk8RaceSetup {
  /** The course picked (a Grand Prix's first course). */
  course: Mk8CourseKey;
  cup: Mk8CupId;
  /** The registered track raced: the course's own, or its stand-in. */
  trackId: string;
  engineClass: EngineClass;
  loadout: Mk8Loadout;
  /**
   * The loadout the player's kart races with (MK-102: its physics from MK8's stat table), when the
   * table knows its racer and every part; otherwise none, and the kart drives on its racer's stats.
   */
  raceLoadout?: Mk8Loadout;
  /** The racer the player's kart is: the loadout's, or the stand-in. */
  playerKart: KartId;
  itemSet: string;
  /** The game mode it was picked in (MK-121: the results' choices and Grand Prix standings). */
  mode?: Mk8GameMode;
  /** A Grand Prix (MK-130): the cup so far; this race is its `currentCourse`. */
  gp?: Mk8GrandPrix;
  /**
   * A Grand Prix's karts (MK-130): the same rivals every race, on the reverse of the standings. A
   * Time Trial's (MK-131): the player alone.
   */
  field?: RacerSlot[];
  /** A VS Race's settings (MK-131): items and CPU difficulty. */
  vs?: VsRules;
  /**
   * People racing on this screen (MK-148: a VS Race's Players), when more than one: they drive the
   * field's first karts, P1 first, each in their own split-screen view.
   */
  players?: number;
  /** P2–P4's picks (MK-148), by slot − 1, so Next course and Retry race them again. */
  others?: Mk8Loadout[];
}

/**
 * The race the menus' choices make. Throws when no course was picked. A Grand Prix (MK-130) races
 * `gp`'s current course (a new cup from the choices without one) with its field.
 */
export function raceSetup(flow: Mk8Flow, gp?: Mk8GrandPrix): Mk8RaceSetup {
  const cup = flow.cup ?? 'mushroom';
  const engineClass = flow.engineClass ?? DEFAULT_ENGINE_CLASS;
  const loadout = flow.loadout ?? DEFAULT_LOADOUT;
  const grandPrix =
    flow.mode === 'grand-prix'
      ? (gp ??
        startGrandPrix({
          cup,
          engineClass,
          player: loadout,
          seed: gpSeed(cup, engineClass, loadout.racer),
        }))
      : undefined;
  const key = (grandPrix && currentCourse(grandPrix)) ?? flow.course;
  if (!key) throw new Error('MK8: no course chosen');
  const course = courseInfo(key);
  if (cupInfo(cup).locked) throw new Error(`MK8: the ${cup} cup is locked`);
  const playerKart = racers.has(loadout.racer) ? loadout.racer : STAND_IN_RACER;
  const raceLoadout = isKnownLoadout(loadout) ? loadout : undefined;
  // Local multiplayer (MK-148): P2–P4 in a VS Race, each racing their own pick.
  const others =
    flowPlayers(flow) > 1
      ? otherLoadouts(flow, (slot) => defaultLoadout(neighbour(loadout, slot)))
      : [];
  const humans = others.map((other): VsHuman => ({
    kartId: racers.has(other.racer) ? other.racer : STAND_IN_RACER,
    ...(isKnownLoadout(other) ? { loadout: { ...other } } : {}),
  }));
  const vs =
    grandPrix || flow.mode === 'time-trial'
      ? undefined
      : vsField(playerKart, raceLoadout, vsSeed(course.key, engineClass, loadout.racer), humans);
  return {
    course: course.key,
    cup,
    trackId: tracks.has(course.trackId) ? course.trackId : course.standIn,
    engineClass,
    loadout,
    ...(raceLoadout ? { raceLoadout } : {}),
    playerKart,
    itemSet: MK8_ITEM_SET,
    ...(flow.mode ? { mode: flow.mode } : {}),
    ...(grandPrix ? { gp: grandPrix, field: gpField(grandPrix, playerKart) } : {}),
    ...(flow.mode === 'time-trial' ? { field: timeTrialField(playerKart, raceLoadout) } : {}),
    // MK-136: a VS Race's CPUs are MK8 racers too (the original game's picks otherwise).
    ...(vs ? { field: vs } : {}),
    ...(flow.mode === 'vs' ? { vs: { ...(flow.vs ?? DEFAULT_VS_RULES) } } : {}),
    ...(vs && others.length ? { players: 1 + others.length, others } : {}),
  };
}

/** The MK8 racer `slot` places after `loadout`'s in the roster: a player who didn't pick. */
function neighbour(loadout: Mk8Loadout, slot: number): string {
  const ids = MK8_RACER_IDS;
  const at = Math.max(0, ids.indexOf(loadout.racer));
  return ids[(at + slot) % ids.length] ?? loadout.racer;
}

/**
 * A Grand Prix race's karts: entrant `i` is kart `i` (the player first), each on its grid slot,
 * the AI in their own loadouts; a racer not registered drives as the stand-in.
 */
export function gpField(gp: Mk8GrandPrix, playerKart: KartId): RacerSlot[] {
  const slots = gridSlots(gp);
  return gp.entrants.map((entrant, i): RacerSlot => {
    const you = i === 0;
    const known = racers.has(entrant.racer);
    return {
      kartId: you ? playerKart : known ? entrant.racer : STAND_IN_RACER,
      controller: you ? 'local' : 'ai',
      gridSlot: slots[i] ?? i,
      ...((you || known) && isKnownLoadout(entrant.loadout)
        ? { loadout: { ...entrant.loadout } }
        : {}),
    };
  });
}
