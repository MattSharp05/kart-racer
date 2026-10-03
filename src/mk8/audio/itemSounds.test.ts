import { beforeAll, describe, expect, it } from 'vitest';
import { giveRotation, mk8AllItemsRace, mk8ItemRotation } from '../../scenarios/mk8/allItems';
import { createSimState } from '../../sim/state';
import { step } from '../../sim/step';
import { getTrack } from '../../sim/track';
import { NEUTRAL_INPUT, type SimEvent, type SimState } from '../../sim/types';
import { testRampTrack } from '../content/courses/test-ramp';
import { registerTestRamp } from '../content/courses/test-ramp/register';
import { MK8_ITEMS } from '../content/items';
import { registerMk8Content } from '../register';
import { ITEM_HEARING_RANGE, playItemSound, type ItemSoundPlayer } from './itemSoundSkin';
import { itemCue, ITEM_SOUNDS, STAR_MUSIC, SYNTH } from './itemSounds';
import { SOUND_IDS, type SoundId } from './soundIds';

beforeAll(() => {
  registerMk8Content();
  registerTestRamp();
});

describe('MK8 item sounds (MK-129)', () => {
  it('every MK8 item has a use and hit sound: a bank sound, our synth, or none', () => {
    for (const item of MK8_ITEMS) expect(ITEM_SOUNDS[item.id], item.id).toBeDefined();
    for (const [id, sounds] of Object.entries(ITEM_SOUNDS)) {
      for (const sound of [sounds.use, sounds.hit, ...Object.values(sounds.fx ?? {})]) {
        if (sound === null || sound === SYNTH) continue;
        expect(SOUND_IDS, `${id}: ${sound}`).toContain(sound);
      }
    }
    expect(SOUND_IDS).toContain(STAR_MUSIC);
  });

  it('every item event of a race using every MK8 item maps to a sample or an explicit fallback', () => {
    const def = getTrack(testRampTrack().id);
    if (def.kind !== 'mesh') throw new Error('mesh track expected');
    const used = new Set<string>();
    const events: SimEvent[] = [];
    let state = mk8AllItemsRace(def, 1);
    let turn = 0;
    for (let tick = 0; tick < 240 * 60; tick += 1) {
      const result = step(state, [NEUTRAL_INPUT]);
      state = result.state;
      events.push(...result.events);
      for (const e of result.events) if (e.type === 'itemUsed') used.add(e.item);
      const left = mk8ItemRotation().filter((id) => !used.has(id));
      if (left.length === 0) break;
      for (const kart of state.karts) {
        if (kart.item.held !== null || kart.item.roulette > 0) continue;
        giveRotation(kart, left, turn);
        turn += 2;
      }
    }
    const kinds = new Set<string>();
    for (const e of events) {
      if (e.type === 'kartHit' && !(e.kind in ITEM_SOUNDS)) continue; // hazards, squashes
      const cue = itemCue(e);
      if (
        e.type === 'itemUsed' ||
        e.type === 'kartHit' ||
        e.type === 'itemFx' ||
        e.type === 'itemBoxHit' ||
        e.type === 'star' ||
        e.type === 'lightning'
      ) {
        expect(cue, JSON.stringify(e)).toBeDefined();
        kinds.add(e.type === 'itemFx' ? `${e.item}.${e.fx}` : e.type);
      }
      // Every effect is named in the table, not left to the default.
      if (e.type === 'itemFx') {
        expect(ITEM_SOUNDS[e.item]?.fx?.[e.fx], `${e.item}.${e.fx}`).not.toBeUndefined();
      }
    }
    expect([...used].sort()).toEqual(mk8ItemRotation().sort());
    expect(kinds).toContain('kartHit');
    expect([...kinds].some((k) => k.startsWith('super-horn.'))).toBe(true);
  });
});

describe('playItemSound (MK-129)', () => {
  /** A player whose pack has `files`; records what it plays. */
  function fakePlayer(files: readonly SoundId[]) {
    const played: [SoundId, number][] = [];
    const player: ItemSoundPlayer = {
      play: (id, volume = 1) => played.push([id, volume]),
      has: (id) => files.includes(id),
    };
    return { player, played };
  }

  /** Two karts on the test ramp, `apart` m apart. */
  function twoKarts(apart: number): SimState {
    return createSimState({
      seed: 1,
      trackId: testRampTrack().id,
      karts: [
        { position: { x: 10, y: 0, z: 0 }, heading: 0 },
        { position: { x: 10 + apart, y: 0, z: 0 }, heading: 0 },
      ],
    });
  }

  const thrown: SimEvent = { type: 'itemUsed', kartId: 1, item: 'green' };

  it('plays the pack’s sample, quieter with distance, and skips our synth', () => {
    const { player, played } = fakePlayer(['items/shell-throw']);
    expect(playItemSound(player, thrown, twoKarts(15), 0)).toBe(true);
    expect(played).toEqual([['items/shell-throw', 1 - 15 / ITEM_HEARING_RANGE]]);
    expect(playItemSound(player, thrown, twoKarts(ITEM_HEARING_RANGE + 5), 0)).toBe(true);
    expect(played).toHaveLength(1);
  });

  it('leaves it to our synth without the pack’s file, or when the table says so', () => {
    const { player, played } = fakePlayer([]);
    expect(playItemSound(player, thrown, twoKarts(5), 0)).toBe(false);
    const magnet: SimEvent = { type: 'itemUsed', kartId: 0, item: 'magnet' };
    expect(playItemSound(fakePlayer(['items/shell-throw']).player, magnet, twoKarts(5), 0)).toBe(
      false,
    );
    expect(played).toEqual([]);
  });

  it('silences a sound another covers only while the pack’s item sounds are there', () => {
    const lightningHit: SimEvent = { type: 'kartHit', kartId: 1, by: 0, kind: 'lightning' };
    expect(playItemSound(fakePlayer([]).player, lightningHit, twoKarts(5), 0)).toBe(false);
    const { player, played } = fakePlayer(['items/lightning-strike']);
    expect(playItemSound(player, lightningHit, twoKarts(5), 0)).toBe(true);
    expect(played).toEqual([]);
  });

  it('a star: its sound, and MK8’s star music for the kart the camera follows', () => {
    const { player, played } = fakePlayer(['items/star-use', STAR_MUSIC]);
    expect(playItemSound(player, { type: 'star', kartId: 0 }, twoKarts(5), 0)).toBe(true);
    expect(played.map(([id]) => id)).toEqual(['items/star-use', STAR_MUSIC]);
    played.length = 0;
    playItemSound(player, { type: 'star', kartId: 1 }, twoKarts(5), 0);
    expect(played.map(([id]) => id)).toEqual(['items/star-use']);
  });

  it('leaves events that aren’t items’ to our synth', () => {
    const { player } = fakePlayer(['items/shell-throw']);
    expect(playItemSound(player, { type: 'go' }, twoKarts(5), 0)).toBe(false);
    const crushed: SimEvent = { type: 'kartHit', kartId: 0, by: -1, kind: 'hazard' };
    expect(playItemSound(player, crushed, twoKarts(5), 0)).toBe(false);
  });
});
