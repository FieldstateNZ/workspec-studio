import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `@workspec/topology-schema`'s "web-app" golden fixture
 * files, read in place rather than vendored — avoids two copies of the same
 * fixture drifting apart, same convention `@workspec/topology-model` uses
 * for these same files (see its `test/helpers/fixture-paths.ts`). Both
 * packages live as siblings under `packages/`, so a relative path is stable
 * regardless of where the monorepo itself is checked out.
 */
export const TOPOLOGY_SCHEMA_VALID_FIXTURES_ROOT = join(
  here,
  '../../../topology-schema/test/fixtures/valid',
);

/** Absolute path to this package's own `azure-nz.catalog.yaml` fixture. */
export const AZURE_NZ_CATALOG_FIXTURE_PATH = join(here, '../fixtures/azure-nz.catalog.yaml');
