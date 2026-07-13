import { z } from 'zod';
import { API_VERSION } from './constants.js';
import { identifier } from './common.js';

// ── Attribution artifact (`*.attribution.yaml`) ─────────────────────────────
// Declares the dimensions (axes) resources are attributed across, the ordered
// rules that assign resources to dimension values, and pinned per-resource
// overrides. Everything here is DATA, not functions — same spirit as Decision
// Studio's declarative levers. The matching/precedence semantics (first rule
// match wins per dimension; overrides beat all rules) belong to the
// attribution engine (a later slice); this package only shapes and validates
// the data those semantics run over.

/** An attribution dimension: a named axis of cost allocation (e.g. "product", "team"). */
export const Dimension = z
  .object({
    id: identifier.describe('Stable dimension id, unique among dimensions, e.g. "product".'),
    label: z.string().min(1).describe('Human-readable dimension name, e.g. "Product".'),
    values: z
      .array(identifier)
      .min(1)
      .describe('Declared value ids for this dimension, e.g. ["atrium", "workspec"]. Must be unique.'),
  })
  .describe('An attribution dimension: a named axis of cost allocation.');

/**
 * Match conditions for a rule. ALL present fields must match (logical AND);
 * an empty object `{}` matches every resource. `nameGlob`/`resourceGroup` use
 * `*` as the only wildcard.
 */
export const RuleMatch = z
  .object({
    resourceType: z
      .string()
      .min(1)
      .optional()
      .describe('Exact match on the Inventory resource `type`.'),
    nameGlob: z
      .string()
      .min(1)
      .optional()
      .describe('Glob match on the Inventory resource `name` (`*` is the only wildcard).'),
    resourceGroup: z
      .string()
      .min(1)
      .optional()
      .describe('Glob match on the Inventory resource `resourceGroup` (`*` is the only wildcard).'),
    subscription: z
      .string()
      .min(1)
      .optional()
      .describe('Exact match on the Inventory resource `subscription`.'),
    tagEquals: z
      .object({
        name: z.string().min(1).describe('Tag name.'),
        value: z.string().describe('Tag value to match exactly.'),
      })
      .optional()
      .describe('Match when the resource has this tag name set to this exact value.'),
    tagExists: z
      .string()
      .min(1)
      .optional()
      .describe('Match when the resource has this tag name set, regardless of value.'),
  })
  .describe(
    'Match conditions for a rule. ALL present fields must match (AND); an empty object ' +
      'matches every resource.',
  );

/** Literal per-dimension value assignment, keyed by dimension id. */
export const RuleAssign = z
  .record(identifier, identifier)
  .describe('Literal per-dimension value assignment, keyed by dimension id, valued by value id.');

/** Per-dimension ratio splits across multiple declared values, keyed by dimension id. */
export const RuleSplit = z
  .record(identifier, z.record(identifier, z.number().positive()))
  .describe(
    'Per-dimension ratio splits, keyed by dimension id. Each dimension\'s ratio map has at ' +
      'least 2 entries (value id → positive ratio) summing to 1 (tolerance 1e-6).',
  );

/** Per-dimension "read this tag at run time" assignment, keyed by dimension id. */
export const RuleFromTag = z
  .record(identifier, z.string().min(1))
  .describe(
    'Per-dimension assignment read from a resource tag at run time, keyed by dimension id, ' +
      'valued by tag name. Values are dynamic tag contents, not declared value ids.',
  );

/**
 * An attribution rule: match conditions plus one or more effects.
 *
 * A rule must carry at least one of `assign`/`split`/`fromTag`, and a given
 * dimension id may appear in at most one of those three effect fields
 * (enforced by the artifact's `superRefine`, since it requires cross-checking
 * the other effect fields on the same rule).
 */
export const Rule = z
  .object({
    id: identifier.describe('Stable rule id, unique among rules, e.g. "r1".'),
    name: z.string().min(1).describe('Human-readable rule name.'),
    match: RuleMatch.describe('Match conditions; ALL present fields must match (AND).'),
    assign: RuleAssign.optional().describe('Literal per-dimension value assignment.'),
    split: RuleSplit.optional().describe('Per-dimension ratio splits across multiple values.'),
    fromTag: RuleFromTag.optional().describe('Per-dimension assignment read from a resource tag.'),
  })
  .describe('An attribution rule: match conditions plus one or more effects.');

