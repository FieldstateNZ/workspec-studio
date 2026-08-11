import { stringify } from 'yaml';
import {
  ACTOR_SCHEMA_DIRECTIVE,
  COMPONENT_SCHEMA_DIRECTIVE,
  CONTAINER_SCHEMA_DIRECTIVE,
  DATABASE_SCHEMA_DIRECTIVE,
  DOMAIN_SCHEMA_DIRECTIVE,
  EXTERNAL_SYSTEM_SCHEMA_DIRECTIVE,
  FEATURE_SCHEMA_DIRECTIVE,
  QUEUE_SCHEMA_DIRECTIVE,
  SYSTEM_SCHEMA_DIRECTIVE,
} from '@workspec/c4-schema';
import type { ElementKind } from '@workspec/c4-model';
import { TECHNOLOGY_KINDS } from './technology-kinds.js';

/** Directive header (first line of every authored element file) per kind. */
const DIRECTIVE_BY_KIND: Record<ElementKind, string> = {
  actor: ACTOR_SCHEMA_DIRECTIVE,
  system: SYSTEM_SCHEMA_DIRECTIVE,
  'external-system': EXTERNAL_SYSTEM_SCHEMA_DIRECTIVE,
  container: CONTAINER_SCHEMA_DIRECTIVE,
  component: COMPONENT_SCHEMA_DIRECTIVE,
  database: DATABASE_SCHEMA_DIRECTIVE,
  queue: QUEUE_SCHEMA_DIRECTIVE,
  domain: DOMAIN_SCHEMA_DIRECTIVE,
  feature: FEATURE_SCHEMA_DIRECTIVE,
};

/** The authorable fields of a brand-new element file. */
export interface NewElementFields {
  readonly title: string;
  readonly description: string;
  readonly technology?: string;
  readonly tags?: readonly string[];
}

/**
 * Serializes a brand-new element file: the kind's
 * `yaml-language-server` directive as line one (matching the
 * representative-tree convention, so editors get completion on the file
 * the moment it exists), then the fields in the fixture order —
 * `type, title, description, technology, tags`. The `type:` literal is
 * emitted only for the four {@link TECHNOLOGY_KINDS}: their shared
 * `C4Element` schema *requires* it (one schema backs four directories),
 * while every other kind's schema treats it as redundant-with-directory
 * and the representative trees omit it.
 *
 * Output is deterministic for identical input — the whole file is
 * produced by one `stringify` call over a fixed field order, under the
 * package-wide `{ lineWidth: 0 }` option set (`aspire/serialize.ts`,
 * `yaml-source-edit.ts`) — which is what makes create-then-reload
 * byte-stable. Without the pinned width a description over 80 characters
 * would be emitted hand-wrapped here and then UNwrapped by the first
 * `updateElement` that touched it, turning a one-field edit into a
 * multi-line diff.
 */
export function serializeNewElement(kind: ElementKind, fields: NewElementFields): string {
  const body: Record<string, unknown> = {};
  if (TECHNOLOGY_KINDS.has(kind)) body.type = kind;
  body.title = fields.title;
  body.description = fields.description;
  if (fields.technology !== undefined && fields.technology !== '') {
    body.technology = fields.technology;
  }
  if (fields.tags !== undefined && fields.tags.length > 0) body.tags = fields.tags;
  return DIRECTIVE_BY_KIND[kind] + stringify(body, { lineWidth: 0 });
}
