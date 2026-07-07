import { isNode, LineCounter, parseDocument } from 'yaml';
import type { Document } from 'yaml';
import type { z } from 'zod';
import type { ParseIssue, ParseResult } from './parse-result.types.js';

function locate(
  doc: Document,
  lineCounter: LineCounter,
  path: readonly PropertyKey[],
): { line: number; col: number } {
  const segments = path.slice();
  while (segments.length > 0) {
    const node: unknown = doc.getIn(segments as PropertyKey[], true);
    if (isNode(node) && node.range) {
      const pos = lineCounter.linePos(node.range[0]);
      return { line: pos.line, col: pos.col };
    }
    segments.pop();
  }
  if (isNode(doc.contents) && doc.contents.range) {
    const pos = lineCounter.linePos(doc.contents.range[0]);
    return { line: pos.line, col: pos.col };
  }
  return { line: 1, col: 1 };
}

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
    const pos = locate(doc, lineCounter, issue.path);
    return { path: issue.path.join('.'), message: issue.message, line: pos.line, col: pos.col };
  });
  return { ok: false, errors };
}
