import { WORKSPEC_DIR } from '@workspec/schema-core';
import { TYPE_DIRECTORIES } from '@workspec/topology-schema';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { listYamlFiles } from './list-yaml-files.js';

/**
 * Enumerates `.workspec/topologies/*.yaml`. Non-recursive discovery means
 * this never descends into the nested `.workspec/topologies/.layout/`
 * directory — layout files are discovered separately by
 * {@link discoverLayoutPaths}. A tree normatively has exactly one topology
 * file; this returns every one found so the loader can diagnose zero or
 * more-than-one deterministically rather than guessing.
 */
export async function discoverTopologyPaths(source: TopologyFileSource): Promise<readonly string[]> {
  return listYamlFiles(source, `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.Topology}`);
}
