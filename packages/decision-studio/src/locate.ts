// A tiny YAML source locator for CLI diagnostics. Given a file's text it returns
// a function mapping a dotted node path to its 1-based line/column, so reference
// and lever warnings can be printed in CI-friendly `file:line:col: message`
// form — the same location strategy the schema layer uses for Zod issues.

import { isNode, LineCounter, parseDocument } from 'yaml';

/** A located position in a YAML source. */
export interface Located {
  /** 1-based line. */
  line: number;
  /** 1-based column. */
  col: number;
}

/**
 * Parse `text` once and return a locator. The locator walks up the given path
 * until it finds a node with a source range (a missing leaf falls back to its
 * nearest enclosing node), returning that node's start line/column. Unresolvable
 * paths fall back to `{ line: 1, col: 1 }`.
 */
export function makeLocator(text: string): (path: ReadonlyArray<PropertyKey>) => Located {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  return (path) => {
    const segments = path.slice();
    while (segments.length > 0) {
      const node = doc.getIn(segments as unknown[], true);
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
  };
}
