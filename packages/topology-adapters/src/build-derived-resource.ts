import { API_VERSION } from '@workspec/topology-schema';
import type { Resource, ResourceKindType as ResourceKind } from '@workspec/topology-schema';

/** The fields every adapter has already derived for one vendor resource, ready to become a `Resource` artifact. */
export interface DerivedResourceInput {
  readonly slug: string;
  readonly name: string;
  readonly kind: ResourceKind;
  readonly type: string;
  readonly provider: string;
  readonly network?: string | undefined;
  readonly resourceGroup?: string | undefined;
  readonly config?: Record<string, unknown> | undefined;
  /** The stable provenance string for `spec.source.from` (a Terraform address, an ARM type+name, an ARG resource id). */
  readonly from: string;
}

/**
 * Assembles the K8s-style `{apiVersion, kind, metadata, spec}` envelope every
 * `Resource` artifact shares (`@workspec/schema-core`'s `defineArtifact`
 * shape, mirrored by `@workspec/topology-schema`'s `ResourceArtifact`).
 * Shared by all three adapters so the envelope is built in exactly one place
 * — this is the function that makes the tree-diff invariant hold: every
 * derived resource comes out of here with `spec.source = {kind: 'derived',
 * from}`, the same shape an authored resource has plus that one field.
 *
 * Optional `ResourceSpec` fields are omitted (not set to `undefined`) when
 * absent, matching the package's `exactOptionalPropertyTypes: true` tsconfig.
 */
export function buildDerivedResource(input: DerivedResourceInput): Resource {
  return {
    apiVersion: API_VERSION,
    kind: 'Resource',
    metadata: { slug: input.slug },
    spec: {
      name: input.name,
      kind: input.kind,
      type: input.type,
      provider: input.provider,
      ...(input.network !== undefined ? { network: input.network } : {}),
      ...(input.resourceGroup !== undefined ? { resourceGroup: input.resourceGroup } : {}),
      ...(input.config !== undefined ? { config: input.config } : {}),
      source: { kind: 'derived', from: input.from },
    },
  };
}
