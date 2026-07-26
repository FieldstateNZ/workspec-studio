import { z } from 'zod';
import { defineArtifact } from '@workspec/schema-core';

// ── Environment kind (`.workspec/environments/<slug>.yaml`) ─────────────────
// An Environment (dev/test/prod, ...) carries naming conventions for that
// environment. Built on `@workspec/schema-core`'s `defineArtifact`.
//
// **History (S1, 2026-07-26):** v0 shipped per-resource override patches
// HERE, as `spec.overrides[resourceSlug]`. S1 (the v0.1 "per-env resource
// config" slice) moved that mechanism onto the Resource artifact instead —
// `ResourceSpec.overrides[environmentId]` in `resource.ts` — so a resource's
// whole cross-env story lives in its own file, matching every other per-env
// variance idiom in this family (`Connection.environments`,
// `ResourceSpec.environments`, decision lines' per-env `qty:`/`amount:`
// maps). This artifact now carries `naming` only.

/**
 * `params.code` value stamped on the legacy-field issue below — read by
 * `@workspec/topology-schema`'s own `parseArtifact` (to populate
 * `ParseIssue.code`) and, from there, by `@workspec/topology-model`'s
 * `parseIssuesToDiagnostics` (to map the issue onto the dedicated
 * `legacy-environment-overrides` diagnostic code instead of the generic
 * `parse-error`). A plain exported string constant, not a zod enum member —
 * this is metadata ABOUT one specific custom issue, not part of any parsed
 * value's shape.
 */
export const LEGACY_ENVIRONMENT_OVERRIDES_ISSUE_CODE = 'legacy-environment-overrides';

const LEGACY_ENVIRONMENT_OVERRIDES_MESSAGE =
  'spec.overrides is a LEGACY v0 field that no longer exists on Environment — S1 moved ' +
  'per-environment resource overrides onto Resource.spec.overrides[envId] instead. This block ' +
  'has NO EFFECT under the current schema and will be PERMANENTLY DELETED the next time this ' +
  'file is written through a validating writer (the CLI, the MCP write_environment tool, or the ' +
  'Studio UI all silently drop unrecognized keys on write). Migrate its contents onto the ' +
  "corresponding Resource file(s), under each resource's own `spec.overrides.<envId>`, then " +
  'delete this block.';

/**
 * Targeted legacy-field guard for exactly one field: `spec.overrides`, v0's
 * now-removed per-resource-override map. **Design decision (frozen,
 * post-S1 adversarial review, 2026-07-26): a `z.preprocess` on `EnvironmentSpec`
 * itself, NOT `.strict()` anywhere in this family.** `z.object`'s default
 * "strip unknown keys" behaviour silently discards this field during a normal
 * parse — before S1, a resource's whole cross-env story could live here, so a
 * pre-migration tree parses "successfully" today with the author's real
 * override data quietly gone, producing wrong-but-plausible resolved
 * config/cost with no diagnostic at all (adversarial review measured a 20%
 * cost error, `validate` exit 0). Making `EnvironmentSpec` (or the whole
 * family) `.strict()` would reject every FUTURE legitimately-unknown key the
 * same way, which is a much bigger, unrelated behaviour change than "warn
 * about this one specific legacy field" — so this check is intentionally
 * narrow and names the field explicitly instead.
 *
 * `z.preprocess`'s transform runs on the RAW pre-strip input (before the
 * inner `z.object` has a chance to drop anything), so it's the one place in
 * the normal `EnvironmentArtifact.safeParse(...)` pipeline that can still see
 * a stray `overrides` key — this covers every caller uniformly, whether the
 * input came from YAML text (`parseEnvironmentYaml`, used by `validate` and
 * model loading) or a plain JS object (`write_environment`'s MCP handler,
 * the Studio server's `PUT /api/environment`, `FsRepository.writeEnvironment`'s
 * own pre-write validation) — there is exactly one schema, so there is
 * exactly one place this needs to be taught the rule.
 */
function checkLegacyOverridesField(value: unknown, ctx: z.RefinementCtx): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).overrides !== undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['overrides'],
      message: LEGACY_ENVIRONMENT_OVERRIDES_MESSAGE,
      params: { code: LEGACY_ENVIRONMENT_OVERRIDES_ISSUE_CODE },
    });
  }
  return value;
}

/** Environment-specific naming conventions. */
export const EnvironmentNaming = z
  .object({
    resourceGroupSuffix: z
      .string()
      .min(1)
      .optional()
      .describe('Suffix appended to generated resource-group names in this environment.'),
  })
  .describe('Environment-specific naming conventions.');

/** The Environment body: naming conventions for this environment. */
export const EnvironmentSpec = z.preprocess(
  checkLegacyOverridesField,
  z
    .object({
      naming: EnvironmentNaming.optional().describe('Naming conventions for this environment.'),
    })
    .describe('The environment body: naming conventions.'),
);

/** A `.workspec/environments/<slug>.yaml` artifact: one deployment environment (dev/test/prod, ...). */
export const EnvironmentArtifact = defineArtifact('Environment', EnvironmentSpec).describe(
  'A WorkSpec environment artifact: naming conventions for one deployment environment.',
);

// Inferred TypeScript types (Zod is the single source of truth).
export type EnvironmentNaming = z.infer<typeof EnvironmentNaming>;
export type EnvironmentSpec = z.infer<typeof EnvironmentSpec>;
export type Environment = z.infer<typeof EnvironmentArtifact>;
