import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ResourceArtifact } from '@workspec/topology-schema';
import { describe, expect, it } from 'vitest';
import { aspireAdapter } from './aspire-adapter.js';

const fixturePath = fileURLToPath(
  new URL('../../test/fixtures/aspire/sample-graph.json', import.meta.url),
);
const sampleGraph: unknown = JSON.parse(readFileSync(fixturePath, 'utf-8'));

function bySlug(resources: ReturnType<typeof aspireAdapter>['resources'], slug: string) {
  const resource = resources.find((r) => r.metadata.slug === slug);
  if (!resource) throw new Error(`expected a resource with slug "${slug}"`);
  return resource;
}

describe('aspireAdapter', () => {
  it('maps every classifiable resource to a Resource artifact, skipping the parameter and unmapped queue', () => {
    const { resources } = aspireAdapter(sampleGraph);
    expect(resources.map((r) => r.metadata.slug).sort()).toEqual(
      [
        'api-server',
        'cache',
        'invoice-archive',
        'ledger-db',
        'postgres-enterprise',
        'unlisted-widget',
        'worker',
      ].sort(),
    );
  });

  it('every produced resource validates against ResourceArtifact', () => {
    const { resources } = aspireAdapter(sampleGraph);
    for (const resource of resources) {
      expect(() => ResourceArtifact.parse(resource)).not.toThrow();
    }
  });

  it('every produced resource is marked derived, provenance = the aspire resource name', () => {
    const { resources } = aspireAdapter(sampleGraph);
    for (const resource of resources) {
      expect(resource.spec.source).toEqual({ kind: 'derived', from: resource.spec.name });
    }
  });

  it('maps kind/type/provider per the mapping table', () => {
    const { resources } = aspireAdapter(sampleGraph);
    expect(bySlug(resources, 'api-server').spec).toMatchObject({
      kind: 'compute',
      type: 'ProjectResource',
      provider: 'aspire',
    });
    expect(bySlug(resources, 'worker').spec).toMatchObject({
      kind: 'compute',
      type: 'ExecutableResource',
      provider: 'aspire',
    });
    expect(bySlug(resources, 'postgres-enterprise').spec).toMatchObject({
      kind: 'database',
      type: 'PostgreSQL',
      provider: 'aspire',
    });
    expect(bySlug(resources, 'ledger-db').spec).toMatchObject({
      kind: 'database',
      type: 'PostgreSQL',
      provider: 'aspire',
    });
    expect(bySlug(resources, 'cache').spec).toMatchObject({
      kind: 'cache',
      type: 'Redis',
      provider: 'aspire',
    });
    expect(bySlug(resources, 'invoice-archive').spec).toMatchObject({
      kind: 'storage',
      type: 'Azure Storage Account',
      provider: 'azure',
    });
    expect(bySlug(resources, 'unlisted-widget').spec).toMatchObject({
      kind: 'compute',
      type: 'CustomWidgetResource',
      provider: 'aspire',
    });
  });

  it('curates image + endpoints into config for a container resource', () => {
    const { resources } = aspireAdapter(sampleGraph);
    expect(bySlug(resources, 'cache').spec.config).toEqual({
      image: 'docker.io/library/redis:7',
      endpoints: [{ name: 'tcp', scheme: 'tcp', port: 6379, targetPort: 6379, external: false }],
    });
  });

  it('emits a warning diagnostic for the unmapped RabbitMQ (queue) resource and drops it', () => {
    const { resources, diagnostics } = aspireAdapter(sampleGraph);
    expect(resources.some((r) => r.spec.name === 'legacy-queue')).toBe(false);
    const warning = diagnostics.find((d) => d.source === 'legacy-queue');
    expect(warning).toMatchObject({ severity: 'warning' });
    expect(warning?.message).toContain('RabbitMQServerResource');
  });

  it('emits an info diagnostic for the kind:"unknown" resource but still maps it', () => {
    const { diagnostics } = aspireAdapter(sampleGraph);
    const info = diagnostics.find((d) => d.source === 'unlisted-widget');
    expect(info).toMatchObject({ severity: 'info' });
  });

  it('produces no resource for the skipped parameter, and no diagnostic either', () => {
    const { resources, diagnostics } = aspireAdapter(sampleGraph);
    expect(resources.some((r) => r.spec.name === 'environment-name')).toBe(false);
    expect(diagnostics.some((d) => d.source === 'environment-name')).toBe(false);
  });

  it('derives connections from env/args-sourced references only, dropping wait/relationship edges and edges to skipped/unmapped targets', () => {
    const { connections } = aspireAdapter(sampleGraph);
    expect(connections).toEqual([
      { from: 'api-server', to: 'ledger-db', class: 'primary' },
      { from: 'worker', to: 'cache', class: 'primary' },
      { from: 'worker', to: 'postgres-enterprise', class: 'primary' },
    ]);
  });

  it('does not represent the ledger-db/postgres-enterprise parent/child relationship in any emitted shape (documented v0 gap)', () => {
    const { resources, connections } = aspireAdapter(sampleGraph);
    const ledgerDb = bySlug(resources, 'ledger-db');
    expect(ledgerDb.spec).not.toHaveProperty('parent');
    expect(
      connections?.some((c) => c.from === 'postgres-enterprise' && c.to === 'ledger-db'),
    ).toBe(false);
  });

  it('is not recognized (empty output, no connections key) for input with no resources array', () => {
    expect(aspireAdapter({})).toEqual({ resources: [], diagnostics: [] });
    expect(aspireAdapter(null)).toEqual({ resources: [], diagnostics: [] });
    expect(aspireAdapter('not an object')).toEqual({ resources: [], diagnostics: [] });
  });

  it('returns connections: [] (captured, zero edges) for a recognized graph with no references at all', () => {
    const { connections } = aspireAdapter({
      version: 'workspec-graph/v1',
      apphost: { name: 'Empty' },
      resources: [],
    });
    expect(connections).toEqual([]);
  });

  it('exits with an error diagnostic for an unsupported graph version, but still best-effort maps', () => {
    const { diagnostics, resources } = aspireAdapter({
      version: 'workspec-graph/v2',
      apphost: { name: 'x' },
      resources: [{ name: 'a', kind: 'container', typeName: 'RedisResource' }],
    });
    expect(diagnostics.some((d) => d.severity === 'error')).toBe(true);
    expect(resources).toHaveLength(1);
  });

  it('disambiguates two different resource NAMES that sanitize to the same slug (regression: names are unique by contract, but slugs can still collide)', () => {
    const collidingGraph = {
      version: 'workspec-graph/v1',
      apphost: { name: 'x' },
      resources: [
        { name: 'Cache', kind: 'container', typeName: 'RedisResource', endpoints: [], references: [] },
        { name: 'cache!!', kind: 'container', typeName: 'RedisResource', endpoints: [], references: [] },
      ],
    };
    const { resources, diagnostics } = aspireAdapter(collidingGraph);
    expect(resources).toHaveLength(2);
    const slugs = resources.map((r) => r.metadata.slug).sort();
    expect(new Set(slugs).size).toBe(2);
    // Both resources have provider "aspire" and no resourceGroup, so the
    // collision guard's discriminator (resourceGroup ?? provider) is
    // identical for both — the numeric-suffix safety net is what actually
    // resolves this collision (see disambiguate-duplicate-slugs.ts).
    expect(slugs).toEqual(['cache-aspire', 'cache-aspire-2']);
    expect(diagnostics.some((d) => d.message.includes('Duplicate slug "cache"'))).toBe(true);
  });

  it('produces byte-identical resources and connections regardless of the input array order (canonical sort)', () => {
    const forward = JSON.parse(JSON.stringify(sampleGraph)) as { resources: unknown[] };
    const reversed = { ...forward, resources: [...forward.resources].reverse() };

    const a = aspireAdapter(forward);
    const b = aspireAdapter(reversed);

    expect(a.resources).toEqual(b.resources);
    expect(a.connections).toEqual(b.connections);
    expect(a.diagnostics).toEqual(b.diagnostics);
  });

  it('slug assignment for a genuine collision is stable across reordering too', () => {
    const resources = [
      { name: 'Cache', kind: 'container', typeName: 'RedisResource', endpoints: [], references: [] },
      { name: 'cache!!', kind: 'container', typeName: 'RedisResource', endpoints: [], references: [] },
    ];
    const forward = { version: 'workspec-graph/v1', apphost: { name: 'x' }, resources };
    const reversed = { ...forward, resources: [...resources].reverse() };

    const a = aspireAdapter(forward);
    const b = aspireAdapter(reversed);

    // Sorted-by-name canonical order means "Cache" is always processed
    // before "cache!!" (capital C sorts before lowercase c in ordinal
    // comparison) regardless of the graph's own array order — so the same
    // resource always keeps the bare discriminated slug.
    const slugFor = (out: typeof a, name: string) =>
      out.resources.find((r) => r.spec.name === name)?.metadata.slug;
    expect(slugFor(a, 'Cache')).toBe(slugFor(b, 'Cache'));
    expect(slugFor(a, 'cache!!')).toBe(slugFor(b, 'cache!!'));
  });
});
