import { WORKSPEC_DIR } from '@workspec/schema-core';
import type { ArtifactKind } from './artifact-kind.js';

/**
 * Maps each Decision Studio artifact kind to its type directory name under
 * `.workspec/`. Mirrors `@workspec/schema-core`'s `TYPE_DIRECTORIES` shape.
 * Plural, consistent with the cost-attribution convention: discovery moves
 * here (a directory walk keyed off these names), replacing the old
 * filename-suffix + glob machinery.
 */
export const TYPE_DIRECTORIES: Record<ArtifactKind, string> = {
  Decision: 'decisions',
  Catalog: 'catalogs',
};

/**
 * Builds the `.workspec/<type-dir>` directory path for a Decision Studio
 * artifact kind, e.g. `typeDirectoryFor('Decision')` -> `.workspec/decisions`.
 * Join a slug plus a file extension to that to get a full artifact path.
 */
export function typeDirectoryFor(kind: ArtifactKind): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}`;
}
