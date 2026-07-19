// The derivation engine: `buildModel(tree, runs) → TraceModel`.
//
// PURE and DETERMINISTIC — no IO, no DOM, no `Date.now()`/`Math.random()`, and
// it NEVER throws (every problem surfaces as a `Finding`). It derives — never
// stores — the traceability graph the spec §4.6 defines: the evidence join,
// the two meters (coverage + pass-rate), and the diagnostic findings.

import type {
  Actor,
  Feature,
  SystemRequirement,
  TestRun,
  UserRequirement,
} from '@workspec/req-schema';
import type {
  Evidence,
  FeatureNode,
  Finding,
  FindingKind,
  FindingSeverity,
  Located,
  Meter,
  RunRef,
  SourceLocation,
  SysReqNode,
  SysReqProof,
  TraceModel,
  TraceTree,
  UserReqNode,
} from './types.js';

/** A slug-indexed view of one artifact kind, plus the duplicate-slug findings it produced. */
interface Indexed<A> {
  /** slug → canonical located artifact (first by file sort when a slug collides). */
  canonical: Map<string, Located<A>>;
  /** Canonical located artifacts, sorted by slug — the derivation iterates these. */
  ordered: Located<A>[];
  findings: Finding[];
}

/** Lexicographic string compare (stable, locale-independent) — the ordering primitive. */
function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** A fresh sorted copy of a string array (never mutates the input). */
function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(byString);
}

interface FindingInput {
  kind: FindingKind;
  severity: FindingSeverity;
  message: string;
  file: string;
  line?: number | undefined;
  slug?: string | undefined;
  ref?: string | undefined;
  field?: string | undefined;
}

/** Build a `Finding`, omitting (rather than setting to `undefined`) absent optional fields. */
function makeFinding(input: FindingInput): Finding {
  return {
    kind: input.kind,
    severity: input.severity,
    message: input.message,
    file: input.file,
    ...(input.line !== undefined ? { line: input.line } : {}),
    ...(input.slug !== undefined ? { slug: input.slug } : {}),
    ...(input.ref !== undefined ? { ref: input.ref } : {}),
    ...(input.field !== undefined ? { field: input.field } : {}),
  };
}

/** Total order over findings so the array is byte-stable / CI-diffable. */
function compareFindings(a: Finding, b: Finding): number {
  return (
    byString(a.file, b.file) ||
    (a.line ?? 0) - (b.line ?? 0) ||
    byString(a.kind, b.kind) ||
    byString(a.slug ?? '', b.slug ?? '') ||
    byString(a.field ?? '', b.field ?? '') ||
    byString(a.ref ?? '', b.ref ?? '') ||
    byString(a.message, b.message)
  );
}

/**
 * Index one kind's located artifacts by slug. When two files of the SAME kind
 * share a slug, every colliding file gets a `duplicate-slug` finding and the
 * first (by file sort) is kept canonical, so lookups stay deterministic.
 */
function indexBySlug<A>(located: readonly Located<A>[], kindLabel: string): Indexed<A> {
  const bySlug = new Map<string, Located<A>[]>();
  for (const item of located) {
    const group = bySlug.get(item.slug);
    if (group) group.push(item);
    else bySlug.set(item.slug, [item]);
  }

  const canonical = new Map<string, Located<A>>();
  const findings: Finding[] = [];
  for (const [slug, group] of bySlug) {
    const sorted = [...group].sort((x, y) => byString(x.source.file, y.source.file));
    const first = sorted[0];
    if (first) canonical.set(slug, first);
    if (sorted.length > 1) {
      const files = sorted.map((g) => g.source.file);
      for (const g of sorted) {
        findings.push(
          makeFinding({
            kind: 'duplicate-slug',
            severity: 'error',
            message: `duplicate ${kindLabel} slug "${slug}": also defined in ${files
              .filter((f) => f !== g.source.file)
              .join(', ')}`,
            file: g.source.file,
            line: g.source.line,
            slug,
          }),
        );
      }
    }
  }

  const ordered = [...canonical.values()].sort((x, y) => byString(x.slug, y.slug));
  return { canonical, ordered, findings };
}

/** Pick the latest run: max timestamp, ties broken by the greater id. Pure, no clock. */
function selectLatestRun(runs: readonly TestRun[]): TestRun | null {
  let latest: TestRun | null = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const run of runs) {
    const parsed = Date.parse(run.ts);
    const time = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
    if (latest === null) {
      latest = run;
      latestTime = time;
      continue;
    }
    if (time > latestTime) {
      latest = run;
      latestTime = time;
    } else if (time === latestTime) {
      // Deterministic tiebreak on equal (or unparseable) timestamps.
      if (run.ts > latest.ts || (run.ts === latest.ts && run.id > latest.id)) {
        latest = run;
        latestTime = time;
      }
    }
  }
  return latest;
}

