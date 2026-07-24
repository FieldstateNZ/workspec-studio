import { slugFromPath } from '@workspec/schema-core';
import { parseEnvironmentYaml } from '@workspec/topology-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedEnvironment } from '../model/loaded-artifact.types.js';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { discoverEnvironmentPaths } from '../discovery/discover-environment-paths.js';

/** Every environment file successfully parsed, keyed by slug, plus every parse-error diagnostic found along the way. */
export interface LoadedEnvironmentsRaw {
  readonly environments: ReadonlyMap<string, LoadedEnvironment>;
  readonly diagnostics: readonly TopologyDiagnostic[];
}

/** Reads, parses, and validates every discovered `.workspec/environments/*.yaml` file. */
export async function loadEnvironmentsRaw(
  source: TopologyFileSource,
): Promise<LoadedEnvironmentsRaw> {
  const paths = await discoverEnvironmentPaths(source);
  const diagnostics: TopologyDiagnostic[] = [];
  const environments = new Map<string, LoadedEnvironment>();

  const texts = await Promise.all(paths.map((path) => source.readFile(path)));
  paths.forEach((path, index) => {
    const slug = slugFromPath(path);
    const text = texts[index];
    if (!slug || text === undefined) return;
    const result = parseEnvironmentYaml(text);
    if (result.ok) {
      environments.set(slug, { slug, path, environment: result.data });
    } else {
      diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
    }
  });

  return { environments, diagnostics };
}
