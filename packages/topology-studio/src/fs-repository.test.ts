import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Environment, Resource, Topology } from '@workspec/topology-schema';
import type { Layout } from '@workspec/topology-schema';
import { ArtifactValidationError, FsRepository, RefEscapesRootError } from './fs-repository.js';

/** Narrows a possibly-undefined lookup/index result, failing the test loudly if absent. */
function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected value to be defined');
  return value;
}

function makeTopology(overrides: Partial<Topology['spec']> = {}): Topology {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Topology',
    metadata: { slug: 'web-app' },
    spec: {
      title: 'Web App',
      provider: 'azure',
      environments: ['dev', 'prod'],
      defaultEnvironment: 'prod',
      catalog: 'web-app-hosting',
      connections: [{ from: 'client', to: 'app-service', class: 'primary' }],
      ...overrides,
    },
  };
}

function makeResource(overrides: Partial<Resource['spec']> = {}): Resource {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Resource',
    metadata: { slug: 'app-service' },
    spec: {
      name: 'Web App Service',
      kind: 'compute',
      type: 'Azure App Service',
      provider: 'azure',
      ...overrides,
    },
  };
}

function makeEnvironment(overrides: Partial<Environment['spec']> = {}): Environment {
  return {
    apiVersion: 'workspec.io/v1alpha1',
    kind: 'Environment',
    metadata: { slug: 'prod' },
    spec: {
      naming: { resourceGroupSuffix: '-prod' },
      ...overrides,
    },
  };
}

function makeLayout(): Layout {
  return {
    version: 1,
    nodes: { 'app-service': { positions: { network: { x: 10, y: 20 } } } },
  };
}

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'topology-studio-fsrepo-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsRepository discovery', () => {
  it('finds a topology fixture under .workspec/topologies, deriving its slug from the filename', async () => {
    await mkdir(join(dir, '.workspec', 'topologies'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'topologies', 'web-app.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Topology',
        'metadata: {}',
        'spec:',
        '  title: "Web App"',
        '  provider: azure',
        '  environments: [prod]',
        '  defaultEnvironment: prod',
        '  connections: []',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    expect(await repo.listTopologies()).toEqual([
      { ref: '.workspec/topologies/web-app.yaml', slug: 'web-app', title: 'Web App' },
    ]);
  });

  it('lists each kind only from its own .workspec/<dir>, keyed by the filename slug', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', makeTopology());
    await repo.writeResource('.workspec/resources/app-service.yaml', makeResource());
    await repo.writeEnvironment('.workspec/environments/prod.yaml', makeEnvironment());

    expect(await repo.listTopologies()).toEqual([
      { ref: '.workspec/topologies/web-app.yaml', slug: 'web-app', title: 'Web App' },
    ]);
    expect(await repo.listResources()).toEqual([
      { ref: '.workspec/resources/app-service.yaml', slug: 'app-service', title: 'Web App Service' },
    ]);
    expect(await repo.listEnvironments()).toEqual([
      { ref: '.workspec/environments/prod.yaml', slug: 'prod' },
    ]);
  });

  it('does not discover an artifact written outside its kind directory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('stray.yaml', makeTopology());
    await repo.writeTopology('.workspec/resources/wrong-dir.yaml', makeTopology());
    expect(await repo.listTopologies()).toEqual([]);
  });

  it('does not recurse into a subdirectory of a kind directory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeResource('.workspec/resources/team-a/nested.yaml', makeResource());
    expect(await repo.listResources()).toEqual([]);
  });

  it('does not discover a layout file mixed in under .workspec/topologies/.layout', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', makeTopology());
    await repo.writeLayout('web-app', makeLayout());
    expect(await repo.listTopologies()).toEqual([
      { ref: '.workspec/topologies/web-app.yaml', slug: 'web-app', title: 'Web App' },
    ]);
  });

  it('skips a file whose name is not a valid slug, without throwing', async () => {
    await mkdir(join(dir, '.workspec', 'resources'), { recursive: true });
    await writeFile(join(dir, '.workspec', 'resources', 'Not_A_Slug.yaml'), 'noise');
    const repo = new FsRepository(dir);
    expect(await repo.listResources()).toEqual([]);
  });

  it('lists a file that fails to parse by its filename slug alone (no title)', async () => {
    await mkdir(join(dir, '.workspec', 'resources'), { recursive: true });
    await writeFile(join(dir, '.workspec', 'resources', 'broken.yaml'), 'not: [valid', 'utf8');
    const repo = new FsRepository(dir);
    expect(await repo.listResources()).toEqual([
      { ref: '.workspec/resources/broken.yaml', slug: 'broken', title: 'broken' },
    ]);
  });

  it('an absent kind directory yields zero artifacts, not an error', async () => {
    const repo = new FsRepository(dir);
    expect(await repo.listTopologies()).toEqual([]);
    expect(await repo.listResources()).toEqual([]);
    expect(await repo.listEnvironments()).toEqual([]);
  });
});

