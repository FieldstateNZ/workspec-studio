// Seed data for the in-browser C4 demo. Vendored verbatim from
// `packages/c4-schema/test/fixtures/representative/.workspec` — the SAME
// anonymized, representative tree the c4-schema/c4-model/c4-layout/c4-ui
// conformance suites exercise (never the real workspec-studio `.workspec/`
// tree: using that as public demo content needs Brett's approval, out of
// this slice per the S6 brief). `import.meta.glob` bulk-imports every YAML
// file as raw text, keyed by its path; stripping the local prefix recovers
// the exact `.workspec/...` repo-relative path `@workspec/c4-model`'s
// `MemorySource` expects.
import { createMemorySource, loadC4Model } from '@workspec/c4-model';
import type { C4Model, MemorySourceSeed } from '@workspec/c4-model';

const RAW_FILES = import.meta.glob('./examples-c4/.workspec/**/*.yaml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PREFIX = './examples-c4/';

const SEED: MemorySourceSeed = Object.fromEntries(
  Object.entries(RAW_FILES).map(([path, content]) => [path.slice(PREFIX.length), content]),
);

/** Loads the representative demo tree fresh each call — a new in-memory source, never mutated. */
export function loadDemoModel(): Promise<C4Model> {
  return loadC4Model(createMemorySource(SEED));
}
