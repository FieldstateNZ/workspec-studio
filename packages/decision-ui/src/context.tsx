// The provider and the hooks the views read the host through. The provider owns
// (or accepts) a TanStack QueryClient and renders a themed `.ds-root` element;
// everything below it reads the repository, capabilities, link resolver, and
// navigation from context — never from a global. Query hooks are keyed on the
// repository instance (`repositoryId`) plus the artifact ref, so two decisions,
// or the same decision in two different repositories, never collide in cache.

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
import type { Catalog, CatalogRef, Decision, DecisionRef, Ref } from '@workspec/decision-schema';
import type { DecisionRepositoryPort } from '@workspec/decision-schema';
import type {
  DecisionStudioCapabilities,
  DecisionStudioHost,
  LinkResolver,
  LinkTarget,
} from './host.js';
import { repositoryId } from './host.js';
import { DEFAULT_THEME, themeStyle } from './themes.js';
import type { ThemeName } from './themes.js';

const HostContext = createContext<DecisionStudioHost | null>(null);

/** Props for {@link DecisionStudioProvider}. */
export interface DecisionStudioProviderProps {
  /** The host contract every view depends on. */
  host: DecisionStudioHost;
  /** An existing QueryClient to reuse; a private one is created when omitted. */
  queryClient?: QueryClient;
  /** Which theme to render (`data-theme` on the root). Defaults to `dark`. */
  theme?: ThemeName;
  /** Extra class names to add to the themed root element. */
  className?: string;
  children: ReactNode;
}

function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Standalone data is the working tree; do not refetch on window focus,
        // and keep failed reads from retrying forever in a demo host.
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5_000,
      },
    },
  });
}

/**
 * Wraps the app in the host contract and a QueryClient, and renders a themed
 * root (`<div class="ds-root" data-theme=…>`) carrying the `--ds-*` tokens. All
 * Decision Studio views must render inside it.
 */
export function DecisionStudioProvider(props: DecisionStudioProviderProps): ReactNode {
  const { host, queryClient, theme = DEFAULT_THEME, className, children } = props;
  const client = useMemo(() => queryClient ?? createDefaultQueryClient(), [queryClient]);
  const rootClass = className ? `ds-root ${className}` : 'ds-root';

  const root = createElement(
    'div',
    { className: rootClass, 'data-theme': theme, style: themeStyle(theme) as CSSProperties },
    children,
  );
  const withHost = createElement(HostContext.Provider, { value: host }, root);
  return createElement(QueryClientProvider, { client }, withHost);
}

/** Read the host contract; throws if used outside `DecisionStudioProvider`. */
export function useHost(): DecisionStudioHost {
  const host = useContext(HostContext);
  if (host === null) {
    throw new Error('useHost must be used within a <DecisionStudioProvider>.');
  }
  return host;
}

/**
 * Re-provide the host contract with `navigate` overridden. `DecisionApp` uses
 * this so the Workspace's Compare / Decide buttons drive its own internal view
 * switch, while the surrounding QueryClient, repository, capabilities, and links
 * are inherited unchanged (no second cache, no fork of the host).
 */
export function HostNavigateProvider(props: {
  navigate: (target: LinkTarget) => void;
  children: ReactNode;
}): ReactNode {
  const host = useHost();
  const value = useMemo<DecisionStudioHost>(
    () => ({ ...host, navigate: props.navigate }),
    [host, props.navigate],
  );
  return createElement(HostContext.Provider, { value }, props.children);
}

/**
 * Re-provide the host contract with its capability flags overridden. Used by the
 * read-only ADR remote (S6), which forces `decide: false` so an embedding host
 * gets a review-only ADR without having to construct a whole host. Only the
 * flags passed are changed; the repository, links, navigate, and QueryClient are
 * inherited unchanged (no second cache, no fork of the host).
 */
