import { LineCounter, parseDocument } from 'yaml';
import { locateInDocument } from './locate-in-document.js';
import type { YamlPosition } from './locate-in-document.js';

export type { YamlPosition } from './locate-in-document.js';

/**
 * Locates a value path (e.g. `['nodes', 2]`, `['edges', 'a->b']`) inside a
 * YAML source text, for callers that discover a problem with an
 * already-parsed value *after* parsing (cross-file resolution, orphan
 * checks) and want to point a diagnostic back at the offending entry's
 * source line. Falls back to the nearest ancestor with a source range, then
 * the document root; returns `undefined` when the text doesn't parse or has
 * no addressable content — callers degrade to a file-level diagnostic.
 *
 * Shares its walk with `parseYamlArtifact`'s internal issue mapping (see
 * `locate-in-document.ts`), so the two can't drift.
 */
export function locateYamlPath(
  text: string,
  path: readonly (string | number)[],
): YamlPosition | undefined {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter });
  if (doc.errors.length > 0) {
    return undefined;
  }
  return locateInDocument(doc, lineCounter, path);
}
