import { z } from 'zod';
import { defineArtifact, linksField, Slug } from '@workspec/schema-core';
import { ResourceCost } from './common.js';

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
      .describe('Whether a human authored this resource or a tool derived it. Defaults to authored.'),
    from: z.string().min(1).optional().describe('Provenance detail when `kind` is "derived".'),
  })
  .describe('Provenance for an authored-vs-tool-derived resource.');

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
    source: ResourceSource.optional().describe('Provenance: authored by hand or derived by a tool.'),
  })
  .describe('The resource body.');

/** A `.workspec/resources/<slug>.yaml` artifact: a single infrastructure node. */
export const ResourceArtifact = defineArtifact('Resource', ResourceSpec).describe(
  'A WorkSpec resource artifact: a single infrastructure node in a topology.',
);

// Inferred TypeScript types (Zod is the single source of truth).
export type ResourceKind = z.infer<typeof ResourceKind>;
export type ResourceSource = z.infer<typeof ResourceSource>;
export type ResourceSpec = z.infer<typeof ResourceSpec>;
export type Resource = z.infer<typeof ResourceArtifact>;
