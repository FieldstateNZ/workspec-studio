import type { ContainerCost, ContainerCostContribution } from '../model/container-cost.types.js';

/**
 * Merges one {@link ContainerCostContribution} into a `container -> ContainerCost`
 * accumulator map, in place. Two resources naming the same container (via
 * either explicit `attribution` or the `realizes` even-split) merge into one
 * running total; `unattributedByDefault` becomes `true` for the container as
 * a whole as soon as ANY contribution to it came from the default split.
 *
 * Mutates `byContainer` — callers own the map's lifetime (see
 * `computeAttribution`, which creates one per call and reads it out via
 * `Object.fromEntries` when done). Kept as a standalone function rather than
 * inlined so the merge rule has one, unit-testable home.
 */
export function addContainerContribution(
  byContainer: Map<string, ContainerCost>,
  container: string,
  contribution: ContainerCostContribution,
): void {
  const existing = byContainer.get(container);
  if (existing === undefined) {
    byContainer.set(container, {
      container,
      monthly: contribution.monthly,
      unattributedByDefault: contribution.unattributedByDefault,
      contributions: [contribution],
    });
    return;
  }

  byContainer.set(container, {
    container,
    monthly: existing.monthly + contribution.monthly,
    unattributedByDefault: existing.unattributedByDefault || contribution.unattributedByDefault,
    contributions: [...existing.contributions, contribution],
  });
}
