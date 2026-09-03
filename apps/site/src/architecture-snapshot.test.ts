import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDiagramYaml, parseSpecYaml, parseSystemYaml } from '@workspec/c4-schema';

import {
  ArchitectureSnapshotError,
  ArchitectureWebMcpService,
  DEFAULT_ARCHITECTURE_SNAPSHOT,
  buildArchitectureBundle,
  buildArchitectureSvgBundle,
  buildArchitectureWorkspace,
} from './architecture-snapshot.js';

function requiredFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const file = files[path];
  if (file === undefined) throw new Error(`Missing ${path}`);
  return file;
}

describe('Architecture snapshot workflow', () => {
  it('builds one validated source tree that drives the model, YAML ZIP, and SVG ZIP', async () => {
    const workspace = await buildArchitectureWorkspace(DEFAULT_ARCHITECTURE_SNAPSHOT, 0, false);

    expect(workspace.model.diagrams.map((diagram) => diagram.slug)).toEqual(expect.arrayContaining([
      'container', 'system-context', 'incident-management', 'operations-web', 'platform-api',
    ]));
    expect(workspace.model.diagrams).toHaveLength(10);
    expect(workspace.model.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);

    const sourceFiles = unzipSync(buildArchitectureBundle(workspace).bytes);
    expect(
      parseSystemYaml(strFromU8(requiredFile(sourceFiles, '.workspec/system/main-system.yaml'))).ok,
    ).toBe(true);
    expect(parseSpecYaml(strFromU8(requiredFile(sourceFiles, '.workspec/spec.yaml'))).ok).toBe(
      true,
    );
    expect(
      parseDiagramYaml(
        strFromU8(requiredFile(sourceFiles, '.workspec/diagrams/system-context.yaml')),
      ).ok,
    ).toBe(true);
    expect(
      parseDiagramYaml(strFromU8(requiredFile(sourceFiles, '.workspec/diagrams/container.yaml')))
        .ok,
    ).toBe(true);

    const svgFiles = unzipSync((await buildArchitectureSvgBundle(workspace, 'light')).bytes);
    expect(Object.keys(svgFiles)).toEqual(expect.arrayContaining([
      'container-deployment.svg', 'container-logical.svg', 'incident-management.svg',
      'operations-web.svg', 'platform-api.svg', 'system-context.svg',
    ]));
    expect(Object.keys(svgFiles)).toHaveLength(11);
    for (const bytes of Object.values(svgFiles)) expect(strFromU8(bytes)).toContain('<svg');
  }, 15_000);

  it('rejects unknown endpoints before replacing the current workspace', async () => {
    const invalid = {
      ...DEFAULT_ARCHITECTURE_SNAPSHOT,
      relationships: [
        ...DEFAULT_ARCHITECTURE_SNAPSHOT.relationships,
        { from: 'platform-api', to: 'missing-service', description: 'Calls it' },
      ],
    };

    await expect(buildArchitectureWorkspace(invalid, 1)).rejects.toMatchObject({
      code: 'invalid_endpoint',
    });
  });

  it('projects component ownership separately from runtime placement', async () => {
    const workspace = await buildArchitectureWorkspace({
      system: { name: 'Identity platform', description: 'Authenticates customers.' },
      elements: [
        { id: 'authentication', kind: 'domain', name: 'Authentication', description: 'Owns sign-in.' },
        { id: 'web-ui', kind: 'container', name: 'Web UI', description: 'Hosts browser experiences.' },
        { id: 'api', kind: 'container', name: 'API', description: 'Hosts service APIs.' },
        { id: 'login-ui', kind: 'component', name: 'Login UI', description: 'Collects credentials.', logicalParentId: 'authentication', deploymentParentId: 'web-ui' },
        { id: 'login-api', kind: 'component', name: 'Login API', description: 'Validates credentials.', logicalParentId: 'authentication', deploymentParentId: 'api' },
      ],
      relationships: [{ from: 'login-ui', to: 'login-api', description: 'Submits credentials' }],
    }, 0, false);

    const container = workspace.model.diagrams.find((diagram) => diagram.slug === 'container');
    expect(container?.lensViews?.logical.nodes.map((node) => node.kind)).toContain('domain');
    expect(container?.lensViews?.deployment.nodes.filter((node) => node.kind === 'container')).toHaveLength(2);
    expect(workspace.model.diagrams.find((diagram) => diagram.slug === 'authentication')?.view?.nodes.map((node) => node.slug).sort()).toEqual(['login-api', 'login-ui']);
    expect(workspace.model.diagrams.find((diagram) => diagram.slug === 'web-ui')?.view?.nodes.map((node) => node.slug)).toEqual(['login-ui']);
    expect(workspace.model.diagrams.find((diagram) => diagram.slug === 'api')?.view?.nodes.map((node) => node.slug)).toEqual(['login-api']);
    expect(workspace.files['.workspec/components/login-ui.yaml']).toContain('feature-in-domain: ~/domains/authentication.yaml');
    expect(workspace.files['.workspec/components/login-ui.yaml']).toContain('part-of: ~/containers/web-ui.yaml');
  });

  it('previews without mutation, applies once, and rejects stale proposals', async () => {
    let workspace = await buildArchitectureWorkspace(DEFAULT_ARCHITECTURE_SNAPSHOT, 0, false);
    const service = new ArchitectureWebMcpService({
      getWorkspace: () => workspace,
      onWorkspace: (next) => {
        workspace = next;
      },
      proposalIdFactory: () => `proposal-${workspace.key}`,
    });

    const beforeCount = workspace.snapshot.relationships.length;
    const preview = service.previewRelationship({
      from: 'event-bus',
      to: 'background-workers',
      description: 'Delivers asynchronous work',
      category: 'data',
    });
    expect(preview.persisted).toBe(false);
    expect(workspace.snapshot.relationships).toHaveLength(beforeCount);

    const applied = await service.applyRelationship({ proposalId: preview.proposalId });
    expect(applied.persisted).toBe(true);
    expect(workspace.snapshot.relationships).toHaveLength(beforeCount + 1);
    await expect(
      service.applyRelationship({ proposalId: preview.proposalId }),
    ).rejects.toBeInstanceOf(ArchitectureSnapshotError);
  });
});
