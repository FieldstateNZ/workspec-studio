import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TraceApp } from './app.js';
import { TraceStudioProvider } from './context.js';
import { createMemoryRepository } from './host.js';
import type { TraceStudioHost } from './host.js';
import { buildFixtureModel } from './test-helpers/trace-fixture.js';

function buildHost(): TraceStudioHost {
  return {
    repository: createMemoryRepository({ model: buildFixtureModel() }),
    capabilities: { generateSkeletons: false },
  };
}

describe('TraceApp', () => {
  it('mounts: fetches the model through the host and renders the shell', async () => {
    render(
      <TraceStudioProvider host={buildHost()}>
        <TraceApp />
      </TraceStudioProvider>,
    );

    expect(await screen.findByText('workspec-trace')).toBeInTheDocument();
    // The meters bar renders all three meters once the model resolves.
    expect(await screen.findByText('Scenario coverage')).toBeInTheDocument();
    expect(screen.getByText('UserReq coverage')).toBeInTheDocument();
    expect(screen.getByText('Pass rate')).toBeInTheDocument();
    // The topbar's repo-wide counts.
    expect(screen.getByText('2 features · 4 sysreqs · 3 scenarios')).toBeInTheDocument();
  });

  it('defaults to the Requirements view and can switch to Feature detail', async () => {
    const user = userEvent.setup();
    render(
      <TraceStudioProvider host={buildHost()}>
        <TraceApp />
      </TraceStudioProvider>,
    );

    await screen.findByText('Scenario coverage');
    expect(screen.getByText('click a row for its chain')).toBeInTheDocument();

    // Radix's Tabs activates on the trigger's FOCUS event, which jsdom's
    // plain `fireEvent.click` doesn't simulate (unlike a real browser, a
    // synthetic click there doesn't also focus the element) — `userEvent`
    // reproduces the full pointer→focus→click sequence, which is what
    // actually flips the tab.
    await user.click(screen.getByRole('tab', { name: 'Feature detail' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Element authoring' })).toBeInTheDocument();
    });
  });

  it('renders Run review as a disabled tab (T7 not wired yet) while Matrix is enabled', async () => {
    render(
      <TraceStudioProvider host={buildHost()}>
        <TraceApp />
      </TraceStudioProvider>,
    );

    await screen.findByText('Scenario coverage');
    expect(screen.getByRole('tab', { name: 'Matrix' })).not.toBeDisabled();
    expect(screen.getByRole('tab', { name: 'Run review' })).toBeDisabled();
  });

  it('can switch to the Matrix tab and see the RTM grouped by feature', async () => {
    const user = userEvent.setup();
    render(
      <TraceStudioProvider host={buildHost()}>
        <TraceApp />
      </TraceStudioProvider>,
    );

    await screen.findByText('Scenario coverage');
    await user.click(screen.getByRole('tab', { name: 'Matrix' }));
    await waitFor(() => {
      expect(screen.getByText('Element authoring')).toBeInTheDocument();
    });
    expect(screen.getByText(/Untested only/)).toBeInTheDocument();
  });

  it('supports starting on Feature detail via initialView', async () => {
    render(
      <TraceStudioProvider host={buildHost()}>
        <TraceApp initialView="feature" />
      </TraceStudioProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Element authoring' })).toBeInTheDocument();
    });
  });
});
