// The host contract. Everything the UI needs from its embedder arrives
// through a `C4StudioHost` passed directly as a component prop (unlike
// packages/decision-ui, where the host rides a context provider — that
// package's views fetch by ref through a repository port; this package's
// components are handed already-loaded `@workspec/c4-model`/`@workspec/c4-layout`
// data as props, so there is no provider-scoped cache to own). Components
// never touch the filesystem or a link registry directly — they read them
// from the `host` prop. This is what makes the same components run
// standalone, inside a Studio host, and as a module-federation remote with
// no forks.

import type { C4FileSource } from '@workspec/c4-model';

/**
 * A navigation target the host understands, handed to a resolved link's
 * `onClick`. Mirrors `@workspec/decision-ui`'s `LinkTarget` shape exactly —
 * same contract, applied to a C4 element's `links` entries instead of a
 * decision's.
 */
export interface LinkTarget {
  /** The link type, e.g. "adr", "runbook", "feature". */
  kind: string;
  /** The human-readable label shown for the link. */
  label: string;
  /** The path ref the link entry carried (`~/...` or `@workspace/...`). */
  target: string;
}

/**
 * The outcome of resolving one element link entry. A host that cannot
 * resolve a link returns `{ resolved: false }` and the UI renders an
 * **inert label** (a plain span, no anchor, no handler). A host that can
 * resolve returns `resolved: true` with an `href` (renders an anchor)
 * and/or an `onClick` (renders a button). Mirrors
 * `@workspec/decision-ui`'s `LinkResolution` contract shape exactly.
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
 * Resolves one element link entry (a `{<linkType>: <pathRef>}` pair off a
 * `@workspec/c4-schema` `links` array) to something renderable. The
 * standalone default ({@link createInertLinkResolver}) resolves nothing, so
 * every link renders as an inert label. An embedding host provides a
 * resolver that turns known link types/targets into real hrefs or
 * navigation callbacks.
 */
export type LinkResolver = (link: LinkTarget) => LinkResolution;

/** Feature capabilities the host grants. */
export interface C4StudioCapabilities {
  /**
   * Whether drag-to-pin is permitted. When true AND `source` is present, a
   * node's hover/focus affordances add a drag handle; dragging updates the
   * node's position locally and writes the diagram's `.layout/` file back
   * through `source`. When false (or `source` is absent), every diagram
   * renders read-only — no drag handles, no writes.
   */
  editLayout: boolean;
}

/**
 * The host contract a `C4Diagram`/`C4Explorer` accepts as an (optional)
 * prop. Omitting it entirely renders every diagram fully read-only with
 * every link inert — the same as passing `{ capabilities: { editLayout:
 * false } }` with no `source`/`linkResolver`.
 */
export interface C4StudioHost {
  /**
   * The tree's file source: reads are already done upstream (the caller
   * loads the `C4Model` via `loadC4Model` before rendering), so this is
   * used only for the drag-to-pin write-back path
   * (`source.writeFile(layoutPathFor(diagramSlug), ...)`). Omit for a
   * host that never grants `editLayout`.
   */
  source?: C4FileSource;
  /** Turns an element's link entries into hrefs/handlers, or leaves them inert. Omit for every link to render inert. */
  linkResolver?: LinkResolver;
  /** What the current host permits. */
  capabilities: C4StudioCapabilities;
}

/**
 * The standalone default: every link is unresolved, so an element's Links
 * section renders inert labels. Hosts that can resolve links supply their
 * own resolver instead.
 */
export function createInertLinkResolver(): LinkResolver {
  return () => ({ resolved: false });
}
