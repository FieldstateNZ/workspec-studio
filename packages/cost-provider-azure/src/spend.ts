import { API_VERSION, SpendArtifact, compareSpendRows } from '@workspec/cost-schema';
import type { Spend, SpendRowType } from '@workspec/cost-schema';
import type { ProviderScope } from '@workspec/cost-provider';
import type { AzureHttp } from './http.js';
import { mapWithConcurrency } from './pool.js';

// ── Spend via Azure Cost Management ─────────────────────────────────────────
// One query PER SUBSCRIPTION (Cost Management's query API is scoped to a
// single subscription — there is no cross-subscription equivalent to
// Resource Graph's `subscriptions` array), each paged via `nextLink` to
// exhaustion, then merged into one Spend artifact for the requested period.
//
// JUDGMENT CALL (flagged — could not fully verify against live Azure docs
// from training knowledge alone): this implementation maps response rows to
// `{ amount, resourceId, serviceCategory, currency }` by COLUMN NAME (via
// `properties.columns[].name`), never by position — Cost Management's
// documented behavior is that column order depends on the requested
// `grouping`/`aggregation`, so name-based lookup is the only robust choice
// regardless of the exact order a live tenant returns. The currency column
// is not one we explicitly request in `dataset.aggregation`/`grouping`, but
// Cost Management is documented to append a currency column to every query
// response; we look for the first of a few plausible names
// (`Currency`, `BillingCurrencyCode`, `PricingCurrencyCode`, case-insensitive)
// and fall back to `UNKNOWN_CURRENCY_PLACEHOLDER` (schema-valid but clearly a
// placeholder) if none is present, so a live-check run surfaces the gap
// immediately rather than silently mis-mapping some other column as currency.

const COST_MANAGEMENT_API_VERSION = '2024-08-01';
const COST_MANAGEMENT_QUERY_PATH = (subscriptionId: string): string =>
  `https://management.azure.com/subscriptions/${subscriptionId}/providers/Microsoft.CostManagement/query?api-version=${COST_MANAGEMENT_API_VERSION}`;

/** A currency this package emits when Cost Management's response carried none of the expected currency-column names — never a real currency; a signal to fix the mapping. */
export const UNKNOWN_CURRENCY_PLACEHOLDER = 'XXX';

const CURRENCY_COLUMN_NAMES = ['currency', 'billingcurrencycode', 'pricingcurrencycode'];

interface CostManagementColumn {
  name: string;
  type?: string;
}

interface CostManagementResponseBody {
  properties?: {
    columns?: CostManagementColumn[];
    rows?: unknown[][];
    nextLink?: string;
  };
}

/**
 * Default {@link FetchSpendOptions.maxConcurrency} — a small, conservative
 * cap on how many subscriptions' Cost Management queries `fetchAzureSpend`
 * has in flight at once. Chosen to meaningfully cut down simultaneous
 * queries (and the 429 pile-up an unbounded fan-out causes) without
 * serializing a large scope into an unnecessarily slow crawl.
 */
const DEFAULT_MAX_CONCURRENCY = 4;

export interface FetchSpendOptions {
  http: AzureHttp;
  /**
   * Maximum number of subscriptions to query concurrently. Defaults to
   * {@link DEFAULT_MAX_CONCURRENCY} (4). `0`, a negative number, or omitting
   * the option falls back to that default; a value `>=
   * scope.subscriptions.length` behaves like the old unbounded `Promise.all`
   * fan-out (every subscription queried at once). Bounding this matters
   * because Cost Management's query API is scoped per-subscription (see the
   * module note above) — a scope with many subscriptions would otherwise
   * fire every query at once, amplifying 429 throttling even though
   * `withRetry` (see `./http.ts`) honors `Retry-After` on each individual
   * request.
   */
  maxConcurrency?: number;
}

