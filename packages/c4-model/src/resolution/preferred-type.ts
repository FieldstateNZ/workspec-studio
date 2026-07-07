import { C4_REF_KINDS } from '@workspec/c4-schema';
import type { ElementKind } from '../model/element-kind.js';

/**
 * Per-diagram-type kind preference order, mirroring Enterprise's
 * `PREFERRED_TYPE_BY_DIAGRAM` in `get-diagram.ts` exactly for `c4-context`
 * and `c4-component`. `c4-container` is not listed here — see
 * {@link PREFERRED_ORDER_BY_CONTAINER_LENS} — because this package
 * deliberately lens-partitions container disambiguation (S3 design brief),
 * which Enterprise's single combined `["domain","container","database","queue"]`
 * list does not do.
 */
const PREFERRED_TYPE_BY_DIAGRAM: Readonly<Record<string, readonly ElementKind[]>> = {
  'c4-context': ['system', 'actor', 'external-system'],
  'c4-component': ['feature', 'component'],
};

/**
 * `c4-container` is lens-partitioned: the logical lens prefers `domain`
 * first (the C4 "container (logical)" reading), the deployment lens
 * prefers `container` first. Both fall through to `database`/`queue` after
 * their respective first choice.
 */
const PREFERRED_ORDER_BY_CONTAINER_LENS: Readonly<Record<'logical' | 'deployment', readonly ElementKind[]>> = {
  logical: ['domain', 'container', 'database', 'queue'],
  deployment: ['container', 'domain', 'database', 'queue'],
};

/** The kind-preference order to disambiguate a bare-slug ref for `diagramType` (and, for `c4-container`, `lens`). */
export function preferredOrderFor(diagramType: string, lens: 'logical' | 'deployment' | null): readonly ElementKind[] {
  if (diagramType === 'c4-container') {
    return PREFERRED_ORDER_BY_CONTAINER_LENS[lens ?? 'logical'];
  }
  return PREFERRED_TYPE_BY_DIAGRAM[diagramType] ?? [];
}

/**
 * Ranks `kind` for winner selection among a slug's bearer kinds: position
 * in `preferredOrder` if listed, else `C4_REF_KINDS`' own declaration
 * order (offset past every preferred entry) as a deterministic fallback —
 * lower rank wins. This is the S3 design brief's explicit, reproducible
 * replacement for Enterprise's DB-row-insertion-order tie-break, which has
 * no equivalent in a file-tree world.
 */
export function rankOf(kind: ElementKind, preferredOrder: readonly ElementKind[]): number {
  const preferredIndex = preferredOrder.indexOf(kind);
  if (preferredIndex !== -1) return preferredIndex;
  return preferredOrder.length + C4_REF_KINDS.indexOf(kind);
}
