// The host contract. Everything the UI needs from its embedder arrives through
// `DecisionStudioHost`: the storage port, a link resolver, an optional navigate
// hook, and capability flags. Components never touch storage, routing, or theme
// directly — they read them from the provider (see `context.tsx`). This is what
// makes the same views run standalone (the studio host) and, later, inside
// WorkSpec Enterprise or as a module-federation remote (S6) with no forks.

import type { Decision, DecisionRepositoryPort, LinkType, Ref } from '@workspec/decision-schema';

/**
 * A navigation target the host understands. The UI hands one to
 * {@link DecisionStudioHost.navigate} (when provided) — e.g. from a resolved
 * link's `onClick`. The host decides what to do with it.
 */
export interface LinkTarget {
  /** The link kind, e.g. "deployment", "feature", "system-requirement". */
  kind: string;
  /** The human-readable label. */
  label: string;
  /** The opaque target/ref/url the host resolves, if the link carried one. */
  target?: string;
}

/**
 * The outcome of resolving a {@link LinkType}. A host that cannot resolve a link
 * returns `{ resolved: false }` and the UI renders an **inert label** (a plain
 * span, no anchor, no handler). A host that can resolve returns `resolved: true`
 * with an `href` (renders an anchor) and/or an `onClick` (renders a button).
 */
export type LinkResolution =
  | { resolved: false }
  | {
      resolved: true;
      /** Render as an anchor to this URL when present. */
      href?: string;
      /** Render as a button invoking this when present (e.g. host navigation). */
      onClick?: () => void;
      /** Optional tooltip / accessible description. */
      title?: string;
    };

/**
 * Resolves a decision {@link LinkType} to something renderable. The standalone
 * default ({@link createInertLinkResolver}) resolves nothing, so every link is
 * an inert label. An embedding host provides a resolver that turns known link
 * kinds/targets into real hrefs or navigation callbacks.
 */
export type LinkResolver = (link: LinkType) => LinkResolution;

/** Feature capabilities the host grants. S4 ships both off; S5 flips them on. */
export interface DecisionStudioCapabilities {
  /** Whether catalog editing (the Catalog view, S5) is permitted. */
  editCatalog: boolean;
  /** Whether the decide flow (record an outcome, S5) is permitted. */
  decide: boolean;
}

/**
 * The single object the UI depends on. Provide it to `DecisionStudioProvider`.
 * No other channel exists — there is deliberately no global, no direct `window`,
 * no ambient theme. That is the host-agnostic contract S6 builds the federation
 * remote against.
 */
export interface DecisionStudioHost {
  /** Storage: the six-method port. Standalone uses fs/http; tests use memory. */
  repository: DecisionRepositoryPort;
  /** Turns decision links into hrefs/handlers, or leaves them inert. */
  links: LinkResolver;
  /** Optional host navigation for resolved link targets and view switches. */
  navigate?: (target: LinkTarget) => void;
  /** What the current host permits. */
  capabilities: DecisionStudioCapabilities;
}

/**
 * The standalone default: every link is unresolved, so the workspace renders
 * link rows as inert labels. Hosts that can resolve links supply their own.
 */
export function createInertLinkResolver(): LinkResolver {
  return () => ({ resolved: false });
}

// ── Query-key identity for a repository instance ─────────────────────────────
// TanStack Query keys must be structurally comparable; a repository object is
// not. We assign each repository instance a stable string id (via a WeakMap) so
// query keys can be keyed on "which repository" without stringifying the object.

const repositoryIds = new WeakMap<DecisionRepositoryPort, string>();
let repositorySeq = 0;

/** A stable string id for a repository instance, for use in query keys. */
export function repositoryId(repository: DecisionRepositoryPort): string {
  let id = repositoryIds.get(repository);
  if (id === undefined) {
    id = `repo:${(repositorySeq += 1)}`;
    repositoryIds.set(repository, id);
  }
  return id;
}

// ── Catalog ref resolution (mirrors FsRepository.resolveCatalogRef) ──────────
// A decision names its catalog by a path relative to itself (`spec.catalog`).
// The UI resolves that against the decision's ref using pure POSIX path math, so
// the same logic works for filesystem refs, http refs, and memory refs without
// pulling in `node:path` (which is not available in the browser).

function posixDirname(ref: string): string {
  const slash = ref.lastIndexOf('/');
  return slash === -1 ? '.' : ref.slice(0, slash) || '/';
}

function posixNormalize(path: string): string {
  const isAbsolute = path.startsWith('/');
  const parts = path.split('/');
  const stack: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (stack.length > 0 && stack[stack.length - 1] !== '..') stack.pop();
      else if (!isAbsolute) stack.push('..');
    } else {
      stack.push(part);
    }
  }
  const joined = stack.join('/');
  return isAbsolute ? `/${joined}` : joined || '.';
}

/**
 * Resolve the catalog ref a decision points at, given the decision's own ref.
 * `resolveCatalogRef("examples/x.decision.yaml", …spec.catalog="./y.catalog.yaml")`
 * → `"examples/y.catalog.yaml"`. Matches `FsRepository.resolveCatalogRef` so a
 * decision's catalog can be read back through the same port.
 */
export function resolveCatalogRef(decisionRef: Ref, decision: Decision): Ref {
  const dir = posixDirname(decisionRef);
  const joined = posixNormalize(`${dir}/${decision.spec.catalog}`);
  return joined.replace(/^\.\//, '');
}
