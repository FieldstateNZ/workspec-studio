// Unit tests for `derivedDirFor`'s defense-in-depth slug check — the choke
// point every `.topology-actual/<env>/` path funnels through. Every real
// caller (CLI, MCP tools, the HTTP server) pre-validates `env` at its own
// boundary before reaching here (see `derivedDirFor`'s doc comment), so this
// suite exercises the function directly rather than through a caller. Also
// covers `writeDerivedConnections`/`loadDerivedTopology`'s round-trip
// directly (the CLI's `cli.test.ts` covers the same plumbing end to end
// through `import`/`reconcile`; this suite isolates just the read/write pair).

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Resource, Topology } from '@workspec/topology-schema';
import {
  checkReservedSlugCollisions,
  DERIVED_CONNECTIONS_SLUG,
  derivedDirFor,
  InvalidEnvSlugError,
  loadDerivedTopology,
  MultipleObservedTopologiesError,
  writeDerivedConnections,
} from './derived-topology.js';
import { FsRepository } from './fs-repository.js';

/** A minimal, valid observed Topology artifact — content doesn't matter for the multi-file tests, only that it parses as `kind: Topology`. */
function observedTopology(slug: string): Topology {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Topology',
    metadata: { slug },
    spec: {
      title: slug,
      provider: 'derived',
      environments: ['prod'],
      defaultEnvironment: 'prod',
      connections: [],
    },
  };
}

describe('derivedDirFor', () => {
  it('builds the derived directory for a valid slug', () => {
    expect(derivedDirFor('prod')).toBe('.topology-actual/prod');
  });

  it('throws InvalidEnvSlugError for a path-traversal shape', () => {
    expect(() => derivedDirFor('../x')).toThrow(InvalidEnvSlugError);
  });

  it('throws InvalidEnvSlugError for an absolute-path shape', () => {
    expect(() => derivedDirFor('/etc/passwd')).toThrow(InvalidEnvSlugError);
  });
});

describe('writeDerivedConnections', () => {
  let dir: string;
  let repo: FsRepository;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'topology-studio-derived-connections-'));
    repo = new FsRepository(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes nothing and returns undefined when connections is undefined', async () => {
    const ref = await writeDerivedConnections(repo, 'prod', undefined);
    expect(ref).toBeUndefined();
    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome).toEqual({ kind: 'ok', derived: { envSlug: 'prod', resources: [] } });
  });

  it('writes a Topology artifact for an empty array — "captured, zero edges", not "not captured"', async () => {
    const ref = await writeDerivedConnections(repo, 'prod', []);
    expect(ref).toBe(`.topology-actual/prod/${DERIVED_CONNECTIONS_SLUG}.yaml`);

    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome).toEqual({
      kind: 'ok',
      derived: { envSlug: 'prod', resources: [], connections: [] },
    });
  });

  it('round-trips connections through loadDerivedTopology', async () => {
    await writeDerivedConnections(repo, 'prod', [
      { from: 'api-server', to: 'ledger-db', class: 'primary' },
      { from: 'worker', to: 'cache', class: 'telemetry' },
    ]);

    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' ? outcome.derived.connections : undefined).toEqual([
      { from: 'api-server', to: 'ledger-db', class: 'primary' },
      { from: 'worker', to: 'cache', class: 'telemetry' },
    ]);
  });

  it('removes a previously-written file when a later call passes undefined', async () => {
    await writeDerivedConnections(repo, 'prod', [{ from: 'a', to: 'b', class: 'primary' }]);
    const ref = await writeDerivedConnections(repo, 'prod', undefined);
    expect(ref).toBeUndefined();

    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome).toEqual({ kind: 'ok', derived: { envSlug: 'prod', resources: [] } });
  });

  it('overwrites a previous connections file when called again with a new array', async () => {
    await writeDerivedConnections(repo, 'prod', [{ from: 'a', to: 'b', class: 'primary' }]);
    await writeDerivedConnections(repo, 'prod', [{ from: 'x', to: 'y', class: 'primary' }]);

    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome.kind === 'ok' ? outcome.derived.connections : undefined).toEqual([
      { from: 'x', to: 'y', class: 'primary' },
    ]);
  });
});

