import { isNode, LineCounter, parseDocument } from 'yaml';
import type { DiagnosticPosition } from './make-diagnostic.js';

/** Looks up the source position of a value path inside one artifact's raw YAML text, or `undefined` when unlocatable. */
export type YamlLocator = (path: readonly (string | number)[]) => DiagnosticPosition | undefined;

/**
 * Builds a {@link YamlLocator} over one artifact's raw YAML text using the
 * `yaml` package directly.
 *
 * `@workspec/topology-schema`'s own `parseTopologyYaml` already computes
 * line/col for every *schema-validation* issue (surfaced as `ParseIssue`),
 * but — unlike `@workspec/c4-schema`, which exports `locateYamlPath` for
 * exactly this purpose — that locator is private to topology-schema's
 * `yaml.ts`, so it isn't reusable here. This package's *own*
 * verify-time diagnostics (`dangling-ref` on a connection `from`/`to` or a
 * resource's `network`/`resourceGroup`, `orphan-layout-*`) still need a
 * position, so this re-implements the same minimal walk-up-to-the-nearest-
 * node strategy against the same `yaml` package version topology-schema
 * pins. See this package's top-level report for the upstream-gap note.
 */
export function createYamlLocator(text: string): YamlLocator {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true });

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
    return undefined;
  };
}
