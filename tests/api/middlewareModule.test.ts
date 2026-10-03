import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { afterAll, describe, expect, it } from 'vitest';

// MK-136: Vercel doesn't bundle `middleware.ts`; it transpiles each file on its own into an ES
// module and runs that. An extensionless relative import then fails to load and every `/mk8/`
// request answers 500 (MIDDLEWARE_INVOCATION_FAILED), as production did after MK-135. This does
// the same: transpile file by file, load with Node's ES module loader, call it.
const ROOT = new URL('../../', import.meta.url);
const FILES = ['middleware.ts', 'api/mk8-login.ts'];
const out = mkdtempSync(join(tmpdir(), 'mk8-middleware-'));

afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('the middleware as Vercel deploys it (MK-136)', () => {
  it('loads unbundled and gates /mk8/', async () => {
    writeFileSync(join(out, 'package.json'), '{ "type": "module" }');
    for (const file of FILES) {
      const source = readFileSync(new URL(file, ROOT), 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      const to = join(out, file.replace(/\.ts$/, '.js'));
      mkdirSync(dirname(to), { recursive: true });
      writeFileSync(to, outputText);
    }
    // A real Node process: Vitest's own loader would resolve an extensionless import.
    const probe = `
      process.env.MK8_PASSWORD = 'local-test';
      const { default: middleware } = await import(${JSON.stringify(pathToFileURL(join(out, 'middleware.js')).href)});
      const locked = await middleware(new Request('https://site.test/mk8/manifest.json'));
      const font = await middleware(new Request('https://site.test/mk8/fonts/fonts.css'));
      console.log(JSON.stringify([locked.status, font.headers.get('x-middleware-next')]));
    `;
    const result = execFileSync(process.execPath, ['--input-type=module', '-e', probe], {
      encoding: 'utf8',
    });
    expect(JSON.parse(result)).toEqual([401, '1']);
  });
});
