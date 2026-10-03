// MK8 racer voice lines (MK-117): `pnpm mk8:build` (MK-94) writes `audio/voices.json`, racer →
// voice event → converted clips, with each racer's clips in its own manifest group. The game reads
// the index to find a racer's clips for an event; a racer, event or clip the pack hasn't got
// plays nothing.
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
