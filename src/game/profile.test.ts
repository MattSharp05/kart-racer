import { describe, expect, it } from 'vitest';
import {
  clearProfile,
  deviceId,
  isOffensive,
  PROFILE_COLOURS,
  randomUuid,
  readProfile,
  saveProfile,
  validateNickname,
} from './profile';
import { readSettings } from './storage/settings';
import { MemoryStore } from './storage/store';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('validateNickname', () => {
  it('accepts letters, digits, space, - and _', () => {
    for (const name of ['Matt', 'Jo', 'Kart_Fan-99', 'Big Ed', 'ABCDEFGHIJKL']) {
      expect(validateNickname(name)).toEqual({ ok: true, nickname: name });
    }
  });

  it('trims spaces (and squashes runs of them) before checking the length', () => {
    expect(validateNickname('  Matt  ')).toEqual({ ok: true, nickname: 'Matt' });
    expect(validateNickname(' Big   Ed ')).toEqual({ ok: true, nickname: 'Big Ed' });
    expect(validateNickname('  A  ').ok).toBe(false);
  });

  it('rejects names that are too short or too long', () => {
    for (const name of ['', ' ', 'M', 'ABCDEFGHIJKLM', 'Matthew Sharp']) {
      const check = validateNickname(name);
      expect(check.ok, name).toBe(false);
    }
    expect(validateNickname('M')).toMatchObject({ error: expect.stringContaining('at least 2') });
    expect(validateNickname('ABCDEFGHIJKLM')).toMatchObject({
      error: expect.stringContaining('up to 12'),
    });
  });

  it('rejects other characters', () => {
    for (const name of ['Matt!', 'a.b', 'Zoë', 'x@y', 'emoji🏎', '<b>hi</b>']) {
      expect(validateNickname(name), name).toMatchObject({
        ok: false,
        error: expect.stringContaining('letters, numbers'),
      });
    }
  });

  it('rejects filtered words with a friendly message', () => {
    expect(validateNickname('shithead')).toEqual({
      ok: false,
      error: "Let's keep it friendly: try another name.",
    });
  });
});

describe('bad-word filter', () => {
  it('ignores case, leetspeak, separators and repeated letters', () => {
    for (const name of [
      'FUCK',
      'Fuck3r',
      'sh1t',
      'SH!T',
      '$hit',
      'shiiiit',
      'b1tch',
      'f-u-c-k',
      'f_u_c_k',
      'c u n t',
      'n1gg4',
      'a55hole',
      '@ss',
      'Big Ass',
      'a-s-s',
      'd1ck',
      'H1tl3r',
      'fuck69',
      '5hit',
      'ass 69',
      'F U C K',
    ]) {
      expect(isOffensive(name), name).toBe(true);
    }
  });

  it("doesn't flag ordinary names that contain a short word", () => {
    for (const name of [
      'Cassie',
      'Classic',
      'Dickens',
      'Titan',
      'Sussex',
      'Cockpit',
      'Matt',
      // Digits after a name are a number, and separate words aren't run together.
      'Josh17',
      'Push It',
      'Mash It',
      'Scott Wat',
      'Kit 5',
    ]) {
      expect(isOffensive(name), name).toBe(false);
    }
  });
});

describe('profile storage', () => {
  it('has no profile on first launch, then round-trips name and colour', () => {
    const store = new MemoryStore();
    expect(readProfile(store)).toBeUndefined();
    saveProfile(store, { nickname: 'Matt', colour: 'blue' });
    expect(readProfile(store)).toEqual({ nickname: 'Matt', colour: 'blue' });
  });

  it('keeps the other settings', () => {
    const store = new MemoryStore();
    saveProfile(store, { nickname: 'Matt', colour: 'green' });
    expect(readSettings(store)).toMatchObject({ muted: false, nickname: 'Matt', colour: 'green' });
  });

  it('treats a tampered name as no profile and an unknown colour as the default', () => {
    const store = new MemoryStore();
    store.set('kart-racer:settings', JSON.stringify({ version: 1, nickname: 'x', colour: 'blue' }));
    expect(readProfile(store)).toBeUndefined();
    store.set(
      'kart-racer:settings',
      JSON.stringify({ version: 1, nickname: 'Matt', colour: 'plaid' }),
    );
    expect(readProfile(store)).toEqual({ nickname: 'Matt', colour: 'red' });
  });

  it('clearProfile forgets the name but keeps the device id', () => {
    const store = new MemoryStore();
    saveProfile(store, { nickname: 'Matt', colour: 'blue' });
    const id = deviceId(store);
    clearProfile(store);
    expect(readProfile(store)).toBeUndefined();
    expect(deviceId(store)).toBe(id);
  });

  it('offers 8 distinct colours', () => {
    expect(new Set(PROFILE_COLOURS.map((c) => c.id)).size).toBe(8);
    expect(new Set(PROFILE_COLOURS.map((c) => c.hex)).size).toBe(8);
  });
});

describe('device id', () => {
  it('is generated once and persists', () => {
    const store = new MemoryStore();
    let made = 0;
    const make = () => `id-${++made}`;
    expect(deviceId(store, make)).toBe('id-1');
    expect(deviceId(store, make)).toBe('id-1');
    expect(made).toBe(1);
    expect(readSettings(store).deviceId).toBe('id-1');
  });

  it('is created when the profile is first saved', () => {
    const store = new MemoryStore();
    saveProfile(store, { nickname: 'Matt', colour: 'blue' });
    expect(readSettings(store).deviceId).toMatch(UUID);
  });

  it('is a v4 UUID, also where crypto.randomUUID is missing (plain-http dev server)', () => {
    expect(randomUuid()).toMatch(UUID);
    const original = crypto.randomUUID;
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
      const ids = new Set(Array.from({ length: 50 }, () => randomUuid()));
      expect(ids.size).toBe(50);
      for (const id of ids) expect(id).toMatch(UUID);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});
