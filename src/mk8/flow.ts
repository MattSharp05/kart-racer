// What MK8 Mode's menus hand the game when the player starts a race (MK-119): the course's track,
// the engine class, the player's loadout and MK8's item set. MK8 courses and racers register
// with their own tickets (MK-105, MK-101); until a course's track is registered the race runs on
// its stand-in (one of our tracks), and a racer that isn't registered drives as our default one.
import { racers } from '../content/racers';
import { tracks } from '../content/tracks';
import type { KartId } from '../sim/data/karts';
import type { EngineClass } from '../sim/tuning';
import { MK8_ITEM_SET } from './content/items/id';
import { courseInfo, cupInfo, type Mk8CourseKey, type Mk8CupId } from './content/cups';
import type { Mk8Flow, Mk8Loadout } from './ui/screens/session';

/** The kart before character select and the kart builder pick one (MK8's defaults). */
export const DEFAULT_LOADOUT: Mk8Loadout = {
  racer: 'mk8-mario',
  body: 'standard',
  tires: 'standard',
  glider: 'super',
};

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
  /** The racer the player's kart is: the loadout's, or the stand-in. */
  playerKart: KartId;
  itemSet: string;
}

/** The race the menus' choices make. Throws when no course was picked. */
export function raceSetup(flow: Mk8Flow): Mk8RaceSetup {
  if (!flow.course) throw new Error('MK8: no course chosen');
  const course = courseInfo(flow.course);
  const cup = flow.cup ?? 'mushroom';
  if (cupInfo(cup).locked) throw new Error(`MK8: the ${cup} cup is locked`);
  const loadout = flow.loadout ?? DEFAULT_LOADOUT;
  return {
    course: course.key,
    cup,
    trackId: tracks.has(course.trackId) ? course.trackId : course.standIn,
    engineClass: flow.engineClass ?? DEFAULT_ENGINE_CLASS,
    loadout,
    playerKart: racers.has(loadout.racer) ? loadout.racer : STAND_IN_RACER,
    itemSet: MK8_ITEM_SET,
  };
}
