import type { Diagnostic } from '../types.js';

/**
 * Emitted when an Aspire graph resource has `kind: "unknown"` — the graph
 * producer itself couldn't classify it as
 * container/executable/project/parameter/azure (see
 * `docs/aspire-hosting/graph-contract.md`'s `kind` classification table) —
 * and `classifyAspireResource` has fallen back to a generic `compute`
 * Resource. `info`, not `warning`: the fallback is safe and lossless
 * (nothing is dropped; `type` is set to the raw CLR `typeName`, so the
 * resource's real identity is preserved), but still worth surfacing — a
 * database/cache/queue-shaped resource hiding behind an unrecognized CLR
 * type would otherwise import silently as a generic workload with no visible
 * sign anything was guessed. Mirrors `defaultedWebSiteKindDiagnostic`'s
 * severity choice for the same reason.
 */
export function unclassifiedAspireKindDiagnostic(name: string, typeName: string): Diagnostic {
  return {
    severity: 'info',
    message:
      `Aspire resource kind could not be classified by the graph producer (typeName "${typeName}"); ` +
      'imported as generic compute. Verify this is not a database/cache/queue-shaped resource ' +
      'that needs manual reclassification.',
    source: name,
  };
}
