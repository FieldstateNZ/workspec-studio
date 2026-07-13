// Deterministic YAML serialization for everything `import-aspire` writes —
// mirrors `@workspec/cost-schema`'s `serialize.ts`: build a plain object with
// keys in schema-declaration order (object key insertion order IS emitted
// YAML key order), then `stringify` with a fixed option set so output never
// varies across environments or reruns.

import { stringify } from 'yaml';
import {
  CONTAINER_SCHEMA_DIRECTIVE,
  DATABASE_SCHEMA_DIRECTIVE,
  DIAGRAM_SCHEMA_DIRECTIVE,
  EXTERNAL_SYSTEM_SCHEMA_DIRECTIVE,
  QUEUE_SCHEMA_DIRECTIVE,
  SYSTEM_SCHEMA_DIRECTIVE,
} from '@workspec/c4-schema';
import { ASPIRE_MANAGED_TAG, ASPIRE_SOURCE_NOTE } from './constants.js';
import { orderedNodesFor } from './project.js';
import type { ProjectedEdge, ProjectedElement, ProjectedSystem } from './project.js';

const YAML_OPTIONS = { lineWidth: 0 } as const;

const DIRECTIVE_BY_KIND: Record<ProjectedElement['kind'], string> = {
  container: CONTAINER_SCHEMA_DIRECTIVE,
  database: DATABASE_SCHEMA_DIRECTIVE,
  queue: QUEUE_SCHEMA_DIRECTIVE,
  'external-system': EXTERNAL_SYSTEM_SCHEMA_DIRECTIVE,
};

/** Serializes one projected element to byte-stable YAML, directive header included. */
export function serializeElement(element: ProjectedElement): string {
  const doc =
    element.kind === 'external-system'
      ? {
          title: element.title,
          description: element.description,
          tags: [ASPIRE_MANAGED_TAG],
          source: ASPIRE_SOURCE_NOTE,
        }
      : {
          type: element.kind,
          title: element.title,
          description: element.description,
          ...(element.technology !== undefined ? { technology: element.technology } : {}),
          tags: [ASPIRE_MANAGED_TAG],
          source: ASPIRE_SOURCE_NOTE,
        };
  return DIRECTIVE_BY_KIND[element.kind] + stringify(doc, YAML_OPTIONS);
}

/** Serializes the singleton system element to byte-stable YAML, directive header included. */
export function serializeSystem(system: ProjectedSystem): string {
  const doc = {
    title: system.title,
    description: system.description,
    source: ASPIRE_SOURCE_NOTE,
  };
  return SYSTEM_SCHEMA_DIRECTIVE + stringify(doc, YAML_OPTIONS);
}

function nodeEntry(element: ProjectedElement): Record<string, string> {
  return { [element.kind]: element.slug };
}

/** Serializes the one generated `aspire-container` diagram to byte-stable YAML, directive header included. */
export function serializeDiagram(
  elements: readonly ProjectedElement[],
  edges: readonly ProjectedEdge[],
): string {
  const doc = {
    title: 'Aspire Container',
    type: 'c4-container',
    description:
      'Containers, databases, queues, and external systems imported from the Aspire apphost graph.',
    nodes: orderedNodesFor(elements).map(nodeEntry),
    edges: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      ...(edge.label !== undefined ? { label: edge.label } : {}),
    })),
  };
  return DIAGRAM_SCHEMA_DIRECTIVE + stringify(doc, YAML_OPTIONS);
}
