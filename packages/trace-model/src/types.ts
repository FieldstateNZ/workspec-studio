// The normative shapes for the traceability derivation engine — both the
// LOCATED-ARTIFACT input the engine consumes and the derived `TraceModel` it
// produces. This contract is normative: identical input must yield identical
// output across any conforming implementation (a future Rust CLI, WorkSpec
// Enterprise). See docs/traceability/spec.md §4–§4.7 and the package README.
//
// Model revision: the Gherkin Rule is its own layer between feature and
// scenario. A `SystemRequirement` IS a Rule — it groups scenarios and carries
// no steps of its own. `Scenario` is the fifth, file-native kind: the executed
// unit, the thing evidence actually keys on.

import type {
  Actor,
  Feature,
  Scenario,
  SystemRequirement,
  TestRun,
  UserRequirement,
} from '@workspec/req-schema';

// ── Input: located artifacts ─────────────────────────────────────────────────
//
// The engine is PURE — it never reads the filesystem. The caller (the T4
// CLI/loader) reads and validates each file, derives its slug from the
// filename (`slugFromPath` — the file IS the identity), and hands the engine
// each artifact WITH the source location diagnostics need. `runs` are the
// parsed `TestRun[]` (ingested evidence, spec §4.6).

/** Where a located artifact was loaded from — carried so findings can point at it. */
export interface SourceLocation {
  /** Path to the source file, as the loader saw it (repo-relative by convention). */
  file: string;
  /** 1-based line, when the loader can attribute one. Findings anchor to the artifact, not the field. */
  line?: number;
}

/**
 * An artifact paired with its resolved identity and source location. `slug` is
 * the loader-derived filename stem (spec §4: slug = path stem = identity), the
 * authoritative key the whole model joins on — not the optional, hand-written
 * `artifact.metadata.slug`.
 */
export interface Located<A> {
  slug: string;
  artifact: A;
  source: SourceLocation;
}

/**
 * A single traceability tree, as located artifacts. v0 is SINGLE-TREE (spec
 * §9.5): no cross-project resolution — that is Enterprise (#77). `actors` are
 * carried only so `userReq.actor` refs can be dangling-checked (spec §4.7).
 * `scenarios` is the fifth kind: the executed units that reference their
 * parent Rule (`SystemRequirement`) via `systemRequirement`.
 */
export interface TraceTree {
  actors: readonly Located<Actor>[];
  features: readonly Located<Feature>[];
  userRequirements: readonly Located<UserRequirement>[];
  systemRequirements: readonly Located<SystemRequirement>[];
  scenarios: readonly Located<Scenario>[];
}

// ── Output: derived model ────────────────────────────────────────────────────

/** The three explicit verdicts a run records for a scenario (spec §4.6). */
export type EvidenceStatus = 'pass' | 'fail' | 'skip';

/**
 * A scenario's latest-run proof state. `pass`/`fail`/`skip` are the recorded
 * verdicts; `unproven` is the DERIVED fourth state — the scenario is in the
 * tree but absent from the latest run (spec §4.6: absence → unproven, never
 * stored).
 */
export type ScenarioProof = EvidenceStatus | 'unproven';

/** A run's identity, denormalised onto the model so consumers needn't re-scan `runs`. */
export interface RunRef {
  id: string;
  /** ISO-8601 datetime the run was produced (`TestRun.ts`). */
  ts: string;
  /** Commit SHA the run executed against, when the run carried one. */
  sha?: string;
  /** CI provider label, when the run carried one. */
  ci?: string;
  /** The emitter convention that produced the run, e.g. "cucumber" or "junit". */
  emitter: string;
}

/**
 * The latest-run evidence joined onto one scenario (spec §4.6: keyed on the
 * SCENARIO slug — the scenario is the executed unit, so there is no composite
 * key). Present only when the scenario HAS a verdict in the latest run; a
 * scenario that is `unproven` carries no `evidence`.
 */
export interface Evidence {
  /** The scenario slug this evidence proves. */
  scenario: string;
  /** Id of the latest run that carried a verdict for this scenario. */
  runId: string;
  status: EvidenceStatus;
  /** The run's ISO-8601 timestamp (`TestRun.ts`). */
  at: string;
  /** The run's commit SHA, when it carried one. */
  sha?: string;
}

/**
 * One scenario's derivation: its parent Rule and its latest-run proof. The
 * evidence join happens HERE — per scenario, keyed on the scenario slug
 * (spec §4.6 revision).
 */
export interface ScenarioNode {
  slug: string;
  title: string;
  /** The parent Rule slug (bare-slug ref → requirements/system/*, as authored). */
  systemRequirement: string;
  /** Latest-run proof state — `unproven` when absent from the latest run. */
  proof: ScenarioProof;
  /** The joined evidence, present iff `proof !== 'unproven'`. */
  evidence?: Evidence;
  source: SourceLocation;
}

/**
 * One system-requirement's derivation: it IS a Gherkin Rule (spec §4.4) — a
 * named statement that groups scenarios and verifies userReqs, with NO
 * `proof`/`evidence` of its own (that lives on its scenarios). `ruleProven`
 * is the strict predicate spec §4.7 defines: the Rule has ≥1 scenario AND
 * every one of them proves `pass` in the latest run. `empty` is the Rule's
 * own derived diagnostic: a Rule with no scenarios is a requirement with no
 * proof at all.
 */