describe('FsRepository.resolve — ref containment', () => {
  it('still resolves a normal relative ref (no regression)', () => {
    const repo = new FsRepository(dir);
    expect(repo.resolve('.workspec/topologies/web-app.yaml')).toBe(
      join(dir, '.workspec', 'topologies', 'web-app.yaml'),
    );
  });

  it('rejects a POSIX absolute ref instead of trusting it unchanged', () => {
    const repo = new FsRepository(dir);
    expect(() => repo.resolve('/etc/passwd')).toThrow(RefEscapesRootError);
  });

  it('propagates the rejection through readTopology as a promise rejection', async () => {
    const repo = new FsRepository(dir);
    await expect(repo.readTopology('/etc/passwd')).rejects.toBeInstanceOf(RefEscapesRootError);
  });
});

describe('FsRepository read', () => {
  it('reads + validates a written topology', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', makeTopology());
    const topology = await repo.readTopology('.workspec/topologies/web-app.yaml');
    expect(topology.metadata.slug).toBe('web-app');
    expect(must(topology.spec.connections[0]).from).toBe('client');
  });

  it('throws ArtifactValidationError with located issues on an invalid file', async () => {
    await mkdir(join(dir, '.workspec', 'topologies'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'topologies', 'bad.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Topology',
        'metadata: {}',
        'spec:',
        '  title: "Bad"',
        '  provider: azure',
        '  environments: [prod]',
        '  defaultEnvironment: staging', // not declared in environments
        '  connections: []',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    await expect(repo.readTopology('.workspec/topologies/bad.yaml')).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
    try {
      await repo.readTopology('.workspec/topologies/bad.yaml');
    } catch (error) {
      const e = error as ArtifactValidationError;
      expect(must(e.issues[0]).path).toContain('defaultEnvironment');
    }
  });
});

describe('FsRepository write', () => {
  it('writes a comment-preserving topology with the directive header', async () => {
    const repo = new FsRepository(dir);
    await repo.writeTopology('.workspec/topologies/web-app.yaml', makeTopology());
    const written = await readFile(join(dir, '.workspec', 'topologies', 'web-app.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect(written).toContain('title: Web App');
  });

  it('preserves a hand-written comment across a re-write', async () => {
    await mkdir(join(dir, '.workspec', 'resources'), { recursive: true });
    await writeFile(
      join(dir, '.workspec', 'resources', 'app-service.yaml'),
      [
        '# yaml-language-server: $schema=x',
        'apiVersion: workspec.io/v1alpha1',
        'kind: Resource',
        'metadata:',
        '  slug: app-service',
        'spec:',
        '  name: Web App Service # do not rename, downstream depends on this',
        '  kind: compute',
        '  type: Azure App Service',
        '  provider: azure',
        '',
      ].join('\n'),
    );
    const repo = new FsRepository(dir);
    const resource = await repo.readResource('.workspec/resources/app-service.yaml');
    await repo.writeResource('.workspec/resources/app-service.yaml', {
      ...resource,
      spec: { ...resource.spec, type: 'Azure App Service (P1v3)' },
    });
    const rewritten = await readFile(join(dir, '.workspec', 'resources', 'app-service.yaml'), 'utf8');
    expect(rewritten).toContain('do not rename, downstream depends on this');
    expect(rewritten).toContain('Azure App Service (P1v3)');
  });

  it('emits a fresh file under a not-yet-existing nested directory', async () => {
    const repo = new FsRepository(dir);
    await repo.writeEnvironment('custom/nested/new.yaml', makeEnvironment());
    const written = await readFile(join(dir, 'custom', 'nested', 'new.yaml'), 'utf8');
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
    expect((await repo.readEnvironment('custom/nested/new.yaml')).metadata.slug).toBe('prod');
  });

  it('rejects writes that fail Zod validation', async () => {
    const repo = new FsRepository(dir);
    const bad = makeTopology({ defaultEnvironment: 'not-declared' });
    await expect(repo.writeTopology('.workspec/topologies/web-app.yaml', bad)).rejects.toBeInstanceOf(
      ArtifactValidationError,
    );
  });
});

describe('FsRepository layout', () => {
  it('round-trips a layout keyed by topology slug', async () => {
    const repo = new FsRepository(dir);
    expect(await repo.readLayout('web-app')).toBeUndefined();

    await repo.writeLayout('web-app', makeLayout());
    const layout = await repo.readLayout('web-app');
    expect(layout?.nodes['app-service']?.positions.network).toEqual({ x: 10, y: 20 });

    const written = await readFile(
      join(dir, '.workspec', 'topologies', '.layout', 'web-app.yaml'),
      'utf8',
    );
    expect(written.startsWith('# yaml-language-server: $schema=')).toBe(true);
  });

  it('rejects an invalid layout without writing', async () => {
    const repo = new FsRepository(dir);
    await expect(
      repo.writeLayout('web-app', { version: 2 } as unknown as Layout),
    ).rejects.toBeInstanceOf(ArtifactValidationError);
    expect(await repo.readLayout('web-app')).toBeUndefined();
  });
});
