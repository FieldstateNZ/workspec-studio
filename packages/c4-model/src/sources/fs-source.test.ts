import type * as FsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFsSource } from './fs-source.js';
import { RefEscapesRootError } from './path-containment.js';

// `stat` is mocked (transparently — the factory below wraps the real
// implementation) so the "never touches the filesystem for an escaping
// path" test can assert on call count. `vi.spyOn` on a bare `node:fs/
// promises` import doesn't work here: the module's ESM namespace object is
// non-configurable, so Vitest rejects `vi.spyOn(fsPromises, 'stat')` with
// "Module namespace is not configurable in ESM" — `vi.mock` is the
// documented way to intercept a Node builtin's named export instead.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return { ...actual, stat: vi.fn(actual.stat) };
});

let outer: string;
let dir: string;

beforeEach(async () => {
  // Nested one level deeper than the mkdtemp call itself: `dir`'s PARENT
  // (`outer`) is then a directory this test fully owns and controls, so
  // "prove nothing landed outside root" can `readdir(outer)` and get a
  // deterministic listing — reading the parent of a bare `mkdtemp(tmpdir())`
  // result directly would instead list the OS-shared temp root (thousands
  // of unrelated entries from every other process on the machine).
  outer = await mkdtemp(join(tmpdir(), 'c4-model-fssource-'));
  dir = join(outer, 'root');
  await mkdir(dir, { recursive: true });
  vi.mocked(stat).mockClear();
});
afterEach(async () => {
  await rm(outer, { recursive: true, force: true });
});

describe('createFsSource — happy path (no regression)', () => {
  it('lists only the immediate, non-recursive entries of a directory', async () => {
    await mkdir(join(dir, '.workspec', 'diagrams', '.layout'), { recursive: true });
    await writeFile(join(dir, '.workspec', 'diagrams', 'container.yaml'), 'a');
    await writeFile(join(dir, '.workspec', 'diagrams', 'system-context.yaml'), 'b');
    await writeFile(join(dir, '.workspec', 'diagrams', '.layout', 'container.yaml'), 'c');

    const source = createFsSource(dir);
    const entries = await source.listFiles('.workspec/diagrams');
    expect([...entries].sort()).toEqual([
      '.workspec/diagrams/container.yaml',
      '.workspec/diagrams/system-context.yaml',
    ]);
  });

  it('resolves an empty list for a missing directory (ENOENT, not a throw)', async () => {
    const source = createFsSource(dir);
    expect(await source.listFiles('.workspec/actors')).toEqual([]);
  });

  it('reads written file content', async () => {
    await mkdir(join(dir, '.workspec'), { recursive: true });
    await writeFile(join(dir, '.workspec', 'spec.yaml'), 'type: style\n');
    const source = createFsSource(dir);
    expect(await source.readFile('.workspec/spec.yaml')).toBe('type: style\n');
  });

  it('writeFile creates missing parent directories', async () => {
    const source = createFsSource(dir);
    await source.writeFile('.workspec/diagrams/.layout/container.yaml', 'pinned: []\n');
    expect(
      await readFile(join(dir, '.workspec', 'diagrams', '.layout', 'container.yaml'), 'utf8'),
    ).toBe('pinned: []\n');
  });

  it('exists() reflects writes made after construction, and false for absent files (ENOENT)', async () => {
    const source = createFsSource(dir);
    expect(await source.exists('.workspec/spec.yaml')).toBe(false);
    await source.writeFile('.workspec/spec.yaml', 'type: style\n');
    expect(await source.exists('.workspec/spec.yaml')).toBe(true);
  });
});

