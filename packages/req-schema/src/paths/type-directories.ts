import { WORKSPEC_DIR } from '@workspec/schema-core';
import type { ArtifactKind } from './artifact-kind.js';

/**
 * Maps each traceability artifact kind to its type directory name under
 * `.workspec/`. Mirrors `@workspec/schema-core`'s `TYPE_DIRECTORIES` shape.
 * Two of the three are nested (`requirements/user`, `requirements/system`) —
 * `slugFromPath` still recovers the slug as the filename stem regardless of
 * directory depth.
 */
export const TYPE_DIRECTORIES: Record<ArtifactKind, string> = {
  Feature: 'features',
  UserRequirement: 'requirements/user',
  SystemRequirement: 'requirements/system',
};

/**
 * Builds the `.workspec/<type-dir>` directory path for a traceability artifact
 * kind, e.g. `typeDirectoryFor('SystemRequirement')` ->
 * `.workspec/requirements/system`. Join a slug plus `FILE_EXTENSION` to that
 * to get a full artifact path.
 */
export function typeDirectoryFor(kind: ArtifactKind): string {
  return `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}`;
}
