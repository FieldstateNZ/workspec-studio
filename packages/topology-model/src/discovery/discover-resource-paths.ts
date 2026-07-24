import { WORKSPEC_DIR } from '@workspec/schema-core';
import { TYPE_DIRECTORIES } from '@workspec/topology-schema';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { listYamlFiles } from './list-yaml-files.js';

/** Enumerates `.workspec/resources/*.yaml`. */
export async function discoverResourcePaths(source: TopologyFileSource): Promise<readonly string[]> {
  return listYamlFiles(source, `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.Resource}`);
}
