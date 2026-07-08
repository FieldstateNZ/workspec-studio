import type { FatDiagramNode, ThinDiagramNode } from '@workspec/c4-schema';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { ResolvedDiagram, ResolvedDiagramView } from '../model/diagram-resolution.types.js';
import { dedupeDiagnostics } from '../diagnostics/dedupe-diagnostics.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import { createYamlLocator } from '../diagnostics/yaml-locator.js';
import type { YamlLocator } from '../diagnostics/yaml-locator.js';
import type { RawDiagram } from '../loading/load-diagrams-raw.js';
import { detectSystemFor } from './detect-system-for.js';
import { usesSystemAlias } from './detect-system-alias-usage.js';
import type { ElementBearerIndex } from './element-bearer-index.js';
import { injectSystemNodeIfMissing } from './inject-system-node.js';
import { isSystemAlias } from './system-alias.js';
import { preferredOrderFor } from './preferred-type.js';
import { resolveDiagramEdges } from './resolve-diagram-edges.js';
import type { IndexedDiagramEdge } from './resolve-diagram-edges.js';
import { resolveDiagramNodes } from './resolve-diagram-nodes.js';

type ContainerLens = 'logical' | 'deployment';

function edgesForLens(edges: readonly IndexedDiagramEdge[], lens: ContainerLens): readonly IndexedDiagramEdge[] {
  return edges.filter(({ edge }) => edge.lens === undefined || edge.lens === 'both' || edge.lens === lens);
}

function resolveOneView(
  nodes: readonly (ThinDiagramNode | FatDiagramNode)[],
  edges: readonly IndexedDiagramEdge[],
  diagramType: string,
  lens: ContainerLens | null,
  bearers: ElementBearerIndex,
  systemSlug: string | null,
  knownSpecCategories: ReadonlySet<string>,
  diagramPath: string,
  reportedDuplicates: Set<string>,
  locate: YamlLocator,
): { view: ResolvedDiagramView; diagnostics: readonly C4Diagnostic[] } {
  const diagnostics: C4Diagnostic[] = [];
  const preferredOrder = preferredOrderFor(diagramType, lens);

  const nodesResult = resolveDiagramNodes(
    nodes,
    bearers,
    preferredOrder,
    systemSlug,
    diagramPath,
    reportedDuplicates,
    locate,
  );
  diagnostics.push(...nodesResult.diagnostics);

  const system = detectSystemFor(bearers, systemSlug);
  const edgesReferenceSystem = edges.some(
    ({ edge }) => isSystemAlias(edge.from) || isSystemAlias(edge.to),
  );
  const resolvedNodes = injectSystemNodeIfMissing(diagramType, nodesResult.resolved, edgesReferenceSystem, system);

  const edgesResult = resolveDiagramEdges(
    edges,
    resolvedNodes,
    systemSlug,
    knownSpecCategories,
    diagramPath,
    locate,
  );
  diagnostics.push(...edgesResult.diagnostics);

  return { view: { nodes: resolvedNodes, edges: edgesResult.resolved }, diagnostics };
}

/**
 * Resolves one diagram end to end: the `no-system` check, node/edge
 * resolution (lens-partitioned twice for `c4-container`, once otherwise),
 * and system injection (the c4-context safety net plus edge-only
 * `__system__` materialization for every diagram type). `.layout/` joining
 * happens in a later pipeline stage — this only produces `view`/`lensViews`.
 */
export function resolveDiagram(
  raw: RawDiagram,
  bearers: ElementBearerIndex,
  systemSlug: string | null,
  knownSpecCategories: ReadonlySet<string>,
  reportedDuplicates: Set<string>,
): { diagram: ResolvedDiagram; diagnostics: readonly C4Diagnostic[] } {
  const { data } = raw;
  const diagnostics: C4Diagnostic[] = [];
  const locate = createYamlLocator(raw.text);
  const indexedEdges: readonly IndexedDiagramEdge[] = data.edges.map((edge, index) => ({ edge, index }));

  if (systemSlug === null && usesSystemAlias(data.nodes, data.edges)) {
    diagnostics.push(
      makeDiagnostic(
        'error',
        DIAGNOSTIC_CODES.noSystem,
        'diagram uses the __system__ alias, but the tree has no system/*.yaml file',
        raw.path,
      ),
    );
  }

  const isContainer = data.type === 'c4-container';

  if (isContainer) {
    const logical = resolveOneView(
      data.nodes,
      edgesForLens(indexedEdges, 'logical'),
      data.type,
      'logical',
      bearers,
      systemSlug,
      knownSpecCategories,
      raw.path,
      reportedDuplicates,
      locate,
    );
    const deployment = resolveOneView(
      data.nodes,
      edgesForLens(indexedEdges, 'deployment'),
      data.type,
      'deployment',
      bearers,
      systemSlug,
      knownSpecCategories,
      raw.path,
      reportedDuplicates,
      locate,
    );
    // Typed-ref dangling-ness (and a `lens: both` edge's dangling-edge-ref/
    // unknown-category) is lens-independent, so the same finding surfaces
    // from both passes above — dedupe before merging into the diagram's
    // diagnostics (`duplicate-slug` is already deduped upstream via the
    // shared `reportedDuplicates` set, so this mainly matters for the rest).
    diagnostics.push(...dedupeDiagnostics([...logical.diagnostics, ...deployment.diagnostics]));

    return {
      diagram: {
        slug: raw.slug,
        path: raw.path,
        title: data.title,
        type: data.type,
        description: data.description ?? null,
        raw: data,
        view: null,
        lensViews: { logical: logical.view, deployment: deployment.view },
        layout: null,
      },
      diagnostics,
    };
  }

  const single = resolveOneView(
    data.nodes,
    indexedEdges,
    data.type,
    null,
    bearers,
    systemSlug,
    knownSpecCategories,
    raw.path,
    reportedDuplicates,
    locate,
  );
  diagnostics.push(...single.diagnostics);

  return {
    diagram: {
      slug: raw.slug,
      path: raw.path,
      title: data.title,
      type: data.type,
      description: data.description ?? null,
      raw: data,
      view: single.view,
      lensViews: null,
      layout: null,
    },
    diagnostics,
  };
}
