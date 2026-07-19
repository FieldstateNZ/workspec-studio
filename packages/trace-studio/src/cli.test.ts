import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import type { Actor, Feature, SystemRequirement, UserRequirement } from '@workspec/req-schema';
import { mockCucumberRun } from '@workspec/trace-emitters';
import type { SysReqInput } from '@workspec/trace-emitters';
import type { Located, TestRun } from '@workspec/trace-model';
import { run } from './cli.js';
import type { CliIO } from './cli.js';
import { createMemoryRepository } from './repository.js';
import type { LoadIssue } from './repository.js';

// ── capture double + fixed clock (no real process/wall-clock in tests) ────────

function captureIO(): { io: CliIO; out: () => string; err: () => string } {
  let out = '';
  let err = '';
  return {
    io: { out: (t) => (out += t), err: (t) => (err += t) },
    out: () => out,
    err: () => err,
  };
}

const FIXED_CLOCK = (): string => '2026-07-14T09:30:00.000Z';
const EXPECTED_RUN_ID = '2026-07-14T09-30-00Z';

// ── artifact factories ────────────────────────────────────────────────────────

const API_VERSION = 'workspec.io/v1alpha1';

function actor(slug: string): Actor {
  return { apiVersion: API_VERSION, kind: 'Actor', metadata: {}, spec: { name: slug } };
}

function feature(slug: string): Feature {
  return { apiVersion: API_VERSION, kind: 'Feature', metadata: {}, spec: { name: slug } };
}

function userReq(slug: string, opts: { actor: string; features: string[] }): UserRequirement {
  return {
    apiVersion: API_VERSION,
    kind: 'UserRequirement',
    metadata: {},
    spec: {
      title: `Promise ${slug}`,
      actor: opts.actor,
      as: 'a dev lead',
      want: 'to do a thing',
      so: 'that value is delivered',
      features: opts.features,
      status: 'agreed',
    },
  };
}

function sysReq(
  slug: string,
  opts: { feature: string; userReqs: string[]; examples?: Record<string, string>[] },
): SystemRequirement {
  return {
    apiVersion: API_VERSION,
    kind: 'SystemRequirement',
    metadata: {},
    spec: {
      title: `Scenario ${slug}`,
      feature: opts.feature,
      userReqs: opts.userReqs,
      when: ['the action happens'],
      then: ['the result is asserted'],
      ...(opts.examples !== undefined ? { examples: opts.examples } : {}),
    },
  };
}

function located<A>(slug: string, dir: string, artifact: A): Located<A> {
  return { slug, artifact, source: { file: `.workspec/${dir}/${slug}.yaml` } };
}

/** A small, fully-wired tree: 2 userReqs, 2 sysreqs, each userReq verified by one sysreq. */
function wiredTree() {
  return {
    actors: [located('dev-lead', 'actors', actor('dev-lead'))],
    features: [located('element-authoring', 'features', feature('element-authoring'))],
    userRequirements: [
      located(
        'authoring-flow',
        'requirements/user',
        userReq('authoring-flow', { actor: 'dev-lead', features: ['element-authoring'] }),
      ),
      located(
        'each-kind-flow',
        'requirements/user',
        userReq('each-kind-flow', { actor: 'dev-lead', features: ['element-authoring'] }),
      ),
    ],
    systemRequirements: [
      located(
        'inline-create-persists',
        'requirements/system',
        sysReq('inline-create-persists', {
          feature: 'element-authoring',
          userReqs: ['authoring-flow'],
        }),
      ),
      located(
        'inline-create-each-kind',
        'requirements/system',
        sysReq('inline-create-each-kind', {
          feature: 'element-authoring',
          userReqs: ['each-kind-flow'],
          examples: [{ kind: 'component' }, { kind: 'container' }],
        }),
      ),
    ],
  };
}

/** The SysReqInput[] mockCucumberRun consumes, matching wiredTree's two sysreqs. */
function wiredInputs(): SysReqInput[] {
  const tree = wiredTree();
  return tree.systemRequirements.map((s) => ({ slug: s.slug, sysreq: s.artifact }));
}

// ── dispatch / help ────────────────────────────────────────────────────────────

describe('run: dispatch + help', () => {
  it('prints help and exits 0 for no command, help, --help, -h', async () => {
    for (const argv of [[], ['help'], ['--help'], ['-h']]) {
      const cap = captureIO();
      const code = await run(argv, cap.io);
      expect(code).toBe(0);
      expect(cap.out()).toContain('workspec-trace');
      expect(cap.err()).toBe('');
    }
  });

  it('errors, prints help, and exits 2 on an unknown command', async () => {
    const cap = captureIO();
    const code = await run(['frobnicate'], cap.io);
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown command "frobnicate"');
    expect(cap.out()).toContain('workspec-trace');
  });
});

