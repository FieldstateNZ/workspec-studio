import { WORKSPEC_DIR } from '@workspec/schema-core';
import { TYPE_DIRECTORIES } from '@workspec/topology-schema';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { listYamlFiles } from './list-yaml-files.js';

/**
 * Enumerates `.workspec/topologies/.layout/*.yaml`. `layoutPathFor` (from
 * `@workspec/topology-schema`) builds the path for one known topology slug;
 * this builds the directory path so every present layout file can be
 * discovered up front, including any orphaned by a topology rename.
 */
export async function discoverLayoutPaths(source: TopologyFileSource): Promise<readonly string[]> {
  return listYamlFiles(source, `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.Topology}/.layout`);
}
