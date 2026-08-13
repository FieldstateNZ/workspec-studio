import { z } from 'zod';
import { API_VERSION, Slug } from '@workspec/schema-core';
import { identifier } from './common.js';

// ── Line (discriminated union on `flat`) ────────────────────────────────────
// Issue #2: a line is either a metered SKU line (priced from the catalog) or a
// flat line (an explicit per-env monthly amount). The `flat` boolean is the
// discriminator. Authoring convenience: SKU lines may omit `flat` — a
// preprocess step defaults it to `false` before discrimination.

/** A metered SKU line: qty units of a catalog SKU, at a mode and schedule. */
export const SkuLine = z
  .object({
    id: identifier.describe('Stable line id, unique within the option.'),
    group: z
      .string()
      .min(1)
      .optional()
      .describe('Optional display grouping, e.g. "compute", "data".'),
    label: z.string().min(1).describe('Human-readable line name.'),
    flat: z
      .literal(false)
      .describe(
        'Discriminant: `false` marks a metered SKU line priced from the catalog. May be omitted when authoring (defaults to false).',
      ),
    sku: identifier.describe('Ref to a catalog `skus[].id`.'),
    mode: identifier.describe('Ref to a catalog `pricingModes[].id`.'),
    schedule: identifier.describe('Ref to a catalog `schedules[].id`.'),
    tag: z
      .string()
      .min(1)
      .optional()
      .describe('Optional tag used by lever patch `match.tags`, e.g. "steady-prod".'),
    qty: z
      .record(identifier, z.number().nonnegative())
      .describe(
        'Units of the SKU per environment, keyed by env id. A missing env is treated as 0.',
      ),
  })
  .describe('A metered SKU line priced from the catalog.');

/** A flat line: an explicit monthly amount per environment. */
export const FlatLine = z
  .object({
    id: identifier.describe('Stable line id, unique within the option.'),
    group: z
      .string()
      .min(1)
      .optional()
      .describe('Optional display grouping, e.g. "compute", "data".'),
    label: z.string().min(1).describe('Human-readable line name.'),
    flat: z
      .literal(true)
      .describe('Discriminant: `true` marks a flat line with explicit per-env amounts.'),
    tag: z.string().min(1).optional().describe('Optional tag used by lever patch `match.tags`.'),
    amount: z
      .record(identifier, z.number().nonnegative())
      .describe(
        'Explicit monthly amount per environment, keyed by env id, in the decision currency.',
      ),
    estimate: z
      .boolean()
      .optional()
      .describe('Marks the amount as an estimate rather than a firm price.'),
  })
  .describe('A flat line with explicit per-env monthly amounts.');

/**
 * A cost line: a metered SKU line or a flat line, discriminated on `flat`.
 * The preprocess defaults a missing `flat` to `false` so SKU lines can omit it.
 */
export const Line = z.preprocess(
  (value) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !('flat' in value)
    ) {
      return { ...(value as Record<string, unknown>), flat: false };
    }
    return value;
  },
  z.discriminatedUnion('flat', [SkuLine, FlatLine]),
);

// ── Lever (declarative patch) ───────────────────────────────────────────────
// Porting decision P1: the prototype's JS `match`/`apply` functions become
// declarative data. A lever is an ordered list of patch ops; each op selects
// lines by tag/group/id (optionally scoped to envs) and either mutates fields
// (`set`) or contributes extra lines (`addLines`). The engine (S2) interprets
// them; an `enabled: false` lever is a no-op.

/** Selects which lines (and optionally which envs) a patch op targets. */
export const PatchMatch = z
  .object({
    tags: z
      .array(z.string().min(1))
      .optional()
      .describe('Match lines whose `tag` is in this list.'),
    groups: z
      .array(z.string().min(1))
      .optional()
      .describe('Match lines whose `group` is in this list.'),
    ids: z.array(identifier).optional().describe('Match lines whose `id` is in this list.'),
    envs: z
      .array(identifier)
      .optional()
      .describe(
        "Restrict the patch to these environment ids. Omit to apply to all of the option's environments.",
      ),
  })
  .describe(
    'Selects which lines (and optionally which envs) a patch op targets. An empty match object matches all lines.',
  );

/** Field mutations applied to matched lines. */
export const PatchSet = z
  .object({
    mode: identifier
      .optional()
      .describe('Set the matched SKU line `mode` to this catalog pricingMode id.'),
    schedule: identifier
      .optional()
      .describe('Set the matched SKU line `schedule` to this catalog schedule id.'),
    qtyScale: z
      .number()
      .nonnegative()
      .optional()
      .describe('Multiply matched SKU line quantities by this factor (per env).'),
  })
  .describe('Field mutations applied to matched SKU lines.');

/** One declarative patch operation. */
export const PatchOp = z
  .object({
    match: PatchMatch.describe('Which lines/envs this op targets.'),
    set: PatchSet.optional().describe('Field mutations to apply to matched lines.'),
    addLines: z
      .array(Line)
      .optional()
      .describe('Extra lines this op contributes when the lever is enabled.'),
  })
  .describe('One declarative patch operation: a match plus a set and/or added lines.');

/** A declarative what-if transform over an option's lines. */
export const Lever = z
  .object({
    id: identifier.describe('Stable lever id, unique within the option.'),
    label: z.string().min(1).describe('Human-readable toggle label.'),
    hint: z.string().optional().describe('Optional explanation shown alongside the toggle.'),
    enabled: z
      .boolean()
      .default(false)
      .describe('Whether the lever is applied by default. Defaults to false (off).'),
    patch: z
      .array(PatchOp)
      .min(1)
      .describe('Ordered patch operations applied, in order, when enabled.'),
  })
  .describe("A declarative what-if transform (lever) over an option's lines.");

