// Formats a `LensTreeCounts` into the header's compact summary string, e.g.
// "11 resources · 1 VNet · 1 subnet" (network lens) or "10 resources · 3
// resource groups" (resource-group lens) — the design's `counts` string,
// generalised: the design hardcoded this per its one fixture; this package
// derives it from the model's actual `containersByKind` breakdown instead,
// so it stays correct for any topology, not just the golden web-app one.

import type { GroupingKind } from '@workspec/topology-model';
import type { LensTreeCounts } from '@workspec/topology-model';

/** Compact display label for each grouping kind, matching the design's own header vocabulary ("VNet", not "Virtual network"). */
const GROUPING_LABEL: Record<GroupingKind, string> = {
  vnet: 'VNet',
  subnet: 'subnet',
  'resource-group': 'resource group',
};

/** The fixed, deterministic order grouping kinds appear in the counts string. */
const GROUPING_ORDER: readonly GroupingKind[] = ['vnet', 'subnet', 'resource-group'];

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}

/**
 * Builds the header's counts string from a lens tree's counts: the total
 * resource count, followed by a `· <count> <label>` segment for every
 * grouping kind present (in `GROUPING_ORDER`), skipping any with zero.
 */
export function formatLensCounts(counts: LensTreeCounts): string {
  const segments = [`${counts.resources} ${pluralize('resource', counts.resources)}`];

  for (const kind of GROUPING_ORDER) {
    const count = counts.containersByKind[kind] ?? 0;
    if (count > 0) {
      segments.push(`${count} ${pluralize(GROUPING_LABEL[kind], count)}`);
    }
  }

  return segments.join(' · ');
}
