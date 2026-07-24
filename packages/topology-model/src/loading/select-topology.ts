import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedTopology } from '../model/loaded-artifact.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';

/**
 * Picks the tree's singleton topology out of every parsed
 * `.workspec/topologies/*.yaml` file — the same "one bearer per tree"
 * convention `@workspec/c4-model` applies to `system/*.yaml`. Zero files is
 * `no-topology`; more than one is `multiple-topologies`, with the
 * lexicographically-first slug used as a deterministic fallback so the rest
 * of the pipeline still has something to resolve against.
 */
export function selectTopology(topologies: readonly LoadedTopology[]): {
  topology: LoadedTopology | null;
  diagnostics: readonly TopologyDiagnostic[];
} {
  if (topologies.length === 0) {
    return {
      topology: null,
      diagnostics: [
        makeDiagnostic('error', DIAGNOSTIC_CODES.noTopology, 'no topology file found under .workspec/topologies/', ''),
      ],
    };
  }

  const sorted = [...topologies].sort((a, b) => a.slug.localeCompare(b.slug));
  const chosen = sorted[0];
  if (!chosen) {
    // Unreachable: `topologies.length === 0` is handled above.
    throw new Error('unreachable: selectTopology called with a non-empty, sorted-empty array');
  }

  if (topologies.length === 1) {
    return { topology: chosen, diagnostics: [] };
  }

  const otherSlugs = sorted.slice(1).map((t) => t.slug);
  return {
    topology: chosen,
    diagnostics: [
      makeDiagnostic(
        'error',
        DIAGNOSTIC_CODES.multipleTopologies,
        `${topologies.length} topology files found (${sorted.map((t) => t.slug).join(', ')}); using "${chosen.slug}" (lexicographically first) — expected exactly one. Extra: ${otherSlugs.join(', ')}`,
        '',
      ),
    ],
  };
}
