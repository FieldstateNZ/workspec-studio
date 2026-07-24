import { WORKSPEC_DIR } from '@workspec/schema-core';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedTopology } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { TopologyFileSource } from '../ports/topology-file-source.js';

/**
 * `.workspec/catalogs/<slug>.yaml` — `@workspec/decision-schema`'s own
 * `TYPE_DIRECTORIES.Catalog` directory name, hardcoded here rather than
 * imported: this package depends only on `@workspec/topology-schema` and
 * `@workspec/schema-core` per its boundary, and pulling in
 * `@workspec/decision-schema` just for one directory-name constant would be
 * a real cross-family dependency for a single string. Same "copy the shape,
 * not the import" convention `@workspec/schema-core`'s own primitives use to
 * avoid *their* upstream dependencies. Flagged in this package's delivery
 * report as a point worth a shared constant if a third family ever needs it
 * too.
 */
const CATALOG_DIR = `${WORKSPEC_DIR}/catalogs`;

/**
 * Checks the topology's optional `spec.catalog` resolves to a real
 * `.workspec/catalogs/<slug>.yaml` file. File-only, async (needs the file
 * source, unlike every other check in this package's `links/` module).
 */
export async function checkDanglingCatalogRef(
  source: TopologyFileSource,
  topology: LoadedTopology,
): Promise<readonly TopologyDiagnostic[]> {
  const catalogSlug = topology.topology.spec.catalog;
  if (catalogSlug === undefined) return [];

  const catalogPath = `${CATALOG_DIR}/${catalogSlug}.yaml`;
  const present = await source.exists(catalogPath);
  if (present) return [];

  return [
    makeDiagnostic(
      'warning',
      DIAGNOSTIC_CODES.danglingCatalogRef,
      `catalog "${catalogSlug}" does not resolve to any file at "${catalogPath}"`,
      topology.path,
      { refSlug: catalogSlug },
    ),
  ];
}
