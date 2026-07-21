import { z } from 'zod';
import { defineArtifact } from '@workspec/schema-core';
import { identifier } from './common.js';

// ── Catalog artifact (`*.catalog.yaml`) ─────────────────────────────────────
// Porting decision P3: the OSS v1 catalog is the *simple engine model* — the
// pricing tables `compute()` reads — NOT the rich provider/resource/tier/usage
// model from the prototype's `catalog-data.js` (deferred to Enterprise).
//
// Built on `@workspec/schema-core`'s `defineArtifact`: the envelope
// (apiVersion/kind/metadata) and identity (`metadata.slug`, loader-derived
// from the filename when absent) are the shared shape every schema-core-based
// kind uses. `name`/`currency`/`asOf` (former `metadata` fields) now live on
// `spec` — they moved out of the old hand-rolled `metadata.id`/`...` envelope.

/** A pricing mode: a named multiplier on a SKU's PAYG list price. */
export const PricingMode = z
  .object({
    id: identifier.describe('Stable id referenced by a SKU line\'s `mode`, e.g. "payg", "ri3".'),
    label: z.string().min(1).describe('Human-readable name, e.g. "3yr Reserved".'),
    short: z.string().min(1).optional().describe('Optional short badge label, e.g. "3Y RI".'),
    mult: z
      .number()
      .nonnegative()
      .describe(
        'Multiplier applied to the SKU PAYG monthly list price. 1.0 = PAYG list; 0.5 = half price.',
      ),
    committed: z
      .boolean()
      .describe(
        'If true the mode bills 24×7 and ignores schedule (reserved/committed capacity); only non-committed modes benefit from scheduling a line off.',
      ),
    note: z.string().optional().describe('Optional freeform note explaining the mode.'),
  })
  .describe("A pricing mode: a named multiplier on a SKU's PAYG list price.");

/** A schedule preset: the share of the month a scheduled line actually runs. */
export const Schedule = z
  .object({
    id: identifier.describe(
      'Stable id referenced by a SKU line\'s `schedule`, e.g. "always", "business".',
    ),
    label: z.string().min(1).describe('Human-readable name, e.g. "Business hrs".'),
    pct: z
      .number()
      .min(0)
      .max(1)
      .describe(
        'Share of the ~730-hour month the line actually runs, 0..1. 1 = 24×7; 0.30 ≈ business hours.',
      ),
    note: z.string().optional().describe('Optional freeform note explaining the schedule.'),
  })
  .describe('A schedule preset: the share of the month a line actually runs.');

/** A SKU: a priced catalogue item, quoted as a monthly PAYG list price. */
export const Sku = z
  .object({
    id: identifier.describe('Stable id referenced by a SKU line\'s `sku`, e.g. "d4s_v5".'),
    label: z.string().min(1).describe('Human-readable name, e.g. "D4s v5".'),
    family: z.string().min(1).describe('Grouping family for display, e.g. "General compute".'),
    price: z
      .number()
      .nonnegative()
      .describe('Monthly PAYG list price for a single unit, in the catalog currency.'),
    unit: z
      .string()
      .min(1)
      .optional()
      .describe('Optional unit label for the price, e.g. "instance / month".'),
  })
  .describe('A SKU: a priced catalogue item, quoted as a monthly PAYG list price.');

/** The catalog body: optional name, currency, price-capture date, and the priced tables the engine reads. */
export const CatalogSpec = z
  .object({
    name: z.string().min(1).optional().describe('Optional human-readable catalog name.'),
    currency: z.string().min(1).describe('ISO 4217 currency code for all prices, e.g. "NZD".'),
    asOf: z
      .string()
      .min(1)
      .describe(
        'Date the prices were captured, ISO 8601 (e.g. "2026-07-01"). Kept as a string so YAML does not coerce it to a date.',
      ),
    pricingModes: z
      .array(PricingMode)
      .min(1)
      .describe('Available pricing modes referenced by SKU lines.'),
    schedules: z
      .array(Schedule)
      .min(1)
      .describe('Available schedule presets referenced by SKU lines.'),
    skus: z.array(Sku).min(1).describe('Priced catalogue items referenced by SKU lines.'),
  })
  .describe(
    'The catalog body: optional name, currency, price-capture date, and the priced tables (modes, schedules, SKUs) the engine reads.',
  );

/** A `*.catalog.yaml` artifact: the simple engine pricing model (P3). */
export const CatalogArtifact = defineArtifact('Catalog', CatalogSpec).describe(
  'A WorkSpec catalog artifact: the simple engine pricing model (pricing modes, schedules, SKUs).',
);

// Inferred TypeScript types (Zod is the single source of truth).
export type PricingMode = z.infer<typeof PricingMode>;
export type Schedule = z.infer<typeof Schedule>;
export type Sku = z.infer<typeof Sku>;
export type CatalogSpec = z.infer<typeof CatalogSpec>;
export type Catalog = z.infer<typeof CatalogArtifact>;
