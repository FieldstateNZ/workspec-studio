// The pure, deterministic core of `import-aspire`: turns a validated
// `AspireGraph` into the tree of elements/edges/system it projects to.
// Neither `scaffold` (which writes this) nor `check` (which diffs against
// it) touches the filesystem here — this is the single "what should the tree
// look like" computation both share.

import { artifactPathFor, slugify } from '@workspec/c4-schema';
import type { ElementBucket } from './classify.js';
import { classifyResource } from './classify.js';
import type { AspireGraph, AspireReferenceVia, AspireResource } from './graph-schema.js';

/** One Aspire resource projected into a `.workspec/` element. */
export interface ProjectedElement {
  readonly kind: ElementBucket;
  /** Sanitized, collision-deduped slug (the filename minus `.yaml`). */
  readonly slug: string;
  /** Repo-relative path this element is written to/read from. */
  readonly path: string;
  /** The original Aspire resource name (pre-slugify), for messages. */
  readonly resourceName: string;
  readonly typeName: string;
  readonly title: string;
  readonly description: string;
  /** Only ever set for `container`/`database`/`queue` (external systems have no `technology` field). */
  readonly technology?: string;
}

/** One edge of the generated `aspire-container` diagram, between two {@link ProjectedElement} slugs. */
export interface ProjectedEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

/** The singleton `system/*.yaml` `import-aspire` creates when the tree has none. */
export interface ProjectedSystem {
  readonly slug: string;
  readonly title: string;
  readonly description: string;
}

/** Everything one `AspireGraph` projects to. */
export interface AspireProjection {
  readonly system: ProjectedSystem;
  readonly elements: readonly ProjectedElement[];
  readonly edges: readonly ProjectedEdge[];
  /** Resource names skipped because they are `kind: "parameter"`. */
  readonly skippedParameters: readonly string[];
}

/** Human-readable edge label for a reference with no authored `label`. `undefined` omits the label entirely. */
function labelForVia(via: AspireReferenceVia): string | undefined {
  switch (via) {
    case 'connection-string':
      return 'connection string';
    case 'endpoint':
      return 'endpoint';
    case 'environment':
      return 'environment variable';
    case 'wait':
      return 'waits for';
    case 'relationship':
      return 'relationship';
    case 'unknown':
      return undefined;
  }
}

