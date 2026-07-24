// @workspec/topology-adapters — pure import adapters that turn
// infrastructure sources (Terraform, Bicep/ARM, Azure Resource Graph) into
// WorkSpec Topology `Resource` artifacts. Every adapter is a pure function
// from already-parsed JSON to `{ resources, diagnostics }`; a later CLI/
// studio phase owns reading files and invoking these. See README.md for the
// vendor→kind mapping tables and the tree-diff invariant every produced
// resource upholds (`spec.source = { kind: 'derived', from }`, otherwise
// shaped identically to an authored `Resource`).

/**
 * This package's own identity. Mirrors the smoke-test-constant pattern used
 * by `@workspec/schema-core`, `@workspec/decision-schema`, and
 * `@workspec/topology-schema`.
 */
export const TOPOLOGY_ADAPTERS_PACKAGE = '@workspec/topology-adapters' as const;

// ── Shared adapter contract ──────────────────────────────────────────────────
export type { Adapter, AdapterOutput, Diagnostic, DiagnosticSeverity } from './types.js';

// ── Shared vendor→kind mapping ───────────────────────────────────────────────
export { VENDOR_KIND_CATALOG } from './vendor-kind-catalog.js';
export type { VendorKindMapping, VendorKindKey } from './vendor-kind-catalog.js';

// ── The three adapters ────────────────────────────────────────────────────────
export { terraformAdapter } from './terraform/terraform-adapter.js';
export { bicepAdapter } from './bicep/bicep-adapter.js';
export { resourceGraphAdapter } from './azure-resource-graph/resource-graph-adapter.js';

// ── Adapter registry (select-by-name for a CLI/studio caller) ────────────────
export { ADAPTERS } from './registry.js';
export type { AdapterName } from './registry.js';
