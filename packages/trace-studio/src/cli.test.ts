import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  UserRequirement,
} from '@workspec/req-schema';
import { mockCucumberRun } from '@workspec/trace-emitters';
import type { RuleWithScenarios, ScenarioInput } from '@workspec/trace-emitters';
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

// ── artifact factories (5-kind Gherkin-Rule model) ─────────────────────────────

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

/** A `SystemRequirement` — a Gherkin Rule (spec §4.4): no steps of its own. */
function rule(slug: string, opts: { feature: string; userReqs: string[] }): SystemRequirement {
  return {
    apiVersion: API_VERSION,
    kind: 'SystemRequirement',
    metadata: {},
    spec: { title: `Rule ${slug}`, feature: opts.feature, userReqs: opts.userReqs },
  };
}

/** A `Scenario` — the executed unit (spec §4.5): carries the given/when/then steps. */
function scenario(
  slug: string,
  opts: {
    systemRequirement: string;
    then?: string[];
    given?: string[];
    when?: string[];
    examples?: Record<string, string>[];
  },
): Scenario {
  return {
    apiVersion: API_VERSION,
    kind: 'Scenario',
    metadata: {},
    spec: {
      title: `Scenario ${slug}`,
      systemRequirement: opts.systemRequirement,
      then: opts.then ?? ['the result is asserted'],
      ...(opts.given !== undefined ? { given: opts.given } : {}),
      ...(opts.when !== undefined ? { when: opts.when } : {}),
      ...(opts.examples !== undefined ? { examples: opts.examples } : {}),
    },
  };
}

function located<A>(slug: string, dir: string, artifact: A): Located<A> {
  return { slug, artifact, source: { file: `.workspec/${dir}/${slug}.yaml` } };
}

/**
 * A small, fully-wired tree: 2 userReqs, 2 Rules (system-requirements), each
 * Rule verifies one userReq and groups exactly one scenario.
 */
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
        'inline-create',
        'requirements/system',
        rule('inline-create', { feature: 'element-authoring', userReqs: ['authoring-flow'] }),
      ),
      located(
        'inline-create-variants',
        'requirements/system',
        rule('inline-create-variants', {
          feature: 'element-authoring',
          userReqs: ['each-kind-flow'],
        }),
      ),
    ],
    scenarios: [
      located(
        'inline-create-persists',
        'scenarios',
        scenario('inline-create-persists', { systemRequirement: 'inline-create' }),
      ),
      located(
        'inline-create-each-kind',
        'scenarios',
        scenario('inline-create-each-kind', {
          systemRequirement: 'inline-create-variants',
          examples: [{ kind: 'component' }, { kind: 'container' }],
        }),
      ),
    ],
  };
}