describe('createFsSource — ref containment (CodeQL js/path-injection hardening)', () => {
  // listFiles/readFile/writeFile are ACTIONS: an escaping ref throws
  // RefEscapesRootError. exists() is a PREDICATE and is covered separately
  // below — it reports `false` instead (B1: an escaping `~/` link target in
  // authored content must degrade to a dangling-link warning, not abort the
  // whole model load — see fs-source.ts's own doc comment on `exists`).

  it('listFiles throws RefEscapesRootError for a `..`-escaping dirPath, not [] (not confused with ENOENT)', async () => {
    const source = createFsSource(dir);
    await expect(source.listFiles('../escape')).rejects.toBeInstanceOf(RefEscapesRootError);
  });

  it('readFile throws RefEscapesRootError for a `..`-escaping path', async () => {
    const source = createFsSource(dir);
    await expect(source.readFile('../../etc/passwd')).rejects.toBeInstanceOf(RefEscapesRootError);
  });

  it('writeFile throws RefEscapesRootError for a `..`-escaping path, and writes nothing outside the temp root', async () => {
    const source = createFsSource(dir);
    await expect(source.writeFile('../escape.yaml', 'evil')).rejects.toBeInstanceOf(
      RefEscapesRootError,
    );
    // Prove the "without writing anything" claim, not just assert the throw:
    // `outer` (the served root's parent, where `../escape.yaml` would have
    // landed) must contain only the `root` directory this suite created.
    const outerEntries = await readdir(outer);
    expect(outerEntries).toEqual(['root']);
  });

  it('rejects a POSIX absolute path on every ACTION method', async () => {
    const source = createFsSource(dir);
    await expect(source.listFiles('/etc')).rejects.toBeInstanceOf(RefEscapesRootError);
    await expect(source.readFile('/etc/passwd')).rejects.toBeInstanceOf(RefEscapesRootError);
    await expect(source.writeFile('/etc/passwd', 'evil')).rejects.toBeInstanceOf(
      RefEscapesRootError,
    );
  });

  it('still resolves and accepts a normal in-root relative ref (no regression)', async () => {
    const source = createFsSource(dir);
    await source.writeFile('.workspec/diagrams/system-context.yaml', 'kind: Diagram\n');
    expect(await source.readFile('.workspec/diagrams/system-context.yaml')).toBe('kind: Diagram\n');
  });
});

describe('createFsSource — exists() is a predicate: escaping paths report false, never throw (B1)', () => {
  // `checkDanglingLinks` calls `source.exists(target)` with CONTENT-derived
  // targets from authored `~/`-rooted `links` entries — the schema only
  // enforces the `~/` prefix, so `~/../escape.md` is schema-valid. Before
  // this fix, `exists` threw `RefEscapesRootError` for that target, which
  // propagated out of `checkDanglingLinks` and killed the whole model load
  // (`GET /api/model` 400s, `workspec-c4 validate` dies with no report,
  // `get_model` MCP errors) for what should be a single dangling-link
  // warning. See `test/edge-cases/dangling-link-fs-source.test.ts` for the
  // loader-level regression test of that exact scenario.

  it('exists() resolves false for a `..`-escaping path, not a throw', async () => {
    const source = createFsSource(dir);
    await expect(source.exists('../escape.yaml')).resolves.toBe(false);
  });

  it('exists(absolute path) resolves false, not a throw', async () => {
    const source = createFsSource(dir);
    await expect(source.exists('/etc/passwd')).resolves.toBe(false);
  });

  it('never calls stat for an escaping path — the no-filesystem-call guarantee, proven by spy (not just code shape)', async () => {
    const source = createFsSource(dir);

    expect(await source.exists('../escape.yaml')).toBe(false);
    expect(stat).not.toHaveBeenCalled();

    // Sanity check the mock itself is wired to the real call path: a
    // normal, in-root `exists` DOES call `stat`, so the assertion above is
    // actually exercising the escape branch, not a mock that's silently
    // inert (and, since `stat`'s implementation is the real one via
    // `vi.fn(actual.stat)`, this also proves the mocking didn't change
    // this suite's other, non-escaping-path behaviour).
    expect(await source.exists('.workspec/spec.yaml')).toBe(false);
    expect(stat).toHaveBeenCalledTimes(1);
  });

  it('exists() still reflects real files in-root (no regression from the predicate change)', async () => {
    const source = createFsSource(dir);
    await source.writeFile('.workspec/spec.yaml', 'type: style\n');
    expect(await source.exists('.workspec/spec.yaml')).toBe(true);
    expect(await source.exists('.workspec/missing.yaml')).toBe(false);
  });
});
