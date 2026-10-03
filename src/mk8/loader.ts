// MK8 pack loader (MK-97, ADR 0009): fetches `/mk8/manifest.json`, then the files of the groups a
// screen needs, reporting progress by bytes. Locally `pnpm mk8:build` writes `.mk8-out/`, which
// `pnpm dev` serves at `/mk8/`; on the site (MK-135) the pack sits behind a server-checked
// password, so a 401 means "log in first" (`PackLockedError`, then `mk8Login`). No pack at all →
// MK8 Mode says how to build it. Loaded files stay in memory, so a Retry fetches only what failed.
import type { Manifest, ManifestEntry } from '../../tools/mk8/manifest.ts';

/** Where the dev server serves the pack. */
export const PACK_BASE = '/mk8/';
export const MANIFEST_PATH = 'manifest.json';
/** What the menus and HUD need before any course: sprites (`ui`) and UI sounds (`audio/ui`). */
export const UI_GROUPS = ['ui', 'audio/ui'] as const;
/** Files fetched at once. */
const CONCURRENCY = 4;
/** Progress weight of the font step, in bytes (the two woff2 weights are ~100 KB). */
const FONT_WEIGHT_BYTES = 100_000;

/** The manifest isn't there (or isn't a manifest): no pack is installed. */
export class PackNotInstalledError extends Error {
  constructor() {
    super('MK8 pack not installed');
    this.name = 'PackNotInstalledError';
  }
}

/** The site's pack is behind the password (HTTP 401): log in, then load again (MK-135). */
export class PackLockedError extends Error {
  constructor() {
    super('MK8 pack locked');
    this.name = 'PackLockedError';
  }
}

/** Where the site's login endpoint is (`api/mk8-login.ts`). */
export const LOGIN_PATH = '/api/mk8-login';

/** How a login went: in, wrong password, too many tries, or no password set on this server. */
export type LoginResult = 'ok' | 'wrong' | 'limited' | 'unavailable';

/** Trades the password for the pack's session cookie (HttpOnly: the page never sees it). */
export async function mk8Login(
  password: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<LoginResult> {
  const response = await fetchImpl(LOGIN_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
    credentials: 'same-origin',
  });
  if (response.ok) return 'ok';
  if (response.status === 401) return 'wrong';
  if (response.status === 429) return 'limited';
  return 'unavailable';
}

/** A pack file couldn't be fetched (network, server error, wrong size). */
export class PackLoadError extends Error {
  constructor(
    readonly path: string,
    reason: string,
  ) {
    super(`Couldn't load ${path}: ${reason}`);
    this.name = 'PackLoadError';
  }
}

/** Called with the share loaded so far, 0–1. */
export type OnProgress = (fraction: number) => void;

export interface LoaderOptions {
  fetch?: typeof fetch;
  /** URL prefix of the pack, ending in `/`. */
  base?: string;
  /** Loads the UI font (the OFL M PLUS Rounded 1c in `public/mk8/fonts/`); none in unit tests. */
  loadFonts?: () => Promise<void>;
}

/**
 * Item and item box models (MK-103), and (MK-129) the item sounds and star music: loaded together
 * for a race.
 */
export const ITEM_GROUPS = ['items', 'audio/items', 'audio/star'] as const;

/** The groups of a course and of some racers, as the pipeline names them (`tools/mk8/sources.ts`). */
export const courseGroups = (id: string): string[] => [`course/${id}`, `audio/course/${id}`];
export const racerGroups = (ids: readonly string[]): string[] => ids.map((id) => `racer/${id}`);

export class Mk8Loader {
  private manifest: Manifest | undefined;
  private readonly files = new Map<string, ArrayBuffer>();
  private fontsLoaded = false;
  private readonly fetch: typeof fetch;
  private readonly base: string;
  private readonly loadFonts: (() => Promise<void>) | undefined;

  constructor(options: LoaderOptions = {}) {
    this.fetch = options.fetch ?? ((input, init) => fetch(input, init));
    this.base = options.base ?? PACK_BASE;
    this.loadFonts = options.loadFonts;
  }

