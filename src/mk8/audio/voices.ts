// MK8 racer voice lines (MK-117): `pnpm mk8:build` (MK-94) writes `audio/voices.json`, racer →
// voice event → converted clips, with each racer's clips in its own manifest group. The game reads
// the index to find a racer's clips for an event; a racer, event or clip the pack hasn't got
// plays nothing.
import { DT } from '../../sim/tuning';
import type { KartState, SimEvent, SimState } from '../../sim/types';
import { MK8_RACER_VIEWS } from '../content/racers/render';
import {
  FINISH_WIN_PLACES,
  VOICE_COOLDOWN_SECONDS,
  VOICE_LINE_SECONDS,
  VOICE_RANGE,
} from './config';
import type { VoiceEvent } from './voiceEvents';

/** The index's path in the pack (`tools/mk8/buildAudio.ts` → `VOICES_FILE`). */
export const VOICES_PATH = 'audio/voices.json';

/** racer (the pipeline's voice id, e.g. `shy-guy`) → event → clip paths in the pack. */
export type VoiceIndex = Record<string, Partial<Record<VoiceEvent, string[]>>>;

/** What the player records for a voice line (`window.__mk8.sounds`): `voice/<racer>/<event>`. */
export type VoiceSoundId = `voice/${string}/${VoiceEvent}`;

export function voiceSoundId(racer: string, event: VoiceEvent): VoiceSoundId {
  return `voice/${racer}/${event}`;
}

/** Parses the index's bytes; undefined when they aren't a voice index. */
export function parseVoiceIndex(bytes: ArrayBuffer): VoiceIndex | undefined {
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof json !== 'object' || json === null || Array.isArray(json)) return undefined;
    const index: VoiceIndex = {};
    for (const [racer, events] of Object.entries(json)) {
      if (typeof events !== 'object' || events === null) continue;
      const clean: Partial<Record<VoiceEvent, string[]>> = {};
      for (const [event, files] of Object.entries(events as Record<string, unknown>)) {
        if (Array.isArray(files))
          clean[event as VoiceEvent] = files.filter((f): f is string => typeof f === 'string');
      }
      index[racer] = clean;
    }
    return index;
  } catch {
    return undefined;
  }
}

/** Every clip of `event` for `racers` (the files to load before they can play). */
export function voiceClips(
  index: VoiceIndex,
  racers: readonly string[],
  event: VoiceEvent,
): string[] {
  return racers.flatMap((racer) => index[racer]?.[event] ?? []);
}

// ---------------------------------------------------------------------------------------------
// Race voices (MK-110): a racer's lines on race events. Each kart that is an MK8 racer (its
// `loadout`) speaks for its own events; only the camera's kart and karts near it are heard, one
// line at a time per kart, each event at most once per cooldown (`./config.ts`).

/** How a voice line plays: its loudness (0..1) and which of the event's clips (0..1, seeded). */
export interface VoiceOptions {
  volume?: number;
  pick?: number;
}

/** What race voices need from MK8's player (`Mk8AudioPlayer`). */
export interface RaceVoicePlayer {
  voice(racer: string, event: VoiceEvent, options?: VoiceOptions): void;
}

/** The voice id (the pipeline's, `mario`) of an MK8 racer id (`mk8-mario`); undefined otherwise. */
export function racerVoiceId(racer: string | undefined): string | undefined {
  return racer === undefined ? undefined : MK8_RACER_VIEWS.find((v) => v.id === racer)?.model;
}

/** A kart's voice id: its loadout's racer's, when it is an MK8 racer. */
export function kartVoiceId(kart: KartState | undefined): string | undefined {
  return racerVoiceId(kart?.loadout?.racer);
}

/** The line a kart says for `event` that needs no memory of the race (undefined: none). */
export function eventVoiceLines(event: SimEvent): { kartId: number; line: VoiceEvent }[] {
  switch (event.type) {
    case 'boost':
    case 'boostPad':
      return [{ kartId: event.kartId, line: 'boost' }];
    case 'trick':
      return [{ kartId: event.kartId, line: 'trick' }];
    case 'glideOpen':
      return [{ kartId: event.kartId, line: 'glide' }];
    case 'kartHit':
      // The kart that was hit cries out; whoever hit it (not itself, not the course) gloats.
      return event.by >= 0 && event.by !== event.kartId
        ? [
            { kartId: event.kartId, line: 'hit' },
            { kartId: event.by, line: 'itemHit' },
          ]
        : [{ kartId: event.kartId, line: 'hit' }];
    default:
      return [];
  }
}