// ── Option ──────────────────────────────────────────────────────────────────

/** A score for one criterion. */
export const OptionScore = z
  .object({
    score: z.number().min(0).max(5).describe('Score 0–5 for this criterion (higher is better).'),
    note: z.string().optional().describe('Optional rationale for the score.'),
  })
  .describe('A 0–5 score for one criterion, with an optional note.');

/** A costed architecture option under comparison. */
export const Option = z
  .object({
    id: identifier.describe('Stable option id, e.g. "aks".'),
    name: z.string().min(1).describe('Human-readable option name.'),
    archetype: z
      .string()
      .min(1)
      .optional()
      .describe('Short architecture archetype, e.g. "Azure Kubernetes Service".'),
    summary: z.string().optional().describe('One-paragraph summary of the option.'),
    tag: z.string().min(1).optional().describe('Optional short badge, e.g. "current direction".'),
    environments: z
      .array(identifier)
      .describe(
        "Active subset of the decision environments this option is costed for, in order. Must be a subset of the decision's environments.",
      ),
    complete: z
      .boolean()
      .optional()
      .describe(
        'Author flag: `false` marks the option as still being modelled. Defaults to complete (true) when omitted.',
      ),
    lines: z.array(Line).describe('Cost lines: metered SKU lines and flat lines.'),
    levers: z.array(Lever).optional().describe('Declarative what-if toggles over the lines.'),
    scores: z
      .record(identifier, OptionScore)
      .describe(
        'Per-criterion scores, keyed by criterion id. Keys must be declared decision criteria.',
      ),
  })
  .describe('A costed architecture option under comparison.');

// ── Core Decision record ────────────────────────────────────────────────────

export const DecisionStatus = z.enum([
  'proposed',
  'accepted',
  'rejected',
  'deprecated',
  'superseded',
]);

export const LinkCardinality = z
  .object({
    from: z.enum(['0..1', '1', '1..1', '0..*', '1..*']),
    to: z.enum(['0..1', '1', '1..1', '0..*', '1..*']),
    label: z.string().min(1).optional(),
  })
  .strict();

/** One traversable WorkSpec relationship: one dynamic link key plus optional cardinality. */
export const Link = z.record(z.string().min(1), z.unknown()).superRefine((entry, ctx) => {
  const linkKeys = Object.keys(entry).filter((key) => key !== 'cardinality');
  if (linkKeys.length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'each links entry must contain exactly one link' });
    return;
  }
  const key = linkKeys[0] as string;
  const ref = entry[key];
  if (typeof ref !== 'string' || !/^(~\/|@workspace\/)/.test(ref)) {
    ctx.addIssue({
      code: 'custom',
      message: 'link path refs must start with ~/ or @workspace/',
      path: [key],
    });
  }
  if ('cardinality' in entry) {
    const parsed = LinkCardinality.safeParse(entry.cardinality);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', message: 'invalid link cardinality', path: ['cardinality'] });
    }
  }
});

/** Supporting material outside the traversable WorkSpec artifact graph. */
export const Reference = z
  .object({
    kind: z.string().min(1),
    target: z.string().min(1),
    label: z.string().min(1).optional(),
  })
  .strict();

export const Alternative = z
  .object({
    title: z.string().min(1),
    reason: z.string().min(1).optional(),
  })
  .strict();

const FullDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const DecisionSpec = z
  .object({
    title: z.string().min(1),
    status: DecisionStatus,
    created: FullDate.optional(),
    decided: FullDate.optional(),
    deciders: z.array(z.string().min(1)).optional(),
    context: z.string().min(1),
    decision: z.string().min(1),
    rationale: z.string().min(1).optional(),
    consequences: z.array(z.string().min(1)).optional(),
    alternatives: z.array(Alternative).optional(),
    supersedes: Slug.optional(),
    links: z.array(Link).optional(),
    references: z.array(Reference).optional(),
    tags: z.array(z.string().min(1)).optional(),
  })
  .strict();

/** Strict repository-native Decision artifact. Filename is the canonical identity. */
export const DecisionArtifact = z
  .object({
    apiVersion: z.literal(API_VERSION),
    kind: z.literal('Decision'),
    metadata: z.object({ slug: Slug.optional() }).strict(),
    spec: DecisionSpec,
  })
  .strict();

// Inferred TypeScript types (Zod is the single source of truth).
export type SkuLine = z.infer<typeof SkuLine>;
export type FlatLine = z.infer<typeof FlatLine>;
export type Line = z.infer<typeof Line>;
export type PatchMatch = z.infer<typeof PatchMatch>;
export type PatchSet = z.infer<typeof PatchSet>;
export type PatchOp = z.infer<typeof PatchOp>;
export type Lever = z.infer<typeof Lever>;
export type OptionScore = z.infer<typeof OptionScore>;
export type Option = z.infer<typeof Option>;
export type Link = z.infer<typeof Link>;
export type LinkType = Link;
export type LinkCardinality = z.infer<typeof LinkCardinality>;
export type Reference = z.infer<typeof Reference>;
export type Alternative = z.infer<typeof Alternative>;
export type DecisionStatus = z.infer<typeof DecisionStatus>;
export type DecisionSpec = z.infer<typeof DecisionSpec>;
export type Decision = z.infer<typeof DecisionArtifact>;
