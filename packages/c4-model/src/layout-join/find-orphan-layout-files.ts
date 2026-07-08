import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { RawLayout } from '../loading/load-layouts-raw.js';

/** Flags every `.layout/<slug>.yaml` whose slug names no diagram artifact at all. */
export function findOrphanLayoutFiles(
  layouts: readonly RawLayout[],
  diagramSlugs: ReadonlySet<string>,
): readonly C4Diagnostic[] {
  return layouts
    .filter((layout) => !diagramSlugs.has(layout.diagramSlug))
    .map((layout) =>
      makeDiagnostic(
        'warning',
        DIAGNOSTIC_CODES.orphanLayoutFile,
        `layout file has no matching diagram "${layout.diagramSlug}"`,
        layout.path,
      ),
    );
}
