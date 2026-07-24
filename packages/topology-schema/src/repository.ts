// The repository port — the single storage abstraction Topology Studio's UI
// depends on. One UI runs standalone over the filesystem (`FsRepository`, in
// the studio package) and, later, inside WorkSpec Enterprise over a
// graph-backed implementation. Both satisfy this port. Mirrors
// `@workspec/decision-schema`'s `repository.ts` shape: exactly three methods
// (list/read/write) per artifact kind, plus a `readLayout`/`writeLayout`
// pair for the topology `.layout/` special file (mirroring
// `@workspec/c4-schema`'s treatment of diagram layouts as a keyed-by-slug
// side file rather than a fourth artifact kind — see `paths/layout-path-for.ts`).
//
// `MemoryRepository` is the in-memory test double UI component tests run
// against — factory-built, never a shared mutable fixture.

import { EnvironmentArtifact } from './environment.js';
import { ResourceArtifact } from './resource.js';
import { TopologyArtifact } from './topology.js';
import { Layout } from './schemas/layout/layout.js';
import type { Environment } from './environment.js';
import type { Resource } from './resource.js';
import type { Topology } from './topology.js';
import type { Layout as LayoutType } from './schemas/layout/layout.js';

/**
 * An opaque reference to a stored artifact — an id or path. Standalone
 * (`FsRepository`) uses repo-root-relative file paths; a graph-backed
 * implementation may use node ids. Callers treat it as an opaque string.
 */
export type Ref = string;

/** A topology list entry: its ref plus enough identity to render a picker. */
export interface TopologyRef {
  /** The opaque ref to pass back to `readTopology`/`writeTopology`. */
  ref: Ref;
  /** The topology's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The topology's `spec.title`. */
  title: string;
}

/** A resource list entry: its ref plus enough identity to render a picker. */
export interface ResourceRef {
  /** The opaque ref to pass back to `readResource`/`writeResource`. */
  ref: Ref;
  /** The resource's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
  /** The resource's `spec.name`. */
  title: string;
}

/**
 * An environment list entry: its ref plus enough identity to render a
 * picker. No `title`: unlike `Topology`/`Resource`, `EnvironmentSpec` has no
 * display-name field of its own — identity is the slug alone.
 */
export interface EnvironmentRef {
  /** The opaque ref to pass back to `readEnvironment`/`writeEnvironment`. */
  ref: Ref;
  /** The environment's `metadata.slug`, when the artifact carries one explicitly. */
  slug?: string;
}

/**
 * The storage port. **Exactly eleven methods** — three per artifact kind
 * (nine) plus the layout read/write pair. Any implementation (filesystem,
 * in-memory, graph-backed) provides these and only these; extending the
 * port is a deliberate cross-cutting change, not a local one.
 */
export interface TopologyRepositoryPort {
  /** List every topology artifact the repository can see. */
  listTopologies(): Promise<TopologyRef[]>;
  /** Read + validate a topology by ref. Rejects if missing or invalid. */
  readTopology(ref: Ref): Promise<Topology>;
  /** Validate + persist a topology at ref. Rejects if invalid. */
  writeTopology(ref: Ref, topology: Topology): Promise<void>;
  /** List every resource artifact the repository can see. */
  listResources(): Promise<ResourceRef[]>;
  /** Read + validate a resource by ref. Rejects if missing or invalid. */
  readResource(ref: Ref): Promise<Resource>;
  /** Validate + persist a resource at ref. Rejects if invalid. */
  writeResource(ref: Ref, resource: Resource): Promise<void>;
  /** List every environment artifact the repository can see. */
  listEnvironments(): Promise<EnvironmentRef[]>;
  /** Read + validate an environment by ref. Rejects if missing or invalid. */
  readEnvironment(ref: Ref): Promise<Environment>;
  /** Validate + persist an environment at ref. Rejects if invalid. */
  writeEnvironment(ref: Ref, environment: Environment): Promise<void>;
  /**
   * Read + validate the `.layout/` file for a topology, keyed by the
   * topology's own slug (not an opaque `Ref` — a layout has no identity of
   * its own). Resolves `undefined` when no layout file exists for that
   * topology (fully auto-laid-out), matching the "optionality is the
   * contract" convention `@workspec/c4-schema`'s layout file uses.
   */
  readLayout(topologySlug: string): Promise<LayoutType | undefined>;
  /** Validate + persist the `.layout/` file for a topology. Rejects if invalid. */
  writeLayout(topologySlug: string, layout: LayoutType): Promise<void>;
}

/** The exact method names of the port, as a runtime-checkable tuple. */
export const TOPOLOGY_REPOSITORY_METHODS = [
  'listTopologies',
  'readTopology',
  'writeTopology',
  'listResources',
  'readResource',
  'writeResource',
  'listEnvironments',
  'readEnvironment',
  'writeEnvironment',
  'readLayout',
  'writeLayout',
] as const;

