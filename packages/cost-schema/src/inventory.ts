import { z } from 'zod';
import { API_VERSION } from './constants.js';
import { identifier, resourceTagName, resourceTagValue } from './common.js';

// ── Inventory artifact (`*.inventory.yaml`) ─────────────────────────────────
// A point-in-time stock-take of provider resources. The sort order of
// `resources[]` is part of the schema contract (enforced below, in the one
// superRefine): two stock-takes diffed with plain `git diff` should show only
// the resources that actually changed, so the file itself must always be
// serialized — and therefore validated — in the same canonical order.

/** What was stock-taken: the subscriptions covered by this inventory. */
export const InventoryScope = z
  .object({
    subscriptions: z
      .array(z.string().min(1))
      .min(1)
      .describe('Subscription ids/names covered by this stock-take.'),
  })
  .describe('What was stock-taken: the subscriptions in scope.');

/** A single stock-taken provider resource. */
export const InventoryResource = z
  .object({
    id: z
      .string()
      .min(1)
      .describe(
        'Provider resource id, e.g. an Azure ARM resource id. Provider-neutral: any nonempty ' +
          'string. Unique across the file; resources are sorted ascending by this field ' +
          '(schema contract, see README).',
      ),
    name: z.string().min(1).describe('Resource display name.'),
    type: z
      .string()
      .min(1)
      .describe('Provider resource type, e.g. "Microsoft.Compute/virtualMachines".'),
    location: z.string().min(1).describe('Provider region/location, e.g. "australiaeast".'),
    resourceGroup: z.string().min(1).describe('Resource group name.'),
    subscription: z.string().min(1).describe('Subscription id or name the resource belongs to.'),
    tags: z
      .record(resourceTagName, resourceTagValue)
      .optional()
      .describe('Resource tags, keyed by tag name.'),
  })
  .describe('A single stock-taken provider resource.');

/** The inventory body: stock-take instant, scope, and resources. */
export const InventorySpec = z
  .object({
    asOf: z
      .string()
      .datetime()
      .describe('ISO 8601 UTC timestamp: the stock-take instant.'),
    scope: InventoryScope.describe('What was stock-taken.'),
    resources: z
      .array(InventoryResource)
      .describe(
        'Stock-taken resources. MUST be sorted ascending by `id` (plain JavaScript string comparison, i.e. UTF-16 code units) — ' +
          'this is what makes a plain `git diff` between two stock-takes the drift report.',
      ),
  })
  .describe('The inventory body: stock-take instant, scope, and resources.');

/** Inventory identity. */
export const InventoryMetadata = z
  .object({
    id: identifier.describe('Stable inventory id, e.g. "prod-2026-07".'),
    name: z.string().min(1).optional().describe('Optional human-readable name.'),
  })
  .describe('Inventory identity.');

/**
 * A `*.inventory.yaml` artifact: a point-in-time resource stock-take.
 *
 * Cross-field integrity is enforced by `superRefine`: resource ids must be
 * unique across the file, and `resources[]` must already be sorted ascending
 * by `id` (the sort-order contract — see README).
 */
export const InventoryArtifact = z
  .object({
    apiVersion: z.literal(API_VERSION).describe('Artifact API version discriminant.'),
    kind: z.literal('Inventory').describe('Artifact kind discriminant.'),
    metadata: InventoryMetadata.describe('Inventory identity.'),
    spec: InventorySpec.describe('The inventory body.'),
  })
  .superRefine((doc, ctx) => {
    const seen = new Map<string, number>();
    doc.spec.resources.forEach((resource, i) => {
      const firstIndex = seen.get(resource.id);
      if (firstIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'resources', i, 'id'],
          message: `duplicate resource id "${resource.id}" (already used at spec.resources.${firstIndex}.id)`,
        });
      } else {
        seen.set(resource.id, i);
      }
    });

    for (let i = 1; i < doc.spec.resources.length; i++) {
      const prev = doc.spec.resources[i - 1];
      const cur = doc.spec.resources[i];
      if (prev !== undefined && cur !== undefined && compareResourceIds(cur.id, prev.id) < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'resources', i, 'id'],
          message: `resources must be sorted ascending by id: "${cur.id}" comes after "${prev.id}"`,
        });
        break;
      }
    }
  })
  .describe('A WorkSpec inventory artifact: a point-in-time resource stock-take.');

/** Ascending resource-id comparison (UTF-16 code-unit order, plain `<`), per the sort-order contract. */
export function compareResourceIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

// Inferred TypeScript types (Zod is the single source of truth).
export type InventoryScope = z.infer<typeof InventoryScope>;
export type InventoryResource = z.infer<typeof InventoryResource>;
export type InventorySpec = z.infer<typeof InventorySpec>;
export type InventoryMetadata = z.infer<typeof InventoryMetadata>;
export type Inventory = z.infer<typeof InventoryArtifact>;
