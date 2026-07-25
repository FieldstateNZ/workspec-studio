import { FILE_EXTENSION, WORKSPEC_DIR } from '@workspec/schema-core';
import { TYPE_DIRECTORIES } from './type-directories.js';

const LAYOUT_DIR_PREFIX = `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.Topology}/.layout/`;

/**
 * True if `path` sits under `.workspec/topologies/.layout/` and ends in
 * `.yaml` — i.e. it is a layout file rather than a topology artifact file,
 * even though both live under the `topologies` type directory. Mirrors
 * `@workspec/c4-schema`'s `isLayoutFile` exactly.
 */
export function isLayoutFile(path: string): boolean {
  return path.startsWith(LAYOUT_DIR_PREFIX) && path.endsWith(FILE_EXTENSION);
}
