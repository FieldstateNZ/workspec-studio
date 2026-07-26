import type { AdapterConnection } from '../types.js';
import type { AspireResourceInput } from './aspire-resource-input.js';

/**
 * `references[].via` values treated as genuine dataflow wiring — the
 * target resource's identity was passed to the owning resource as a
 * connection string, an endpoint reference, or a bare resource value in an
 * environment variable or command-line argument (see
 * `docs/aspire-hosting/graph-contract.md`'s `references` section for how
 * each `via` is produced):
 *
 * - `connection-string` / `endpoint` / `environment` — sourced from
 *   `EnvironmentCallbackAnnotation` (`WithReference`/`WithEnvironment`).
 * - `unknown` — sourced from `CommandLineArgsCallbackAnnotation`
 *   (`WithArgs`) for a bare `IResource` argument; the contract's fallback
 *   `via` for the args case is `"unknown"` rather than `"environment"`
 *   (env and args are walked with the same recursion, differing only in
 *   this one fallback label) — structurally the args-equivalent of the
 *   `environment` case above, so it's included here too.
 *
 * DECISION (S2a build lead): `wait`-sourced references are ordering hints
 * (`WaitFor`/`WaitForStart`/`WaitForCompletion`) — sequencing, not
 * dataflow — and are excluded. `relationship`-sourced references
 * (`.WithRelationship(target, "custom-label")`) carry an arbitrary,
 * author-defined string whose semantics this adapter can't classify as
 * dataflow vs. purely informational (e.g. "monitors", "documented-by"),
 * so they're excluded too, conservatively — the same "skip rather than
 * guess" policy the vendor-kind mapping follows elsewhere in this package.
 */
const CONNECTION_VIA = new Set<string>(['connection-string', 'endpoint', 'environment', 'unknown']);

/**
 * Derives the connection graph from every resource's `references` edges,
 * using `slugByName` — an Aspire resource NAME mapped to the FINAL,
 * post-disambiguation `metadata.slug` its `Resource` actually carries (built
 * by the caller from `finalizeAdapterOutput`'s output, AFTER
 * `disambiguateDuplicateSlugs` may have renamed it). Connections must
 * reference the slug a `Resource` actually has, not the pre-collision
 * `toSlug(name)` guess.
 *
 * A reference is dropped, never fabricated, when:
 *
 * - its `via` isn't in {@link CONNECTION_VIA} (ordering/relationship edges —
 *   see that constant's doc comment for the full rationale);
 * - its source or target resource has no entry in `slugByName` — i.e. it
 *   was skipped (`kind: "parameter"`) or unmapped, so it was never emitted
 *   as a `Resource` at all. Mirrors `workspec-c4 import-aspire`'s own edge
 *   resolution rule: "both endpoints must be mapped" — an edge to a
 *   resource that doesn't exist in the output is silently dropped, never a
 *   dangling reference;
 * - it would be a self-loop (a resource referencing itself).
 *
 * Deduplicated on `(from, to)` (this adapter only ever produces `'primary'`
 * connections, so `class` adds no distinguishing information to the dedup
 * key) and sorted by `(from, to)` for deterministic, input-order-independent
 * output — the same canonical-order discipline `collectAspireResources`
 * applies to resources/slugs one level down.
 */
export function deriveAspireConnections(
  resources: readonly AspireResourceInput[],
  slugByName: ReadonlyMap<string, string>,
): readonly AdapterConnection[] {
  const seen = new Set<string>();
  const connections: AdapterConnection[] = [];

  for (const resource of resources) {
    const fromSlug = slugByName.get(resource.name);
    if (fromSlug === undefined) continue;

    for (const reference of resource.references) {
      if (!CONNECTION_VIA.has(reference.via)) continue;

      const toSlug = slugByName.get(reference.target);
      if (toSlug === undefined || toSlug === fromSlug) continue;

      const key = `${fromSlug}=>${toSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      connections.push({ from: fromSlug, to: toSlug, class: 'primary' });
    }
  }

  return connections.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}
