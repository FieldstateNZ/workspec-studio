// The "actual" side of reconciliation: a local, gitignored snapshot under
// `.topology-actual/<env>/`, written by `import` and read back by
// `reconcile`/`cost` — never by `validate` (this directory is not part of
// the authored tree `loadTopologyModel` walks). The directory normally holds
// derived `Resource` artifacts only (no adapter infers edges — see
// `@workspec/topology-adapters`' README), but MAY also hold ONE observed
// `Topology` artifact, whose presence is how this module tells "connectivity
// wasn't captured" apart from "connectivity was captured and is empty" (see
// `loadDerivedTopology`'s own doc comment).
//
// POLICY — exactly one topology-shaped file per environment: `import`'s own
// `writeDerivedConnections` writes one at the fixed `DERIVED_CONNECTIONS_SLUG`
// slug whenever an adapter derives connections (currently: `aspire`); a human
// may also hand-copy or hand-author an observed topology into the same
// directory. If BOTH (or any two) end up present at once, `loadDerivedTopology`
// sniffs every file's `kind` regardless of filename, so it WOULD see more
// than one topology-shaped file — and rather than silently picking one by
// filename sort order (which one wins would depend on alphabetical accident,
// and the other's connections would vanish from every `reconcile` run with
// no visible sign anything was wrong), it fails loud with a
// `MultipleObservedTopologiesError` naming every offender. This mirrors
// `loadAuthoredModel`'s own "no single topology found" precedent for the
// same ambiguity on the AUTHORED side (`.workspec/topologies/*.yaml`).
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
// it into "resource" vs. "an observed topology" before it knows which
// schema to validate against, and `readResource` would (wrongly) throw on
// the topology file. So reads go through the raw `parseResourceYaml`/
// `parseTopologyYaml` functions directly — this module supplies the
// directory convention, the sniffing, the single-topology-file policy, and
// the `Resource`/`Connection` → `DerivedResource`/`DerivedConnection` shape
// conversion `@workspec/topology-recon`'s `reconcile()` actually consumes.

import { readdir, readFile, unlink } from 'node:fs/promises';
import { posix } from 'node:path';
import { FILE_EXTENSION, Slug, slugFromPath } from '@workspec/schema-core';
import type { AdapterConnection, Diagnostic } from '@workspec/topology-adapters';
import type { DerivedConnection, DerivedResource, DerivedTopology } from '@workspec/topology-recon';
import { API_VERSION, parseResourceYaml, parseTopologyYaml } from '@workspec/topology-schema';
import type { Connection, Ref, Resource, Topology } from '@workspec/topology-schema';
import { ArtifactValidationError, type FsRepository } from './fs-repository.js';

/** Directory derived (`.topology-actual/`) resources are written under, sibling to `.workspec/`. */
export const TOPOLOGY_ACTUAL_DIR = '.topology-actual';

/**
 * Fixed slug `writeDerivedConnections` writes an environment's derived
 * connection graph under, e.g. `.topology-actual/prod/derived-connections.yaml`
 * — always this one name, regardless of which adapter produced the
 * connections (`AdapterOutput.connections` is adapter-agnostic; only the
 * `aspire` adapter populates it today, but this plumbing doesn't know or
 * care which adapter it came from). `loadDerivedTopology` finds it the same
 * way it finds any hand-authored observed topology: by sniffing file
 * content for `kind: Topology`, not by this filename.
 */
export const DERIVED_CONNECTIONS_SLUG = 'derived-connections';

/**
 * Detects any about-to-be-written derived resource whose `metadata.slug`
 * collides with the reserved {@link DERIVED_CONNECTIONS_SLUG}. REVIEW
 * FINDING (topology v0.1 S2a): without this guard, a resource that happened
 * to slugify to `"derived-connections"` would write cleanly through
 * `writeDerivedResources` as `.topology-actual/<env>/derived-connections.yaml`
 * — and then, on the very same `import` run (or a later one for the same
 * env), `writeDerivedConnections` would silently OVERWRITE that file with
 * the connection-graph Topology artifact, losing the resource with no
 * diagnostic at all.
 *
 * Returns one `error`-severity {@link Diagnostic} per colliding resource
 * (empty array when none collide). `import`'s CLI caller is expected to:
 * surface these alongside the adapter's own diagnostics, AND exclude every
 * colliding resource from what it passes to `writeDerivedResources` — this
 * function only detects the collision, it does not filter or write anything
 * itself (kept a pure, easily-tested predicate).
 */
