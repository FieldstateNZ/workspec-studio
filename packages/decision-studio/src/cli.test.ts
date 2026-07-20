import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from './cli.js';
import type { CliIO } from './cli.js';

const repoPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const HOSTING_DIR = repoPath('examples/hosting-platform');
const INVALID_FIXTURES_DIR = repoPath('packages/decision-schema/test/fixtures/invalid');

// Capturing IO double (factory-built per test).
function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

// The invalid-fixture battery from S1 (mirrors
// packages/decision-schema/src/invalid-fixtures.expected.ts): each fixture is
// copied into a fresh `.workspec/<kind-dir>/<slug>.yaml` under a bare slug
// filename (the old `<slug>.decision.yaml` / `<slug>.catalog.yaml` middle
// infix is not a valid slug — it would be silently skipped by discovery), so
// the ref reported in a diagnostic is `.workspec/<kind-dir>/<slug>.yaml`. The
// fixture CONTENT (and so its internal line numbers) is copied byte-for-byte.
const INVALID_FIXTURES: { file: string; kindDir: string; slug: string; line: number }[] = [
  { file: 'bad-status.decision.yaml', kindDir: 'decisions', slug: 'bad-status', line: 8 },
  { file: 'missing-context.decision.yaml', kindDir: 'decisions', slug: 'missing-context', line: 7 },
  {
    file: 'unknown-discriminator.decision.yaml',
    kindDir: 'decisions',
    slug: 'unknown-discriminator',
    line: 24,
  },
  { file: 'negative-weight.decision.yaml', kindDir: 'decisions', slug: 'negative-weight', line: 16 },
  {
    file: 'wrong-type-amount.decision.yaml',
    kindDir: 'decisions',
    slug: 'wrong-type-amount',
    line: 25,
  },
  { file: 'dangling-env-key.decision.yaml', kindDir: 'decisions', slug: 'dangling-env-key', line: 25 },
  {
    file: 'score-out-of-range.decision.yaml',
    kindDir: 'decisions',
    slug: 'score-out-of-range',
    line: 27,
  },
  { file: 'bad-schedule-pct.catalog.yaml', kindDir: 'catalogs', slug: 'bad-schedule-pct', line: 17 },
];

