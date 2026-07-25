// The "actual" side of reconciliation: a local, gitignored snapshot under
// `.topology-actual/<env>/`, written by `import` and read back by
// `reconcile`/`cost` — never by `validate` (this directory is not part of
// the authored tree `loadTopologyModel` walks). The directory normally holds
// derived `Resource` artifacts only (no adapter infers edges — see
// `@workspec/topology-adapters`' README), but MAY also hold one observed
// `Topology` artifact, whose presence is how this module tells "connectivity
// wasn't captured" apart from "connectivity was captured and is empty" (see
// `loadDerivedTopology`'s own doc comment).
//
// JUDGMENT CALL: `.topology-actual/` is this package's own convention, not
// one `@workspec/topology-schema`/`@workspec/topology-recon` defines — those
// packages only define the SHAPE of "actual" (`DerivedTopology`), not where
// a CLI/studio phase persists it between an `import` run and a `reconcile`
// run. Modelled directly on `@workspec/topology-recon`'s own doc comments,
// which name exactly this path as "the demo's `.topology-actual/<env>/`
// tree". It sits next to `.workspec/` (not inside it) because it holds
// TOOL-GENERATED, per-environment, disposable snapshots — re-running
// `import` overwrites it — not hand-authored source of truth; see this
// package's root `.gitignore` entry.
//
// Resources are WRITTEN through `FsRepository`'s own `writeResource`
// (comment-preserving serialization, schema validation, path containment).
// Reading back is NOT routed through `FsRepository`'s `readResource`/
// `readTopology`, though: this module must sniff each file's `kind` to sort
// it into "resource" vs. "the one observed topology" before it knows which
// schema to validate against, and `readResource` would (wrongly) throw on
// the topology file. So reads go through the raw `parseResourceYaml`/
// `parseTopologyYaml` functions directly — this module supplies the
// directory convention, the sniffing, and the `Resource`/`Connection` →
// `DerivedResource`/`DerivedConnection` shape conversion
// `@workspec/topology-recon`'s `reconcile()` actually consumes.

import { readdir, readFile, unlink } from 'node:fs/promises';
import { posix } from 'node:path';
import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import type { DerivedConnection, DerivedResource, DerivedTopology } from '@workspec/topology-recon';
import { parseResourceYaml, parseTopologyYaml } from '@workspec/topology-schema';
import type { Connection, Ref, Resource } from '@workspec/topology-schema';
import { ArtifactValidationError, type FsRepository } from './fs-repository.js';

/** Directory derived (`.topology-actual/`) resources are written under, sibling to `.workspec/`. */
export const TOPOLOGY_ACTUAL_DIR = '.topology-actual';

/**
 * Thrown by {@link derivedDirFor} when `envSlug` isn't a valid slug. Every
 * caller of `derivedDirFor` (this module's own `writeDerivedResources`/
 * `loadDerivedTopology`, the CLI, the MCP tools) is reached only after its
 * own boundary has already shape-checked `env` — the CLI via
 * `Slug.safeParse` (`cli.ts`'s `checkEnvSlug`), the MCP tools via
 * `@workspec/mcp-core`'s `readSlugArg`, the HTTP server via `server.ts`'s
 * `envFrom` — so this should never actually fire in practice. It exists as
 * the SECOND line of defence at the one choke point every path funnels
 * through before a `posix.join`, mirroring `read-ref-arg.ts`'s "boundaries
 * reject first" discipline one level deeper: even a future caller that
 * forgets to pre-validate can't turn an ill-shaped `env` (e.g. `../../etc`)
 * into a path that walks outside `.topology-actual/`.
 * `FsRepository.resolve()`'s containment check still backstops this
 * regardless, same as it backstops `readRefArg`.
 *
 * The message names only the argument, never the offending value — the same
 * discipline `InvalidRefError`/`InvalidSlugError` (`@workspec/mcp-core`)
 * follow. Here that discipline is mostly stylistic consistency rather than a
 * live leak risk: this error, if it ever did fire, would only ever reach
 * `console.error`/stderr — an MCP tool's `mapErrorToResult` scrubs any
 * *unclassified* thrown error's `.message` before it reaches a client (it
 * isn't classified here, so it would hit that generic "internal error"
 * fallback, not a bespoke `isError` result), and the CLI's `bin.ts` only
 * writes an uncaught throw's message to its own invoker's stderr. Kept
 * value-free anyway so the convention can't silently drift if this error's
 * handling ever changes.
 */
export class InvalidEnvSlugError extends Error {
  constructor() {
    super('argument "envSlug" is not a valid slug');
    this.name = 'InvalidEnvSlugError';
  }
}

/**
 * The directory one environment's derived resources live under, e.g.
 * `.topology-actual/prod`. Throws {@link InvalidEnvSlugError} for an
 * ill-shaped `envSlug` — see that error's doc comment for why this is a
 * defense-in-depth check, not the primary one.
 */
export function derivedDirFor(envSlug: string): string {
  if (!Slug.safeParse(envSlug).success) {
    throw new InvalidEnvSlugError();
  }
  return posix.join(TOPOLOGY_ACTUAL_DIR, envSlug);
}

/** Converts an authored-shaped derived `Resource` (see `@workspec/topology-adapters`) to the flat `DerivedResource` shape `reconcile()` consumes. */
function toDerivedResource(resource: Resource): DerivedResource {
  const { spec } = resource;
  return {
    slug: resource.metadata.slug ?? spec.name,
    name: spec.name,
    kind: spec.kind,
    type: spec.type,
    provider: spec.provider,
    resourceGroup: spec.resourceGroup ?? null,
    config: spec.config ?? null,
    cost: spec.cost ?? null,
    source: spec.source ?? null,
  };
}

