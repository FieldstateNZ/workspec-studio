import { artifactPathFor, slugify } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';
import { isWorkspecPath } from '../workspec-path.js';
import type { CreateElementRequest } from './create-element-request.js';
import { diagramNodeRef } from './diagram-node-ref.js';
import { loadDiagramDoc, persistDiagramDoc } from './diagram-doc.js';
import { ELEMENT_YAML_PARSERS } from './element-parsers.js';
import { upsertLayoutPin } from './layout-pin.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import { serializeNewElement } from './serialize-new-element.js';
import { TECHNOLOGY_KINDS } from './technology-kinds.js';

/**
 * Placeholder description written when the client supplies none. Most
 * element schemas require a non-empty `description` (`min(1)`), and a
 * file the schema rejects would be silently dropped by the next
 * `loadC4Model` — so a palette-created element (which has only a name)
 * gets this stub and the element-editor flow replaces it. The wording is
 * deliberately a visible TODO, not fake content.
 */
export const PLACEHOLDER_DESCRIPTION = 'TODO: describe this element.';

/** What `createElement` reports back on success. */
export interface CreatedElement {
  readonly kind: CreateElementRequest['kind'];
  readonly slug: string;
  readonly path: string;
  readonly title: string;
  /** True when the element was also appended to the requested diagram. */
  readonly diagramTouched: boolean;
}

/**
 * Creates a new element file in its kind's type directory, optionally
 * dropping it onto a diagram in the same call.
 *
 * SLUG-STABILITY CONTRACT (the create half): the slug is minted here, once,
 * from the FIRST name via `@workspec/c4-schema`'s `slugify` — it becomes
 * the filename and thereby the element's identity everywhere (diagram
 * refs, edges, `.layout/` keys). Later renames update `title:` only and
 * never move the file — see `updateElement`.
 *
 * Ordering is deliberate: when a diagram drop is requested, the diagram is
 * loaded (and its 404/400 surfaced) BEFORE the element file is written, so
 * a bad diagram ref can't strand a half-created element. The element file
 * itself is validated through its kind parser before the write — belt and
 * braces over a serializer this package owns.
 */
export async function createElement(
  source: C4FileSource,
  request: CreateElementRequest,
): Promise<MutationResult<CreatedElement>> {
  if (request.technology !== undefined && !TECHNOLOGY_KINDS.has(request.kind)) {
    return mutationError(400, `"technology" is not a field of ${request.kind} elements`);
  }

  const title = request.name.trim();
  const slug = slugify(title);
  if (slug === '') {
    return mutationError(400, `name "${request.name}" produces an empty slug`);
  }
  const path = artifactPathFor(request.kind, slug);
  // Unreachable with a well-formed slug (the slug alphabet cannot escape a
  // type directory), kept as the same belt-and-braces layering every other
  // write path in this package has.
  if (!isWorkspecPath(path)) {
    return mutationError(400, 'constructed path is not a valid .workspec path');
  }
  if (await source.exists(path)) {
    return mutationError(409, `a ${request.kind} element with slug "${slug}" already exists`);
  }

  // Load the target diagram FIRST so its errors surface before any write.
  const target =
    request.diagram !== undefined ? await loadDiagramDoc(source, request.diagram) : null;
  if (target !== null && !target.ok) return target;

  const description =
    request.description !== undefined && request.description.trim() !== ''
      ? request.description
      : PLACEHOLDER_DESCRIPTION;
  const text = serializeNewElement(request.kind, {
    title,
    description,
    ...(request.technology !== undefined ? { technology: request.technology } : {}),
    ...(request.tags !== undefined ? { tags: request.tags } : {}),
  });
  const validated = ELEMENT_YAML_PARSERS[request.kind](text);
  if (!validated.ok) {
    return mutationError(
      400,
      `refusing to write a schema-invalid ${request.kind}`,
      validated.errors,
    );
  }
  await source.writeFile(path, text);

  let diagramTouched = false;
  if (target !== null && target.ok) {
    const diagram = target.value;
    const alreadyOnDiagram = diagram.data.nodes.some((n) => diagramNodeRef(n).slug === slug);
    if (!alreadyOnDiagram) {
      const isFat = diagram.data.nodes.some((n) => 'id' in (n as Record<string, unknown>));
      const node = isFat
        ? { id: slug, type: request.kind, label: title }
        : { [request.kind]: slug };
      // `append-item` handles the absent / empty / flow-style `nodes:` cases
      // itself, re-emitting the canonical block form rather than growing an
      // inline `[{...}]`.
      const persisted = await persistDiagramDoc(source, diagram, [
        { op: 'append-item', seq: 'nodes', value: node },
      ]);
      if (!persisted.ok) return persisted;
      diagramTouched = true;
    }
    if (request.position !== undefined) {
      await upsertLayoutPin(source, diagram.slug, slug, request.position);
    }
  }

  return mutationOk({ kind: request.kind, slug, path, title, diagramTouched });
}
