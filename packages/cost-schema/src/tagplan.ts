import { z } from 'zod';
import { API_VERSION } from './constants.js';
import { identifier, resourceTagName, resourceTagValue } from './common.js';

// ── TagPlan artifact (`*.tagplan.yaml`) ─────────────────────────────────────
// The tagging actions needed to bring provider resources' tags in line with
// an attribution result: one entry per resource × tag. `current`/`desired`
// are plain tag-value strings — including split-serialized values the engine
// produces, e.g. "workspec:60|atrium:40" — so this schema must NOT forbid `:`
// or `|` in them. Like Inventory/Spend, `entries[]` sort order is part of the
// schema contract.

/** One resource × tag entry in the tag plan. */
export const TagPlanEntry = z
  .object({
    resourceId: z
      .string()
      .min(1)
      .describe('Resource id this entry concerns (matches an Inventory resource id).'),
    tag: resourceTagName.describe('Tag name.'),
    current: resourceTagValue
      .nullable()
      .describe('Current tag value, or null if the tag is not currently set.'),
    desired: resourceTagValue
      .nullable()
      .describe('Desired tag value, or null if the tag should not be set.'),
    action: z
      .enum(['add', 'change', 'remove', 'noop'])
      .describe(
        'The tagging action this entry represents: add (current null, desired set), change ' +
          '(both set and different), remove (current set, desired null), or noop (equal).',
      ),
  })
  .describe('One resource × tag entry in the tag plan.');

/** The tag plan body: baseline anchor, dimension→tag mapping, and entries. */
export const TagPlanSpec = z
  .object({
    baselineAsOf: z
      .string()
      .datetime()
      .describe(
        'ISO 8601 UTC timestamp: the Inventory `asOf` this plan was computed against (the ' +
          'drift-check anchor).',
      ),
    tagMapping: z
      .record(identifier, resourceTagName)
      .describe('Dimension id → tag name mapping, e.g. { product: "fs-product" }. Must not be empty.'),
    entries: z
      .array(TagPlanEntry)
      .describe(
        'One entry per resource × tag. MUST be sorted ascending by (resourceId, tag) — the ' +
          'sort-order contract (see README).',
      ),
  })
  .describe('The tag plan body: baseline anchor, dimension→tag mapping, and entries.');

/** TagPlan identity. */
export const TagPlanMetadata = z
  .object({
    id: identifier.describe('Stable tag-plan id, e.g. "prod-2026-07".'),
    name: z.string().min(1).optional().describe('Optional human-readable name.'),
  })
  .describe('TagPlan identity.');

/**
 * A `*.tagplan.yaml` artifact: the tagging actions needed to converge a
 * resource's tags on an attribution result.
 *
 * Cross-field integrity is enforced by `superRefine`: `action` must be
 * consistent with `current`/`desired` (add ⇒ current null ∧ desired
 * non-null; remove ⇒ current non-null ∧ desired null; change ⇒ both
 * non-null and different; noop ⇒ equal), `tagMapping` must not be empty, and
 * `entries[]` must already be sorted ascending by (resourceId, tag).
 */
export const TagPlanArtifact = z
  .object({
    apiVersion: z.literal(API_VERSION).describe('Artifact API version discriminant.'),
    kind: z.literal('TagPlan').describe('Artifact kind discriminant.'),
    metadata: TagPlanMetadata.describe('TagPlan identity.'),
    spec: TagPlanSpec.describe('The tag plan body.'),
  })
  .superRefine((doc, ctx) => {
    doc.spec.entries.forEach((entry, i) => {
      const { current, desired, action } = entry;
      switch (action) {
        case 'add':
          if (current !== null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'current'],
              message: 'action "add" requires current to be null',
            });
          }
          if (desired === null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'desired'],
              message: 'action "add" requires desired to be non-null',
            });
          }
          break;
        case 'remove':
          if (current === null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'current'],
              message: 'action "remove" requires current to be non-null',
            });
          }
          if (desired !== null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'desired'],
              message: 'action "remove" requires desired to be null',
            });
          }
          break;
        case 'change':
          if (current === null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'current'],
              message: 'action "change" requires current to be non-null',
            });
          }
          if (desired === null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'desired'],
              message: 'action "change" requires desired to be non-null',
            });
          }
          if (current !== null && desired !== null && current === desired) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'desired'],
              message: 'action "change" requires current and desired to differ',
            });
          }
          break;
        case 'noop':
          if (current !== desired) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'entries', i, 'desired'],
              message: 'action "noop" requires current and desired to be equal',
            });
          }
          break;
      }
    });

    for (let i = 1; i < doc.spec.entries.length; i++) {
      const prev = doc.spec.entries[i - 1];
      const cur = doc.spec.entries[i];
      if (prev !== undefined && cur !== undefined && compareTagPlanEntries(cur, prev) < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'entries', i],
          message: `entries must be sorted ascending by (resourceId, tag): entry ${i} comes before entry ${i - 1}`,
        });
        break;
      }
    }

    const seenEntryKeys = new Set<string>();
    doc.spec.entries.forEach((entry, i) => {
      const key = `${entry.resourceId}\u0000${entry.tag}`; // NUL separator: cannot occur in either field
      if (seenEntryKeys.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'entries', i],
          message: `duplicate entry for resource "${entry.resourceId}" tag "${entry.tag}" (one entry per resource × tag)`,
        });
      } else {
        seenEntryKeys.add(key);
      }
    });

    if (Object.keys(doc.spec.tagMapping).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spec', 'tagMapping'],
        message: 'tagMapping must not be empty',
      });
    }
  })
  .describe('A WorkSpec tag-plan artifact: the tagging actions needed to converge on an attribution result.');

/** Ascending comparison of two tag-plan entries by (resourceId, tag). */
export function compareTagPlanEntries(a: TagPlanEntry, b: TagPlanEntry): number {
  if (a.resourceId !== b.resourceId) return a.resourceId < b.resourceId ? -1 : 1;
  if (a.tag !== b.tag) return a.tag < b.tag ? -1 : 1;
  return 0;
}

// Inferred TypeScript types (Zod is the single source of truth).
export type TagPlanEntry = z.infer<typeof TagPlanEntry>;
export type TagPlanSpec = z.infer<typeof TagPlanSpec>;
export type TagPlanMetadata = z.infer<typeof TagPlanMetadata>;
export type TagPlan = z.infer<typeof TagPlanArtifact>;
