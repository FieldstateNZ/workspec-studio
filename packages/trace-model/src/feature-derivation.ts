// Feature derivation: the userReq/sysreq (Rule) groupings each feature
// attaches, and the not-fully-wired `orphan-feature` finding.

import type { Feature, SystemRequirement, UserRequirement } from '@workspec/req-schema';
import type { FeatureNode, Finding, Located } from './types.js';
import { sortedUnique } from './ordering.js';
import { makeFinding } from './findings.js';

/** Derive every feature's node: which userReqs/sysreqs attach, and whether either side is empty. */
export function deriveFeatures(
  features: readonly Located<Feature>[],
  userReqs: readonly Located<UserRequirement>[],
  sysReqs: readonly Located<SystemRequirement>[],
): { features: FeatureNode[]; findings: Finding[] } {
  const userReqsByFeature = new Map<string, string[]>();
  for (const located of userReqs) {
    for (const feature of located.artifact.spec.features) {
      const list = userReqsByFeature.get(feature);
      if (list) list.push(located.slug);
      else userReqsByFeature.set(feature, [located.slug]);
    }
  }
  const sysReqsByFeature = new Map<string, string[]>();
  for (const located of sysReqs) {
    const feature = located.artifact.spec.feature;
    const list = sysReqsByFeature.get(feature);
    if (list) list.push(located.slug);
    else sysReqsByFeature.set(feature, [located.slug]);
  }

  const findings: Finding[] = [];
  const featureNodes: FeatureNode[] = features.map((located) => {
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

  return { features: featureNodes, findings };
}
