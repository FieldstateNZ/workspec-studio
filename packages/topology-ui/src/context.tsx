// The provider and the hooks the views read the host through. The provider
// owns (or accepts) a TanStack QueryClient and renders a themed
// `<div class="tp-root">` carrying the WorkSpec token palette inline;
// everything below it reads the file source, capabilities, and link
// resolver from context — never from a global. Query hooks are keyed on the
// source instance (`sourceId`) plus environment/lens, so two topology trees
// (or the same tree under two environments) never collide in cache.
// Mirrors `@workspec/decision-ui`'s `context.tsx` shape, adapted to
// `@workspec/topology-model`'s whole-tree-load-then-resolve pipeline instead
// of per-artifact repository reads.

import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { QueryClient as QueryClientType, UseQueryResult } from '@tanstack/react-query';
import { createContext, createElement, useContext, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  buildNetworkTree,
  buildResourceGroupTree,
  joinPositionsToLensTree,
  loadTopologyModel,
  resolve,
} from '@workspec/topology-model';
import type {
  LensId,
  LensTree,
  ResolvedTopology,
  TopologyFileSource,
  TopologyModel,
} from '@workspec/topology-model';
import type { Environment, Resource } from '@workspec/topology-schema';
import { reconcile, summarizeDrift } from '@workspec/topology-recon';
import type { DerivedTopology, Drift, DriftSummary } from '@workspec/topology-recon';
import { computeTopologyCost } from '@workspec/topology-cost';
import type { TopologyCostResult } from '@workspec/topology-cost';
import type { Catalog } from '@workspec/decision-schema';
import type { LinkResolver, TopologyStudioCapabilities, TopologyStudioHost } from './host.js';
import { sourceId } from './host.js';
import { DEFAULT_THEME, themeStyle } from './themes.js';
import type { ThemeName } from './themes.js';

const HostContext = createContext<TopologyStudioHost | null>(null);

/** Props for {@link TopologyStudioProvider}. */
export interface TopologyStudioProviderProps {
  /** The host contract every view depends on. */
  host: TopologyStudioHost;
  /** An existing QueryClient to reuse; a private one is created when omitted. */
  queryClient?: QueryClientType;
  /** Which theme to render. Defaults to `dark`. */
  theme?: ThemeName | undefined;
  /** Extra class names to add to the themed root element. */
  className?: string;
  children: ReactNode;
}

function createDefaultQueryClient(): QueryClientType {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Standalone data is the working tree; do not refetch on window
        // focus, and keep failed reads from retrying forever in a demo host.
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5_000,
      },
    },
  });
}

/**
 * Wraps the app in the host contract and a QueryClient, and renders a
 * themed root (`<div class="tp-root" data-aesthetic="console"
 * data-theme=…>`) carrying the full WorkSpec token palette INLINE via
 * `@workspec/design`'s `themeStyle()`, so theming is bound wherever the
 * views render with no document-level attributes required. Every Topology
 * Workbench view must render inside it.
 */
export function TopologyStudioProvider(props: TopologyStudioProviderProps): ReactNode {
  const { host, queryClient, theme = DEFAULT_THEME, className, children } = props;
  const client = useMemo(() => queryClient ?? createDefaultQueryClient(), [queryClient]);
  const classes = ['tp-root'];
  if (theme === 'dark') classes.push('dark');
  if (className !== undefined && className !== '') classes.push(className);

  const root = createElement(
    'div',
    {
      className: classes.join(' '),
      'data-aesthetic': 'console',
      'data-theme': theme,
      style: themeStyle(theme) as CSSProperties,
    },
    children,
  );
  const withHost = createElement(HostContext.Provider, { value: host }, root);
  return createElement(QueryClientProvider, { client }, withHost);
}

/** Read the host contract; throws if used outside `TopologyStudioProvider`. */
export function useHost(): TopologyStudioHost {
  const host = useContext(HostContext);
  if (host === null) {
    throw new Error('useHost must be used within a <TopologyStudioProvider>.');
  }
  return host;
}

/** The tree's file source. */
export function useSource(): TopologyFileSource {
  return useHost().source;
}

/** The host's capability flags. */
export function useCapabilities(): TopologyStudioCapabilities {
  return useHost().capabilities;
}

/** The host's link resolver, for a resource's `realizes` c4-container chips. */
export function useLinkResolver(): LinkResolver {
  return useHost().links;
}

