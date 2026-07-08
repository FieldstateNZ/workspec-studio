import type { LinksField } from '@workspec/c4-schema';

const TREE_ROOTED_PREFIX = '~/';

/**
 * Extracts every `~/`-rooted link target from an element's `links` field,
 * converted to a repo-relative path (the `~/` stripped) ready to check
 * against a `C4FileSource`. `@workspace/`-rooted entries are omitted
 * entirely — they point at a published package, not this tree, and are
 * never diagnosable standalone (per the S3 design brief).
 */
export function elementLinkTargets(links: LinksField): readonly string[] {
  if (!links) return [];
  const targets: string[] = [];
  for (const entry of links) {
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'cardinality' || typeof value !== 'string') continue;
      if (value.startsWith(TREE_ROOTED_PREFIX)) {
        targets.push(value.slice(TREE_ROOTED_PREFIX.length));
      }
    }
  }
  return targets;
}
