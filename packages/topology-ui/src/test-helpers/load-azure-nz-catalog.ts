// Test-only helper: reads `@workspec/topology-cost`'s own `azure-nz.catalog.yaml`
// test fixture off disk (read in place rather than vendored, same convention
// `read-web-app-fixture.ts` uses for `@workspec/topology-schema`'s fixture) —
// this is the SAME catalog `@workspec/topology-cost`'s own golden test prices
// the web-app fixture against, so a Cost-view test built on it locks against
// a real, already-proven catalog/topology pairing.

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCatalogYaml } from '@workspec/decision-schema';
import type { Catalog } from '@workspec/decision-schema';

const here = dirname(fileURLToPath(import.meta.url));

/** Absolute path to `@workspec/topology-cost`'s `azure-nz.catalog.yaml` fixture. */
const AZURE_NZ_CATALOG_FIXTURE_PATH = join(
  here,
  '../../../topology-cost/test/fixtures/azure-nz.catalog.yaml',
);

/** Loads and validates the `azure-nz.catalog.yaml` fixture via `@workspec/decision-schema`'s own `parseCatalogYaml`. Throws with the parse issues on failure so a broken fixture fails loudly at test setup. */
export async function loadAzureNzCatalog(): Promise<Catalog> {
  const text = await readFile(AZURE_NZ_CATALOG_FIXTURE_PATH, 'utf8');
  const result = parseCatalogYaml(text);
  if (!result.ok) {
    throw new Error(
      `azure-nz.catalog.yaml fixture failed to parse: ${JSON.stringify(result.errors, null, 2)}`,
    );
  }
  return result.data;
}
