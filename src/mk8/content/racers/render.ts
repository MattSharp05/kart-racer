// How MK8 Mode's racers sit in their karts (MK-101): one line per folder, alphabetical.
import type { Mk8RacerView } from './view';
import bowser from './bowser/render';
import daisy from './daisy/render';
import donkeyKong from './donkey-kong/render';
import koopaTroopa from './koopa-troopa/render';
import luigi from './luigi/render';
import mario from './mario/render';
import peach from './peach/render';
import shyGuy from './shy-guy/render';
import toad from './toad/render';
import waluigi from './waluigi/render';
import wario from './wario/render';
import yoshi from './yoshi/render';

export const MK8_RACER_VIEWS: readonly Mk8RacerView[] = [
  bowser,
  daisy,
  donkeyKong,
  koopaTroopa,
  luigi,
  mario,
  peach,
  shyGuy,
  toad,
  waluigi,
  wario,
  yoshi,
];

/** The view of racer `id`; throws for an id that isn't an MK8 racer. */
export function mk8RacerView(id: string): Mk8RacerView {
  const view = MK8_RACER_VIEWS.find((v) => v.id === id);
  if (!view) throw new Error(`Unknown MK8 racer: ${id}`);
  return view;
}
