import { DIAGNOSTIC_CODES } from '../model/diagnostic-codes.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import { ELEMENT_KINDS } from '../model/element-kind.js';
import { makeDiagnostic } from '../diagnostics/make-diagnostic.js';
import type { LoadedElements } from '../loading/load-elements.js';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { elementLinkTargets } from './element-link-targets.js';

/**
 * Checks every element's `~/`-rooted `links` entries resolve to a real file
 * in the tree, raising `dangling-link` (warning) for any that don't.
 * Iterates `ELEMENT_KINDS`, then each kind's elements in slug order, so the
 * diagnostics array is deterministic regardless of I/O completion order.
 */
export async function checkDanglingLinks(source: C4FileSource, elements: LoadedElements): Promise<readonly C4Diagnostic[]> {
  const diagnostics: C4Diagnostic[] = [];

  for (const kind of ELEMENT_KINDS) {
    const slugs = Array.from(elements.byKind[kind].keys()).sort();
    for (const slug of slugs) {
      const loaded = elements.byKind[kind].get(slug);
      if (!loaded) continue;
      const targets = elementLinkTargets(loaded.element.data.links);
      for (const target of targets) {
        const present = await source.exists(target);
        if (!present) {
          diagnostics.push(
            makeDiagnostic(
              'warning',
              DIAGNOSTIC_CODES.danglingLink,
              `links entry "~/${target}" does not resolve to a file in the tree`,
              loaded.path,
            ),
          );
        }
      }
    }
  }

  return diagnostics;
}
