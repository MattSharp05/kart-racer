import { beforeAll, describe, expect, it } from 'vitest';
import { registerTestRamp } from '../../content/courses/test-ramp/register';
import { registerMk8Content } from '../../register';
import { lakituPose } from '../../render/lakitu';
import scenarios from '../../../scenarios/mk8/hud';
import { createSimState } from '../../../sim/state';
import { step } from '../../../sim/step';
import { DT } from '../../../sim/tuning';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../../../sim/types';
import { countdownSince, countdownText, GO_SECONDS, hudSounds, lakituCue } from './cues';
import { itemSpriteFor, showsCount, headSprite, REEL_ITEMS } from './icons';
import { isMk8Race } from './index';

beforeAll(() => {
  registerTestRamp();
  registerMk8Content();
});

function scenario(name: string): SimState {
  const found = scenarios.find((s) => s.name === name)!;
  return found.setup(found.defaultSeed ?? 1).state;
}

function run(state: SimState, ticks: number) {
  let s = state;
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const r = step(
      s,
      s.karts.map(() => NEUTRAL_INPUT),
    );
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('the countdown (MK-127)', () => {
  it('counts 3, 2, 1, GO! with Lakitu’s light: a red lamp a second, then green', () => {
    let state = scenario('mk8-hud-countdown');
    const seen: { text: string | null; red: number; green: boolean }[] = [];
    for (let i = 0; i < 300; i += 1) {
      const pose = lakituPose(lakituCue(state, state.karts[0]!));
      const light = pose.light ?? { red: -1, green: false };
      const last = seen.at(-1);
      const now = { text: countdownText(state), red: light.red, green: light.green };
      if (!last || last.text !== now.text || last.red !== now.red || last.green !== now.green) {
        seen.push(now);
      }
      state = run(state, 1).state;
    }
    expect(seen.map((s) => s.text)).toEqual(['3', '2', '1', 'GO!', null]);
    expect(seen.slice(0, 4).map((s) => [s.red, s.green])).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [0, true],
    ]);
  });

  it('pops each number from the moment it appears', () => {
    const state = scenario('mk8-hud-countdown');
    expect(countdownSince(state)).toBeCloseTo(0);
    const later = run(state, 30).state;
    expect(countdownSince(later)).toBeCloseTo(0.5);
    const afterGo = { ...later, tick: later.race.goTick + Math.round(0.25 / DT) };
    expect(countdownSince(afterGo)).toBeCloseTo(0.25);
    expect(countdownText({ ...later, tick: later.race.goTick + GO_SECONDS / DT })).toBeNull();
  });

  it('plays MK8’s countdown and GO sounds', () => {
    const { events, state } = run(scenario('mk8-hud-countdown'), 200);
    expect(hudSounds(events, state, 0)).toEqual(['race/countdown', 'race/go']);
  });
});

describe('Lakitu’s lap sign (MK-127)', () => {
  it('holds up FINAL LAP just after you cross into the last lap', () => {
    const state = scenario('mk8-hud-final-lap');
    expect(lakituPose(lakituCue(state, state.karts[0]!)).sign).toBe('FINAL LAP');
  });

  it('shows the lap number on lap 2 and is gone after a few seconds', () => {
    const state = scenario('mk8-hud-roulette');
    const kart = state.karts[0]!;
    const fresh = { ...kart, race: { ...kart.race, lapStartTick: state.tick - 10 } };
    expect(lakituPose(lakituCue(state, fresh)).sign).toBe('2');
    expect(lakituPose(lakituCue(state, kart)).visible).toBe(false);
  });

  it('plays the lap and final-lap sounds for your kart only', () => {
    const state = scenario('mk8-hud-final-lap');
    const sounds = hudSounds(
      [
        { type: 'lap', kartId: 0, lap: 2 },
        { type: 'lap', kartId: 1, lap: 3 },
        { type: 'lap', kartId: 0, lap: 3 },
        { type: 'lap', kartId: 0, lap: 1 },
      ],
      state,
      0,
    );
    expect(sounds).toEqual(['race/lap', 'race/final-lap']);
  });
});

describe('the HUD scenarios (MK-127)', () => {
  it('mk8-hud-final-lap: you lead on lap 3 of 3 with 10 coins', () => {
    const { state } = run(scenario('mk8-hud-final-lap'), 1);
    expect(state.positions[0]).toBe(0);
    expect(state.karts[0]!.race.lap).toBe(3);
    expect(state.karts[0]!.coins).toBe(10);
  });

  it('mk8-hud-two-slots: triple greens with 2 left and a banana in slot 2', () => {
    const { item } = scenario('mk8-hud-two-slots').karts[0]!;
    expect(item).toMatchObject({ held: 'triple-green', uses: 2, roulette: 0 });
    expect(item.second).toMatchObject({ held: 'banana', uses: 1, roulette: 0 });
  });

  it('are MK8 races; the original game’s races are not', () => {
    expect(isMk8Race(scenario('mk8-hud-roulette'))).toBe(true);
    const ours = createSimState({ seed: 1, trackId: 'sunny-circuit', engineClass: 100 });
    expect(isMk8Race(ours)).toBe(false);
    expect(isMk8Race({ ...ours, itemSet: 'mk8' })).toBe(true);
  });
});

describe('HUD icons (MK-127)', () => {
  it('draws triple items with their triple sprite, then the single one and a count', () => {
    expect(itemSpriteFor('triple-green', 3)).toBe('i_green3');
    expect(showsCount('triple-green', 3)).toBe(false);
    expect(itemSpriteFor('triple-green', 2)).toBe('i_green');
    expect(showsCount('triple-green', 2)).toBe(true);
    expect(itemSpriteFor('banana', 1)).toBe('i_banana');
    expect(showsCount('banana', 1)).toBe(false);
    expect(itemSpriteFor('magnet', 1)).toBeUndefined();
  });

  it('has a head for every MK8 racer and reels only MK8 items', () => {
    for (const racer of ['mk8-mario', 'mk8-koopa-troopa', 'mk8-donkey-kong', 'mk8-shy-guy']) {
      expect(headSprite(racer)).toMatch(/^c_/);
    }
    expect(headSprite('maple')).toBeUndefined();
    expect(REEL_ITEMS.every((id) => itemSpriteFor(id, 3) !== undefined)).toBe(true);
  });
});
