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

/** A sprite sheet (MK-95): an image, or a folder when the source is a zip. */
export interface SheetSource {
  id: string;
  name: string;
  assetId: number | null;
  /** Under $MK8_RAW; ends in `/` for a folder. */
  raw: string;
}

/** A sound pack (MK-94): its extracted files go in `$MK8_RAW/audio/<id>/`. */
export interface SoundPackSource {
  id: string;
  name: string;
  game: 'mk8' | 'mk8d' | 'mktour';
  assetId: number | null;
}

export interface Sources {
  models: ModelSource[];
  sheets: SheetSource[];
  soundPacks: SoundPackSource[];
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
  if (!Array.isArray(sources.sheets)) throw new Error('sources.json: `sheets` must be an array');
  if (!Array.isArray(sources.soundPacks))
    throw new Error('sources.json: `soundPacks` must be an array');
  for (const { id } of [...sources.sheets, ...sources.soundPacks]) {
    if (!ID.test(id)) throw new Error(`sources.json: bad id ${JSON.stringify(id)}`);
    if (seen.has(id)) throw new Error(`sources.json: duplicate id ${id}`);
    seen.add(id);
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
