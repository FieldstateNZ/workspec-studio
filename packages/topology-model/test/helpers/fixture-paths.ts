import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `@workspec/topology-schema`'s "web-app" golden fixture
 * files, read in place rather than vendored — avoids two copies of the same
 * fixture drifting apart, same convention `@workspec/c4-model` uses for
 * `@workspec/c4-schema`'s fixtures. Both packages live as siblings under
 * `packages/`, so a relative path is stable regardless of where the
 * monorepo itself is checked out.
 *
 * Unlike c4-schema's fixtures (already laid out as a `.workspec/` tree),
 * topology-schema's fixtures are a FLAT directory of suffix-named files
 * (`app-service.resource.yaml`, `web-app.topology.yaml`, ...) — this
 * package's own artifact kinds live in separate `.workspec/<type-dir>/`
 * directories, so `readWebAppFixtureSeed` (in `read-web-app-fixture.ts`)
 * remaps each file to its real tree path by suffix.
 */
export const TOPOLOGY_SCHEMA_VALID_FIXTURES_ROOT = join(
  here,
  '../../../topology-schema/test/fixtures/valid',
);
