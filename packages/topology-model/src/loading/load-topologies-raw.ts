import { slugFromPath } from '@workspec/schema-core';
import { parseTopologyYaml } from '@workspec/topology-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedTopology } from '../model/loaded-artifact.types.js';
import type { TopologyFileSource } from '../ports/topology-file-source.js';
import { discoverTopologyPaths } from '../discovery/discover-topology-paths.js';

/** Every `.workspec/topologies/*.yaml` file successfully parsed, plus every parse-error diagnostic found along the way. */
export interface LoadedTopologiesRaw {
  readonly topologies: readonly LoadedTopology[];
  readonly diagnostics: readonly TopologyDiagnostic[];
}

/**
 * Reads, parses, and validates every discovered topology file. A file that
 * fails to parse contributes its `parse-error` diagnostics and is simply
 * absent from `topologies` — best-effort loading, never a thrown exception.
 * Which of possibly-many results is *the* tree's topology is decided later
 * by `selectTopology` — this step only loads what's on disk.
 */
export async function loadTopologiesRaw(source: TopologyFileSource): Promise<LoadedTopologiesRaw> {
  const paths = await discoverTopologyPaths(source);
  const diagnostics: TopologyDiagnostic[] = [];
  const topologies: LoadedTopology[] = [];

  // Read concurrently, but parse and push in the fixed, sorted `paths`
  // order so downstream golden snapshots stay deterministic regardless of
  // I/O completion order.
  const texts = await Promise.all(paths.map((path) => source.readFile(path)));
  paths.forEach((path, index) => {
    const slug = slugFromPath(path);
    const text = texts[index];
    if (!slug || text === undefined) return;
    const result = parseTopologyYaml(text);
    if (result.ok) {
      topologies.push({ slug, path, topology: result.data, text });
    } else {
      diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
    }
  });

  return { topologies, diagnostics };
}
