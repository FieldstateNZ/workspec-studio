import { z } from 'zod';
import { defineArtifact, linksField, Slug } from '@workspec/schema-core';
import { ResourceCost, ResourceCostOverride } from './common.js';

// ── Resource kind (`.workspec/resources/<slug>.yaml`) ───────────────────────
// A Resource is a single infrastructure node (or a grouping node — vnet,
// subnet, resource-group — see below) that a Topology's `connections`
// reference by slug. Built on `@workspec/schema-core`'s `defineArtifact`.

/**
 * The closed set of resource kinds. Deliberately closed (not a free string)
 * so downstream renderers can switch on it exhaustively. `vnet`, `subnet`,
 * and `resource-group` are ordinary resources of these kinds — there is no
 * separate "is this a container/grouping node" flag; a renderer decides
 * container-vs-node behaviour from `kind` alone, at the presentation layer,
 * not the schema layer.
 */
export const RESOURCE_KINDS = [
  'client',
  'compute',
  'function',
  'database',
  'cache',
  'endpoint',
  'monitor',
  'vnet',
  'subnet',
  'resource-group',
  'edge',
  'gateway',
  'identity',
  'search',
  'storage',
  'vault',
] as const;

/** One of the closed set of resource kinds. */
export const ResourceKind = z
  .enum(RESOURCE_KINDS)
  .describe('The resource kind; a closed set so renderers can switch on it exhaustively.');

/**
 * Provenance for an authored-vs-tool-generated resource. `derived` resources
 * are typically written by an import/discovery tool; `from` names that
 * source (e.g. an ARM export, a Terraform state file) for traceability.
 */
export const ResourceSource = z
  .object({
    kind: z
      .enum(['authored', 'derived'])
      .default('authored')
      .describe(
        'Whether a human authored this resource or a tool derived it. Defaults to authored.',
      ),
    from: z.string().min(1).optional().describe('Provenance detail when `kind` is "derived".'),
  })
  .describe('Provenance for an authored-vs-tool-derived resource.');

/**
 * A per-environment override patch for one Resource, keyed by environment id
 * under `spec.overrides` (S1, v0.1 direction). **Design decision (frozen,
 * 2026-07-26): overrides live on the Resource, not the Environment.** v0
 * shipped the mirror-image shape — `Environment.spec.overrides[resourceSlug]`
 * — but that puts a resource's cross-env story in a file other than the
 * resource's own. Every other per-env variance idiom in this family is
 * colocated with the owner instead (`Connection.environments`,
 * `ResourceSpec.environments`, decision lines' per-env `qty:`/`amount:`
 * maps) — an author reading one resource file should see its whole
 * cross-env story in one place. S1 migrated the mechanism onto `Resource`
 * and removed it from `Environment` (see `environment.ts`'s history); the
 * environment artifact still carries `naming` only.
 *
 * **Overridable field set (deployment-shaping only):** `config`, `cost`,
 * `resourceGroup`, `network` — the fields that plausibly differ by
 * deployment target (SKU/tier bags, pricing/qty, and the two placement
 * refs). Deliberately EXCLUDED, and non-overridable by design:
 * `name`/`kind`/`type`/`provider` (identity — a resource is the same
 * *thing* in every environment it exists in), `environments` (a different,
 * already-existing mechanism — *presence*, not configuration — overriding
 * it here would conflate "is this resource deployed here" with "how is it
 * configured here"), `realizes` (an architecture/traceability link to a c4
 * container, not a deployment concern), `links` (reference metadata), and
 * `source` (authoring provenance). No new base vocabulary was invented for
 * this — every overridable field's patch shape is a partial of a field
 * `ResourceSpec` already has.
 */
export const ResourceOverride = z
  .object({
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        "A SHALLOW, top-level patch over the resource's own `spec.config` bag for this " +
          'environment: a key named here replaces the base value at that key wholesale ' +
          '(including when both are objects — this is NOT a deep/recursive merge); a key not ' +
          "named here inherits the base resource's value unchanged. Setting a key's value to " +
          '`null` SETS the merged result to `null` — it does not remove the key, since a merge ' +
          'patch has no way to distinguish "not mentioned" from "explicitly cleared".',
      ),
    cost: ResourceCostOverride.optional().describe(
      "A field-by-field patch over the resource's own `spec.cost` for this environment " +
        '(sku/mode/schedule/qty/attribution) — see `ResourceCostOverride`.',
    ),
    resourceGroup: Slug.optional().describe(
      "Replaces the resource's own `spec.resourceGroup` ref for this environment (e.g. a " +
        'pooled dev/test resource group vs. an isolated prod one).',
    ),
    network: Slug.optional().describe(
      "Replaces the resource's own `spec.network` ref for this environment (e.g. a shared " +
        'dev/test subnet vs. an isolated prod one).',
    ),
  })
  .describe(
    'A per-environment override patch for one resource: shallow-merged `config`, ' +
      'field-merged `cost`, and full-replace `resourceGroup`/`network`. See the field-level ' +
      "docs for exact per-field merge semantics — `@workspec/topology-model`'s `resolve()` " +
      'is the only code that applies this patch. ' +
      'MERGE EDGES worth knowing: (1) `config`, being an open bag, CAN be nulled-out per key (the ' +
      'key stays, with a `null` value) but never REMOVED per key — there is no override syntax ' +
      'for "this environment does not have this config key at all". (2) `resourceGroup`/`network` ' +
      'are `Slug`-typed, never nullable, so an override can only REPLACE a placement with a ' +
      'different one — there is no way to override a resource OUT of its resourceGroup/network ' +
      'for one specific environment while the base resource has one; the base ref, if present, ' +
      'always applies unless a DIFFERENT ref replaces it.',
  );

