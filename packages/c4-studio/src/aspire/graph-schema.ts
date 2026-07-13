// Zod schema for the `workspec-graph/v1` document a .NET Aspire apphost
// dumps (produced by C# code landing in a parallel slice, "A1"). This schema
// is deliberately aspire-specific and lives here in c4-studio, not in
// `@workspec/c4-schema` — it describes an EXTERNAL producer's contract, not a
// WorkSpec artifact shape.
//
// Every nested object schema below is intentionally NOT `.strict()`: this is
// a cross-team boundary contract with a separately-built producer, not a
// hand-authored file a human might typo. Rejecting on an unexpected extra
// key would turn a harmless additive field from the producer into a hard
// failure; version drift is caught explicitly via the `version` literal
// check in `parseAspireGraph` instead, which is the one thing this contract
// promises to bump on a breaking change.

import { z } from 'zod';

/** The only graph version this build understands. A mismatch is a usage error, not a diagnostic. */
export const ASPIRE_GRAPH_VERSION = 'workspec-graph/v1';

/** The six resource kinds `A1` classifies every Aspire resource into. */
export const ASPIRE_RESOURCE_KINDS = [
  'container',
  'executable',
  'project',
  'parameter',
  'azure',
  'unknown',
] as const;

/** One of the six Aspire resource kinds. */
export type AspireResourceKind = (typeof ASPIRE_RESOURCE_KINDS)[number];

const AspireResourceKindSchema = z.enum(ASPIRE_RESOURCE_KINDS);

/** How one resource's `references` entry relates it to its `target`. */
export const ASPIRE_REFERENCE_VIA = [
  'connection-string',
  'endpoint',
  'environment',
  'wait',
  'relationship',
  'unknown',
] as const;

/** One of the six reference-via kinds. */
export type AspireReferenceVia = (typeof ASPIRE_REFERENCE_VIA)[number];

const AspireReferenceViaSchema = z.enum(ASPIRE_REFERENCE_VIA);

const AspireEndpoint = z.object({
  name: z.string(),
  // The producer's `Scheme` is nullable, same as port/targetPort — an
  // endpoint without a scheme is still a valid endpoint.
  scheme: z.string().nullable().optional(),
  port: z.number().nullable().optional(),
  targetPort: z.number().nullable().optional(),
  external: z.boolean().optional(),
});

/** One `references` entry: a directed link from the owning resource to `target`. */
export const AspireReference = z.object({
  target: z.string(),
  via: AspireReferenceViaSchema,
  label: z.string().nullable().optional(),
});

export type AspireReference = z.infer<typeof AspireReference>;

/** One node of the Aspire resource graph. */
export const AspireResource = z.object({
  name: z.string(),
  kind: AspireResourceKindSchema,
  typeName: z.string(),
  image: z.string().nullable().optional(),
  command: z.string().nullable().optional(),
  workingDirectory: z.string().nullable().optional(),
  endpoints: z.array(AspireEndpoint).optional().default([]),
  parent: z.string().nullable().optional(),
  references: z.array(AspireReference).optional().default([]),
  properties: z.record(z.string(), z.unknown()).optional().default({}),
});

export type AspireResource = z.infer<typeof AspireResource>;

/** The full `workspec-graph/v1` document. */
export const AspireGraph = z.object({
  version: z.literal(ASPIRE_GRAPH_VERSION),
  apphost: z.object({ name: z.string() }),
  resources: z.array(AspireResource),
});

export type AspireGraph = z.infer<typeof AspireGraph>;

/** Result of {@link parseAspireGraph}: either the validated graph, or a single human-readable usage-error message. */
export type ParseAspireGraphResult =
  | { readonly ok: true; readonly data: AspireGraph }
  | { readonly ok: false; readonly message: string };

/**
 * Parses and validates a `workspec-graph/v1` JSON document from raw text.
 * Every failure mode — invalid JSON, a missing/wrong `version`, or any other
 * schema violation — resolves to a single `message` string meant for a CLI
 * usage error (exit 2), never a diagnostics array: a malformed graph dump is
 * an input-file problem, not a tree-drift finding.
 */
export function parseAspireGraph(text: string): ParseAspireGraphResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, message: `invalid JSON: ${(error as Error).message}` };
  }

  const version =
    json !== null && typeof json === 'object' && 'version' in json
      ? (json as { version: unknown }).version
      : undefined;
  if (version !== ASPIRE_GRAPH_VERSION) {
    const found = typeof version === 'string' ? `"${version}"` : 'missing';
    return {
      ok: false,
      message: `unsupported graph version (found ${found}, expected "${ASPIRE_GRAPH_VERSION}")`,
    };
  }

  const result = AspireGraph.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first !== undefined && first.path.length > 0 ? first.path.join('.') : '(root)';
    const suffix = result.error.issues.length > 1 ? ` (+${result.error.issues.length - 1} more)` : '';
    return {
      ok: false,
      message: `invalid graph: ${path}: ${first?.message ?? 'schema validation failed'}${suffix}`,
    };
  }

  return { ok: true, data: result.data };
}
