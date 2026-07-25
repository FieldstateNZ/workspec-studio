import type { Diagnostic } from '../types.js';

/**
 * Builds the standard diagnostic every adapter emits for a vendor resource
 * whose type has no entry in the vendor→kind mapping table. Shared so the
 * message shape (and the decision to skip rather than guess a kind) reads
 * identically across the terraform/bicep/azure-resource-graph adapters — see
 * the package README for why "skip + diagnostic" was chosen over emitting a
 * best-effort generic resource.
 */
export function unmappedTypeDiagnostic(vendorType: string, source: string): Diagnostic {
  return {
    severity: 'warning',
    message: `No resource-kind mapping for vendor type "${vendorType}"; resource skipped.`,
    source,
  };
}
