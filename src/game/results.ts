import { kartDef } from '../sim/data/karts';
import { raceResults } from '../sim/raceFlow';
import type { SimState } from '../sim/types';

/** One line of the results screen. */
export interface ResultLine {
  position: number;
  name: string;
  /** The local player's line (highlighted, and the "You finished …" title). */
  you: boolean;
  /** Race time, s; absent while still racing. */
  time?: number;
}

/** The results screen's rows, leader first, with `localKartId`'s row marked as yours (MK-38). */
export function resultLines(state: SimState, localKartId: number): ResultLine[] {
  return raceResults(state).map((row) => {
    const kart = state.karts[row.kartId];
    return {
      position: row.position,
      name: kart ? (kart.name ?? kartDef(kart.kartType).name) : '?',
      you: row.kartId === localKartId,
      ...(row.time !== undefined ? { time: row.time } : {}),
    };
  });
}