// ── Query keys ───────────────────────────────────────────────────────────────

/** Query key for the whole-tree loaded model of a source. */
export function topologyModelKey(source: TopologyFileSource): readonly unknown[] {
  return ['tp', 'model', sourceId(source)];
}
/** Query key for one environment's resolved topology. */
export function resolvedTopologyKey(source: TopologyFileSource, envSlug: string): readonly unknown[] {
  return ['tp', 'resolved', sourceId(source), envSlug];
}
/** Query key for one environment's built (and position-joined) lens tree. */
export function lensTreeKey(
  source: TopologyFileSource,
  envSlug: string,
  lens: LensId,
): readonly unknown[] {
  return ['tp', 'lens', sourceId(source), envSlug, lens];
}
/** Query key for one environment's reconciliation (P5 drift). */
export function reconcileKey(source: TopologyFileSource, envSlug: string): readonly unknown[] {
  return ['tp', 'reconcile', sourceId(source), envSlug];
}
/** Query key for one environment's cost (P6). */
export function costKey(source: TopologyFileSource, envSlug: string): readonly unknown[] {
  return ['tp', 'cost', sourceId(source), envSlug];
}

// ── Shared, cache-deduped async steps ────────────────────────────────────────
// Both `useResolvedTopology` and `useLensTree` need the loaded model, and
// `useLensTree` also needs the resolved topology; `queryClient.fetchQuery`
// dedupes against the SAME cache the standalone `useTopologyModel`/
// `useResolvedTopology` hooks populate, so nothing is loaded or resolved
// twice just because two hooks want it.

function toResourceMap(model: TopologyModel): ReadonlyMap<string, Resource> {
  return new Map([...model.resources].map(([slug, loaded]) => [slug, loaded.resource]));
}

function toEnvironmentMap(model: TopologyModel): ReadonlyMap<string, Environment> {
  return new Map([...model.environments].map(([slug, loaded]) => [slug, loaded.environment]));
}

function ensureModel(
  queryClient: QueryClientType,
  source: TopologyFileSource,
): Promise<TopologyModel> {
  return queryClient.fetchQuery({
    queryKey: topologyModelKey(source),
    queryFn: () => loadTopologyModel(source),
  });
}

/**
 * Pure `resolve()` step over an already-loaded model — split out from
 * `useResolvedTopology`'s queryFn so `useLensTree` can build on it via
 * `queryClient.fetchQuery` on the SAME `resolvedTopologyKey` cache entry
 * WITHOUT that key's own populating query ever calling `fetchQuery` on
 * itself (a self-referential `fetchQuery` for a query's own in-flight key
 * awaits a promise that only resolves when that very call returns —
 * a deadlock `useResolvedTopology` must never re-create for its own key).
 */
function computeResolvedTopology(model: TopologyModel, envSlug: string): ResolvedTopology {
  if (model.topology === null) {
    throw new Error(
      'This tree has no single topology (zero, or more than one, .workspec/topologies/*.yaml file).',
    );
  }
  return resolve(model.topology.topology, toResourceMap(model), toEnvironmentMap(model), envSlug);
}

/** Resolved-topology cache lookup for a caller (`useLensTree`) whose OWN query key is different from `resolvedTopologyKey` — safe to dedupe through `fetchQuery`. */
function ensureResolvedTopology(
  queryClient: QueryClientType,
  source: TopologyFileSource,
  envSlug: string,
): Promise<ResolvedTopology> {
  return queryClient.fetchQuery({
    queryKey: resolvedTopologyKey(source, envSlug),
    queryFn: async () => computeResolvedTopology(await ensureModel(queryClient, source), envSlug),
  });
}

// ── Query hooks ────────────────────────────────────────────────────────────────

/** Loads the whole tree's `TopologyModel` (topology + resources + environments + layout + diagnostics). */
export function useTopologyModel(): UseQueryResult<TopologyModel> {
  const source = useSource();
  return useQuery({
    queryKey: topologyModelKey(source),
    queryFn: () => loadTopologyModel(source),
  });
}

/**
 * Resolves the tree's topology against one environment. Disabled until
 * `envSlug` is defined. Builds the result via `ensureModel` (a DIFFERENT
 * query key) rather than `ensureResolvedTopology` (this hook's OWN key) —
 * see `computeResolvedTopology`'s comment for why that distinction matters.
 */
