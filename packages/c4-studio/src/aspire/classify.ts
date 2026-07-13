// The single source of truth for "which .workspec/ element kind does this
// Aspire resource become" — see docs/aspire-hosting/import-mapping.md for the
// normative table this function implements.

import type { AspireResource } from './graph-schema.js';

/** The four `.workspec/` element buckets an Aspire resource can land in. */
export type ElementBucket = 'container' | 'database' | 'queue' | 'external-system';

/**
 * `typeName` prefixes (matched case-insensitively against the start of the
 * CLR type's short name) classified as a database. Extend this list as new
 * Aspire database integrations are added — it is deliberately the only place
 * this classification lives.
 */
export const DATABASE_TYPE_NAME_PREFIXES: readonly string[] = [
  'postgres',
  'sqlserver',
  'mysql',
  'mongo',
  'redis',
  'oracle',
  'valkey',
  'garnet',
];

/** `typeName` prefixes classified as a queue/messaging resource. */
export const QUEUE_TYPE_NAME_PREFIXES: readonly string[] = [
  'rabbitmq',
  'kafka',
  'azureservicebus',
  'nats',
  'azureeventhubs',
];

/**
 * Classifies a `typeName` by prefix match against the database/queue lists
 * above, case-insensitively (`typeName` is a CLR type short name, e.g.
 * `"PostgresServerResource"` or `"AzureServiceBusResource"`). Returns `null`
 * when neither list matches — the caller falls back to `kind`-based
 * classification in that case.
 */
export function classifyByTypeName(typeName: string): 'database' | 'queue' | null {
  const lower = typeName.toLowerCase();
  if (DATABASE_TYPE_NAME_PREFIXES.some((prefix) => lower.startsWith(prefix))) return 'database';
  if (QUEUE_TYPE_NAME_PREFIXES.some((prefix) => lower.startsWith(prefix))) return 'queue';
  return null;
}

/**
 * Classifies one Aspire resource into a `.workspec/` element bucket, or
 * `'skip'` when it should not be projected at all. Order of precedence:
 *
 * 1. `kind: "parameter"` — always skipped, regardless of `typeName`.
 * 2. `typeName` classified as database/queue (see {@link classifyByTypeName})
 *    — wins over `kind`, since a Postgres or RabbitMQ resource is a
 *    `kind: "container"` in Aspire's own model but is architecturally a
 *    database/queue, not a generic container.
 * 3. `kind` in `container` / `executable` / `project` — a container.
 * 4. `kind: "azure"` not classified above — an external system.
 * 5. `kind: "unknown"` not classified above — falls back to a container
 *    (a conservative default: nothing is silently dropped except the
 *    explicitly-skipped `parameter` kind).
 */
export function classifyResource(resource: AspireResource): ElementBucket | 'skip' {
  if (resource.kind === 'parameter') return 'skip';

  const byTypeName = classifyByTypeName(resource.typeName);
  if (byTypeName !== null) return byTypeName;

  if (
    resource.kind === 'container' ||
    resource.kind === 'executable' ||
    resource.kind === 'project'
  ) {
    return 'container';
  }
  if (resource.kind === 'azure') return 'external-system';

  // resource.kind === 'unknown', not classified by typeName.
  return 'container';
}
