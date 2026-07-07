import { z } from 'zod';
import { linksField } from './common/links-field.js';
import { sourceField } from './common/source-field.js';

/**
 * The shared shape for container, component, database, and queue
 * elements — the four kinds that also carry a `technology` field. Unlike
 * actor/system/external-system, `type` is a *required* free string here
 * rather than an optional literal: this one schema backs all four
 * directories (`containers/`, `components/`, `databases/`, `queues/`), so
 * the kind can't be hard-coded as a per-file literal the way it is for the
 * single-kind schemas. Enterprise conformance note: this asymmetry is
 * intentional, taken directly from the `lib/yaml-schemas` field tables.
 */
export const C4Element = z
  .object({
    type: z.string().describe('The element kind: "container", "component", "database", or "queue".'),
    title: z.string().describe('Human-readable name of the element.'),
    description: z.string().min(1).describe('What this element does and why it exists.'),
    technology: z.string().optional().describe('Implementation technology, e.g. "PostgreSQL", "Node.js".'),
    tags: z.array(z.string()).optional().describe('Free-text labels for filtering and grouping.'),
    links: linksField,
    source: sourceField,
  })
  .strict()
  .describe('The shared container/component/database/queue element shape.');

/** Inferred type of a container/component/database/queue element. */
export type C4Element = z.infer<typeof C4Element>;
