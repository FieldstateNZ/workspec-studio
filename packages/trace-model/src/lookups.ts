// Thin, pure lookups over a derived `TraceModel`. The groupings are already
// baked into the nodes (so the snapshot is the contract); these just resolve
// the slug lists to the node objects for ergonomic consumers (spec §4.6 names
// `sysreqsOf(feature)`). Each returns nodes in the model's canonical slug
// order, or `[]` when the anchor slug is unknown.

import type { SysReqNode, TraceModel, UserReqNode } from './types.js';

/** System-requirements whose `feature` is `featureSlug`, in slug order. */
export function sysreqsOf(model: TraceModel, featureSlug: string): SysReqNode[] {
  const feature = model.features.find((f) => f.slug === featureSlug);
  if (!feature) return [];
  const set = new Set(feature.systemRequirements);
  return model.systemRequirements.filter((s) => set.has(s.slug));
}

/** User-requirements that list `featureSlug` in their `features[]`, in slug order. */
export function userReqsOf(model: TraceModel, featureSlug: string): UserReqNode[] {
  const feature = model.features.find((f) => f.slug === featureSlug);
  if (!feature) return [];
  const set = new Set(feature.userRequirements);
  return model.userRequirements.filter((u) => set.has(u.slug));
}

/** System-requirements that verify `userReqSlug` (its `verifiedBy`), in slug order. */
export function verifiersOf(model: TraceModel, userReqSlug: string): SysReqNode[] {
  const userReq = model.userRequirements.find((u) => u.slug === userReqSlug);
  if (!userReq) return [];
  const set = new Set(userReq.verifiedBy);
  return model.systemRequirements.filter((s) => set.has(s.slug));
}
