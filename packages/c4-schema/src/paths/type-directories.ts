import type { ArtifactKind } from './artifact-kind.js';

/**
 * Maps each artifact kind to its type directory name under `.workspec/`.
 * Normative: `system` is a singleton directory (one file expected inside,
 * but the path scheme does not special-case it — the slug is still the
 * filename minus `.yaml`).
 */
export const TYPE_DIRECTORIES: Record<ArtifactKind, string> = {
  actor: 'actors',
  system: 'system',
  'external-system': 'external-systems',
  container: 'containers',
  component: 'components',
  database: 'databases',
  queue: 'queues',
  domain: 'domains',
  feature: 'features',
  diagram: 'diagrams',
};
