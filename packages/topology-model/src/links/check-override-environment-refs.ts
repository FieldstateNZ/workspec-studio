import { isMap, isScalar, LineCounter, parseDocument } from 'yaml';
import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { TopologyDiagnostic } from '../model/diagnostic.types.js';
import type { LoadedResource, LoadedTopology } from '../model/loaded-artifact.types.js';
import type { DiagnosticPosition } from '../diagnostics/make-diagnostic.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';

/**
 * Locates the KEY node of one `spec.overrides.<envId>` entry (e.g. the
 * `dev` in `overrides:\n  dev:\n    cost: {...}`) — deliberately NOT the
 * generic `createYamlLocator` (`diagnostics/yaml-locator.ts`), which resolves
 * a *value's* range and, for a nested block-map value, that range starts at
 * the value's own first child key rather than the parent key itself (e.g. it
 * would land on `cost:` instead of `dev:`). Both `overrides`-related checks
 * in this file need to point at the ENV ID KEY specifically — that is the
 * "override key" a fix action means to add/remove — so this walks the
 * `overrides` map's own `items` (a list of `{key, value}` pairs) to find the
 * matching key node directly. Returns `undefined` when the document doesn't
 * parse cleanly or the key can't be found (defensive; every call site here
 * only reaches this after already having parsed `overrides` successfully out
 * of the same text).
 */
function locateOverrideKey(text: string, envId: string): DiagnosticPosition | undefined {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { lineCounter, prettyErrors: true });
  const overridesNode = doc.getIn(['spec', 'overrides'], true);
  if (!isMap(overridesNode)) return undefined;

  const pair = overridesNode.items.find((item) => isScalar(item.key) && item.key.value === envId);
  const keyNode = pair?.key;
  if (!isScalar(keyNode) || !keyNode.range) return undefined;

  const pos = lineCounter.linePos(keyNode.range[0]);
  return { line: pos.line, col: pos.col };
}

/**
 * Checks every resource's `spec.overrides` keys (S1) against BOTH integrity
 * rules, entirely at the model layer (verify-time):
 *
 * 1. **Unknown environment** (`dangling-override-environment-ref`): the key
 *    doesn't name one of the owning topology's declared `spec.environments`
 *    at all. Necessarily model-level — a standalone Resource file has no
 *    visibility into which environments exist.
 * 2. **Not present** (`override-environment-not-present`): the key names a
 *    real topology environment, but this resource's OWN (explicit)
 *    `spec.environments` excludes it — the override targets an environment
 *    this resource is never deployed to, so it can never take effect.
 *
 * Rule 2 is self-contained within one Resource file and COULD be a
 * schema-level `superRefine` — S1 shipped it that way, then moved it here
 * after adversarial review found the schema-level version cascades: a
 * `superRefine` failure invalidates the WHOLE resource (it never enters
 * `loadResourcesRaw`'s map), which then produces a pile of unrelated,
 * spurious "this resource doesn't exist" diagnostics everywhere else it's
 * referenced. A model-level diagnostic reports exactly the one real problem
 * and leaves everything else intact. Both rules share `locateOverrideKey` so
 * they point at the exact same kind of position (the override's env-id KEY,
 * not one of its nested value fields) for the same class of key — a key can
 * only ever violate ONE of the two rules, never both, so at most one
 * diagnostic is emitted per key.
 */
export function checkOverrideEnvironmentRefs(
  topology: LoadedTopology,
  resources: ReadonlyMap<string, LoadedResource>,
): readonly TopologyDiagnostic[] {
  const diagnostics: TopologyDiagnostic[] = [];
  const knownEnvs = new Set(topology.topology.spec.environments);

  for (const loaded of resources.values()) {
    const { overrides, environments: presence } = loaded.resource.spec;
    if (!overrides) continue;

    for (const envId of Object.keys(overrides)) {
      const position = locateOverrideKey(loaded.text, envId);

      if (!knownEnvs.has(envId)) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            DIAGNOSTIC_CODES.danglingOverrideEnvironmentRef,
            `override targets environment "${envId}", which is not one of the topology's ` +
              `declared spec.environments — remove this override key (or declare "${envId}" on ` +
              'the topology first if it is meant to be a real environment).',
            loaded.path,
            { position, refSlug: envId },
          ),
        );
        continue;
      }

      if (presence !== undefined && !presence.includes(envId)) {
        diagnostics.push(
          makeDiagnostic(
            'error',
            DIAGNOSTIC_CODES.overrideEnvironmentNotPresent,
            `override targets environment "${envId}", which this resource's spec.environments ` +
              'does not include — the override will never resolve, since this resource is never ' +
              `present there. Remove this override key (adding "${envId}" to spec.environments ` +
              'only makes sense if this resource should genuinely be deployed there too).',
            loaded.path,
            { position, refSlug: envId },
          ),
        );
      }
    }
  }

  return diagnostics;
}
