/** All tunable numbers live here (CLAUDE.md → Conventions). */

/** Fixed simulation rate (docs/TDD.md → Architecture). */
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;

/** MK-2 placeholder: speed of the stand-in kart at full throttle, m/s. Replaced by real physics in MK-5. */
export const PLACEHOLDER_SPEED = 8;
