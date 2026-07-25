import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedLayoutInfo } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import { createYamlLocator } from '../diagnostics/yaml-locator.js';
import type { RawLayout } from '../loading/load-layouts-raw.js';

/**
 * Matches the tree's `.layout/` file(s) against its singleton topology,
 * flagging two kinds of drift: `orphan-layout-file` for a `.layout/<slug>`
 * whose slug names no topology at all, and `orphan-layout-node` /
 * `orphan-layout-edge-hint` for entries *within* the matched file that pin a
 * resource slug or connection key the topology no longer authors. Mirrors
 * `@workspec/c4-model`'s `findOrphanLayoutFiles` + `joinLayoutToDiagram`,
 * combined into one pass since a topology tree has at most one relevant
 * layout file rather than one per diagram.
 */
export function joinLayoutToModel(
  topologySlug: string | null,
  resourceSlugs: ReadonlySet<string>,
  connectionKeys: ReadonlySet<string>,
  rawLayouts: readonly RawLayout[],
): { layout: LoadedLayoutInfo | null; diagnostics: readonly TopologyDiagnostic[] } {
  const diagnostics: TopologyDiagnostic[] = [];
  const matched = topologySlug ? rawLayouts.find((l) => l.topologySlug === topologySlug) : undefined;

  for (const layout of rawLayouts) {
    if (layout === matched) continue;
    diagnostics.push(
      makeDiagnostic(
        'warning',
        DIAGNOSTIC_CODES.orphanLayoutFile,
        `layout file has no matching topology "${layout.topologySlug}"`,
        layout.path,
      ),
    );
  }

  if (!matched) {
    return { layout: null, diagnostics };
  }

  const locate = createYamlLocator(matched.text);

  for (const nodeSlug of Object.keys(matched.data.nodes)) {
    if (!resourceSlugs.has(nodeSlug)) {
      diagnostics.push(
        makeDiagnostic(
          'warning',
          DIAGNOSTIC_CODES.orphanLayoutNode,
          `layout pins resource "${nodeSlug}", which is not a resource of topology "${matched.topologySlug}"`,
          matched.path,
          { position: locate(['nodes', nodeSlug]) },
        ),
      );
    }
  }

  for (const edgeKey of Object.keys(matched.data.edges ?? {})) {
    if (!connectionKeys.has(edgeKey)) {
      diagnostics.push(
        makeDiagnostic(
          'warning',
          DIAGNOSTIC_CODES.orphanLayoutEdgeHint,
          `layout routing hint "${edgeKey}" matches no connection of topology "${matched.topologySlug}"`,
          matched.path,
          { position: locate(['edges', edgeKey]) },
        ),
      );
    }
  }

  return { layout: { path: matched.path, data: matched.data }, diagnostics };
}
