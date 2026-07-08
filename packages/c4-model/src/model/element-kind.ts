import { ARTIFACT_KINDS } from '@workspec/c4-schema';
import type { ArtifactKind } from '@workspec/c4-schema';

/**
 * The nine element kinds that back a real `.workspec/` element file —
 * `ArtifactKind` minus `'diagram'`, which this package models separately
 * (diagrams aren't slug-referenceable elements; nothing ever points at one
 * by slug the way it points at an actor or a domain).
 */
export const ELEMENT_KINDS: readonly ElementKind[] = ARTIFACT_KINDS.filter(
  (kind): kind is ElementKind => kind !== 'diagram',
);

/** One of the nine element kinds. */
export type ElementKind = Exclude<ArtifactKind, 'diagram'>;
