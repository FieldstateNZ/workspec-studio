// The normative shapes for the traceability derivation engine — both the
// LOCATED-ARTIFACT input the engine consumes and the derived `TraceModel` it
// produces. This contract is normative: identical input must yield identical
// output across any conforming implementation (a future Rust CLI, WorkSpec
// Enterprise). See docs/traceability/spec.md §4.5–§4.7 and the package README.

import type {
  Actor,
  Feature,
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
// parsed `TestRun[]` (ingested evidence, spec §4.5).

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
 */
export interface TraceTree {
  actors: readonly Located<Actor>[];
  features: readonly Located<Feature>[];
  userRequirements: readonly Located<UserRequirement>[];
  systemRequirements: readonly Located<SystemRequirement>[];
}

// ── Output: derived model ────────────────────────────────────────────────────

/** The three explicit verdicts a run records for a sysreq (spec §4.5). */
export type EvidenceStatus = 'pass' | 'fail' | 'skip';

/**
 * A sysreq's latest-run proof state. `pass`/`fail`/`skip` are the recorded
 * verdicts; `unproven` is the DERIVED fourth state — the sysreq is in the tree
 * but absent from the latest run (spec §4.5: absence → unproven, never stored).
 */
export type SysReqProof = EvidenceStatus | 'unproven';

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
 * The latest-run evidence joined onto one sysreq (spec §4.5: keyed on the
 * sysreq slug ALONE — the file is the scenario, so there is no composite key).
 * Present only when the sysreq HAS a verdict in the latest run; a sysreq that
 * is `unproven` carries no `evidence`.
 *
 * NOTE: req-schema's `TestRun.results` is a flat `slug → verdict` map — it
 * carries no per-result `duration` or `failure` payload (spec §4.5). So this
 * shape exposes the verdict, the run it came from, and the run's timestamp/sha;
 * it deliberately does NOT invent a `failure`/`duration` field the evidence
 * format does not provide. (Issue #70's "duration, failure?" predates the
 * validated flat-map evidence shape.)
 */
export interface Evidence {
  /** The sysreq slug this evidence proves. */
  sysreq: string;
  /** Id of the latest run that carried a verdict for this sysreq. */
  runId: string;
  status: EvidenceStatus;
  /** The run's ISO-8601 timestamp (`TestRun.ts`). */
  at: string;
  /** The run's commit SHA, when it carried one. */
  sha?: string;
}

/** One system-requirement's derivation: its verifies edges and latest-run proof. */
export interface SysReqNode {
  slug: string;
  title: string;
  /** The containing feature slug (bare-slug ref → features/*, as authored). */
  feature: string;
  /** User-requirement slugs this scenario claims to verify (as authored), sorted. */
  verifies: string[];
  /** Latest-run proof state — `unproven` when absent from the latest run. */
  proof: SysReqProof;
  /** The joined evidence, present iff `proof !== 'unproven'`. */
  evidence?: Evidence;
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
  /** Slugs of the sysreqs whose `userReqs` include this slug (the verifies edge), sorted. */
  verifiedBy: string[];
  /** Subset of `verifiedBy` whose latest-run proof is `pass`, sorted. */
  passingSysReqs: string[];
  /** True iff ≥1 verifying sysreq passes in the latest run — the coverage predicate. */
  covered: boolean;
  /** True iff NO sysreq verifies it — the headline orphan finding (spec §4.6). */
  orphan: boolean;
  source: SourceLocation;
}

/** One feature's derivation: the userReqs and sysreqs that attach to it. */
export interface FeatureNode {
  slug: string;
  name: string;
  /** userReq slugs that list this feature in `features[]`, sorted. */
  userRequirements: string[];
  /** sysreq slugs whose `feature` is this feature, sorted. */
  systemRequirements: string[];
  /** True iff the feature has no userReqs OR no sysreqs — not fully wired (spec §4.6). */
  orphan: boolean;
  source: SourceLocation;
}

/**
 * A meter as numerator/denominator/ratio, never collapsed to a bare float —
 * so the UI/CLI can show "N of M", not just a percentage (spec §5: coverage
 * and pass-rate are two SEPARATE meters, never merged). `ratio` is raw and
 * unclamped; it is `1` when `denominator` is `0` (the vacuous case: nothing to
 * cover / no evidence yet).
 */
export interface Meter {
  numerator: number;
  denominator: number;
  ratio: number;
}

/** The finding taxonomy (spec §4.6 + issue #70 diagnostics). */
export type FindingKind =
  'orphan-user-requirement' | 'orphan-feature' | 'dangling-ref' | 'duplicate-slug';

/**
 * Severity lets the T4 `verify` CI gate decide what fails the build: dangling
 * intra-tree refs and duplicate slugs are `error` (typo/identity bugs the spec
 * §4.7 says make `verify` fail); the orphan findings are `warning` diagnostics.
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
  /** For `dangling-ref`: the field the ref was authored in (e.g. "actor", "feature", "userReqs"). */
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
  /** System-requirements, sorted by slug. */
  systemRequirements: SysReqNode[];
  /** User-requirements, sorted by slug. */
  userRequirements: UserReqNode[];
  /** Features, sorted by slug. */
  features: FeatureNode[];
  /** Coverage meter — userReq-centric: userReqs with ≥1 PASSING verifying sysreq ÷ all userReqs. */
  coverage: Meter;
  /** Pass-rate meter — sysreq-centric: passing sysreqs ÷ sysreqs WITH evidence in the latest run. */
  passRate: Meter;
  /** Diagnostics, deterministically ordered. */
  findings: Finding[];
}

/** Re-exported input evidence type for consumers wiring `buildModel`. */
export type { TestRun };
