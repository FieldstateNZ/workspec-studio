import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { ResolvedDiagram } from '../model/diagram-resolution.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import { createYamlLocator } from '../diagnostics/yaml-locator.js';
import type { RawLayout } from '../loading/load-layouts-raw.js';
import { authoredEdgeKeys, authoredLayoutableRefs } from './authored-diagram-refs.js';

/**
 * Attaches a matched `.layout/` file to its diagram, flagging rename-drift:
 * a pinned node slug or edge-hint key that no longer matches anything the
 * diagram's own YAML authored (the element or edge it was pinning was
 * renamed or removed out from under it). Orphan diagnostics carry the
 * offending pinned entry's line inside the `.layout/` file.
 */
export function joinLayoutToDiagram(
  diagram: ResolvedDiagram,
  rawLayout: RawLayout | null,
): { diagram: ResolvedDiagram; diagnostics: readonly C4Diagnostic[] } {
  if (!rawLayout) {
    return { diagram, diagnostics: [] };
  }

  const diagnostics: C4Diagnostic[] = [];
  const locate = createYamlLocator(rawLayout.text);
  const validNodeRefs = new Set(authoredLayoutableRefs(diagram.raw));
  const validEdgeKeys = new Set(authoredEdgeKeys(diagram.raw));

  for (const nodeRef of Object.keys(rawLayout.data.nodes)) {
    if (!validNodeRefs.has(nodeRef)) {
      diagnostics.push(
        makeDiagnostic(
          'warning',
          DIAGNOSTIC_CODES.orphanLayoutNode,
          `layout pins node "${nodeRef}", which is not a node of diagram "${diagram.slug}"`,
          rawLayout.path,
          { position: locate(['nodes', nodeRef]) },
        ),
      );
    }
  }

  for (const edgeKey of Object.keys(rawLayout.data.edges ?? {})) {
    if (!validEdgeKeys.has(edgeKey)) {
      diagnostics.push(
        makeDiagnostic(
          'warning',
          DIAGNOSTIC_CODES.orphanLayoutEdgeHint,
          `layout routing hint "${edgeKey}" matches no edge of diagram "${diagram.slug}"`,
          rawLayout.path,
          { position: locate(['edges', edgeKey]) },
        ),
      );
    }
  }

  return {
    diagram: { ...diagram, layout: { path: rawLayout.path, data: rawLayout.data } },
    diagnostics,
  };
}
