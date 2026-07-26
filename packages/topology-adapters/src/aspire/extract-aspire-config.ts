import type { AspireResourceInput } from './aspire-resource-input.js';

/** One curated endpoint entry copied verbatim into `config.endpoints` — see `extractAspireConfig`. */
interface CuratedEndpoint {
  readonly name: string;
  readonly scheme?: string;
  readonly port?: number;
  readonly targetPort?: number;
  readonly external?: boolean;
}

/**
 * Curated, per-resource subset of an Aspire graph resource's own fields
 * copied into `ResourceSpec.config`: the container image / executable
 * command + working directory, and declared endpoints. Deliberately not a
 * full mirror of the graph node — `properties` is always an empty reserved
 * map in `workspec-graph/v1` (nothing to copy there yet), and `parent` has
 * no home in `config` (see the adapter's own doc comment on why parent/child
 * relationships aren't represented at all in v0). Mirrors the other
 * adapters' `extract-*-config.ts` curated-subset convention. Returns
 * `undefined` when nothing survives, so callers can omit `config` entirely
 * rather than writing `{}`.
 */
export function extractAspireConfig(
  resource: AspireResourceInput,
): Record<string, unknown> | undefined {
  const config: Record<string, unknown> = {};

  if (resource.image !== undefined) config.image = resource.image;
  if (resource.command !== undefined) config.command = resource.command;
  if (resource.workingDirectory !== undefined) config.workingDirectory = resource.workingDirectory;
  if (resource.endpoints.length > 0) {
    config.endpoints = resource.endpoints.map(
      (endpoint): CuratedEndpoint => ({
        name: endpoint.name,
        ...(endpoint.scheme !== undefined ? { scheme: endpoint.scheme } : {}),
        ...(endpoint.port !== undefined ? { port: endpoint.port } : {}),
        ...(endpoint.targetPort !== undefined ? { targetPort: endpoint.targetPort } : {}),
        ...(endpoint.external !== undefined ? { external: endpoint.external } : {}),
      }),
    );
  }

  return Object.keys(config).length > 0 ? config : undefined;
}
