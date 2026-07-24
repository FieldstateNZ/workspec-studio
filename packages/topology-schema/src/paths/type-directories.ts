import { WORKSPEC_DIR } from '@workspec/schema-core';
import type { ArtifactKind } from './artifact-kind.js';

/**
 * Maps each Topology Studio artifact kind to its type directory name under
 * `.workspec/`. Mirrors `@workspec/schema-core`'s `TYPE_DIRECTORIES` shape
 * and `@workspec/decision-schema`'s own copy of it. Plural, consistent with
 * every other WorkSpec artifact family's directory naming convention.
 */
export const TYPE_DIRECTORIES: Record<ArtifactKind, string> = {
  Topology: 'topologies',
  Resource: 'resources',
  Environment: 'environments',
};

/**
 * Builds the `.workspec/<type-dir>` directory path for a Topology Studio
 * artifact kind, e.g. `typeDirectoryFor('Topology')` -> `.workspec/topologies`.
 * Join a slug plus a file extension to that to get a full artifact path.
 */
export function typeDirectoryFor(kind: ArtifactKind): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}`;
}
