import type { Resource } from '@workspec/topology-schema';
import { toSlug } from './slug.js';
import type { Diagnostic } from './types.js';

/** Result of a single import's slug-disambiguation pass. */
export interface DisambiguateDuplicateSlugsResult {
  readonly resources: readonly Resource[];
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Detects resources that mapped to the same `metadata.slug` within a single
 * import — e.g. two same-named resources in different resource groups both
 * `toSlug`-deriving to `"cache"` — and deterministically disambiguates every
 * duplicate past the first occurrence, so none are silently dropped when
 * written to `.workspec/resources/*.yaml` (two files can't share a
 * filename; the second write would overwrite the first).
 *
 * Every adapter runs its mapped resources through this before returning.
 * Disambiguation:
 *
 * 1. Appends the resource's `resourceGroup` (or, absent that, its
 *    `provider`) to the slug — the common case, since same-named resources
 *    usually live in different resource groups.
 * 2. Falls back to appending a numeric suffix on top of that if the
 *    discriminated slug is *itself* still a duplicate (e.g. two resources
 *    with the same name in the same resource group — a true duplicate
 *    declaration). This makes losslessness unconditional: every input
 *    resource gets a distinct output slug, no matter how degenerate the
 *    input.
 *
 * One `warning` diagnostic is emitted per distinct original slug that
 * collided (not one per resource), naming the slug and how many resources
 * produced it.
 *
 * This is deliberately silent to reconciliation: recon matches a derived
 * resource against an authored one by `source.from` first, falling back to
 * the `(kind, type, resourceGroup, name)` tuple — neither key involves
 * `metadata.slug` — so renaming a slug here never affects matching.
 */
export function disambiguateDuplicateSlugs(
  resources: readonly Resource[],
): DisambiguateDuplicateSlugsResult {
  const totalBySlug = new Map<string, number>();
  for (const resource of resources) {
    const slug = resource.metadata.slug ?? '';
    totalBySlug.set(slug, (totalBySlug.get(slug) ?? 0) + 1);
  }

  const usedSlugs = new Set<string>();
  const warnedSlugs = new Set<string>();
  const diagnostics: Diagnostic[] = [];

  const disambiguated = resources.map((resource): Resource => {
    const originalSlug = resource.metadata.slug ?? '';
    const duplicateCount = totalBySlug.get(originalSlug) ?? 0;

    let candidate = originalSlug;
    if (duplicateCount > 1) {
      if (!warnedSlugs.has(originalSlug)) {
        warnedSlugs.add(originalSlug);
        diagnostics.push({
          severity: 'warning',
          message: `Duplicate slug "${originalSlug}" produced by ${duplicateCount} resources in this import; disambiguated with a stable discriminator so none were dropped.`,
          source: originalSlug,
        });
      }
      const discriminator = resource.spec.resourceGroup ?? resource.spec.provider;
      candidate = toSlug(`${originalSlug}-${discriminator}`);
    }

    // Final safety net: guarantee global uniqueness even if the
    // resourceGroup/provider discriminator itself collides.
    let uniqueSlug = candidate;
    let suffix = 2;
    while (usedSlugs.has(uniqueSlug)) {
      uniqueSlug = toSlug(`${candidate}-${suffix}`);
      suffix += 1;
    }
    usedSlugs.add(uniqueSlug);

    return uniqueSlug === originalSlug
      ? resource
      : { ...resource, metadata: { ...resource.metadata, slug: uniqueSlug } };
  });

  return { resources: disambiguated, diagnostics };
}
