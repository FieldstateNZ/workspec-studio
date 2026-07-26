import type { Resource } from '@workspec/topology-schema';
import { buildDerivedResource } from '../build-derived-resource.js';
import { unmappedTypeDiagnostic } from '../diagnostics/unmapped-type-diagnostic.js';
import { toSlug } from '../slug.js';
import type { Diagnostic } from '../types.js';
import type { AspireResourceInput } from './aspire-resource-input.js';
import { classifyAspireResource } from './classify-aspire-resource.js';
import { extractAspireConfig } from './extract-aspire-config.js';
import { unclassifiedAspireKindDiagnostic } from './unclassified-aspire-kind-diagnostic.js';

/** Outcome of mapping one Aspire graph resource: `resource` is set unless the resource was skipped (parameter) or unmapped (no kind mapping), alongside zero or more diagnostics. */
export interface MapAspireResourceResult {
  readonly resource?: Resource;
  readonly diagnostics: readonly Diagnostic[];
}

/**
 * Maps one `workspec-graph/v1` resource to a `Resource` artifact, or to a
 * diagnostic when it's `'unmapped'` (see `classifyAspireResource`), or to
 * nothing at all when it's `'skip'` (a `kind: "parameter"` node — silent,
 * not an anomaly).
 *
 * `spec.source.from` is the Aspire resource `name` itself — the graph's own
 * unique key (`docs/aspire-hosting/graph-contract.md`: "Aspire resource
 * name — unique key, sort key") — the same role a Terraform address or an
 * ARM `type:name` pair plays for the other adapters' provenance strings.
 */
export function mapAspireResource(resource: AspireResourceInput): MapAspireResourceResult {
  const classification = classifyAspireResource(resource.kind, resource.typeName);

  if (classification.outcome === 'skip') {
    return { diagnostics: [] };
  }
  if (classification.outcome === 'unmapped') {
    return { diagnostics: [unmappedTypeDiagnostic(resource.typeName, resource.name)] };
  }

  const diagnostics: Diagnostic[] = [];
  if (resource.kind === 'unknown') {
    diagnostics.push(unclassifiedAspireKindDiagnostic(resource.name, resource.typeName));
  }

  return {
    resource: buildDerivedResource({
      slug: toSlug(resource.name),
      name: resource.name,
      kind: classification.kind,
      type: classification.type,
      provider: classification.provider,
      config: extractAspireConfig(resource),
      from: resource.name,
    }),
    diagnostics,
  };
}