// ── emit ────────────────────────────────────────────────────────────────────────

describe('emit', () => {
  it('rejects an unknown emitter with exit 2', async () => {
    const repository = createMemoryRepository({ tree: wiredTree() });
    const cap = captureIO();
    const code = await run(['emit', '--emitter', 'nope'], cap.io, { repository });
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown emitter "nope"');
  });

  it('requires --emitter (exit 2)', async () => {
    const cap = captureIO();
    const code = await run(['emit'], cap.io, { repository: createMemoryRepository() });
    expect(code).toBe(2);
    expect(cap.err()).toContain('--emitter is required');
  });

  it('writes one .feature file per sysreq under the default out dir', async () => {
    const repository = createMemoryRepository({ tree: wiredTree() });
    const cap = captureIO();
    const code = await run(['emit', '--emitter', 'cucumber'], cap.io, { repository });
    expect(code).toBe(0);
    expect([...repository.writes.keys()].sort()).toEqual([
      'features/inline-create-each-kind.feature',
      'features/inline-create-persists.feature',
    ]);
    const feat = repository.writes.get('features/inline-create-persists.feature');
    expect(feat).toContain('@inline-create-persists');
    expect(cap.out()).toContain('wrote 2 file(s)');
  });

  it('filters by --feature and honours --out', async () => {
    const tree = wiredTree();
    tree.systemRequirements.push(
      located(
        'other-scenario',
        'requirements/system',
        sysReq('other-scenario', { feature: 'other-feature', userReqs: ['authoring-flow'] }),
      ),
    );
    const repository = createMemoryRepository({ tree });
    const cap = captureIO();
    const code = await run(
      ['emit', '--emitter', 'cucumber', '--feature', 'other-feature', '--out', 'tests'],
      cap.io,
      { repository },
    );
    expect(code).toBe(0);
    expect([...repository.writes.keys()]).toEqual(['tests/other-scenario.feature']);
  });
});

// ── ingest ────────────────────────────────────────────────────────────────────

describe('ingest', () => {
  it('reads a cucumber report and writes a run keyed on the clock-derived id', async () => {
    const report = mockCucumberRun(wiredInputs());
    const repository = createMemoryRepository({ files: { 'report.json': JSON.stringify(report) } });
    const cap = captureIO();
    const code = await run(
      ['ingest', 'report.json', '--emitter', 'cucumber', '--sha', 'abc123'],
      cap.io,
      {
        repository,
        clock: FIXED_CLOCK,
      },
    );
    expect(code).toBe(0);
    const ref = `.workspec/.runs/${EXPECTED_RUN_ID}.json`;
    const written = repository.writes.get(ref);
    expect(written).toBeDefined();
    const run_ = JSON.parse(written as string);
    expect(run_.id).toBe(EXPECTED_RUN_ID);
    expect(run_.sha).toBe('abc123');
    expect(run_.emitter).toBe('cucumber');
    expect(run_.results).toEqual({
      'inline-create-each-kind': 'pass',
      'inline-create-persists': 'pass',
    });
    expect(cap.out()).toContain('2 pass');
  });

  it('exits 1 when the results file cannot be read', async () => {
    const repository = createMemoryRepository();
    const cap = captureIO();
    const code = await run(['ingest', 'missing.json', '--emitter', 'cucumber'], cap.io, {
      repository,
      clock: FIXED_CLOCK,
    });
    expect(code).toBe(1);
    expect(cap.err()).toContain('cannot read results file');
  });

  it('exits 2 on a missing <results-file> positional', async () => {
    const cap = captureIO();
    const code = await run(['ingest', '--emitter', 'cucumber'], cap.io, {
      repository: createMemoryRepository(),
      clock: FIXED_CLOCK,
    });
    expect(code).toBe(2);
    expect(cap.err()).toContain('expected exactly one <results-file>');
  });

  it('exits 2 on an unknown emitter', async () => {
    const repository = createMemoryRepository({ files: { 'r.json': '[]' } });
    const cap = captureIO();
    const code = await run(['ingest', 'r.json', '--emitter', 'nope'], cap.io, {
      repository,
      clock: FIXED_CLOCK,
    });
    expect(code).toBe(2);
    expect(cap.err()).toContain('unknown emitter');
  });
});

// ── verify (in-memory: gate + exit codes) ──────────────────────────────────────

