import { bicepAdapter } from './bicep/bicep-adapter.js';
import { resourceGraphAdapter } from './azure-resource-graph/resource-graph-adapter.js';
import { terraformAdapter } from './terraform/terraform-adapter.js';
import type { Adapter } from './types.js';

/**
 * Every adapter this package ships, keyed by the source-name a CLI/studio
 * caller selects by (e.g. `--source terraform`). Lets a later phase resolve
 * an adapter by name without importing each one individually.
 */
export const ADAPTERS = {
  terraform: terraformAdapter,
  bicep: bicepAdapter,
  'azure-resource-graph': resourceGraphAdapter,
} as const satisfies Record<string, Adapter>;

/** One of the adapter names `ADAPTERS` registers. */
export type AdapterName = keyof typeof ADAPTERS;
