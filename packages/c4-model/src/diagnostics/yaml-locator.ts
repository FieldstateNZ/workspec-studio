import { locateYamlPath } from '@workspec/c4-schema';
import type { DiagnosticPosition } from './make-diagnostic.js';

/** Looks up the source position of a YAML value path inside one file's text, or `undefined` when unlocatable. */
export type YamlLocator = (path: readonly (string | number)[]) => DiagnosticPosition | undefined;

/**
 * Builds a {@link YamlLocator} over one artifact's raw YAML text, backed by
 * `@workspec/c4-schema`'s `locateYamlPath`. This is how the location-tied
 * semantic diagnostics (`dangling-ref`, `duplicate-slug`,
 * `dangling-edge-ref`, `orphan-layout-node`, `orphan-layout-edge-hint`)
 * point at the offending node/edge/layout entry's line without this
 * package taking a direct `yaml` dependency.
 */
export function createYamlLocator(text: string): YamlLocator {
  return (path) => locateYamlPath(text, path);
}