/** First instant and last instant of the ISO month `period` ("YYYY-MM"), as UTC ISO datetimes. */
function monthRange(period: string): { from: string; to: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (match === null) {
    throw new Error(`fetchAzureSpend: period must be an ISO month "YYYY-MM", got "${period}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 1);
  return { from: from.toISOString(), to: to.toISOString() };
}

function buildQueryBody(period: string): Record<string, unknown> {
  const { from, to } = monthRange(period);
  return {
    type: 'ActualCost',
    timeframe: 'Custom',
    timePeriod: { from, to },
    dataset: {
      granularity: 'None',
      aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
      grouping: [
        { type: 'Dimension', name: 'ResourceId' },
        { type: 'Dimension', name: 'ServiceName' },
      ],
    },
  };
}

/** Build a name -> column-index map, case-insensitive. */
function columnIndex(columns: CostManagementColumn[]): Map<string, number> {
  const index = new Map<string, number>();
  columns.forEach((column, i) => {
    index.set(column.name.toLowerCase(), i);
  });
  return index;
}

function findCurrency(index: Map<string, number>, row: unknown[]): string {
  for (const name of CURRENCY_COLUMN_NAMES) {
    const i = index.get(name);
    if (i !== undefined && typeof row[i] === 'string' && row[i] !== '') {
      return row[i] as string;
    }
  }
  return UNKNOWN_CURRENCY_PLACEHOLDER;
}

function rowsForSubscription(
  columns: CostManagementColumn[],
  rawRows: unknown[][],
  period: string,
): SpendRowType[] {
  const index = columnIndex(columns);
  const costIdx = index.get('cost');
  const resourceIdIdx = index.get('resourceid');
  const serviceNameIdx = index.get('servicename');

  if (costIdx === undefined || resourceIdIdx === undefined || serviceNameIdx === undefined) {
    throw new Error(
      'fetchAzureSpend: Cost Management response is missing an expected column ' +
        '(Cost, ResourceId, or ServiceName)',
    );
  }

  return rawRows.map((row): SpendRowType => {
    const amount = Number(row[costIdx]);
    const serviceCategory = String(row[serviceNameIdx]);
    const currency = findCurrency(index, row);
    const rawResourceId = row[resourceIdIdx];
    const resourceId = typeof rawResourceId === 'string' && rawResourceId.length > 0 ? rawResourceId : undefined;

    if (resourceId === undefined) {
      return {
        amount,
        currency,
        period,
        serviceCategory,
        unresolved: true,
        sourceLabel: serviceCategory,
      };
    }
    return {
      resourceId: resourceId.toLowerCase(),
      amount,
      currency,
      period,
      serviceCategory,
    };
  });
}

async function fetchOneSubscription(
  subscriptionId: string,
  period: string,
  http: AzureHttp,
): Promise<SpendRowType[]> {
  const rows: SpendRowType[] = [];
  let url = COST_MANAGEMENT_QUERY_PATH(subscriptionId);
  // Re-sent verbatim on every page, including the continuation request —
  // see the note below.
  const body = buildQueryBody(period);

  for (;;) {
    const res = await http.request({ method: 'POST', url, body });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`fetchAzureSpend: Cost Management query failed for "${subscriptionId}": HTTP ${res.status}`);
    }

    const responseBody = res.body as CostManagementResponseBody;
    const columns = responseBody.properties?.columns ?? [];
    const rawRows = responseBody.properties?.rows ?? [];
    rows.push(...rowsForSubscription(columns, rawRows, period));

    const nextLink = responseBody.properties?.nextLink;
    if (nextLink === undefined) break;
    // Cost Management's `nextLink` is NOT GET-able: a GET against it returns
    // HTTP 400 "Dataset is invalid or not supplied" (verified against
    // azure-rest-api-specs issue #12276). The continuation must be POSTed,
    // re-sending the SAME query body as the original request — Cost
    // Management's paging model re-runs the whole query with a continuation
    // token baked into the URL, it doesn't remember the request body
    // server-side.
    url = nextLink;
  }

  return rows;
}

/**
 * Fetch a schema-valid {@link Spend} for `period` ("YYYY-MM") across every
 * subscription in `scope`, querying Azure Cost Management once per
 * subscription (each paged via `nextLink` to exhaustion) and merging the
 * results. Rows with no resolvable `ResourceId` (reservation purchases,
 * savings plan charges, rounding adjustments, etc) become `unresolved: true`
 * rows with `sourceLabel` set to the row's `ServiceName`.
 */
export async function fetchAzureSpend(scope: ProviderScope, period: string, options: FetchSpendOptions): Promise<Spend> {
  if (scope.subscriptions.length === 0) {
    throw new Error('fetchAzureSpend: scope.subscriptions must be non-empty');
  }
  const { http, maxConcurrency } = options;
  const concurrency = maxConcurrency !== undefined && maxConcurrency > 0 ? maxConcurrency : DEFAULT_MAX_CONCURRENCY;

  const perSubscription = await mapWithConcurrency(scope.subscriptions, concurrency, (subscriptionId) =>
    fetchOneSubscription(subscriptionId, period, http),
  );
  const rows = perSubscription.flat().sort(compareSpendRows);

  const spend: Spend = {
    apiVersion: API_VERSION,
    kind: 'Spend',
    metadata: { id: `${scope.subscriptions.join('-')}-${period}` },
    spec: { rows },
  };

  const parsed = SpendArtifact.safeParse(spend);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(
      `fetchAzureSpend: Cost Management response mapped to an invalid Spend (${issue ? `${issue.path.join('.')}: ${issue.message}` : 'invalid'})`,
    );
  }
  return parsed.data;
}
