import { parseLayoutYaml, slugFromPath } from '@workspec/c4-schema';
import type { Layout } from '@workspec/c4-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { discoverLayoutPaths } from '../discovery/discover-layout-paths.js';

/**
 * One successfully parsed `.layout/` file, keyed by the diagram slug its
 * filename names (a layout file's own "slug" is always its diagram's slug —
 * there is no independent layout identity).
 */
export interface RawLayout {
  readonly diagramSlug: string;
  readonly path: string;
  readonly data: Layout;
  /** The raw YAML source, kept so orphan-entry diagnostics can locate the offending pinned entry's line. */
  readonly text: string;
}

/** Every layout file successfully parsed, plus every parse-error diagnostic found along the way. */
export interface LoadedLayoutsRaw {
  readonly layouts: readonly RawLayout[];
  readonly diagnostics: readonly C4Diagnostic[];
}

/** Reads, parses, and validates every discovered `.layout/` file. */
export async function loadLayoutsRaw(source: C4FileSource): Promise<LoadedLayoutsRaw> {
  const paths = await discoverLayoutPaths(source);
  const diagnostics: C4Diagnostic[] = [];
  const layouts: RawLayout[] = [];

  const texts = await Promise.all(paths.map((path) => source.readFile(path)));
  paths.forEach((path, index) => {
    const diagramSlug = slugFromPath(path);
    const text = texts[index];
    if (!diagramSlug || text === undefined) return;
    const result = parseLayoutYaml(text);
    if (result.ok) {
      layouts.push({ diagramSlug, path, data: result.data, text });
    } else {
      diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
    }
  });

  return { layouts, diagnostics };
}