describe('loadDerivedTopology — single-topology-file policy (BLOCKING review fix)', () => {
  let dir: string;
  let repo: FsRepository;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'topology-studio-multi-topology-'));
    repo = new FsRepository(dir);
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('zero topology-shaped files: unchanged (connections undefined, "not captured")', async () => {
    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome).toEqual({ kind: 'ok', derived: { envSlug: 'prod', resources: [] } });
  });

  it('exactly one topology-shaped file: unchanged (its connections are returned, no error)', async () => {
    await repo.writeTopology('.topology-actual/prod/only-one.yaml', observedTopology('only-one'));
    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome).toEqual({
      kind: 'ok',
      derived: { envSlug: 'prod', resources: [], connections: [] },
    });
  });

  it('MORE than one topology-shaped file: a read-error naming every offender, never a silent pick', async () => {
    await repo.writeTopology('.topology-actual/prod/observed-a.yaml', observedTopology('observed-a'));
    await repo.writeTopology('.topology-actual/prod/observed-b.yaml', observedTopology('observed-b'));

    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome.kind).toBe('read-error');
    if (outcome.kind !== 'read-error') throw new Error('unreachable');

    expect(outcome.ref).toBe('.topology-actual/prod');
    expect(outcome.error).toBeInstanceOf(MultipleObservedTopologiesError);
    const error = outcome.error as MultipleObservedTopologiesError;
    expect(error.refs).toEqual([
      '.topology-actual/prod/observed-a.yaml',
      '.topology-actual/prod/observed-b.yaml',
    ]);
    expect(error.message).toContain('observed-a.yaml');
    expect(error.message).toContain('observed-b.yaml');
    expect(error.message).toContain('keep exactly one');
  });

  it('is deterministic regardless of which file was written first (both orderings agree)', async () => {
    // Filenames chosen so "creation order" and "sorted order" disagree —
    // "zzz-first" is written first but sorts LAST — proving the reported
    // `refs` order comes from loadDerivedTopology's own name sort, not
    // filesystem/creation order.
    await repo.writeTopology('.topology-actual/prod/zzz-first.yaml', observedTopology('zzz-first'));
    await repo.writeTopology('.topology-actual/prod/aaa-second.yaml', observedTopology('aaa-second'));

    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome.kind).toBe('read-error');
    if (outcome.kind !== 'read-error') throw new Error('unreachable');
    const error = outcome.error as MultipleObservedTopologiesError;
    expect(error.refs).toEqual([
      '.topology-actual/prod/aaa-second.yaml',
      '.topology-actual/prod/zzz-first.yaml',
    ]);
  });

  it('revert-check: this test fails if the multi-file guard is removed (regression guard)', async () => {
    // A literal restatement of the "MORE than one" test above, kept
    // separate and minimal so it reads as the canonical revert-check: if
    // loadDerivedTopology goes back to silently picking one topology file
    // over another, this assertion (kind === 'read-error') is the first
    // thing that fails.
    await repo.writeTopology('.topology-actual/prod/a.yaml', observedTopology('a'));
    await repo.writeTopology('.topology-actual/prod/b.yaml', observedTopology('b'));
    const outcome = await loadDerivedTopology(repo, 'prod');
    expect(outcome.kind).toBe('read-error');
  });
});

describe('checkReservedSlugCollisions', () => {
  function resource(slug: string): Resource {
    return {
      apiVersion: 'workspec.io/v1alpha1',
      kind: 'Resource',
      metadata: { slug },
      spec: { name: slug, kind: 'compute', type: 'ProjectResource', provider: 'aspire' },
    };
  }

  it('returns [] when no resource collides with the reserved slug', () => {
    expect(checkReservedSlugCollisions([resource('api-server'), resource('worker')])).toEqual([]);
  });

  it('returns one error diagnostic per resource whose slug equals DERIVED_CONNECTIONS_SLUG', () => {
    const diagnostics = checkReservedSlugCollisions([
      resource('api-server'),
      resource(DERIVED_CONNECTIONS_SLUG),
    ]);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ severity: 'error', source: DERIVED_CONNECTIONS_SLUG });
    expect(diagnostics[0]?.message).toContain(DERIVED_CONNECTIONS_SLUG);
  });

  it('flags every colliding resource, not just the first', () => {
    const diagnostics = checkReservedSlugCollisions([
      resource(DERIVED_CONNECTIONS_SLUG),
      resource(DERIVED_CONNECTIONS_SLUG),
    ]);
    expect(diagnostics).toHaveLength(2);
  });
});
