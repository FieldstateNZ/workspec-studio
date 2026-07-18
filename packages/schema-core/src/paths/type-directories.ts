import type { ArtifactKind } from './artifact-kind.js';
import { WORKSPEC_DIR } from './workspec-dir.js';

/**
 * Maps each shared artifact kind to its type directory name under
 * `.workspec/`. Same shape as `@workspec/c4-schema`'s `TYPE_DIRECTORIES` —
 * copied rather than imported so this package has zero `@workspec`
 * dependencies.
 */
export const TYPE_DIRECTORIES: Record<ArtifactKind, string> = {
  Actor: 'actors',
};

/**
 * Builds the `.workspec/<type-dir>` directory path for a shared artifact
 * kind, e.g. `typeDirectoryFor('Actor')` -> `.workspec/actors`. Join a slug
 * plus `FILE_EXTENSION` to that to get a full artifact path.
 */
export function typeDirectoryFor(kind: ArtifactKind): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}`;
}