describe('verify: gate + exit codes', () => {
  it('PASSES (exit 0) on a fully-covered, all-passing tree', async () => {
    const repository = createMemoryRepository({
      tree: wiredTree(),
      runs: [
        {
          id: 'r1',
          ts: '2026-07-14T09:30:00.000Z',
          emitter: 'cucumber',
          results: { 'inline-create-persists': 'pass', 'inline-create-each-kind': 'pass' },
        },
      ],
    });
    const cap = captureIO();
    const code = await run(['verify'], cap.io, { repository });
    expect(code).toBe(0);
    expect(cap.out()).toContain('Coverage:  2 of 2 (100.0%)');
    expect(cap.out()).toContain('Pass rate: 2 of 2 (100.0%)');
    expect(cap.out()).toContain('verify: PASSED');
  });

  it('passes even with a strict --min-coverage 1.0 --min-pass-rate 1.0 when fully proven', async () => {
    const repository = createMemoryRepository({
      tree: wiredTree(),
      runs: [
        {
          id: 'r1',
          ts: '2026-07-14T09:30:00.000Z',
          emitter: 'cucumber',
          results: { 'inline-create-persists': 'pass', 'inline-create-each-kind': 'pass' },
        },
      ],
    });
    const cap = captureIO();
    const code = await run(['verify', '--min-coverage', '1.0', '--min-pass-rate', '1.0'], cap.io, {
      repository,
    });
    expect(code).toBe(0);
  });

  it('FAILS (exit 1) on a dangling intra-tree ref — regardless of thresholds', async () => {
    const tree = wiredTree();
    tree.systemRequirements.push(
      located(
        'ghost-ref',
        'requirements/system',
        sysReq('ghost-ref', { feature: 'element-authoring', userReqs: ['does-not-exist'] }),
      ),
    );
    const repository = createMemoryRepository({ tree });
    const cap = captureIO();
    const code = await run(['verify'], cap.io, { repository });
    expect(code).toBe(1);
    expect(cap.out()).toContain('dangling-ref');
    expect(cap.out()).toContain('verify: FAILED');
  });

  it('FAILS (exit 1) on a loader validation issue', async () => {
    const issues: LoadIssue[] = [
      { file: '.workspec/features/BAD NAME.yaml', kind: 'filename', message: 'bad slug' },
    ];
    const repository = createMemoryRepository({ tree: wiredTree(), treeIssues: issues });
    const cap = captureIO();
    const code = await run(['verify'], cap.io, { repository });
    expect(code).toBe(1);
    expect(cap.out()).toContain('load-filename');
    expect(cap.out()).toContain('verify: FAILED');
  });

  it('FAILS (exit 1) on an orphan userReq only once --min-coverage 1.0 is set', async () => {
    const tree = wiredTree();
    // An orphan userReq: no sysreq verifies it → coverage denominator grows.
    tree.userRequirements.push(
      located(
        'unverified-promise',
        'requirements/user',
        userReq('unverified-promise', { actor: 'dev-lead', features: ['element-authoring'] }),
      ),
    );
    const runs: TestRun[] = [
      {
        id: 'r1',
        ts: '2026-07-14T09:30:00.000Z',
        emitter: 'cucumber',
        results: { 'inline-create-persists': 'pass', 'inline-create-each-kind': 'pass' },
      },
    ];
    // Default thresholds (0): the orphan is a warning, not a gate.
    const pass = captureIO();
    expect(
      await run(['verify'], pass.io, { repository: createMemoryRepository({ tree, runs }) }),
    ).toBe(0);
    expect(pass.out()).toContain('orphan-user-requirement');

    // --min-coverage 1.0: 2 of 3 covered → below floor → gate fails.
    const fail = captureIO();
    const code = await run(['verify', '--min-coverage', '1.0'], fail.io, {
      repository: createMemoryRepository({ tree, runs }),
    });
    expect(code).toBe(1);
    expect(fail.out()).toContain('Coverage:  2 of 3');
    expect(fail.out()).toContain('verify: FAILED');
  });

  it('exits 2 on a malformed --min-coverage', async () => {
    const cap = captureIO();
    const code = await run(['verify', '--min-coverage', '2'], cap.io, {
      repository: createMemoryRepository({ tree: wiredTree() }),
    });
    expect(code).toBe(2);
    expect(cap.err()).toContain('--min-coverage must be a number in [0, 1]');
  });

  it('emits a machine-readable summary with --json', async () => {
    const repository = createMemoryRepository({
      tree: wiredTree(),
      runs: [
        {
          id: 'r1',
          ts: '2026-07-14T09:30:00.000Z',
          emitter: 'cucumber',
          results: { 'inline-create-persists': 'pass', 'inline-create-each-kind': 'fail' },
        },
      ],
    });
    const cap = captureIO();
    const code = await run(['verify', '--json', '--min-pass-rate', '1.0'], cap.io, { repository });
    expect(code).toBe(1);
    const summary = JSON.parse(cap.out());
    expect(summary.verdict).toBe('fail');
    expect(summary.coverage).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });
    expect(summary.passRate).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });
    expect(summary.thresholds).toEqual({ minCoverage: 0, minPassRate: 1 });
  });
});

