// The RTM projection's row shape (spec §5: "Matrix — scenario rows grouped by
// Rule -> Feature, exportable"; spec §6: `matrix --out matrix.{md,csv,html}`).
// Every field is already a rendered STRING — titles resolved to their model
// nodes, refs shown as-authored when they don't resolve (spec §4.8) — so the
// three format serializers (markdown/csv/html) are pure, model-agnostic
// string-table renderers. See `matrix-rows.ts` for the `TraceModel ->
// MatrixRow[]` projection.

/**
 * One row of the requirements-traceability matrix: one scenario (the
 * executed unit, spec §4.5), the full trace from its containing feature down
 * through its latest-run proof. An EMPTY Rule (no scenarios, spec §4.7)
 * contributes one synthetic row of its own — see `matrix-rows.ts`'s
 * `EMPTY_RULE_SCENARIO_LABEL` — since it has no scenario row to appear on
 * otherwise, and "a requirement with no proof at all" is exactly the kind of
 * gap an RTM exists to surface.
 */
export interface MatrixRow {
  /**
   * The scenario's Rule's containing feature name. Shown as the feature's
   * raw slug ref (as-authored, spec §4.8) when the Rule's `feature` ref
   * doesn't resolve to a Feature in the tree. Empty when the Rule itself
   * doesn't resolve (there is then no feature ref to show at all).
   */
  readonly feature: string;
  /**
   * The Rule's (system-requirement's) title. Shown as the scenario's
   * `systemRequirement` ref as-authored (spec §4.8) when it doesn't resolve
   * to a Rule in the tree — a dangling scenario -> Rule ref.
   */
  readonly rule: string;
  /**
   * The scenario's title, or `EMPTY_RULE_SCENARIO_LABEL` for the one
   * synthetic row an empty Rule (no scenarios) contributes.
   */
  readonly scenario: string;
  /**
   * The userReq title(s) the Rule verifies (spec §4.7's "verifies" edge),
   * joined with `"; "`. Each is shown as-authored when its ref doesn't
   * resolve. Empty when the Rule itself doesn't resolve.
   */
  readonly verifies: string;
  /**
   * The scenario's latest-run proof: `pass` | `fail` | `skip` | `unproven`
   * (spec §4.6). `unproven` for the empty-Rule placeholder row — nothing
   * proves a Rule with no scenarios.
   */
  readonly status: string;
  /** The latest run's id that proved this scenario, or empty when unproven / the placeholder row. */
  readonly run: string;
  /** The commit SHA that run executed against, or empty when unproven, the run carried none, or the placeholder row. */
  readonly sha: string;
}
