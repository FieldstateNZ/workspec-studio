import { slugFromPath } from '@workspec/c4-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { ElementKind } from '../model/element-kind.js';
import { ELEMENT_KINDS } from '../model/element-kind.js';
import type { LoadedElement } from '../model/element-data.types.js';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { discoverElementPaths } from '../discovery/discover-element-paths.js';
import { ELEMENT_PARSERS_BY_KIND } from './element-parsers-by-kind.js';

/** Every element successfully loaded, grouped by kind, plus every parse-error diagnostic found along the way. */
export interface LoadedElements {
  readonly byKind: Record<ElementKind, ReadonlyMap<string, LoadedElement>>;
  readonly diagnostics: readonly C4Diagnostic[];
}

/**
 * Reads, parses, and validates every discovered element file. A file that
 * fails to parse contributes its `parse-error` diagnostics and is simply
 * absent from `byKind` — best-effort loading, never a thrown exception.
 */
export async function loadElements(source: C4FileSource): Promise<LoadedElements> {
  const discovered = await discoverElementPaths(source);
  const diagnostics: C4Diagnostic[] = [];
  const byKind = Object.fromEntries(
    ELEMENT_KINDS.map((kind) => [kind, new Map<string, LoadedElement>()]),
  ) as Record<ElementKind, Map<string, LoadedElement>>;

  for (const { kind, paths } of discovered) {
    // Read concurrently, but parse and insert in the fixed, sorted `paths`
    // order — insertion order into `byKind[kind]` (and the diagnostics
    // array) must not depend on which file's I/O happens to resolve first,
    // or golden snapshots would be flaky.
    const texts = await Promise.all(paths.map((path) => source.readFile(path)));
    paths.forEach((path, index) => {
      const slug = slugFromPath(path);
      const text = texts[index];
      if (!slug || text === undefined) return;
      const result = ELEMENT_PARSERS_BY_KIND[kind](text);
      if (result.ok) {
        byKind[kind].set(slug, { slug, path, element: result.data });
      } else {
        diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
      }
    });
  }

  return { byKind, diagnostics };
}
