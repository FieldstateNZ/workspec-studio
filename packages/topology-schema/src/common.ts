import { z } from 'zod';

// Shared Zod primitives used across the Resource and Environment artifacts:
// the cost-attribution shape and the resource-level `cost` field, plus its
// "all fields optional" patch variant used by an Environment's per-resource
// `overrides`.

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
    sku: z.string().min(1).describe("Ref to a decision catalog `skus[].id` this resource prices as."),
    mode: z.string().min(1).describe("Ref to a decision catalog `pricingModes[].id`."),
    schedule: z.string().min(1).describe("Ref to a decision catalog `schedules[].id`."),
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
 * The `cost` patch an Environment's `overrides` entry may carry: every
 * `ResourceCost` field made optional, since an override only needs to name
 * the fields it changes (a deep-merge patch, not a replacement).
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
  .describe('A deep-merge patch over a resource\'s `cost` fields; every field is optional.');

// Inferred TypeScript types (Zod is the single source of truth).
export type Percentage = z.infer<typeof Percentage>;
export type CostAttribution = z.infer<typeof CostAttribution>;
export type ResourceCost = z.infer<typeof ResourceCost>;
export type ResourceCostOverride = z.infer<typeof ResourceCostOverride>;
