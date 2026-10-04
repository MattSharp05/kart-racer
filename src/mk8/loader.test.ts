import { describe, expect, it } from 'vitest';
import type { Manifest } from '../../tools/mk8/manifest.ts';
import {
  mk8Login,
  Mk8Loader,
  PackLoadError,
  PackLockedError,
  PackNotInstalledError,
} from './loader';

const MANIFEST: Manifest = {
  version: 1,
  files: [
    { path: 'ui/c_mario.webp', bytes: 300, sha256: 'a', group: 'ui' },
    { path: 'ui/i_banana.webp', bytes: 100, sha256: 'b', group: 'ui' },
    { path: 'audio/ui/cursor.m4a', bytes: 600, sha256: 'c', group: 'audio/ui' },
    { path: 'models/courses/stadium/course.glb', bytes: 50, sha256: 'd', group: 'course/stadium' },
    {
      path: 'audio/course/stadium/crowd.m4a',
      bytes: 20,
      sha256: 'e',
      group: 'audio/course/stadium',
    },
    { path: 'models/racers/mario.glb', bytes: 40, sha256: 'f', group: 'racer/mario' },
    { path: 'models/racers/luigi.glb', bytes: 40, sha256: 'g', group: 'racer/luigi' },
    { path: 'audio/voices.json', bytes: 10, sha256: 'h', group: 'audio/voice' },
    { path: 'audio/voice/mario/a.m4a', bytes: 10, sha256: 'i', group: 'audio/voice/mario' },
    { path: 'audio/voice/luigi/a.m4a', bytes: 10, sha256: 'j', group: 'audio/voice/luigi' },
  ],
};

/** A fake server: the manifest and each file's bytes, plus a log of what was asked for. */
function server(options: { manifest?: unknown; status?: Record<string, number> } = {}) {
  const requested: string[] = [];
  const status = new Map(Object.entries(options.status ?? {}));
  const manifest = 'manifest' in options ? options.manifest : MANIFEST;
  const fetch = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    requested.push(url);
    const path = url.replace('/mk8/', '');
    const code = status.get(path);
    if (code !== undefined) {
      // Fails once, like a flaky network.
      status.delete(path);
      return new Response('', { status: code });
    }
    if (path === 'manifest.json') {
      if (manifest === undefined) return new Response('Not found', { status: 404 });
      return new Response(typeof manifest === 'string' ? manifest : JSON.stringify(manifest));
    }
    const entry = MANIFEST.files.find((e) => e.path === path);
    if (!entry) return new Response('', { status: 404 });
    return new Response(new Uint8Array(entry.bytes).fill(7));
  };
  return { fetch, requested };
}

