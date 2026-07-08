import { TYPE_DIRECTORIES, WORKSPEC_DIR } from '@workspec/c4-schema';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { listYamlFiles } from './list-yaml-files.js';

/**
 * Enumerates `.workspec/diagrams/*.yaml`. Non-recursive discovery means this
 * never descends into the nested `.workspec/diagrams/.layout/` directory —
 * layout files are discovered separately by {@link discoverLayoutPaths}.
 */
export async function discoverDiagramPaths(source: C4FileSource): Promise<readonly string[]> {
  return listYamlFiles(source, `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.diagram}`);
}
