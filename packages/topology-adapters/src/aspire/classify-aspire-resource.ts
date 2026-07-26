import type { ResourceKindType as ResourceKind } from '@workspec/topology-schema';
import { VENDOR_KIND_CATALOG } from '../vendor-kind-catalog.js';
import type { VendorKindKey } from '../vendor-kind-catalog.js';

/**
 * Outcome of classifying one Aspire graph resource into a topology
 * `Resource`'s `{kind, type, provider}` triple:
 *
 * - `'skip'` — a `kind: "parameter"` node. Not infrastructure (a build-time
 *   config value), and never a valid connection endpoint — silent, since
 *   this is the expected, correct outcome for every parameter, not an
 *   anomaly worth a diagnostic.
 * - `'unmapped'` — a vendor/product this adapter has no `ResourceKind` for
 *   yet: a message-queue/broker product (`RESOURCE_KINDS` has no `queue`
 *   member in v0), or a `kind: "azure"` resource outside the small curated
 *   list below. The caller emits the standard unmapped-type diagnostic and
 *   skips the resource — the same "skip + diagnostic, not a best-effort
 *   guess" policy `terraform`/`bicep`/`azure-resource-graph` already follow
 *   (see the package README).
 * - `{outcome: 'mapped', ...}` — a resolved `{kind, type, provider}` triple.
 */
export type AspireClassification =
  | { readonly outcome: 'skip' }
  | { readonly outcome: 'unmapped' }
  | {
      readonly outcome: 'mapped';
      readonly kind: ResourceKind;
      readonly type: string;
      readonly provider: string;
    };

/**
 * `typeName` prefixes (matched case-insensitively against the start of the
 * CLR type's short name) for Aspire's container-hosted relational-database
 * integrations, mapped to a curated, vendor-neutral display type.
 * Deliberately NOT the `'Azure <Product>'` convention `VENDOR_KIND_CATALOG`
 * uses: these resources are ordinary Docker containers running an
 * open-source database image (Aspire's `Aspire.Hosting.PostgreSQL` etc.),
 * not an Azure PaaS product — labelling one "Azure SQL Database" would be
 * actively wrong. Extend this table as new Aspire database integrations
 * appear; it is the only place this classification lives.
 */
const ASPIRE_DATABASE_TYPE_NAME_PREFIXES: Readonly<Record<string, string>> = {
  postgres: 'PostgreSQL',
  mysql: 'MySQL',
  sqlserver: 'SQL Server',
  mongo: 'MongoDB',
  oracle: 'Oracle Database',
};

/**
 * Same rationale as the database table above, for Aspire's cache-shaped
 * container integrations. Kept as its OWN table (not folded into the
 * database one) because `@workspec/topology-schema`'s `ResourceKind` has a
 * dedicated `cache` member — unlike `workspec-c4 import-aspire`'s coarser
 * four-bucket scheme, which lumps these into "database" for lack of a
 * better bucket (see `docs/aspire-hosting/import-mapping.md`). Topology's
 * richer kind enum lets this adapter be more precise.
 */
const ASPIRE_CACHE_TYPE_NAME_PREFIXES: Readonly<Record<string, string>> = {
  redis: 'Redis',
  valkey: 'Valkey',
  garnet: 'Garnet',
};

/**
 * `typeName` prefixes for NON-Azure message-queue/broker products (RabbitMQ,
 * Kafka, NATS — the container-hosted integrations, same family as the
 * database/cache tables above). `RESOURCE_KINDS` (v0) has no
 * `queue`/`messaging` member, and adding one is a `@workspec/topology-schema`
 * change — explicitly out of scope for this slice (S2a). Rather than force
 * these into a semantically-wrong kind (`compute` would understate that
 * this is a data-plane broker, not a generic workload), they are UNMAPPED:
 * skipped with a warning diagnostic, same as any other unmapped vendor
 * type. Documented here as a known v0 gap — a future topology-schema slice
 * that adds a `queue` kind should turn this list into a real mapping table
 * (mirroring `ASPIRE_DATABASE_TYPE_NAME_PREFIXES` above).
 *
 * Azure's own messaging products (Service Bus, Event Hubs) are deliberately
 * NOT listed here: they are `kind: "azure"`, so `classifyAspireResource`
 * resolves (or fails to resolve) them via `AZURE_TYPE_NAME_PREFIX_TO_CATALOG_KEY`
 * below, which runs first — a prefix entered here would be unreachable dead
 * code. They land `'unmapped'` today simply because that table has no entry
 * for them either (same queue-kind gap, reached via a different branch); a
 * future `queue`-kind slice should extend BOTH tables, not just this one.
 */
