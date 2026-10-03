// MK8 Mode's race rules by game mode (MK-131): what a VS Race's settings and a Time Trial do to a
// fresh race. `src/game/flow.ts` applies them to an MK8 race from the menus before it starts.
import type { SimState } from '../../sim/types';
import { applyTimeTrial } from './timeTrial';
import { applyVsRules, type VsRules } from './vsRace';

/** A race's mode and VS rules (`Mk8RaceSetup`'s). */
export interface ModeRules {
  mode?: string;
  vs?: VsRules;
}

/** Applies the race's mode rules to its fresh state (a Grand Prix has none). */
export function applyModeRules(state: SimState, setup: ModeRules): void {
  if (setup.mode === 'time-trial') applyTimeTrial(state);
  else if (setup.mode === 'vs' && setup.vs) applyVsRules(state, setup.vs);
}
