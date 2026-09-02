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

    expect(workspace.model.diagrams.map((diagram) => diagram.slug).sort()).toEqual([
      'container',
      'system-context',
    ]);
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
    expect(Object.keys(svgFiles).sort()).toEqual([
      'container-deployment.svg',
      'container-logical.svg',
      'system-context.svg',
    ]);
    for (const bytes of Object.values(svgFiles)) expect(strFromU8(bytes)).toContain('<svg');
  }, 15_000);

  it('rejects unknown endpoints before replacing the current workspace', async () => {
    const invalid = {
      ...DEFAULT_ARCHITECTURE_SNAPSHOT,
      relationships: [
        ...DEFAULT_ARCHITECTURE_SNAPSHOT.relationships,
        { from: 'ledger-api', to: 'missing-service', description: 'Calls it' },
      ],
    };

    await expect(buildArchitectureWorkspace(invalid, 1)).rejects.toMatchObject({
      code: 'invalid_endpoint',
    });
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

    const preview = service.previewRelationship({
      from: 'event-bus',
      to: 'ledger-api',
      description: 'Delivers billing events',
      category: 'data',
    });
    expect(preview.persisted).toBe(false);
    expect(workspace.snapshot.relationships).toHaveLength(5);

    const applied = await service.applyRelationship({ proposalId: preview.proposalId });
    expect(applied.persisted).toBe(true);
    expect(workspace.snapshot.relationships).toHaveLength(6);
    await expect(
      service.applyRelationship({ proposalId: preview.proposalId }),
    ).rejects.toBeInstanceOf(ArchitectureSnapshotError);
  });
});
