// Tests for `createTraceMcpProvider` — tools exercised directly via
// `tool.handler(args)` (no MCP client/transport), mirroring
// `@workspec/cost-studio`'s and `@workspec/c4-studio`'s own
// `mcp-provider.test.ts` suites: `assemble-mcp-server.test.ts` (in
// `@workspec/mcp-core`) already covers the protocol-boundary (wire-name
// dispatch, isError-on-throw) behaviour this provider is mounted through.
//
// Most tests use `createMemoryRepository` — the SAME double `cli.test.ts`
// drives the CLI against, and the fixture from `matrix-fixture.ts` (already
// built for the `matrix` export's own tests, and deliberately containing a
// dangling scenario -> Rule ref) doubles as the "unhappy path" fixture here
// too. The one exception is ref-escape coverage, which needs a REAL
// `FsRepository` (mkdtemp'd): only its `resolve()` can actually throw
// `RefEscapesRootError` — the in-memory double has no path containment to
// defeat.

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpToolDef } from '@workspec/mcp-core';
import type { Actor, Feature, Scenario, SystemRequirement, UserRequirement } from '@workspec/req-schema';
import { groupScenariosByRule, mockCucumberRun } from '@workspec/trace-emitters';
import { buildModel } from '@workspec/trace-model';
import type { Located, TestRun, TraceTree } from '@workspec/trace-model';
import { FsRepository } from './fs-repository.js';
import { buildMatrixFixtureRuns, buildMatrixFixtureTree } from './matrix-fixture.js';
import { renderMatrix } from './matrix-render.js';
import { buildMatrixRows } from './matrix-rows.js';
import { createTraceMcpProvider } from './mcp-provider.js';
import { createMemoryRepository } from './repository.js';
import type { TraceRepositoryPort } from './repository.js';

/** Finds a tool by its module-local name (not the namespaced wire name). */
function tool(repo: TraceRepositoryPort, name: string): McpToolDef {
  const provider = createTraceMcpProvider(repo);
  const found = provider.tools.find((t) => t.name === name);
  if (found === undefined) throw new Error(`no such tool: ${name}`);
  return found;
}

/** Extracts the first text block from a `CallToolResult` (every tool here returns exactly one). */
function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (block === undefined || block.type !== 'text') {
    throw new Error(`expected a text content block, got: ${JSON.stringify(result.content)}`);
  }
  return block.text;
}

// ── a small, clean tree (no dangling refs) for the emit/ingest/verify happy paths ──

const API_VERSION = 'workspec.io/v1alpha1';

function located<A>(slug: string, dir: string, artifact: A): Located<A> {
  return { slug, artifact, source: { file: `.workspec/${dir}/${slug}.yaml` } };
}

/** One actor, one feature, one userReq, one Rule (verifying it), one scenario (proving the Rule). */
function cleanTree(): TraceTree {
  const actor: Actor = {
    apiVersion: API_VERSION,
    kind: 'Actor',
    metadata: {},
    spec: { name: 'dev-lead' },
  };
  const feature: Feature = {
    apiVersion: API_VERSION,
    kind: 'Feature',
    metadata: {},
    spec: { name: 'element-authoring' },
  };
  const userReq: UserRequirement = {
    apiVersion: API_VERSION,
    kind: 'UserRequirement',
    metadata: {},
    spec: {
      title: 'Author an element without leaving the canvas',
      actor: 'dev-lead',
      as: 'a dev lead',
      want: 'to do a thing',
      so: 'that value is delivered',
      features: ['element-authoring'],
      status: 'agreed',
    },
  };
  const rule: SystemRequirement = {
    apiVersion: API_VERSION,
    kind: 'SystemRequirement',
    metadata: {},
    spec: {
      title: 'Inline element creation',
      feature: 'element-authoring',
      userReqs: ['authoring-flow'],
    },
  };
  const scenario: Scenario = {
    apiVersion: API_VERSION,
    kind: 'Scenario',
    metadata: {},
    spec: {
      title: 'Creates and persists inline',
      systemRequirement: 'inline-create',
      then: ['the result is asserted'],
    },
  };
  return {
    actors: [located('dev-lead', 'actors', actor)],
    features: [located('element-authoring', 'features', feature)],
    userRequirements: [located('authoring-flow', 'requirements/user', userReq)],
    systemRequirements: [located('inline-create', 'requirements/system', rule)],
    scenarios: [located('inline-create-persists', 'scenarios', scenario)],
  };
}

// ── emit ─────────────────────────────────────────────────────────────────────

