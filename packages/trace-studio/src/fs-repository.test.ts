import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { DEFAULT_RUNS_DIR, FsRepository, RefEscapesRootError } from './fs-repository.js';

const API_VERSION = 'workspec.io/v1alpha1';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'trace-studio-fsrepo-'));
  await mkdir(join(dir, '.workspec', 'actors'), { recursive: true });
  await mkdir(join(dir, '.workspec', 'features'), { recursive: true });
  await mkdir(join(dir, '.workspec', 'requirements', 'user'), { recursive: true });
  await mkdir(join(dir, '.workspec', 'requirements', 'system'), { recursive: true });
  await mkdir(join(dir, '.workspec', 'scenarios'), { recursive: true });
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function writeYaml(rel: string, obj: unknown): Promise<void> {
  return writeFile(join(dir, rel), stringify(obj), 'utf8');
}

describe('FsRepository.loadTree', () => {
  it('loads + validates a small tree, deriving each slug from its filename', async () => {
    await writeYaml('.workspec/actors/dev-lead.yaml', {
      apiVersion: API_VERSION,
      kind: 'Actor',
      metadata: {},
      spec: { name: 'Dev lead' },
    });
    await writeYaml('.workspec/features/element-authoring.yaml', {
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: {},
      spec: { name: 'Element authoring' },
    });
    await writeYaml('.workspec/requirements/user/authoring-flow.yaml', {
      apiVersion: API_VERSION,
      kind: 'UserRequirement',
      metadata: {},
      spec: {
        title: 'Author inline',
        actor: 'dev-lead',
        as: 'a dev lead',
        want: 'to author inline',
        so: 'flow is unbroken',
        features: ['element-authoring'],
        status: 'agreed',
      },
    });
    await writeYaml('.workspec/requirements/system/inline-create.yaml', {
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: {},
      spec: {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
      },
    });
    await writeYaml('.workspec/scenarios/inline-create-persists.yaml', {
      apiVersion: API_VERSION,
      kind: 'Scenario',
      metadata: {},
      spec: {
        title: 'Creating an element inline saves it immediately',
        systemRequirement: 'inline-create',
        then: ['it persists'],
      },
    });

    const { tree, issues } = await new FsRepository(dir).loadTree();
    expect(issues).toEqual([]);
    expect(tree.actors.map((a) => a.slug)).toEqual(['dev-lead']);
    expect(tree.features.map((f) => f.slug)).toEqual(['element-authoring']);
    expect(tree.userRequirements.map((u) => u.slug)).toEqual(['authoring-flow']);
    expect(tree.systemRequirements.map((s) => s.slug)).toEqual(['inline-create']);
    expect(tree.scenarios.map((s) => s.slug)).toEqual(['inline-create-persists']);
    // Source is the repo-relative path.
    expect(tree.systemRequirements[0]?.source.file).toBe(
      '.workspec/requirements/system/inline-create.yaml',
    );
    expect(tree.scenarios[0]?.source.file).toBe('.workspec/scenarios/inline-create-persists.yaml');
  });

  it('derives the slug from the FILENAME, ignoring a divergent metadata.slug', async () => {
    await writeYaml('.workspec/features/real-slug.yaml', {
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: { slug: 'not-the-filename' },
      spec: { name: 'A feature' },
    });
    const { tree } = await new FsRepository(dir).loadTree();
    expect(tree.features.map((f) => f.slug)).toEqual(['real-slug']);
  });

  it('collects invalid YAML as a parse diagnostic instead of throwing', async () => {
    await writeFile(
      join(dir, '.workspec', 'features', 'broken.yaml'),
      'key: [unterminated\n',
      'utf8',
    );
    const { tree, issues } = await new FsRepository(dir).loadTree();
    expect(tree.features).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ kind: 'parse', file: '.workspec/features/broken.yaml' });
  });

  it('collects a schema violation as a schema diagnostic instead of throwing', async () => {
    await writeYaml('.workspec/features/no-name.yaml', {
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: {},
      spec: {}, // missing required `name`
    });
    const { tree, issues } = await new FsRepository(dir).loadTree();
    expect(tree.features).toEqual([]);
    expect(
      issues.some((i) => i.kind === 'schema' && i.file === '.workspec/features/no-name.yaml'),
    ).toBe(true);
  });

  it('loads a scenario (the fifth kind), including one with an examples table', async () => {
    await writeYaml('.workspec/requirements/system/inline-create.yaml', {
      apiVersion: API_VERSION,
      kind: 'SystemRequirement',
      metadata: {},
      spec: {
        title: 'Inline element creation',
        feature: 'element-authoring',
        userReqs: ['authoring-flow'],
      },
    });
    await writeYaml('.workspec/scenarios/inline-create-each-kind.yaml', {
      apiVersion: API_VERSION,
      kind: 'Scenario',
      metadata: {},
      spec: {
        title: 'Inline create works for each element kind',
        systemRequirement: 'inline-create',
        when: ['the dev lead inline-creates a "<kind>"'],
        then: ['a valid "<kind>" artifact is written'],
        examples: [{ kind: 'component' }, { kind: 'container' }],
      },
    });

    const { tree, issues } = await new FsRepository(dir).loadTree();
    expect(issues).toEqual([]);
    expect(tree.scenarios.map((s) => s.slug)).toEqual(['inline-create-each-kind']);
    expect(tree.scenarios[0]?.artifact.spec.examples).toEqual([
      { kind: 'component' },
      { kind: 'container' },
    ]);
  });

  it('collects an invalid scenario (missing required `then`) as a schema diagnostic', async () => {
    await writeYaml('.workspec/scenarios/no-then.yaml', {
      apiVersion: API_VERSION,
      kind: 'Scenario',
      metadata: {},
      spec: {
        title: 'A scenario with no assertion',
        systemRequirement: 'inline-create',
        // `then` omitted — required, non-empty per the Scenario schema.
      },
    });
    const { tree, issues } = await new FsRepository(dir).loadTree();
    expect(tree.scenarios).toEqual([]);
    expect(
      issues.some((i) => i.kind === 'schema' && i.file === '.workspec/scenarios/no-then.yaml'),
    ).toBe(true);
  });

  it('flags a filename that is not a valid slug', async () => {
    await writeYaml('.workspec/features/Not A Slug.yaml', {
      apiVersion: API_VERSION,
      kind: 'Feature',
      metadata: {},
      spec: { name: 'x' },
    });
    const { tree, issues } = await new FsRepository(dir).loadTree();
    expect(tree.features).toEqual([]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe('filename');
  });

  it('returns an empty tree (no issues) when .workspec is absent', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'trace-studio-empty-'));
    try {
      const { tree, issues } = await new FsRepository(empty).loadTree();
      expect(issues).toEqual([]);
      expect(tree.actors).toEqual([]);
      expect(tree.systemRequirements).toEqual([]);
      expect(tree.scenarios).toEqual([]);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });
});

