import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import { isGroupingKindForLens } from '../model/grouping-kind.js';
import type { LoadedResource } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import { createYamlLocator } from '../diagnostics/yaml-locator.js';

const PLACEMENT_FIELDS = [
  { field: 'network', lens: 'network' } as const,
  { field: 'resourceGroup', lens: 'rg' } as const,
];

/**
 * Checks every resource's `network`/`resourceGroup` ref resolves to a real
 * resource file (`dangling-ref`, error), and, when it does resolve, that the
 * target is actually a grouping-kind resource for that lens
 * (`non-grouping-placement`, warning) — a `network` ref to something that
 * isn't a `vnet`/`subnet`, or a `resourceGroup` ref to something that isn't
 * a `resource-group`, parses fine (the schema only requires a valid `Slug`
 * string) but can never render as a sensible container box.
 */
export function checkDanglingPlacementRefs(
  resources: ReadonlyMap<string, LoadedResource>,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];

  for (const loaded of resources.values()) {
    const locate = createYamlLocator(loaded.text);

    for (const { field, lens } of PLACEMENT_FIELDS) {
      const refSlug = loaded.resource.spec[field];
      if (refSlug === undefined) continue;

      const target = resources.get(refSlug);
      if (!target) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            DIAGNOSTIC_CODES.danglingRef,
            `${field} "${refSlug}" does not resolve to any resource file`,
            loaded.path,
            { position: locate(['spec', field]), refSlug },
          ),
        );
        continue;
      }

      if (!isGroupingKindForLens(target.resource.spec.kind, lens)) {
        diagnostics.push(
          makeDiagnostic(
            'warning',
            DIAGNOSTIC_CODES.nonGroupingPlacement,
            `${field} "${refSlug}" resolves to a resource of kind "${target.resource.spec.kind}", which is not a grouping kind for the ${lens} lens`,
            loaded.path,
            { position: locate(['spec', field]), refSlug },
          ),
        );
      }
    }
  }

  return diagnostics;
}
