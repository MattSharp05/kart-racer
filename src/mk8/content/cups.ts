// MK8 Mode's cups and courses (MK-119): what the cup/course select shows. The Mushroom Cup is
// playable; the Flower, Star and Special Cups are shown locked ("Later"). Each course names the
// track it will be registered as (MK-105 registers `mk8-stadium`, the other courses follow) and,
// until then, one of our tracks to race on in its place.

/** A course of a cup: its sprites (`p_<key>` preview, `m_<key>` map) and its pack group. */
export interface Mk8Course {
  /** Sprite key and pack course id (`course/<key>`). */
  key: 'stadium' | 'waterpark' | 'canyon' | 'ruins';
  name: string;
  /** The course's track id once it is registered. */
  trackId: string;
  /** Our track raced in its place until then. */
  standIn: string;
  /** Has an anti-gravity section (the tag on its card). */
  antiGravity: boolean;
}

export interface Mk8Cup {
  id: 'mushroom' | 'flower' | 'star' | 'special';
  name: string;
  /** Cup emblem sprite. */
  sprite: string;
  /** Shown but not playable yet. */
  locked: boolean;
  courses: readonly Mk8Course[];
}

export const MUSHROOM_COURSES: readonly Mk8Course[] = [
  {
    key: 'stadium',
    name: 'Mario Kart Stadium',
    trackId: 'mk8-stadium',
    standIn: 'sunny-circuit',
    antiGravity: true,
  },
  {
    key: 'waterpark',
    name: 'Water Park',
    trackId: 'mk8-waterpark',
    standIn: 'neon-harbour',
    antiGravity: true,
  },
  {
    key: 'canyon',
    name: 'Sweet Sweet Canyon',
    trackId: 'mk8-canyon',
    standIn: 'dune-canyon',
    antiGravity: true,
  },
  {
    key: 'ruins',
    name: 'Thwomp Ruins',
    trackId: 'mk8-ruins',
    standIn: 'canopy-rush',
    antiGravity: true,
  },
];

/** The cups in MK8's order (the cup grid, 2 wide). */
export const MK8_CUPS: readonly Mk8Cup[] = [
  {
    id: 'mushroom',
    name: 'Mushroom Cup',
    sprite: 'u_mushroomcup',
    locked: false,
    courses: MUSHROOM_COURSES,
  },
  { id: 'flower', name: 'Flower Cup', sprite: 'u_flowercup', locked: true, courses: [] },
  { id: 'star', name: 'Star Cup', sprite: 'u_starcup', locked: true, courses: [] },
  { id: 'special', name: 'Special Cup', sprite: 'u_specialcup', locked: true, courses: [] },
];

export type Mk8CupId = Mk8Cup['id'];
export type Mk8CourseKey = Mk8Course['key'];

export function cupInfo(id: Mk8CupId): Mk8Cup {
  const cup = MK8_CUPS.find((c) => c.id === id);
  if (!cup) throw new Error(`Unknown MK8 cup: ${id}`);
  return cup;
}

export function courseInfo(key: Mk8CourseKey): Mk8Course {
  const course = MK8_CUPS.flatMap((c) => c.courses).find((c) => c.key === key);
  if (!course) throw new Error(`Unknown MK8 course: ${key}`);
  return course;
}