export function checkReservedSlugCollisions(resources: readonly Resource[]): readonly Diagnostic[] {
  return resources
    .filter((resource) => resource.metadata.slug === DERIVED_CONNECTIONS_SLUG)
    .map((resource): Diagnostic => ({
      severity: 'error',
      message:
        `resource "${resource.spec.name}" resolved to the reserved slug "${DERIVED_CONNECTIONS_SLUG}" ` +
        '(reserved for the derived connection-graph carrier file — see DERIVED_CONNECTIONS_SLUG) ' +
        'and was NOT written; rename the source resource so it slugifies to something else.',
      source: resource.spec.source?.from ?? resource.spec.name,
    }));
}

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
 * Thrown by {@link loadDerivedTopology} when an environment's
 * `.topology-actual/<env>/` directory contains MORE THAN ONE
 * topology-shaped (`kind: Topology`) file. LEAD RULING (topology v0.1 S2a
 * review): before `writeDerivedConnections` existed, a second observed
 * topology file could only appear by a human hand-copying one in — rare
 * enough that the original sniffing logic just took "whichever one is
 * scanned last" (`names` is sorted, so alphabetically-last) and silently
 * discarded the other's connections. Now that `import aspire` (or any
 * future connection-deriving adapter) auto-writes one at the fixed
 * `DERIVED_CONNECTIONS_SLUG` slug, a hand-authored second file is no longer
 * a rare accident — it is a realistic, easy-to-hit collision, and picking a
 * winner by filename sort order would silently drop the other file's
 * connections from every `reconcile` run with no visible sign anything was
 * wrong. Mirrors `loadAuthoredModel`'s own "no single topology found"
 * precedent for the same ambiguity on the AUTHORED side
 * (`.workspec/topologies/*.yaml`): fail loud instead of guessing.
 *
 * `refs` lists every offending file (repo-relative, sorted — the same
 * `names` sort `loadDerivedTopology` already applies, so this is
 * deterministic regardless of the filesystem's own readdir order).
 */
export class MultipleObservedTopologiesError extends Error {
  constructor(readonly refs: readonly Ref[]) {
    super(
      `multiple observed topology files found: ${refs.join(', ')} — keep exactly one per environment.`,
    );
    this.name = 'MultipleObservedTopologiesError';
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

/**
 * Writes (or removes) one environment's derived connection graph — the
 * plumbing that lets `loadDerivedTopology` see connectivity an adapter
 * derived, per `@workspec/topology-adapters`' `AdapterOutput.connections`
 * doc comment. Mirrors `writeDerivedResources`'s "this import call is
 * authoritative for the whole directory" resync model, extended to the
 * fixed `DERIVED_CONNECTIONS_SLUG` file:
 *
 * - `connections === undefined` (the adapter didn't derive any edge data at
 *   all — terraform/bicep/azure-resource-graph, or a future adapter with no
 *   edges) — any PREVIOUSLY-written observed-connections file for this env
 *   is deleted (ignored if absent). This preserves `DerivedTopology`'s
 *   "absence is meaningful" contract: a resources-only `.topology-actual/
 *   <env>/` must read back as "connectivity not captured", never as a stale
 *   leftover from an earlier `aspire` import for the same env.
 * - `connections` is a (possibly empty) array — written as a minimal, valid
 *   `Topology` artifact at the fixed slug, scoped to just `envSlug`. An
 *   empty array is written as-is (not treated the same as `undefined`):
 *   "captured, zero edges" is a real, different outcome from "not
 *   captured" (see `DerivedTopology.connections`'s doc comment).
 *
 * Returns the ref written, or `undefined` when nothing was written (the
 * `undefined`-connections branch).
 */
export async function writeDerivedConnections(
  repo: FsRepository,
  envSlug: string,
  connections: readonly AdapterConnection[] | undefined,
): Promise<Ref | undefined> {
  const dir = derivedDirFor(envSlug);
  const ref = posix.join(dir, `${DERIVED_CONNECTIONS_SLUG}${FILE_EXTENSION}`);

  if (connections === undefined) {
    try {
      await unlink(repo.resolve(ref));
    } catch {
      /* nothing to remove */
    }
    return undefined;
  }

  const topology: Topology = {
    apiVersion: API_VERSION,
    kind: 'Topology',
    metadata: { slug: DERIVED_CONNECTIONS_SLUG },
    spec: {
      title: `Derived connections — ${envSlug}`,
      provider: 'derived',
      environments: [envSlug],
      defaultEnvironment: envSlug,
      connections: connections.map((c) => ({ from: c.from, to: c.to, class: c.class })),
    },
  };
  await repo.writeTopology(ref, topology);
  return ref;
}

/**
 * The outcome of {@link loadDerivedTopology}: either the assembled
 * `DerivedTopology`, or a `read-error` — either the first per-file
 * read/validation failure encountered (`error` is an `ArtifactValidationError`,
 * `ref` names that one file), or a directory-level ambiguity: more than one
 * topology-shaped file present (`error` is a `MultipleObservedTopologiesError`,
 * `ref` is the environment's `.topology-actual/<env>/` directory itself,
 * since no single file is "the" offender).
 */
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
 * WAS captured for this environment — e.g. hand-authored, or `import`'s own
 * `writeDerivedConnections`) and its declared connections become the
 * returned `connections`. Everything else is parsed as a `Resource`
 * artifact and contributes a `resources` entry. When NO topology artifact is
 * present, `connections` is left `undefined` — "connectivity not captured",
 * not "captured and empty" — so `reconcile()` correctly skips miswired
 * detection instead of flagging every authored edge as a false miswire (see
 * `DerivedTopology.connections`'s doc comment).
 *
 * POLICY — exactly one topology-shaped file per environment: if the
 * directory contains MORE than one file that parses as `kind: Topology`,
 * this is a `read-error` naming every offender
 * ({@link MultipleObservedTopologiesError}), never a silent pick of one over
 * the other — see that error's doc comment for why (`writeDerivedConnections`
 * makes a second, hand-authored file a realistic collision, not a rare
 * accident). Zero or exactly one topology-shaped file behaves as documented
 * above; only *more than one* is an error.
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
  const observedTopologies: { ref: Ref; connections: readonly DerivedConnection[] }[] = [];

  for (const name of names) {
    const ref = posix.join(dir, name);
    const text = await readFile(repo.resolve(ref), 'utf8');

    // Sniff by content first: a resource-shaped parse of the topology file
    // would fail validation and (wrongly) abort the whole load as a
    // read-error, so the non-throwing topology parse must run first.
    const topologyParse = parseTopologyYaml(text);
    if (topologyParse.ok) {
      observedTopologies.push({
        ref,
        connections: toDerivedConnections(topologyParse.data.spec.connections),
      });
      continue;
    }

    const resourceParse = parseResourceYaml(text);
    if (!resourceParse.ok) {
      return { kind: 'read-error', ref, error: new ArtifactValidationError(ref, resourceParse.errors) };
    }
    resources.push(toDerivedResource(resourceParse.data));
  }

  // POLICY: more than one topology-shaped file is an ambiguity, not a
  // "last one wins" pick — see MultipleObservedTopologiesError's doc
  // comment. `names` (and therefore `observedTopologies`, built by walking
  // it in order) is already sorted, so `refs` here is deterministic
  // regardless of the filesystem's own readdir order.
  if (observedTopologies.length > 1) {
    const refs = observedTopologies.map((observed) => observed.ref);
    return { kind: 'read-error', ref: dir, error: new MultipleObservedTopologiesError(refs) };
  }

  const connections = observedTopologies[0]?.connections;

  return {
    kind: 'ok',
    derived: { envSlug, resources, ...(connections !== undefined ? { connections } : {}) },
  };
}
