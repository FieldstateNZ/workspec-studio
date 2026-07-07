import { FILE_EXTENSION } from './file-extension.js';
import { TYPE_DIRECTORIES } from './type-directories.js';
import { WORKSPEC_DIR } from './workspec-dir.js';

const LAYOUT_DIR_PREFIX = `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.diagram}/.layout/`;

/**
 * True if `path` sits under `.workspec/diagrams/.layout/` and ends in
 * `.yaml` — i.e. it is a layout file rather than a diagram artifact file,
 * even though both live under the `diagrams` type directory.
 */
export function isLayoutFile(path: string): boolean {
  return path.startsWith(LAYOUT_DIR_PREFIX) && path.endsWith(FILE_EXTENSION);
}