/**
 * Writes one environment's derived resources, replacing whatever
 * `.topology-actual/<env>/` previously held for slugs no longer produced.
 * Each resource is keyed by its own `metadata.slug` (set by
 * `@workspec/topology-adapters`' `buildDerivedResource`) — `import` never
 * has to invent a filename. Returns the refs written, in input order.
 */
export async function writeDerivedResources(
  repo: FsRepository,
  envSlug: string,
  resources: readonly Resource[],
): Promise<Ref[]> {
  const dir = derivedDirFor(envSlug);
  const keep = new Set(resources.map((r) => r.metadata.slug));

  let existing: string[] = [];
  try {
    existing = (await readdir(repo.resolve(dir), { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(FILE_EXTENSION))
      .map((e) => e.name);
  } catch {
    /* absent dir — nothing stale to remove */
  }
  for (const name of existing) {
    const slug = slugFromPath(name);
    if (slug !== null && !keep.has(slug)) {
      await unlink(repo.resolve(posix.join(dir, name)));
    }
  }

  const refs: Ref[] = [];
  for (const resource of resources) {
    const slug = resource.metadata.slug;
    if (slug === undefined) {
      throw new Error('derived resource is missing metadata.slug — cannot derive a stable filename');
    }
    const ref = posix.join(dir, `${slug}${FILE_EXTENSION}`);
    await repo.writeResource(ref, resource);
    refs.push(ref);
  }
  return refs;
}

/** The outcome of {@link loadDerivedTopology}: either the assembled `DerivedTopology`, or the first file that failed to read/validate. */
export type LoadDerivedTopologyOutcome =
  | { kind: 'ok'; derived: DerivedTopology }
  | { kind: 'read-error'; ref: Ref; error: unknown };

/** Converts an observed `Topology` artifact's declared connections to the flat `DerivedConnection` shape `reconcile()` consumes. A derived snapshot under `.topology-actual/<env>/` is already scoped to exactly one environment, so its connections are taken as-is — not re-resolved through `@workspec/topology-model`'s env-scoping/pruning, which exists to project a multi-environment authored topology down to one environment, a step already done here by construction. */
function toDerivedConnections(connections: readonly Connection[]): readonly DerivedConnection[] {
  return connections.map((c) => ({ from: c.from, to: c.to, class: c.class }));
}

/**
 * Loads one environment's derived state from `.topology-actual/<env>/` (a
 * flat, non-recursive directory of artifacts — the same shape `import`
 * writes) into the `DerivedTopology` shape `@workspec/topology-recon`'s
 * `reconcile()` takes.
 *
 * Every `.yaml` entry is sniffed by content, not filename: a file that
 * parses as `kind: Topology` is an OBSERVED topology artifact (connectivity
 * WAS captured for this environment — e.g. hand-authored, or a future
 * adapter/import phase that infers edges) and its declared connections
 * become the returned `connections`. Everything else is parsed as a
 * `Resource` artifact (the same shape `import` writes today, since no
 * `@workspec/topology-adapters` adapter infers edges — see that package's
 * README) and contributes a `resources` entry. When NO topology artifact is
 * present, `connections` is left `undefined` — "connectivity not captured",
 * not "captured and empty" — so `reconcile()` correctly skips miswired
 * detection instead of flagging every authored edge as a false miswire (see
 * `DerivedTopology.connections`'s doc comment).
 *
 * Resolves `{ kind: 'ok', derived }` with an empty resource list (not an
 * error) when the directory doesn't exist yet — "nothing imported for this
 * environment" is a legitimate, reportable state, not a failure.
 */
export async function loadDerivedTopology(
  repo: FsRepository,
  envSlug: string,
): Promise<LoadDerivedTopologyOutcome> {
  const dir = derivedDirFor(envSlug);
  let entries;
  try {
    entries = await readdir(repo.resolve(dir), { withFileTypes: true });
  } catch {
    return { kind: 'ok', derived: { envSlug, resources: [] } };
  }

  const names = entries
    .filter((e) => e.isFile() && e.name.endsWith(FILE_EXTENSION))
    .map((e) => e.name)
    .filter((name) => {
      const slug = slugFromPath(name);
      return slug !== null && Slug.safeParse(slug).success;
    })
    .sort();

  const resources: DerivedResource[] = [];
  let connections: readonly DerivedConnection[] | undefined;

  for (const name of names) {
    const ref = posix.join(dir, name);
    const text = await readFile(repo.resolve(ref), 'utf8');

    // Sniff by content first: a resource-shaped parse of the topology file
    // would fail validation and (wrongly) abort the whole load as a
    // read-error, so the non-throwing topology parse must run first.
    const topologyParse = parseTopologyYaml(text);
    if (topologyParse.ok) {
      connections = toDerivedConnections(topologyParse.data.spec.connections);
      continue;
    }

    const resourceParse = parseResourceYaml(text);
    if (!resourceParse.ok) {
      return { kind: 'read-error', ref, error: new ArtifactValidationError(ref, resourceParse.errors) };
    }
    resources.push(toDerivedResource(resourceParse.data));
  }

  return {
    kind: 'ok',
    derived: { envSlug, resources, ...(connections !== undefined ? { connections } : {}) },
  };
}
