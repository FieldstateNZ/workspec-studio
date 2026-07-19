// Every bare-slug intra-tree ref that points at a slug absent from the tree —
// a typo or a deleted target (spec §4.7: intra-tree dangling → `verify`
// fails). Anchored at the source of the artifact HOLDING the ref. Cross-layer
// `links` are never checked here — they are inert if unresolvable, by design.
//
// Five refs are checked: `userReq.actor` → actors, `userReq.features[]` →
// features, `sysreq.feature` → features, `sysreq.userReqs[]` → userReqs, and
// `scenario.systemRequirement` → sysreqs (the new fifth-kind ref).

import type { Scenario, SystemRequirement, UserRequirement } from '@workspec/req-schema';
import type { Finding, Located, SourceLocation } from './types.js';
import { makeFinding } from './findings.js';

/** The canonical slug sets a ref may resolve against, one per target kind. */
export interface ResolverSets {
  actorSlugs: ReadonlyMap<string, unknown>;
  featureSlugs: ReadonlyMap<string, unknown>;
  userReqSlugs: ReadonlyMap<string, unknown>;
  sysReqSlugs: ReadonlyMap<string, unknown>;
}

/**
 * Collect every dangling intra-tree ref across user-requirements,
 * system-requirements (Rules), and scenarios.
 */
export function collectDanglingRefs(
  userReqs: readonly Located<UserRequirement>[],
  sysReqs: readonly Located<SystemRequirement>[],
  scenarios: readonly Located<Scenario>[],
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

  for (const { slug, source, artifact } of scenarios) {
    const spec = artifact.spec;
    if (!sets.sysReqSlugs.has(spec.systemRequirement)) {
      dangling(source, slug, 'systemRequirement', spec.systemRequirement, 'system-requirement');
    }
  }

  return findings;
}
