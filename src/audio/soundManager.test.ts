import { describe, expect, it } from 'vitest';
import { AUDIO_GESTURES, listenForAudioGestures } from './soundManager';

describe('audio unlock gestures (MK-26 QA round 2)', () => {
  it('starts audio on a finger lifting, a click or a key, never on a touch going down', () => {
    const target = new EventTarget();
    let calls = 0;
    listenForAudioGestures(target, () => (calls += 1));
    for (const type of ['pointerdown', 'touchstart', 'pointermove']) {
      target.dispatchEvent(new Event(type));
    }
    expect(calls).toBe(0);
    for (const type of AUDIO_GESTURES) target.dispatchEvent(new Event(type));
    expect(calls).toBe(AUDIO_GESTURES.length);
  });

  it('keeps listening after the first gesture, so iOS can be resumed after an interruption', () => {
    const target = new EventTarget();
    let calls = 0;
    listenForAudioGestures(target, () => (calls += 1));
    target.dispatchEvent(new Event('touchend'));
    target.dispatchEvent(new Event('touchend'));
    expect(calls).toBe(2);
  });
});
