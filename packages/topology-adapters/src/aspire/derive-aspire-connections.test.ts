import { describe, expect, it } from 'vitest';
import type { AspireResourceInput } from './aspire-resource-input.js';
import { deriveAspireConnections } from './derive-aspire-connections.js';

function resource(
  name: string,
  references: AspireResourceInput['references'] = [],
): AspireResourceInput {
  return { name, kind: 'container', typeName: 'Foo', endpoints: [], references };
}

const slugByName = new Map([
  ['api-server', 'api-server'],
  ['ledger-db', 'ledger-db'],
  ['cache', 'cache'],
  // "environment-name" and "legacy-queue" deliberately absent: skipped/unmapped, no Resource.
]);

describe('deriveAspireConnections', () => {
  it.each(['connection-string', 'endpoint', 'environment', 'unknown'])(
    'turns a %s-sourced reference into a primary connection',
    (via) => {
      const resources = [resource('api-server', [{ target: 'ledger-db', via }])];
      expect(deriveAspireConnections(resources, slugByName)).toEqual([
        { from: 'api-server', to: 'ledger-db', class: 'primary' },
      ]);
    },
  );

  it.each(['wait', 'relationship'])('excludes a %s-sourced reference entirely', (via) => {
    const resources = [resource('api-server', [{ target: 'ledger-db', via }])];
    expect(deriveAspireConnections(resources, slugByName)).toEqual([]);
  });

  it('drops a reference whose source resource was skipped/unmapped (not in slugByName)', () => {
    const resources = [
      resource('environment-name', [{ target: 'ledger-db', via: 'connection-string' }]),
    ];
    expect(deriveAspireConnections(resources, slugByName)).toEqual([]);
  });

  it('drops a reference whose target resource was skipped/unmapped (not in slugByName)', () => {
    const resources = [
      resource('api-server', [{ target: 'environment-name', via: 'environment' }]),
      resource('api-server', [{ target: 'legacy-queue', via: 'endpoint' }]),
    ];
    expect(deriveAspireConnections(resources, slugByName)).toEqual([]);
  });

  it('drops a self-loop', () => {
    const resources = [resource('api-server', [{ target: 'api-server', via: 'endpoint' }])];
    expect(deriveAspireConnections(resources, slugByName)).toEqual([]);
  });

  it('dedupes identical (from, to) pairs across multiple references', () => {
    const resources = [
      resource('api-server', [
        { target: 'ledger-db', via: 'connection-string' },
        { target: 'ledger-db', via: 'endpoint' },
      ]),
    ];
    expect(deriveAspireConnections(resources, slugByName)).toEqual([
      { from: 'api-server', to: 'ledger-db', class: 'primary' },
    ]);
  });

  it('resolves endpoints through the FINAL (post-disambiguation) slug, not a raw toSlug(name) guess', () => {
    const renamedSlugs = new Map([
      ['api-server', 'api-server'],
      ['cache', 'cache-aspire-2'], // as if disambiguation renamed it
    ]);
    const resources = [resource('api-server', [{ target: 'cache', via: 'endpoint' }])];
    expect(deriveAspireConnections(resources, renamedSlugs)).toEqual([
      { from: 'api-server', to: 'cache-aspire-2', class: 'primary' },
    ]);
  });

  it('returns connections sorted by (from, to), independent of input resource order', () => {
    const resources = [
      resource('cache', [{ target: 'api-server', via: 'endpoint' }]),
      resource('api-server', [{ target: 'ledger-db', via: 'connection-string' }]),
    ];
    expect(deriveAspireConnections(resources, slugByName)).toEqual([
      { from: 'api-server', to: 'ledger-db', class: 'primary' },
      { from: 'cache', to: 'api-server', class: 'primary' },
    ]);
  });

  it('returns an empty array (not undefined) for resources with no references at all', () => {
    expect(deriveAspireConnections([resource('api-server')], slugByName)).toEqual([]);
  });
});
