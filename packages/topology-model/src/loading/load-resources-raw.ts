import { slugFromPath } from '@workspec/schema-core';
import { parseResourceYaml } from '@workspec/topology-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedResource } from '../model/loaded-artifact.types.js';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { discoverResourcePaths } from '../discovery/discover-resource-paths.js';

/** Every resource file successfully parsed, keyed by slug, plus every parse-error diagnostic found along the way. */
export interface LoadedResourcesRaw {
  readonly resources: ReadonlyMap<string, LoadedResource>;
  readonly diagnostics: readonly TopologyDiagnostic[];
}

/** Reads, parses, and validates every discovered `.workspec/resources/*.yaml` file. */
export async function loadResourcesRaw(source: TopologyFileSource): Promise<LoadedResourcesRaw> {
  const paths = await discoverResourcePaths(source);
  const diagnostics: TopologyDiagnostic[] = [];
  const resources = new Map<string, LoadedResource>();

  const texts = await Promise.all(paths.map((path) => source.readFile(path)));
  paths.forEach((path, index) => {
    const slug = slugFromPath(path);
    const text = texts[index];
    if (!slug || text === undefined) return;
    const result = parseResourceYaml(text);
    if (result.ok) {
      resources.set(slug, { slug, path, resource: result.data, text });
    } else {
      diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
    }
  });

  return { resources, diagnostics };
}