/** Assigns `base`, or `base-2`, `base-3`, ... deterministically on repeat, tracked in `used`. */
function dedupeSlug(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0;
  used.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function describeElement(resource: AspireResource, parentBucket: ElementBucket | 'skip' | undefined): string {
  const parentNote =
    resource.parent !== null &&
    resource.parent !== undefined &&
    parentBucket !== undefined &&
    parentBucket !== 'skip'
      ? ` Child of Aspire resource "${resource.parent}".`
      : '';
  return `Imported from the Aspire apphost graph as the "${resource.typeName}" resource "${resource.name}".${parentNote}`;
}

/**
 * Projects a validated `AspireGraph` into the desired `.workspec/` tree:
 * one element per non-skipped resource, one edge per resolvable reference
 * plus one synthesized `contains` edge per mapped parent/child pair, and
 * the system singleton. Pure and deterministic — and order-independent:
 * resources are sorted by name (ordinal) before any slug/collision/order
 * assignment, so the same set of resources produces the same projection
 * regardless of the producer's array order. That is what makes `scaffold`
 * idempotent and `check` stable.
 */
export function projectAspireGraph(graph: AspireGraph): AspireProjection {
  // Canonical order: the producer's array order is an implementation detail
  // of resource enumeration in the apphost — sort by name (ordinal) up front
  // so nothing downstream (slugs, collision suffixes, node/edge order)
  // depends on it.
  const resources = [...graph.resources].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );

  const bucketByName = new Map<string, ElementBucket | 'skip'>();
  for (const resource of resources) {
    bucketByName.set(resource.name, classifyResource(resource));
  }

  const usedSlugs = new Map<string, number>();
  const slugByName = new Map<string, string>();
  const elements: ProjectedElement[] = [];
  const skippedParameters: string[] = [];

  for (const resource of resources) {
    const bucket = bucketByName.get(resource.name);
    if (bucket === undefined || bucket === 'skip') {
      skippedParameters.push(resource.name);
      continue;
    }

    const slug = dedupeSlug(slugify(resource.name), usedSlugs);
    slugByName.set(resource.name, slug);

    const parentBucket =
      resource.parent !== null && resource.parent !== undefined
        ? bucketByName.get(resource.parent)
        : undefined;
    const technology =
      bucket === 'external-system' ? undefined : (resource.image ?? resource.command ?? undefined);

    elements.push({
      kind: bucket,
      slug,
      path: artifactPathFor(bucket, slug),
      resourceName: resource.name,
      typeName: resource.typeName,
      title: resource.name,
      description: describeElement(resource, parentBucket),
      ...(technology !== undefined ? { technology } : {}),
    });
  }

  const edges: ProjectedEdge[] = [];
  const seenEdgeKeys = new Set<string>();
  for (const resource of resources) {
    const fromSlug = slugByName.get(resource.name);
    if (fromSlug === undefined) continue; // resource itself was skipped

    for (const reference of resource.references) {
      const toSlug = slugByName.get(reference.target);
      if (toSlug === undefined) continue; // target skipped, or not in the graph at all
      if (toSlug === fromSlug) continue; // no self-loops

      const label = reference.label ?? labelForVia(reference.via);
      const key = `${fromSlug}=>${toSlug}::${label ?? ''}`;
      if (seenEdgeKeys.has(key)) continue;
      seenEdgeKeys.add(key);

      edges.push({ from: fromSlug, to: toSlug, ...(label !== undefined ? { label } : {}) });
    }
  }

  // Containment: the graph producer captures a parent/child relationship
  // ONLY in the child's `parent` field — `references` stays empty for e.g. a
  // Postgres server and its child database — so the edge is synthesized
  // here. It is part of the desired projection exactly like a
  // reference-derived edge: `check` governs it with the same
  // edge-missing/edge-orphaned/label-drift codes.
  for (const resource of resources) {
    if (resource.parent === null || resource.parent === undefined) continue;
    const childSlug = slugByName.get(resource.name);
    const parentSlug = slugByName.get(resource.parent);
    if (childSlug === undefined || parentSlug === undefined) continue; // either side skipped, or parent absent
    if (parentSlug === childSlug) continue; // no self-loops

    const key = `${parentSlug}=>${childSlug}::contains`;
    if (seenEdgeKeys.has(key)) continue;
    seenEdgeKeys.add(key);

    edges.push({ from: parentSlug, to: childSlug, label: 'contains' });
  }

  const systemSlug = slugify(graph.apphost.name);
  const system: ProjectedSystem = {
    slug: systemSlug,
    title: graph.apphost.name,
    description: `${graph.apphost.name} — imported from the Aspire apphost graph via workspec-c4 import-aspire.`,
  };

  return { system, elements, edges, skippedParameters };
}

const NODE_KIND_ORDER: Record<ElementBucket, number> = {
  container: 0,
  database: 1,
  queue: 2,
  'external-system': 3,
};

/**
 * Orders elements for the generated diagram's `nodes:` array — grouped by
 * kind (container, database, queue, external-system, matching the repo's own
 * hand-authored convention), resource-name order (the projection's canonical
 * order) preserved within each group. Purely cosmetic: has no bearing on
 * element file writes or `check`'s comparisons, which are keyed by
 * path/slug, not array position.
 */
export function orderedNodesFor(elements: readonly ProjectedElement[]): readonly ProjectedElement[] {
  return [...elements].sort((a, b) => NODE_KIND_ORDER[a.kind] - NODE_KIND_ORDER[b.kind]);
}
