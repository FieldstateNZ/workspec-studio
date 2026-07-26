/**
 * One `endpoints[]` entry off a `workspec-graph/v1` resource — see
 * `docs/aspire-hosting/graph-contract.md`. All fields but `name` are
 * genuinely optional in the contract (a design-time endpoint may have no
 * scheme/port yet).
 */
export interface AspireEndpointInput {
  readonly name: string;
  readonly scheme?: string | undefined;
  readonly port?: number | undefined;
  readonly targetPort?: number | undefined;
  readonly external?: boolean | undefined;
}

/**
 * One `references[]` entry off a `workspec-graph/v1` resource: a directed
 * edge from the owning resource to `target`, classified by `via`. `via` is
 * kept as a plain `string` here (not the closed six-value union
 * `docs/aspire-hosting/graph-contract.md` documents) — this package reads
 * already-parsed JSON of unknown shape and never throws on an unrecognized
 * value; `derive-aspire-connections.ts` treats any `via` outside its known
 * set as "not a connection" rather than rejecting the whole document, which
 * degrades gracefully against a future producer's additive `via` value.
 */
export interface AspireReferenceInput {
  readonly target: string;
  readonly via: string;
  readonly label?: string | undefined;
}

/**
 * One `resources[]` entry off a `workspec-graph/v1` document, after
 * `collect-aspire-resources.ts` has guarded every field to its expected JSON
 * type. `kind` is likewise kept as a plain `string` (not the closed
 * `container | executable | project | parameter | azure | unknown` union) —
 * same forward-compatibility rationale as `AspireReferenceInput.via`;
 * `classify-aspire-resource.ts` falls back to a generic `compute` Resource
 * for any `kind` it doesn't specifically recognize, rather than dropping the
 * resource.
 */
export interface AspireResourceInput {
  readonly name: string;
  readonly kind: string;
  readonly typeName: string;
  readonly image?: string | undefined;
  readonly command?: string | undefined;
  readonly workingDirectory?: string | undefined;
  readonly endpoints: readonly AspireEndpointInput[];
  readonly parent?: string | undefined;
  readonly references: readonly AspireReferenceInput[];
}
