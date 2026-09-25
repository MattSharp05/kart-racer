import { readSettings, updateSettings } from './storage/settings';
import type { KeyValueStore } from './storage/store';

/**
 * The player's profile (MK-42): a nickname and colour chosen on first launch, plus a random
 * device id for leaderboard rows. Stored on the device in the versioned settings; no login, and
 * nicknames aren't unique.
 */
export interface Profile {
  nickname: string;
  colour: ColourId;
}

export const NICKNAME_MIN_LENGTH = 2;
export const NICKNAME_MAX_LENGTH = 12;
/** Letters, digits, space, `-` and `_` (ASCII only, so the filter and the net protocol stay simple). */
const NICKNAME_CHARS = /^[A-Za-z0-9 _-]+$/;

/** The 8 colour swatches, in the order the Nickname screen shows them. */
export const PROFILE_COLOURS = [
  { id: 'red', label: 'Red', hex: '#e84a4a' },
  { id: 'orange', label: 'Orange', hex: '#f28c28' },
  { id: 'yellow', label: 'Yellow', hex: '#f5d020' },
  { id: 'green', label: 'Green', hex: '#4cc35a' },
  { id: 'teal', label: 'Teal', hex: '#2ec4b6' },
  { id: 'blue', label: 'Blue', hex: '#3a7bea' },
  { id: 'purple', label: 'Purple', hex: '#9b5de5' },
  { id: 'pink', label: 'Pink', hex: '#f15bb5' },
] as const;

export type ColourId = (typeof PROFILE_COLOURS)[number]['id'];
export const DEFAULT_COLOUR: ColourId = 'red';

export function isColourId(value: string): value is ColourId {
  return PROFILE_COLOURS.some((colour) => colour.id === value);
}

export function colourHex(id: ColourId): string {
  return PROFILE_COLOURS.find((colour) => colour.id === id)?.hex ?? PROFILE_COLOURS[0].hex;
}

/**
 * Words rejected anywhere inside a word of the name (after leetspeak is undone). Kept to words
 * that don't hide inside ordinary ones.
 */
const BLOCKED_ANYWHERE = [
  'fuck',
  'shit',
  'cunt',
  'bitch',
  'whore',
  'slut',
  'nigg',
  'faggot',
  'retard',
  'rapist',
  'penis',
  'vagina',
  'twat',
  'bollock',
  'asshole',
  'arsehole',
  'dildo',
  'porn',
  'hitler',
  'kkk',
];

/** Short words that are only rejected as a whole word ("ass", but not "class" or "Cassie"). */
const BLOCKED_WORDS = [
  'ass',
  'arse',
  'cock',
  'dick',
  'fag',
  'fuk',
  'tit',
  'tits',
  'cum',
  'sex',
  'rape',
  'wank',
  'nazi',
];

/** Leetspeak and look-alike characters, read as the letter they stand for. */
const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '2': 'z',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '!': 'i',
  '|': 'l',
  '+': 't',
};

/** Leetspeak undone: "sh1t" → "shit". */
function unleet(text: string): string {
  return [...text].map((c) => LEET[c] ?? c).join('');
}

/** "shiiit" → "shit": repeated letters count once. */
function squeeze(text: string): string {
  return text.replace(/(.)\1+/g, '$1');
}

/**
 * The words of a name as the filter reads them: lower case, leetspeak undone, trailing numbers
 * dropped ("Josh17" is "josh", not "joshit"), and spelled-out letters joined ("f-u-c-k" → "fuck").
 * Separate words are never run together, so "Push It" doesn't read as "pushit".
 */
function filterWords(name: string): string[] {
  const words = name
    .toLowerCase()
    .split(/[\s_-]+/)
    .map((word) => unleet(word.replace(/\d+$/, '')))
    .filter(Boolean);
  const spelled: string[] = [];
  let letters = '';
  for (const word of [...words, '']) {
    if (word.length === 1) {
      letters += word;
      continue;
    }
    if (letters.length > 1) spelled.push(letters);
    letters = '';
  }
  return [...words, ...spelled].flatMap((word) => [word, squeeze(word)]);
}

/** Whether a name contains a word on the filter list (case- and leetspeak-insensitive). */
export function isOffensive(name: string): boolean {
  const words = filterWords(name);
  return (
    BLOCKED_ANYWHERE.some((bad) => words.some((word) => word.includes(bad))) ||
    BLOCKED_WORDS.some((bad) => words.includes(bad))
  );
}

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; error: string };

/** Trims and checks a typed nickname; the error is a friendly line for the screen. */
export function validateNickname(raw: string): NicknameCheck {
  const nickname = raw.trim().replace(/\s+/g, ' ');
  if (nickname.length < NICKNAME_MIN_LENGTH) {
    return { ok: false, error: `Names need at least ${NICKNAME_MIN_LENGTH} characters.` };
  }
  if (nickname.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, error: `Names can be up to ${NICKNAME_MAX_LENGTH} characters.` };
  }
  if (!NICKNAME_CHARS.test(nickname)) {
    return { ok: false, error: 'Use letters, numbers, spaces, - and _ only.' };
  }
  if (isOffensive(nickname)) {
    return { ok: false, error: "Let's keep it friendly: try another name." };
  }
  return { ok: true, nickname };
}

/** The saved profile, or undefined before the player has picked a name (first launch). */
export function readProfile(store: KeyValueStore): Profile | undefined {
  const { nickname, colour } = readSettings(store);
  if (!validateNickname(nickname).ok) return undefined;
  return { nickname, colour: isColourId(colour) ? colour : DEFAULT_COLOUR };
}

/** Saves the profile (the nickname must already be validated); makes sure a device id exists. */
export function saveProfile(store: KeyValueStore, profile: Profile): void {
  updateSettings(store, { nickname: profile.nickname, colour: profile.colour });
  deviceId(store);
}

/** Forgets the nickname and colour (the `first-launch` scenario). The device id stays. */
export function clearProfile(store: KeyValueStore): void {
  updateSettings(store, { nickname: '', colour: '' });
}

/** This device's id: generated once, then read back from the settings. */
export function deviceId(store: KeyValueStore, newId: () => string = randomUuid): string {
  const stored = readSettings(store).deviceId;
  if (stored) return stored;
  const id = newId();
  updateSettings(store, { deviceId: id });
  return id;
}

/**
 * A random (v4) UUID. `crypto.randomUUID` only exists on secure pages, and the dev server is
 * opened over plain http on phones, so fall back to `getRandomValues`.
 */
export function randomUuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40; // version 4
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