/**
 * The Resource body. `environments` is deliberately absence-is-meaningful:
 * omitting it means the resource is present in every environment the owning
 * Topology declares — it must NOT be defaulted to an explicit list, since
 * that would silently exclude the resource from any environment the
 * Topology adds later. `network`/`resourceGroup` are optional placement
 * refs used by the network-lens/resource-group-lens views respectively;
 * `realizes` links the resource to the c4 containers it physically hosts.
 */
export const ResourceSpec = z
  .object({
    name: z.string().min(1).describe('Human-readable resource name.'),
    kind: ResourceKind.describe('The resource kind.'),
    type: z.string().min(1).describe('Vendor-specific display type, e.g. "Azure App Service".'),
    provider: z.string().min(1).describe('Cloud provider, e.g. "azure", "aws", "gcp".'),
    environments: z
      .array(Slug)
      .optional()
      .describe(
        'Subset of the owning Topology environments this resource is present in. ' +
          'Omitted means present in ALL of the topology environments — omission is ' +
          'meaningful and must not be defaulted to an explicit list.',
      ),
    network: Slug.optional().describe(
      'Bare-slug intra-tree ref → resources/*: the vnet/subnet resource that places this ' +
        'resource in the network-lens view.',
    ),
    resourceGroup: Slug.optional().describe(
      'Bare-slug intra-tree ref → resources/*: the resource-group resource that places this ' +
        'resource in the resource-group-lens view.',
    ),
    realizes: z
      .array(z.string().min(1))
      .optional()
      .describe('c4 container slugs this resource physically realizes.'),
    config: z
      .record(z.string(), z.unknown())
      .optional()
      .describe('Open, provider-specific configuration bag.'),
    cost: ResourceCost.optional().describe("This resource's cost binding, if it is priced."),
    links: linksField,
    source: ResourceSource.optional().describe(
      'Provenance: authored by hand or derived by a tool.',
    ),
    overrides: z
      .record(Slug, ResourceOverride)
      .optional()
      .describe(
        'Per-environment override patches (S1), keyed by environment id. ' +
          "`@workspec/topology-model`'s `resolve()` merges the entry for the target environment " +
          "onto this resource's own `config`/`cost`/`resourceGroup`/`network` — see " +
          '`ResourceOverride` for the exact per-field merge rule. Two integrity rules apply to ' +
          'every key, BOTH enforced by `@workspec/topology-model` at verify-time, not here: it ' +
          "must be one of the owning Topology's declared `spec.environments` (a standalone " +
          'Resource file has no visibility into which environments exist, so this can never be ' +
          'schema-level); and this resource must actually be PRESENT in it, per this same ' +
          "file's own (explicit) `spec.environments` — which WOULD be self-contained enough to " +
          "check here, but deliberately is not (see `ResourceArtifact`'s doc comment for why).",
      ),
  })
  .describe('The resource body.');

/**
 * A `.workspec/resources/<slug>.yaml` artifact: a single infrastructure node.
 *
 * No `superRefine` (S1 shipped one, for the override-vs-presence rule below,
 * then removed it after adversarial review — see history). Both `overrides`
 * integrity rules — env id unknown to the topology, and env known but this
 * resource not present in it — are enforced by `@workspec/topology-model`'s
 * `checkOverrideEnvironmentRefs` (verify-time) instead of here, even though
 * the presence rule is self-contained enough within one Resource file that
 * it COULD be a schema-level `superRefine`.
 *
 * **History (S1 adversarial review, 2026-07-26): the presence rule started
 * as a schema-level `superRefine` and was moved to model-level after review
 * found it cascades.** A `superRefine` failure invalidates the WHOLE
 * artifact — `loadResourcesRaw` never adds a resource that fails to parse to
 * its map at all — so one bad override key doesn't just fail on its own
 * line, it makes the ENTIRE resource vanish from the loaded model, which
 * then cascades into unrelated spurious diagnostics everywhere else that
 * resource is referenced (dangling connection/placement refs treating it as
 * missing, etc. — reviewer reproduced 7 diagnostics from what should have
 * been 1). A model-level diagnostic reports exactly the one real problem and
 * leaves the rest of the resource — and the rest of the tree — intact.
 */
export const ResourceArtifact = defineArtifact('Resource', ResourceSpec).describe(
  'A WorkSpec resource artifact: a single infrastructure node in a topology.',
);

// Inferred TypeScript types (Zod is the single source of truth).
export type ResourceKind = z.infer<typeof ResourceKind>;
export type ResourceSource = z.infer<typeof ResourceSource>;
export type ResourceOverride = z.infer<typeof ResourceOverride>;
export type ResourceSpec = z.infer<typeof ResourceSpec>;
export type Resource = z.infer<typeof ResourceArtifact>;