/** Group `wiredTree()`'s scenarios under their Rule — the `emit`/mock-runner input shape. */
function wiredInputs(): RuleWithScenarios[] {
  const tree = wiredTree();
  const scenariosByRule = new Map<string, ScenarioInput[]>();
  for (const located_ of tree.scenarios) {
    const input: ScenarioInput = { slug: located_.slug, artifact: located_.artifact };
    const ruleSlug = located_.artifact.spec.systemRequirement;
    const list = scenariosByRule.get(ruleSlug);
    if (list) list.push(input);
    else scenariosByRule.set(ruleSlug, [input]);
  }
  return tree.systemRequirements.map((s) => ({
    sysreq: { slug: s.slug, artifact: s.artifact },
    scenarios: scenariosByRule.get(s.slug) ?? [],
  }));
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

  it('exits 2 on an unknown flag', async () => {
    const cap = captureIO();
    const code = await run(['verify', '--bogus-flag'], cap.io, {
      repository: createMemoryRepository(),
    });
    expect(code).toBe(2);
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

  it('writes one .feature file per Rule, grouping its scenarios, under the default out dir', async () => {
    const repository = createMemoryRepository({ tree: wiredTree() });
    const cap = captureIO();
    const code = await run(['emit', '--emitter', 'cucumber'], cap.io, { repository });
    expect(code).toBe(0);
    expect([...repository.writes.keys()].sort()).toEqual([
      'features/inline-create-variants.feature',
      'features/inline-create.feature',
    ]);
    const feat = repository.writes.get('features/inline-create.feature');
    expect(feat).toContain('Rule: Rule inline-create');
    expect(feat).toContain('@inline-create-persists');
    expect(cap.out()).toContain('wrote 2 file(s)');
  });

  it('warns on a scenario whose parent Rule is missing, and still emits the well-formed Rules', async () => {
    const tree = wiredTree();
    tree.scenarios.push(
      located(
        'orphan-scenario',
        'scenarios',
        scenario('orphan-scenario', { systemRequirement: 'ghost-rule' }),
      ),
    );
    const repository = createMemoryRepository({ tree });
    const cap = captureIO();
    const code = await run(['emit', '--emitter', 'cucumber'], cap.io, { repository });
    expect(code).toBe(0);
    expect(cap.err()).toContain(
      'scenario "orphan-scenario" references unknown rule "ghost-rule" — skipped',
    );
    // the well-formed Rules still emit; the orphan produces no file
    expect([...repository.writes.keys()].sort()).toEqual([
      'features/inline-create-variants.feature',
      'features/inline-create.feature',
    ]);
  });

  it('filters Rules by --feature (only their scenarios are emitted) and honours --out', async () => {
    const tree = wiredTree();
    tree.systemRequirements.push(
      located(
        'other-rule',
        'requirements/system',
        rule('other-rule', { feature: 'other-feature', userReqs: ['authoring-flow'] }),
      ),
    );
    tree.scenarios.push(
      located(
        'other-scenario',
        'scenarios',
        scenario('other-scenario', { systemRequirement: 'other-rule' }),
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
    expect([...repository.writes.keys()]).toEqual(['tests/other-rule.feature']);
    expect(repository.writes.get('tests/other-rule.feature')).toContain('@other-scenario');
  });
});

// ── ingest ────────────────────────────────────────────────────────────────────

describe('ingest', () => {
  it('reads a cucumber report and writes a run keyed on scenario slugs (clock-derived id)', async () => {
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
  it('PASSES (exit 0) on a fully-covered, all-passing tree, showing all three meters', async () => {
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
    expect(cap.out()).toContain('Scenario coverage: 2 of 2 (100.0%)');
    expect(cap.out()).toContain('UserReq coverage: 2 of 2 (100.0%)');
    expect(cap.out()).toContain('Pass rate: 2 of 2 (100.0%)');
    expect(cap.out()).toContain('verify: PASSED');
  });

  it('passes even with all three thresholds at 1.0 when fully proven', async () => {
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
    const code = await run(
      [
        'verify',
        '--min-scenario-coverage',
        '1.0',
        '--min-userreq-coverage',
        '1.0',
        '--min-pass-rate',
        '1.0',
      ],
      cap.io,
      { repository },
    );
    expect(code).toBe(0);
  });

  it('FAILS (exit 1) on a dangling Rule -> userReq ref — regardless of thresholds', async () => {
    const tree = wiredTree();
    tree.systemRequirements.push(
      located(
        'ghost-ref',
        'requirements/system',
        rule('ghost-ref', { feature: 'element-authoring', userReqs: ['does-not-exist'] }),
      ),
    );
    const repository = createMemoryRepository({ tree });
    const cap = captureIO();
    const code = await run(['verify'], cap.io, { repository });
    expect(code).toBe(1);
    expect(cap.out()).toContain('dangling-ref');
    expect(cap.out()).toContain('verify: FAILED');
  });

  it('FAILS (exit 1) on a dangling scenario.systemRequirement ref', async () => {
    const tree = wiredTree();
    tree.scenarios.push(
      located(
        'orphan-scenario',
        'scenarios',
        scenario('orphan-scenario', { systemRequirement: 'no-such-rule' }),
      ),
    );
    const repository = createMemoryRepository({ tree });
    const cap = captureIO();
    const code = await run(['verify'], cap.io, { repository });
    expect(code).toBe(1);
    expect(cap.out()).toContain('dangling-ref');
    expect(cap.out()).toContain('systemRequirement');
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

  it('surfaces an empty-rule finding (warning) for a Rule with no scenarios', async () => {
    const tree = wiredTree();
    tree.systemRequirements.push(
      located(
        'unproven-rule',
        'requirements/system',
        rule('unproven-rule', { feature: 'element-authoring', userReqs: ['authoring-flow'] }),
      ),
    );
    const repository = createMemoryRepository({ tree });
    const cap = captureIO();
    const code = await run(['verify'], cap.io, { repository });
    // A warning-only finding never gates by itself (default thresholds are 0).
    expect(code).toBe(0);
    expect(cap.out()).toContain('empty-rule');
  });

  it('FAILS (exit 1) on an orphan userReq only once --min-userreq-coverage 1.0 is set', async () => {
    const tree = wiredTree();
    // An orphan userReq: no Rule verifies it → userReq coverage denominator grows.
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

    // --min-userreq-coverage 1.0: 2 of 3 covered → below floor → gate fails.
    const fail = captureIO();
    const code = await run(['verify', '--min-userreq-coverage', '1.0'], fail.io, {
      repository: createMemoryRepository({ tree, runs }),
    });
    expect(code).toBe(1);
    expect(fail.out()).toContain('UserReq coverage: 2 of 3');
    expect(fail.out()).toContain('verify: FAILED');
  });

  it('exits 2 on a malformed --min-scenario-coverage', async () => {
    const cap = captureIO();
    const code = await run(['verify', '--min-scenario-coverage', '2'], cap.io, {
      repository: createMemoryRepository({ tree: wiredTree() }),
    });
    expect(code).toBe(2);
    expect(cap.err()).toContain('--min-scenario-coverage must be a number in [0, 1]');
  });

  it('emits a machine-readable summary with --json (all three meters + thresholds)', async () => {
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
    // Both scenarios have evidence in the latest run → full scenario coverage.
    expect(summary.scenarioCoverage).toEqual({ numerator: 2, denominator: 2, ratio: 1 });
    // Only inline-create's scenario passes → its Rule is proven, the other isn't.
    expect(summary.userReqCoverage).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });
    expect(summary.passRate).toEqual({ numerator: 1, denominator: 2, ratio: 0.5 });
    expect(summary.thresholds).toEqual({
      minScenarioCoverage: 0,
      minUserReqCoverage: 0,
      minPassRate: 1,
    });
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
    await mkdir(join(dir, '.workspec', 'scenarios'), { recursive: true });
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
      '.workspec/requirements/system/inline-create.yaml',
      tree.systemRequirements[0]?.artifact,
    );
    await write(
      '.workspec/requirements/system/inline-create-variants.yaml',
      tree.systemRequirements[1]?.artifact,
    );
    await write('.workspec/scenarios/inline-create-persists.yaml', tree.scenarios[0]?.artifact);
    await write('.workspec/scenarios/inline-create-each-kind.yaml', tree.scenarios[1]?.artifact);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('emits, ingests a passing run, and verifies to exit 0 with all three meters full', async () => {
    // emit
    const emitCap = captureIO();
    expect(await run(['emit', '--emitter', 'cucumber', '--dir', dir], emitCap.io)).toBe(0);
    const emitted = await readFile(join(dir, 'features', 'inline-create.feature'), 'utf8');
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

    // verify (default thresholds) — and with all three strict floors
    const verifyCap = captureIO();
    expect(await run(['verify', '--dir', dir], verifyCap.io)).toBe(0);
    expect(verifyCap.out()).toContain('Scenario coverage: 2 of 2 (100.0%)');
    expect(verifyCap.out()).toContain('UserReq coverage: 2 of 2 (100.0%)');
    expect(verifyCap.out()).toContain('Pass rate: 2 of 2 (100.0%)');
    expect(verifyCap.out()).toContain('verify: PASSED');

    const strictCap = captureIO();
    expect(
      await run(
        [
          'verify',
          '--dir',
          dir,
          '--min-scenario-coverage',
          '1.0',
          '--min-userreq-coverage',
          '1.0',
          '--min-pass-rate',
          '1.0',
        ],
        strictCap.io,
      ),
    ).toBe(0);
  });

  it('gates a failing scenario: verify --min-pass-rate 1.0 exits 1', async () => {
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