const ASPIRE_QUEUE_TYPE_NAME_PREFIXES: readonly string[] = ['rabbitmq', 'kafka', 'nats'];

/**
 * `typeName` prefixes for `kind: "azure"` resources this adapter recognizes
 * as an unambiguous match for an existing `VENDOR_KIND_CATALOG` entry —
 * reused verbatim (`type` string AND `provider: 'azure'`) since these
 * really are the same Azure product the terraform/bicep/azure-resource-graph
 * adapters describe. This is a deliberate, useful side effect: an apphost's
 * `AddAzureStorage` reference and a deployed Bicep template can now resolve
 * to the SAME derived resource under recon's `(kind, type, name)` tuple
 * match, if their names line up.
 *
 * Deliberately small and non-exhaustive, unlike the database/cache tables
 * above: an arbitrary, unrecognized Azure resource type could be almost
 * anything (Key Vault, Cosmos DB, a Static Web App, …), so there is no safe
 * universal fallback the way `compute` is for a generic Aspire
 * container/executable/project (see `classifyAspireResource`'s doc
 * comment). Anything not listed here is `'unmapped'`, never guessed. Azure's
 * own messaging products (Service Bus, Event Hubs) are deliberately absent
 * for the same "no `queue` `ResourceKind` yet" reason `ASPIRE_QUEUE_TYPE_NAME_PREFIXES`
 * documents — they fall through to `'unmapped'` here, not to `compute`.
 *
 * **`azuresql*` is split, not collapsed**: the real
 * `Aspire.Hosting.Azure.Sql` package emits TWO distinct resource types for
 * the standard `AddAzureSqlServer().AddDatabase()` pattern —
 * `AzureSqlServerResource` (the logical server — a management/connectivity
 * shell, not a priced, queryable database) and `AzureSqlDatabaseResource`
 * (the actual database). Only `azuresqldatabase` maps to the `sqlDatabase`
 * catalog entry (`"Azure SQL Database"`); a bare `azuresql` or
 * `azuresqlserver` typeName is deliberately ABSENT from this table (falls
 * through to `'unmapped'`) rather than reusing the same catalog entry for
 * both — mislabelling the server "Azure SQL Database" would be exactly the
 * kind of wrong-but-plausible guess this adapter otherwise refuses to make.
 * This mirrors `terraform-type-map.ts`/`arm-type-map.ts`, neither of which
 * maps a bare SQL *server* type — only `.../databases`.
 */
const AZURE_TYPE_NAME_PREFIX_TO_CATALOG_KEY: Readonly<Record<string, VendorKindKey>> = {
  azurestorage: 'storage',
  azuresearch: 'search',
  azuresqldatabase: 'sqlDatabase',
  azureapplicationinsights: 'appInsights',
  azureloganalytics: 'logAnalytics',
  azureuserassignedidentity: 'identity',
  // `azureredisenterprise`/`azuremanagedredis` MUST resolve before the
  // shorter `azureredis` prefix below for a typeName like
  // "AzureRedisEnterpriseResource" (which starts with BOTH `azureredis` and
  // `azureredisenterprise`) to land on the right catalog entry —
  // `matchPrefix` picks the LONGEST matching prefix specifically so this
  // table's declaration order can't silently get this wrong; see that
  // function's doc comment.
  azureredisenterprise: 'redisEnterprise',
  azuremanagedredis: 'redisEnterprise',
  azureredis: 'redisCache',
};

/**
 * Returns `table`'s value for the LONGEST key that `typeName`
 * case-insensitively starts with, or `undefined` if none match. Longest,
 * not first-declared: several tables this function serves have genuinely
 * overlapping prefixes (e.g. `"AzureRedisEnterpriseResource"` starts with
 * both `azureredis` and the more specific `azureredisenterprise`), and a
 * "first match in declaration order" rule would silently pick the wrong
 * entry if a table's keys were ever reordered — longest-match is the one
 * rule that's correct regardless of how the table is written, so callers
 * don't have to maintain a most-specific-first ordering by hand.
 */
