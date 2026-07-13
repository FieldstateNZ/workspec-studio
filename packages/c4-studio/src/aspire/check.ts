// `import-aspire --mode check`: computes the same desired projection
// `scaffold` would write, but only reads the existing tree and reports drift
// — never writes. Only `aspire-managed`-tagged elements are governed, and
// the diagram at the reserved slug is only governed when it carries the
// machine-generated marker; a hand-authored file in either position is
// never flagged.

import { parse as parseYaml } from 'yaml';
import type { C4FileSource } from '@workspec/c4-model';
import { artifactPathFor, slugFromPath, TYPE_DIRECTORIES, WORKSPEC_DIR } from '@workspec/c4-schema';
import { ASPIRE_DIAGNOSTIC_CODES } from './diagnostics.js';
import type { AspireDiagnostic } from './diagnostics.js';
import { ASPIRE_DIAGRAM_SLUG, ASPIRE_MANAGED_TAG } from './constants.js';
import { isAspireManagedDiagram } from './governance.js';
import { projectAspireGraph } from './project.js';
import type { AspireGraph } from './graph-schema.js';
import type { ElementBucket } from './classify.js';

const GOVERNED_KINDS: readonly ElementBucket[] = ['container', 'database', 'queue', 'external-system'];

interface ParsedElementFile {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly technology?: unknown;
  readonly tags?: unknown;
}

function parseElementFile(text: string): ParsedElementFile | null {
  try {
    const data = parseYaml(text) as unknown;
    return data !== null && typeof data === 'object' ? (data as ParsedElementFile) : null;
  } catch {
    return null; // unparsable — `workspec-c4 validate` surfaces this, not `check`
  }
}

function isGoverned(parsed: ParsedElementFile): boolean {
  return Array.isArray(parsed.tags) && parsed.tags.includes(ASPIRE_MANAGED_TAG);
}

function fieldDrift(file: string, slug: string, field: string, onDisk: unknown, desired: unknown): AspireDiagnostic {
  return {
    severity: 'warning',
    code: ASPIRE_DIAGNOSTIC_CODES.fieldDrift,
    message: `${field} drifted: ${JSON.stringify(onDisk)} (on disk) vs ${JSON.stringify(desired)} (desired)`,
    file,
    slug,
  };
}

interface RawDiagramEdge {
  readonly from: string;
  readonly to: string;
  readonly label?: string;
}

function isRawDiagramEdge(value: unknown): value is RawDiagramEdge {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.from === 'string' && typeof record.to === 'string';
}

function readEdges(data: unknown): readonly RawDiagramEdge[] {
  if (data === null || typeof data !== 'object' || !('edges' in data)) return [];
  const edges = (data as { edges: unknown }).edges;
  if (!Array.isArray(edges)) return [];
  return edges.filter(isRawDiagramEdge);
}

/**
 * Diffs the tree at `source` against `graph`'s desired projection, returning
 * every drift finding. Never writes. Two things are, by design, NOT
 * individually diagnosed because they're implied by element-level findings:
 * a diagram node's presence/absence is entirely a function of its
 * element's presence/absence (already covered by `element-missing` /
 * `element-orphaned`), so there is no separate "node" code. The diagram file
 * at the reserved slug (`diagrams/aspire-container.yaml`) is governed only
 * when it carries the machine-generated schema-directive marker: a
 * hand-authored diagram occupying the slug is treated as unmanaged and never
 * drift-checked. Once the file IS machine-generated, it is wholly owned —
 * the schema has no per-edge tag field for edges to opt out the way elements
 * can, so hand-edited edges inside it are not preserved across runs and will
 * surface as drift.
 */
