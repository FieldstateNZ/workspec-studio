import type { ResolvedTopology } from '@workspec/topology-model';
import type { DerivedTopology } from '../model/derived-topology.types.js';
import type { Drift } from '../model/drift.types.js';
import { matchResources } from '../match/match-resources.js';
import { diffConfig } from './diff-config.js';
import { diffCost } from './diff-cost.js';
import { diffConnections } from './diff-connections.js';
import { sortDrifts } from './sort-drifts.js';

/**
 * Reconciles an authored `ResolvedTopology` (one environment, already run
 * through `@workspec/topology-model`'s `resolve()`) against a
 * `DerivedTopology` describing that same environment's actual deployed
 * state — THE NORMATIVE CONTRACT (spec §4). Pure and deterministic:
 * identical input always yields an identical, identically-ordered `Drift[]`.
 *
 * Runs, in order:
 * 1. Match every actual resource to at most one authored resource
 *    (`matchResources` — spec §4's normative matcher).
 * 2. Every authored resource nothing matched is `phantom`; every actual
 *    resource nothing matched is `orphan`.
 * 3. Every matched pair is diffed for resolved `config`/`cost` differences
 *    (`divergent`).
 * 4. The matched node set's authored and actual connections are diffed for
 *    wiring differences (`miswired`) — UNLESS `actual.connections` is
 *    `undefined` (connectivity never observed for this environment), in
 *    which case this step is skipped entirely and contributes zero drifts;
 *    see `DerivedTopology.connections`'s doc comment.
 *
 * `envSlug` is carried through only for the human `message` text — both
 * `authored` and `actual` are already scoped to one environment by the
 * caller, so this function never uses it to filter or select anything.
 */
export function reconcile(
  authored: ResolvedTopology,
  actual: DerivedTopology,
  envSlug: string,
): readonly Drift[] {
  const { matches, unmatchedAuthored, unmatchedActual } = matchResources(
    authored.resources,
    actual.resources,
  );

  const authoredBySlug = new Map(authored.resources.map((resource) => [resource.slug, resource]));
  const actualBySlug = new Map(actual.resources.map((resource) => [resource.slug, resource]));

  const phantoms: Drift[] = unmatchedAuthored.map((slug) => ({
    class: 'phantom',
    slug,
    message: `"${slug}" is declared in the authored topology for "${envSlug}" but has no counterpart in the deployed state.`,
  }));

  const orphans: Drift[] = unmatchedActual.map((slug) => ({
    class: 'orphan',
    slug,
    message: `"${slug}" exists in the deployed state for "${envSlug}" but is declared nowhere in the authored topology.`,
  }));

  const divergents: Drift[] = matches.flatMap((match) => {
    const authoredResource = authoredBySlug.get(match.authoredSlug);
    const actualResource = actualBySlug.get(match.actualSlug);
    if (!authoredResource || !actualResource) return [];

    const configDiff = diffConfig(authoredResource.config, actualResource.config);
    const costDiff = diffCost(authoredResource.cost, actualResource.cost);
    if (configDiff.length === 0 && costDiff.length === 0) return [];

    const keys = [
      ...configDiff.map((d) => `config.${d.key}`),
      ...costDiff.map((d) => `cost.${d.key}`),
    ];
    return [
      {
        class: 'divergent' as const,
        authoredSlug: match.authoredSlug,
        actualSlug: match.actualSlug,
        message: `"${match.authoredSlug}" differs from its deployed counterpart in ${envSlug}: ${keys.join(', ')}.`,
        configDiff,
        costDiff,
      },
    ];
  });

  const miswired = diffConnections(authored.connections, actual.connections, matches);

  return sortDrifts([...phantoms, ...orphans, ...divergents, ...miswired]);
}
