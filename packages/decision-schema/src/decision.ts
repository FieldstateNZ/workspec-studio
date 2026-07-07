import { z } from 'zod';
import { API_VERSION } from './constants.js';
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

// ── Decision top level ──────────────────────────────────────────────────────

/** A decision criterion with a weight for the weighted recommendation (P4). */
export const Criterion = z
  .object({
    id: identifier.describe('Stable id referenced by option `scores` keys, e.g. "opsBurden".'),
    label: z.string().min(1).describe('Human-readable name, e.g. "Ops burden".'),
    hint: z.string().optional().describe('Optional guidance on what a high score means.'),
    weight: z
      .number()
      .nonnegative()
      .describe(
        'Relative importance in the weighted recommendation (higher matters more; 0 disables the criterion).',
      ),
  })
  .describe('A decision criterion and its weight in the recommendation.');

/** The recorded outcome once a decision is decided. */
export const Outcome = z
  .object({
    option: identifier.describe('Id of the chosen option.'),
    rationale: z.string().min(1).describe('The "we accept X for Y" rationale for the decision.'),
    decidedBy: z.string().min(1).optional().describe('Who made the decision.'),
    decidedAt: z.string().min(1).optional().describe('When the decision was made, ISO 8601.'),
  })
  .describe('The recorded outcome once a decision is decided.');

/** An external reference the host resolves (deployment, feature, requirement…). */
export const Link = z
  .object({
    kind: z
      .string()
      .min(1)
      .describe('Link kind, e.g. "deployment", "feature", "system-requirement".'),
    label: z.string().min(1).describe('Human-readable link label.'),
    target: z.string().min(1).optional().describe('Optional URL or opaque ref the host resolves.'),
  })
  .describe('An external reference the host resolves.');

/** Decision identity and lifecycle. */
export const DecisionMetadata = z
  .object({
    id: identifier.describe('Stable decision id, e.g. "dec-hosting".'),
    title: z.string().min(1).describe('Decision title.'),
    status: z
      .enum(['exploring', 'decided', 'superseded'])
      .describe(
        'Lifecycle status: exploring → decided; a decided decision may later be superseded.',
      ),
    created: z.string().min(1).optional().describe('Creation date, ISO 8601.'),
    deciders: z
      .array(z.string().min(1))
      .optional()
      .describe('People accountable for the decision.'),
    supersedes: identifier.optional().describe('Id of a decision this one supersedes.'),
  })
  .describe('Decision identity and lifecycle.');

/** The decision body: context, catalog ref, envs, criteria, options, outcome. */
export const DecisionSpec = z
  .object({
    context: z.string().min(1).describe('The problem framing: what is being decided and why.'),
    catalog: z
      .string()
      .min(1)
      .describe('Relative path to the catalog artifact, e.g. "./platform.catalog.yaml".'),
    currency: z
      .string()
      .min(1)
      .describe('ISO 4217 currency for all amounts; should match the catalog.'),
    environments: z
      .array(identifier)
      .min(1)
      .describe('Ordered environment ids, e.g. ["dev","test","prod"].'),
    criteria: z.array(Criterion).describe('Weighted criteria the options are scored against.'),
    options: z.array(Option).min(1).describe('The costed options under comparison.'),
    outcome: Outcome.optional().describe(
      'The recorded outcome; present once the decision is decided.',
    ),
    links: z.array(Link).optional().describe('External references the host resolves.'),
  })
  .describe('The decision body.');

/**
 * A `*.decision.yaml` artifact.
 *
 * Cross-field integrity is enforced by `superRefine`: option environments must
 * be a subset of the decision environments; every per-env `qty`/`amount` key
 * must be a declared environment; every score key must be a declared criterion;
 * and a recorded `outcome.option` must reference an existing option. (Catalog
 * ref integrity — sku/mode/schedule — is validated by the engine, which has the
 * catalog in hand.)
 */
export const DecisionArtifact = z
  .object({
    apiVersion: z.literal(API_VERSION).describe('Artifact API version discriminant.'),
    kind: z.literal('Decision').describe('Artifact kind discriminant.'),
    metadata: DecisionMetadata.describe('Decision identity and lifecycle.'),
    spec: DecisionSpec.describe('The decision body.'),
  })
  .superRefine((doc, ctx) => {
    const envs = new Set(doc.spec.environments);
    const criteriaIds = new Set(doc.spec.criteria.map((c) => c.id));
    const optionIds = new Set(doc.spec.options.map((o) => o.id));

    doc.spec.options.forEach((option, oi) => {
      // Option environments ⊆ decision environments.
      option.environments.forEach((env, ei) => {
        if (!envs.has(env)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'options', oi, 'environments', ei],
            message: `unknown environment "${env}" (not declared in spec.environments)`,
          });
        }
      });

      // Per-env line keys ⊆ decision environments.
      option.lines.forEach((line, li) => {
        const perEnv = line.flat ? line.amount : line.qty;
        const field = line.flat ? 'amount' : 'qty';
        for (const key of Object.keys(perEnv)) {
          if (!envs.has(key)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['spec', 'options', oi, 'lines', li, field, key],
              message: `unknown environment "${key}" (not declared in spec.environments)`,
            });
          }
        }
      });

      // Score keys ⊆ declared criteria.
      for (const key of Object.keys(option.scores)) {
        if (!criteriaIds.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['spec', 'options', oi, 'scores', key],
            message: `unknown criterion "${key}" (not declared in spec.criteria)`,
          });
        }
      }
    });

    // Outcome must reference an existing option.
    if (doc.spec.outcome && !optionIds.has(doc.spec.outcome.option)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['spec', 'outcome', 'option'],
        message: `unknown option "${doc.spec.outcome.option}" (not one of spec.options)`,
      });
    }
  })
  .describe('A WorkSpec decision artifact.');

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
export type Criterion = z.infer<typeof Criterion>;
export type Outcome = z.infer<typeof Outcome>;
export type Link = z.infer<typeof Link>;
export type DecisionMetadata = z.infer<typeof DecisionMetadata>;
export type DecisionSpec = z.infer<typeof DecisionSpec>;
export type Decision = z.infer<typeof DecisionArtifact>;