describe('MK8 pack loader (MK-97)', () => {
  it('loads the UI groups and the font, with progress rising to 1', async () => {
    const { fetch, requested } = server();
    let fonts = 0;
    const loader = new Mk8Loader({ fetch, loadFonts: async () => void fonts++ });
    const progress: number[] = [];
    await loader.loadUi((f) => progress.push(f));
    expect(requested.sort()).toEqual([
      '/mk8/audio/ui/cursor.m4a',
      '/mk8/manifest.json',
      '/mk8/ui/c_mario.webp',
      '/mk8/ui/i_banana.webp',
    ]);
    expect(fonts).toBe(1);
    expect(loader.file('ui/c_mario.webp')?.byteLength).toBe(300);
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
    expect(progress.some((f) => f > 0 && f < 1)).toBe(true);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]).toBeGreaterThanOrEqual(progress[i - 1]!);
    }
  });

  it('loads a course and racers on demand, and nothing twice', async () => {
    const { fetch, requested } = server();
    const loader = new Mk8Loader({ fetch });
    await loader.loadCourse('stadium');
    await loader.loadRacers(['mario', 'luigi']);
    await loader.loadRacers(['mario']);
    expect(requested.sort()).toEqual([
      '/mk8/audio/course/stadium/crowd.m4a',
      '/mk8/audio/voice/luigi/a.m4a',
      '/mk8/audio/voice/mario/a.m4a',
      '/mk8/audio/voices.json',
      '/mk8/manifest.json',
      '/mk8/models/courses/stadium/course.glb',
      '/mk8/models/racers/luigi.glb',
      '/mk8/models/racers/mario.glb',
    ]);
    expect(loader.hasGroups(['course/stadium', 'racer/mario'])).toBe(true);
    expect(loader.hasGroups(['ui'])).toBe(false);
  });

  it("loads racers' voice lines alone (MK-110): the index and their clips", async () => {
    const { fetch, requested } = server();
    const loader = new Mk8Loader({ fetch });
    await loader.loadVoices(['mario']);
    expect(requested.sort()).toEqual([
      '/mk8/audio/voice/mario/a.m4a',
      '/mk8/audio/voices.json',
      '/mk8/manifest.json',
    ]);
  });

  it('loads single files by path (MK-101), and refuses a path the pack has not got', async () => {
    const { fetch, requested } = server();
    const loader = new Mk8Loader({ fetch });
    const progress: number[] = [];
    await loader.loadFiles(['models/racers/luigi.glb'], (f) => progress.push(f));
    await loader.loadFiles(['models/racers/luigi.glb']);
    expect(requested).toEqual(['/mk8/manifest.json', '/mk8/models/racers/luigi.glb']);
    expect(loader.file('models/racers/luigi.glb')?.byteLength).toBe(40);
    expect(loader.file('models/racers/mario.glb')).toBeUndefined();
    expect(progress.at(-1)).toBe(1);
    await expect(loader.loadFiles(['models/npcs/lakitu.glb'])).rejects.toThrow(
      new PackLoadError('models/npcs/lakitu.glb', 'not in the pack'),
    );
  });

  it('a missing manifest means the pack is not installed', async () => {
    const loader = new Mk8Loader({ fetch: server({ manifest: undefined }).fetch });
    await expect(loader.loadUi()).rejects.toBeInstanceOf(PackNotInstalledError);
  });

  it('so does a page instead of a manifest (an SPA fallback) or a manifest of another shape', async () => {
    for (const manifest of ['<!doctype html><title>Kart Racer</title>', { files: [] }]) {
      const loader = new Mk8Loader({ fetch: server({ manifest }).fetch });
      await expect(loader.loadManifest()).rejects.toBeInstanceOf(PackNotInstalledError);
    }
  });

  it('a file that fails is a load error, and a retry fetches only what is missing', async () => {
    const { fetch, requested } = server({ status: { 'ui/i_banana.webp': 503 } });
    const loader = new Mk8Loader({ fetch });
    const error = await loader.loadUi().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PackLoadError);
    expect((error as PackLoadError).path).toBe('ui/i_banana.webp');
    requested.length = 0;
    const progress: number[] = [];
    await loader.loadUi((f) => progress.push(f));
    expect(requested).toEqual(['/mk8/ui/i_banana.webp']);
    expect(progress.at(-1)).toBe(1);
  });

  it('a server error on the manifest is a load error (retryable), not "not installed"', async () => {
    const { fetch } = server({ status: { 'manifest.json': 500 } });
    const loader = new Mk8Loader({ fetch });
    await expect(loader.loadManifest()).rejects.toBeInstanceOf(PackLoadError);
    await expect(loader.loadManifest()).resolves.toEqual(MANIFEST);
  });

  it('a file of the wrong size fails', async () => {
    const manifest: Manifest = {
      version: 1,
      files: [{ path: 'ui/c_mario.webp', bytes: 999, sha256: 'a', group: 'ui' }],
    };
    const loader = new Mk8Loader({ fetch: server({ manifest }).fetch });
    await expect(loader.loadUi()).rejects.toThrow('300 bytes, expected 999');
  });

  it('a failure stops the other files: they wait for the Retry, and none is fetched twice', async () => {
    const files = Array.from({ length: 10 }, (_, i) => ({
      path: `ui/${i}.webp`,
      bytes: 10,
      sha256: String(i),
      group: 'ui',
    }));
    const requested: string[] = [];
    let failed = false;
    const fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const path = String(input).replace('/mk8/', '');
      requested.push(path);
      if (path === 'manifest.json') return new Response(JSON.stringify({ version: 1, files }));
      if (path === 'ui/0.webp' && !failed) {
        failed = true;
        throw new TypeError('Failed to fetch');
      }
      return new Response(new Uint8Array(10));
    };
    const loader = new Mk8Loader({ fetch });
    await expect(loader.loadUi()).rejects.toBeInstanceOf(PackLoadError);
    // The 4 started at once (0–3) ran; 4–9 were never asked for.
    expect(requested).toEqual([
      'manifest.json',
      'ui/0.webp',
      'ui/1.webp',
      'ui/2.webp',
      'ui/3.webp',
    ]);
    requested.length = 0;
    await loader.loadUi();
    expect(requested.sort()).toEqual([
      'ui/0.webp',
      'ui/4.webp',
      'ui/5.webp',
      'ui/6.webp',
      'ui/7.webp',
      'ui/8.webp',
      'ui/9.webp',
    ]);
  });

  it('a 401 on the manifest means the pack is locked (MK-135)', async () => {
    const loader = new Mk8Loader({ fetch: server({ status: { 'manifest.json': 401 } }).fetch });
    await expect(loader.loadUi()).rejects.toBeInstanceOf(PackLockedError);
    // After logging in, the same loader loads.
    await loader.loadUi();
    expect(loader.hasGroups(['ui'])).toBe(true);
  });

  it('a 401 on a file mid-load is locked too, not a load error (MK-135)', async () => {
    const { fetch } = server({ status: { 'ui/i_banana.webp': 401 } });
    const loader = new Mk8Loader({ fetch });
    await expect(loader.loadUi()).rejects.toBeInstanceOf(PackLockedError);
  });
});

describe('mk8Login (MK-135)', () => {
  it('posts the password as JSON and maps the answers', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const answer = (status: number) => async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), init]);
      return new Response(null, { status });
    };
    expect(await mk8Login('pw', answer(204))).toBe('ok');
    expect(await mk8Login('pw', answer(401))).toBe('wrong');
    expect(await mk8Login('pw', answer(429))).toBe('limited');
    expect(await mk8Login('pw', answer(503))).toBe('unavailable');
    const [url, init] = calls[0]!;
    expect(url).toBe('/api/mk8-login');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ password: 'pw' });
  });
});
