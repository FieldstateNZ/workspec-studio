import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DIAGNOSTIC_CODES } from '../../src/model/diagnostic-codes.js';
import { loadC4Model } from '../../src/load-c4-model.js';
import { createFsSource } from '../../src/sources/fs-source.js';

// B1 regression (adversarial review): `checkDanglingLinks` calls
// `source.exists(target)` with CONTENT-derived targets — `elementLinkTargets`
// only strips the `~/` prefix, it doesn't shape-restrict what follows, so
// `links: [{ adr: "~/../escape.md" }]` is schema-valid authored content.
// Against a REAL `FsSource` (not `MemorySource`, which never throws for any
// string), that target resolves outside the served root. Before the fix,
// `FsSource.exists` threw `RefEscapesRootError` for it, which propagated out
// of `checkDanglingLinks` and killed the whole model load — `GET /api/model`
// 400s, `workspec-c4 validate` dies with no report, `get_model` MCP errors —
// where the correct behaviour is the same `dangling-link` warning `.test.ts`
// coverage in `test/edge-cases/links.test.ts` already asserts for
// `MemorySource`. This test proves parity: the same authored content, same
// diagnostic, same non-throw, against the real filesystem-backed source.
describe('dangling-link — real FsSource, an escaping link target (B1)', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'c4-model-dangling-link-fs-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('an element linking outside the served root loads as a dangling-link warning, not a throw', async () => {
    await mkdir(join(dir, '.workspec', 'actors'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'actors', 'architect.yaml'),
      'title: Architect\ndescription: Designs things.\nlinks:\n  - adr: "~/../escape.md"\n',
    );

    const model = await loadC4Model(createFsSource(dir));

    expect(model.diagnostics).toMatchObject([
      {
        severity: 'warning',
        code: DIAGNOSTIC_CODES.danglingLink,
        file: '.workspec/actors/architect.yaml',
        slug: 'architect',
      },
    ]);
  });

  it('an element linking outside the root via a POSIX-absolute target also degrades to a warning', async () => {
    await mkdir(join(dir, '.workspec', 'actors'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'actors', 'architect.yaml'),
      'title: Architect\ndescription: Designs things.\nlinks:\n  - adr: "~//etc/passwd"\n',
    );

    const model = await loadC4Model(createFsSource(dir));

    expect(model.diagnostics).toMatchObject([{ code: DIAGNOSTIC_CODES.danglingLink }]);
  });

  it('still does not flag a ~/ link that resolves to a real in-root file (no regression)', async () => {
    await mkdir(join(dir, '.workspec', 'actors'), { recursive: true });
    await mkdir(join(dir, 'docs'), { recursive: true });
    await writeFile(join(dir, 'docs', 'README.md'), '# hello');
    await writeFile(
      join(dir, '.workspec', 'actors', 'architect.yaml'),
      'title: Architect\ndescription: Designs things.\nlinks:\n  - adr: "~/docs/README.md"\n',
    );

    const model = await loadC4Model(createFsSource(dir));

    expect(model.diagnostics).toEqual([]);
  });
});
