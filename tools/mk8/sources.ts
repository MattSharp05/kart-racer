// `sources.json`: what the MK8 pipeline converts (MK-93). Metadata only, no download code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MODEL_KINDS = [
  'course',
  'racer',
  'body',
  'tire',
  'glider',
  'item',
  'npc',
  'trophy',
] as const;
export type ModelKind = (typeof MODEL_KINDS)[number];

export interface ModelSource {
  /** Output id and raw folder name (kebab-case). */
  id: string;
  name: string;
  kind: ModelKind;
  /** The source site's asset id, null when not looked up yet. */
  assetId: number | null;
  /** The OBJ inside the raw folder, when there is more than one. */
  obj?: string;
  /** Material-name regexes whose meshes are simplified as decoration. */
  decoration?: string[];
  /** Courses: false skips the collision export. */
  collision?: boolean;
}

export const SOUND_GAMES = ['mk8', 'mk8dx', 'mkt'] as const;

/** A sound pack (MK-94): its raw files go in `$MK8_RAW/sounds/<id>/`. */
export interface SoundSource {
  id: string;
  name: string;
  /** `voice`: one racer's voice pack (converted by voice event); `sfx`: files picked by soundIds.ts. */
  kind: 'voice' | 'sfx';
  /** mk8 (Wii U), mk8dx (Switch) or mkt (Tour). */
  game: (typeof SOUND_GAMES)[number];
  /** Voice packs: the racer's model id. */
  racer?: string;
  assetId: number | null;
}

/** A sprite sheet (MK-95): an image, or a folder when the source is a zip. */
export interface SheetSource {
  id: string;
  name: string;
  assetId: number | null;
  /** Under $MK8_RAW; ends in `/` for a folder. */
  raw: string;
}

export interface Sources {
  models: ModelSource[];
  sounds: SoundSource[];
  sheets: SheetSource[];
}

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function parseSources(json: unknown): Sources {
  const sources = json as Sources;
  if (!Array.isArray(sources.models)) throw new Error('sources.json: `models` must be an array');
  const seen = new Set<string>();
  for (const m of sources.models) {
    if (!ID.test(m.id)) throw new Error(`sources.json: bad id ${JSON.stringify(m.id)}`);
    if (seen.has(m.id)) throw new Error(`sources.json: duplicate id ${m.id}`);
    seen.add(m.id);
    if (!MODEL_KINDS.includes(m.kind))
      throw new Error(`sources.json: ${m.id} has unknown kind ${m.kind}`);
    if (m.assetId !== null && !Number.isInteger(m.assetId))
      throw new Error(`sources.json: ${m.id} assetId must be an integer or null`);
  }
  sources.sounds ??= [];
  if (!Array.isArray(sources.sounds)) throw new Error('sources.json: `sounds` must be an array');
  for (const p of sources.sounds) {
    if (!ID.test(p.id)) throw new Error(`sources.json: bad sound id ${JSON.stringify(p.id)}`);
    if (seen.has(p.id)) throw new Error(`sources.json: duplicate id ${p.id}`);
    seen.add(p.id);
    if (p.kind !== 'voice' && p.kind !== 'sfx')
      throw new Error(`sources.json: ${p.id} has unknown kind ${p.kind}`);
    if (!SOUND_GAMES.includes(p.game))
      throw new Error(`sources.json: ${p.id} has unknown game ${p.game}`);
    if (p.kind === 'voice' && !sources.models.some((m) => m.kind === 'racer' && m.id === p.racer))
      throw new Error(`sources.json: voice pack ${p.id} names no racer model`);
    if (p.assetId !== null && !Number.isInteger(p.assetId))
      throw new Error(`sources.json: ${p.id} assetId must be an integer or null`);
  }
  if (!Array.isArray(sources.sheets)) throw new Error('sources.json: `sheets` must be an array');
  for (const sheet of sources.sheets) {
    if (!ID.test(sheet.id))
      throw new Error(`sources.json: bad sheet id ${JSON.stringify(sheet.id)}`);
    if (seen.has(sheet.id)) throw new Error(`sources.json: duplicate id ${sheet.id}`);
    seen.add(sheet.id);
  }
  return sources;
}

export function loadSources(file = join(import.meta.dirname, 'sources.json')): Sources {
  return parseSources(JSON.parse(readFileSync(file, 'utf8')));
}

/** Output folder per kind under `models/`; courses get a folder each. */
const KIND_DIRS: Record<ModelKind, string> = {
  course: 'courses',
  racer: 'racers',
  body: 'karts/bodies',
  tire: 'karts/tires',
  glider: 'karts/gliders',
  item: 'items',
  npc: 'npcs',
  trophy: 'trophies',
};

/** Manifest group: one per course and per racer (loaded on demand), one per other kind. */
export function modelGroup(source: ModelSource): string {
  if (source.kind === 'course') return `course/${source.id}`;
  if (source.kind === 'racer') return `racer/${source.id}`;
  return KIND_DIRS[source.kind].split('/')[0] ?? source.kind;
}

/** Output paths (relative to the output folder) for a model's files. */
export function modelOutputs(source: ModelSource): {
  glb: string;
  glbLow: string;
  collision?: string;
} {
  if (source.kind === 'course') {
    const dir = `models/courses/${source.id}`;
    return {
      glb: `${dir}/course.glb`,
      glbLow: `${dir}/course-low.glb`,
      ...(source.collision === false ? {} : { collision: `${dir}/collision.bin` }),
    };
  }
  const base = `models/${KIND_DIRS[source.kind]}/${source.id}`;
  return { glb: `${base}.glb`, glbLow: `${base}-low.glb` };
}
