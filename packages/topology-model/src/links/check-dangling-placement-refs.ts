import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import { isGroupingKindForLens } from '../model/grouping-kind.js';
import type { LensId } from '../model/lens-tree.types.js';
import type { LoadedResource } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { YamlLocator } from '../diagnostics/yaml-locator.js';
import { createYamlLocator } from '../diagnostics/yaml-locator.js';

const PLACEMENT_FIELDS = [
  { field: 'network', lens: 'network' } as const,
  { field: 'resourceGroup', lens: 'rg' } as const,
];

/**
 * Checks one placement ref value — `dangling-ref` (error) when it doesn't
 * resolve to a real resource file, `non-grouping-placement` (warning) when
 * it resolves but to the wrong kind for `lens`. Shared between the base
 * `spec.network`/`spec.resourceGroup` fields and, per environment, an
 * override's `spec.overrides[envId].network`/`.resourceGroup` value (S1) —
 * both are the same kind of ref, just reached via a different path into the
 * same YAML file.
 */
function checkOnePlacementRef(
  diagnostics: TopologyDiagnostic[],
  resources: ReadonlyMap<string, LoadedResource>,
  loaded: LoadedResource,
  locate: YamlLocator,
  refSlug: string,
  field: string,
  lens: LensId,
  path: readonly (string | number)[],
): void {
  const target = resources.get(refSlug);
  if (!target) {
    diagnostics.push(
      makeDiagnostic(
        'error',
        DIAGNOSTIC_CODES.danglingRef,
        `${field} "${refSlug}" does not resolve to any resource file`,
        loaded.path,
        { position: locate(path), refSlug },
      ),
    );
    return;
  }

  if (!isGroupingKindForLens(target.resource.spec.kind, lens)) {
    diagnostics.push(
      makeDiagnostic(
        'warning',
        DIAGNOSTIC_CODES.nonGroupingPlacement,
        `${field} "${refSlug}" resolves to a resource of kind "${target.resource.spec.kind}", which is not a grouping kind for the ${lens} lens`,
        loaded.path,
        { position: locate(path), refSlug },
      ),
    );
  }
}

/**
 * Checks every resource's `network`/`resourceGroup` ref resolves to a real
 * resource file (`dangling-ref`, error), and, when it does resolve, that the
 * target is actually a grouping-kind resource for that lens
 * (`non-grouping-placement`, warning) — a `network` ref to something that
 * isn't a `vnet`/`subnet`, or a `resourceGroup` ref to something that isn't
 * a `resource-group`, parses fine (the schema only requires a valid `Slug`
 * string) but can never render as a sensible container box.
 *
 * **S1 addition (lead-accepted, adversarial review):** also checks every
 * environment override's `network`/`resourceGroup` VALUE, not just the base
 * field. Before this, an override could name a resource-group/vnet slug that
 * doesn't exist (or isn't a grouping kind) and `validate` would pass clean —
 * `resolve()` has no reason to doubt the string, so the resolved topology
 * carries a dangling ref straight through: cost misattributes spend to a
 * resource-group key that will never appear in any real rollup bucket, and
 * the render lens tree silently drops the resource to top-level (a
 * placement ref that doesn't resolve degrades gracefully there BY DESIGN —
 * see `buildLensTree`'s doc comment — which is exactly why nothing upstream
 * of `validate` would ever surface the mistake on its own).
 */
export function checkDanglingPlacementRefs(
  resources: ReadonlyMap<string, LoadedResource>,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];

  for (const loaded of resources.values()) {
    const locate = createYamlLocator(loaded.text);

    for (const { field, lens } of PLACEMENT_FIELDS) {
      const refSlug = loaded.resource.spec[field];
      if (refSlug !== undefined) {
        checkOnePlacementRef(diagnostics, resources, loaded, locate, refSlug, field, lens, [
          'spec',
          field,
        ]);
      }

      for (const [envId, override] of Object.entries(loaded.resource.spec.overrides ?? {})) {
        const overrideRefSlug = override[field];
        if (overrideRefSlug === undefined) continue;
        checkOnePlacementRef(diagnostics, resources, loaded, locate, overrideRefSlug, field, lens, [
          'spec',
          'overrides',
          envId,
          field,
        ]);
      }
    }
  }

  return diagnostics;
}
