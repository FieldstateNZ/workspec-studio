import { FILE_EXTENSION, WORKSPEC_DIR } from '@workspec/schema-core';
import { TYPE_DIRECTORIES } from './type-directories.js';

/**
 * Builds the path of a topology's `.layout/` file, keyed to the topology's
 * own slug. Layout files are optional and sibling-nested under the
 * topologies directory (`.workspec/topologies/.layout/<topology-slug>.yaml`)
 * rather than mixed in with topology artifacts themselves, so a directory
 * listing of `topologies/` never has to filter out layout files by
 * convention alone. Mirrors `@workspec/c4-schema`'s `layoutPathFor` exactly,
 * adapted to the `topologies` type directory.
 */
export function layoutPathFor(topologySlug: string): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.Topology}/.layout/${topologySlug}${FILE_EXTENSION}`;
}
