// The provider and the hooks `TraceApp` reads the host through. Mirrors
// `@workspec/cost-ui`'s `context.tsx` shape (`useHost`/`useRepository`/
// `useCapabilities`/`useLinkResolver`/`useNavigate`, a TanStack QueryClient,
// a themed root) — see that file's header for the rationale.
//
// The pure views (`MetersBar`, `RequirementsExplorer`, `FeatureDetail`) do
// NOT read this context — they take `model: TraceModel` directly as a prop
// (spec/T5 brief: "deterministic rendering from a TraceModel prop"), so they
// stay independently testable/mountable with zero provider ceremony. Only
// `TraceApp` needs the host, to fetch the model via `useTraceModel()`.

import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { createContext, useContext, useMemo } from 'react';
import type { ReactElement, ReactNode } from 'react';
import type { TraceModel } from '@workspec/trace-model';
import { createInertLinkResolver, repositoryId } from './host.js';
import type {
  TraceLinkResolver,
  TraceLinkTarget,
  TraceRepositoryPort,
  TraceStudioCapabilities,
  TraceStudioHost,
} from './host.js';
import { TraceThemedRoot } from './themed-root.js';
import type { ThemeName } from './themes.js';

const HostContext = createContext<TraceStudioHost | null>(null);

/** Props for {@link TraceStudioProvider}. */
export interface TraceStudioProviderProps {
  /** The host contract `TraceApp` depends on. */
  host: TraceStudioHost;
  /** An existing QueryClient to reuse; a private one is created when omitted. */
  queryClient?: QueryClient;
  /** Which theme to render. Defaults to `dark`. Never read from `matchMedia` or storage — the host decides. */
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
 * Wraps `TraceApp` in the host contract, a QueryClient, and a themed root
 * (`<div class="trace-root" data-aesthetic="console" data-theme=…>`) carrying
 * the full WorkSpec token palette inline. `theme` is a plain prop — this
 * component and everything under it never call `matchMedia` and never touch
 * storage; the host owns reading the ambient preference and threading it
 * down.
 */
export function TraceStudioProvider(props: TraceStudioProviderProps): ReactElement {
  const { host, queryClient, theme, className, children } = props;
  const client = useMemo(() => queryClient ?? createDefaultQueryClient(), [queryClient]);

  return (
    <QueryClientProvider client={client}>
      <HostContext.Provider value={host}>
        <TraceThemedRoot theme={theme} className={className}>
          {children}
        </TraceThemedRoot>
      </HostContext.Provider>
    </QueryClientProvider>
  );
}

/** Read the host contract; throws if used outside `TraceStudioProvider`. */
export function useHost(): TraceStudioHost {
  const host = useContext(HostContext);
  if (host === null) {
    throw new Error('useHost must be used within a <TraceStudioProvider>.');
  }
  return host;
}

/**
 * Re-provide the host contract with `navigate` overridden — for a future
 * `TraceApp` cross-tab jump (e.g. Matrix → Feature detail once T6 lands),
 * mirroring `@workspec/cost-ui`'s `HostNavigateProvider`.
 */
export function HostNavigateProvider(props: {
  navigate: (target: TraceLinkTarget) => void;
  children: ReactNode;
}): ReactElement {
  const host = useHost();
  const value = useMemo<TraceStudioHost>(
    () => ({ ...host, navigate: props.navigate }),
    [host, props.navigate],
  );
  return <HostContext.Provider value={value}>{props.children}</HostContext.Provider>;
}

/** The repository port. */
export function useRepository(): TraceRepositoryPort {
  return useHost().repository;
}

/** The host's capability flags. */
export function useCapabilities(): TraceStudioCapabilities {
  return useHost().capabilities;
}

/** The host's link resolver. Falls back to an inert resolver when the host didn't provide one. */
export function useLinkResolver(): TraceLinkResolver {
  return useHost().links ?? createInertLinkResolver();
}

/** The host's optional navigate callback, or `undefined` when not provided. */
export function useNavigate(): TraceStudioHost['navigate'] {
  return useHost().navigate;
}

/** The query key `useTraceModel` reads/writes, keyed on the repository instance. */
export function traceModelKey(repository: TraceRepositoryPort): readonly unknown[] {
  return ['trace', 'model', repositoryId(repository)];
}

/** Fetch the current derived `TraceModel` through the host's repository. */
export function useTraceModel(): UseQueryResult<TraceModel> {
  const repository = useRepository();
  return useQuery({
    queryKey: traceModelKey(repository),
    queryFn: () => repository.readModel(),
  });
}

/** Invalidate the cached model — for a future "refresh" action once a host exposes one. */
export function useInvalidateTraceModel(): () => Promise<void> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: traceModelKey(repository) });
}
