import type { Connection } from '@workspec/topology-schema';

/**
 * Step 2 of the `resolve()` contract (spec §3.3): drops a connection if
 * EITHER its own `environments` is present and excludes `envSlug` (explicit
 * scoping — this is what lets a connection be *rewired* per environment,
 * e.g. the web-app fixture's `client -> app-service` connection that only
 * exists in `dev`/`test`), OR its `from`/`to` was pruned in step 1
 * (auto-prune — a connection can't survive naming a resource that no longer
 * exists in this environment, even if the connection itself carries no
 * `environments` field of its own). Both rules apply independently; either
 * one is sufficient to drop a connection.
 */
export function pruneConnections(
  connections: readonly Connection[],
  survivingResourceSlugs: ReadonlySet<string>,
  envSlug: string,
): readonly Connection[] {
  return connections.filter((connection) => {
    const explicitlyExcluded =
      connection.environments !== undefined && !connection.environments.includes(envSlug);
    const autoPruned =
      !survivingResourceSlugs.has(connection.from) || !survivingResourceSlugs.has(connection.to);
    return !explicitlyExcluded && !autoPruned;
  });
}
