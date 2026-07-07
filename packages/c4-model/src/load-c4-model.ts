import type { C4Model } from './model/c4-model.types.js';
import type { C4Diagnostic } from './model/diagnostic.types.js';
import type { C4FileSource } from './ports/c4-file-source.js';
import { checkDanglingLinks } from './links/check-dangling-links.js';
import { detectLinkCycles } from './links/detect-link-cycles.js';
import { findOrphanLayoutFiles } from './layout-join/find-orphan-layout-files.js';
import { joinLayoutToDiagram } from './layout-join/join-layout-to-diagram.js';
import { loadDiagramsRaw } from './loading/load-diagrams-raw.js';
import { loadElements } from './loading/load-elements.js';
import { loadLayoutsRaw } from './loading/load-layouts-raw.js';
import { loadSpec } from './loading/load-spec.js';
import { buildElementBearerIndex } from './resolution/element-bearer-index.js';
import { resolveDiagram } from './resolution/resolve-diagram.js';

/**
 * Loads a full `C4Model` from any {@link C4FileSource}: discovers every
 * element/diagram/layout file, parses and validates each one, resolves
 * every diagram's node/edge references against the tree, joins `.layout/`
 * files, and checks `links` cross-references for dangling targets and
 * cycles. The `__system__` alias, `PREFERRED_TYPE_BY_DIAGRAM`
 * disambiguation, and the c4-context safety net mirror Enterprise's
 * `get-diagram.ts`; c4-container *per-lens* disambiguation and dual-view
 * output are a deliberate S3 enhancement beyond Enterprise's single
 * combined preference list — see `resolution/preferred-type.ts`.
 *
 * Never throws: every failure mode becomes an entry in the returned
 * model's `diagnostics` array instead, and the model is always
 * data-complete alongside them — an empty tree, a tree with only a
 * `spec.yaml`, and a tree full of dangling refs all resolve successfully.
 */
export async function loadC4Model(source: C4FileSource): Promise<C4Model> {
  const diagnostics: C4Diagnostic[] = [];

  const elements = await loadElements(source);
  diagnostics.push(...elements.diagnostics);

  const { spec, diagnostics: specDiagnostics } = await loadSpec(source);
  diagnostics.push(...specDiagnostics);

  const { diagrams: rawDiagrams, diagnostics: diagramParseDiagnostics } = await loadDiagramsRaw(source);
  diagnostics.push(...diagramParseDiagnostics);

  const { layouts: rawLayouts, diagnostics: layoutParseDiagnostics } = await loadLayoutsRaw(source);
  diagnostics.push(...layoutParseDiagnostics);

  const bearers = buildElementBearerIndex(elements);
  // The tree has no DB-backed "active project" concept to pick a system
  // from when more than one `system/*.yaml` file exists (a convention
  // violation, not something this package's schemas forbid) — the first
  // slug in sorted order is the deterministic fallback.
  const systemSlug = Array.from(elements.byKind.system.keys()).sort()[0] ?? null;
  const knownSpecCategories = new Set(Object.keys(spec.data.connections));
  const reportedDuplicates = new Set<string>();

  const resolvedDiagrams = rawDiagrams.map((raw) => {
    const { diagram, diagnostics: diagramDiagnostics } = resolveDiagram(
      raw,
      bearers,
      systemSlug,
      knownSpecCategories,
      reportedDuplicates,
    );
    diagnostics.push(...diagramDiagnostics);
    return diagram;
  });

  const layoutsBySlug = new Map(rawLayouts.map((layout) => [layout.diagramSlug, layout]));
  const diagramsWithLayout = resolvedDiagrams.map((diagram) => {
    const { diagram: joined, diagnostics: joinDiagnostics } = joinLayoutToDiagram(
      diagram,
      layoutsBySlug.get(diagram.slug) ?? null,
    );
    diagnostics.push(...joinDiagnostics);
    return joined;
  });

  const diagramSlugs = new Set(rawDiagrams.map((d) => d.slug));
  diagnostics.push(...findOrphanLayoutFiles(rawLayouts, diagramSlugs));
  diagnostics.push(...(await checkDanglingLinks(source, elements)));
  diagnostics.push(...detectLinkCycles(elements));

  return {
    elements: elements.byKind,
    diagrams: diagramsWithLayout,
    spec,
    diagnostics,
  };
}