/** Copies the invalid-fixture battery into `root/.workspec/<kindDir>/<slug>.yaml`. */
async function seedInvalidFixtures(root: string): Promise<void> {
  for (const { file, kindDir, slug } of INVALID_FIXTURES) {
    const text = await readFile(join(INVALID_FIXTURES_DIR, file), 'utf8');
    const dest = join(root, '.workspec', kindDir, `${slug}.yaml`);
    await mkdir(join(root, '.workspec', kindDir), { recursive: true });
    await writeFile(dest, text, 'utf8');
  }
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ds-cli-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('validate', () => {
  it('exits zero and reports OK on the valid hosting-platform example', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--dir', HOSTING_DIR], cap.io);
    expect(code).toBe(0);
    expect(cap.err()).toMatch(/validate: 2 artifact\(s\) OK/);
    expect(cap.err()).not.toContain('error:');
    expect(cap.err()).not.toContain('warning:');
  });

  it('catches every invalid S1 fixture with the correct file:line and exits non-zero', async () => {
    await seedInvalidFixtures(dir);
    const cap = captureIO();
    const code = await run(['validate', '--dir', dir], cap.io);
    expect(code).not.toBe(0);
    const output = cap.err();
    for (const { kindDir, slug, line } of INVALID_FIXTURES) {
      const ref = `.workspec/${kindDir}/${slug}.yaml`;
      expect(output, `expected ${ref}:${line} in output`).toContain(`${ref}:${line}:`);
    }
    // Every reported fixture line is an error.
    expect(output).toContain('error:');
  });

  it('flags a dangling authored SKU-line reference as a fatal error', async () => {
    await mkdir(join(dir, '.workspec', 'catalogs'), { recursive: true });
    await mkdir(join(dir, '.workspec', 'decisions'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'catalogs', 'x.yaml'),
      await readFile(join(HOSTING_DIR, '.workspec', 'catalogs', 'platform.yaml')),
    );
    // A decision referencing a sku that does not exist in the catalog.
    await writeFile(
      join(dir, '.workspec', 'decisions', 'x.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Decision',
        'metadata: {}',
        'spec:',
        '  title: "D"',
        '  status: exploring',
        '  context: "c"',
        '  catalog: x',
        '  currency: NZD',
        '  environments: [prod]',
        '  criteria: [{ id: cost, label: "Cost", weight: 1 }]',
        '  options:',
        '    - id: a',
        '      name: "A"',
        '      environments: [prod]',
        '      lines:',
        '        - id: l1',
        '          label: "L1"',
        '          flat: false',
        '          sku: does_not_exist',
        '          mode: payg',
        '          schedule: always',
        '          qty: { prod: 1 }',
        '      scores: { cost: { score: 3 } }',
        '',
      ].join('\n'),
    );
    const cap = captureIO();
    const code = await run(['validate', '--dir', dir], cap.io);
    expect(code).toBe(1);
    expect(cap.err()).toMatch(
      /\.workspec\/decisions\/x\.yaml:\d+:\d+: error: unknown sku "does_not_exist"/,
    );
  });

  it('surfaces a dangling lever reference as a NON-fatal warning', async () => {
    await mkdir(join(dir, '.workspec', 'catalogs'), { recursive: true });
    await mkdir(join(dir, '.workspec', 'decisions'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'catalogs', 'x.yaml'),
      await readFile(join(HOSTING_DIR, '.workspec', 'catalogs', 'platform.yaml')),
    );
    await writeFile(
      join(dir, '.workspec', 'decisions', 'x.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Decision',
        'metadata: {}',
        'spec:',
        '  title: "D"',
        '  status: exploring',
        '  context: "c"',
        '  catalog: x',
        '  currency: NZD',
        '  environments: [prod]',
        '  criteria: [{ id: cost, label: "Cost", weight: 1 }]',
        '  options:',
        '    - id: a',
        '      name: "A"',
        '      environments: [prod]',
        '      lines:',
        '        - id: l1',
        '          label: "L1"',
        '          flat: false',
        '          sku: d4s_v5',
        '          mode: payg',
        '          schedule: always',
        '          tag: steady',
        '          qty: { prod: 1 }',
        '      levers:',
        '        - id: reserve',
        '          label: "Reserve"',
        '          enabled: false',
        '          patch:',
        '            - match: { tags: [steady] }',
        '              set: { mode: no_such_mode }',
        '      scores: { cost: { score: 3 } }',
        '',
      ].join('\n'),
    );
    const cap = captureIO();
    const code = await run(['validate', '--dir', dir], cap.io);
    expect(code).toBe(0); // warnings do not fail the run
    expect(cap.err()).toMatch(/warning: lever "reserve" sets unknown pricing mode "no_such_mode"/);
    expect(cap.err()).toMatch(/2 artifact\(s\) OK, 1 warning\(s\)/);
  });

  it('--json prints the diagnostics array to stdout, text diagnostics still on stderr', async () => {
    const cap = captureIO();
    const code = await run(['validate', '--dir', HOSTING_DIR, '--json'], cap.io);
    expect(code).toBe(0);
    const parsed: unknown[] = JSON.parse(cap.out());
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(0);
    expect(cap.err()).toMatch(/validate: 2 artifact\(s\) OK/);
  });

  it('--json reports a structured parse-error diagnostic on the invalid fixtures', async () => {
    await seedInvalidFixtures(dir);
    const cap = captureIO();
    const code = await run(['validate', '--dir', dir, '--json'], cap.io);
    expect(code).not.toBe(0);
    const parsed = JSON.parse(cap.out()) as {
      severity: string;
      code: string;
      message: string;
      file: string;
      line?: number;
      col?: number;
    }[];
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed.every((d) => d.severity === 'error' && d.code === 'parse-error')).toBe(true);
  });
});

describe('render-adr', () => {
  it('renders a deterministic Markdown ADR to stdout with golden costs', async () => {
    const cap = captureIO();
    const code = await run(['render-adr', '--dir', HOSTING_DIR], cap.io);
    expect(code).toBe(0);
    const markdown = cap.out();
    expect(markdown).toContain('# Hosting platform for the data and delivery services');
    expect(markdown).toContain('**Status:** Proposed');
    expect(markdown).toContain('$54,336.58'); // aks annual (recommended)
    expect(markdown).toContain('$16,104'); // appsvc annual (cheapest)
    expect(markdown).toMatchSnapshot();
  });

  it('writes to --out when given', async () => {
    const cap = captureIO();
    const out = join(dir, 'hosting.adr.md');
    const code = await run(['render-adr', '--dir', HOSTING_DIR, '--out', out], cap.io);
    expect(code).toBe(0);
    const written = await readFile(out, 'utf8');
    expect(written).toContain('## Considered options');
    expect(cap.out()).toBe(''); // nothing to stdout when writing a file
  });

  it('errors when --decision does not match', async () => {
    const cap = captureIO();
    const code = await run(['render-adr', '--dir', HOSTING_DIR, '--decision', 'nope'], cap.io);
    expect(code).toBe(1);
    expect(cap.err()).toMatch(/no decision matching "nope"/);
  });
});

describe('dispatch', () => {
  it('prints help for the help command and exits zero', async () => {
    const cap = captureIO();
    const code = await run(['--help'], cap.io);
    expect(code).toBe(0);
    expect(cap.out()).toContain('workspec-decisions');
    expect(cap.out()).toContain('render-adr');
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
    expect(cap.out()).toContain('run the localhost Decision Studio host');
  });
});