// ── the full round-trip through the real FsRepository (tmp dir) ────────────────

describe('CLI round-trip (emit -> mock run -> ingest -> verify) over a real FS tree', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'trace-studio-roundtrip-'));
    const tree = wiredTree();
    const write = async (rel: string, artifact: unknown): Promise<void> => {
      await writeFile(join(dir, rel), stringify(artifact), 'utf8');
    };
    // Seed .workspec/ on disk. mkdtemp gives us the dirs via writeFile after mkdir.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, '.workspec', 'actors'), { recursive: true });
    await mkdir(join(dir, '.workspec', 'features'), { recursive: true });
    await mkdir(join(dir, '.workspec', 'requirements', 'user'), { recursive: true });
    await mkdir(join(dir, '.workspec', 'requirements', 'system'), { recursive: true });
    await write('.workspec/actors/dev-lead.yaml', tree.actors[0]?.artifact);
    await write('.workspec/features/element-authoring.yaml', tree.features[0]?.artifact);
    await write(
      '.workspec/requirements/user/authoring-flow.yaml',
      tree.userRequirements[0]?.artifact,
    );
    await write(
      '.workspec/requirements/user/each-kind-flow.yaml',
      tree.userRequirements[1]?.artifact,
    );
    await write(
      '.workspec/requirements/system/inline-create-persists.yaml',
      tree.systemRequirements[0]?.artifact,
    );
    await write(
      '.workspec/requirements/system/inline-create-each-kind.yaml',
      tree.systemRequirements[1]?.artifact,
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('emits, ingests a passing run, and verifies to exit 0 with both meters full', async () => {
    // emit
    const emitCap = captureIO();
    expect(await run(['emit', '--emitter', 'cucumber', '--dir', dir], emitCap.io)).toBe(0);
    const emitted = await readFile(join(dir, 'features', 'inline-create-persists.feature'), 'utf8');
    expect(emitted).toContain('@inline-create-persists');

    // mock run -> report file
    const report = mockCucumberRun(wiredInputs());
    await writeFile(join(dir, 'report.json'), JSON.stringify(report), 'utf8');

    // ingest (fixed clock -> deterministic run id/path)
    const ingestCap = captureIO();
    expect(
      await run(['ingest', 'report.json', '--emitter', 'cucumber', '--dir', dir], ingestCap.io, {
        clock: FIXED_CLOCK,
      }),
    ).toBe(0);
    const runJson = await readFile(
      join(dir, '.workspec', '.runs', `${EXPECTED_RUN_ID}.json`),
      'utf8',
    );
    expect(JSON.parse(runJson).results).toEqual({
      'inline-create-each-kind': 'pass',
      'inline-create-persists': 'pass',
    });

    // verify (default thresholds) — and with strict floors
    const verifyCap = captureIO();
    expect(await run(['verify', '--dir', dir], verifyCap.io)).toBe(0);
    expect(verifyCap.out()).toContain('Coverage:  2 of 2 (100.0%)');
    expect(verifyCap.out()).toContain('Pass rate: 2 of 2 (100.0%)');
    expect(verifyCap.out()).toContain('verify: PASSED');

    const strictCap = captureIO();
    expect(
      await run(
        ['verify', '--dir', dir, '--min-coverage', '1.0', '--min-pass-rate', '1.0'],
        strictCap.io,
      ),
    ).toBe(0);
  });

  it('gates a failing run: verify --min-pass-rate 1.0 exits 1', async () => {
    await run(['emit', '--emitter', 'cucumber', '--dir', dir], captureIO().io);
    const report = mockCucumberRun(wiredInputs(), { failing: ['inline-create-persists'] });
    await writeFile(join(dir, 'report.json'), JSON.stringify(report), 'utf8');
    await run(['ingest', 'report.json', '--emitter', 'cucumber', '--dir', dir], captureIO().io, {
      clock: FIXED_CLOCK,
    });

    const cap = captureIO();
    const code = await run(['verify', '--dir', dir, '--min-pass-rate', '1.0'], cap.io);
    expect(code).toBe(1);
    expect(cap.out()).toContain('Pass rate: 1 of 2 (50.0%)');
    expect(cap.out()).toContain('verify: FAILED');
  });
});