/** A pinned per-resource assignment that beats all rules. */
export const Override = z
  .object({
    resourceId: z
      .string()
      .min(1)
      .describe('Resource id this override pins (matches an Inventory resource id).'),
    assign: RuleAssign.describe(
      'Pinned per-dimension value assignment; beats all rules (engine precedence — see README).',
    ),
  })
  .describe('A pinned per-resource assignment that beats all rules.');

/** The attribution body: dimensions, ordered rules, and pinned overrides. */
export const AttributionSpec = z
  .object({
    dimensions: z
      .array(Dimension)
      .min(1)
      .describe('Declared attribution dimensions (axes). Dimension ids must be unique.'),
    rules: z
      .array(Rule)
      .describe(
        'Attribution rules. ORDERED: the order in the file IS the match precedence — the ' +
          'attribution engine (a later slice) applies the first matching rule, per dimension, ' +
          'independently. An empty `match: {}` matches every resource, so a catch-all rule ' +
          'belongs last.',
      ),
    overrides: z
      .array(Override)
      .optional()
      .describe(
        'Pinned per-resource assignments that beat all rules (engine precedence — see README).',
      ),
  })
  .describe('The attribution body: dimensions, ordered rules, and pinned overrides.');

/** Attribution identity. */
export const AttributionMetadata = z
  .object({
    id: identifier.describe('Stable attribution id, e.g. "prod".'),
    name: z.string().min(1).optional().describe('Optional human-readable name.'),
  })
  .describe('Attribution identity.');

/**
 * A `*.attribution.yaml` artifact: dimensions, ordered rules, and overrides.
 *
 * Cross-field integrity is enforced by one `superRefine`: dimension ids and
 * each dimension's value ids must be unique; rule ids and override resource
 * ids must be unique; every rule must carry at least one non-empty effect and
 * may not target the same dimension from two different effect fields; every
 * dimension id referenced by an effect must be declared, and every value id
 * referenced by `assign`/`split` must be declared on that dimension; `split`
 * ratio maps must have at least 2 entries summing to 1 (tolerance 1e-6); and
 * override `assign` maps follow the same referential rules.
 */