export interface SysReqNode {
  slug: string;
  title: string;
  /** The containing feature slug (bare-slug ref → features/*, as authored). */
  feature: string;
  /** User-requirement slugs this Rule claims to verify (as authored), sorted. */
  verifies: string[];
  /** Scenario slugs whose `systemRequirement` is this Rule, sorted. */
  scenarios: string[];
  /** True iff this Rule has ≥1 scenario AND every one of them is `pass` in the latest run (spec §4.7). */
  ruleProven: boolean;
  /** True iff this Rule has no scenarios — a requirement with no proof at all (spec §4.7). */
  empty: boolean;
  source: SourceLocation;
}

/** One user-requirement's derivation: who verifies it and whether it is covered. */
export interface UserReqNode {
  slug: string;
  title: string;
  /** The actor this promise is made to (bare-slug ref → actors/*, as authored). */
  actor: string;
  /** Feature slugs this requirement belongs to (as authored), sorted. */
  features: string[];
  status: UserRequirement['spec']['status'];
  /** Slugs of the Rules whose `userReqs` include this slug (the verifies edge), sorted. */
  verifiedBy: string[];
  /** Subset of `verifiedBy` whose `ruleProven` is `true`, sorted. */
  provenBy: string[];
  /** True iff ≥1 verifying Rule is rule-proven — the coverage predicate (spec §4.7). */
  covered: boolean;
  /** True iff NO Rule verifies it — the headline orphan finding (spec §4.7). */
  orphan: boolean;
  source: SourceLocation;
}

/** One feature's derivation: the userReqs and sysreqs (Rules) that attach to it. */
export interface FeatureNode {
  slug: string;
  name: string;
  /** userReq slugs that list this feature in `features[]`, sorted. */
  userRequirements: string[];
  /** sysreq (Rule) slugs whose `feature` is this feature, sorted. */
  systemRequirements: string[];
  /** True iff the feature has no userReqs OR no sysreqs — not fully wired (spec §4.7). */
  orphan: boolean;
  source: SourceLocation;
}

/**
 * A meter as numerator/denominator/ratio, never collapsed to a bare float —
 * so the UI/CLI can show "N of M", not just a percentage (spec §5: the three
 * meters are never merged). `ratio` is raw and unclamped; it is `1` when
 * `denominator` is `0` (the vacuous case: nothing to cover / no evidence yet).
 */
export interface Meter {
  numerator: number;
  denominator: number;
  ratio: number;
}

/** The finding taxonomy (spec §4.7). */
export type FindingKind =
  'orphan-user-requirement' | 'orphan-feature' | 'empty-rule' | 'dangling-ref' | 'duplicate-slug';

/**
 * Severity lets the T4 `verify` CI gate decide what fails the build: dangling
 * intra-tree refs and duplicate slugs are `error` (typo/identity bugs the spec
 * §4.7 says make `verify` fail); the orphan and empty-rule findings are
 * `warning` diagnostics.
 */
export type FindingSeverity = 'error' | 'warning';

/**
 * A structured diagnostic — data, NEVER thrown (the engine does not throw).
 * Deterministically ordered so golden snapshots stay byte-stable and CI-diffable.
 */
export interface Finding {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  /** Source file of the artifact the finding is about. */
  file: string;
  /** 1-based line, when the source carried one. */
  line?: number;
  /** The slug of the artifact the finding is about, when it has one. */
  slug?: string;
  /** For `dangling-ref`: the authored ref value that did not resolve. */
  ref?: string;
  /** For `dangling-ref`: the field the ref was authored in (e.g. "actor", "feature", "userReqs", "systemRequirement"). */
  field?: string;
}

/**
 * The full derivation of one traceability tree against its runs. Every array
 * is deterministically ordered (nodes by slug, findings by a stable composite
 * key) so identical input yields a byte-identical snapshot.
 */
export interface TraceModel {
  /** The latest run all evidence is joined off (max `ts`, id-tiebroken), or `null` if there are no runs. */
  latestRun: RunRef | null;
  /** Scenarios — the executed units — sorted by slug. */
  scenarios: ScenarioNode[];
  /** System-requirements (Rules), sorted by slug. */
  systemRequirements: SysReqNode[];
  /** User-requirements, sorted by slug. */
  userRequirements: UserReqNode[];
  /** Features, sorted by slug. */
  features: FeatureNode[];
  /** Scenarios with a result in the latest run ÷ all scenarios (spec §4.7). */
  scenarioCoverage: Meter;
  /** UserReqs with ≥1 rule-proven verifying sysreq ÷ all userReqs (spec §4.7). */
  userReqCoverage: Meter;
  /** Passing scenarios ÷ scenarios with evidence in the latest run (`skip` counts as evidence). */
  passRate: Meter;
  /** Diagnostics, deterministically ordered. */
  findings: Finding[];
}

/** Re-exported input evidence type for consumers wiring `buildModel`. */
export type { TestRun };
