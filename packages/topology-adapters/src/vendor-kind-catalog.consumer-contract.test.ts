import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { VENDOR_KIND_CATALOG } from './vendor-kind-catalog.js';

/**
 * Cross-checks `VENDOR_KIND_CATALOG`'s `type` strings against
 * `@workspec/topology-schema`'s own authored fixtures — the house
 * convention for what a human writes in `spec.type` by hand. This is a
 * consumer-contract test, not a self-consistency test: it reads a sibling
 * package's fixtures directly (not an API this package imports) so the two
 * can drift apart in source but never in the string values that actually
 * matter for reconciliation. See `vendor-kind-catalog.ts`'s doc comment for
 * why an exact match matters (recon's `(kind, type, resourceGroup, name)`
 * fallback tuple).
 *
 * Deliberately a small, explicit map (catalog key → fixture file) rather
 * than a generic "same kind ⇒ same type" comparison: several catalog
 * entries share a `kind` (e.g. `appInsights`/`logAnalytics`/`monitorGeneric`
 * are all `monitor`) with legitimately different `type` strings, so kind
 * alone isn't a valid join key. Only catalog entries with a same-concept
 * authored fixture are checked; the rest (identity/search/storage/vault/
 * redisEnterprise/logAnalytics/monitorGeneric) have no authored fixture yet
 * and fall back to the `'Azure <Product>'` convention documented in
 * `vendor-kind-catalog.ts` — nothing to cross-check them against until one
 * exists.
 */
const CATALOG_KEY_TO_FIXTURE_FILE = {
  appService: 'app-service.resource.yaml',
  functionApp: 'write-fn.resource.yaml',
  sqlDatabase: 'sql.resource.yaml',
  redisCache: 'cache.resource.yaml',
  privateEndpoint: 'redis-pe.resource.yaml',
  virtualNetwork: 'core-vnet.resource.yaml',
  subnet: 'snet-workload.resource.yaml',
  resourceGroup: 'rg-app.resource.yaml',
  frontDoor: 'front-door.resource.yaml',
  appInsights: 'app-insights.resource.yaml',
} as const satisfies Partial<Record<keyof typeof VENDOR_KIND_CATALOG, string>>;

const fixturesDir = fileURLToPath(
  new URL('../../topology-schema/test/fixtures/valid', import.meta.url),
);

/** Reads `spec.type`'s single-quoted value out of an authored resource fixture via a targeted regex (no YAML dependency needed for this one field). */
function readAuthoredType(fixtureFile: string): string {
  const text = readFileSync(`${fixturesDir}/${fixtureFile}`, 'utf-8');
  const match = /^\s*type:\s*'([^']+)'\s*$/m.exec(text);
  if (!match?.[1]) {
    throw new Error(`could not find a spec.type value in fixture "${fixtureFile}"`);
  }
  return match[1];
}

describe('VENDOR_KIND_CATALOG vs. topology-schema authored fixtures', () => {
  it('the fixture directory is reachable (guards against a silently-empty check)', () => {
    for (const fixtureFile of Object.values(CATALOG_KEY_TO_FIXTURE_FILE)) {
      expect(() => readAuthoredType(fixtureFile)).not.toThrow();
    }
  });

  it.each(Object.entries(CATALOG_KEY_TO_FIXTURE_FILE))(
    'catalog key %s matches the authored spec.type in its fixture',
    (catalogKey, fixtureFile) => {
      const authoredType = readAuthoredType(fixtureFile);
      const catalogEntry = VENDOR_KIND_CATALOG[catalogKey as keyof typeof VENDOR_KIND_CATALOG];
      expect(catalogEntry.type).toBe(authoredType);
    },
  );
});
