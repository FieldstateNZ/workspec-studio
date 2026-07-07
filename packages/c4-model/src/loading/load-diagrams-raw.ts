import { parseDiagramYaml, slugFromPath } from '@workspec/c4-schema';
import type { Diagram } from '@workspec/c4-schema';
import { parseIssuesToDiagnostics } from '../diagnostics/parse-issues-to-diagnostics.js';
import type { C4Diagnostic } from '../model/diagnostic.types.js';
import type { C4FileSource } from '../ports/c4-file-source.js';
import { discoverDiagramPaths } from '../discovery/discover-diagram-paths.js';

/** One successfully parsed diagram file, thin or fat shape, ahead of ref resolution. */
export interface RawDiagram {
  readonly slug: string;
  readonly path: string;
  readonly data: Diagram;
  /** The raw YAML source, kept so resolution diagnostics can locate the offending node/edge entry's line. */
  readonly text: string;
}

/** Every diagram file successfully parsed, plus every parse-error diagnostic found along the way. */
export interface LoadedDiagramsRaw {
  readonly diagrams: readonly RawDiagram[];
  readonly diagnostics: readonly C4Diagnostic[];
}

/** Reads, parses, and validates every discovered diagram file (thin or fat). */
export async function loadDiagramsRaw(source: C4FileSource): Promise<LoadedDiagramsRaw> {
  const paths = await discoverDiagramPaths(source);
  const diagnostics: C4Diagnostic[] = [];
  const diagrams: RawDiagram[] = [];

  // Read concurrently, but parse and push in the fixed, sorted `paths`
  // order — see `load-elements.ts` for why this matters for snapshot
  // determinism.
  const texts = await Promise.all(paths.map((path) => source.readFile(path)));
  paths.forEach((path, index) => {
    const slug = slugFromPath(path);
    const text = texts[index];
    if (!slug || text === undefined) return;
    const result = parseDiagramYaml(text);
    if (result.ok) {
      diagrams.push({ slug, path, data: result.data, text });
    } else {
      diagnostics.push(...parseIssuesToDiagnostics(path, result.errors));
    }
  });

  return { diagrams, diagnostics };
}