describe('FsRepository.loadRuns', () => {
  it('loads valid runs and reports invalid JSON as a diagnostic', async () => {
    await mkdir(join(dir, DEFAULT_RUNS_DIR), { recursive: true });
    await writeFile(
      join(dir, DEFAULT_RUNS_DIR, 'good.json'),
      JSON.stringify({
        id: 'good',
        ts: '2026-07-14T09:30:00.000Z',
        emitter: 'cucumber',
        results: { 'inline-create-persists': 'pass' },
      }),
      'utf8',
    );
    await writeFile(join(dir, DEFAULT_RUNS_DIR, 'broken.json'), '{ not json', 'utf8');

    const { runs, issues } = await new FsRepository(dir).loadRuns(DEFAULT_RUNS_DIR);
    expect(runs.map((r) => r.id)).toEqual(['good']);
    expect(issues.some((i) => i.file.endsWith('broken.json'))).toBe(true);
  });

  it('returns zero runs (no issues) when the runs dir is absent', async () => {
    const { runs, issues } = await new FsRepository(dir).loadRuns(DEFAULT_RUNS_DIR);
    expect(runs).toEqual([]);
    expect(issues).toEqual([]);
  });
});

describe('FsRepository path containment', () => {
  it('rejects a ref that escapes the root on readFile', async () => {
    await expect(new FsRepository(dir).readFile('../escape.txt')).rejects.toBeInstanceOf(
      RefEscapesRootError,
    );
  });

  it('rejects a ref that escapes the root on writeFile', async () => {
    await expect(new FsRepository(dir).writeFile('../escape.txt', 'x')).rejects.toBeInstanceOf(
      RefEscapesRootError,
    );
  });

  it('round-trips a contained ref through writeFile/readFile', async () => {
    const repo = new FsRepository(dir);
    await repo.writeFile('features/generated.feature', 'Feature: x\n');
    expect(await repo.readFile('features/generated.feature')).toBe('Feature: x\n');
  });
});
