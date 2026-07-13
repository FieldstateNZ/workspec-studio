// `import-aspire --mode scaffold`: writes the desired projection via the
// existing `C4FileSource` file-source machinery. Idempotent by construction —
// every write is skipped when the desired bytes already match what's on
// disk, so a second run against the same graph touches nothing.

import type { C4FileSource } from '@workspec/c4-model';
import { artifactPathFor, TYPE_DIRECTORIES, WORKSPEC_DIR } from '@workspec/c4-schema';
import { ASPIRE_DIAGRAM_SLUG } from './constants.js';
import { isAspireManagedDiagram, isAspireManagedYaml } from './governance.js';
import { projectAspireGraph } from './project.js';
import { serializeDiagram, serializeElement, serializeSystem } from './serialize.js';
import type { AspireGraph } from './graph-schema.js';

/** What happened to one file during a scaffold run. */
export type ScaffoldAction = 'created' | 'updated' | 'unchanged' | 'skipped-conflict';

/** One file `scaffold` considered, and what it did with it. */
export interface ScaffoldFileResult {
  readonly path: string;
  readonly action: ScaffoldAction;
}

/** Full report of a `scaffold` run. */
export interface ScaffoldReport {
  readonly files: readonly ScaffoldFileResult[];
  /** Resource names skipped because they are `kind: "parameter"`. */
  readonly skippedParameters: readonly string[];
}

/** Writes (or updates) a file only when its desired content differs from what's already there; reports what happened. */
async function writeIfChanged(
  source: C4FileSource,
  path: string,
  desiredText: string,
): Promise<ScaffoldFileResult> {
  const exists = await source.exists(path);
  if (!exists) {
    await source.writeFile(path, desiredText);
    return { path, action: 'created' };
  }
  const existingText = await source.readFile(path);
  if (existingText === desiredText) {
    return { path, action: 'unchanged' };
  }
  await source.writeFile(path, desiredText);
  return { path, action: 'updated' };
}

/**
 * Projects `graph` and writes the result into `source`'s tree.
 *
 * - The system singleton is created (from the apphost's name) only when the
 *   `system/` directory has no file at all — an existing system, hand-
 *   authored or not, is never touched.
 * - Each mapped element is created if absent, updated in place if it's
 *   already `aspire-managed`-tagged, or left alone (reported as
 *   `skipped-conflict`) if a hand-authored file already occupies its path —
 *   `import-aspire` never clobbers content it doesn't own.
 * - The one generated diagram is fully regenerated from the current graph —
 *   but only when the file at the reserved slug is recognizably
 *   machine-generated (it starts with the schema-directive marker
 *   `import-aspire` always writes). A pre-existing hand-authored diagram at
 *   that slug is skipped as `skipped-conflict`, same as an untagged element.
 * - Nothing is ever deleted: a resource that disappears from the graph
 *   leaves its old element file in place, `aspire-managed`-tagged — run
 *   `--mode check` to find and clean those up yourself.
 */
export async function scaffoldAspireGraph(
  source: C4FileSource,
  graph: AspireGraph,
): Promise<ScaffoldReport> {
  const projection = projectAspireGraph(graph);
  const files: ScaffoldFileResult[] = [];

  const systemDir = `${WORKSPEC_DIR}/${TYPE_DIRECTORIES.system}`;
  const existingSystemFiles = await source.listFiles(systemDir);
  if (existingSystemFiles.length === 0) {
    const systemPath = artifactPathFor('system', projection.system.slug);
    await source.writeFile(systemPath, serializeSystem(projection.system));
    files.push({ path: systemPath, action: 'created' });
  }

  for (const element of projection.elements) {
    const desiredText = serializeElement(element);
    const exists = await source.exists(element.path);
    if (exists) {
      const existingText = await source.readFile(element.path);
      if (!isAspireManagedYaml(existingText)) {
        files.push({ path: element.path, action: 'skipped-conflict' });
        continue;
      }
    }
    files.push(await writeIfChanged(source, element.path, desiredText));
  }

  const diagramPath = artifactPathFor('diagram', ASPIRE_DIAGRAM_SLUG);
  const desiredDiagramText = serializeDiagram(projection.elements, projection.edges);
  const diagramExists = await source.exists(diagramPath);
  if (diagramExists && !isAspireManagedDiagram(await source.readFile(diagramPath))) {
    // A hand-authored diagram occupies the reserved slug — never clobber it.
    files.push({ path: diagramPath, action: 'skipped-conflict' });
  } else {
    files.push(await writeIfChanged(source, diagramPath, desiredDiagramText));
  }

  return { files, skippedParameters: projection.skippedParameters };
}
