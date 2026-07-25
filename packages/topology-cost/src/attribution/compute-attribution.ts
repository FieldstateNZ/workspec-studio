import type { ResolvedTopology } from '@workspec/topology-model';
import type { ContainerCost, ContainerCostContribution } from '../model/container-cost.types.js';
import type { CostDiagnostic } from '../model/diagnostic.types.js';
import type { NodeCost } from '../model/node-cost.types.js';
import type { UnattributedCost, UnattributedCostEntry } from '../model/unattributed-cost.types.js';
import { addContainerContribution } from './add-container-contribution.js';

/** Floating-point tolerance for the "do attribution shares sum to 1" check. */
const SHARE_SUM_EPSILON = 1e-6;

/** The result of attributing every priced resource's cost to c4 containers (or the unattributed bucket). */
export interface AttributionResult {
  readonly byContainer: Readonly<Record<string, ContainerCost>>;
  readonly unattributed: UnattributedCost;
  readonly diagnostics: readonly CostDiagnostic[];
}

/**
 * Attributes each priced resource's monthly cost to the c4 containers it
 * realizes (spec §5), in resolved-topology resource order:
 *
 * - `cost.attribution` present → split by those authored shares exactly.
 *   Shares that don't sum to ~1 are NOT silently renormalized — applied as
 *   authored, flagged via a `bad-attribution-shares` diagnostic so an
 *   author error stays visible instead of being quietly corrected.
 * - No `attribution` but non-empty `realizes` → an even split across the
 *   realized containers, each contribution marked `unattributedByDefault`
 *   (the design's "unattributed-by-default" must stay visible, never a
 *   silent default indistinguishable from a deliberate split).
 * - Neither → the resource's full cost falls into the `unattributed` bucket,
 *   explicit and surfaced rather than dropped.
 */
export function computeAttribution(
  resolved: ResolvedTopology,
  nodes: readonly NodeCost[],
): AttributionResult {
  const monthlyBySlug = new Map(nodes.map((node) => [node.slug, node.monthly]));
  const byContainer = new Map<string, ContainerCost>();
  const unattributedEntries: UnattributedCostEntry[] = [];
  const diagnostics: CostDiagnostic[] = [];

  for (const resource of resolved.resources) {
    const monthly = monthlyBySlug.get(resource.slug);
    if (monthly === undefined) continue; // no cost binding — nothing to attribute

    const attribution = resource.cost?.attribution;
    if (attribution !== undefined && attribution.length > 0) {
      const sum = attribution.reduce((total, entry) => total + entry.share, 0);
      if (Math.abs(sum - 1) > SHARE_SUM_EPSILON) {
        diagnostics.push({
          code: 'bad-attribution-shares',
          resourceSlug: resource.slug,
          sum,
          message: `resource "${resource.slug}" attribution shares sum to ${sum}, not 1; applied as authored, not renormalized`,
        });
      }
      for (const entry of attribution) {
        const contribution: ContainerCostContribution = {
          resourceSlug: resource.slug,
          share: entry.share,
          monthly: monthly * entry.share,
          unattributedByDefault: false,
        };
        addContainerContribution(byContainer, entry.container, contribution);
      }
      continue;
    }

    if (resource.realizes.length > 0) {
      const share = 1 / resource.realizes.length;
      for (const container of resource.realizes) {
        const contribution: ContainerCostContribution = {
          resourceSlug: resource.slug,
          share,
          monthly: monthly * share,
          unattributedByDefault: true,
        };
        addContainerContribution(byContainer, container, contribution);
      }
      continue;
    }

    unattributedEntries.push({ resourceSlug: resource.slug, monthly, reason: 'no-realizes' });
  }

  const unattributed: UnattributedCost = {
    monthly: unattributedEntries.reduce((total, entry) => total + entry.monthly, 0),
    entries: unattributedEntries,
  };

  return { byContainer: Object.fromEntries(byContainer), unattributed, diagnostics };
}
