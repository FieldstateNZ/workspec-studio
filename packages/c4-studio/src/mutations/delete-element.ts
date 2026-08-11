import { parseDocument } from 'yaml';
import {
  TYPE_DIRECTORIES,
  WORKSPEC_DIR,
  artifactPathFor,
  parseDiagramYaml,
  slugFromPath,
} from '@workspec/c4-schema';
import { ELEMENT_KINDS } from '@workspec/c4-model';
import type { C4FileSource, ElementKind } from '@workspec/c4-model';
import type { DeleteElementRequest } from './delete-element-request.js';
import { diagramNodeRef } from './diagram-node-ref.js';
import { locateElement } from './locate-element.js';
import { mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import { scrubLayoutRefs } from './layout-scrub.js';
import type { TreeIo } from './tree-io.js';
import { applyYamlSourceEdits } from './yaml-source-edit.js';
import type { YamlSourceEdit } from './yaml-source-edit.js';

/** What `deleteElement` reports back on success. */
export interface DeletedElement {
  readonly kind: ElementKind;
  readonly slug: string;
  readonly removedPath: string;
  /** Slugs of every diagram that had references scrubbed. */
  readonly scrubbedDiagrams: readonly string[];
}

/**
 * Deletes an element file and scrubs the references that would otherwise
 * dangle. This is the tree-wide "delete element everywhere" action (the
 * canvas node-delete gesture is diagram-scoped — see `removeDiagramNode`).
 *
 * NODE refs scrub by the tree-global bearer rule (slugs are
 * per-directory, so `domains/billing.yaml` and `actors/billing.yaml` can
 * coexist):
 *
 * - Typed refs naming the deleted kind (`{ domain: billing }`, or a fat
 *   node whose `type` matches) are removed always — they can only mean
 *   the deleted element.
 * - Bare refs (`{ slug: billing }`) are removed only when NO other kind
 *   bears the slug — the loader disambiguates a bare ref against the
 *   whole tree's bearer index, so with a survivor the ref re-resolves.
 *
 * EDGES scrub by the loader's DIAGRAM-LOCAL validity rule (A2 review
 * FIX 3): `resolveDiagramEdges` resolves each endpoint against the
 * diagram's OWN nodes — a tree-wide survivor is irrelevant to an edge
 * whose diagram no longer shows the slug. So an edge touching the deleted
 * slug survives if and only if, after the node scrub, this diagram still
 * carries a node ref for the slug; otherwise it would reload as an
 * error-severity `dangling-edge-ref`. `__system__`-alias edges are never
 * touched: the alias resolves through system injection, not node refs.
 *
 * Each touched diagram then has its `.layout/` pins for the removed nodes
 * (and any edge hints touching them or the removed edges) scrubbed, so a
 * delete leaves zero orphan-layout diagnostics behind. Diagrams that fail
 * to parse are skipped untouched — this API never edits a file whose shape
 * the schema can't confirm. Diagram files are processed in sorted-path
 * order so `scrubbedDiagrams` (and the write order) never depends on
 * platform `readdir` ordering.
 */
export async function deleteElement(
  source: C4FileSource,
  treeIo: TreeIo,
  request: DeleteElementRequest,
): Promise<MutationResult<DeletedElement>> {
  const located = await locateElement(source, request.slug, request.kind);
  if (!located.ok) return located;
  const { kind, path } = located.value;
  const slug = request.slug;

  // Survivor check BEFORE the unlink so the rule can't race the removal.
  let hasSurvivor = false;
  for (const other of ELEMENT_KINDS) {
    if (other !== kind && (await source.exists(artifactPathFor(other, slug)))) {
      hasSurvivor = true;
      break;
    }
  }

  await treeIo.deleteFile(path);

  const scrubbedDiagrams: string[] = [];
  const diagramsDir = `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.diagram}`;
  const files = (await source.listFiles(diagramsDir)).filter((f) => f.endsWith('.yaml')).sort();
  for (const file of files) {
    const diagramSlug = slugFromPath(file);
    if (diagramSlug === null) continue;
    const text = await source.readFile(file);
    const parsed = parseDiagramYaml(text);
    if (!parsed.ok) continue;
    const doc = parseDocument(text);

    const refs = parsed.data.nodes.map(diagramNodeRef);
    const nodeIndexesToRemove = new Set<number>();
    refs.forEach((ref, index) => {
      if (ref.slug !== slug) return;
      const explicitMatch = ref.explicitKind === kind;
      const bareAndUnclaimed = ref.explicitKind === null && !hasSurvivor;
      if (explicitMatch || bareAndUnclaimed) nodeIndexesToRemove.add(index);
    });
    // Diagram-local edge validity (the loader's own rule): an edge touching
    // the deleted slug may only survive if THIS diagram still carries a node
    // ref for it after the node scrub — `resolveDiagramEdges` matches
    // endpoints against the diagram's own nodes, never the tree.
    const slugStillOnDiagram = refs.some(
      (ref, index) => ref.slug === slug && !nodeIndexesToRemove.has(index),
    );
    // The `.layout/` pin is keyed by SLUG, not by ref — so it must only be
    // scrubbed when the slug leaves this diagram entirely. Removing a typed
    // ref while a bare ref for the same slug survives (and re-resolves to
    // another kind's element) leaves the node ON the diagram: dropping its
    // pin there would silently discard an authored position. Same predicate
    // as the edge scrub, deliberately.
    const removedNodeRefs = nodeIndexesToRemove.size > 0 && !slugStillOnDiagram ? [slug] : [];

    const removedEdgeKeys: string[] = [];
    const edgeIndexesToRemove: number[] = [];
    if (!slugStillOnDiagram) {
      parsed.data.edges.forEach((edge, index) => {
        if (edge.from === slug || edge.to === slug) {
          edgeIndexesToRemove.push(index);
          removedEdgeKeys.push(`${edge.from}->${edge.to}`);
        }
      });
    }

    if (nodeIndexesToRemove.size === 0 && edgeIndexesToRemove.length === 0) continue;

    // Byte-preserving source splices, resolved against ONE parse and applied
    // together — so indexes never shift under one another, and the prose,
    // comments and hand-wrapping of every untouched diagram line survive
    // verbatim. A tree-wide delete touches many diagrams; re-serializing
    // each one would reflow unrelated text across all of them.
    const edits: YamlSourceEdit[] = [
      ...[...nodeIndexesToRemove].map((index) => ({
        op: 'remove-item' as const,
        seq: 'nodes',
        index,
      })),
      ...edgeIndexesToRemove.map((index) => ({ op: 'remove-item' as const, seq: 'edges', index })),
    ];
    const out = applyYamlSourceEdits(text, doc, edits);
    // Removing whole entries from valid arrays keeps the diagram valid; the
    // re-parse is the same never-write-invalid gate every other mutation has.
    if (!parseDiagramYaml(out).ok) continue;
    await source.writeFile(file, out);
    scrubbedDiagrams.push(diagramSlug);
    await scrubLayoutRefs(source, diagramSlug, { nodes: removedNodeRefs, edges: removedEdgeKeys });
  }

  return mutationOk({ kind, slug, removedPath: path, scrubbedDiagrams });
}
