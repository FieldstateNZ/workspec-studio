import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from './cli.js';
import type { CliIO } from './cli.js';

const repoPath = (rel: string): string => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const REPRESENTATIVE_DIR = repoPath('c4-schema/test/fixtures/representative');

function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'c4-studio-cli-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('validate', () => {
  it('exits zero on the representative fixture (its one dangling-link is a warning, not an error)', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--dir', REPRESENTATIVE_DIR], cap.io);
    expect(code).toBe(0);
    expect(cap.err()).toMatch(/validate: \d+ artifact\(s\) OK, 1 warning\(s\)/);
    expect(cap.err()).not.toContain('[error]');
    expect(cap.err()).toMatch(/architect\.yaml: \[warning\] dangling-link/);
  });

  it('--strict fails the representative fixture on its one warning', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--dir', REPRESENTATIVE_DIR, '--strict'], cap.io);
    expect(code).toBe(1);
  });

  it('is clean (exit 0) on an empty/missing .workspec directory', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--dir', dir], cap.io);
    expect(code).toBe(0);
    expect(cap.err()).toMatch(/no \.workspec\/ tree found/);
  });

  it('reports a parse-error as file:line: [error] with exit 1', async () => {
    await mkdir(join(dir, '.workspec/actors'), { recursive: true });
    // Missing required `description` — a schema-validation (parse-error) failure.
    await writeFile(join(dir, '.workspec/actors/architect.yaml'), 'title: Architect\ntags: [human]\n');

    const cap = captureIO();
    const code = await run(['validate', '--dir', dir], cap.io);
    expect(code).toBe(1);
    expect(cap.err()).toMatch(/architect\.yaml:\d+: \[error\] parse-error/);
    expect(cap.err()).toMatch(/1 error\(s\)/);
  });

  it('reports a dangling diagram node reference as file:line: [error] dangling-ref', async () => {
    await mkdir(join(dir, '.workspec/diagrams'), { recursive: true });
    await writeFile(
      join(dir, '.workspec/diagrams/broken.yaml'),
      [
        'title: Broken',
        'type: c4-context',
        'nodes:',
        '  - slug: ghost',
        'edges: []',
        '',
      ].join('\n'),
    );

    const cap = captureIO();
    const code = await run(['validate', '--dir', dir], cap.io);
    expect(code).toBe(1);
    expect(cap.err()).toMatch(/broken\.yaml:\d+: \[error\] dangling-ref .*\(broken\)/);
  });

  it('--json also prints the diagnostics array to stdout', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--dir', REPRESENTATIVE_DIR, '--json'], cap.io);
    expect(code).toBe(0);
    const parsed: unknown[] = JSON.parse(cap.out());
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('--strict fails the run on warnings alone', async () => {
    await mkdir(join(dir, '.workspec/diagrams'), { recursive: true });
    await mkdir(join(dir, '.workspec/actors'), { recursive: true });
    await writeFile(join(dir, '.workspec/actors/a.yaml'), 'title: A\ndescription: Actor A.\n');
    await writeFile(join(dir, '.workspec/actors/b.yaml'), 'title: B\ndescription: Actor B.\n');
    // An edge category absent from both the built-in defaults and spec.yaml
    // is `unknown-category` — a WARNING, not an error.
    await writeFile(
      join(dir, '.workspec/diagrams/ctx.yaml'),
      [
        'title: Context',
        'type: c4-context',
        'nodes:',
        '  - slug: a',
        '  - slug: b',
        'edges:',
        '  - from: a',
        '    to: b',
        '    category: totally-made-up',
        '',
      ].join('\n'),
    );

    const plain = captureIO();
    expect(await run(['validate', '--dir', dir], plain.io)).toBe(0);
    expect(plain.err()).toMatch(/1 warning\(s\)/);

    const strict = captureIO();
    expect(await run(['validate', '--dir', dir, '--strict'], strict.io)).toBe(1);
  });
});

describe('render', () => {
  it('renders a diagram to --out and reports the written path', async () => {
    const outPath = join(dir, 'ctx.svg');
    const cap = captureIO();
    const code = await run(
      ['render', 'system-context', '--dir', REPRESENTATIVE_DIR, '--out', outPath],
      cap.io,
    );
    expect(code).toBe(0);
    expect(cap.err()).toContain(outPath);
    const svg = await readFile(outPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg).toContain('Architect');
  });

  it('renders to stdout with --out -', async () => {
    const cap = captureIO();
    const code = await run(
      ['render', 'system-context', '--dir', REPRESENTATIVE_DIR, '--out', '-'],
      cap.io,
    );
    expect(code).toBe(0);
    expect(cap.out()).toContain('<svg');
    expect(cap.err()).toBe('');
  });

  it('exits 1 and lists available slugs for an unknown diagram', async () => {
    const cap = captureIO();
    const code = await run(['render', 'nope', '--dir', REPRESENTATIVE_DIR], cap.io);
    expect(code).toBe(1);
    expect(cap.err()).toMatch(/no diagram "nope" found/);
    expect(cap.err()).toContain('system-context');
  });

  it('exits 2 when the diagram slug is missing', async () => {
    const cap = captureIO();
    const code = await run(['render', '--dir', REPRESENTATIVE_DIR], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toMatch(/missing required <diagram-slug>/);
  });

  it('rejects an invalid --theme', async () => {
    const cap = captureIO();
    const code = await run(
      ['render', 'system-context', '--dir', REPRESENTATIVE_DIR, '--theme', 'neon'],
      cap.io,
    );
    expect(code).toBe(2);
    expect(cap.err()).toMatch(/invalid --theme "neon"/);
  });
});

describe('dispatch', () => {
  it('prints help for the help command and exits zero', async () => {
    const cap = captureIO();
    const code = await run(['--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('workspec-c4');
    expect(cap.out()).toContain('render');
    expect(cap.out()).toContain('serve');
  });

  it('documents serve as the default command in help', async () => {
    const cap = captureIO();
    await run(['help'], cap.io);
    expect(cap.out()).toMatch(/serve.*DEFAULT/);
  });

  it('exits non-zero on an unknown command', async () => {
    const cap = captureIO();
    const code = await run(['frobnicate'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown command');
  });

  it('serve --help prints serve usage without binding a socket', async () => {
    const cap = captureIO();
    const code = await run(['serve', '--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('run the localhost C4 Studio host');
  });
});
