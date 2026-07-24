import { slugFromPath } from '@workspec/schema-core';
import { parseLayoutYaml } from '@workspec/topology-schema';
import type { Layout } from '@workspec/topology-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { discoverLayoutPaths } from '../discovery/discover-layout-paths.js';

/**
 * One successfully parsed `.layout/` file, keyed by the topology slug its
 * filename names (a layout file's own "slug" is always its topology's
 * slug — there is no independent layout identity). Mirrors
 * `@workspec/c4-model`'s `RawLayout`.
 */
export interface RawLayout {
  readonly topologySlug: string;
  readonly path: string;
  readonly data: Layout;
  /** The raw YAML source, kept so orphan-entry diagnostics can locate the offending pinned entry's line. */
  readonly text: string;
}

/** Every layout file successfully parsed, plus every parse-error diagnostic found along the way. */
export interface LoadedLayoutsRaw {
  readonly layouts: readonly RawLayout[];
  readonly diagnostics: readonly TopologyDiagnostic[];
}

/** Reads, parses, and validates every discovered `.layout/` file. */
export async function loadLayoutsRaw(source: TopologyFileSource): Promise<LoadedLayoutsRaw> {
  const paths = await discoverLayoutPaths(source);
  const diagnostics: TopologyDiagnostic[] = [];
  const layouts: RawLayout[] = [];

  const texts = await Promise.all(paths.map((path) => source.readFile(path)));
  paths.forEach((path, index) => {
    const topologySlug = slugFromPath(path);
    const text = texts[index];
    if (!topologySlug || text === undefined) return;
    const result = parseLayoutYaml(text);
    if (result.ok) {
      layouts.push({ topologySlug, path, data: result.data, text });
    } else {
      diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
    }
  });

  return { layouts, diagnostics };
}