/** A seeded 0..1 from the tick, kart and line (no `Math.random`: replays say the same lines). */
export function voicePick(tick: number, kartId: number, line: VoiceEvent): number {
  let h = (tick * 0x9e3779b1 + kartId * 0x85ebca6b) >>> 0;
  for (let i = 0; i < line.length; i++) h = Math.imul(h ^ line.charCodeAt(i), 0x01000193) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 0x1_0000_0000;
}

export interface RaceVoicesOptions {
  /** Loads the voice lines of these racers (voice ids), once per race; errors are its own. */
  load?: (voiceIds: string[]) => void;
}

export class RaceVoices {
  /** Seconds (race time) each kart is speaking until. */
  private readonly busyUntil = new Map<number, number>();
  /** Race time each kart may next say each line. */
  private readonly nextAllowed = new Map<string, number>();
  /** Karts in water (a fall now is a water fall). */
  private readonly wet = new Set<number>();
  private positions: readonly number[] | undefined;
  private race: string | undefined;
  private lastTick = -1;

  constructor(
    private readonly player: () => RaceVoicePlayer,
    private readonly options: RaceVoicesOptions = {},
  ) {}

  /** Says what `event` makes karts say, heard from the kart the camera follows. */
  onEvent(event: SimEvent, state: SimState, followId: number): void {
    this.newRaceCheck(state);
    switch (event.type) {
      case 'waterEnter':
        this.wet.add(event.kartId);
        return;
      case 'waterExit':
        this.wet.delete(event.kartId);
        return;
      case 'respawn': {
        const line = this.wet.delete(event.kartId) ? 'waterFall' : 'fall';
        this.say(state, followId, event.kartId, line);
        return;
      }
      case 'positionChange': {
        const before = this.positions?.indexOf(followId) ?? -1;
        const after = event.positions.indexOf(followId);
        this.positions = [...event.positions];
        if (before >= 0 && after >= 0 && after < before) {
          this.say(state, followId, followId, 'overtake');
        }
        return;
      }
      case 'finish':
        // The winner says the win line, wherever they are; the player wins or loses by place.
        if (event.kartId === followId) {
          const line = event.position <= FINISH_WIN_PLACES ? 'finishWin' : 'finishLose';
          this.say(state, followId, followId, line, { always: true });
        } else if (event.position === 1) {
          this.say(state, followId, event.kartId, 'finishWin', { always: true });
        }
        return;
      default:
        for (const { kartId, line } of eventVoiceLines(event)) {
          this.say(state, followId, kartId, line);
        }
    }
  }

  private say(
    state: SimState,
    followId: number,
    kartId: number,
    line: VoiceEvent,
    { always = false } = {},
  ): void {
    const kart = state.karts[kartId];
    const voice = kartVoiceId(kart);
    if (!kart || !voice) return;
    let volume = 1;
    const me = state.karts[followId];
    if (kartId !== followId && !always) {
      if (!me) return;
      const d = Math.hypot(
        kart.position.x - me.position.x,
        kart.position.y - me.position.y,
        kart.position.z - me.position.z,
      );
      if (d > VOICE_RANGE) return;
      volume = 1 - d / VOICE_RANGE;
    }
    const now = state.tick * DT;
    const key = `${kartId}/${line}`;
    if (!always) {
      if (now < (this.busyUntil.get(kartId) ?? -Infinity)) return;
      if (now < (this.nextAllowed.get(key) ?? -Infinity)) return;
    }
    this.busyUntil.set(kartId, now + VOICE_LINE_SECONDS);
    this.nextAllowed.set(key, now + VOICE_COOLDOWN_SECONDS[line]);
    this.player().voice(voice, line, { volume, pick: voicePick(state.tick, kartId, line) });
  }

  /** A new race (another track or start, or time went back): forget the last one's lines. */
  private newRaceCheck(state: SimState): void {
    const race = `${state.trackId}/${state.race.countdownStartTick}/${state.karts.length}`;
    if (race === this.race && state.tick >= this.lastTick) {
      this.lastTick = state.tick;
      return;
    }
    this.race = race;
    this.lastTick = state.tick;
    this.busyUntil.clear();
    this.nextAllowed.clear();
    this.wet.clear();
    this.positions = undefined;
    const ids = [...new Set(state.karts.map(kartVoiceId).filter((v) => v !== undefined))];
    if (ids.length > 0) this.options.load?.(ids);
  }
}
