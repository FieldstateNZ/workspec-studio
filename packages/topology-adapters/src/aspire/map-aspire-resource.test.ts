import { describe, expect, it } from 'vitest';
import type { AspireResourceInput } from './aspire-resource-input.js';
import { mapAspireResource } from './map-aspire-resource.js';

function resource(overrides: Partial<AspireResourceInput> = {}): AspireResourceInput {
  return {
    name: 'r',
    kind: 'container',
    typeName: 'Foo',
    endpoints: [],
    references: [],
    ...overrides,
  };
}

describe('mapAspireResource', () => {
  it('produces no resource and no diagnostics for a parameter', () => {
    expect(mapAspireResource(resource({ kind: 'parameter', typeName: 'ParameterResource' }))).toEqual(
      { diagnostics: [] },
    );
  });

  it('produces a warning diagnostic and no resource for an unmapped type', () => {
    const result = mapAspireResource(
      resource({ name: 'legacy-queue', kind: 'container', typeName: 'RabbitMQServerResource' }),
    );
    expect(result.resource).toBeUndefined();
    expect(result.diagnostics).toEqual([
      {
        severity: 'warning',
        message: 'No resource-kind mapping for vendor type "RabbitMQServerResource"; resource skipped.',
        source: 'legacy-queue',
      },
    ]);
  });

  it('maps a container to a derived Resource with source.from = the aspire resource name', () => {
    const result = mapAspireResource(
      resource({ name: 'cache', kind: 'container', typeName: 'RedisResource', image: 'redis:7' }),
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.resource).toMatchObject({
      metadata: { slug: 'cache' },
      spec: {
        name: 'cache',
        kind: 'cache',
        type: 'Redis',
        provider: 'aspire',
        config: { image: 'redis:7' },
        source: { kind: 'derived', from: 'cache' },
      },
    });
  });

  it('emits an info diagnostic AND still maps kind: "unknown" to generic compute', () => {
    const result = mapAspireResource(
      resource({ name: 'widget', kind: 'unknown', typeName: 'CustomWidgetResource' }),
    );
    expect(result.resource).toMatchObject({
      spec: { kind: 'compute', type: 'CustomWidgetResource', provider: 'aspire' },
    });
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({ severity: 'info', source: 'widget' });
    expect(result.diagnostics[0]?.message).toContain('CustomWidgetResource');
  });

  it('does not emit the unclassified-kind info diagnostic for an ordinary project/executable/container', () => {
    for (const kind of ['project', 'executable', 'container']) {
      const result = mapAspireResource(resource({ kind, typeName: 'SomeResource' }));
      expect(result.diagnostics).toEqual([]);
    }
  });
});
