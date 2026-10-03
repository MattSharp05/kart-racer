// MK8 Mode's 12 racers (MK-101): one line per folder, alphabetical (a unit test checks none is
// missing). `register.ts` adds them to the shared racer registry when MK8 Mode opens.
import type { Mk8RacerContent } from './weightClass';
import bowser from './bowser/sim';
import daisy from './daisy/sim';
import donkeyKong from './donkey-kong/sim';
import koopaTroopa from './koopa-troopa/sim';
import luigi from './luigi/sim';
import mario from './mario/sim';
import peach from './peach/sim';
import shyGuy from './shy-guy/sim';
import toad from './toad/sim';
import waluigi from './waluigi/sim';
import wario from './wario/sim';
import yoshi from './yoshi/sim';

export const MK8_RACERS: readonly Mk8RacerContent[] = [
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
