// The host contract for @workspec/trace-ui. Shaped like every other Studio
// module's host contract (`repository` / `links` / `navigate` /
// `capabilities` — see `@workspec/cost-ui`'s `host.ts`, which this mirrors),
// so an embedder wires trace-ui the same way it wires Cost, Decision, or C4.
//
// The one deliberate difference from `@workspec/cost-ui`'s port: THIS
// module renders an already-derived `TraceModel` and never re-derives it
// (spec §5 / T5 brief — trace-ui is a pure view over `@workspec/trace-model`'s
// output). So `TraceRepositoryPort`'s only job is "hand me the current
// model", not "hand me raw artifacts to compute coverage from" the way
// `CostRepositoryPort` hands over inventories/attributions for `cost-engine`
// to re-derive client-side. A real host (the future Studio shell, or
// `@workspec/trace-studio`'s server) wires `readModel` to a call that loads
// the `.workspec/` tree + runs and pipes them through `@workspec/trace-model`'s
// `buildModel`; tests and the dev story (see `dev/main.tsx`) inject an
// already-resolved model via `createMemoryRepository` below.

import type { TraceModel } from '@workspec/trace-model';

/** The filesystem/derivation boundary trace-ui depends on. */
export interface TraceRepositoryPort {
  /** Returns the current derived `TraceModel` to render. */
  readModel(): Promise<TraceModel>;
}

/**
 * A navigation target the host understands — e.g. a resolved link's
 * `onClick`, or a future cross-tab jump once Matrix/Run review land (T6/T7).
 * Mirrors `@workspec/cost-ui`'s `CostLinkTarget` shape.
 */
export interface TraceLinkTarget {
  /** The link kind, e.g. "ci-run", "feature". */
  kind: string;
  /** The human-readable label. */
  label: string;
  /** The opaque target/ref the host resolves, if the link carried one. */
  target?: string;
}

/**
 * The outcome of resolving a link. A host that cannot resolve one returns
 * `{ resolved: false }` and the UI renders an inert label. A host that can
 * resolve returns `resolved: true` with an `href` and/or an `onClick`.
 */
export type TraceLinkResolution =
  | { resolved: false }
  | {
      resolved: true;
      href?: string;
      onClick?: () => void;
      title?: string;
    };

/** Resolves a {@link TraceLinkTarget} to something renderable. */
export type TraceLinkResolver = (link: TraceLinkTarget) => TraceLinkResolution;

/** The standalone default: every link is unresolved. */
export function createInertLinkResolver(): TraceLinkResolver {
  return () => ({ resolved: false });
}

/**
 * Feature capabilities the host grants. T5 (#73) ships two read-only views —
 * nothing here is consulted yet — but the field is real (not a placeholder
 * empty interface) so T6's Matrix "Fix coverage →" flow (the
 * `workspec-trace generate` skeleton-generation command surfaced from a
 * multi-select of untested scenarios, spec §5) has a home to land in without
 * a breaking host-contract change.
 */
export interface TraceStudioCapabilities {
  /** Whether the host permits acting on the Matrix's "fix coverage" flow. Unused until T6. */
  generateSkeletons: boolean;
}

/**
 * The single object trace-ui depends on. Provide it to `TraceStudioProvider`.
 * No other channel exists — no global, no direct `window`, no ambient theme.
 */
export interface TraceStudioHost {
  /** The derivation boundary: standalone hosts implement this over the filesystem; tests use `createMemoryRepository`. */
  repository: TraceRepositoryPort;
  /** Turns trace links into hrefs/handlers. Defaults to an inert resolver. */
  links?: TraceLinkResolver;
  /** Optional host navigation for resolved link targets and (future) view switches. */
  navigate?: (target: TraceLinkTarget) => void;
  /** What the current host permits. */
  capabilities: TraceStudioCapabilities;
}

// ── Query-key identity for a repository instance ─────────────────────────────
// TanStack Query keys must be structurally comparable; a repository object is
// not. Each repository instance gets a stable string id (via a WeakMap) so
// query keys can be keyed on "which repository" without stringifying it.
// Mirrors `@workspec/cost-ui`'s `repositoryId`.

const repositoryIds = new WeakMap<TraceRepositoryPort, string>();
let repositorySeq = 0;

/** A stable string id for a repository instance, for use in query keys. */
export function repositoryId(repository: TraceRepositoryPort): string {
  let id = repositoryIds.get(repository);
  if (id === undefined) {
    id = `repo:${(repositorySeq += 1)}`;
    repositoryIds.set(repository, id);
  }
  return id;
}

/** Seed state for {@link createMemoryRepository}. */
export interface MemoryRepositoryInit {
  /** The model `readModel()` resolves to. */
  model: TraceModel;
}

/**
 * An in-memory {@link TraceRepositoryPort} for tests, stories, and simple
 * embedders that already have a `TraceModel` in hand (e.g. built once at
 * process start from a CI artifact). `readModel()` always resolves the
 * seeded model.
 */
export function createMemoryRepository(init: MemoryRepositoryInit): TraceRepositoryPort {
  return {
    readModel(): Promise<TraceModel> {
      return Promise.resolve(init.model);
    },
  };
}
