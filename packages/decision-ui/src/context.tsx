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
import type { Decision, DecisionRef, DecisionRepositoryPort, Ref } from '@workspec/decision-schema';
import type { DecisionStudioCapabilities, DecisionStudioHost, LinkResolver } from './host.js';
import { createInertLinkResolver, repositoryId } from './host.js';
import { DEFAULT_THEME, themeStyle } from './themes.js';
import type { ThemeName } from './themes.js';

const HostContext = createContext<DecisionStudioHost | null>(null);

export interface DecisionStudioProviderProps {
  host: DecisionStudioHost;
  queryClient?: QueryClient;
  theme?: ThemeName | undefined;
  className?: string;
  children: ReactNode;
}

function createDefaultQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 5_000 } },
  });
}

export function DecisionStudioProvider(props: DecisionStudioProviderProps): ReactNode {
  const { host, queryClient, theme = DEFAULT_THEME, className, children } = props;
  const client = useMemo(() => queryClient ?? createDefaultQueryClient(), [queryClient]);
  const classes = [
    'ds-root',
    ...(theme === 'dark' ? ['dark'] : []),
    ...(className ? [className] : []),
  ];
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
  return createElement(
    QueryClientProvider,
    { client },
    createElement(HostContext.Provider, { value: host }, root),
  );
}

export function useHost(): DecisionStudioHost {
  const host = useContext(HostContext);
  if (host === null) throw new Error('useHost must be used within a <DecisionStudioProvider>.');
  return host;
}

export function useRepository(): DecisionRepositoryPort {
  return useHost().repository;
}

export function useCapabilities(): DecisionStudioCapabilities {
  return useHost().capabilities;
}

export function useLinkResolver(): LinkResolver {
  return useHost().links ?? createInertLinkResolver();
}

export function useNavigate(): DecisionStudioHost['navigate'] {
  return useHost().navigate;
}

export function decisionsKey(repository: DecisionRepositoryPort): readonly unknown[] {
  return ['ds', 'decisions', repositoryId(repository)];
}

export function decisionKey(repository: DecisionRepositoryPort, ref: Ref): readonly unknown[] {
  return ['ds', 'decision', repositoryId(repository), ref];
}

export function useDecisions(): UseQueryResult<DecisionRef[]> {
  const repository = useRepository();
  return useQuery({
    queryKey: decisionsKey(repository),
    queryFn: () => repository.listDecisions(),
  });
}

export function useDecision(ref: Ref | undefined): UseQueryResult<Decision> {
  const repository = useRepository();
  return useQuery({
    queryKey: decisionKey(repository, ref ?? ''),
    queryFn: () => repository.readDecision(ref as Ref),
    enabled: ref !== undefined,
  });
}

export interface WriteDecisionVars {
  ref: Ref;
  decision: Decision;
}

export function useWriteDecision(): UseMutationResult<void, Error, WriteDecisionVars> {
  const repository = useRepository();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, decision }: WriteDecisionVars) => repository.writeDecision(ref, decision),
    onSuccess: (_result, { ref, decision }) => {
      queryClient.setQueryData(decisionKey(repository, ref), decision);
      void queryClient.invalidateQueries({ queryKey: decisionsKey(repository) });
    },
  });
}