export function useResolvedTopology(envSlug: string | undefined): UseQueryResult<ResolvedTopology> {
  const source = useSource();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: resolvedTopologyKey(source, envSlug ?? ''),
    queryFn: async () => computeResolvedTopology(await ensureModel(queryClient, source), envSlug as string),
    enabled: envSlug !== undefined,
  });
}

/**
 * Builds one lens's tree for one environment, with pinned `.layout/`
 * positions joined in. Disabled until `envSlug` is defined.
 */
export function useLensTree(envSlug: string | undefined, lens: LensId): UseQueryResult<LensTree> {
  const source = useSource();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: lensTreeKey(source, envSlug ?? '', lens),
    queryFn: async () => {
      const env = envSlug as string;
      const [model, resolved] = await Promise.all([
        ensureModel(queryClient, source),
        ensureResolvedTopology(queryClient, source, env),
      ]);
      const tree = lens === 'network' ? buildNetworkTree(resolved) : buildResourceGroupTree(resolved);
      return joinPositionsToLensTree(tree, model.layout?.data ?? null);
    },
    enabled: envSlug !== undefined,
  });
}

// ── P5/P6 payload hooks ──────────────────────────────────────────────────────
// Both `reconcile()` and `computeTopologyCost()` are pure and browser-safe —
// no separate "recon service"/"cost service" exists, so these hooks just
// compute over the SAME resolved topology `useResolvedTopology` already
// caches, plus one host-supplied input each (`loadDerived`/`loadCatalog`).
// Disabled until `envSlug` is defined, exactly like `useResolvedTopology` —
// `TopologyWorkbench` passes `undefined` for whichever of these isn't the
// active view, so switching to Drift/Cost is what triggers the fetch.

/** `useReconcile`'s result: the derived topology it reconciled against, the raw `Drift[]`, and the summary counts. */
export interface ReconcileResult {
  readonly derived: DerivedTopology;
  readonly drifts: readonly Drift[];
  readonly summary: DriftSummary;
}

/**
 * Reconciles the resolved topology for `envSlug` against the host's
 * `loadDerived(envSlug)` (P5 drift). Resolves to `null` — NOT an error —
 * when the host has no `loadDerived` at all, or it resolves to `null`
 * itself (nothing imported for this environment yet): the Drift view reads
 * a `null` `data` as "show the empty state", reserving `isError` for a
 * genuine failure (a `loadDerived` that throws, or a malformed derived
 * topology `reconcile()` itself rejects).
 */
export function useReconcile(envSlug: string | undefined): UseQueryResult<ReconcileResult | null> {
  const source = useSource();
  const host = useHost();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: reconcileKey(source, envSlug ?? ''),
    queryFn: async () => {
      const env = envSlug as string;
      if (host.loadDerived === undefined) return null;
      const [resolved, derived] = await Promise.all([
        ensureResolvedTopology(queryClient, source, env),
        host.loadDerived(env),
      ]);
      if (derived === null) return null;
      const drifts = reconcile(resolved, derived, env);
      return { derived, drifts, summary: summarizeDrift(drifts) };
    },
    enabled: envSlug !== undefined,
  });
}

/** `useCost`'s result: the catalog it priced against, and the full priced result. */
export interface CostViewResult {
  readonly catalog: Catalog;
  readonly cost: TopologyCostResult;
}

/**
 * Prices the resolved topology for `envSlug` against the host's
 * `loadCatalog()` (P6 cost). Resolves to `null` — NOT an error — when the
 * host has no `loadCatalog` at all, or it resolves to `null` itself (no
 * catalog configured): the Cost view reads a `null` `data` as "show the
 * empty state", reserving `isError` for a genuine failure.
 */
export function useCost(envSlug: string | undefined): UseQueryResult<CostViewResult | null> {
  const source = useSource();
  const host = useHost();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: costKey(source, envSlug ?? ''),
    queryFn: async () => {
      const env = envSlug as string;
      if (host.loadCatalog === undefined) return null;
      const [resolved, catalog] = await Promise.all([
        ensureResolvedTopology(queryClient, source, env),
        host.loadCatalog(),
      ]);
      if (catalog === null) return null;
      return { catalog, cost: computeTopologyCost(resolved, catalog) };
    },
    enabled: envSlug !== undefined,
  });
}
