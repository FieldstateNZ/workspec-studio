// Builds a merged fixture directory covering all four `*-studio` modules,
// for this package's own tests. No single `examples/*` directory in this
// repo has content for decision + cost + c4 + trace together, so this
// assembles one: it copies real example artifacts for decisions (from
// `examples/hosting-platform`) and cost (from
// `examples/fieldstate-azure-costs`), and constructs minimal-but-valid c4 and
// trace artifacts inline (there is no example directory with content for
// those two yet). c4/trace tools tolerate a wholly absent `.workspec/` tree
// (an empty-but-valid model/tree, per `loadC4Model`'s and `FsRepository`'s
// own doc comments) — the inline content here goes a step further, so the
// aggregate smoke tests exercise a real (non-empty) result for every
// namespace, not just "didn't throw".

import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
/** Repo root, three levels up from `packages/mcp-host/src/`. */
const REPO_ROOT = join(HERE, '..', '..', '..');

/** A minimal, schema-valid c4 `system` element — the one singleton c4 needs to have any real content. */
const C4_SYSTEM_YAML = `# yaml-language-server: $schema=https://schema.workspec.io/v1alpha1/c4/system.schema.json
title: Fixture System
summary: A minimal system element for mcp-host's own fixture tree.
phase: delivery
slice_prefix: fixture
`;

// Hand-written rather than built via `@workspec/req-schema`'s `Actor`/`Feature`
// types + `yaml.stringify`: mcp-host has no other reason to depend on
// `req-schema` directly, and the shape (apiVersion/kind/metadata/spec.name)
// is small and stable enough that a literal beats a new dependency edge.
const TRACE_ACTOR_YAML = `apiVersion: workspec.io/v1alpha1
kind: Actor
metadata: {}
spec:
  name: dev-lead
`;

const TRACE_FEATURE_YAML = `apiVersion: workspec.io/v1alpha1
kind: Feature
metadata: {}
spec:
  name: fixture-feature
`;

/** A merged fixture tree, plus the `cleanup` every test that builds one must call in `afterEach`/`afterAll`. */
export interface FixtureTree {
  /** Absolute path to the tree's root — pass this as `--dir`/`dir` to `buildAllProviders`. */
  readonly dir: string;
  /** Removes the whole tree. Idempotent-safe to call once per tree. */
  cleanup(): Promise<void>;
}

/**
 * Builds a fresh `mkdtemp`'d directory containing real decision + cost
 * example artifacts and minimal inline c4 + trace artifacts. Every call
 * gets its own directory (no shared fixture state between tests, per the
 * factories-not-fixtures rule) — call this once per test/describe block
 * that needs the merged tree.
 */
export async function buildFixtureTree(): Promise<FixtureTree> {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-host-fixture-'));

  // ── decisions: copy the real hosting-platform example's .workspec/ tree ──
  const hostingPlatformWorkspec = join(REPO_ROOT, 'examples', 'hosting-platform', '.workspec');
  await mkdir(join(dir, '.workspec', 'decisions'), { recursive: true });
  await mkdir(join(dir, '.workspec', 'catalogs'), { recursive: true });
  await copyFile(
    join(hostingPlatformWorkspec, 'decisions', 'hosting-platform.yaml'),
    join(dir, '.workspec', 'decisions', 'hosting-platform.yaml'),
  );
  await copyFile(
    join(hostingPlatformWorkspec, 'catalogs', 'platform.yaml'),
    join(dir, '.workspec', 'catalogs', 'platform.yaml'),
  );

  // ── cost: copy the real fieldstate-azure-costs example's .workspec/ tree ──
  const costWorkspec = join(REPO_ROOT, 'examples', 'fieldstate-azure-costs', '.workspec');
  for (const [subdir, file] of [
    ['inventories', 'fieldstate-azure.yaml'],
    ['spends', 'fieldstate-azure-2026-07.yaml'],
    ['attributions', 'fieldstate-azure.yaml'],
    ['tagplans', 'fieldstate-azure.yaml'],
  ] as const) {
    await mkdir(join(dir, '.workspec', subdir), { recursive: true });
    await copyFile(join(costWorkspec, subdir, file), join(dir, '.workspec', subdir, file));
  }

  // ── c4: one inline minimal `system` element (no example dir has c4 content yet) ──
  await mkdir(join(dir, '.workspec', 'system'), { recursive: true });
  await writeFile(join(dir, '.workspec', 'system', 'main-system.yaml'), C4_SYSTEM_YAML, 'utf8');

  // ── trace: one inline actor + feature (no example dir has trace content yet) ──
  await mkdir(join(dir, '.workspec', 'actors'), { recursive: true });
  await mkdir(join(dir, '.workspec', 'features'), { recursive: true });
  await writeFile(join(dir, '.workspec', 'actors', 'dev-lead.yaml'), TRACE_ACTOR_YAML, 'utf8');
  await writeFile(join(dir, '.workspec', 'features', 'fixture-feature.yaml'), TRACE_FEATURE_YAML, 'utf8');

  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