export const AttributionArtifact = z
  .object({
    apiVersion: z.literal(API_VERSION).describe('Artifact API version discriminant.'),
    kind: z.literal('Attribution').describe('Artifact kind discriminant.'),
    metadata: AttributionMetadata.describe('Attribution identity.'),
    spec: AttributionSpec.describe('The attribution body.'),
  })
  .superRefine((doc, ctx) => {
    const dimensionIds = new Set<string>();
    const dimensionValues = new Map<string, Set<string>>();

    doc.spec.dimensions.forEach((dim, di) => {
      if (dimensionIds.has(dim.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'dimensions', di, 'id'],
          message: `duplicate dimension id "${dim.id}"`,
        });
      } else {
        dimensionIds.add(dim.id);
      }

      const seenValues = new Set<string>();
      dim.values.forEach((value, vi) => {
        if (seenValues.has(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'dimensions', di, 'values', vi],
            message: `duplicate value "${value}" in dimension "${dim.id}"`,
          });
        } else {
          seenValues.add(value);
        }
      });
      dimensionValues.set(dim.id, seenValues);
    });

    const valuesOf = (dimId: string): Set<string> | undefined => dimensionValues.get(dimId);

    const ruleIds = new Set<string>();
    doc.spec.rules.forEach((rule, ri) => {
      if (ruleIds.has(rule.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'rules', ri, 'id'],
          message: `duplicate rule id "${rule.id}"`,
        });
      } else {
        ruleIds.add(rule.id);
      }

      const assignCount = rule.assign ? Object.keys(rule.assign).length : 0;
      const splitCount = rule.split ? Object.keys(rule.split).length : 0;
      const fromTagCount = rule.fromTag ? Object.keys(rule.fromTag).length : 0;
      if (assignCount === 0 && splitCount === 0 && fromTagCount === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'rules', ri],
          message: 'rule must have at least one effect: assign, split, or fromTag',
        });
      }

      const dimensionOwner = new Map<string, 'assign' | 'split' | 'fromTag'>();

      if (rule.assign) {
        if (Object.keys(rule.assign).length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'rules', ri, 'assign'],
            message: 'assign must not be empty',
          });
        }
        for (const [dimId, valueId] of Object.entries(rule.assign)) {
          dimensionOwner.set(dimId, 'assign');
          const values = valuesOf(dimId);
          if (values === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'assign', dimId],
              message: `unknown dimension "${dimId}" (not declared in spec.dimensions)`,
            });
          } else if (!values.has(valueId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'assign', dimId],
              message: `unknown value "${valueId}" for dimension "${dimId}"`,
            });
          }
        }
      }

      if (rule.split) {
        const splitEntries = Object.entries(rule.split);
        if (splitEntries.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'rules', ri, 'split'],
            message: 'split must not be empty',
          });
        }
        for (const [dimId, ratios] of splitEntries) {
          const owner = dimensionOwner.get(dimId);
          if (owner !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'split', dimId],
              message: `dimension "${dimId}" appears in both "${owner}" and "split" (a dimension may appear in at most one effect field per rule)`,
            });
          } else {
            dimensionOwner.set(dimId, 'split');
          }

          const values = valuesOf(dimId);
          if (values === undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'split', dimId],
              message: `unknown dimension "${dimId}" (not declared in spec.dimensions)`,
            });
          }

          const ratioEntries = Object.entries(ratios);
          if (ratioEntries.length < 2) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'split', dimId],
              message: `split for dimension "${dimId}" must have at least 2 value entries`,
            });
          }

          let sum = 0;
          for (const [valueId, ratio] of ratioEntries) {
            sum += ratio;
            if (values !== undefined && !values.has(valueId)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['spec', 'rules', ri, 'split', dimId, valueId],
                message: `unknown value "${valueId}" for dimension "${dimId}"`,
              });
            }
          }
          if (ratioEntries.length > 0 && Math.abs(sum - 1) > 1e-6) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'split', dimId],
              message: `split ratios for dimension "${dimId}" must sum to 1 (got ${sum})`,
            });
          }
        }
      }

      if (rule.fromTag) {
        if (Object.keys(rule.fromTag).length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'rules', ri, 'fromTag'],
            message: 'fromTag must not be empty',
          });
        }
        for (const dimId of Object.keys(rule.fromTag)) {
          const owner = dimensionOwner.get(dimId);
          if (owner !== undefined) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'fromTag', dimId],
              message: `dimension "${dimId}" appears in both "${owner}" and "fromTag" (a dimension may appear in at most one effect field per rule)`,
            });
          } else {
            dimensionOwner.set(dimId, 'fromTag');
          }
          if (!dimensionIds.has(dimId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'rules', ri, 'fromTag', dimId],
              message: `unknown dimension "${dimId}" (not declared in spec.dimensions)`,
            });
          }
        }
      }
    });

    const overrideResourceIds = new Set<string>();
    (doc.spec.overrides ?? []).forEach((override, oi) => {
      if (overrideResourceIds.has(override.resourceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'overrides', oi, 'resourceId'],
          message: `duplicate override for resourceId "${override.resourceId}"`,
        });
      } else {
        overrideResourceIds.add(override.resourceId);
      }

      if (Object.keys(override.assign).length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['spec', 'overrides', oi, 'assign'],
          message: 'assign must not be empty',
        });
      }
      for (const [dimId, valueId] of Object.entries(override.assign)) {
        const values = valuesOf(dimId);
        if (values === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'overrides', oi, 'assign', dimId],
            message: `unknown dimension "${dimId}" (not declared in spec.dimensions)`,
          });
        } else if (!values.has(valueId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'overrides', oi, 'assign', dimId],
            message: `unknown value "${valueId}" for dimension "${dimId}"`,
          });
        }
      }
    });
  })
  .describe('A WorkSpec attribution artifact: dimensions, ordered rules, and pinned overrides.');

// Inferred TypeScript types (Zod is the single source of truth).
export type Dimension = z.infer<typeof Dimension>;
export type RuleMatch = z.infer<typeof RuleMatch>;
export type RuleAssign = z.infer<typeof RuleAssign>;
export type RuleSplit = z.infer<typeof RuleSplit>;
export type RuleFromTag = z.infer<typeof RuleFromTag>;
export type Rule = z.infer<typeof Rule>;
export type Override = z.infer<typeof Override>;
export type AttributionSpec = z.infer<typeof AttributionSpec>;
export type AttributionMetadata = z.infer<typeof AttributionMetadata>;
export type Attribution = z.infer<typeof AttributionArtifact>;
