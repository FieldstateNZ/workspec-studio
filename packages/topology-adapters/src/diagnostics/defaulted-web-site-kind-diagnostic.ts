import type { Diagnostic } from '../types.js';

/**
 * Builds the diagnostic emitted when an ARM `Microsoft.Web/sites` resource
 * has no `kind` property at all, so `resolveArmCatalogKey` silently defaults
 * it to App Service. Absence of `kind` (as opposed to a `kind` that simply
 * doesn't mention `"functionapp"`) is the risky case: a Function App whose
 * `kind` was stripped or omitted upstream would otherwise import as a
 * mis-typed App Service with no visible sign anything was guessed. `info`,
 * not `warning`: the default is a reasonable one and most inputs that hit
 * this path genuinely are App Services, but it's still worth surfacing.
 */
export function defaultedWebSiteKindDiagnostic(source: string): Diagnostic {
  return {
    severity: 'info',
    message:
      'Microsoft.Web/sites resource had no `kind` property; defaulted to App Service. ' +
      'Verify this was not a Function App with a stripped `kind`.',
    source,
  };
}