describe('emit', () => {
  it('writes one .feature file per Rule and reports {emitter, count, files, warnings}', async () => {
    const repo = createMemoryRepository({ tree: cleanTree() });
    const result = await tool(repo, 'emit').handler({ emitter: 'cucumber' });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as {
      emitter: string;
      count: number;
      files: string[];
      warnings: string[];
    };
    expect(body.emitter).toBe('cucumber');
    expect(body.count).toBe(1);
    expect(body.files).toEqual(['features/inline-create.feature']);
    expect(body.warnings).toEqual([]);
    expect(repo.writes.get('features/inline-create.feature')).toContain('@inline-create-persists');
  });

  it('folds the orphan-scenario diagnostic into the "warnings" array (no separate stderr channel)', async () => {
    const tree = buildMatrixFixtureTree();
    const repo = createMemoryRepository({ tree });
    const result = await tool(repo, 'emit').handler({ emitter: 'cucumber' });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { warnings: string[] };
    expect(
      body.warnings.some((w) =>
        w.includes('scenario "dangling-rule-scenario" references unknown rule "ghost-rule"'),
      ),
    ).toBe(true);
  });

  it('respects --feature and --out equivalents', async () => {
    const repo = createMemoryRepository({ tree: cleanTree() });
    const result = await tool(repo, 'emit').handler({
      emitter: 'cucumber',
      feature: 'element-authoring',
      out: 'tests',
    });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { files: string[] };
    expect(body.files).toEqual(['tests/inline-create.feature']);
  });

  it('rejects an unknown emitter — isError, no write', async () => {
    const repo = createMemoryRepository({ tree: cleanTree() });
    const result = await tool(repo, 'emit').handler({ emitter: 'nope' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unknown emitter "nope"');
    expect(repo.writes.size).toBe(0);
  });
});

// ── ingest ───────────────────────────────────────────────────────────────────

describe('ingest', () => {
  it('ingests a cucumber report (inline text) and writes a run summary', async () => {
    const tree = cleanTree();
    const repo = createMemoryRepository({ tree });
    const report = mockCucumberRun(groupScenariosByRule(tree));

    const result = await tool(repo, 'ingest').handler({
      content: JSON.stringify(report),
      emitter: 'cucumber',
      id: 'r1',
      ts: '2026-07-21T00:00:00.000Z',
    });
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as {
      ref: string;
      id: string;
      total: number;
      pass: number;
      fail: number;
      skip: number;
    };
    expect(body.ref).toBe('.workspec/.runs/r1.json');
    expect(body.id).toBe('r1');
    expect(body.total).toBe(1);
    expect(body.pass).toBe(1);
    expect(body.fail).toBe(0);

    const written = repo.writes.get('.workspec/.runs/r1.json');
    expect(written).toBeDefined();
    expect(JSON.parse(written as string).results).toEqual({ 'inline-create-persists': 'pass' });
  });

  it('rejects an unknown emitter — isError, no write', async () => {
    const repo = createMemoryRepository();
    const result = await tool(repo, 'ingest').handler({ content: '[]', emitter: 'nope' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unknown emitter "nope"');
    expect(repo.writes.size).toBe(0);
  });

  it('rejects a derived run that fails TestRun schema validation (a non-ISO --ts) — isError, no write', async () => {
    const repo = createMemoryRepository();
    const result = await tool(repo, 'ingest').handler({
      content: '[]',
      emitter: 'cucumber',
      id: 'r1',
      ts: 'not-a-date',
    });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('produced an invalid run');
    expect(repo.writes.size).toBe(0);
  });
});

// ── verify ───────────────────────────────────────────────────────────────────

describe('verify', () => {
  it('reports verdict "pass" as a normal (non-error) result on a clean, fully-covered tree', async () => {
    const tree = cleanTree();
    const runs: TestRun[] = [
      {
        id: 'r1',
        ts: '2026-07-21T00:00:00.000Z',
        emitter: 'cucumber',
        results: { 'inline-create-persists': 'pass' },
      },
    ];
    const repo = createMemoryRepository({ tree, runs });

    const result = await tool(repo, 'verify').handler({});
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as {
      verdict: string;
      scenarioCoverage: { ratio: number };
      userReqCoverage: { ratio: number };
      passRate: { ratio: number };
    };
    expect(body.verdict).toBe('pass');
    expect(body.scenarioCoverage.ratio).toBe(1);
    expect(body.userReqCoverage.ratio).toBe(1);
    expect(body.passRate.ratio).toBe(1);
  });

  it('reports verdict "fail" as a NORMAL (non-error) result when a threshold floor is unmet', async () => {
    const tree = cleanTree();
    const runs: TestRun[] = [
      {
        id: 'r1',
        ts: '2026-07-21T00:00:00.000Z',
        emitter: 'cucumber',
        results: { 'inline-create-persists': 'fail' },
      },
    ];
    const repo = createMemoryRepository({ tree, runs });

    const result = await tool(repo, 'verify').handler({ minPassRate: 1 });
    // The gate RAN successfully — it just found a failing check. That is a
    // normal result whose body says verdict: "fail", not a tool-level error
    // (mirrors @workspec/decision-studio's `validate` tool, which likewise
    // returns diagnostics — even fatal-severity ones — as a normal result).
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { verdict: string; reasons: string[] };
    expect(body.verdict).toBe('fail');
    expect(body.reasons.some((r) => r.includes('pass-rate'))).toBe(true);
  });

  it('reports verdict "fail" for a tree with dangling refs (error findings ALWAYS gate) — still a normal result', async () => {
    const tree = buildMatrixFixtureTree();
    const runs = buildMatrixFixtureRuns();
    const repo = createMemoryRepository({ tree, runs });

    const result = await tool(repo, 'verify').handler({});
    expect(result.isError).not.toBe(true);
    const body = JSON.parse(textOf(result)) as { verdict: string; findings: { severity: string }[] };
    expect(body.verdict).toBe('fail');
    expect(body.findings.some((f) => f.severity === 'error')).toBe(true);
  });

  it('rejects an out-of-range threshold — isError', async () => {
    const repo = createMemoryRepository({ tree: cleanTree() });
    const result = await tool(repo, 'verify').handler({ minPassRate: 2 });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('must be a number in [0, 1]');
  });
});

// ── matrix ───────────────────────────────────────────────────────────────────

describe('matrix', () => {
  it('renders "md", matching the pure serializer byte-for-byte', async () => {
    const tree = buildMatrixFixtureTree();
    const runs = buildMatrixFixtureRuns();
    const repo = createMemoryRepository({ tree, runs });

    const result = await tool(repo, 'matrix').handler({ format: 'md' });
    expect(result.isError).not.toBe(true);
    const expected = renderMatrix('md', buildMatrixRows(buildModel(tree, runs)));
    expect(textOf(result)).toBe(expected);
  });

  it('renders "csv", matching the pure serializer byte-for-byte', async () => {
    const tree = buildMatrixFixtureTree();
    const runs = buildMatrixFixtureRuns();
    const repo = createMemoryRepository({ tree, runs });

    const result = await tool(repo, 'matrix').handler({ format: 'csv' });
    expect(result.isError).not.toBe(true);
    const expected = renderMatrix('csv', buildMatrixRows(buildModel(tree, runs)));
    expect(textOf(result)).toBe(expected);
  });

  it('rejects an unknown format — isError', async () => {
    const repo = createMemoryRepository({ tree: buildMatrixFixtureTree() });
    const result = await tool(repo, 'matrix').handler({ format: 'xml' });
    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('unknown format "xml"');
  });
});

// ── write-target path shape guard (real FsRepository — mkdtemp'd, so we can
//    assert nothing junk-named is created inside the served root) ─────────────

describe('write-target path shape guard (out / runsDir)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'trace-studio-mcp-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  async function seedCleanTreeOnDisk(repo: FsRepository): Promise<void> {
    const tree = cleanTree();
    await repo.writeFile(
      '.workspec/features/element-authoring.yaml',
      stringify(tree.features[0]?.artifact),
    );
    await repo.writeFile(
      '.workspec/requirements/user/authoring-flow.yaml',
      stringify(tree.userRequirements[0]?.artifact),
    );
    await repo.writeFile(
      '.workspec/requirements/system/inline-create.yaml',
      stringify(tree.systemRequirements[0]?.artifact),
    );
    await repo.writeFile(
      '.workspec/scenarios/inline-create-persists.yaml',
      stringify(tree.scenarios[0]?.artifact),
    );
  }

  // The three shapes the shared `isSafeRelativeRef` guard rejects that the
  // repo's own post-resolution containment backstop would NOT catch as an
  // escape on POSIX: a `..` traversal (caught by the backstop, but rejected
  // earlier here), a backslash form (`..\x` — one literal filename on POSIX,
  // so it would resolve INSIDE root and create a junk-named dir), and a
  // Windows drive-letter form. Each must be an `isError` with NO junk
  // filesystem entry created inside the served root.
  const BAD_SHAPES: readonly string[] = ['../escape', String.raw`..\x`, String.raw`C:\evil`];

  it('emit rejects an ill-shaped --out (backslash / drive-letter / ..) — isError, no junk created', async () => {
    for (const bad of BAD_SHAPES) {
      const repo = new FsRepository(dir);
      await seedCleanTreeOnDisk(repo);
      const before = (await readdir(dir)).sort();

      const result = await tool(repo, 'emit').handler({ emitter: 'cucumber', out: bad });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('argument "out" is not a valid repo-relative path');

      // Nothing new landed at the root — only the seeded `.workspec/` remains,
      // no `escape` / `..\x` / `C:` junk entry.
      expect((await readdir(dir)).sort()).toEqual(before);
      expect(before).toEqual(['.workspec']);
    }
  });

  it('ingest rejects an ill-shaped runsDir (backslash / drive-letter / ..) — isError, no junk created', async () => {
    for (const bad of BAD_SHAPES) {
      const repo = new FsRepository(dir);

      const result = await tool(repo, 'ingest').handler({
        content: '[]',
        emitter: 'cucumber',
        id: 'r1',
        runsDir: bad,
      });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain('argument "runsDir" is not a valid repo-relative path');

      // The root stays empty — no junk-named run directory was created.
      expect(await readdir(dir)).toEqual([]);
    }
  });
});
