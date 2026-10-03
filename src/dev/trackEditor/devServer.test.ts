// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { testRampRoute } from '../../mk8/content/courses/test-ramp/route';
import { handleSave, isPlainData, type SaveRequest } from './devServer';
import { GENERATED_HEADER } from './serialize';

const dir = mkdtempSync(join(tmpdir(), 'track-editor-save-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const request = (payload: unknown, patch: Partial<SaveRequest> = {}): SaveRequest => ({
  method: 'POST',
  contentType: 'application/json',
  origin: 'http://localhost:5173',
  host: 'localhost:5173',
  remote: '127.0.0.1',
  body: JSON.stringify(payload),
  ...patch,
});

describe('track editor save endpoint', () => {
  it('writes a route.ts from the data, formatted', async () => {
    const res = await handleSave(
      request({ course: 'new-course', file: 'route', route: testRampRoute }),
      dir,
    );
    expect(res).toEqual({ status: 200, body: { file: join(dir, 'new-course', 'route.ts') } });
    const source = readFileSync(join(dir, 'new-course', 'route.ts'), 'utf8');
    expect(source.startsWith(GENERATED_HEADER)).toBe(true);
    expect(source).toContain('export const route: RouteDef = {');
    // Saving again overwrites its own file.
    const again = await handleSave(
      request({ course: 'new-course', file: 'route', route: testRampRoute }),
      dir,
    );
    expect(again.status).toBe(200);
  });

  it('writes materials.ts with known surfaces only', async () => {
    const ok = await handleSave(
      request({ course: 'c', file: 'materials', materials: { 'Road A': 'road', sky: 'ignore' } }),
      dir,
    );
    expect(ok.status).toBe(200);
    expect(readFileSync(join(dir, 'c', 'materials.ts'), 'utf8')).toContain("'Road A': 'road',");
    const bad = await handleSave(
      request({ course: 'c', file: 'materials', materials: { x: "road'); process.exit(1); ('" } }),
      dir,
    );
    expect(bad).toEqual({ status: 400, body: { error: 'Bad file or data' } });
  });

  it('refuses requests from elsewhere, other origins and non-JSON', async () => {
    const payload = { course: 'x', file: 'route', route: testRampRoute };
    const cases: [Partial<SaveRequest>, number][] = [
      [{ method: 'GET' }, 405],
      [{ remote: '192.168.1.20' }, 403],
      [{ remote: undefined }, 403],
      [{ contentType: 'text/plain' }, 415],
      [{ origin: 'https://evil.example' }, 403],
    ];
    for (const [patch, status] of cases)
      expect((await handleSave(request(payload, patch), dir)).status).toBe(status);
    expect(existsSync(join(dir, 'x'))).toBe(false);
    // No Origin header (curl, same-origin GET-less tools) is fine from this machine.
    expect((await handleSave(request(payload, { origin: undefined }), dir)).status).toBe(200);
  });

  it('refuses bad ids, files, data and source code', async () => {
    const bad = [
      { course: '../evil', file: 'route', route: testRampRoute },
      { course: 'x', file: 'index', route: testRampRoute },
      { course: 'x', file: 'route', route: { points: [] } },
      { course: 'x', file: 'route', route: { ...testRampRoute, extra: 1 } },
      { course: 'x', file: 'route', source: `${GENERATED_HEADER}\nprocess.exit(1);` },
    ];
    for (const payload of bad) expect((await handleSave(request(payload), dir)).status).toBe(400);
    expect((await handleSave(request({}, { body: '{nope' }), dir)).status).toBe(400);
  });

  it("never overwrites a file it didn't generate", async () => {
    mkdirSync(join(dir, 'hand'), { recursive: true });
    writeFileSync(join(dir, 'hand', 'route.ts'), '// written by hand\n');
    const res = await handleSave(
      request({ course: 'hand', file: 'route', route: testRampRoute }),
      dir,
    );
    expect(res.status).toBe(409);
    expect(readFileSync(join(dir, 'hand', 'route.ts'), 'utf8')).toBe('// written by hand\n');
  });
});

describe('isPlainData', () => {
  it('accepts JSON-like data and nothing else', () => {
    expect(isPlainData({ a: [1, 'b', true, { c: -0 }] })).toBe(true);
    expect(isPlainData({ a: NaN })).toBe(false);
    expect(isPlainData({ a: null })).toBe(false);
    expect(isPlainData(new Date())).toBe(false);
    expect(isPlainData(JSON.parse('{"__proto__": {"x": 1}}'))).toBe(true);
  });
});
