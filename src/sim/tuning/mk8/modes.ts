// VS Race and Time Trial (MK-131, `src/mk8/modes/`): `tuning.mk8.vsCpu` and `tuning.mk8.timeTrial`.
export const mk8ModesTuning = {
  /**
   * A VS Race's CPU difficulty: each AI's seeded skill (`tuning.ai.skillMin`–`skillMax`) times
   * this. Skill sets their cruise speed, cornering grip, purple mini-turbos and item dodging.
   */
  vsCpu: {
    easy: 0.86,
    normal: 1,
    hard: 1.06,
  },
  timeTrial: {
    /** Uses of the Triple Mushrooms a Time Trial starts with (MK8: 3). */
    mushrooms: 3,
  },
};
