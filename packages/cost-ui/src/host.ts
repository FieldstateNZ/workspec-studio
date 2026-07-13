// The host contract. Everything the UI needs from its embedder arrives
// through `CostStudioHost`: the storage port, an optional link resolver, an
// optional navigate hook, and capability flags. Components never touch
// storage or routing directly — they read them from the provider (see
// `context.tsx`). Mirrors `@workspec/decision-ui`'s `host.ts` shape so the
// Cost, Decision, and C4 studios stay structurally consistent.

import type { CostRepositoryPort } from '@workspec/cost-schema';

/**
 * A navigation target the host understands. The UI hands one to
 * {@link CostStudioHost.navigate} (when provided) — e.g. `CostApp`'s
 * "Fix in workbench →" cross-tab jump, or a resolved link's `onClick`. The
 * host decides what to do with it.
 */
export interface CostLinkTarget {
  /** The link kind, e.g. "view", "resource". */
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
export type CostLinkResolution =
  | { resolved: false }
  | {
      resolved: true;
      href?: string;
      onClick?: () => void;
      title?: string;
    };

/** Resolves a {@link CostLinkTarget} to something renderable. */
export type CostLinkResolver = (link: CostLinkTarget) => CostLinkResolution;

/** The standalone default: every link is unresolved. */
export function createInertLinkResolver(): CostLinkResolver {
  return () => ({ resolved: false });
}

/** Feature capabilities the host grants. */
export interface CostStudioCapabilities {
  /** Whether editing the attribution ruleset (rail reorder, promotion, remove) is permitted. */
  editAttribution: boolean;
}

/**
 * The single object the UI depends on. Provide it to `CostStudioProvider`.
 * No other channel exists — no global, no direct `window`, no ambient theme.
 */
export interface CostStudioHost {
  /** Storage: the twelve-method port. Standalone uses fs/http; tests use memory. */
  repository: CostRepositoryPort;
  /** Turns cost links into hrefs/handlers. Defaults to an inert resolver. */
  links?: CostLinkResolver;
  /** Optional host navigation for resolved link targets and view switches. */
  navigate?: (target: CostLinkTarget) => void;
  /** What the current host permits. */
  capabilities: CostStudioCapabilities;
}

// ── Query-key identity for a repository instance ─────────────────────────────
// TanStack Query keys must be structurally comparable; a repository object is
// not. Each repository instance gets a stable string id (via a WeakMap) so
// query keys can be keyed on "which repository" without stringifying it.

const repositoryIds = new WeakMap<CostRepositoryPort, string>();
let repositorySeq = 0;

/** A stable string id for a repository instance, for use in query keys. */
export function repositoryId(repository: CostRepositoryPort): string {
  let id = repositoryIds.get(repository);
  if (id === undefined) {
    id = `repo:${(repositorySeq += 1)}`;
    repositoryIds.set(repository, id);
  }
  return id;
}
