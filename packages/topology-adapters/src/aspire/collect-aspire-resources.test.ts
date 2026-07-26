import { describe, expect, it } from 'vitest';
import { collectAspireResources } from './collect-aspire-resources.js';

function graph(overrides: Record<string, unknown> = {}) {
  return {
    version: 'workspec-graph/v1',
    apphost: { name: 'Ledger AppHost' },
    resources: [],
    ...overrides,
  };
}

describe('collectAspireResources', () => {
  it('is not recognized for input with no resources array', () => {
    expect(collectAspireResources({})).toEqual({
      recognized: false,
      apphostName: '',
      resources: [],
      diagnostics: [],
    });
    expect(collectAspireResources(null).recognized).toBe(false);
    expect(collectAspireResources('not an object').recognized).toBe(false);
    expect(collectAspireResources({ apphost: {}, resources: 'nope' }).recognized).toBe(false);
  });

  it('is recognized for a valid empty graph, with the apphost name read through', () => {
    const result = collectAspireResources(graph());
    expect(result.recognized).toBe(true);
    expect(result.apphostName).toBe('Ledger AppHost');
    expect(result.resources).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it('defaults apphostName to "" when apphost.name is absent', () => {
    const result = collectAspireResources({ version: 'workspec-graph/v1', resources: [] });
    expect(result.apphostName).toBe('');
  });

  it('emits an error diagnostic for a mismatched version but still collects resources', () => {
    const result = collectAspireResources(
      graph({
        version: 'workspec-graph/v2',
        resources: [{ name: 'a', kind: 'container', typeName: 'Foo' }],
      }),
    );
    expect(result.recognized).toBe(true);
    expect(result.diagnostics).toEqual([
      {
        severity: 'error',
        message:
          'Unsupported graph version (found "workspec-graph/v2", expected "workspec-graph/v1"); resources may be missing or misclassified.',
      },
    ]);
    expect(result.resources).toHaveLength(1);
  });

  it('emits an error diagnostic naming "missing" when version is absent entirely', () => {
    const result = collectAspireResources({ apphost: { name: 'x' }, resources: [] });
    expect(result.diagnostics[0]?.message).toContain('found missing');
  });

  it('drops malformed resource entries silently (missing name/kind/typeName)', () => {
    const result = collectAspireResources(
      graph({
        resources: [
          { name: 'ok', kind: 'container', typeName: 'Foo' },
          { kind: 'container', typeName: 'NoName' },
          { name: 'no-kind', typeName: 'NoKind' },
          { name: 'no-type-name', kind: 'container' },
          'not an object',
          null,
        ],
      }),
    );
    expect(result.resources.map((r) => r.name)).toEqual(['ok']);
    expect(result.diagnostics).toEqual([]);
  });

  it('sorts resources by name (ordinal), independent of input order', () => {
    const result = collectAspireResources(
      graph({
        resources: [
          { name: 'zeta', kind: 'container', typeName: 'Foo' },
          { name: 'alpha', kind: 'container', typeName: 'Foo' },
          { name: 'mid', kind: 'container', typeName: 'Foo' },
        ],
      }),
    );
    expect(result.resources.map((r) => r.name)).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('collects endpoints, references, and optional string fields', () => {
    const result = collectAspireResources(
      graph({
        resources: [
          {
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            command: 'dotnet',
            workingDirectory: '/app',
            parent: 'group',
            endpoints: [
              { name: 'http', scheme: 'http', port: 8080, targetPort: 8080, external: true },
              { notAnEndpoint: true },
            ],
            references: [
              { target: 'db', via: 'connection-string', label: null },
              { target: 'q', via: 'wait' },
              { notAReference: true },
            ],
          },
        ],
      }),
    );
    const [resource] = result.resources;
    expect(resource).toMatchObject({
      name: 'api',
      kind: 'project',
      typeName: 'ProjectResource',
      command: 'dotnet',
      workingDirectory: '/app',
      parent: 'group',
    });
    expect(resource?.endpoints).toEqual([
      { name: 'http', scheme: 'http', port: 8080, targetPort: 8080, external: true },
    ]);
    expect(resource?.references).toEqual([
      { target: 'db', via: 'connection-string' },
      { target: 'q', via: 'wait' },
    ]);
  });

  it('collects a sparse, design-time endpoint (name only, no scheme/port/targetPort/external) without dropping it', () => {
    // The graph contract documents scheme/port/targetPort/external as all
    // independently nullable — "an endpoint without a scheme is still a
    // valid endpoint" — modelling a design-time endpoint declared before
    // Aspire has resolved its allocated port. Only `name` is required.
    const result = collectAspireResources(
      graph({
        resources: [
          {
            name: 'api',
            kind: 'project',
            typeName: 'ProjectResource',
            endpoints: [{ name: 'design-time-only' }],
          },
        ],
      }),
    );
    expect(result.resources[0]?.endpoints).toEqual([{ name: 'design-time-only' }]);
  });
});
