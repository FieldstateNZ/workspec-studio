import { API_VERSION, InventoryArtifact, compareResourceIds } from '@workspec/cost-schema';
import type { Inventory, InventoryResourceType } from '@workspec/cost-schema';
import type { ProviderScope } from '@workspec/cost-provider';
import type { AzureHttp } from './http.js';

// ── Inventory via Azure Resource Graph ──────────────────────────────────────
// One query, paged to exhaustion via `$skipToken`. Resource Graph is used
// (rather than per-subscription ARM resource listing) because it can query
// across every subscription in `scope` in a single call and already returns
// `tags` inline — no per-resource follow-up request needed.

/** Shared with `verify.ts`'s drift check — same endpoint, different query. */
export const RESOURCE_GRAPH_URL =
  'https://management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2022-10-01';

/**
 * `order by id asc` is redundant with this package's own final sort (we
 * still sort client-side below, since Resource Graph's collation isn't
 * guaranteed to match `compareResourceIds`' plain UTF-16 code-unit order),
 * but it keeps pages internally consistent and makes the raw API response
 * easier to eyeball while debugging.
 */
const RESOURCE_GRAPH_QUERY =
  'Resources | project id, name, type, location, resourceGroup, subscriptionId, tags | order by id asc';

interface ResourceGraphRow {
  id: string;
  name: string;
  type: string;
  location?: string | null;
  resourceGroup: string;
  subscriptionId: string;
  tags?: Record<string, string> | null;
}

/** What we map an empty/missing Resource Graph `location` to — see {@link normalizeLocation}. */
const GLOBAL_LOCATION = 'global';

/**
 * Some Azure resource types (e.g. certain subscription- or tenant-scoped
 * resources) report an empty string, or omit the field entirely, for
 * `location` — there's no region for them to belong to. `'global'` is
 * Azure's own documented convention for a location-less resource, so we
 * normalize to that rather than drop the row: inventory completeness (every
 * live resource accounted for) is the drift-report contract this package
 * exists to satisfy, and `InventoryResource.location` requires a non-empty
 * string, so an unmapped empty location would otherwise fail `safeParse` and
 * abort the ENTIRE stock-take over one resource.
 */
function normalizeLocation(location: string | null | undefined): string {
  return location === null || location === undefined || location.length === 0 ? GLOBAL_LOCATION : location;
}

interface ResourceGraphResponseBody {
  data?: ResourceGraphRow[];
  $skipToken?: string;
}

export interface FetchInventoryOptions {
  http: AzureHttp;
  /**
   * Clock for `spec.asOf`. Defaults to `() => new Date().toISOString()` —
   * real wall-clock time is fine here, this is the IO layer — but stays
   * injectable so tests (and the byte-stability assertion) are deterministic.
   */
  clock?: () => string;
}

/**
 * Fetch a schema-valid {@link Inventory} for `scope` from Azure Resource
 * Graph, paging via `$skipToken` to exhaustion. Pagination is resumable: each
 * page is requested independently (the request body only ever carries the
 * current `$skipToken`, never state from a prior page), so a caller could in
 * principle restart from a saved token — this implementation always starts
 * from the first page and reads to the end, but nothing here prevents a
 * future caller from doing otherwise.
 */
export async function fetchAzureInventory(scope: ProviderScope, options: FetchInventoryOptions): Promise<Inventory> {
  if (scope.subscriptions.length === 0) {
    throw new Error('fetchAzureInventory: scope.subscriptions must be non-empty');
  }
  const { http, clock = () => new Date().toISOString() } = options;

  const rows: ResourceGraphRow[] = [];
  let skipToken: string | undefined;

  do {
    const body: Record<string, unknown> = {
      subscriptions: scope.subscriptions,
      query: RESOURCE_GRAPH_QUERY,
      ...(skipToken !== undefined ? { options: { $skipToken: skipToken } } : {}),
    };
    const res = await http.request({ method: 'POST', url: RESOURCE_GRAPH_URL, body });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`fetchAzureInventory: Resource Graph query failed: HTTP ${res.status}`);
    }

    const responseBody = res.body as ResourceGraphResponseBody;
    rows.push(...(responseBody.data ?? []));
    skipToken = responseBody.$skipToken;
  } while (skipToken !== undefined);

  // Resource Graph convention: resource ids come back lowercased.
  const resources: InventoryResourceType[] = rows
    .map(
      (row): InventoryResourceType => ({
        id: row.id.toLowerCase(),
        name: row.name,
        type: row.type,
        location: normalizeLocation(row.location),
        resourceGroup: row.resourceGroup,
        subscription: row.subscriptionId,
        ...(row.tags !== null && row.tags !== undefined && Object.keys(row.tags).length > 0
          ? { tags: row.tags }
          : {}),
      }),
    )
    .sort((a, b) => compareResourceIds(a.id, b.id));

  const inventory: Inventory = {
    apiVersion: API_VERSION,
    kind: 'Inventory',
    // No natural "id" concept from Azure itself: derive a stable one from
    // scope, so re-fetching the same scope reuses the same artifact identity.
    metadata: { id: scope.subscriptions.join('-') },
    spec: {
      asOf: clock(),
      scope: { subscriptions: [...scope.subscriptions] },
      resources,
    },
  };

  const parsed = InventoryArtifact.safeParse(inventory);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `fetchAzureInventory: Resource Graph response mapped to an invalid Inventory (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'})`,
    );
  }
  return parsed.data;
}
