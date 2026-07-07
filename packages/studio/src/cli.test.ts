import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from './cli.js';
import type { CliIO } from './cli.js';

const repoPath = (rel: string): string =>
  fileURLToPath(new URL(`../../../${rel}`, import.meta.url));
const HOSTING_DIR = repoPath('examples/hosting-platform');
const INVALID_DIR = repoPath('packages/schema/test/fixtures/invalid');

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

// The invalid-fixture battery from S1 with each fixture's expected first-issue
// line (mirrors packages/schema/src/invalid-fixtures.expected.ts).
const INVALID_FIXTURES: { file: string; line: number }[] = [
  { file: 'bad-status.decision.yaml', line: 7 },
  { file: 'missing-context.decision.yaml', line: 9 },
  { file: 'unknown-discriminator.decision.yaml', line: 24 },
  { file: 'negative-weight.decision.yaml', line: 16 },
  { file: 'wrong-type-amount.decision.yaml', line: 25 },
  { file: 'dangling-env-key.decision.yaml', line: 25 },
  { file: 'score-out-of-range.decision.yaml', line: 27 },
  { file: 'bad-schedule-pct.catalog.yaml', line: 17 },
];

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
    const cap = captureIO();
    const code = await run(['validate', '--dir', INVALID_DIR], cap.io);
    expect(code).not.toBe(0);
    const output = cap.err();
    for (const { file, line } of INVALID_FIXTURES) {
      expect(output, `expected ${file}:${line} in output`).toContain(`${file}:${line}:`);
    }
    // Every reported fixture line is an error.
    expect(output).toContain('error:');
  });

  it('flags a dangling authored SKU-line reference as a fatal error', async () => {
    await writeFile(
      join(dir, 'x.catalog.yaml'),
      await readFile(join(HOSTING_DIR, 'platform.catalog.yaml')),
    );
    // A decision referencing a sku that does not exist in the catalog.
    await writeFile(
      join(dir, 'x.decision.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Decision',
        'metadata: { id: d, title: "D", status: exploring }',
        'spec:',
        '  context: "c"',
        '  catalog: ./x.catalog.yaml',
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
    expect(cap.err()).toMatch(/x\.decision\.yaml:\d+:\d+: error: unknown sku "does_not_exist"/);
  });

  it('surfaces a dangling lever reference as a NON-fatal warning', async () => {
    await writeFile(
      join(dir, 'x.catalog.yaml'),
      await readFile(join(HOSTING_DIR, 'platform.catalog.yaml')),
    );
    await writeFile(
      join(dir, 'x.decision.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Decision',
        'metadata: { id: d, title: "D", status: exploring }',
        'spec:',
        '  context: "c"',
        '  catalog: ./x.catalog.yaml',
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
