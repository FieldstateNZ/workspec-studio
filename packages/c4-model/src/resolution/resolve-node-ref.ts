import type { ElementData } from '../model/element-data.types.js';
import type { ElementKind } from '../model/element-kind.js';
import { ELEMENT_KINDS } from '../model/element-kind.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { DiagnosticPosition } from '../diagnostics/make-diagnostic.js';
import type { ClassifiedThinNode } from './classify-thin-node.js';
import type { ElementBearerIndex } from './element-bearer-index.js';
import { rankOf } from './preferred-type.js';
import { isSystemAlias } from './system-alias.js';

/** The outcome of resolving one thin node ref: the winning element (if any) and the id/slug to render it under. */
export interface ResolvedNodeRef {
  readonly nodeId: string;
  readonly slug: string | null;
  readonly element: ElementData | null;
  readonly dangling: boolean;
}

/**
 * Resolves one classified thin node ref (bare or typed) against the tree.
 *
 * - `__system__`: resolves to the system element via `systemSlug` (already
 *   validated to exist by the caller's `no-system` check), keeping
 *   `nodeId: '__system__'` — the stable id Enterprise preserves so
 *   `.layout/` rows keyed under the alias keep matching. If no system
 *   exists this returns a dangling ref with no further diagnostic: the
 *   diagram-level `no-system` error already explains why.
 * - Typed ref (`explicitKind` set): resolves directly by kind+slug; a kind
 *   with no element directory (`class`/`interface`/`function`) or a
 *   missing file both raise `dangling-ref`.
 * - Bare ref: disambiguates by `preferredOrder` (falling back to
 *   `C4_REF_KINDS` order) when the slug has more than one bearer kind,
 *   raising `duplicate-slug` (deduped per diagram+slug via `reportedDuplicates`)
 *   whenever that ambiguity existed, regardless of whether it was resolved.
 *
 * Diagnostics raised here carry `position` (the node entry's line in the
 * diagram YAML, supplied by the caller) and `refSlug` (the slug the
 * offending reference points at).
 */
export function resolveNodeRef(
  node: ClassifiedThinNode,
  bearers: ElementBearerIndex,
  preferredOrder: readonly ElementKind[],
  systemSlug: string | null,
  diagramPath: string,
  reportedDuplicates: Set<string>,
  position: DiagnosticPosition | undefined,
): { resolved: ResolvedNodeRef; diagnostics: C4Diagnostic[] } {
  if (isSystemAlias(node.slug)) {
    const element = systemSlug ? bearers.get('system', systemSlug) : null;
    return {
      resolved: {
        nodeId: node.slug,
        slug: systemSlug,
        element: element?.element ?? null,
        dangling: !element,
      },
      diagnostics: [],
    };
  }

  if (node.explicitKind !== null) {
    const kind = node.explicitKind;
    const element = ELEMENT_KINDS.includes(kind as ElementKind)
      ? bearers.get(kind as ElementKind, node.slug)
      : null;
    if (element) {
      return {
        resolved: { nodeId: node.slug, slug: node.slug, element: element.element, dangling: false },
        diagnostics: [],
      };
    }
    return {
      resolved: { nodeId: node.slug, slug: null, element: null, dangling: true },
      diagnostics: [
        makeDiagnostic(
          'error',
          DIAGNOSTIC_CODES.danglingRef,
          `diagram node references ${kind} "${node.slug}", which does not exist`,
          diagramPath,
          { position, refSlug: node.slug },
        ),
      ],
    };
  }

  const candidateKinds = bearers.bearersOf(node.slug);
  const diagnostics: C4Diagnostic[] = [];

  if (candidateKinds.length === 0) {
    return {
      resolved: { nodeId: node.slug, slug: null, element: null, dangling: true },
      diagnostics: [
        makeDiagnostic(
          'error',
          DIAGNOSTIC_CODES.danglingRef,
          `diagram node references "${node.slug}", which does not exist in any element kind`,
          diagramPath,
          { position, refSlug: node.slug },
        ),
      ],
    };
  }

  if (candidateKinds.length > 1) {
    const dedupeKey = `${diagramPath} ${node.slug}`;
    if (!reportedDuplicates.has(dedupeKey)) {
      reportedDuplicates.add(dedupeKey);
      diagnostics.push(
        makeDiagnostic(
          'warning',
          DIAGNOSTIC_CODES.duplicateSlug,
          `slug "${node.slug}" exists as ${candidateKinds.join(', ')} — this diagram's bare reference is ambiguous`,
          diagramPath,
          { position, refSlug: node.slug },
        ),
      );
    }
  }

  const winner = candidateKinds.reduce((best, candidate) =>
    rankOf(candidate, preferredOrder) < rankOf(best, preferredOrder) ? candidate : best,
  );
  const element = bearers.get(winner, node.slug);

  return {
    resolved: {
      nodeId: node.slug,
      slug: node.slug,
      element: element?.element ?? null,
      dangling: !element,
    },
    diagnostics,
  };
}
