import type { FatDiagramNode, ThinDiagramNode } from '@workspec/c4-schema';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { ElementKind } from '../model/element-kind.js';
import { elementDisplayFields } from '../model/element-display.js';
import type { ResolvedDiagramNode } from '../model/diagram-resolution.types.js';
import type { YamlLocator } from '../diagnostics/yaml-locator.js';
import { classifyThinNode } from './classify-thin-node.js';
import type { ElementBearerIndex } from './element-bearer-index.js';
import { resolveNodeRef } from './resolve-node-ref.js';

function isFatDiagramNode(node: ThinDiagramNode | FatDiagramNode): node is FatDiagramNode {
  return 'id' in node;
}

/**
 * Resolves every node of one diagram (thin or fat) under one preferred-kind
 * order. Fat nodes carry their element data inline — the legacy shape has
 * no slug to look up, so they resolve unconditionally (never dangling,
 * never a `duplicate-slug` candidate). `locate` points diagnostics at the
 * offending node entry's line (`['nodes', index]` in the diagram YAML).
 */
export function resolveDiagramNodes(
  nodes: readonly (ThinDiagramNode | FatDiagramNode)[],
  bearers: ElementBearerIndex,
  preferredOrder: readonly ElementKind[],
  systemSlug: string | null,
  diagramPath: string,
  reportedDuplicates: Set<string>,
  locate: YamlLocator,
): { resolved: readonly ResolvedDiagramNode[]; diagnostics: readonly C4Diagnostic[] } {
  const resolved: ResolvedDiagramNode[] = [];
  const diagnostics: C4Diagnostic[] = [];

  nodes.forEach((node, index) => {
    if (isFatDiagramNode(node)) {
      resolved.push({
        nodeId: node.id,
        slug: null,
        kind: node.type,
        title: node.label,
        description: node.description ?? null,
        technology: null,
        tags: node.tags ?? [],
        position: null,
        injected: false,
        dangling: false,
      });
      return;
    }

    const classified = classifyThinNode(node);
    const { resolved: ref, diagnostics: refDiagnostics } = resolveNodeRef(
      classified,
      bearers,
      preferredOrder,
      systemSlug,
      diagramPath,
      reportedDuplicates,
      locate(['nodes', index]),
    );
    diagnostics.push(...refDiagnostics);

    const display = ref.element ? elementDisplayFields(ref.element) : null;
    resolved.push({
      nodeId: ref.nodeId,
      slug: ref.slug,
      kind: ref.element?.kind ?? null,
      title: display?.title ?? ref.slug ?? ref.nodeId,
      description: display?.description ?? null,
      technology: display?.technology ?? null,
      tags: display?.tags ?? [],
      position: classified.position,
      injected: false,
      dangling: ref.dangling,
    });
  });

  return { resolved, diagnostics };
}
