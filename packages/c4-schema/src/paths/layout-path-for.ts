import { FILE_EXTENSION } from './file-extension.js';
import { TYPE_DIRECTORIES } from './type-directories.js';
import { WORKSPEC_DIR } from './workspec-dir.js';

/**
 * Builds the path of a diagram's `.layout/` file, keyed to the diagram's own
 * slug. Layout files are optional and sibling-nested under the diagrams
 * directory (`.workspec/diagrams/.layout/<diagram-slug>.yaml`) rather than
 * mixed in with diagram artifacts themselves, so a directory listing of
 * `diagrams/` never has to filter out layout files by convention alone.
 */
export function layoutPathFor(diagramSlug: string): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.diagram}/.layout/${diagramSlug}${FILE_EXTENSION}`;
}
