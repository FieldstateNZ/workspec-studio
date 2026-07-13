import { compareResourceIds } from '@workspec/cost-schema';
import type { Inventory } from '@workspec/cost-schema';
import { computeDriftReport } from '@workspec/cost-provider';
import type { DriftableResource, DriftReport } from '@workspec/cost-provider';
import { RESOURCE_GRAPH_URL } from './inventory.js';
import type { AzureHttp } from './http.js';

// ── Drift check via Azure Resource Graph ────────────────────────────────────
// Re-reads live tags for exactly the target resource ids — `baseline`'s own
// resources, or a caller-restricted subset — via a Resource Graph query
// filtered with `where id in~ (...)`, then hands the (baseline, live) pair to
// `@workspec/cost-provider`'s shared `computeDriftReport` so "what counts as
// drift" is defined in exactly one place (see that package's `drift.ts`).
//
// The subscriptions searched come from `baseline.spec.scope.subscriptions` —
// `verifyBaseline` takes no separate `ProviderScope` (see the port), and a
// baseline Inventory already records the scope it was stock-taken over.

/** Ids per `in~ (...)` query, to keep the KQL string a reasonable size and stay well under Resource Graph's query-complexity limits. */
const BATCH_SIZE = 1000;

interface ResourceGraphTagRow {
  id: string;
  tags?: Record<string, string> | null;
}

interface ResourceGraphResponseBody {
  data?: ResourceGraphTagRow[];
  $skipToken?: string;
}

/**
 * Escape a resource id for embedding in a KQL single-quoted string literal.
 * Backslashes must be escaped BEFORE quotes: ids come from a hand-editable
 * baseline inventory, and an unescaped `\` ahead of an escaped `'` would
 * neutralize the quote escape and break out of the literal (KQL injection).
 * Exported for tests only.
 * @internal
 */
export function kqlStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchLiveTagsForIds(ids: readonly string[], http: AzureHttp, subscriptions: string[]): Promise<Map<string, DriftableResource>> {
  const live = new Map<string, DriftableResource>();
  if (ids.length === 0) {
    return live;
  }

  for (const batch of chunk(ids, BATCH_SIZE)) {
    const query = `Resources | where id in~ (${batch.map(kqlStringLiteral).join(', ')}) | project id, tags`;
    let skipToken: string | undefined;

    do {
      const body: Record<string, unknown> = {
        subscriptions,
        query,
        ...(skipToken !== undefined ? { options: { $skipToken: skipToken } } : {}),
      };
      const res = await http.request({ method: 'POST', url: RESOURCE_GRAPH_URL, body });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`verifyAzureBaseline: Resource Graph query failed: HTTP ${res.status}`);
      }

      const responseBody = res.body as ResourceGraphResponseBody;
      for (const row of responseBody.data ?? []) {
        const id = row.id.toLowerCase();
        const tags = row.tags !== null && row.tags !== undefined && Object.keys(row.tags).length > 0 ? row.tags : undefined;
        live.set(id, { id, tags });
      }
      skipToken = responseBody.$skipToken;
    } while (skipToken !== undefined);
  }

  return live;
}

export interface VerifyAzureBaselineOptions {
  http: AzureHttp;
}

/**
 * Compare live Azure state against `baseline` for `resourceIds` (or, when
 * omitted, every resource `baseline` itself recorded), via a single batched
 * Resource Graph query per {@link BATCH_SIZE} ids.
 */
export async function verifyAzureBaseline(
  baseline: Inventory,
  resourceIds: string[] | undefined,
  options: VerifyAzureBaselineOptions,
): Promise<DriftReport> {
  const { http } = options;

  // Lowercase symmetrically on both paths: `resourceIds` (an explicit
  // caller-supplied restriction) is lowercased below, and so is every key
  // this map is built with — a hand-edited baseline Inventory isn't
  // guaranteed to have already-lowercased ids the way a freshly-fetched one
  // is (Resource Graph convention), so without this the default path (no
  // `resourceIds` given) could silently fail to match `live`'s lowercased
  // keys and report spurious `resource-disappeared` drift.
  const baselineById = new Map<string, DriftableResource>(
    baseline.spec.resources.map((resource) => [resource.id.toLowerCase(), resource]),
  );
  const targetIds =
    resourceIds !== undefined
      ? [...new Set(resourceIds.map((id) => id.toLowerCase()))].sort(compareResourceIds)
      : [...baselineById.keys()].sort(compareResourceIds);

  const live = await fetchLiveTagsForIds(targetIds, http, baseline.spec.scope.subscriptions);

  return computeDriftReport(targetIds, baselineById, live);
}
