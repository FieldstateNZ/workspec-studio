import type { ElementKind } from '@workspec/c4-model';

/**
 * The four element kinds whose schema (`@workspec/c4-schema`'s shared
 * `C4Element`) carries a `technology` field — and, equivalently, the four
 * kinds whose YAML records a required `type:` literal (one schema backs
 * all four directories, so the kind can't be inferred from the schema the
 * way it is for single-kind schemas). Both the create-time serializer and
 * the update service branch on this set, so it lives in one place.
 */
export const TECHNOLOGY_KINDS: ReadonlySet<ElementKind> = new Set([
  'container',
  'component',
  'database',
  'queue',
]);
