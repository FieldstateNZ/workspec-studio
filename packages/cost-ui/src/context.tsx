// The provider and the hooks the views read the host through. The provider
// owns (or accepts) a TanStack QueryClient and renders a themed `.cost-root`
// element; everything below it reads the repository, capabilities, link
// resolver, and navigation from context — never from a global, and never
// from `matchMedia` (theme is a prop — see `CostStudioProviderProps.theme`).
// Query hooks are keyed on the repository instance (`repositoryId`) plus the
// artifact ref, so two attributions, or the same attribution in two
// different repositories, never collide in cache. Mirrors
// `@workspec/decision-ui`'s `context.tsx`.

import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { createContext, createElement, useContext, useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type {
  Attribution,
  AttributionRef,
  CostRepositoryPort,
  Inventory,
  InventoryRef,
  Ref,
  Spend,
  SpendRef,
  TagPlan,
  TagPlanRef,
} from '@workspec/cost-schema';
import type { CostLinkResolver, CostLinkTarget, CostStudioCapabilities, CostStudioHost } from './host.js';
import { createInertLinkResolver, repositoryId } from './host.js';
import { DEFAULT_THEME, themeStyle } from './themes.js';
import type { ThemeName } from './themes.js';

const HostContext = createContext<CostStudioHost | null>(null);

/** Props for {@link CostStudioProvider}. */
export interface CostStudioProviderProps {
  /** The host contract every view depends on. */
  host: CostStudioHost;
  /** An existing QueryClient to reuse; a private one is created when omitted. */
  queryClient?: QueryClient;
  /** Which theme to render (`data-theme` on the root). Defaults to `dark`. Never read from `matchMedia` or storage — the host decides. */
  theme?: ThemeName | undefined;
  /** Extra class names to add to the themed root element. */
  className?: string;
  children: ReactNode;
}

function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5_000,
      },
    },
  });
}

/**
 * Wraps the app in the host contract and a QueryClient, and renders a themed
 * root (`<div class="cost-root" data-aesthetic="console" data-theme=…>`)
 * carrying the full WorkSpec token palette INLINE via `@workspec/design`'s
 * `themeStyle()`, so theming is bound wherever the views render. `theme` is a
 * plain prop — this component and everything under it never calls
 * `matchMedia` and never touches `localStorage`/`workspec.theme`; the host
 * (or its own shell) owns reading the ambient preference and threading it
 * down as `theme`.
 */
export function CostStudioProvider(props: CostStudioProviderProps): ReactNode {
  const { host, queryClient, theme = DEFAULT_THEME, className, children } = props;
  const client = useMemo(() => queryClient ?? createDefaultQueryClient(), [queryClient]);
  const classes = ['cost-root'];
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

/** Read the host contract; throws if used outside `CostStudioProvider`. */
export function useHost(): CostStudioHost {
  const host = useContext(HostContext);
  if (host === null) {
    throw new Error('useHost must be used within a <CostStudioProvider>.');
  }
  return host;
}

/**
 * Re-provide the host contract with `navigate` overridden. `CostApp` uses
 * this so its own tab switch (and Reports' "Fix in workbench →" cross-tab
 * jump) drives its own internal view state, while the surrounding
 * QueryClient, repository, and capabilities are inherited unchanged.
 */
export function HostNavigateProvider(props: {
  navigate: (target: CostLinkTarget) => void;
  children: ReactNode;
}): ReactNode {
  const host = useHost();
  const value = useMemo<CostStudioHost>(
    () => ({ ...host, navigate: props.navigate }),
    [host, props.navigate],
  );
  return createElement(HostContext.Provider, { value }, props.children);
}

/** The storage port. */
export function useRepository(): CostRepositoryPort {
  return useHost().repository;
}

/** The host's capability flags. */
export function useCapabilities(): CostStudioCapabilities {
  return useHost().capabilities;
}

/** The host's link resolver. Falls back to an inert resolver when the host didn't provide one. */
export function useLinkResolver(): CostLinkResolver {
  return useHost().links ?? createInertLinkResolver();
}

/** The host's optional navigate callback, or `undefined` when not provided. */
export function useNavigate(): CostStudioHost['navigate'] {
  return useHost().navigate;
}

// ── Query keys ───────────────────────────────────────────────────────────────

export function inventoriesKey(repository: CostRepositoryPort): readonly unknown[] {
  return ['cost', 'inventories', repositoryId(repository)];
}
export function inventoryKey(repository: CostRepositoryPort, ref: Ref): readonly unknown[] {
  return ['cost', 'inventory', repositoryId(repository), ref];
}
export function spendsKey(repository: CostRepositoryPort): readonly unknown[] {
  return ['cost', 'spends', repositoryId(repository)];
}
export function attributionsKey(repository: CostRepositoryPort): readonly unknown[] {
  return ['cost', 'attributions', repositoryId(repository)];
}
export function attributionKey(repository: CostRepositoryPort, ref: Ref): readonly unknown[] {
  return ['cost', 'attribution', repositoryId(repository), ref];
}
export function tagPlansKey(repository: CostRepositoryPort): readonly unknown[] {
  return ['cost', 'tagPlans', repositoryId(repository)];
}
export function tagPlanKey(repository: CostRepositoryPort, ref: Ref): readonly unknown[] {
  return ['cost', 'tagPlan', repositoryId(repository), ref];
}

// ── Query hooks ────────────────────────────────────────────────────────────────

/** List every inventory the repository can see. */
export function useInventories(): UseQueryResult<InventoryRef[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: inventoriesKey(repository),
    queryFn: () => repository.listInventories(),
  });
}

