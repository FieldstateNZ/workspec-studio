import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `@workspec/c4-schema`'s representative golden fixture
 * tree, read in place rather than vendored — same rationale as
 * `@workspec/c4-model`'s own `test/helpers/fixture-paths.ts`: avoid two
 * copies of the same tree (including its `.layout/system-context.yaml`,
 * the pinned-node fixture the mixed-mode and serialize round-trip tests
 * exercise) drifting apart. Both packages live as siblings under
 * `packages/`, so a relative path is stable regardless of where the
 * monorepo itself is checked out.
 */
export const REPRESENTATIVE_ROOT = join(here, '../../../c4-schema/test/fixtures/representative');
