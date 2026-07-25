import { finalizeAdapterOutput } from '../finalize-adapter-output.js';
import type { AdapterOutput } from '../types.js';
import { collectResourceGraphRows } from './collect-resource-graph-rows.js';
import { mapResourceGraphRow } from './map-resource-graph-row.js';

/**
 * The azure-resource-graph import adapter: consumes an already-parsed Azure
 * Resource Graph query result (`{ data: [...] }`) and produces the
 * `Resource` artifacts it can map, plus a diagnostic for every row whose ARM
 * `type` has no entry in the vendor→kind mapping table. Pure — no
 * filesystem or network IO; the caller runs the ARG query and passes the
 * parsed result. Resources that map to the same `metadata.slug` are
 * disambiguated — see `disambiguateDuplicateSlugs`.
 */
export function resourceGraphAdapter(input: unknown): AdapterOutput {
  const rows = collectResourceGraphRows(input);
  return finalizeAdapterOutput(rows.map(mapResourceGraphRow));
}
