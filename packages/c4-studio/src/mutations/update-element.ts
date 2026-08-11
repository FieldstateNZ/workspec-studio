import { parseDocument } from 'yaml';
import type { C4FileSource } from '@workspec/c4-model';
import { ELEMENT_YAML_PARSERS } from './element-parsers.js';
import { locateElement } from './locate-element.js';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import { TECHNOLOGY_KINDS } from './technology-kinds.js';
import type { UpdateElementRequest } from './update-element-request.js';
import { applyYamlSourceEdits } from './yaml-source-edit.js';
import type { YamlSourceEdit } from './yaml-source-edit.js';

/** What `updateElement` reports back on success. */
export interface UpdatedElement {
  readonly kind: string;
  readonly slug: string;
  readonly path: string;
}

/**
 * Updates fields on an existing element file — including rename.
 *
 * SLUG-STABILITY CONTRACT (the rename half): renaming updates the YAML
 * `title:` line and nothing else. The slug — minted once at create from
 * the first name — is the element's identity: the filename, every
 * diagram's node ref, every edge's `from`/`to`, and every `.layout/` key
 * address it. Moving the file on rename would force a coordinated rewrite
 * of all of those (churning git history and breaking any out-of-tree
 * reference), for zero model benefit — the loader keys elements by
 * filename, and `title` is the display name everywhere. This matches
 * Enterprise, where the slug is minted from the FIRST name
 * (`commitNewNode`: "slugified name becomes id/filename") and never
 * re-minted.
 *
 * Edits are applied as source splices over the original text (see
 * `yaml-source-edit.ts`), so comments, key order, and the formatting of
 * untouched fields survive byte-for-byte — a rename really is a one-line
 * git diff. (Re-stringifying the parsed `Document` is NOT equivalent: it
 * re-wraps long plain scalars and re-folds `>` block scalars anywhere in
 * the file.) The result is re-validated through
 * the kind's schema before writing; an edit that would leave the file
 * invalid (e.g. clearing a required description) is refused with the
 * issues and the file is untouched. Conversely, an edit that FIXES a
 * currently-invalid file is accepted — validation gates the output, not
 * the input, so the write API can repair files the loader is dropping.
 *
 * Empty-string `technology` and empty `tags` arrays delete their keys
 * (files stay minimal); `description` is always set verbatim and left to
 * the schema to judge (feature elements legitimately allow '').
 */
export async function updateElement(
  source: C4FileSource,
  request: UpdateElementRequest,
): Promise<MutationResult<UpdatedElement>> {
  // The schemas themselves don't length-floor `title`, so an all-whitespace
  // rename would validate into an empty display name — refuse it here.
  if (request.name !== undefined && request.name.trim() === '') {
    return mutationError(400, 'name must not be blank');
  }

  const located = await locateElement(source, request.slug, request.kind);
  if (!located.ok) return located;
  const { kind, path } = located.value;

  if (request.technology !== undefined && !TECHNOLOGY_KINDS.has(kind)) {
    return mutationError(400, `"technology" is not a field of ${kind} elements`);
  }

  const text = await source.readFile(path);
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    return mutationError(400, `element "${request.slug}" has YAML syntax errors; fix it manually`);
  }

  const edits: YamlSourceEdit[] = [];
  if (request.name !== undefined) {
    edits.push({ op: 'set-field', key: 'title', value: request.name.trim() });
  }
  if (request.description !== undefined) {
    edits.push({ op: 'set-field', key: 'description', value: request.description });
  }
  if (request.technology !== undefined) {
    edits.push(
      request.technology === ''
        ? { op: 'remove-field', key: 'technology' }
        : { op: 'set-field', key: 'technology', value: request.technology },
    );
  }
  if (request.tags !== undefined) {
    edits.push(
      request.tags.length === 0
        ? { op: 'remove-field', key: 'tags' }
        : { op: 'set-field', key: 'tags', value: request.tags },
    );
  }

  const updated = applyYamlSourceEdits(text, doc, edits);
  const validated = ELEMENT_YAML_PARSERS[kind](updated);
  if (!validated.ok) {
    return mutationError(
      400,
      `update would make ${kind} "${request.slug}" schema-invalid; refused`,
      validated.errors,
    );
  }
  await source.writeFile(path, updated);
  return mutationOk({ kind, slug: request.slug, path });
}
