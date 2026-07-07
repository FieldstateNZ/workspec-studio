import type { Diagram, FatDiagramNode, ThinDiagramNode } from '@workspec/c4-schema';
import { classifyThinNode } from '../resolution/classify-thin-node.js';

function isFatDiagramNode(node: ThinDiagramNode | FatDiagramNode): node is FatDiagramNode {
  return 'id' in node;
}

/**
 * Every reference string a diagram's own YAML authored, verbatim: each
 * node's bare/typed slug (or fat `id`), and each edge's raw `from`/`to` —
 * `__system__` included exactly as written, never substituted for the
 * system's real slug.
 *
 * This is what `.layout/` orphan checks compare against, not the
 * *resolved* node ids: a `.layout/` file pins coordinates against the
 * identifiers a human or tool wrote in the diagram YAML (e.g. the literal
 * `__system__` token the representative fixture's layout uses), not
 * against this package's internal post-injection node id — see the S3
 * report's design-decisions section for the full rationale.
 */
export function authoredNodeRefs(diagram: Diagram): readonly string[] {
  return diagram.nodes.map((node) => (isFatDiagramNode(node) ? node.id : classifyThinNode(node).slug));
}

/** Every edge's raw `from`/`to`, as `"<from>-><to>"` — the same key format `.layout/` edge hints use. */
export function authoredEdgeKeys(diagram: Diagram): readonly string[] {
  return diagram.edges.map((edge) => `${edge.from}->${edge.to}`);
}

/**
 * Every identifier a `.layout/` file may reasonably pin a *node* position
 * under: {@link authoredNodeRefs} plus every edge endpoint. Widened past
 * `authoredNodeRefs` alone because `__system__` commonly appears only in
 * edges (`to: __system__`) with no corresponding node entry — the
 * representative fixture's own `.layout/system-context.yaml` pins
 * `__system__`'s position exactly this way. A position for anything the
 * diagram's own YAML names anywhere isn't rename-drift; only a pinned ref
 * matching *nothing* the diagram mentions is.
 */
export function authoredLayoutableRefs(diagram: Diagram): readonly string[] {
  return [...authoredNodeRefs(diagram), ...diagram.edges.flatMap((edge) => [edge.from, edge.to])];
}
