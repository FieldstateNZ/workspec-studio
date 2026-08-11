// Loading and persisting a diagram file as a *surgically editable* YAML
// source. Mutations are declared as `YamlSourceEdit`s and applied as byte
// splices over the original text (see `yaml-source-edit.ts`) rather than by
// re-stringifying a mutated `Document` — so authored comments, key order,
// blank lines and hand-wrapped prose in everything untouched survive
// byte-for-byte, and a one-edge change is a one-edge git diff. (Editing the
// `Document` and calling `toString()` looks equivalent and is not: `yaml`'s
// printer re-wraps long plain scalars and re-folds `>` block scalars, so a
// node delete reflowed unrelated prose elsewhere in the file.)
//
// The validated plain-data view (`data`) rides alongside the document,
// index-aligned with it (both parses of the same text), so services can
// *decide* against typed data and *address* edits by the same index.

import { parseDocument } from 'yaml';
import type { Document } from 'yaml';
import { artifactPathFor, parseDiagramYaml } from '@workspec/c4-schema';
import type { Diagram } from '@workspec/c4-schema';
import type { C4FileSource } from '@workspec/c4-model';
import { mutationError, mutationOk } from './mutation-result.js';
import type { MutationResult } from './mutation-result.js';
import { applyYamlSourceEdits } from './yaml-source-edit.js';
import type { YamlSourceEdit } from './yaml-source-edit.js';

/** One diagram file, loaded for surgical mutation. */
export interface DiagramDoc {
  readonly slug: string;
  readonly path: string;
  /** The file's original text — every edit splices into THIS, verbatim. */
  readonly text: string;
  /**
   * The UNMUTATED parse of `text`. Edits resolve their source ranges
   * against it, so it must never be edited in place.
   */
  readonly doc: Document;
  /** The schema-validated data view, index-aligned with `doc`'s sequences. */
  readonly data: Diagram;
}

/**
 * Reads and validates `diagrams/<slug>.yaml` for mutation. A missing file
 * is a 404; a file that fails `parseDiagramYaml` is a 400 with the parse
 * issues — this API refuses to mutate a broken diagram (the edit would be
 * applied against a shape the schema can't confirm, and the write gate in
 * {@link persistDiagramDoc} would reject the result anyway).
 */
export async function loadDiagramDoc(
  source: C4FileSource,
  slug: string,
): Promise<MutationResult<DiagramDoc>> {
  const path = artifactPathFor('diagram', slug);
  if (!(await source.exists(path))) {
    return mutationError(404, `no diagram with slug "${slug}"`);
  }
  const text = await source.readFile(path);
  const parsed = parseDiagramYaml(text);
  if (!parsed.ok) {
    return mutationError(
      400,
      `diagram "${slug}" is invalid; fix it before mutating`,
      parsed.errors,
    );
  }
  return mutationOk({ slug, path, text, doc: parseDocument(text), data: parsed.data });
}

/**
 * Applies `edits` to the loaded text and writes the result back — but only
 * after re-validating it through `parseDiagramYaml`. A mutation that would
 * produce an invalid diagram is rejected with the issues and nothing is
 * written; the tree can never be left holding a file the loader would drop.
 *
 * An empty `edits` list still round-trips through the gate and rewrites the
 * identical bytes, which is harmless — but callers should skip the call
 * instead, so a no-op mutation touches no mtime.
 */
export async function persistDiagramDoc(
  source: C4FileSource,
  diagram: Pick<DiagramDoc, 'slug' | 'path' | 'text' | 'doc'>,
  edits: readonly YamlSourceEdit[],
): Promise<MutationResult<{ readonly text: string }>> {
  const text = applyYamlSourceEdits(diagram.text, diagram.doc, edits);
  const parsed = parseDiagramYaml(text);
  if (!parsed.ok) {
    return mutationError(
      400,
      `mutation would make diagram "${diagram.slug}" invalid; refused`,
      parsed.errors,
    );
  }
  await source.writeFile(diagram.path, text);
  return mutationOk({ text });
}