export function HostCapabilitiesProvider(props: {
  editCatalog?: boolean;
  decide?: boolean;
  children: ReactNode;
}): ReactNode {
  const host = useHost();
  const { editCatalog, decide } = props;
  const value = useMemo<DecisionStudioHost>(
    () => ({
      ...host,
      capabilities: {
        editCatalog: editCatalog ?? host.capabilities.editCatalog,
        decide: decide ?? host.capabilities.decide,
      },
    }),
    [host, editCatalog, decide],
  );
  return createElement(HostContext.Provider, { value }, props.children);
}

/** The storage port. */
export function useRepository(): DecisionRepositoryPort {
  return useHost().repository;
}

/** The host's capability flags. */
export function useCapabilities(): DecisionStudioCapabilities {
  return useHost().capabilities;
}

/** The host's link resolver. */
export function useLinkResolver(): LinkResolver {
  return useHost().links;
}

/** The host's optional navigate callback, or `undefined` when not provided. */
export function useNavigate(): ((target: LinkTarget) => void) | undefined {
  return useHost().navigate;
}

// ── Query keys ───────────────────────────────────────────────────────────────

/** Query key for the decision list of a repository. */
export function decisionsKey(repository: DecisionRepositoryPort): readonly unknown[] {
  return ['ds', 'decisions', repositoryId(repository)];
}
/** Query key for a single decision. */
export function decisionKey(repository: DecisionRepositoryPort, ref: Ref): readonly unknown[] {
  return ['ds', 'decision', repositoryId(repository), ref];
}
/** Query key for the catalog list of a repository. */
export function catalogsKey(repository: DecisionRepositoryPort): readonly unknown[] {
  return ['ds', 'catalogs', repositoryId(repository)];
}
/** Query key for a single catalog. */
export function catalogKey(repository: DecisionRepositoryPort, ref: Ref): readonly unknown[] {
  return ['ds', 'catalog', repositoryId(repository), ref];
}

// ── Query hooks ────────────────────────────────────────────────────────────────

/** List every decision the repository can see. */
export function useDecisions(): UseQueryResult<DecisionRef[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: decisionsKey(repository),
    queryFn: () => repository.listDecisions(),
  });
}

/** Read a single decision by ref. Disabled until `ref` is defined. */
export function useDecision(ref: Ref | undefined): UseQueryResult<Decision> {
  const repository = useRepository();
  return useQuery({
    queryKey: decisionKey(repository, ref ?? ''),
    queryFn: () => repository.readDecision(ref as Ref),
    enabled: ref !== undefined,
  });
}

/** List every catalog the repository can see. */
export function useCatalogs(): UseQueryResult<CatalogRef[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: catalogsKey(repository),
    queryFn: () => repository.listCatalogs(),
  });
}

/** Read a single catalog by ref. Disabled until `ref` is defined. */
export function useCatalog(ref: Ref | undefined): UseQueryResult<Catalog> {
  const repository = useRepository();
  return useQuery({
    queryKey: catalogKey(repository, ref ?? ''),
    queryFn: () => repository.readCatalog(ref as Ref),
    enabled: ref !== undefined,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────────

/** Arguments to the write-decision mutation. */
export interface WriteDecisionVars {
  ref: Ref;
  decision: Decision;
}

/**
 * Persist a decision through the port. On success the cache is updated in place
 * (no refetch) so an editing session's local state and the cache stay in sync.
 */
export function useWriteDecision(): UseMutationResult<void, Error, WriteDecisionVars> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation<void, Error, WriteDecisionVars>({
    mutationFn: ({ ref, decision }) => repository.writeDecision(ref, decision),
    onSuccess: (_result, { ref, decision }) => {
      queryClient.setQueryData(decisionKey(repository, ref), decision);
    },
  });
}

/** Arguments to the write-catalog mutation. */
export interface WriteCatalogVars {
  ref: Ref;
  catalog: Catalog;
}

/** Persist a catalog through the port (used by the S5 Catalog view). */
export function useWriteCatalog(): UseMutationResult<void, Error, WriteCatalogVars> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation<void, Error, WriteCatalogVars>({
    mutationFn: ({ ref, catalog }) => repository.writeCatalog(ref, catalog),
    onSuccess: (_result, { ref, catalog }) => {
      queryClient.setQueryData(catalogKey(repository, ref), catalog);
    },
  });
}