/** Read a single inventory by ref. Disabled until `ref` is defined. */
export function useInventory(ref: Ref | undefined): UseQueryResult<Inventory> {
  const repository = useRepository();
  return useQuery({
    queryKey: inventoryKey(repository, ref ?? ''),
    queryFn: () => repository.readInventory(ref as Ref),
    enabled: ref !== undefined,
  });
}

/**
 * Every spend document the repository can see, already read (not just
 * listed) — `attribute()` takes `spendDocs: readonly Spend[]`, so the
 * views need the full content, not a picker-sized ref list.
 */
export function useSpends(): UseQueryResult<Spend[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: spendsKey(repository),
    queryFn: async () => {
      const refs = await repository.listSpends();
      return Promise.all(refs.map((ref: SpendRef) => repository.readSpend(ref.ref)));
    },
  });
}

/** List every attribution the repository can see. */
export function useAttributions(): UseQueryResult<AttributionRef[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: attributionsKey(repository),
    queryFn: () => repository.listAttributions(),
  });
}

/** Read a single attribution by ref. Disabled until `ref` is defined. */
export function useAttribution(ref: Ref | undefined): UseQueryResult<Attribution> {
  const repository = useRepository();
  return useQuery({
    queryKey: attributionKey(repository, ref ?? ''),
    queryFn: () => repository.readAttribution(ref as Ref),
    enabled: ref !== undefined,
  });
}

/** List every tag plan the repository can see. */
export function useTagPlans(): UseQueryResult<TagPlanRef[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: tagPlansKey(repository),
    queryFn: () => repository.listTagPlans(),
  });
}

/** Read a single tag plan by ref. Disabled until `ref` is defined. */
export function useTagPlan(ref: Ref | undefined): UseQueryResult<TagPlan> {
  const repository = useRepository();
  return useQuery({
    queryKey: tagPlanKey(repository, ref ?? ''),
    queryFn: () => repository.readTagPlan(ref as Ref),
    enabled: ref !== undefined,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

/** Arguments to the write-attribution mutation. */
export interface WriteAttributionVars {
  ref: Ref;
  attribution: Attribution;
}

/**
 * Persist an attribution through the port (rail reorder, cluster promotion,
 * promoted-rule removal). On success the cache is updated in place (no
 * refetch) so the rail's local session state and the cache stay in sync.
 */
export function useWriteAttribution(): UseMutationResult<void, Error, WriteAttributionVars> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, attribution }: WriteAttributionVars) =>
      repository.writeAttribution(ref, attribution),
    onSuccess: (_result, { ref, attribution }) => {
      queryClient.setQueryData(attributionKey(repository, ref), attribution);
    },
  });
}

// ── Combined artifact loader ──────────────────────────────────────────────────

/** The three artifacts every workbench-family view is built from. */
export interface CostArtifacts {
  inventory: Inventory | undefined;
  attribution: Attribution | undefined;
  spends: Spend[] | undefined;
  isPending: boolean;
  isError: boolean;
  error: Error | undefined;
}

/**
 * Load the inventory + attribution + every spend document in one call.
 * `AttributionWorkbench`, `CostInventory`, and `CostReport` all build their
 * `attribute()` call from this same trio, so the three stay independently
 * cacheable (a rules-only write never re-fetches the inventory) while every
 * view composes them the same way.
 */
export function useCostArtifacts(inventoryRef: Ref, attributionRef: Ref): CostArtifacts {
  const inventoryQuery = useInventory(inventoryRef);
  const attributionQuery = useAttribution(attributionRef);
  const spendsQuery = useSpends();
  const error = inventoryQuery.error ?? attributionQuery.error ?? spendsQuery.error ?? undefined;
  return {
    inventory: inventoryQuery.data,
    attribution: attributionQuery.data,
    spends: spendsQuery.data,
    isPending: inventoryQuery.isPending || attributionQuery.isPending || spendsQuery.isPending,
    isError: inventoryQuery.isError || attributionQuery.isError || spendsQuery.isError,
    error,
  };
}
