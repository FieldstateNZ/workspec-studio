import { isNode } from 'yaml';
import type { Document, LineCounter } from 'yaml';

/** A 1-based line/column position inside a YAML source text. */
export interface YamlPosition {
  readonly line: number;
  readonly col: number;
}

/**
 * Locates a value path inside an already-parsed YAML document, falling back
 * to the nearest ancestor that has a source range when the exact path
 * doesn't (e.g. a Zod issue path pointing past a scalar), then to the
 * document root, then to `undefined` when the document has no addressable
 * content at all. This is the shared core behind both `parseYamlArtifact`'s
 * issue mapping and the public `locateYamlPath` utility — extracted so the
 * two can't drift.
 */
export function locateInDocument(
  doc: Document,
  lineCounter: LineCounter,
  path: readonly PropertyKey[],
): YamlPosition | undefined {
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
  return undefined;
}