export async function checkAspireGraph(
  source: C4FileSource,
  graph: AspireGraph,
): Promise<AspireDiagnostic[]> {
  const projection = projectAspireGraph(graph);
  const diagnostics: AspireDiagnostic[] = [];
  const desiredByPath = new Map(projection.elements.map((element) => [element.path, element]));

  for (const kind of GOVERNED_KINDS) {
    const dir = `${WORKSPEC_DIR}/${TYPE_DIRECTORIES[kind]}`;
    const existingPaths = [...(await source.listFiles(dir))].sort();

    for (const path of existingPaths) {
      const slug = slugFromPath(path);
      if (slug === null) continue;

      const text = await source.readFile(path);
      const parsed = parseElementFile(text);
      if (parsed === null || !isGoverned(parsed)) continue; // hand-authored (or unparsable) — never flagged

      const desired = desiredByPath.get(path);
      if (desired === undefined) {
        diagnostics.push({
          severity: 'warning',
          code: ASPIRE_DIAGNOSTIC_CODES.elementOrphaned,
          message: `${kind} "${slug}" is aspire-managed but no resource in the Aspire graph maps to it anymore`,
          file: path,
          slug,
        });
        continue;
      }

      if (parsed.title !== desired.title) {
        diagnostics.push(fieldDrift(path, slug, 'title', parsed.title, desired.title));
      }
      if (parsed.description !== desired.description) {
        diagnostics.push(fieldDrift(path, slug, 'description', parsed.description, desired.description));
      }
      if (desired.technology !== undefined && parsed.technology !== desired.technology) {
        diagnostics.push(fieldDrift(path, slug, 'technology', parsed.technology, desired.technology));
      }
    }
  }

  for (const element of projection.elements) {
    if (!(await source.exists(element.path))) {
      diagnostics.push({
        severity: 'error',
        code: ASPIRE_DIAGNOSTIC_CODES.elementMissing,
        message: `${element.kind} "${element.slug}" would be created from Aspire resource "${element.resourceName}"`,
        file: element.path,
        slug: element.slug,
      });
    }
  }

  const diagramPath = artifactPathFor('diagram', ASPIRE_DIAGRAM_SLUG);
  let existingEdges: readonly RawDiagramEdge[] = [];
  if (await source.exists(diagramPath)) {
    const diagramText = await source.readFile(diagramPath);
    if (!isAspireManagedDiagram(diagramText)) {
      // A hand-authored diagram occupies the reserved slug — it is
      // unmanaged, not drifted: skip the edge diff entirely.
      return diagnostics;
    }
    try {
      existingEdges = readEdges(parseYaml(diagramText));
    } catch {
      existingEdges = [];
    }
  }

  const existingByKey = new Map(existingEdges.map((edge) => [`${edge.from}=>${edge.to}`, edge]));
  const desiredByKey = new Map(projection.edges.map((edge) => [`${edge.from}=>${edge.to}`, edge]));

  for (const edge of projection.edges) {
    const key = `${edge.from}=>${edge.to}`;
    const existing = existingByKey.get(key);
    if (existing === undefined) {
      diagnostics.push({
        severity: 'error',
        code: ASPIRE_DIAGNOSTIC_CODES.edgeMissing,
        message: `edge "${edge.from}" -> "${edge.to}" would be added${edge.label !== undefined ? ` ("${edge.label}")` : ''}`,
        file: diagramPath,
      });
    } else if ((existing.label ?? undefined) !== edge.label) {
      diagnostics.push({
        severity: 'warning',
        code: ASPIRE_DIAGNOSTIC_CODES.fieldDrift,
        message: `edge "${edge.from}" -> "${edge.to}" label drifted: ${JSON.stringify(existing.label ?? null)} (on disk) vs ${JSON.stringify(edge.label ?? null)} (desired)`,
        file: diagramPath,
      });
    }
  }
  for (const [key, existing] of existingByKey) {
    if (!desiredByKey.has(key)) {
      diagnostics.push({
        severity: 'warning',
        code: ASPIRE_DIAGNOSTIC_CODES.edgeOrphaned,
        message: `edge "${existing.from}" -> "${existing.to}" no longer reflects the Aspire graph`,
        file: diagramPath,
      });
    }
  }

  return diagnostics;
}
