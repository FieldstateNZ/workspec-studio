import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedResource, LoadedTopology } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import { createYamlLocator } from '../diagnostics/yaml-locator.js';

/**
 * Checks every connection's `from`/`to` resolves to a real resource file,
 * raising `dangling-ref` (error) for any that don't. Verify-time, not
 * schema-time: `Connection.from`/`.to` are bare `Slug` strings at the schema
 * layer (topology-schema has no notion of "does a resource with this slug
 * exist" — that's a cross-artifact concern for the host, same convention as
 * `@workspec/decision-schema`'s `catalog`/`supersedes` refs).
 */
export function checkDanglingConnectionRefs(
  topology: LoadedTopology,
  resources: ReadonlyMap<string, LoadedResource>,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  const locate = createYamlLocator(topology.text);

  topology.topology.spec.connections.forEach((connection, index) => {
    (['from', 'to'] as const).forEach((end) => {
      const refSlug = connection[end];
      if (resources.has(refSlug)) return;
      diagnostics.push(
        makeDiagnostic(
          'error',
          DIAGNOSTIC_CODES.danglingRef,
          `connection ${end} "${refSlug}" does not resolve to any resource file`,
          topology.path,
          { position: locate(['spec', 'connections', index, end]), refSlug },
        ),
      );
    });
  });

  return diagnostics;
}