function toRunRef(run: TestRun): RunRef {
  return {
    id: run.id,
    ts: run.ts,
    emitter: run.emitter,
    ...(run.sha !== undefined ? { sha: run.sha } : {}),
    ...(run.ci !== undefined ? { ci: run.ci } : {}),
  };
}

/**
 * Derive the full traceability model for one tree against its runs.
 *
 * v0 is latest-run-only (spec §9.4) and single-tree (spec §9.5). The result is
 * fully deterministic: every array is sorted, so identical input yields a
 * byte-identical value.
 */
export function buildModel(tree: TraceTree, runs: readonly TestRun[]): TraceModel {
  const actors = indexBySlug<Actor>(tree.actors, 'Actor');
  const features = indexBySlug<Feature>(tree.features, 'Feature');
  const userReqs = indexBySlug<UserRequirement>(tree.userRequirements, 'UserRequirement');
  const sysReqs = indexBySlug<SystemRequirement>(tree.systemRequirements, 'SystemRequirement');

  const latestRun = selectLatestRun(runs);
  const results = latestRun?.results ?? {};

  const findings: Finding[] = [
    ...actors.findings,
    ...features.findings,
    ...userReqs.findings,
    ...sysReqs.findings,
  ];

  // ── System-requirements: evidence join + proof, and the verifies edges ──────
  //
  // `verifiedBy`: userReq slug → sysreq slugs whose `userReqs` include it.
  const verifiedBy = new Map<string, string[]>();
  const systemRequirements: SysReqNode[] = sysReqs.ordered.map((located) => {
    const { slug, source } = located;
    const spec = located.artifact.spec;

    for (const target of spec.userReqs) {
      const list = verifiedBy.get(target);
      if (list) list.push(slug);
      else verifiedBy.set(target, [slug]);
    }

    const status = results[slug];
    const proof: SysReqProof = status ?? 'unproven';
    const evidence: Evidence | undefined =
      status !== undefined && latestRun !== null
        ? {
            sysreq: slug,
            runId: latestRun.id,
            status,
            at: latestRun.ts,
            ...(latestRun.sha !== undefined ? { sha: latestRun.sha } : {}),
          }
        : undefined;

    return {
      slug,
      title: spec.title,
      feature: spec.feature,
      verifies: sortedUnique(spec.userReqs),
      proof,
      ...(evidence !== undefined ? { evidence } : {}),
      source,
    } satisfies SysReqNode;
  });

  const proofBySysReq = new Map<string, SysReqProof>(
    systemRequirements.map((node) => [node.slug, node.proof]),
  );

  // ── User-requirements: coverage predicate + the headline orphan finding ─────
  const userRequirements: UserReqNode[] = userReqs.ordered.map((located) => {
    const { slug, source } = located;
    const spec = located.artifact.spec;
    const verifiers = sortedUnique(verifiedBy.get(slug) ?? []);
    const passingSysReqs = verifiers.filter((s) => proofBySysReq.get(s) === 'pass');
    const covered = passingSysReqs.length > 0;
    const orphan = verifiers.length === 0;

    if (orphan) {
      findings.push(
        makeFinding({
          kind: 'orphan-user-requirement',
          severity: 'warning',
          message: `user-requirement "${slug}" is an unverified promise: no system-requirement verifies it`,
          file: source.file,
          line: source.line,
          slug,
        }),
      );
    }

    return {
      slug,
      title: spec.title,
      actor: spec.actor,
      features: sortedUnique(spec.features),
      status: spec.status,
      verifiedBy: verifiers,
      passingSysReqs,
      covered,
      orphan,
      source,
    } satisfies UserReqNode;
  });

  // ── Features: the userReq/sysreq groupings + not-fully-wired finding ────────
  const userReqsByFeature = new Map<string, string[]>();
  for (const located of userReqs.ordered) {
    for (const feature of located.artifact.spec.features) {
      const list = userReqsByFeature.get(feature);
      if (list) list.push(located.slug);
      else userReqsByFeature.set(feature, [located.slug]);
    }
  }
  const sysReqsByFeature = new Map<string, string[]>();
  for (const located of sysReqs.ordered) {
    const feature = located.artifact.spec.feature;
    const list = sysReqsByFeature.get(feature);
    if (list) list.push(located.slug);
    else sysReqsByFeature.set(feature, [located.slug]);
  }

  const featureNodes: FeatureNode[] = features.ordered.map((located) => {
    const { slug, source } = located;
    const spec = located.artifact.spec;
    const featureUserReqs = sortedUnique(userReqsByFeature.get(slug) ?? []);
    const featureSysReqs = sortedUnique(sysReqsByFeature.get(slug) ?? []);
    const orphan = featureUserReqs.length === 0 || featureSysReqs.length === 0;

    if (orphan) {
      const missing: string[] = [];
      if (featureUserReqs.length === 0) missing.push('user-requirements');
      if (featureSysReqs.length === 0) missing.push('system-requirements');
      findings.push(
        makeFinding({
          kind: 'orphan-feature',
          severity: 'warning',
          message: `feature "${slug}" has no ${missing.join(' and no ')}`,
          file: source.file,
          line: source.line,
          slug,
        }),
      );
    }

    return {
      slug,
      name: spec.name,
      userRequirements: featureUserReqs,
      systemRequirements: featureSysReqs,
      orphan,
      source,
    } satisfies FeatureNode;
  });

  // ── Dangling intra-tree refs (spec §4.7). Cross-layer `links` are NOT
  //    checked here — they are inert if unresolvable, by design. ──────────────
  collectDanglingRefs(userReqs.ordered, sysReqs.ordered, {
    actorSlugs: actors.canonical,
    featureSlugs: features.canonical,
    userReqSlugs: userReqs.canonical,
  }).forEach((f) => findings.push(f));

  // ── Meters ──────────────────────────────────────────────────────────────────
  const coverage = meter(userRequirements.filter((u) => u.covered).length, userRequirements.length);
  const evidencedSysReqs = systemRequirements.filter((s) => s.proof !== 'unproven');
  const passRate = meter(
    evidencedSysReqs.filter((s) => s.proof === 'pass').length,
    evidencedSysReqs.length,
  );

  findings.sort(compareFindings);

  return {
    latestRun: latestRun !== null ? toRunRef(latestRun) : null,
    systemRequirements,
    userRequirements,
    features: featureNodes,
    coverage,
    passRate,
    findings,
  };
}

