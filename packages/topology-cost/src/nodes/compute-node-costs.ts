import { lineEnvCost } from '@workspec/decision-engine';
import type { Catalog } from '@workspec/decision-schema';
import type { ResolvedTopology } from '@workspec/topology-model';
import type { CatalogIndex } from '../catalog/catalog-index.js';
import { resourceCostToLine } from '../mapping/resource-cost-to-line.js';
import type { CostDiagnostic } from '../model/diagnostic.types.js';
import type { NodeCost } from '../model/node-cost.types.js';

/** The priced nodes plus any dangling-catalog-ref diagnostics found along the way. */
export interface NodeCostsResult {
  readonly nodes: readonly NodeCost[];
  readonly diagnostics: readonly CostDiagnostic[];
}

/**
 * Prices every resource carrying a `cost` binding via the decision-engine
 * kernel (`lineEnvCost`), and flags any dangling catalog reference the pure
 * cost formula would otherwise absorb silently: an unknown sku prices as 0;
 * an unknown mode/schedule silently falls back to PAYG / 24×7 (see
 * `lineEnvCost`'s doc comment in `@workspec/decision-engine`). Resources with
 * no `cost` binding are omitted from `nodes` entirely.
 */
export function computeNodeCosts(
  resolved: ResolvedTopology,
  catalog: Catalog,
  index: CatalogIndex,
): NodeCostsResult {
  const nodes: NodeCost[] = [];
  const diagnostics: CostDiagnostic[] = [];

  for (const resource of resolved.resources) {
    const line = resourceCostToLine(resource, resolved.envSlug);
    if (line === null) continue;

    if (!index.skus.has(line.sku)) {
      diagnostics.push({
        code: 'missing-sku',
        resourceSlug: resource.slug,
        ref: line.sku,
        message: `resource "${resource.slug}" prices against unknown sku "${line.sku}" (not in catalog.spec.skus); costs as 0`,
      });
    }

    const mode = index.modes.get(line.mode);
    if (mode === undefined) {
      diagnostics.push({
        code: 'missing-mode',
        resourceSlug: resource.slug,
        ref: line.mode,
        message: `resource "${resource.slug}" prices against unknown pricing mode "${line.mode}" (not in catalog.spec.pricingModes); defaults to PAYG`,
      });
    }

    if (!index.schedules.has(line.schedule)) {
      diagnostics.push({
        code: 'missing-schedule',
        resourceSlug: resource.slug,
        ref: line.schedule,
        message: `resource "${resource.slug}" prices against unknown schedule "${line.schedule}" (not in catalog.spec.schedules); defaults to 24×7`,
      });
    }

    nodes.push({
      slug: resource.slug,
      monthly: lineEnvCost(line, resolved.envSlug, catalog),
      mode: line.mode,
      sku: line.sku,
      committed: mode?.committed ?? false,
    });
  }

  return { nodes, diagnostics };
}
