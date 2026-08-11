import { layoutPathFor, parseLayoutYaml, serializeLayout } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';

/** Which `.layout/` entries to scrub: node pins by ref, edge hints by exact `"from->to"` key. */
export interface LayoutScrubRefs {
  readonly nodes?: readonly string[];
  readonly edges?: readonly string[];
}

/**
 * Removes stale entries from a diagram's `.layout/` file after a diagram
 * mutation: node pins for removed nodes (plus every edge hint touching
 * them — a hint keyed `"a->b"` is stale the moment either endpoint's node
 * goes), and edge hints for removed edges. Without this, the next model
 * load reports `orphan-layout-node`/`orphan-layout-edge-hint` warnings for
 * entries this API itself stranded.
 *
 * Same best-effort stance as `upsertLayoutPin`: a missing or unparseable
 * layout file is left alone, and the file is only rewritten when something
 * actually changed. Resolves `true` when a write happened.
 */
export async function scrubLayoutRefs(
  source: C4FileSource,
  diagramSlug: string,
  refs: LayoutScrubRefs,
): Promise<boolean> {
  const path = layoutPathFor(diagramSlug);
  if (!(await source.exists(path))) return false;
  const parsed = parseLayoutYaml(await source.readFile(path));
  if (!parsed.ok) return false;

  const staleNodes = new Set(refs.nodes ?? []);
  const staleEdges = new Set(refs.edges ?? []);
  const touchesStaleNode = (edgeKey: string): boolean => {
    // Edge keys are `"<from>-><to>"`; endpoints can never contain `>` so
    // the first `->` split is unambiguous.
    const arrow = edgeKey.indexOf('->');
    if (arrow === -1) return false;
    return staleNodes.has(edgeKey.slice(0, arrow)) || staleNodes.has(edgeKey.slice(arrow + 2));
  };

  let changed = false;
  const nodes = Object.fromEntries(
    Object.entries(parsed.data.nodes).filter(([ref]) => {
      const keep = !staleNodes.has(ref);
      if (!keep) changed = true;
      return keep;
    }),
  );
  const edgeEntries = Object.entries(parsed.data.edges ?? {}).filter(([key]) => {
    const keep = !staleEdges.has(key) && !touchesStaleNode(key);
    if (!keep) changed = true;
    return keep;
  });

  if (!changed) return false;
  // Preserve `edges` absence: a layout that never had hints must not gain
  // an empty `edges: {}` stanza as a scrub side effect.
  const next = { ...parsed.data, nodes };
  if (parsed.data.edges !== undefined) next.edges = Object.fromEntries(edgeEntries);
  await source.writeFile(path, serializeLayout(next));
  return true;
}
