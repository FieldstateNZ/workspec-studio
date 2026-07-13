// Whether an on-disk element file opts into `import-aspire` governance. This
// is a raw-YAML check (not a full schema parse): a file that fails to parse
// at all is simply treated as ungoverned here — `workspec-c4 validate`, not
// `import-aspire`, is what surfaces a broken element file.

import { parse as parseYaml } from 'yaml';
import { DIAGRAM_SCHEMA_DIRECTIVE } from '@workspec/c4-schema';
import { ASPIRE_MANAGED_TAG } from './constants.js';

/** True if `text` (an element YAML file's raw content) carries the `aspire-managed` tag. */
export function isAspireManagedYaml(text: string): boolean {
  let data: unknown;
  try {
    data = parseYaml(text);
  } catch {
    return false;
  }
  if (data === null || typeof data !== 'object' || !('tags' in data)) return false;
  const tags = (data as { tags: unknown }).tags;
  return Array.isArray(tags) && tags.includes(ASPIRE_MANAGED_TAG);
}

/**
 * True if `text` (the raw content of the file at the reserved
 * `aspire-container` diagram slug) is recognized as machine-generated. The
 * diagram schema has no `tags` field to carry `aspire-managed`, so the
 * marker is the schema-directive comment `import-aspire` always writes as
 * the file's first line. A pre-existing hand-authored diagram at the
 * reserved slug (which lacks the marker) is never overwritten by `scaffold`
 * and never drift-checked by `check`.
 */
export function isAspireManagedDiagram(text: string): boolean {
  return text.startsWith(DIAGRAM_SCHEMA_DIRECTIVE);
}
