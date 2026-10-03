// How an MK8 racer's kart looks in a race (MK-138) until races draw the pack's racer and kart
// models: a primitive kart in the racer's colours, shaped like an original racer of its weight
// class. Registered into the game's racer views when MK8 Mode opens (`register.ts`), so the race
// renderer finds a view for every `pack: 'mk8'` racer, with or without the pack.
import type { KartColours } from '../../../render/kartModels';
import type { RacerView } from '../../../content/racers/render';
import boulder from '../../../content/racers/boulder/render';
import maple from '../../../content/racers/maple/render';
import pixie from '../../../content/racers/pixie/render';
import { MK8_RACERS } from './index';
import type { Mk8RacerContent, WeightClass } from './weightClass';

/** The original racer whose kart shape and details each weight class borrows. */
const SHAPE_BY_CLASS: Readonly<Record<WeightClass, RacerView>> = {
  light: pixie,
  medium: maple,
  heavy: boulder,
};

/** Each MK8 racer's kart paint: body, accent, driver. */
export const STAND_IN_COLOURS: Readonly<Record<string, KartColours>> = {
  'mk8-bowser': { body: 0x2d6a4f, accent: 0xf77f00, driver: 0xffd166 },
  'mk8-daisy': { body: 0xf8961e, accent: 0xffd60a, driver: 0xffe0bd },
  'mk8-donkey-kong': { body: 0x7f4f24, accent: 0xd00000, driver: 0x582f0e },
  'mk8-koopa-troopa': { body: 0x52b788, accent: 0xffd60a, driver: 0xfff3b0 },
  'mk8-luigi': { body: 0x2b9348, accent: 0x1d4ed8, driver: 0xffe0bd },
  'mk8-mario': { body: 0xe63946, accent: 0x1d4ed8, driver: 0xffe0bd },
  'mk8-peach': { body: 0xff8fab, accent: 0xffd60a, driver: 0xffe0bd },
  'mk8-shy-guy': { body: 0xd00000, accent: 0x1e3a8a, driver: 0xf8f9fa },
  'mk8-toad': { body: 0xf8f9fa, accent: 0xd00000, driver: 0x1d4ed8 },
  'mk8-waluigi': { body: 0x6a4c93, accent: 0x14213d, driver: 0xffe0bd },
  'mk8-wario': { body: 0xffd60a, accent: 0x6a4c93, driver: 0xffe0bd },
  'mk8-yoshi': { body: 0x70e000, accent: 0xd00000, driver: 0xf8f9fa },
};

/** The stand-in view of `racer`: its weight class's kart in its own colours. */
export function standInView(racer: Mk8RacerContent): RacerView {
  const template = SHAPE_BY_CLASS[racer.weightClass];
  const colours = STAND_IN_COLOURS[racer.id];
  if (!colours) throw new Error(`No stand-in colours for MK8 racer ${racer.id}`);
  return { ...template, id: racer.id, colours };
}

/** A stand-in view for every MK8 racer. */
export const MK8_RACER_STAND_INS: readonly RacerView[] = MK8_RACERS.map(standInView);
