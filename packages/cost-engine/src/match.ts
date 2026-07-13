// Rule matching: glob compilation + the AND-of-present-fields match
// predicate. Exported standalone (not just used internally) because the C5
// workbench needs the exact same predicate to preview a draft rule.

import type { InventoryResourceType, RuleType } from '@workspec/cost-schema';

/** Escape a string for literal inclusion in a `RegExp` source. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile a glob into an anchored `RegExp`. `*` is the only wildcard: split
 * the glob on `*`, regex-escape each part, join with `.*`, anchor `^…$`.
 */
export function globToRegExp(glob: string): RegExp {
  const parts = glob.split('*').map(escapeRegExp);
  return new RegExp(`^${parts.join('.*')}$`);
}

function globMatches(glob: string, value: string): boolean {
  return globToRegExp(glob).test(value);
}

/**
 * Does `resource` match `rule.match`? ALL present fields must match (logical
 * AND); an empty match object (`{}`) matches every resource.
 *
 * - `resourceType` — exact match on `resource.type`.
 * - `nameGlob` — glob match on `resource.name`.
 * - `resourceGroup` — glob match on `resource.resourceGroup`.
 * - `subscription` — exact match on `resource.subscription`.
 * - `tagEquals` — the named tag is present AND strictly equal to the given value.
 * - `tagExists` — the named tag is present (value irrelevant).
 */
export function matchRule(rule: Pick<RuleType, 'match'>, resource: InventoryResourceType): boolean {
  const m = rule.match;
  if (m.resourceType !== undefined && resource.type !== m.resourceType) return false;
  if (m.nameGlob !== undefined && !globMatches(m.nameGlob, resource.name)) return false;
  if (m.resourceGroup !== undefined && !globMatches(m.resourceGroup, resource.resourceGroup)) return false;
  if (m.subscription !== undefined && resource.subscription !== m.subscription) return false;
  if (m.tagEquals !== undefined && resource.tags?.[m.tagEquals.name] !== m.tagEquals.value) return false;
  if (m.tagExists !== undefined && resource.tags?.[m.tagExists] === undefined) return false;
  return true;
}
