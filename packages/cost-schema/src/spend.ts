import { z } from 'zod';
import { defineArtifact } from '@workspec/schema-core';

// ── Spend artifact (`*.spend.yaml`) ─────────────────────────────────────────
// Billed rows for a period, each attributed to an inventory resource (or left
// `unresolved` when the provider's billing export couldn't be matched to one).
// Like Inventory, the sort order of `rows[]` is part of the schema contract.
//
// Built on `@workspec/schema-core`'s `defineArtifact` — see `inventory.ts` for
// the envelope/identity note. `name` (optional) lives on `spec` now.

/** One spend row: an amount for a period, attributed to a resource (or left unresolved). */
export const SpendRow = z
  .object({
    resourceId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Provider resource id this row is attributed to (matches an Inventory resource id). ' +
          'Required unless `unresolved` is true.',
      ),
    amount: z
      .number()
      .finite()
      .describe('Spend amount for the period. Negative values are allowed (credits/refunds).'),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/, 'must be an ISO 4217 currency code: three uppercase letters')
      .describe('ISO 4217 currency code, e.g. "NZD".'),
    period: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'must be an ISO month, "YYYY-MM"')
      .describe('Billing period, ISO month "YYYY-MM".'),
    serviceCategory: z
      .string()
      .min(1)
      .describe('Provider service/category, e.g. "Virtual Machines".'),
    unresolved: z
      .literal(true)
      .optional()
      .describe(
        'Marks a row the provider could not match to an inventory resource. When true, ' +
          '`resourceId` must be absent and `sourceLabel` is required.',
      ),
    sourceLabel: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Free-text provider line description. Required when `unresolved`; harmless optional ' +
          'provenance alongside `resourceId` otherwise.',
      ),
  })
  .describe(
    'One spend row: an amount for a period, attributed to a resource (or left unresolved).',
  );

/** The spend body: optional name, billed rows for a period. */
export const SpendSpec = z
  .object({
    name: z
      .string()
      .min(1)
      .optional()
      .describe('Optional human-readable name for this spend record.'),
    rows: z
      .array(SpendRow)
      .describe(
        'Spend rows. MUST be sorted ascending by (resourceId ?? sourceLabel, period, ' +
          'serviceCategory) — the sort-order contract (see README).',
      ),
  })
  .describe('The spend body: optional name, billed rows for a period.');

/**
 * A `*.spend.yaml` artifact: billed rows for a period.
 *
 * Cross-field integrity is enforced by `superRefine`: `resourceId` is required
 * unless a row is `unresolved` (in which case `resourceId` must be absent and
 * `sourceLabel` is required), and `rows[]` must already be sorted ascending by
 * the composite sort key (the sort-order contract — see README).
 */
export const SpendArtifact = defineArtifact('Spend', SpendSpec)
  .superRefine((doc, ctx) => {
    doc.spec.rows.forEach((row, i) => {
      if (row.unresolved === true) {
        if (row.resourceId !== undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'rows', i, 'resourceId'],
            message: 'resourceId must be absent when unresolved is true',
          });
        }
        if (row.sourceLabel === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'rows', i, 'sourceLabel'],
            message: 'sourceLabel is required when unresolved is true',
          });
        }
      } else if (row.resourceId === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'rows', i, 'resourceId'],
          message: 'resourceId is required unless unresolved is true',
        });
      }
    });

    for (let i = 1; i < doc.spec.rows.length; i++) {
      const prev = doc.spec.rows[i - 1];
      const cur = doc.spec.rows[i];
      if (prev !== undefined && cur !== undefined && compareSpendRows(cur, prev) < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'rows', i],
          message:
            'rows must be sorted ascending by (resourceId ?? sourceLabel, period, serviceCategory): ' +
            `row ${i} comes before row ${i - 1}`,
        });
        break;
      }
    }
  })
  .describe('A WorkSpec spend artifact: billed rows for a period.');

/** Ascending comparison of two spend rows by the composite sort-order contract. */
export function compareSpendRows(a: SpendRow, b: SpendRow): number {
  const ak = [a.resourceId ?? a.sourceLabel ?? '', a.period, a.serviceCategory];
  const bk = [b.resourceId ?? b.sourceLabel ?? '', b.period, b.serviceCategory];
  for (let i = 0; i < ak.length; i++) {
    const av = ak[i] ?? '';
    const bv = bk[i] ?? '';
    if (av < bv) return -1;
    if (av > bv) return 1;
  }
  return 0;
}

// Inferred TypeScript types (Zod is the single source of truth).
export type SpendRow = z.infer<typeof SpendRow>;
export type SpendSpec = z.infer<typeof SpendSpec>;
export type Spend = z.infer<typeof SpendArtifact>;
