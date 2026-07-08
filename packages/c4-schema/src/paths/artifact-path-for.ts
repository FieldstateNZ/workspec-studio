import { FILE_EXTENSION } from './file-extension.js';
import { TYPE_DIRECTORIES } from './type-directories.js';
import { WORKSPEC_DIR } from './workspec-dir.js';
import type { ArtifactKind } from './artifact-kind.js';

/**
 * Builds the normative repo-relative path for an artifact: identity is the
 * path, and the slug is the filename minus `.yaml` — there is no separate
 * `slug:` field inside the element YAML itself.
 */
export function artifactPathFor(kind: ArtifactKind, slug: string): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}/${slug}${FILE_EXTENSION}`;
}