function matchPrefix<T>(typeName: string, table: Readonly<Record<string, T>>): T | undefined {
  const lower = typeName.toLowerCase();
  let best: { readonly prefix: string; readonly value: T } | undefined;
  for (const [prefix, value] of Object.entries(table)) {
    if (lower.startsWith(prefix) && (best === undefined || prefix.length > best.prefix.length)) {
      best = { prefix, value };
    }
  }
  return best?.value;
}

function matchesAnyPrefix(typeName: string, prefixes: readonly string[]): boolean {
  const lower = typeName.toLowerCase();
  return prefixes.some((prefix) => lower.startsWith(prefix));
}

/**
 * Classifies one Aspire graph resource — see {@link AspireClassification}'s
 * doc comment for the three possible outcomes. Order of precedence (mirrors
 * `workspec-c4 import-aspire`'s own `classifyResource`, adapted to
 * `@workspec/topology-schema`'s richer — but still closed — `ResourceKind`
 * enum; see `docs/aspire-hosting/import-mapping.md` for the C4 side):
 *
 * 1. `kind: "parameter"` — always `'skip'`, regardless of `typeName`.
 * 2. `kind: "azure"` — resolved against the small curated Azure prefix
 *    table, reusing the exact `VENDOR_KIND_CATALOG` entry; anything else is
 *    `'unmapped'`. Checked before the database/cache/queue tables below
 *    (rather than after, as `workspec-c4 import-aspire` orders it) so an
 *    Azure resource is never accidentally classified by the generic
 *    non-Azure product tables — in practice this can't happen anyway, since
 *    every `kind: "azure"` `typeName` starts with `"Azure"` by the graph
 *    producer's own heuristic (`docs/aspire-hosting/graph-contract.md`),
 *    but checking `azure` first removes the need to rely on that as an
 *    invariant. Notably, `AzureSqlServerResource` (the bare server) is
 *    `'unmapped'` here — only `AzureSqlDatabaseResource` maps to
 *    `sqlDatabase` — see `AZURE_TYPE_NAME_PREFIX_TO_CATALOG_KEY`'s doc
 *    comment for why conflating the two would be a real mislabelling, not a
 *    theoretical one.
 * 3. `typeName` matches a database-product prefix — `database`.
 * 4. `typeName` matches a cache-product prefix — `cache`.
 * 5. `typeName` matches a queue/broker-product prefix — `'unmapped'` (no
 *    `queue` `ResourceKind` exists yet; see that prefix table's doc
 *    comment).
 * 6. Anything else — `container` / `executable` / `project` / `unknown`, or
 *    a future additive `kind` value this adapter doesn't specifically
 *    recognize — falls back to generic `compute`, with `type` set to the
 *    raw `typeName` (preserves identity; no humanization heuristic that
 *    could itself drift). This is the universally-safe default per the
 *    graph contract's "nothing is silently dropped except `parameter`"
 *    philosophy: every one of these `kind`s describes something that
 *    genuinely runs as a process/container, so `compute` is never wrong the
 *    way guessing a specific Azure product would be.
 */
export function classifyAspireResource(kind: string, typeName: string): AspireClassification {
  if (kind === 'parameter') return { outcome: 'skip' };

  if (kind === 'azure') {
    const catalogKey = matchPrefix(typeName, AZURE_TYPE_NAME_PREFIX_TO_CATALOG_KEY);
    if (!catalogKey) return { outcome: 'unmapped' };
    const entry = VENDOR_KIND_CATALOG[catalogKey];
    return { outcome: 'mapped', kind: entry.kind, type: entry.type, provider: 'azure' };
  }

  const databaseType = matchPrefix(typeName, ASPIRE_DATABASE_TYPE_NAME_PREFIXES);
  if (databaseType) {
    return { outcome: 'mapped', kind: 'database', type: databaseType, provider: 'aspire' };
  }

  const cacheType = matchPrefix(typeName, ASPIRE_CACHE_TYPE_NAME_PREFIXES);
  if (cacheType) {
    return { outcome: 'mapped', kind: 'cache', type: cacheType, provider: 'aspire' };
  }

  if (matchesAnyPrefix(typeName, ASPIRE_QUEUE_TYPE_NAME_PREFIXES)) {
    return { outcome: 'unmapped' };
  }

  return { outcome: 'mapped', kind: 'compute', type: typeName, provider: 'aspire' };
}