/** `numerator/denominator`; `ratio` is `1` when `denominator` is `0` (vacuous). */
function meter(numerator: number, denominator: number): Meter {
  return { numerator, denominator, ratio: denominator === 0 ? 1 : numerator / denominator };
}

interface ResolverSets {
  actorSlugs: ReadonlyMap<string, unknown>;
  featureSlugs: ReadonlyMap<string, unknown>;
  userReqSlugs: ReadonlyMap<string, unknown>;
}

/**
 * Every bare-slug intra-tree ref that points at a slug absent from the tree —
 * a typo or a deleted target (spec §4.7: intra-tree dangling → `verify` fails).
 * Anchored at the source of the artifact HOLDING the ref.
 */
function collectDanglingRefs(
  userReqs: readonly Located<UserRequirement>[],
  sysReqs: readonly Located<SystemRequirement>[],
  sets: ResolverSets,
): Finding[] {
  const findings: Finding[] = [];

  const dangling = (
    holder: SourceLocation,
    holderSlug: string,
    field: string,
    ref: string,
    targetKind: string,
  ): void => {
    findings.push(
      makeFinding({
        kind: 'dangling-ref',
        severity: 'error',
        message: `${field} "${ref}" does not resolve to any ${targetKind} in the tree`,
        file: holder.file,
        line: holder.line,
        slug: holderSlug,
        ref,
        field,
      }),
    );
  };

  for (const { slug, source, artifact } of userReqs) {
    const spec = artifact.spec;
    if (!sets.actorSlugs.has(spec.actor)) dangling(source, slug, 'actor', spec.actor, 'actor');
    for (const feature of spec.features) {
      if (!sets.featureSlugs.has(feature)) dangling(source, slug, 'features', feature, 'feature');
    }
  }

  for (const { slug, source, artifact } of sysReqs) {
    const spec = artifact.spec;
    if (!sets.featureSlugs.has(spec.feature)) {
      dangling(source, slug, 'feature', spec.feature, 'feature');
    }
    for (const userReq of spec.userReqs) {
      if (!sets.userReqSlugs.has(userReq)) {
        dangling(source, slug, 'userReqs', userReq, 'user-requirement');
      }
    }
  }

  return findings;
}
