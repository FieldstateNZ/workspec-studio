import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedEnvironment, LoadedTopology } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';

/**
 * Checks the topology's `defaultEnvironment` and every `environments[]`
 * entry resolves to a real `.workspec/environments/<slug>.yaml` file.
 * File-only (no line/col; see `DIAGNOSTIC_CODES` doc comment) — the message
 * quotes the missing slug so it's greppable without a locator.
 *
 * This is deliberately narrower than what `TopologyArtifact`'s own
 * `superRefine` already enforces: the schema guarantees
 * `defaultEnvironment` is a MEMBER of `spec.environments` and every
 * connection's `environments` is a SUBSET of it — internal consistency
 * within the topology file itself. It has no way to know whether those
 * declared slugs actually have environment FILES backing them; that
 * cross-artifact check is this function's job, verify-time.
 */
export function checkDanglingEnvironmentRefs(
  topology: LoadedTopology,
  environments: ReadonlyMap<string, LoadedEnvironment>,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  const missing = topology.topology.spec.environments.filter((slug) => !environments.has(slug));

  for (const slug of missing) {
    diagnostics.push(
      makeDiagnostic(
        'error',
        DIAGNOSTIC_CODES.danglingEnvironmentRef,
        `environment "${slug}" does not resolve to any environment file`,
        topology.path,
        { refSlug: slug },
      ),
    );
  }

  return diagnostics;
}
