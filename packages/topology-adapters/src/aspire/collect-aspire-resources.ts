import { asArray, asNumber, asRecord, asString, isRecord } from '../json/index.js';
import type { Diagnostic } from '../types.js';
import type {
  AspireEndpointInput,
  AspireReferenceInput,
  AspireResourceInput,
} from './aspire-resource-input.js';

/** The only `workspec-graph/v1` version string this adapter was built against — see `docs/aspire-hosting/graph-contract.md`'s versioning stance. */
export const ASPIRE_GRAPH_VERSION = 'workspec-graph/v1';

/** What `collectAspireResources` extracts from one already-parsed graph document. */
export interface CollectAspireResourcesResult {
  /**
   * `true` when `input` was at least shaped like a `workspec-graph/v1`
   * document (a JSON object with a `resources` array) — regardless of
   * whether every entry in it parsed cleanly, and regardless of `version`
   * matching. `false` for anything else (not an object, no `resources`
   * array at all): this is the signal `aspireAdapter` uses to decide
   * whether `AdapterOutput.connections` should be `[]` ("captured, no
   * edges") or omitted entirely ("not captured — this wasn't recognizable
   * as an aspire graph at all"). See that type's doc comment.
   */
  readonly recognized: boolean;
  readonly apphostName: string;
  /** Sorted by `name` (ordinal) — see the sort call below for why. */
  readonly resources: readonly AspireResourceInput[];
  readonly diagnostics: readonly Diagnostic[];
}

function collectEndpoints(entries: readonly unknown[] | undefined): AspireEndpointInput[] {
  const endpoints: AspireEndpointInput[] = [];
  for (const entry of entries ?? []) {
    if (!isRecord(entry)) continue;
    const name = asString(entry, 'name');
    if (!name) continue;

    const scheme = asString(entry, 'scheme');
    const port = asNumber(entry, 'port');
    const targetPort = asNumber(entry, 'targetPort');
    const external = typeof entry.external === 'boolean' ? entry.external : undefined;
    endpoints.push({
      name,
      ...(scheme !== undefined ? { scheme } : {}),
      ...(port !== undefined ? { port } : {}),
      ...(targetPort !== undefined ? { targetPort } : {}),
      ...(external !== undefined ? { external } : {}),
    });
  }
  return endpoints;
}

function collectReferences(entries: readonly unknown[] | undefined): AspireReferenceInput[] {
  const references: AspireReferenceInput[] = [];
  for (const entry of entries ?? []) {
    if (!isRecord(entry)) continue;
    const target = asString(entry, 'target');
    const via = asString(entry, 'via');
    if (!target || !via) continue; // malformed entry — no diagnostic hook this deep; silently dropped, same convention as a malformed resource entry below.

    const label = asString(entry, 'label');
    references.push({ target, via, ...(label !== undefined ? { label } : {}) });
  }
  return references;
}

/** Guards one `resources[]` entry to `AspireResourceInput`, or `undefined` for a malformed entry (missing `name`/`kind`/`typeName`) — silently dropped, mirroring `collectTerraformResources`/`collectBicepResources`'s convention: this adapter never throws on a malformed document, and there is no diagnostic hook this deep in a fold. */
function collectResource(entry: unknown): AspireResourceInput | undefined {
  if (!isRecord(entry)) return undefined;
  const name = asString(entry, 'name');
  const kind = asString(entry, 'kind');
  const typeName = asString(entry, 'typeName');
  if (!name || !kind || !typeName) return undefined;

  const image = asString(entry, 'image');
  const command = asString(entry, 'command');
  const workingDirectory = asString(entry, 'workingDirectory');
  const parent = asString(entry, 'parent');

  return {
    name,
    kind,
    typeName,
    ...(image !== undefined ? { image } : {}),
    ...(command !== undefined ? { command } : {}),
    ...(workingDirectory !== undefined ? { workingDirectory } : {}),
    ...(parent !== undefined ? { parent } : {}),
    endpoints: collectEndpoints(asArray(entry, 'endpoints')),
    references: collectReferences(asArray(entry, 'references')),
  };
}

/**
 * Builds the `error`-severity diagnostic for a `version` that isn't exactly
 * {@link ASPIRE_GRAPH_VERSION}, or `undefined` when it matches. `error`
 * (unlike every other diagnostic this package emits) because a version
 * mismatch means the document's shape is not the one this adapter was built
 * against at all — `workspec-c4 import-aspire` treats the same condition as
 * a hard usage error (see `docs/aspire-hosting/import-mapping.md`); this
 * adapter has no separate "usage error" channel from `AdapterOutput`, so
 * `error` severity is how that same signal reaches the CLI (`runImport`
 * exits 1 when any diagnostic is `error`-severity). Resources are still
 * best-effort mapped regardless — never a hard abort — since a `v2` might
 * turn out to be purely additive (see the graph contract's versioning
 * stance) and this adapter's field-level guards degrade gracefully either
 * way.
 */
function versionDiagnostic(input: Record<string, unknown>): Diagnostic | undefined {
  const version = asString(input, 'version');
  if (version === ASPIRE_GRAPH_VERSION) return undefined;
  const found = version !== undefined ? `"${version}"` : 'missing';
  return {
    severity: 'error',
    message: `Unsupported graph version (found ${found}, expected "${ASPIRE_GRAPH_VERSION}"); resources may be missing or misclassified.`,
  };
}

/**
 * Extracts the apphost name and flat resource list from a parsed
 * `workspec-graph/v1` document. Never throws: an input that isn't shaped
 * like a graph document at all (`recognized: false`) yields no resources
 * and no diagnostics — the same "malformed input degrades to nothing, never
 * a throw" convention `collectTerraformResources`/`collectBicepResources`
 * follow — while one that IS graph-shaped but has some malformed resource
 * entries silently drops just those entries.
 *
 * Resources are sorted by `name` (ordinal) before being returned — the
 * CANONICAL ORDER every downstream step (slug assignment, collision
 * suffixing, connection derivation) relies on. The producer's own array
 * order is already sorted by contract, but a hand-written fixture or a
 * future producer version might not be; sorting here (rather than trusting
 * the input) is what makes this adapter's output independent of input
 * order — see `aspire-adapter.test.ts`'s reordering-stability test, and
 * `workspec-c4 import-aspire`'s `projectAspireGraph`, which sorts for the
 * exact same reason (`docs/aspire-hosting/import-mapping.md`).
 */
export function collectAspireResources(input: unknown): CollectAspireResourcesResult {
  const notRecognized: CollectAspireResourcesResult = {
    recognized: false,
    apphostName: '',
    resources: [],
    diagnostics: [],
  };
  if (!isRecord(input)) return notRecognized;

  const rawResources = input.resources;
  if (!Array.isArray(rawResources)) return notRecognized;

  const diagnostics: Diagnostic[] = [];
  const versionIssue = versionDiagnostic(input);
  if (versionIssue) diagnostics.push(versionIssue);

  const apphostName = asString(asRecord(input, 'apphost'), 'name') ?? '';

  const resources = rawResources
    .map(collectResource)
    .filter((resource): resource is AspireResourceInput => resource !== undefined)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  return { recognized: true, apphostName, resources, diagnostics };
}
