import { readFile } from 'node:fs/promises';
import { parseCatalogYaml } from '@workspec/decision-schema';
import type { Catalog } from '@workspec/decision-schema';
import { AZURE_NZ_CATALOG_FIXTURE_PATH } from './fixture-paths.js';

/**
 * Loads and validates this package's `azure-nz.catalog.yaml` test fixture via
 * `@workspec/decision-schema`'s own `parseCatalogYaml` — proves the fixture
 * is a genuinely valid Catalog artifact (not just YAML that happens to
 * typecheck), the same way a real host would load it. Throws with the parse
 * issues on failure so a broken fixture fails loudly at test setup.
 */
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
