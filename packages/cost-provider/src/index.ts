/**
 * `@workspec/cost-provider` — the pluggable cost-data provider PORT for
 * WorkSpec Cost Attribution, plus its in-memory test double.
 *
 * Browser-safe root entry: nothing here reaches `node:` anything, and
 * (the acceptance criterion this package exists to satisfy) no Azure — or
 * any other vendor's — types appear anywhere in `CloudProviderPort` or its
 * result types. A real backend, e.g. `@workspec/cost-provider-azure`,
 * implements this port; nothing in the engine, CLI, or UI depends on how.
 */
export const COST_PROVIDER_PACKAGE = '@workspec/cost-provider' as const;

export type { CloudProviderPort, ProviderScope } from './port.js';
export { CLOUD_PROVIDER_METHODS } from './port.js';

export type { ApplyEntryResult, ApplyResult, Drift, DriftReport } from './types.js';

export type { DriftableResource } from './drift.js';
export { computeDriftReport } from './drift.js';

export type { MemoryCloudProvider, MemoryProviderSeed } from './memory.js';
export { createMemoryProvider, DEFAULT_MEMORY_CLOCK } from './memory.js';
