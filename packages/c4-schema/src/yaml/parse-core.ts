import { LineCounter, parseDocument } from 'yaml';
import type { z } from 'zod';
import { locateInDocument } from './locate-in-document.js';
import type { ParseIssue, ParseResult } from './parse-result.types.js';

/**
 * Parses YAML text and validates it against `schema`, mapping every YAML
 * syntax error and every Zod validation issue back to a line/column in the
 * source text. This is the shared core every per-artifact `parse*Yaml`
 * wrapper in this package delegates to — it owns the `yaml` LineCounter
 * bookkeeping so the thin wrappers stay one-liners.
 *
 * Caveat: plain (non-discriminated) Zod unions — the Diagram thin|fat
 * union and the thin-node bare-slug|typed-ref variants — report a single
 * root-level `invalid_union` issue when no branch matches, with an empty
 * issue path. Those failures therefore degrade to `path: ''` at line 1,
 * col 1 rather than pointing at the offending node/edge. Issues from
 * non-union schemas (and from fields *outside* the union) still map to
 * their real source position.
 */
export function parseYamlArtifact<T>(text: string, schema: z.ZodType<T>): ParseResult<T> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true });

  if (doc.errors.length > 0) {
    const errors: ParseIssue[] = doc.errors.map((error) => {
      const offset = error.pos?.[0] ?? 0;
      const pos = lineCounter.linePos(offset);
      return { path: '', message: error.message, line: pos.line, col: pos.col };
    });
    return { ok: false, errors };
  }

  const result = schema.safeParse(doc.toJS());
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const errors: ParseIssue[] = result.error.issues.map((issue) => {
    const pos = locateInDocument(doc, lineCounter, issue.path) ?? { line: 1, col: 1 };
    return { path: issue.path.join('.'), message: issue.message, line: pos.line, col: pos.col };
  });
  return { ok: false, errors };
}