/** Seed data for {@link createMemoryRepository}. Maps are keyed by ref (layouts by topology slug). */
export interface MemoryRepositorySeed {
  /** Topologies to preload, keyed by the ref they are stored under. */
  topologies?: Record<Ref, Topology>;
  /** Resources to preload, keyed by the ref they are stored under. */
  resources?: Record<Ref, Resource>;
  /** Environments to preload, keyed by the ref they are stored under. */
  environments?: Record<Ref, Environment>;
  /** Layouts to preload, keyed by the topology slug they position. */
  layouts?: Record<string, LayoutType>;
}

function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

function validateTopology(ref: Ref, topology: Topology): Topology {
  const result = TopologyArtifact.safeParse(topology);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid topology at "${ref}" (${where})`);
  }
  return result.data;
}

function validateResource(ref: Ref, resource: Resource): Resource {
  const result = ResourceArtifact.safeParse(resource);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid resource at "${ref}" (${where})`);
  }
  return result.data;
}

function validateEnvironment(ref: Ref, environment: Environment): Environment {
  const result = EnvironmentArtifact.safeParse(environment);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid environment at "${ref}" (${where})`);
  }
  return result.data;
}

function validateLayout(topologySlug: string, layout: LayoutType): LayoutType {
  const result = Layout.safeParse(layout);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first ? `${first.path.join('.') || '<root>'}: ${first.message}` : 'invalid';
    throw new Error(`MemoryRepository: invalid layout for topology "${topologySlug}" (${where})`);
  }
  return result.data;
}

/**
 * Build an in-memory {@link TopologyRepositoryPort} — the UI test double.
 *
 * Factory-built (never a shared mutable module singleton) so each test owns
 * an isolated instance. Writes validate through Zod; reads and the seed both
 * return deep clones, so a caller mutating a returned artifact cannot
 * corrupt the store. Insertion order is preserved for stable `list*` output.
 */
export function createMemoryRepository(seed: MemoryRepositorySeed = {}): TopologyRepositoryPort {
  const topologies = new Map<Ref, Topology>();
  const resources = new Map<Ref, Resource>();
  const environments = new Map<Ref, Environment>();
  const layouts = new Map<string, LayoutType>();

  for (const [ref, topology] of Object.entries(seed.topologies ?? {})) {
    topologies.set(ref, cloneJson(validateTopology(ref, topology)));
  }
  for (const [ref, resource] of Object.entries(seed.resources ?? {})) {
    resources.set(ref, cloneJson(validateResource(ref, resource)));
  }
  for (const [ref, environment] of Object.entries(seed.environments ?? {})) {
    environments.set(ref, cloneJson(validateEnvironment(ref, environment)));
  }
  for (const [topologySlug, layout] of Object.entries(seed.layouts ?? {})) {
    layouts.set(topologySlug, cloneJson(validateLayout(topologySlug, layout)));
  }

  return {
    listTopologies(): Promise<TopologyRef[]> {
      return Promise.resolve(
        [...topologies.entries()].map(([ref, topology]) => ({
          ref,
          ...(topology.metadata.slug !== undefined ? { slug: topology.metadata.slug } : {}),
          title: topology.spec.title,
        })),
      );
    },
    readTopology(ref: Ref): Promise<Topology> {
      const topology = topologies.get(ref);
      if (topology === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no topology at "${ref}"`));
      }
      return Promise.resolve(cloneJson(topology));
    },
    writeTopology(ref: Ref, topology: Topology): Promise<void> {
      try {
        topologies.set(ref, cloneJson(validateTopology(ref, topology)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    listResources(): Promise<ResourceRef[]> {
      return Promise.resolve(
        [...resources.entries()].map(([ref, resource]) => ({
          ref,
          ...(resource.metadata.slug !== undefined ? { slug: resource.metadata.slug } : {}),
          title: resource.spec.name,
        })),
      );
    },
    readResource(ref: Ref): Promise<Resource> {
      const resource = resources.get(ref);
      if (resource === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no resource at "${ref}"`));
      }
      return Promise.resolve(cloneJson(resource));
    },
    writeResource(ref: Ref, resource: Resource): Promise<void> {
      try {
        resources.set(ref, cloneJson(validateResource(ref, resource)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    listEnvironments(): Promise<EnvironmentRef[]> {
      return Promise.resolve(
        [...environments.entries()].map(([ref, environment]) => ({
          ref,
          ...(environment.metadata.slug !== undefined ? { slug: environment.metadata.slug } : {}),
        })),
      );
    },
    readEnvironment(ref: Ref): Promise<Environment> {
      const environment = environments.get(ref);
      if (environment === undefined) {
        return Promise.reject(new Error(`MemoryRepository: no environment at "${ref}"`));
      }
      return Promise.resolve(cloneJson(environment));
    },
    writeEnvironment(ref: Ref, environment: Environment): Promise<void> {
      try {
        environments.set(ref, cloneJson(validateEnvironment(ref, environment)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
    readLayout(topologySlug: string): Promise<LayoutType | undefined> {
      const layout = layouts.get(topologySlug);
      return Promise.resolve(layout === undefined ? undefined : cloneJson(layout));
    },
    writeLayout(topologySlug: string, layout: LayoutType): Promise<void> {
      try {
        layouts.set(topologySlug, cloneJson(validateLayout(topologySlug, layout)));
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error as Error);
      }
    },
  };
}
