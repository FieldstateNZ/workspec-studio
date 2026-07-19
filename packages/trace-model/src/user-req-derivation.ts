// User-requirement derivation: which Rules verify a promise, which of those
// are actually rule-proven, and the headline `orphan-user-requirement`
// finding (spec §4.7: a promise no Rule verifies at all).

import type { UserRequirement } from '@workspec/req-schema';
import type { Finding, Located, UserReqNode } from './types.js';
import { sortedUnique } from './ordering.js';
import { makeFinding } from './findings.js';

/** Derive every user-requirement's node from the `verifiedBy` edge map Rule derivation built. */
export function deriveUserRequirements(
  userReqs: readonly Located<UserRequirement>[],
  verifiedBy: ReadonlyMap<string, string[]>,
  ruleProvenBySysReq: ReadonlyMap<string, boolean>,
): { userRequirements: UserReqNode[]; findings: Finding[] } {
  const findings: Finding[] = [];

  const userRequirements: UserReqNode[] = userReqs.map((located) => {
    const { slug, source } = located;
    const spec = located.artifact.spec;
    const verifiers = sortedUnique(verifiedBy.get(slug) ?? []);
    const provenBy = verifiers.filter((s) => ruleProvenBySysReq.get(s) === true);
    const covered = provenBy.length > 0;
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
      provenBy,
      covered,
      orphan,
      source,
    } satisfies UserReqNode;
  });

  return { userRequirements, findings };
}
