// Generic slug-indexing shared by every artifact kind (actor, feature,
// userReq, sysreq/Rule, and now scenario): dedupes by slug — first by file
// sort wins — and emits a `duplicate-slug` finding for every colliding file,
// so derivation stays deterministic even when the tree has a collision.
// Because this is generic over `A`, adding the fifth kind (scenario) needed
// no new duplicate-detection logic — just another call site (spec §4.7:
// "duplicate-slug now also covers scenarios").

import type { Finding, Located } from './types.js';
import { byString } from './ordering.js';
import { makeFinding } from './findings.js';

/** A slug-indexed view of one artifact kind, plus the duplicate-slug findings it produced. */
export interface Indexed<A> {
  /** slug → canonical located artifact (first by file sort when a slug collides). */
  canonical: Map<string, Located<A>>;
  /** Canonical located artifacts, sorted by slug — the derivation iterates these. */
  ordered: Located<A>[];
  findings: Finding[];
}

/**
 * Index one kind's located artifacts by slug. When two files of the SAME kind
 * share a slug, every colliding file gets a `duplicate-slug` finding and the
 * first (by file sort) is kept canonical, so lookups stay deterministic.
 */
export function indexBySlug<A>(located: readonly Located<A>[], kindLabel: string): Indexed<A> {
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
