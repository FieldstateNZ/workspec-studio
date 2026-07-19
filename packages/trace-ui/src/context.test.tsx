import { render, renderHook, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import {
  HostNavigateProvider,
  TraceStudioProvider,
  useCapabilities,
  useHost,
  useLinkResolver,
  useNavigate,
  useTraceModel,
} from './context.js';
import { createMemoryRepository } from './host.js';
import type { TraceStudioHost } from './host.js';
import { buildFixtureModel } from './test-helpers/trace-fixture.js';

function buildHost(overrides: Partial<TraceStudioHost> = {}): TraceStudioHost {
  return {
    repository: createMemoryRepository({ model: buildFixtureModel() }),
    capabilities: { generateSkeletons: false },
    ...overrides,
  };
}

describe('TraceStudioProvider / useHost', () => {
  it('throws when useHost is called outside a provider', () => {
    function Probe(): null {
      useHost();
      return null;
    }
    expect(() => render(<Probe />)).toThrow(/useHost must be used within/);
  });

  it('provides the host to descendants', () => {
    const host = buildHost();
    const { result } = renderHook(() => useHost(), {
      wrapper: (props) => <TraceStudioProvider host={host}>{props.children}</TraceStudioProvider>,
    });
    expect(result.current).toBe(host);
  });

  it('renders a themed root carrying the theme prop', () => {
    const host = buildHost();
    const { container } = render(
      <TraceStudioProvider host={host} theme="light">
        <span>content</span>
      </TraceStudioProvider>,
    );
    expect(container.querySelector('.trace-root')).toHaveAttribute('data-theme', 'light');
  });
});

describe('useCapabilities / useLinkResolver / useNavigate', () => {
  it('reads capabilities from the host', () => {
    const host = buildHost({ capabilities: { generateSkeletons: true } });
    const { result } = renderHook(() => useCapabilities(), {
      wrapper: (props) => <TraceStudioProvider host={host}>{props.children}</TraceStudioProvider>,
    });
    expect(result.current).toEqual({ generateSkeletons: true });
  });

  it('falls back to an inert link resolver when the host provides none', () => {
    const host = buildHost();
    const { result } = renderHook(() => useLinkResolver(), {
      wrapper: (props) => <TraceStudioProvider host={host}>{props.children}</TraceStudioProvider>,
    });
    expect(result.current({ kind: 'ci-run', label: 'x' })).toEqual({ resolved: false });
  });

  it('HostNavigateProvider overrides navigate while inheriting the rest of the host', () => {
    const host = buildHost();
    const seen: string[] = [];
    const { result } = renderHook(() => useNavigate(), {
      wrapper: (props) => (
        <TraceStudioProvider host={host}>
          <HostNavigateProvider navigate={(target) => seen.push(target.kind)}>
            {props.children}
          </HostNavigateProvider>
        </TraceStudioProvider>
      ),
    });
    result.current?.({ kind: 'feature', label: 'Element authoring' });
    expect(seen).toEqual(['feature']);
  });
});

describe('useTraceModel', () => {
  it('fetches the model through the host repository', async () => {
    const model = buildFixtureModel();
    const host = buildHost({ repository: createMemoryRepository({ model }) });

    function Probe(): ReactElement {
      const query = useTraceModel();
      if (query.isPending) return <span>loading</span>;
      return <span>{query.data?.features.length}</span>;
    }

    render(
      <TraceStudioProvider host={host}>
        <Probe />
      </TraceStudioProvider>,
    );

    await waitFor(() => screen.getByText(String(model.features.length)));
  });
});