  /** The manifest, fetched once. Throws `PackNotInstalledError` when there is none. */
  async loadManifest(): Promise<Manifest> {
    if (this.manifest) return this.manifest;
    let response: Response;
    try {
      // `Accept` keeps an SPA fallback (vite preview) from answering with index.html.
      response = await this.fetch(this.base + MANIFEST_PATH, {
        headers: { Accept: 'application/json' },
      });
    } catch (e) {
      throw new PackLoadError(MANIFEST_PATH, e instanceof Error ? e.message : String(e));
    }
    if (response.status === 404) throw new PackNotInstalledError();
    if (response.status === 401) throw new PackLockedError();
    if (!response.ok) throw new PackLoadError(MANIFEST_PATH, `HTTP ${response.status}`);
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      // A server that answers every path with a page (an SPA fallback) has no pack either.
      throw new PackNotInstalledError();
    }
    if (!isManifest(json)) throw new PackNotInstalledError();
    this.manifest = json;
    return json;
  }

  /** The manifest, the UI groups and the font: what MK8 Mode needs before its first screen. */
  async loadUi(onProgress: OnProgress = () => {}): Promise<void> {
    await this.loadGroups(UI_GROUPS, onProgress, true);
  }

  /** A course's model, collision and sounds, on demand. */
  loadCourse(id: string, onProgress: OnProgress = () => {}): Promise<void> {
    return this.loadGroups(courseGroups(id), onProgress);
  }

  /** Racer models, on demand. */
  loadRacers(ids: readonly string[], onProgress: OnProgress = () => {}): Promise<void> {
    return this.loadGroups(racerGroups(ids), onProgress);
  }

  /**
   * Single files by manifest path (MK-101: the Standard Kart and Lakitu, whose groups hold every
   * kart part and NPC). Throws `PackLoadError` for a path the pack hasn't got.
   */
  async loadFiles(paths: readonly string[], onProgress: OnProgress = () => {}): Promise<void> {
    const manifest = await this.loadManifest();
    const missing = paths.find((path) => !manifest.files.some((e) => e.path === path));
    if (missing !== undefined) throw new PackLoadError(missing, 'not in the pack');
    const wanted = new Set(paths);
    await this.loadEntries((e) => wanted.has(e.path), onProgress);
  }

  /** Item and item box models (MK-103), on demand. */
  loadItems(onProgress: OnProgress = () => {}): Promise<void> {
    return this.loadGroups(ITEM_GROUPS, onProgress);
  }

  /** A loaded file's bytes, by its manifest path. */
  file(path: string): ArrayBuffer | undefined {
    return this.files.get(path);
  }

  /** Whether every file of `groups` is loaded. */
  hasGroups(groups: readonly string[]): boolean {
    return this.entriesOf(groups).every((e) => this.files.has(e.path));
  }

  private entriesOf(groups: readonly string[]): ManifestEntry[] {
    const wanted = new Set(groups);
    return (this.manifest?.files ?? []).filter((e) => wanted.has(e.group));
  }

  /** Fetches every not-yet-loaded file of `groups` (plus the font when asked). */
  private loadGroups(
    groups: readonly string[],
    onProgress: OnProgress,
    fonts = false,
  ): Promise<void> {
    const wanted = new Set(groups);
    return this.loadEntries((e) => wanted.has(e.group), onProgress, fonts);
  }

  /** Fetches every not-yet-loaded file `select` picks (plus the font when asked), by bytes. */
  private async loadEntries(
    select: (entry: ManifestEntry) => boolean,
    onProgress: OnProgress,
    fonts = false,
  ): Promise<void> {
    onProgress(0);
    const manifest = await this.loadManifest();
    const todo = manifest.files.filter((e) => select(e) && !this.files.has(e.path));
    const withFonts = fonts && !this.fontsLoaded && this.loadFonts !== undefined;
    const total =
      todo.reduce((sum, e) => sum + e.bytes, 0) + (withFonts ? FONT_WEIGHT_BYTES : 0) || 1;
    let done = 0;
    // The first failure stops the other workers taking files; in-flight ones finish before this
    // throws, so a Retry never fetches a file twice or shares the bar with this run.
    let failure: unknown;
    const report = (bytes: number) => {
      done += bytes;
      if (failure === undefined) onProgress(Math.min(1, done / total));
    };
    const queue = [...todo];
    const worker = async () => {
      while (failure === undefined) {
        const entry = queue.shift();
        if (!entry) return;
        try {
          this.files.set(entry.path, await this.fetchFile(entry, report));
        } catch (e) {
          failure ??= e;
        }
      }
    };
    const work = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker);
    if (withFonts && this.loadFonts) {
      work.push(
        this.loadFonts().then(
          () => {
            this.fontsLoaded = true;
            report(FONT_WEIGHT_BYTES);
          },
          (e: unknown) => void (failure ??= e),
        ),
      );
    }
    await Promise.all(work);
    if (failure !== undefined) throw failure;
    onProgress(1);
  }

  /** One file's bytes, reporting each chunk as it arrives. */
  private async fetchFile(
    entry: ManifestEntry,
    report: (bytes: number) => void,
  ): Promise<ArrayBuffer> {
    let received = 0;
    try {
      const response = await this.fetch(this.base + entry.path);
      // The session ran out mid-load: log in again, then Retry.
      if (response.status === 401) throw new PackLockedError();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const chunks: Uint8Array[] = [];
      const reader = response.body?.getReader();
      if (reader) {
        for (let r = await reader.read(); !r.done; r = await reader.read()) {
          chunks.push(r.value);
          received += r.value.byteLength;
          report(r.value.byteLength);
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        chunks.push(bytes);
        received = bytes.byteLength;
        report(received);
      }
      if (received !== entry.bytes) throw new Error(`${received} bytes, expected ${entry.bytes}`);
      const out = new Uint8Array(received);
      let at = 0;
      for (const chunk of chunks) {
        out.set(chunk, at);
        at += chunk.byteLength;
      }
      return out.buffer;
    } catch (e) {
      // Take back this file's share, so a Retry's bar doesn't run past the end.
      report(-received);
      if (e instanceof PackLockedError) throw e;
      throw new PackLoadError(entry.path, e instanceof Error ? e.message : String(e));
    }
  }
}

function isManifest(json: unknown): json is Manifest {
  if (typeof json !== 'object' || json === null) return false;
  const m = json as Partial<Manifest>;
  return (
    m.version === 1 &&
    Array.isArray(m.files) &&
    m.files.every(
      (e) =>
        typeof e.path === 'string' && typeof e.bytes === 'number' && typeof e.group === 'string',
    )
  );
}
