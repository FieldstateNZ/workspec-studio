import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to `@workspec/c4-schema`'s golden fixture trees, read in
 * place rather than vendored — the S3 design brief prefers this to avoid
 * two copies of the same tree drifting apart. Both packages live as
 * siblings under `packages/`, so a relative path is stable regardless of
 * where the monorepo itself is checked out.
 */
export const C4_SCHEMA_FIXTURES_ROOT = join(here, '../../../c4-schema/test/fixtures');

export const ENTERPRISE_SUBSET_ROOT = join(C4_SCHEMA_FIXTURES_ROOT, 'enterprise-subset');
export const REPRESENTATIVE_ROOT = join(C4_SCHEMA_FIXTURES_ROOT, 'representative');
