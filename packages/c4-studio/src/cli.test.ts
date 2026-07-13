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
    await writeFile(
      join(dir, '.workspec/actors/architect.yaml'),
      'title: Architect\ntags: [human]\n',
    );

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
      ['title: Broken', 'type: c4-context', 'nodes:', '  - slug: ghost', 'edges: []', ''].join(
        '\n',
      ),
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

describe('import-aspire', () => {
  const SAMPLE_GRAPH = repoPath('c4-studio/test/fixtures/aspire/sample-graph.json');

  it('prints help', async () => {
    const cap = captureIO();
    const code = await run(['import-aspire', '--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('import-aspire');
    expect(cap.out()).toContain('--graph');
  });

  it('exits 2 when --graph is missing', async () => {
    const cap = captureIO();
    const code = await run(['import-aspire', '--dir', dir], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toMatch(/--graph <file> is required/);
  });

  it('exits 2 on an invalid --mode', async () => {
    const cap = captureIO();
    const code = await run(
      ['import-aspire', '--graph', SAMPLE_GRAPH, '--dir', dir, '--mode', 'bogus'],
      cap.io,
    );
    expect(code).toBe(2);
    expect(cap.err()).toMatch(/invalid --mode "bogus"/);
  });

  it('exits 2 with a clear message when --graph does not resolve to a file', async () => {
    const cap = captureIO();
    const code = await run(
      ['import-aspire', '--graph', join(dir, 'nope.json'), '--dir', dir],
      cap.io,
    );
    expect(code).toBe(2);
    expect(cap.err()).toMatch(/cannot read --graph/);
  });

  it('exits 2 with a clear message on an unsupported graph version', async () => {
    const badGraph = join(dir, 'bad.json');
    await writeFile(badGraph, JSON.stringify({ version: 'workspec-graph/v9', apphost: { name: 'x' }, resources: [] }));
    const cap = captureIO();
    const code = await run(['import-aspire', '--graph', badGraph, '--dir', dir], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toMatch(/unsupported graph version/);
  });

  it('--mode scaffold (default) writes a tree that validate confirms is zero-diagnostic, and is idempotent', async () => {
    const first = captureIO();
    const firstCode = await run(['import-aspire', '--graph', SAMPLE_GRAPH, '--dir', dir], first.io);
    expect(firstCode).toBe(0);
    expect(first.err()).toMatch(/file\(s\) changed/);

    const validateCap = captureIO();
    const validateCode = await run(['validate', '--dir', dir], validateCap.io);
    expect(validateCode).toBe(0);
    expect(validateCap.err()).not.toMatch(/warning|error/);

    const second = captureIO();
    const secondCode = await run(['import-aspire', '--graph', SAMPLE_GRAPH, '--dir', dir], second.io);
    expect(secondCode).toBe(0);
    expect(second.err()).toMatch(/0 file\(s\) changed/);
  });

  it('--mode check reports clean (exit 0) against a tree it just scaffolded', async () => {
    await run(['import-aspire', '--graph', SAMPLE_GRAPH, '--dir', dir], captureIO().io);
    const cap = captureIO();
    const code = await run(['import-aspire', '--graph', SAMPLE_GRAPH, '--dir', dir, '--mode', 'check'], cap.io);
    expect(code).toBe(0);
    expect(cap.err()).toMatch(/clean/);
  });

  it('--mode check --json reports drift diagnostics as JSON on stdout, exit 1, text still on stderr', async () => {
    await run(['import-aspire', '--graph', SAMPLE_GRAPH, '--dir', dir], captureIO().io);

    const smallerGraph = join(dir, 'smaller.json');
    const graphText = await readFile(SAMPLE_GRAPH, 'utf8');
    const parsedGraph = JSON.parse(graphText) as { resources: { name: string }[] };
    await writeFile(
      smallerGraph,
      JSON.stringify({
        ...JSON.parse(graphText),
        resources: parsedGraph.resources.filter((r) => r.name !== 'worker'),
      }),
    );

    const cap = captureIO();
    const code = await run(
      ['import-aspire', '--graph', smallerGraph, '--dir', dir, '--mode', 'check', '--json'],
      cap.io,
    );
    expect(code).toBe(1);
    expect(cap.err()).toMatch(/drift finding/);
    const parsed = JSON.parse(cap.out()) as { severity: string; code: string }[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toContainEqual(expect.objectContaining({ code: 'element-orphaned' }));
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
