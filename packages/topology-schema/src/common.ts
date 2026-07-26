import { z } from 'zod';

// Shared Zod primitives used by the Resource artifact: the cost-attribution
// shape, the resource-level `cost` field, and its "all fields optional"
// patch variant used by a Resource's own per-environment `spec.overrides`
// (S1 — `ResourceOverride`, in `resource.ts`). Lived on `Environment` in v0;
// see `environment.ts`'s history comment for why it moved.

/** A 0..1 fraction, e.g. a cost-attribution share. */
export const Percentage = z
  .number()
  .min(0)
  .max(1)
  .describe('A fraction between 0 and 1 (inclusive).');

/** Attributes a share of a resource's cost to a c4 container. */
export const CostAttribution = z
  .object({
    container: z.string().min(1).describe('The c4 container slug this share is attributed to.'),
    share: Percentage.describe('Fraction of the resource cost attributed to this container.'),
  })
  .describe("Attributes a share of a resource's cost to a c4 container.");

/**
 * A resource's cost binding: which decision-catalog SKU/mode/schedule it
 * prices against, how many units, and (optionally) how that cost splits
 * across the c4 containers it realizes. `sku`/`mode`/`schedule` are bare
 * strings (not `Slug`), mirroring `@workspec/decision-schema`'s own
 * `identifier`-shaped catalog ref fields — cross-package integrity (does
 * this sku/mode/schedule exist in the bound catalog?) is a `verify`-time
 * concern for the host, not a schema-level check here.
 */
export const ResourceCost = z
  .object({
    sku: z
      .string()
      .min(1)
      .describe('Ref to a decision catalog `skus[].id` this resource prices as.'),
    mode: z.string().min(1).describe('Ref to a decision catalog `pricingModes[].id`.'),
    schedule: z.string().min(1).describe('Ref to a decision catalog `schedules[].id`.'),
    qty: z
      .number()
      .int()
      .nonnegative()
      .default(1)
      .describe('Unit count. Defaults to 1 when omitted.'),
    attribution: z
      .array(CostAttribution)
      .optional()
      .describe('Optional cost split across the c4 containers this resource realizes.'),
  })
  .describe("A resource's cost binding: catalog SKU/mode/schedule, unit count, and attribution.");

/**
 * The `cost` patch a Resource's own per-environment `spec.overrides[envId]`
 * entry may carry (S1 — see `resource.ts`'s `ResourceOverride`): every
 * `ResourceCost` field made optional, since an override only needs to name
 * the fields it changes. Merged FIELD-BY-FIELD by
 * `@workspec/topology-model`'s `mergeCost` — not a deep/recursive merge (this
 * shape is already flat, so there's no nested-object case to worry about),
 * and `attribution` is a whole-array replace, never an element-wise splice.
 *
 * **Author-facing gotcha:** a resource with NO base `spec.cost` at all
 * cannot be given one purely through an override — `mergeCost` silently
 * discards a partial patch (e.g. just `{ qty: 5 }`) when there's no base to
 * merge it onto and the patch itself doesn't supply all three of
 * `sku`/`mode`/`schedule`, resulting in `cost: null` for that environment,
 * not a diagnostic. Author the base `spec.cost` with a real
 * `sku`/`mode`/`schedule` first if this resource should be priced at all;
 * the override then only needs to name what changes per environment.
 */
export const ResourceCostOverride = z
  .object({
    sku: z.string().min(1).optional().describe('Override the bound catalog SKU id.'),
    mode: z.string().min(1).optional().describe('Override the bound catalog pricing mode id.'),
    schedule: z.string().min(1).optional().describe('Override the bound catalog schedule id.'),
    qty: z.number().int().nonnegative().optional().describe('Override the unit count.'),
    attribution: z
      .array(CostAttribution)
      .optional()
      .describe('Override the cost attribution split.'),
  })
  .describe(
    "A field-by-field patch over a resource's own `cost` fields for one environment; every " +
      'field is optional. A resource with no base `cost` binding cannot get one purely from an ' +
      "override missing sku/mode/schedule — see this const's own doc comment.",
  );

// Inferred TypeScript types (Zod is the single source of truth).
export type Percentage = z.infer<typeof Percentage>;
export type CostAttribution = z.infer<typeof CostAttribution>;
export type ResourceCost = z.infer<typeof ResourceCost>;
export type ResourceCostOverride = z.infer<typeof ResourceCostOverride>;
